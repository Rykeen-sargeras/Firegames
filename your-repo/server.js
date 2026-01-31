const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const Filter = require("bad-words");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

/* ----- Config ----- */
const ADMIN_PASS = process.env.ADMIN_PASS || "Firesluts";
const WIN_POINTS = 10;
const KEEPALIVE_MS = 300000;

/* ----- Load Cards ----- */
let rawWhite = ["A disappointing birthday party", "Grandma's secret recipe", "An awkward high five", "A really cool hat", "Puppies!", "Darth Vader", "A frozen burrito", "Poor life choices", "A romantic comedy", "The meaning of life"];
let rawBlack = ["What's Batman's guilty pleasure? ___", "What's worse than stubbing your toe? ___", "In 2025, the hottest trend is ___", "The secret ingredient is ___", "What ruined the family reunion? ___"];

try {
  if (fs.existsSync("white_cards.txt")) {
    rawWhite = fs.readFileSync("white_cards.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
  }
  if (fs.existsSync("black_cards.txt")) {
    rawBlack = fs.readFileSync("black_cards.txt", "utf8")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);
  }
} catch (e) {
  console.log("⚠️  Card files missing, using defaults");
}

console.log(`📄 Loaded ${rawWhite.length} white cards and ${rawBlack.length} black cards`);

/* ----- Deck Logic ----- */
const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/* ----- Game State ----- */
let rooms = {};

const filter = new Filter();
filter.removeWords("hell", "damn", "god");

/* ----- Room Management ----- */
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createRoom(roomCode, gameType) {
  console.log(`🏠 Creating room ${roomCode} for ${gameType}`);
  
  const baseRoom = {
    gameType,
    players: {},
    started: false,
    readyCount: 0,
    currentMusic: null,
    skipVotes: new Set()
  };
  
  if (gameType === 'cards-against') {
    rooms[roomCode] = {
      ...baseRoom,
      whiteDeck: shuffle([...rawWhite]),
      blackDeck: shuffle([...rawBlack]),
      submissions: [],
      currentBlack: "",
      czarIndex: 0
    };
  } else if (gameType === 'uno') {
    rooms[roomCode] = {
      ...baseRoom,
      deck: [],
      discardPile: [],
      currentCard: null,
      currentPlayer: 0,
      direction: 1,
      drawStack: 0,
      lastPlayedBy: null
    };
  }
  
  return rooms[roomCode];
}

function getRoom(roomCode) {
  return rooms[roomCode] || null;
}

function deleteRoom(roomCode) {
  if (rooms[roomCode]) {
    delete rooms[roomCode];
    console.log(`🗑️ Room ${roomCode} deleted`);
  }
}

/* ----- Card Drawing ----- */
function drawWhite(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'cards-against') return "Test Card";
  
  if (room.whiteDeck.length === 0) {
    room.whiteDeck = shuffle([...rawWhite]);
  }
  
  const card = room.whiteDeck.pop();
  return Math.random() < 0.1 ? "__BLANK__" : card;
}

function drawBlack(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'cards-against') return "Test Black ___";
  
  if (room.blackDeck.length === 0) {
    room.blackDeck = shuffle([...rawBlack]);
  }
  
  return room.blackDeck.pop();
}

/* ----- Lobby Broadcasting ----- */
function broadcastLobby(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  
  const playerList = Object.values(room.players).map(p => ({
    id: p.id,
    username: p.username,
    ready: p.ready || false,
    score: p.score || 0
  }));
  
  const totalPlayers = playerList.length;
  const readyPlayers = playerList.filter(p => p.ready).length;
  const minPlayers = room.gameType === 'cards-against' ? 3 : 2;
  const canStart = readyPlayers >= totalPlayers && totalPlayers >= minPlayers;
  
  const lobbyState = {
    gameType: room.gameType,
    roomCode,
    players: playerList,
    totalPlayers,
    readyCount: readyPlayers,
    minPlayers,
    canStart,
    started: room.started
  };
  
  console.log(`📡 Lobby broadcast for ${roomCode}: ${readyPlayers}/${totalPlayers} ready, canStart: ${canStart}`);
  io.to(roomCode).emit("lobby-state", lobbyState);
}

