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
let rawWhite = ["Blank White", "Test Card 1", "Test Card 2"];
let rawBlack = ["Blank Black ___", "Test Black ___"];

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

/* ----- Deck Logic ----- */
let whiteDeck = [];
let blackDeck = [];

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const drawWhite = () => {
  if (whiteDeck.length === 0) whiteDeck = shuffle([...rawWhite]);
  const card = whiteDeck.pop();
  return Math.random() < 0.1 ? "__BLANK__" : card;
};

const drawBlack = () => {
  if (blackDeck.length === 0) blackDeck = shuffle([...rawBlack]);
  return blackDeck.pop();
};

/* ----- Game State ----- */
let rooms = {}; // Store multiple game rooms

function createRoom(roomCode, gameType) {
  if (gameType === 'cards-against') {
    rooms[roomCode] = {
      gameType: 'cards-against',
      players: {},
      submissions: [],
      currentBlack: "",
      czarIndex: 0,
      started: false,
      readyCount: 0,
      currentMusic: null,
      skipVotes: new Set()
    };
  } else if (gameType === 'uno') {
    rooms[roomCode] = {
      gameType: 'uno',
      players: {},
      deck: [],
      discardPile: [],
      currentCard: null,
      currentPlayer: 0,
      direction: 1,
      started: false,
      readyCount: 0,
      drawStack: 0,
      lastPlayedBy: null
    };
  }
}

function getRoomState(roomCode) {
  if (!rooms[roomCode]) return null;
  const room = rooms[roomCode];
  return {
    players: Object.values(room.players),
    blackCard: room.currentBlack,
    submissions: room.submissions,
    started: room.started,
    czarName: Object.values(room.players).find(p => p.isCzar)?.username || "...",
    readyCount: room.readyCount
  };
}

function broadcast(roomCode) {
  const state = getRoomState(roomCode);
  if (state) {
    io.to(roomCode).emit("state", state);
  }
}

const filter = new Filter();
filter.removeWords("hell", "damn", "god");

/* ----- UNO Game Logic ----- */
const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];
const UNO_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];

function createUnoDeck() {
  const deck = [];
  
  // Number and action cards (2 of each except 0)
  UNO_COLORS.forEach(color => {
    deck.push({ color, value: '0' });
    for (let i = 0; i < 2; i++) {
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'].forEach(value => {
        deck.push({ color, value });
      });
    }
  });
  
  // Wild cards
  for (let i = 0; i < 4; i++) {
    deck.push({ color: 'wild', value: 'wild' });
    deck.push({ color: 'wild', value: 'wild-draw4' });
  }
  
  return shuffle(deck);
}

function drawUnoCard(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.gameType !== 'uno') return null;
  
  if (room.deck.length === 0) {
    // Reshuffle discard pile into deck (keep top card)
    const topCard = room.discardPile.pop();
    room.deck = shuffle([...room.discardPile]);
    room.discardPile = [topCard];
  }
  
  return room.deck.pop();
}

function canPlayUnoCard(card, topCard) {
  if (card.color === 'wild') return true;
  if (card.color === topCard.color) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function startUnoGame(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.gameType !== 'uno') return;
  
  room.deck = createUnoDeck();
  room.discardPile = [];
  room.currentPlayer = 0;
  room.direction = 1;
  room.drawStack = 0;
  room.started = true;
  
  // Deal 7 cards to each player
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
  
  broadcastUno(roomCode);
}

function nextUnoPlayer(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  
  const playerIds = Object.keys(room.players);
  room.currentPlayer = (room.currentPlayer + room.direction + playerIds.length) % playerIds.length;
  
  // Reset UNO call
  const currentPlayerId = playerIds[room.currentPlayer];
  if (room.players[currentPlayerId]) {
    room.players[currentPlayerId].calledUno = false;
  }
}

function broadcastUno(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.gameType !== 'uno') return;
  
  const playerIds = Object.keys(room.players);
  const currentPlayerId = playerIds[room.currentPlayer];
  
  io.to(roomCode).emit("uno-state", {
    players: Object.values(room.players).map(p => ({
      id: p.id,
      username: p.username,
      handCount: p.hand.length,
      calledUno: p.calledUno
    })),
    currentCard: room.currentCard,
    currentPlayer: currentPlayerId,
    direction: room.direction,
    started: room.started,
    readyCount: room.readyCount,
    drawStack: room.drawStack,
    deckCount: room.deck.length
  });
}

function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  
  room.submissions = [];
  room.currentBlack = drawBlack();
  
  const ids = Object.keys(room.players);
  if (ids.length < 3) {
    room.started = false;
    return broadcast(roomCode);
  }
  
  room.czarIndex = (room.czarIndex + 1) % ids.length;
  
  ids.forEach((id, i) => {
    room.players[id].isCzar = (i === room.czarIndex);
    room.players[id].hasSubmitted = false;
  });
  
  broadcast(roomCode);
}

function resetGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  
  room.players = {};
  room.submissions = [];
  room.currentBlack = "";
  room.czarIndex = 0;
  room.started = false;
  room.readyCount = 0;
  room.currentMusic = null;
  room.skipVotes.clear();
  
  io.to(roomCode).emit("force-reload");
}

/* ----- Socket Events ----- */
io.on("connection", (socket) => {
  console.log("🔌 Player connected:", socket.id);
  
  socket.on("create-room", (data, callback) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const gameType = data.gameType || 'cards-against';
    createRoom(roomCode, gameType);
    callback({ roomCode, gameType });
  });
  
  socket.on("join-room", (data) => {
    const { roomCode, name, gameType } = data;
    if (!name || !name.trim()) return;
    
    if (!rooms[roomCode]) {
      createRoom(roomCode, gameType || 'cards-against');
    }
    
    const room = rooms[roomCode];
    socket.join(roomCode);
    socket.roomCode = roomCode;
    
    if (room.gameType === 'cards-against') {
      room.players[socket.id] = {
        id: socket.id,
        username: name.substring(0, 15),
        hand: Array.from({ length: 10 }, drawWhite),
        score: 0,
        hasSubmitted: false,
        isCzar: false,
        ready: false
      };
      
      console.log("👤 Player joined CAH room", roomCode, ":", name);
      broadcast(roomCode);
    } else if (room.gameType === 'uno') {
      room.players[socket.id] = {
        id: socket.id,
        username: name.substring(0, 15),
        hand: [],
        ready: false,
        calledUno: false
      };
      
      console.log("👤 Player joined UNO room", roomCode, ":", name);
      broadcastUno(roomCode);
    }
  });

  socket.on("ready-up", () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    const p = room.players[socket.id];
    if (!p || p.ready) return;
    
    p.ready = true;
    room.readyCount++;
    
    const totalPlayers = Object.keys(room.players).length;
    
    if (room.gameType === 'cards-against') {
      if (room.readyCount >= totalPlayers && totalPlayers >= 3) {
        room.started = true;
        room.czarIndex = 0;
        nextRound(roomCode);
      }
      broadcast(roomCode);
    } else if (room.gameType === 'uno') {
      if (room.readyCount >= totalPlayers && totalPlayers >= 2) {
        startUnoGame(roomCode);
      }
      broadcastUno(roomCode);
    }
  });

  socket.on("submit", (card, custom) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    const p = room.players[socket.id];
    if (!p || p.isCzar || p.hasSubmitted) return;
    
    let text = card;
    if (card === "__BLANK__" && custom) {
      text = filter.clean(custom.slice(0, 140));
    }
    
    room.submissions.push({ card: text, playerId: p.id });
    p.hand = p.hand.filter(c => c !== card);
    p.hand.push(drawWhite());
    p.hasSubmitted = true;
    
    const nonCzar = Object.values(room.players).filter(x => !x.isCzar).length;
    if (room.submissions.length >= nonCzar) {
      room.submissions = shuffle([...room.submissions]);
    }
    
    broadcast(roomCode);
  });

  socket.on("pick", (pid) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    const czar = Object.values(room.players).find(p => p.isCzar && p.id === socket.id);
    const winner = room.players[pid];
    
    if (!czar || !winner) return;
    
    winner.score++;
    io.to(roomCode).emit("announce", winner.username);
    
    if (winner.score >= WIN_POINTS) {
      io.to(roomCode).emit("final-win", winner.username);
      setTimeout(() => resetGame(roomCode), 15000);
      return;
    }
    
    setTimeout(() => nextRound(roomCode), 4000);
  });

  socket.on("chat", (msg) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    const p = room.players[socket.id];
    if (!p) return;
    
    const clean = filter.clean(msg.slice(0, 200));
    io.to(roomCode).emit("chat", { user: p.username, text: clean });
  });

  socket.on("admin", (d) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    if (!d || d.pw !== ADMIN_PASS) return socket.emit("a_fail");
    
    if (d.type === "login") {
      socket.emit("a_ok");
    }
    
    if (d.type === "reset") {
      resetGame(roomCode);
    }
    
    if (d.type === "music-start") {
      const room = rooms[roomCode];
      room.currentMusic = d.url;
      room.skipVotes.clear();
      io.to(roomCode).emit("music-start", { url: d.url });
    }
    
    if (d.type === "wipe-chat") {
      io.to(roomCode).emit("wipe-chat");
    }
  });

  socket.on("vote-skip", () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    if (!room.currentMusic) return;
    
    room.skipVotes.add(socket.id);
    const totalPlayers = Object.keys(room.players).length;
    
    if (room.skipVotes.size >= Math.ceil(totalPlayers / 2)) {
      io.to(roomCode).emit("music-skip");
      room.currentMusic = null;
      room.skipVotes.clear();
    }
  });

  /* ----- UNO GAME EVENTS ----- */
  socket.on("uno-play-card", (data) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    if (room.gameType !== 'uno' || !room.started) return;
    
    const playerIds = Object.keys(room.players);
    const currentPlayerId = playerIds[room.currentPlayer];
    
    if (socket.id !== currentPlayerId) return;
    
    const player = room.players[socket.id];
    const cardIndex = data.cardIndex;
    const chosenColor = data.chosenColor;
    
    if (cardIndex < 0 || cardIndex >= player.hand.length) return;
    
    const card = player.hand[cardIndex];
    
    // Check if card can be played
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
      nextUnoPlayer(roomCode);
    } else if (card.value === 'reverse') {
      room.direction *= -1;
      if (playerIds.length === 2) {
        nextUnoPlayer(roomCode);
      }
    } else if (card.value === 'draw2') {
      room.drawStack += 2;
    } else if (card.value === 'wild-draw4') {
      room.drawStack += 4;
    }
    
    // Check for win
    if (player.hand.length === 0) {
      io.to(roomCode).emit("uno-winner", player.username);
      setTimeout(() => resetGame(roomCode), 5000);
      return;
    }
    
    // Check if player should have called UNO
    if (player.hand.length === 1 && !player.calledUno) {
      // Penalty: draw 2 cards
      for (let i = 0; i < 2; i++) {
        player.hand.push(drawUnoCard(roomCode));
      }
      io.to(roomCode).emit("uno-penalty", { username: player.username, reason: "Forgot to call UNO!" });
    }
    
    nextUnoPlayer(roomCode);
    broadcastUno(roomCode);
  });
  
  socket.on("uno-draw-card", () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    if (room.gameType !== 'uno' || !room.started) return;
    
    const playerIds = Object.keys(room.players);
    const currentPlayerId = playerIds[room.currentPlayer];
    
    if (socket.id !== currentPlayerId) return;
    
    const player = room.players[socket.id];
    
    if (room.drawStack > 0) {
      // Draw from stack
      for (let i = 0; i < room.drawStack; i++) {
        player.hand.push(drawUnoCard(roomCode));
      }
      room.drawStack = 0;
      nextUnoPlayer(roomCode);
    } else {
      // Draw one card
      const drawnCard = drawUnoCard(roomCode);
      player.hand.push(drawnCard);
      
      // Auto-play if possible
      if (canPlayUnoCard(drawnCard, room.currentCard)) {
        socket.emit("uno-can-play-drawn");
      } else {
        nextUnoPlayer(roomCode);
      }
    }
    
    broadcastUno(roomCode);
  });
  
  socket.on("uno-call-uno", () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    if (room.gameType !== 'uno') return;
    
    const player = room.players[socket.id];
    if (!player) return;
    
    player.calledUno = true;
    io.to(roomCode).emit("uno-called", player.username);
    broadcastUno(roomCode);
  });
  
  socket.on("uno-challenge", (targetId) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    if (room.gameType !== 'uno') return;
    
    const target = room.players[targetId];
    if (!target) return;
    
    // Check if target has 1 card and didn't call UNO
    if (target.hand.length === 1 && !target.calledUno) {
      // Penalty: draw 2 cards
      for (let i = 0; i < 2; i++) {
        target.hand.push(drawUnoCard(roomCode));
      }
      io.to(roomCode).emit("uno-penalty", { username: target.username, reason: "Caught not calling UNO!" });
      broadcastUno(roomCode);
    }
  });

  socket.on("disconnect", () => {
    const roomCode = socket.roomCode;
    if (!roomCode || !rooms[roomCode]) return;
    
    const room = rooms[roomCode];
    const p = room.players[socket.id];
    if (!p) return;
    
    console.log("🔌 Player disconnected:", p.username);
    
    if (room.gameType === 'cards-against') {
      const wasCzar = p.isCzar;
      if (p.ready) room.readyCount--;
      
      delete room.players[socket.id];
      room.submissions = room.submissions.filter(s => s.playerId !== socket.id);
      room.skipVotes.delete(socket.id);
      
      const remaining = Object.keys(room.players).length;
      
      if (remaining < 3) {
        room.started = false;
        room.submissions = [];
        room.currentBlack = "";
      } else if (wasCzar && room.started) {
        nextRound(roomCode);
      }
      
      broadcast(roomCode);
    } else if (room.gameType === 'uno') {
      if (p.ready) room.readyCount--;
      delete room.players[socket.id];
      
      const remaining = Object.keys(room.players).length;
      
      if (remaining < 2) {
        room.started = false;
      } else if (room.started) {
        // Adjust current player if needed
        const playerIds = Object.keys(room.players);
        if (room.currentPlayer >= playerIds.length) {
          room.currentPlayer = 0;
        }
      }
      
      broadcastUno(roomCode);
    }
    
    // Clean up empty rooms
    if (Object.keys(room.players).length === 0) {
      delete rooms[roomCode];
      console.log("🗑️ Room", roomCode, "deleted (empty)");
    }
  });
});

/* ----- Start Server ----- */
server.listen(PORT, () => {
  console.log(`🎮 Cards Against The LCU server running on port ${PORT}`);
});

setInterval(() => {
  console.log("⏱ keep-alive ping");
}, KEEPALIVE_MS);
