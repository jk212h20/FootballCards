// ============================================================
// FOOTBALL CARDS — Client (Socket.io)
// ============================================================
const socket = io();

// --- Constants ---
const SUITS = ['♠', '♣', '♥', '♦'];
const RANK_VALUES = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 15, Q: 20, K: 25 };
const FIELD_LENGTH = 100;

function isRed(suit) { return suit === '♥' || suit === '♦'; }
function cardColor(card) { return isRed(card.suit) ? 'red' : 'black'; }
function cardValue(card) { return RANK_VALUES[card.rank]; }
function cardLabel(card) { return card.rank + card.suit; }
function downLabel(d) {
  if (d === 1) return '1st';
  if (d === 2) return '2nd';
  if (d === 3) return '3rd';
  return '4th';
}

// --- Client State ---
let myIndex = -1; // 0 or 1
let gameState = {};
let kickoffCards = [];
let iSubmittedPlay = false;

// --- DOM ---
const $ = (id) => document.getElementById(id);

// --- Lobby ---
function findGame() {
  $('find-game-btn').disabled = true;
  $('find-game-btn').textContent = 'Searching...';
  $('lobby-status').classList.remove('hidden');
  $('lobby-status').textContent = 'Looking for an opponent...';
  socket.emit('find-game');
}

socket.on('waiting', (data) => {
  $('lobby-status').textContent = data.message;
});

socket.on('game-start', (data) => {
  myIndex = data.playerIndex;
  $('lobby').classList.add('hidden');
  $('game-screen').classList.remove('hidden');

  // Label yourself
  if (myIndex === 0) {
    $('p1-label').textContent = 'You (P1)';
    $('p2-label').textContent = 'Opponent (P2)';
  } else {
    $('p1-label').textContent = 'Opponent (P1)';
    $('p2-label').textContent = 'You (P2)';
  }

  log('Matched! Game starting...', 'info');
  drawField();
});

// --- Coin Flip ---
socket.on('coin-flip', (data) => {
  $('coin-modal').classList.remove('hidden');
  const coinEl = $('coin');
  coinEl.classList.add('flipping');

  setTimeout(() => {
    coinEl.classList.remove('flipping');
    const youWin = data.winner === myIndex;
    $('coin-result').textContent = youWin
      ? 'You win the toss and receive!'
      : 'Opponent wins the toss and receives!';
  }, 1100);

  // Auto-close after delay
  setTimeout(() => {
    $('coin-modal').classList.add('hidden');
  }, 3000);
});

// --- Kickoff (simultaneous) ---
let kickoffLocked = false;

socket.on('kickoff-pick', (data) => {
  kickoffLocked = false;
  $('waiting-modal').classList.add('hidden');
  $('kickoff-modal').classList.remove('hidden');

  if (data.role === 'kicker') {
    $('kickoff-title').textContent = 'Your Kickoff!';
    $('kickoff-instructions').textContent = 'Pick 3 cards of different ranks for your kick distance.';
  } else {
    $('kickoff-title').textContent = 'Return the Kick!';
    $('kickoff-instructions').textContent = 'Pick 3 cards of different ranks for your return distance.';
  }

  // Reset opponent status
  $('kickoff-opponent-status').textContent = '';

  renderKickoffHand(data.hand);
});

socket.on('kickoff-wait', (data) => {
  // Don't hide the kickoff modal — just show waiting overlay within it
  kickoffLocked = true;
  $('kickoff-confirm').disabled = true;
  $('kickoff-confirm').textContent = 'Waiting for opponent...';
});

socket.on('opponent-kickoff-ready', () => {
  $('kickoff-opponent-status').textContent = '✓ Opponent has locked in cards';
});

socket.on('kickoff-result', () => {
  $('kickoff-modal').classList.add('hidden');
  $('waiting-modal').classList.add('hidden');
});

function renderKickoffHand(hand) {
  const container = $('kickoff-hand');
  container.innerHTML = '';
  kickoffCards = [];
  updateKickoffUI();

  const sorted = hand.map((c, i) => ({ ...c, idx: i }));
  sorted.sort((a, b) => cardValue(a) - cardValue(b) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));

  for (const card of sorted) {
    const div = document.createElement('div');
    div.className = `mini-card ${cardColor(card)}`;
    div.innerHTML = `<span class="mc-rank">${card.rank}</span><span class="mc-suit">${card.suit}</span>`;
    div.dataset.idx = card.idx;
    div.dataset.rank = card.rank;
    div.onclick = () => toggleKickoffCard(card, div);
    container.appendChild(div);
  }
}

