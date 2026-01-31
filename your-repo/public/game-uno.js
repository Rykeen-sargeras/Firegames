// ============================================
// GAME-UNO.JS - UNO Game Logic
// ============================================

// Game state
let unoHand = [];
let unoIsMyTurn = false;
let unoCurrentCard = null;
let unoPlayers = [];
let unoDrawStack = 0;

// ============================================
// UNO STATE HANDLER
// ============================================

socket.on('uno-state', (state) => {
  console.log('🎴 UNO state received:', state);
  
  if (!state.started) {
    // Game not started, lobby will handle this
    return;
  }
  
  // Update local state
  unoHand = state.myHand || [];
  unoIsMyTurn = state.isMyTurn || false;
  unoCurrentCard = state.currentCard;
  unoPlayers = state.players || [];
  unoDrawStack = state.drawStack || 0;
  currentGameType = 'uno';
  
  // Show game screen
  show('gameUNO');
  
  // Render all components
  renderUnoPlayers(state.players, state.currentPlayerId);
  renderUnoCenter(state.currentCard, state.deckCount);
  renderUnoHand();
  renderUnoActions();
  
  // Update admin panel
  document.getElementById('adminPlayers').innerHTML = state.players
    .map(p => `${p.username} – ${p.handCount} cards ${p.calledUno ? '🔥' : ''}`)
    .join('<br>');
});

// ============================================
// RENDERING FUNCTIONS
// ============================================

function renderUnoPlayers(players, currentPlayerId) {
  const container = document.getElementById('unoPlayers');
  
  container.innerHTML = players.map(p => {
    const isCurrent = p.id === currentPlayerId;
    const isMe = p.id === socket.id;
    
    return `
      <div class="uno-player ${isCurrent ? 'current-turn' : ''} ${isMe ? 'is-me' : ''}">
        <div class="player-header">
          <span class="player-name">${p.username}${isMe ? ' (You)' : ''}</span>
          ${p.calledUno ? '<span class="uno-badge">UNO!</span>' : ''}
        </div>
        <div class="player-cards">🎴 ${p.handCount} card${p.handCount !== 1 ? 's' : ''}</div>
        ${isCurrent ? '<div class="turn-indicator">⬅️ Their turn</div>' : ''}
        ${p.handCount === 1 && !p.calledUno && !isMe ? `
          <button class="challenge-btn" onclick="challengeUno('${p.id}')">
            ⚠️ Challenge!
          </button>
        ` : ''}
      </div>
    `;
  }).join('');
}

function renderUnoCenter(currentCard, deckCount) {
  // Render current card
  const cardEl = document.getElementById('currentCard');
  if (currentCard) {
    const color = currentCard.activeColor || currentCard.color;
    cardEl.className = `uno-card ${color}`;
    cardEl.innerHTML = getUnoCardDisplay(currentCard);
  }
  
  // Update deck count
  document.getElementById('deckCount').textContent = deckCount;
  
  // Update draw pile styling based on turn
  const deckEl = document.getElementById('unoDeck');
  if (unoIsMyTurn) {
    deckEl.classList.add('can-draw');
  } else {
    deckEl.classList.remove('can-draw');
  }
  
  // Show draw stack indicator
  const stackIndicator = document.getElementById('drawStackIndicator');
  if (stackIndicator) {
    if (unoDrawStack > 0) {
      stackIndicator.textContent = `+${unoDrawStack} cards pending!`;
      stackIndicator.style.display = 'block';
    } else {
      stackIndicator.style.display = 'none';
    }
  }
}

