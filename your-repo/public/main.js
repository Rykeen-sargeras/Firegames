// Main application logic
const socket = io();
let adminPw = "";
let currentRoomCode = "";
let currentGameType = "";
let myUsername = "";

/* ===== CUSTOM MODAL SYSTEM ===== */
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
    
    // Input field
    if (options.input) {
      modalInput.style.display = 'block';
      modalInput.value = options.inputValue || '';
      modalInput.placeholder = options.inputPlaceholder || '';
      colorSelector.style.display = 'none';
    } else if (options.colorPicker) {
      modalInput.style.display = 'none';
      colorSelector.style.display = 'grid';
      colorSelector.innerHTML = `
        <button class="color-btn" style="background: var(--uno-red);" data-color="red">RED</button>
        <button class="color-btn" style="background: var(--uno-blue);" data-color="blue">BLUE</button>
        <button class="color-btn" style="background: var(--uno-green);" data-color="green">GREEN</button>
        <button class="color-btn" style="background: var(--uno-yellow); color: #000;" data-color="yellow">YELLOW</button>
      `;
    } else {
      modalInput.style.display = 'none';
      colorSelector.style.display = 'none';
    }
    
    if (options.showCancel) {
      modalCancel.style.display = 'block';
    } else {
      modalCancel.style.display = 'none';
    }
    
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
    
    const cleanup = () => {
      modal.style.display = 'none';
      modalConfirm.removeEventListener('click', handleConfirm);
      modalCancel.removeEventListener('click', handleCancel);
      colorSelector.removeEventListener('click', handleColorPick);
    };
    
    modalConfirm.addEventListener('click', handleConfirm);
    modalCancel.addEventListener('click', handleCancel);
    if (options.colorPicker) {
      colorSelector.addEventListener('click', handleColorPick);
    }
  });
}

/* ===== SCREEN MANAGEMENT ===== */
function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
  document.getElementById(screenId).style.display = 'flex';
}

/* ===== HOME & GAME SELECTION ===== */
function showGameSelection() {
  const name = document.getElementById('name').value.trim();
  if (!name) {
    showModal('⚠️ Error', 'Please enter a username first!');
    return;
  }
  myUsername = name;
  show('gameSelection');
}

function selectGame(gameType) {
  currentGameType = gameType;
  socket.emit('create-room', { gameType }, (data) => {
    currentRoomCode = data.roomCode;
    currentGameType = data.gameType;
    socket.emit('join-room', { roomCode: currentRoomCode, name: myUsername, gameType: currentGameType });
    document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
    
    if (gameType === 'cards-against') {
      document.getElementById('lobbyGameTitle').textContent = '🃏 Cards Against The LCU - Lobby';
    } else if (gameType === 'uno') {
      document.getElementById('lobbyGameTitle').textContent = '🎴 UNO - Lobby';
    }
    
    show('lobby');
  });
}

async function showJoinRoom() {
  const name = document.getElementById('name').value.trim();
  if (!name) {
    showModal('⚠️ Error', 'Please enter a username first!');
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
    socket.emit('join-room', { roomCode: currentRoomCode, name: myUsername });
    document.getElementById('roomCodeDisplay').textContent = currentRoomCode;
    show('lobby');
  }
}

function ready() {
  console.log('Ready button clicked!');
  socket.emit('ready-up');
  document.getElementById('readyBtn').disabled = true;
  document.getElementById('readyBtn').textContent = "⏳ Waiting for others...";
  document.getElementById('readyBtn').style.opacity = "0.5";
}

/* ===== CHAT FUNCTIONS ===== */
function sendMsg() {
  const input = document.getElementById('msg');
  if (input.value.trim()) {
    socket.emit('chat', input.value.trim());
    input.value = '';
  }
}

function sendMsgUno() {
  const input = document.getElementById('msgUno');
  if (input.value.trim()) {
    socket.emit('chat', input.value.trim());
    input.value = '';
  }
}

function toggleChat() {
  const chat = document.getElementById('chat');
  const btn = document.getElementById('toggleChatBtn');
  
  if (chat.classList.contains('hidden')) {
    chat.classList.remove('hidden');
    btn.classList.remove('chatHidden');
    btn.textContent = '❌';
  } else {
    chat.classList.add('hidden');
    btn.classList.add('chatHidden');
    btn.textContent = '💬';
  }
}

socket.on('chat', (d) => {
  // Update both chat boxes
  const boxes = [document.getElementById('chat-box'), document.getElementById('chat-box-uno')];
  boxes.forEach(box => {
    if (box) {
      const msg = document.createElement('div');
      msg.innerHTML = `<strong style="color: var(--cyan);">${d.user}:</strong> ${d.text}`;
      msg.style.marginBottom = '10px';
      msg.style.padding = '8px';
      msg.style.background = 'rgba(0, 0, 0, 0.5)';
      msg.style.borderRadius = '6px';
      box.appendChild(msg);
      box.scrollTop = box.scrollHeight;
    }
  });
});

socket.on('wipe-chat', () => {
  const box1 = document.getElementById('chat-box');
  const box2 = document.getElementById('chat-box-uno');
  if (box1) box1.innerHTML = '';
  if (box2) box2.innerHTML = '';
});

/* ===== WINNER OVERLAYS ===== */
function showOverlay(text) {
  const overlay = document.getElementById('winnerOverlay');
  const overlayText = document.getElementById('overlayText');
  overlayText.textContent = text;
  overlay.style.display = 'flex';
  
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 2000);
}

function dismissOverlay() {
  document.getElementById('winnerOverlay').style.display = 'none';
}

socket.on('force-reload', () => {
  location.reload();
});

/* ===== ADMIN PANEL ===== */
async function toggleAdmin() {
  const panel = document.getElementById('adminPanel');
  
  if (!adminPw) {
    adminPw = await showModal(
      '🔑 Admin Login',
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

socket.on('a_ok', () => {
  document.getElementById('adminPanel').style.display = 'flex';
});

socket.on('a_fail', () => {
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

/* ===== MUSIC ===== */
async function startMusic() {
  const url = await showModal(
    '🎵 Play Music',
    'Enter YouTube URL:',
    { input: true, inputPlaceholder: 'https://youtube.com/watch?v=...', showCancel: true }
  );
  
  if (!url || !url.trim()) return;
  
  socket.emit('admin', { type: 'music-start', pw: adminPw, url: url.trim() });
}

socket.on('music-start', (d) => {
  const vid = extractVideoId(d.url);
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

/* ===== ENTER KEY HANDLERS ===== */
document.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const active = document.activeElement;
    if (active.id === 'msg') sendMsg();
    if (active.id === 'msgUno') sendMsgUno();
  }
});
