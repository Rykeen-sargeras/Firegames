// ============================================
// MAIN.JS - Core Application Logic
// ============================================

// Initialize Socket.IO connection
const socket = io();

// Global state
let adminPw = "";
let currentRoomCode = "";
let currentGameType = "";
let myUsername = "";
let isConnected = false;

// ============================================
// SOCKET CONNECTION HANDLING
// ============================================

socket.on('connect', () => {
  console.log('✅ Socket connected!', socket.id);
  isConnected = true;
  updateConnectionStatus(true);
});

socket.on('disconnect', () => {
  console.log('❌ Socket disconnected!');
  isConnected = false;
  updateConnectionStatus(false);
});

socket.on('connect_error', (error) => {
  console.error('🔥 Socket connection error:', error);
  isConnected = false;
  updateConnectionStatus(false);
});

function updateConnectionStatus(connected) {
  const statusEl = document.getElementById('connectionStatus');
  if (statusEl) {
    statusEl.textContent = connected ? '🟢 Connected' : '🔴 Disconnected';
    statusEl.style.color = connected ? 'var(--cyan)' : '#f33';
  }
}

// ============================================
// CUSTOM MODAL SYSTEM
// ============================================

function showModal(title, message, options = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalInput = document.getElementById('modalInput');
    const colorSelector = document.getElementById('colorSelector');
    const modalConfirm = document.getElementById('modalConfirm');
    const modalCancel = document.getElementById('modalCancel');
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    
    // Reset visibility
    modalInput.style.display = 'none';
    colorSelector.style.display = 'none';
    
    // Input field
    if (options.input) {
      modalInput.style.display = 'block';
      modalInput.value = options.inputValue || '';
      modalInput.placeholder = options.inputPlaceholder || '';
      setTimeout(() => modalInput.focus(), 100);
    } else if (options.colorPicker) {
      colorSelector.style.display = 'grid';
      colorSelector.innerHTML = `
        <button class="color-btn" style="background: var(--uno-red);" data-color="red">RED</button>
        <button class="color-btn" style="background: var(--uno-blue);" data-color="blue">BLUE</button>
        <button class="color-btn" style="background: var(--uno-green);" data-color="green">GREEN</button>
        <button class="color-btn" style="background: var(--uno-yellow); color: #000;" data-color="yellow">YELLOW</button>
      `;
    }
    
    modalCancel.style.display = options.showCancel ? 'block' : 'none';
    modalConfirm.textContent = options.confirmText || 'OK';
    modalCancel.textContent = options.cancelText || 'Cancel';
    
    modal.style.display = 'flex';
    
    const handleConfirm = () => {
      const value = options.input ? modalInput.value : true;
      cleanup();
      resolve(value);
    };
    
    const handleCancel = () => {
      cleanup();
      resolve(null);
    };
    
    const handleColorPick = (e) => {
      if (e.target.classList.contains('color-btn')) {
        cleanup();
        resolve(e.target.dataset.color);
      }
    };
    
    const handleKeydown = (e) => {
      if (e.key === 'Enter' && options.input) {
        handleConfirm();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };
    
    const cleanup = () => {
      modal.style.display = 'none';
      modalConfirm.removeEventListener('click', handleConfirm);
      modalCancel.removeEventListener('click', handleCancel);
      colorSelector.removeEventListener('click', handleColorPick);
      document.removeEventListener('keydown', handleKeydown);
    };
    
    modalConfirm.addEventListener('click', handleConfirm);
    modalCancel.addEventListener('click', handleCancel);
    document.addEventListener('keydown', handleKeydown);
    
    if (options.colorPicker) {
      colorSelector.addEventListener('click', handleColorPick);
    }
  });
}

// ============================================
// SCREEN MANAGEMENT
// ============================================

function show(screenId) {
  console.log(`📺 Showing screen: ${screenId}`);
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.style.display = 'flex';
  }
}

// ============================================
// HOME & NAVIGATION
// ============================================

function showGameSelection() {
  const name = document.getElementById('name').value.trim();
  if (!name) {
    showModal('⚠️ Error', 'Please enter a username first!');
    return;
  }
  if (!isConnected) {
    showModal('⚠️ Connection Error', 'Not connected to server. Please refresh the page.');
    return;
  }
  myUsername = name;
  show('gameSelection');
}

function goHome() {
  currentRoomCode = "";
  currentGameType = "";
  show('home');
}

// ============================================
// ROOM CREATION & JOINING
// ============================================

function selectGame(gameType) {
  if (!isConnected) {
    showModal('⚠️ Connection Error', 'Not connected to server. Please refresh the page.');
    return;
  }
  
  console.log(`🎮 Creating ${gameType} room...`);
  currentGameType = gameType;
  
  socket.emit('create-room', { gameType }, (response) => {
    console.log('📦 Room created:', response);
    currentRoomCode = response.roomCode;
    currentGameType = response.gameType;
    
    // Now join the room we just created
    socket.emit('join-room', { 
      roomCode: currentRoomCode, 
      name: myUsername, 
      gameType: currentGameType 
    }, (joinResponse) => {
      if (joinResponse.success) {
        console.log('✅ Joined room successfully');
        document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
        updateLobbyTitle();
        show('lobby');
        resetReadyButton();
      } else {
        showModal('❌ Error', joinResponse.error || 'Failed to join room');
      }
    });
  });
}