function toggleKickoffCard(card, div) {
  const idx = kickoffCards.findIndex(c => c.idx === card.idx);
  if (idx >= 0) {
    kickoffCards.splice(idx, 1);
    div.classList.remove('selected');
    refreshKickoffDisabled();
    updateKickoffUI();
    return;
  }
  if (kickoffCards.length >= 3) return;
  if (kickoffCards.some(c => c.rank === card.rank)) return;

  kickoffCards.push(card);
  div.classList.add('selected');
  refreshKickoffDisabled();
  updateKickoffUI();
}

function refreshKickoffDisabled() {
  const selectedRanks = kickoffCards.map(c => c.rank);
  const allCards = $('kickoff-hand').querySelectorAll('.mini-card');
  for (const el of allCards) {
    if (el.classList.contains('selected')) {
      el.classList.remove('disabled');
      continue;
    }
    if (kickoffCards.length >= 3 || selectedRanks.includes(el.dataset.rank)) {
      el.classList.add('disabled');
    } else {
      el.classList.remove('disabled');
    }
  }
}

function updateKickoffUI() {
  const total = kickoffCards.reduce((s, c) => s + cardValue(c), 0);
  $('kickoff-selected-cards').textContent = kickoffCards.map(c => cardLabel(c)).join(' + ');
  $('kickoff-total').textContent = total;
  $('kickoff-confirm').disabled = kickoffCards.length !== 3;
  $('kickoff-confirm').textContent = kickoffCards.length === 3
    ? `Confirm (${total} yards)`
    : `Confirm (pick ${3 - kickoffCards.length} more)`;
}

function confirmKickoff() {
  const indices = kickoffCards.map(c => c.idx);
  socket.emit('kickoff-select', { cardIndices: indices });
  $('kickoff-modal').classList.add('hidden');
  $('waiting-modal').classList.remove('hidden');
  $('waiting-message').textContent = 'Waiting for opponent...';
}

// --- Normal Play ---
let myHand = []; // current hand from server

socket.on('phase-change', (data) => {
  if (data.phase === 'play') {
    $('waiting-modal').classList.add('hidden');
    $('kickoff-modal').classList.add('hidden');
    enableHandSelection();
  }
});

function enableHandSelection() {
  iSubmittedPlay = false;
  $('action-status').textContent = 'Pick a card to play';
  renderMyHand();
}

function renderMyHand() {
  const container = $('my-hand');
  container.innerHTML = '';

  if (iSubmittedPlay) return; // don't render if already submitted

  // Sort hand by value then suit for consistent display
  const sorted = myHand.map((c, i) => ({ ...c, idx: i }));
  sorted.sort((a, b) => cardValue(a) - cardValue(b) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));

  $('hand-count').textContent = `(${myHand.length})`;

  for (const card of sorted) {
    const div = document.createElement('div');
    div.className = `mini-card ${cardColor(card)}`;
    div.innerHTML = `<span class="mc-rank">${card.rank}</span><span class="mc-suit">${card.suit}</span>`;
    div.onclick = () => playCard(card.idx);
    container.appendChild(div);
  }
}

function playCard(cardIndex) {
  if (iSubmittedPlay) return;
  iSubmittedPlay = true;

  // Highlight the selected card and disable others
  const container = $('my-hand');
  const allCards = container.querySelectorAll('.mini-card');
  allCards.forEach(el => el.classList.add('disabled'));

  // Find and highlight the selected one
  const selectedCard = myHand[cardIndex];
  allCards.forEach(el => {
    const rank = el.querySelector('.mc-rank').textContent;
    const suit = el.querySelector('.mc-suit').textContent;
    if (rank === selectedCard.rank && suit === selectedCard.suit && !el.classList.contains('played')) {
      el.classList.remove('disabled');
      el.classList.add('selected');
      el.classList.add('played');
    }
  });

  $('action-status').textContent = `Played ${cardLabel(selectedCard)} — waiting for opponent...`;
  socket.emit('play-card', { cardIndex });

  // Show face-down cards
  setCardFaceDown('p1-card');
  setCardFaceDown('p2-card');
}

socket.on('opponent-ready', () => {
  $('action-status').textContent = 'Opponent is ready!';
});

socket.on('cards-revealed', (data) => {
  showCard('p1-card', data.p1Card);
  showCard('p2-card', data.p2Card);
});

socket.on('play-resolved', () => {
  setTimeout(() => {
    setCardFaceDown('p1-card');
    setCardFaceDown('p2-card');
    enableHandSelection();
  }, 1200);
});

socket.on('touchdown', () => {
  // Modals handled by kickoff-pick / kickoff-wait
  // Disable hand during touchdown sequence
  iSubmittedPlay = true;
  $('my-hand').innerHTML = '';
  $('action-status').textContent = '🏈 TOUCHDOWN!';
});