function renderUnoHand() {
  const handEl = document.getElementById('unoHand');
  
  if (unoHand.length === 0) {
    handEl.innerHTML = '<div class="hand-empty">No cards in hand</div>';
    return;
  }
  
  handEl.innerHTML = unoHand.map((card, idx) => {
    const canPlay = unoIsMyTurn && canPlayUnoCard(card, unoCurrentCard);
    const color = card.activeColor || card.color;
    
    return `
      <div class="uno-card-small ${color} ${canPlay ? 'playable' : 'unplayable'}" 
           onclick="${canPlay ? `playUnoCard(${idx})` : 'showCantPlay()'}"
           title="${canPlay ? 'Click to play' : 'Cannot play this card'}">
        ${getUnoCardDisplay(card)}
      </div>
    `;
  }).join('');
}

function renderUnoActions() {
  const callBtn = document.getElementById('callUnoBtn');
  
  // Can only call UNO on your turn
  if (unoIsMyTurn && unoHand.length <= 2) {
    callBtn.disabled = false;
    callBtn.classList.add('can-call');
  } else {
    callBtn.disabled = true;
    callBtn.classList.remove('can-call');
  }
  
  // Update turn indicator
  const turnIndicator = document.getElementById('turnIndicator');
  if (turnIndicator) {
    if (unoIsMyTurn) {
      turnIndicator.textContent = '🎯 Your Turn!';
      turnIndicator.classList.add('my-turn');
    } else {
      turnIndicator.textContent = 'Waiting for other player...';
      turnIndicator.classList.remove('my-turn');
    }
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getUnoCardDisplay(card) {
  if (!card) return '?';
  
  switch (card.value) {
    case 'wild': return '🌈';
    case 'wild-draw4': return '+4';
    case 'draw2': return '+2';
    case 'skip': return '🚫';
    case 'reverse': return '🔄';
    default: return card.value;
  }
}

function canPlayUnoCard(card, topCard) {
  if (!card || !topCard) return false;
  if (card.color === 'wild') return true;
  
  const activeColor = topCard.activeColor || topCard.color;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value) return true;
  
  return false;
}

function showCantPlay() {
  if (!unoIsMyTurn) {
    showModal('⏳ Wait', "It's not your turn!");
  } else {
    showModal('❌ Cannot Play', "This card doesn't match! Draw a card or play a matching card.");
  }
}

// ============================================
// GAME ACTIONS
// ============================================

async function playUnoCard(cardIndex) {
  const card = unoHand[cardIndex];
  if (!card) return;
  
  // Wild cards need color selection
  if (card.color === 'wild') {
    const chosenColor = await showModal(
      '🌈 Choose Color',
      'Pick a color for your wild card:',
      { colorPicker: true }
    );
    
    if (!chosenColor) return;
    
    socket.emit('uno-play', { cardIndex, chosenColor });
  } else {
    socket.emit('uno-play', { cardIndex });
  }
}

function drawCard() {
  if (!unoIsMyTurn) {
    showModal('⏳ Wait', "It's not your turn!");
    return;
  }
  
  socket.emit('uno-draw');
}

function callUno() {
  socket.emit('uno-call');
}

function challengeUno(playerId) {
  socket.emit('uno-challenge', playerId);
}

// ============================================
// EVENT HANDLERS
// ============================================

socket.on('uno-error', (msg) => {
  showModal('❌ Error', msg);
});

socket.on('uno-can-play-drawn', (data) => {
  showModal('✅ Play Card?', 'You drew a playable card! Click it in your hand to play it.');
});

socket.on('uno-called', (data) => {
  showOverlay(`🔥 ${data.username} called UNO!`);
});

socket.on('uno-penalty', (data) => {
  showOverlay(`⚠️ ${data.username}: ${data.reason}`);
});

socket.on('uno-drew-stack', (data) => {
  showOverlay(`📥 ${data.username} drew ${data.count} cards!`);
});

socket.on('uno-winner', (data) => {
  showOverlay(`🏆 ${data.username} WON UNO! 🏆`);
  
  // Big colorful confetti
  if (typeof confetti !== 'undefined') {
    confetti({
      particleCount: 300,
      spread: 160,
      origin: { y: 0.5 },
      colors: ['#ff3333', '#3366ff', '#33cc33', '#ffcc00']
    });
  }
});
