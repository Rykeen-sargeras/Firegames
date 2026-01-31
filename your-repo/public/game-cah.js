// ============================================
// GAME-CAH.JS - Cards Against The LCU Logic
// ============================================

// Game state
let cahHand = [];
let cahIsCzar = false;
let cahHasSubmitted = false;
let cahPlayers = [];

// ============================================
// CAH STATE HANDLER
// ============================================

socket.on('cah-state', (state) => {
  console.log('🃏 CAH state received:', state);
  
  if (!state.started) {
    // Game not started, lobby will handle this
    return;
  }
  
  // Update local state
  cahHand = state.myHand || [];
  cahIsCzar = state.isCzar || false;
  cahHasSubmitted = state.hasSubmitted || false;
  cahPlayers = state.players || [];
  currentGameType = 'cards-against';
  
  // Show game screen
  show('gameCAH');
  
  // Update header
  document.getElementById('czarName').textContent = state.czarName;
  
  // Update scoreboard
  renderCAHScoreboard(state.players);
  
  // Render black card
  renderBlackCard(state.blackCard);
  
  // Render submissions table
  renderSubmissions(state.submissions, state.allSubmitted, state.czarId);
  
  // Render hand (if not czar and hasn't submitted)
  renderCAHHand();
  
  // Update admin panel
  document.getElementById('adminPlayers').innerHTML = state.players
    .map(p => `${p.username} – ${p.score} pts ${p.isCzar ? '👑' : ''}`)
    .join('<br>');
});

// ============================================
// RENDERING FUNCTIONS
// ============================================

function renderCAHScoreboard(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  
  document.getElementById('scoreList').innerHTML = sorted
    .map((p, i) => `
      <div class="score-entry ${p.isCzar ? 'czar' : ''}">
        <span class="rank">${i + 1}.</span>
        <span class="name">${p.username}</span>
        <span class="score">${p.score}</span>
        ${p.isCzar ? '<span class="crown">👑</span>' : ''}
      </div>
    `).join('');
}

function renderBlackCard(text) {
  document.getElementById('blackCard').innerHTML = `
    <div class="card blackCard">${text || '...'}</div>
  `;
}

function renderSubmissions(submissions, allSubmitted, czarId) {
  const table = document.getElementById('table');
  const canPick = cahIsCzar && allSubmitted && submissions.length > 0;
  
  if (submissions.length === 0) {
    table.innerHTML = `
      <div class="waiting-submissions">
        ⏳ Waiting for submissions...
      </div>
    `;
    return;
  }
  
  table.innerHTML = submissions.map(s => {
    const clickable = canPick;
    return `
      <div class="card whiteCard ${clickable ? 'clickable czar-pick' : ''}" 
           ${clickable ? `onclick="pickWinner('${s.playerId}')"` : ''}>
        ${s.card}
        ${canPick ? '<div class="pick-hint">Click to pick winner</div>' : ''}
      </div>
    `;
  }).join('');
  
  // Show instruction for czar
  if (cahIsCzar && !allSubmitted) {
    table.innerHTML += `
      <div class="czar-waiting">
        👑 You are the Card Czar! Waiting for all players to submit...
      </div>
    `;
  }
}

function renderCAHHand() {
  const handEl = document.getElementById('hand');
  
  if (cahIsCzar) {
    handEl.innerHTML = `
      <div class="hand-info">
        👑 You are the Card Czar this round!<br>
        Wait for everyone to submit, then pick the funniest card.
      </div>
    `;
    return;
  }
  
  if (cahHasSubmitted) {
    handEl.innerHTML = `
      <div class="hand-info">
        ✅ Card submitted! Waiting for other players...
      </div>
    `;
    return;
  }
  
  if (cahHand.length === 0) {
    handEl.innerHTML = `
      <div class="hand-info">
        🎴 Dealing cards...
      </div>
    `;
    return;
  }
  
  handEl.innerHTML = `
    <div class="hand-title">Your Hand (click to play):</div>
    <div class="hand-cards">
      ${cahHand.map(card => `
        <div class="card whiteCard clickable" onclick="playCAHCard('${escapeQuotes(card)}')">
          ${card === '__BLANK__' ? '✏️ Write Your Own' : card}
        </div>
      `).join('')}
    </div>
  `;
}

function escapeQuotes(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ============================================
// GAME ACTIONS
// ============================================

async function playCAHCard(card) {
  const displayText = card === '__BLANK__' ? 'Write your own card' : card;
  
  const confirmed = await showModal(
    '🃏 Play This Card?',
    displayText,
    { showCancel: true, confirmText: 'Play Card', cancelText: 'Cancel' }
  );
  
  if (!confirmed) return;
  
  if (card === '__BLANK__') {
    const customText = await showModal(
      '✏️ Custom Card',
      'Enter your custom card text:',
      { input: true, inputPlaceholder: 'Your funny response...', showCancel: true }
    );
    
    if (customText && customText.trim()) {
      socket.emit('cah-submit', { card, customText: customText.trim() });
    }
  } else {
    socket.emit('cah-submit', { card });
  }
}

async function pickWinner(playerId) {
  const winner = cahPlayers.find(p => p.id === playerId);
  if (!winner) return;
  
  const confirmed = await showModal(
    '👑 Award Point?',
    `Give the point to this card?`,
    { showCancel: true, confirmText: 'Award Point', cancelText: 'Cancel' }
  );
  
  if (confirmed) {
    socket.emit('cah-pick', playerId);
  }
}

// ============================================
// EVENT HANDLERS
// ============================================

socket.on('cah-round-winner', (data) => {
  showOverlay(`🎉 ${data.username} won this round! 🎉`);
  
  // Confetti effect
  if (typeof confetti !== 'undefined') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00fff7', '#ff8a00', '#bf00ff']
    });
  }
});

socket.on('cah-game-winner', (data) => {
  showOverlay(`🏆 ${data.username} WON THE GAME! 🏆`);
  
  // Big confetti effect
  if (typeof confetti !== 'undefined') {
    confetti({
      particleCount: 300,
      spread: 120,
      origin: { y: 0.5 },
      colors: ['#00fff7', '#ff8a00', '#bf00ff', '#FFD700']
    });
  }
});
