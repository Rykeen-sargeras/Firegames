// Cards Against The LCU game logic
let isCzar = false;
let hand = [];
let allPlayers = [];

socket.on('state', (d) => {
  allPlayers = d.players;
  currentGameType = 'cards-against';
  
  if (!d.started) {
    show('lobby');
    document.getElementById('players').innerHTML = d.players
      .map(p => `<div style="padding: 8px;">${p.username} ${p.ready ? '✅' : '⏳'}</div>`)
      .join('');
    
    document.getElementById('adminPlayers').innerHTML = d.players
      .map(p => `${p.username} – ${p.score} pts ${p.isCzar ? '👑' : ''}`)
      .join('<br>');
    return;
  }
  
  show('gameCAH');
  document.getElementById('czarName').textContent = d.czarName;
  
  const sortedPlayers = [...d.players].sort((a, b) => b.score - a.score);
  document.getElementById('scoreList').innerHTML = sortedPlayers
    .map((p, i) => `
      <div style="padding: 4px; ${p.isCzar ? 'color: var(--cyan); font-weight: bold;' : ''}">
        ${i + 1}. ${p.username} - ${p.score} ${p.isCzar ? '👑' : ''}
      </div>
    `).join('');
  
  const me = d.players.find(p => p.id === socket.id);
  if (!me) return;
  
  isCzar = me.isCzar;
  hand = me.hand;
  
  document.getElementById('blackCard').innerHTML = 
    `<div class="card blackCard" style="color: #fff !important;">${d.blackCard}</div>`;
  
  const allDone = d.submissions.length >= d.players.filter(p => !p.isCzar).length;
  
  document.getElementById('table').innerHTML = d.submissions.map(s => {
    const clickable = isCzar && allDone;
    return `<div class="card whiteCard ${clickable ? 'clickable' : ''}" style="color: #000 !important;"
      ${clickable ? `onclick="pickCard('${s.playerId}')"` : ''}>
      ${s.card}
    </div>`;
  }).join('');
  
  if (!isCzar && !me.hasSubmitted) {
    document.getElementById('hand').innerHTML = hand.map(c => 
      `<div class="card whiteCard clickable" style="color: #000 !important;" onclick="playCard('${c.replace(/'/g, "\\'")}')">
        ${c === '__BLANK__' ? '✏️ (Write Your Own)' : c}
      </div>`
    ).join('');
  } else {
    document.getElementById('hand').innerHTML = '';
  }
  
  document.getElementById('adminPlayers').innerHTML = d.players
    .map(p => `${p.username} – ${p.score} pts ${p.isCzar ? '👑' : ''}`)
    .join('<br>');
});

async function playCard(card) {
  const displayText = card === '__BLANK__' ? 'Write your own card' : card;
  const confirmed = await showModal(
    '🃏 Play This Card?',
    displayText,
    { showCancel: true, confirmText: 'Play Card', cancelText: 'Cancel' }
  );
  
  if (!confirmed) return;
  
  if (card === '__BLANK__') {
    const custom = await showModal(
      '✏️ Custom Card',
      'Enter your custom card text:',
      { input: true, inputPlaceholder: 'Your funny response...', showCancel: true }
    );
    if (custom && custom.trim()) {
      socket.emit('submit', card, custom.trim());
    }
  } else {
    socket.emit('submit', card);
  }
}

async function pickCard(playerId) {
  const winner = allPlayers.find(p => p.id === playerId);
  if (!winner) return;
  
  const confirmed = await showModal(
    '👑 Award Point?',
    `Give the point to ${winner.username}?`,
    { showCancel: true, confirmText: 'Award Point', cancelText: 'Cancel' }
  );
  
  if (confirmed) {
    socket.emit('pick', playerId);
  }
}

socket.on('announce', (username) => {
  showOverlay(`🎉 ${username} won this round! 🎉`);
});

socket.on('final-win', (username) => {
  showOverlay(`🏆 ${username} WON THE GAME! 🏆`);
  confetti({
    particleCount: 200,
    spread: 120,
    origin: { y: 0.6 },
    colors: ['#00fff7', '#ff8a00', '#bf00ff']
  });
});
