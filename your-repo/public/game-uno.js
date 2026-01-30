// UNO game logic
let myHand = [];
let currentPlayerTurn = false;

socket.on('uno-state', (d) => {
  currentGameType = 'uno';
  
  if (!d.started) {
    show('lobby');
    document.getElementById('players').innerHTML = d.players
      .map(p => `<div style="padding: 8px;">${p.username} ⏳</div>`)
      .join('');
    return;
  }
  
  show('gameUNO');
  
  const me = d.players.find(p => p.id === socket.id);
  currentPlayerTurn = (d.currentPlayer === socket.id);
  
  document.getElementById('unoPlayers').innerHTML = d.players.map(p => {
    const isCurrent = (p.id === d.currentPlayer);
    return `
      <div class="uno-player ${isCurrent ? 'current' : ''}">
        <h4>${p.username}${p.calledUno ? ' 🔥' : ''}</h4>
        <p>🎴 ${p.handCount} cards</p>
        ${p.handCount === 1 && !p.calledUno ? `<button onclick="challengeUno('${p.id}')" class="btn-danger" style="font-size: 0.8em; padding: 5px 10px;">Challenge!</button>` : ''}
      </div>
    `;
  }).join('');
  
  if (d.currentCard) {
    const color = d.currentCard.activeColor || d.currentCard.color;
    document.getElementById('currentCard').className = `uno-card ${color}`;
    document.getElementById('currentCard').textContent = getCardDisplay(d.currentCard);
  }
  
  document.getElementById('deckCount').textContent = d.deckCount;
  
  if (me && me.hand) {
    myHand = me.hand;
    renderUnoHand(d.currentCard);
  }
  
  document.getElementById('callUnoBtn').disabled = !currentPlayerTurn;
});

function renderUnoHand(topCard) {
  const handEl = document.getElementById('unoHand');
  handEl.innerHTML = myHand.map((card, idx) => {
    const canPlay = currentPlayerTurn && canPlayCard(card, topCard);
    const color = card.activeColor || card.color;
    return `
      <div class="uno-card-small ${color} ${canPlay ? '' : 'unplayable'}" 
           onclick="${canPlay ? `playUnoCard(${idx})` : ''}">
        ${getCardDisplay(card)}
      </div>
    `;
  }).join('');
}

function canPlayCard(card, topCard) {
  if (card.color === 'wild') return true;
  if (card.color === topCard.color || card.color === topCard.activeColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function getCardDisplay(card) {
  if (card.value === 'wild') return '🌈';
  if (card.value === 'wild-draw4') return '+4';
  if (card.value === 'draw2') return '+2';
  if (card.value === 'skip') return '🚫';
  if (card.value === 'reverse') return '⟲';
  return card.value;
}

async function playUnoCard(cardIndex) {
  const card = myHand[cardIndex];
  
  if (card.color === 'wild') {
    const chosenColor = await showModal(
      '🌈 Choose Color',
      'Pick a color for your wild card:',
      { colorPicker: true }
    );
    
    if (!chosenColor) return;
    
    socket.emit('uno-play-card', { cardIndex, chosenColor });
  } else {
    socket.emit('uno-play-card', { cardIndex });
  }
}

function drawCard() {
  if (!currentPlayerTurn) return;
  socket.emit('uno-draw-card');
}

function callUno() {
  socket.emit('uno-call-uno');
}

function challengeUno(playerId) {
  socket.emit('uno-challenge', playerId);
}

socket.on('uno-winner', (username) => {
  showOverlay(`🏆 ${username} WON UNO! 🏆`);
  confetti({
    particleCount: 300,
    spread: 160,
    origin: { y: 0.5 },
    colors: ['#ff3333', '#3366ff', '#33cc33', '#ffcc00']
  });
});

socket.on('uno-called', (username) => {
  showOverlay(`🔥 ${username} called UNO!`);
});

socket.on('uno-penalty', (data) => {
  showOverlay(`⚠️ ${data.username}: ${data.reason}`);
});

socket.on('uno-error', (msg) => {
  showModal('❌ Error', msg);
});

socket.on('uno-can-play-drawn', () => {
  showModal('✅ Play Card?', 'You can play the card you just drew!');
});