async function showJoinRoom() {
  const name = document.getElementById('name').value.trim();
  if (!name) {
    showModal('⚠️ Error', 'Please enter a username first!');
    return;
  }
  if (!isConnected) {
    showModal('⚠️ Connection Error', 'Not connected to server. Please refresh the page.');
    return;
  }
  
  const roomCode = await showModal('🔑 Join Room', 'Enter room code:', {
    input: true,
    inputPlaceholder: 'ABCD12',
    showCancel: true,
    confirmText: 'Join'
  });
  
  if (roomCode && roomCode.trim()) {
    myUsername = name;
    currentRoomCode = roomCode.trim().toUpperCase();
    
    console.log(`🚪 Joining room ${currentRoomCode}...`);
    
    socket.emit('join-room', { 
      roomCode: currentRoomCode, 
      name: myUsername 
    }, (response) => {
      console.log('🚪 Join response:', response);
      
      if (response.success) {
        currentGameType = response.gameType;
        document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
        updateLobbyTitle();
        show('lobby');
        resetReadyButton();
      } else {
        showModal('❌ Error', response.error || 'Failed to join room');
        currentRoomCode = "";
      }
    });
  }
}

function updateLobbyTitle() {
  const titleEl = document.getElementById('lobbyGameTitle');
  if (currentGameType === 'cards-against') {
    titleEl.textContent = '🃏 Cards Against The LCU - Lobby';
  } else if (currentGameType === 'uno') {
    titleEl.textContent = '🎴 UNO - Lobby';
  } else {
    titleEl.textContent = '🎮 Game Lobby';
  }
}

// ============================================
// LOBBY HANDLING
// ============================================

socket.on('lobby-state', (data) => {
  console.log('📡 Lobby state received:', data);
  
  currentGameType = data.gameType;
  currentRoomCode = data.roomCode;
  
  // Only show lobby if game hasn't started
  if (data.started) {
    return; // Game screens will handle this
  }
  
  show('lobby');
  
  const playersDiv = document.getElementById('players');
  const minPlayers = data.minPlayers;
  const totalPlayers = data.totalPlayers;
  const readyCount = data.readyCount;
  
  // Build player list
  if (data.players.length === 0) {
    playersDiv.innerHTML = `
      <div class="lobby-waiting">
        🔍 Waiting for players to join...
      </div>
    `;
  } else {
    const playerCards = data.players.map(p => {
      const isMe = p.id === socket.id;
      return `
        <div class="lobby-player ${p.ready ? 'ready' : ''} ${isMe ? 'is-me' : ''}">
          <span class="player-name">${p.username}${isMe ? ' (You)' : ''}</span>
          <span class="player-status">${p.ready ? '✅ Ready' : '⏳ Waiting'}</span>
        </div>
      `;
    }).join('');
    
    playersDiv.innerHTML = playerCards;
  }
  
  // Update status message
  const statusDiv = document.getElementById('lobbyStatus');
  if (statusDiv) {
    if (totalPlayers < minPlayers) {
      statusDiv.innerHTML = `<span style="color: var(--orange);">Need ${minPlayers - totalPlayers} more player${minPlayers - totalPlayers > 1 ? 's' : ''} to start (minimum ${minPlayers})</span>`;
    } else if (readyCount < totalPlayers) {
      statusDiv.innerHTML = `<span style="color: var(--cyan);">Waiting for ${totalPlayers - readyCount} player${totalPlayers - readyCount > 1 ? 's' : ''} to ready up</span>`;
    } else {
      statusDiv.innerHTML = `<span style="color: var(--cyan);">🚀 Starting game...</span>`;
    }
  }
  
  // Update ready button state
  const me = data.players.find(p => p.id === socket.id);
  if (me) {
    updateReadyButtonState(me.ready);
  }
  
  // Update admin panel
  document.getElementById('adminPlayers').innerHTML = data.players
    .map(p => `${p.username} – ${p.ready ? '✅' : '⏳'}`)
    .join('<br>');
});

// ============================================
// READY SYSTEM
// ============================================

function ready() {
  console.log('🙋 Ready button clicked!');
  
  if (!isConnected) {
    showModal('⚠️ Error', 'Not connected to server');
    return;
  }
  
  const btn = document.getElementById('readyBtn');
  const isCurrentlyReady = btn.dataset.ready === 'true';
  
  if (isCurrentlyReady) {
    socket.emit('unready');
  } else {
    socket.emit('ready-up');
  }
}

function updateReadyButtonState(isReady) {
  const btn = document.getElementById('readyBtn');
  
  if (isReady) {
    btn.textContent = '⏳ Waiting for others...';
    btn.classList.add('ready-active');
    btn.dataset.ready = 'true';
  } else {
    btn.textContent = '✅ Ready Up';
    btn.classList.remove('ready-active');
    btn.dataset.ready = 'false';
  }
}