/* ----- CAH Game Broadcasting ----- */
function broadcastCAH(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'cards-against') return;
  
  if (!room.started) {
    broadcastLobby(roomCode);
    return;
  }
  
  const players = Object.values(room.players);
  const czar = players.find(p => p.isCzar);
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
  
  const gameState = {
    gameType: 'cards-against',
    started: true,
    blackCard: room.currentBlack,
    czarName: czar?.username || "...",
    czarId: czar?.id,
    players: sortedPlayers.map(p => ({
      id: p.id,
      username: p.username,
      score: p.score,
      isCzar: p.isCzar,
      hasSubmitted: p.hasSubmitted
    })),
    submissions: room.submissions,
    allSubmitted: room.submissions.length >= players.filter(p => !p.isCzar).length
  };
  
  // Send game state + individual hands
  players.forEach(p => {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      sock.emit("cah-state", {
        ...gameState,
        myHand: p.hand,
        myId: p.id,
        isCzar: p.isCzar,
        hasSubmitted: p.hasSubmitted
      });
    }
  });
  
  console.log(`🃏 CAH broadcast for ${roomCode}: ${room.submissions.length} submissions`);
}

/* ----- UNO Game Logic ----- */
const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];
const UNO_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

function createUnoDeck() {
  const deck = [];
  
  UNO_COLORS.forEach(color => {
    deck.push({ color, value: '0' });
    for (let i = 0; i < 2; i++) {
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'].forEach(value => {
        deck.push({ color, value });
      });
    }
  });
  
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild-draw4' });
  }
  
  return shuffle(deck);
}

function drawUnoCard(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'uno') return null;
  
  if (room.deck.length === 0) {
    const topCard = room.discardPile.pop();
    room.deck = shuffle([...room.discardPile]);
    room.discardPile = [topCard];
  }
  
  return room.deck.pop();
}

function canPlayUnoCard(card, topCard) {
  if (!card || !topCard) return false;
  if (card.color === 'wild') return true;
  const activeColor = topCard.activeColor || topCard.color;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function getNextUnoPlayer(room) {
  const playerIds = Object.keys(room.players);
  return (room.currentPlayer + room.direction + playerIds.length) % playerIds.length;
}

function advanceUnoTurn(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  
  room.currentPlayer = getNextUnoPlayer(room);
  const playerIds = Object.keys(room.players);
  const currentPlayerId = playerIds[room.currentPlayer];
  if (room.players[currentPlayerId]) {
    room.players[currentPlayerId].calledUno = false;
  }
}

function startUnoGame(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'uno') return;
  
  console.log(`🎴 Starting UNO game in ${roomCode}`);
  
  room.deck = createUnoDeck();
  room.discardPile = [];
  room.currentPlayer = 0;
  room.direction = 1;
  room.drawStack = 0;
  room.started = true;
  
  const playerIds = Object.keys(room.players);
  playerIds.forEach(id => {
    room.players[id].hand = [];
    for (let i = 0; i < 7; i++) {
      room.players[id].hand.push(drawUnoCard(roomCode));
    }
    room.players[id].calledUno = false;
  });
  
  // Draw starting card (not wild or action)
  let startCard;
  do {
    startCard = drawUnoCard(roomCode);
  } while (startCard.color === 'wild' || ['skip', 'reverse', 'draw2'].includes(startCard.value));
  
  room.currentCard = startCard;
  room.discardPile.push(startCard);
  
  broadcastUNO(roomCode);
}