// --- Game State Updates ---
socket.on('game-state', (state) => {
  gameState = state;
  $('p1-score').textContent = state.scores[0];
  $('p2-score').textContent = state.scores[1];
  $('p1-cards-left').textContent = state.cardsLeft[0];
  $('p2-cards-left').textContent = state.cardsLeft[1];

  // Update local hand from server
  if (state.myHand) {
    myHand = state.myHand;
    $('hand-count').textContent = `(${myHand.length})`;
  }

  const offName = `Player ${state.possession + 1}`;
  const dir = state.possession === 0 ? '➡️' : '⬅️';
  $('possession-arrow').textContent = `🏈 ${offName} ${dir}`;
  $('down-info').textContent = `${downLabel(state.down)} & ${state.yardsToGo}`;
  $('yard-info').textContent = `Ball on ${yardLineText(state.ballYard)}`;

  drawField();
});

// --- Game Over ---
socket.on('game-over', (data) => {
  let title, text;
  if (data.forfeit) {
    title = 'You Win!';
    text = 'Opponent disconnected.';
  } else if (data.winner === myIndex) {
    title = 'You Win! 🏆';
    text = `Final Score: ${data.scores[0]} — ${data.scores[1]}`;
  } else if (data.winner === -1) {
    title = "It's a Tie!";
    text = `Final Score: ${data.scores[0]} — ${data.scores[1]}`;
  } else {
    title = 'You Lose 😞';
    text = `Final Score: ${data.scores[0]} — ${data.scores[1]}`;
  }
  $('gameover-title').textContent = title;
  $('gameover-text').textContent = text;
  $('gameover-modal').classList.remove('hidden');
  // Disable hand on game over
  iSubmittedPlay = true;
  $('my-hand').innerHTML = '';
});

// --- Log ---
socket.on('log', (data) => {
  log(data.text, data.type);
});

function log(text, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = text;
  const container = $('log-entries');
  container.insertBefore(entry, container.firstChild);
}

// --- Card Display Helpers ---
function setCardFaceDown(elId) {
  const el = $(elId);
  el.className = 'card face-down';
  el.innerHTML = '🂠';
}

function showCard(elId, card) {
  const el = $(elId);
  const color = cardColor(card);
  el.className = `card face-up ${color} flip-in`;
  el.innerHTML = `<span class="card-rank">${card.rank}</span><span class="card-suit">${card.suit}</span>`;
}

// --- Field Drawing ---
function yardLineText(yard) {
  if (yard <= 0) return 'P1 End Zone';
  if (yard >= 100) return 'P2 End Zone';
  if (yard === 50) return '50';
  if (yard < 50) return `P1 ${yard}`;
  return `P2 ${100 - yard}`;
}

function drawField() {
  const canvas = $('field');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(0, 0, W, H);

  const ezW = W * 0.1;
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(0, 0, ezW, H);
  ctx.fillStyle = '#c62828';
  ctx.fillRect(W - ezW, 0, ezW, H);

  // End zone text
  ctx.save();
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffffff66';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.translate(ezW / 2, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('P1 END ZONE', 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(W - ezW / 2, H / 2);
  ctx.rotate(Math.PI / 2);
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = '#ffffff66';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('P2 END ZONE', 0, 0);
  ctx.restore();

  const fieldW = W - 2 * ezW;
  ctx.strokeStyle = '#ffffff55';
  ctx.lineWidth = 1;
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#ffffff55';
  ctx.textAlign = 'center';

  for (let yd = 10; yd <= 90; yd += 10) {
    const x = ezW + (yd / FIELD_LENGTH) * fieldW;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    const label = yd <= 50 ? yd : 100 - yd;
    ctx.fillText(label, x, 16);
    ctx.fillText(label, x, H - 8);
  }

  for (let yd = 5; yd <= 95; yd += 5) {
    if (yd % 10 === 0) continue;
    const x = ezW + (yd / FIELD_LENGTH) * fieldW;
    ctx.beginPath();
    ctx.moveTo(x, H * 0.33 - 4);
    ctx.lineTo(x, H * 0.33 + 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, H * 0.67 - 4);
    ctx.lineTo(x, H * 0.67 + 4);
    ctx.stroke();
  }

  // First down marker
  if (gameState.phase === 'play' && gameState.firstDownMarker != null) {
    const fdX = ezW + (gameState.firstDownMarker / FIELD_LENGTH) * fieldW;
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(fdX, 0);
    ctx.lineTo(fdX, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Ball
  const ballYard = gameState.ballYard != null ? gameState.ballYard : 50;
  const ballX = ezW + (ballYard / FIELD_LENGTH) * fieldW;
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏈', ballX, H / 2);

  ctx.strokeStyle = '#42a5f5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ballX, 0);
  ctx.lineTo(ballX, H);
  ctx.stroke();
}

// --- Init ---
drawField();