function resetReadyButton() {
  const btn = document.getElementById('readyBtn');
  btn.textContent = '✅ Ready Up';
  btn.classList.remove('ready-active');
  btn.dataset.ready = 'false';
  btn.disabled = false;
}

// ============================================
// GAME RESET HANDLER
// ============================================

socket.on('game-reset', () => {
  console.log('🔄 Game reset!');
  resetReadyButton();
  show('lobby');
});

socket.on('force-reload', () => {
  location.reload();
});

// ============================================
// CHAT FUNCTIONS
// ============================================

function sendChat(inputId) {
  const input = document.getElementById(inputId);
  if (input && input.value.trim()) {
    socket.emit('chat', input.value.trim());
    input.value = '';
  }
}

function sendMsg() { sendChat('msg'); }
function sendMsgUno() { sendChat('msgUno'); }

socket.on('chat', (data) => {
  const chatBoxes = ['chat-box', 'chat-box-uno'];
  chatBoxes.forEach(boxId => {
    const box = document.getElementById(boxId);
    if (box) {
      const msg = document.createElement('div');
      msg.className = 'chat-message';
      msg.innerHTML = `<strong style="color: var(--cyan);">${data.user}:</strong> ${data.text}`;
      box.appendChild(msg);
      box.scrollTop = box.scrollHeight;
    }
  });
});

socket.on('wipe-chat', () => {
  ['chat-box', 'chat-box-uno'].forEach(boxId => {
    const box = document.getElementById(boxId);
    if (box) box.innerHTML = '';
  });
});

function toggleChat() {
  const chatEl = document.querySelector('#gameCAH #chat, #gameUNO #chat');
  const btn = document.getElementById('toggleChatBtn');
  
  if (chatEl) {
    if (chatEl.classList.contains('hidden')) {
      chatEl.classList.remove('hidden');
      btn.textContent = '❌';
    } else {
      chatEl.classList.add('hidden');
      btn.textContent = '💬';
    }
  }
}

// ============================================
// WINNER OVERLAYS
// ============================================

function showOverlay(text) {
  const overlay = document.getElementById('winnerOverlay');
  const overlayText = document.getElementById('overlayText');
  
  overlayText.textContent = text;
  overlay.style.display = 'flex';
  
  // Auto-dismiss after 3 seconds
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 3000);
}

function dismissOverlay() {
  document.getElementById('winnerOverlay').style.display = 'none';
}

// ============================================
// ADMIN PANEL
// ============================================

async function toggleAdmin() {
  const panel = document.getElementById('adminPanel');
  
  if (!adminPw) {
    adminPw = await showModal(
      '🔒 Admin Login',
      'Enter admin password:',
      { input: true, inputPlaceholder: 'Password', showCancel: true }
    );
    
    if (!adminPw) return;
    socket.emit('admin', { type: 'login', pw: adminPw });
  } else {
    panel.style.display = 'flex';
  }
}

function closeAdmin() {
  document.getElementById('adminPanel').style.display = 'none';
}

socket.on('admin-ok', () => {
  document.getElementById('adminPanel').style.display = 'flex';
});

socket.on('admin-fail', () => {
  showModal('❌ Error', 'Wrong admin password!');
  adminPw = "";
});

async function reset() {
  const confirmed = await showModal(
    '⚠️ Reset Game',
    'Reset the entire game? This cannot be undone!',
    { showCancel: true, confirmText: 'Reset', cancelText: 'Cancel' }
  );
  
  if (confirmed) {
    socket.emit('admin', { type: 'reset', pw: adminPw });
  }
}

async function wipeChat() {
  const confirmed = await showModal(
    '🧹 Clear Chat',
    'Clear all chat messages?',
    { showCancel: true, confirmText: 'Clear', cancelText: 'Cancel' }
  );
  
  if (confirmed) {
    socket.emit('admin', { type: 'wipe-chat', pw: adminPw });
  }
}

// ============================================
// MUSIC CONTROLS
// ============================================

async function startMusic() {
  const url = await showModal(
    '🎵 Play Music',
    'Enter YouTube URL:',
    { input: true, inputPlaceholder: 'https://youtube.com/watch?v=...', showCancel: true }
  );
  
  if (!url || !url.trim()) return;
  
  socket.emit('admin', { type: 'music-start', pw: adminPw, url: url.trim() });
}

socket.on('music-start', (data) => {
  const vid = extractVideoId(data.url);
  if (vid) {
    const player = document.getElementById('ytPlayer');
    player.classList.add('active');
    player.src = `https://www.youtube.com/embed/${vid}?autoplay=1`;
  }
});

socket.on('music-skip', () => {
  const player = document.getElementById('ytPlayer');
  player.src = '';
  player.classList.remove('active');
});

function extractVideoId(url) {
  const match = url.match(/(?:v=|\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

// ============================================
// KEYBOARD HANDLERS
// ============================================

document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const active = document.activeElement;
    if (active.id === 'msg') sendMsg();
    if (active.id === 'msgUno') sendMsgUno();
    if (active.id === 'name') showGameSelection();
  }
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🎮 Game Lobby initialized');
  show('home');
});