function broadcastUNO(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'uno') return;
  
  if (!room.started) {
    broadcastLobby(roomCode);
    return;
  }
  
  const playerIds = Object.keys(room.players);
  const currentPlayerId = playerIds[room.currentPlayer];
  
  const players = Object.values(room.players);
  
  const baseState = {
    gameType: 'uno',
    started: true,
    currentCard: room.currentCard,
    currentPlayerId,
    direction: room.direction,
    drawStack: room.drawStack,
    deckCount: room.deck.length,
    players: players.map(p => ({
      id: p.id,
      username: p.username,
      handCount: p.hand ? p.hand.length : 0,
      calledUno: p.calledUno
    }))
  };
  
  // Send individual hands
  players.forEach(p => {
    const sock = io.sockets.sockets.get(p.id);
    if (sock) {
      sock.emit("uno-state", {
        ...baseState,
        myHand: p.hand,
        myId: p.id,
        isMyTurn: p.id === currentPlayerId
      });
    }
  });
  
  console.log(`🎴 UNO broadcast for ${roomCode}: current player ${room.players[currentPlayerId]?.username}`);
}

/* ----- CAH Game Functions ----- */
function startCAHGame(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'cards-against') return;
  
  console.log(`🃏 Starting CAH game in ${roomCode}`);
  
  room.started = true;
  room.czarIndex = 0;
  room.submissions = [];
  
  const playerIds = Object.keys(room.players);
  playerIds.forEach((id, i) => {
    room.players[id].isCzar = (i === 0);
    room.players[id].hasSubmitted = false;
    room.players[id].score = room.players[id].score || 0;
    
    // Deal/replenish hand to 10 cards
    if (!room.players[id].hand) {
      room.players[id].hand = [];
    }
    while (room.players[id].hand.length < 10) {
      room.players[id].hand.push(drawWhite(roomCode));
    }
  });
  
  room.currentBlack = drawBlack(roomCode);
  
  broadcastCAH(roomCode);
}

function nextCAHRound(roomCode) {
  const room = getRoom(roomCode);
  if (!room || room.gameType !== 'cards-against') return;
  
  room.submissions = [];
  room.currentBlack = drawBlack(roomCode);
  
  const playerIds = Object.keys(room.players);
  if (playerIds.length < 3) {
    room.started = false;
    broadcastLobby(roomCode);
    return;
  }
  
  room.czarIndex = (room.czarIndex + 1) % playerIds.length;
  
  playerIds.forEach((id, i) => {
    room.players[id].isCzar = (i === room.czarIndex);
    room.players[id].hasSubmitted = false;
  });
  
  broadcastCAH(roomCode);
}

function resetGame(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  
  console.log(`🔄 Resetting game in room ${roomCode}`);
  
  // Reset all players
  Object.values(room.players).forEach(p => {
    p.ready = false;
    p.score = 0;
    p.hand = [];
    p.hasSubmitted = false;
    p.isCzar = false;
    p.calledUno = false;
  });
  
  room.started = false;
  room.readyCount = 0;
  room.submissions = [];
  room.currentBlack = "";
  
  if (room.gameType === 'uno') {
    room.deck = [];
    room.discardPile = [];
    room.currentCard = null;
  }
  
  io.to(roomCode).emit("game-reset");
  broadcastLobby(roomCode);
}

/* ----- Socket Events ----- */
io.on("connection", (socket) => {
  console.log("🔌 Player connected:", socket.id);
  
  // Create a new room
  socket.on("create-room", (data, callback) => {
    const roomCode = generateRoomCode();
    const gameType = data.gameType || 'cards-against';
    createRoom(roomCode, gameType);
    
    console.log(`📦 Room ${roomCode} created for ${gameType}`);
    callback({ roomCode, gameType });
  });
  
  // Join an existing room
  socket.on("join-room", (data, callback) => {
    let { roomCode, name, gameType } = data;
    
    if (!name || !name.trim()) {
      if (callback) callback({ success: false, error: "Name required" });
      return;
    }
    
    name = name.trim().substring(0, 15);
    roomCode = roomCode.toUpperCase();
    
    // Create room if it doesn't exist (for joiners using a code before creator finishes)
    if (!rooms[roomCode]) {
      if (!gameType) {
        if (callback) callback({ success: false, error: "Room not found" });
        return;
      }
      createRoom(roomCode, gameType);
    }
    
    const room = getRoom(roomCode);
    
    // Check if game already started
    if (room.started) {
      if (callback) callback({ success: false, error: "Game already in progress" });
      return;
    }
    
    // Check for duplicate names
    const existingPlayer = Object.values(room.players).find(p => p.username.toLowerCase() === name.toLowerCase());
    if (existingPlayer) {
      if (callback) callback({ success: false, error: "Name already taken" });
      return;
    }
    
    // Leave any previous room
    if (socket.roomCode && socket.roomCode !== roomCode) {
      socket.leave(socket.roomCode);
    }
    
    // Join the room
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.username = name;
    
    // Add player to room
    room.players[socket.id] = {
      id: socket.id,
      username: name,
      ready: false,
      score: 0,
      hand: [],
      hasSubmitted: false,
      isCzar: false,
      calledUno: false
    };
    
    console.log(`👤 ${name} joined ${room.gameType} room ${roomCode} (${Object.keys(room.players).length} players)`);
    
    if (callback) callback({ success: true, gameType: room.gameType, roomCode });
    
    // Broadcast updated lobby
    broadcastLobby(roomCode);
  });
  
  // Ready up
  socket.on("ready-up", () => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room) return;
    
    const player = room.players[socket.id];
    if (!player || player.ready) return;
    
    player.ready = true;
    room.readyCount = Object.values(room.players).filter(p => p.ready).length;
    
    const totalPlayers = Object.keys(room.players).length;
    const minPlayers = room.gameType === 'cards-against' ? 3 : 2;
    
    console.log(`✅ ${player.username} ready! (${room.readyCount}/${totalPlayers}) in ${roomCode}`);
    
    // Check if all ready and enough players
    if (room.readyCount >= totalPlayers && totalPlayers >= minPlayers) {
      console.log(`🎮 All ready! Starting ${room.gameType} in ${roomCode}`);
      
      if (room.gameType === 'cards-against') {
        startCAHGame(roomCode);
      } else if (room.gameType === 'uno') {
        startUnoGame(roomCode);
      }
    } else {
      broadcastLobby(roomCode);
    }
  });
  
  // Unready (toggle off)
  socket.on("unready", () => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || room.started) return;
    
    const player = room.players[socket.id];
    if (!player || !player.ready) return;
    
    player.ready = false;
    room.readyCount = Object.values(room.players).filter(p => p.ready).length;
    
    console.log(`⏸️ ${player.username} unreadied in ${roomCode}`);
    broadcastLobby(roomCode);
  });
  
  // CAH: Submit a card
  socket.on("cah-submit", (data) => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || room.gameType !== 'cards-against' || !room.started) return;
    
    const player = room.players[socket.id];
    if (!player || player.isCzar || player.hasSubmitted) return;
    
    let { card, customText } = data;
    
    let text = card;
    if (card === "__BLANK__" && customText) {
      text = filter.clean(customText.slice(0, 140));
    }
    
    // Remove card from hand
    const cardIndex = player.hand.indexOf(card);
    if (cardIndex === -1 && card !== "__BLANK__") return;
    
    if (cardIndex !== -1) {
      player.hand.splice(cardIndex, 1);
    } else {
      // Remove blank card
      const blankIndex = player.hand.indexOf("__BLANK__");
      if (blankIndex !== -1) player.hand.splice(blankIndex, 1);
    }
    
    // Draw replacement
    player.hand.push(drawWhite(roomCode));
    
    room.submissions.push({ card: text, playerId: player.id });
    player.hasSubmitted = true;
    
    // Shuffle submissions if all non-czars submitted
    const nonCzarCount = Object.values(room.players).filter(p => !p.isCzar).length;
    if (room.submissions.length >= nonCzarCount) {
      room.submissions = shuffle(room.submissions);
    }
    
    console.log(`🃏 ${player.username} submitted in ${roomCode}`);
    broadcastCAH(roomCode);
  });
  
  // CAH: Czar picks winner
  socket.on("cah-pick", (playerId) => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || room.gameType !== 'cards-against' || !room.started) return;
    
    const czar = room.players[socket.id];
    if (!czar || !czar.isCzar) return;
    
    const winner = room.players[playerId];
    if (!winner) return;
    
    winner.score++;
    
    console.log(`🏆 ${winner.username} won the round! (${winner.score} pts)`);
    io.to(roomCode).emit("cah-round-winner", { username: winner.username, score: winner.score });
    
    if (winner.score >= WIN_POINTS) {
      io.to(roomCode).emit("cah-game-winner", { username: winner.username });
      setTimeout(() => resetGame(roomCode), 10000);
      return;
    }
    
    setTimeout(() => nextCAHRound(roomCode), 4000);
  });
  
  // UNO: Play a card
  socket.on("uno-play", (data) => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || room.gameType !== 'uno' || !room.started) return;
    
    const playerIds = Object.keys(room.players);
    const currentPlayerId = playerIds[room.currentPlayer];
    
    if (socket.id !== currentPlayerId) {
      socket.emit("uno-error", "Not your turn!");
      return;
    }
    
    const player = room.players[socket.id];
    const { cardIndex, chosenColor } = data;
    
    if (cardIndex < 0 || cardIndex >= player.hand.length) return;
    
    const card = player.hand[cardIndex];
    
    if (!canPlayUnoCard(card, room.currentCard)) {
      socket.emit("uno-error", "Cannot play that card!");
      return;
    }
    
    // Handle draw stack
    if (room.drawStack > 0 && card.value !== 'draw2' && card.value !== 'wild-draw4') {
      socket.emit("uno-error", "Must play a draw card or draw cards!");
      return;
    }
    
    // Remove card from hand
    player.hand.splice(cardIndex, 1);
    
    // Apply wild color
    if (card.color === 'wild') {
      card.activeColor = chosenColor || 'red';
    }
    
    room.currentCard = card;
    room.discardPile.push(card);
    room.lastPlayedBy = socket.id;
    
    // Handle special cards
    if (card.value === 'skip') {
      advanceUnoTurn(roomCode);
    } else if (card.value === 'reverse') {
      room.direction *= -1;
      if (playerIds.length === 2) {
        advanceUnoTurn(roomCode);
      }
    } else if (card.value === 'draw2') {
      room.drawStack += 2;
    } else if (card.value === 'wild-draw4') {
      room.drawStack += 4;
    }
    
    // Check for win
    if (player.hand.length === 0) {
      io.to(roomCode).emit("uno-winner", { username: player.username });
      setTimeout(() => resetGame(roomCode), 8000);
      return;
    }
    
    // Check if player should have called UNO
    if (player.hand.length === 1 && !player.calledUno) {
      for (let i = 0; i < 2; i++) {
        player.hand.push(drawUnoCard(roomCode));
      }
      io.to(roomCode).emit("uno-penalty", { username: player.username, reason: "Forgot to call UNO! +2 cards" });
    }
    
    advanceUnoTurn(roomCode);
    broadcastUNO(roomCode);
  });
  
  // UNO: Draw a card
  socket.on("uno-draw", () => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || room.gameType !== 'uno' || !room.started) return;
    
    const playerIds = Object.keys(room.players);
    const currentPlayerId = playerIds[room.currentPlayer];
    
    if (socket.id !== currentPlayerId) return;
    
    const player = room.players[socket.id];
    
    if (room.drawStack > 0) {
      // Draw stacked cards
      for (let i = 0; i < room.drawStack; i++) {
        player.hand.push(drawUnoCard(roomCode));
      }
      io.to(roomCode).emit("uno-drew-stack", { username: player.username, count: room.drawStack });
      room.drawStack = 0;
      advanceUnoTurn(roomCode);
    } else {
      // Draw one card
      const drawnCard = drawUnoCard(roomCode);
      player.hand.push(drawnCard);
      
      // Can play drawn card?
      if (canPlayUnoCard(drawnCard, room.currentCard)) {
        socket.emit("uno-can-play-drawn", { cardIndex: player.hand.length - 1 });
      } else {
        advanceUnoTurn(roomCode);
      }
    }
    
    broadcastUNO(roomCode);
  });
  
  // UNO: Call UNO
  socket.on("uno-call", () => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || room.gameType !== 'uno' || !room.started) return;
    
    const player = room.players[socket.id];
    if (!player) return;
    
    player.calledUno = true;
    io.to(roomCode).emit("uno-called", { username: player.username });
    broadcastUNO(roomCode);
  });
  
  // UNO: Challenge someone for not calling UNO
  socket.on("uno-challenge", (targetId) => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || room.gameType !== 'uno' || !room.started) return;
    
    const target = room.players[targetId];
    if (!target) return;
    
    if (target.hand.length === 1 && !target.calledUno) {
      for (let i = 0; i < 2; i++) {
        target.hand.push(drawUnoCard(roomCode));
      }
      io.to(roomCode).emit("uno-penalty", { username: target.username, reason: "Caught not calling UNO! +2 cards" });
      broadcastUNO(roomCode);
    }
  });
  
  // Chat message
  socket.on("chat", (msg) => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room) return;
    
    const player = room.players[socket.id];
    if (!player) return;
    
    const clean = filter.clean(msg.slice(0, 200));
    io.to(roomCode).emit("chat", { user: player.username, text: clean });
  });
  
  // Admin actions
  socket.on("admin", (data) => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room) return;
    
    if (!data || data.pw !== ADMIN_PASS) {
      socket.emit("admin-fail");
      return;
    }
    
    switch (data.type) {
      case "login":
        socket.emit("admin-ok");
        break;
        
      case "reset":
        resetGame(roomCode);
        break;
        
      case "music-start":
        room.currentMusic = data.url;
        room.skipVotes.clear();
        io.to(roomCode).emit("music-start", { url: data.url });
        break;
        
      case "wipe-chat":
        io.to(roomCode).emit("wipe-chat");
        break;
    }
  });
  
  // Vote to skip music
  socket.on("vote-skip", () => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room || !room.currentMusic) return;
    
    room.skipVotes.add(socket.id);
    const totalPlayers = Object.keys(room.players).length;
    
    if (room.skipVotes.size >= Math.ceil(totalPlayers / 2)) {
      io.to(roomCode).emit("music-skip");
      room.currentMusic = null;
      room.skipVotes.clear();
    }
  });
  
  // Disconnect
  socket.on("disconnect", () => {
    const roomCode = socket.roomCode;
    const room = getRoom(roomCode);
    if (!room) return;
    
    const player = room.players[socket.id];
    if (!player) return;
    
    console.log(`🔌 ${player.username} disconnected from ${roomCode}`);
    
    const wasCzar = player.isCzar;
    delete room.players[socket.id];
    room.skipVotes?.delete(socket.id);
    
    const remaining = Object.keys(room.players).length;
    
    if (remaining === 0) {
      deleteRoom(roomCode);
      return;
    }
    
    room.readyCount = Object.values(room.players).filter(p => p.ready).length;
    
    if (room.gameType === 'cards-against') {
      room.submissions = room.submissions.filter(s => s.playerId !== socket.id);
      
      if (remaining < 3) {
        room.started = false;
        room.submissions = [];
        room.currentBlack = "";
        broadcastLobby(roomCode);
      } else if (wasCzar && room.started) {
        nextCAHRound(roomCode);
      } else {
        broadcastCAH(roomCode);
      }
    } else if (room.gameType === 'uno') {
      if (remaining < 2) {
        room.started = false;
        broadcastLobby(roomCode);
      } else if (room.started) {
        const playerIds = Object.keys(room.players);
        if (room.currentPlayer >= playerIds.length) {
          room.currentPlayer = 0;
        }
        broadcastUNO(roomCode);
      } else {
        broadcastLobby(roomCode);
      }
    }
  });
});

/* ----- Start Server ----- */
server.listen(PORT, () => {
  console.log(`🎮 Game server running on port ${PORT}`);
});

setInterval(() => {
  const roomCount = Object.keys(rooms).length;
  console.log(`⏱ Keep-alive ping | ${roomCount} active rooms`);
}, KEEPALIVE_MS);
