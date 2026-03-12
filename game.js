// ============================================================
// FOOTBALL CARDS — Game Logic
// ============================================================

// --- Constants ---
const SUITS = ['♠', '♣', '♥', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 15, Q: 20, K: 25 };
const WIN_SCORE = 21;
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

// --- Game State ---
const state = {
  phase: 'coin-flip',   // coin-flip, kickoff-kicker, kickoff-returner, play, touchdown, gameover
  hands: [[], []],       // hands[0] = P1, hands[1] = P2
  scores: [0, 0],
  possession: 0,         // 0 or 1 — who has the ball (offense)
  ballYard: 50,          // 0 = P1 end zone, 100 = P2 end zone
  down: 1,
  yardsToGo: 10,
  firstDownMarker: 60,
  kickoffWho: null,      // which player is kicking
  kickoffCards: [],       // selected kickoff cards
  lastPlay: null,
};

// --- Build & Shuffle Deck ---
function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCards() {
  const deck = makeDeck();
  state.hands[0] = deck.slice(0, 26);
  state.hands[1] = deck.slice(26);
}

// --- DOM Helpers ---
const $ = (id) => document.getElementById(id);

function log(text, type = 'info') {
  const entry = document.createElement('div');
  entry.className = 'log-entry ' + type;
  entry.textContent = text;
  const container = $('log-entries');
  container.insertBefore(entry, container.firstChild);
}

function updateScoreboard() {
  $('p1-score').textContent = state.scores[0];
  $('p2-score').textContent = state.scores[1];
  $('p1-cards-left').textContent = state.hands[0].length;
  $('p2-cards-left').textContent = state.hands[1].length;

  const offName = `Player ${state.possession + 1}`;
  const dir = state.possession === 0 ? '➡️' : '⬅️';
  $('possession-arrow').textContent = `🏈 ${offName} ${dir}`;

  $('down-info').textContent = `${downLabel(state.down)} & ${state.yardsToGo}`;
  $('yard-info').textContent = `Ball on ${yardLineText(state.ballYard)}`;
}

function yardLineText(yard) {
  // yard 0 = P1 end zone, 100 = P2 end zone
  if (yard <= 0) return 'P1 End Zone';
  if (yard >= 100) return 'P2 End Zone';
  if (yard === 50) return '50';
  if (yard < 50) return `P1 ${yard}`;
  return `P2 ${100 - yard}`;
}

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
function drawField() {
  const canvas = $('field');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // Turf
  ctx.fillStyle = '#2e7d32';
  ctx.fillRect(0, 0, W, H);

  // End zones
  const ezW = W * 0.1; // 10% each side
  // P1 end zone (left)
  ctx.fillStyle = '#1565c0';
  ctx.fillRect(0, 0, ezW, H);
  // P2 end zone (right)
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

  // Yard lines (every 10 yards)
  const fieldW = W - 2 * ezW; // playable field width in pixels
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

    // Label
    const label = yd <= 50 ? yd : 100 - yd;
    ctx.fillText(label, x, 16);
    ctx.fillText(label, x, H - 8);
  }

  // Hash marks (every 5 yards)
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
  if (state.phase === 'play') {
    const fdX = ezW + (state.firstDownMarker / FIELD_LENGTH) * fieldW;
    ctx.strokeStyle = '#ffd54f';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(fdX, 0);
    ctx.lineTo(fdX, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Ball marker
  const ballX = ezW + (state.ballYard / FIELD_LENGTH) * fieldW;
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏈', ballX, H / 2);

  // Scrimmage line
  ctx.strokeStyle = '#42a5f5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ballX, 0);
  ctx.lineTo(ballX, H);
  ctx.stroke();
}

// --- Coin Flip ---
function handleAction() {
  if (state.phase === 'coin-flip') {
    doCoinFlip();
  } else if (state.phase === 'play') {
    doPlay();
  }
}

function doCoinFlip() {
  $('action-btn').disabled = true;
  $('coin-modal').classList.remove('hidden');
  const coinEl = $('coin');
  coinEl.classList.add('flipping');

  setTimeout(() => {
    coinEl.classList.remove('flipping');
    const winner = Math.random() < 0.5 ? 0 : 1;
    // Winner receives — the other player kicks
    state.possession = winner;
    state.kickoffWho = winner === 0 ? 1 : 0;
    $('coin-result').textContent = `Player ${winner + 1} wins the toss and receives!`;
    $('coin-btn').classList.remove('hidden');
    log(`Coin flip: Player ${winner + 1} wins, receives the kickoff.`, 'info');
  }, 1100);
}

function startGame() {
  $('coin-modal').classList.add('hidden');
  dealCards();
  beginKickoff();
}

// --- Kickoff ---
function beginKickoff() {
  state.phase = 'kickoff-kicker';
  state.kickoffCards = [];
  $('action-btn').disabled = true;
  $('action-btn').textContent = 'Waiting for kickoff...';

  const kicker = state.kickoffWho;
  $('kickoff-title').textContent = `Player ${kicker + 1} — Kickoff!`;
  $('kickoff-instructions').textContent = 'Pick 3 cards of different ranks for your kick distance.';
  renderKickoffHand(kicker);
  $('kickoff-modal').classList.remove('hidden');
}

function renderKickoffHand(playerIdx) {
  const hand = state.hands[playerIdx];
  const container = $('kickoff-hand');
  container.innerHTML = '';
  state.kickoffCards = [];
  updateKickoffUI();

  // Sort hand for display
  const sorted = hand.map((c, i) => ({ ...c, idx: i }));
  sorted.sort((a, b) => {
    const av = cardValue(a);
    const bv = cardValue(b);
    return av - bv || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  });

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
  const idx = state.kickoffCards.findIndex(c => c.idx === card.idx);
  if (idx >= 0) {
    // Deselect
    state.kickoffCards.splice(idx, 1);
    div.classList.remove('selected');
    refreshKickoffDisabled();
    updateKickoffUI();
    return;
  }
  if (state.kickoffCards.length >= 3) return;

  // Check different rank
  if (state.kickoffCards.some(c => c.rank === card.rank)) {
    return; // same rank not allowed
  }

  state.kickoffCards.push(card);
  div.classList.add('selected');
  refreshKickoffDisabled();
  updateKickoffUI();
}

function refreshKickoffDisabled() {
  const selectedRanks = state.kickoffCards.map(c => c.rank);
  const allCards = $('kickoff-hand').querySelectorAll('.mini-card');
  for (const el of allCards) {
    if (el.classList.contains('selected')) {
      el.classList.remove('disabled');
      continue;
    }
    if (state.kickoffCards.length >= 3 || (selectedRanks.includes(el.dataset.rank))) {
      el.classList.add('disabled');
    } else {
      el.classList.remove('disabled');
    }
  }
}

function updateKickoffUI() {
  const total = state.kickoffCards.reduce((s, c) => s + cardValue(c), 0);
  $('kickoff-selected-cards').textContent = state.kickoffCards.map(c => cardLabel(c)).join(' + ');
  $('kickoff-total').textContent = total;
  $('kickoff-confirm').disabled = state.kickoffCards.length !== 3;
  $('kickoff-confirm').textContent = state.kickoffCards.length === 3
    ? `Confirm (${total} yards)`
    : `Confirm (pick ${3 - state.kickoffCards.length} more)`;
}

function confirmKickoff() {
  if (state.phase === 'kickoff-kicker') {
    // Remove cards from kicker's hand
    const kicker = state.kickoffWho;
    const removeIdxs = state.kickoffCards.map(c => c.idx).sort((a, b) => b - a);
    for (const i of removeIdxs) {
      state.hands[kicker].splice(i, 1);
    }
    const kickTotal = state.kickoffCards.reduce((s, c) => s + cardValue(c), 0);

    // Now returner picks
    state.phase = 'kickoff-returner';
    state.kickoffKickTotal = kickTotal;
    state.kickoffCards = [];
    const returner = state.possession;
    $('kickoff-title').textContent = `Player ${returner + 1} — Return!`;
    $('kickoff-instructions').textContent = `Kick was ${kickTotal} yards. Pick 3 cards of different ranks for your return.`;
    renderKickoffHand(returner);
    log(`Player ${kicker + 1} kicks for ${kickTotal} yards.`, 'info');

  } else if (state.phase === 'kickoff-returner') {
    const returner = state.possession;
    const removeIdxs = state.kickoffCards.map(c => c.idx).sort((a, b) => b - a);
    for (const i of removeIdxs) {
      state.hands[returner].splice(i, 1);
    }
    const returnTotal = state.kickoffCards.reduce((s, c) => s + cardValue(c), 0);
    const kickTotal = state.kickoffKickTotal;

    // Check fumble — totals match
    const fumble = (kickTotal === returnTotal);

    // Calculate ball position
    // Kicker kicks toward returner's end zone
    // If P1 kicks to P2: ball lands at (100 - kickTotal), return brings it to (100 - kickTotal + returnTotal) — capped 0-100
    // If P2 kicks to P1: ball lands at kickTotal, return brings it to (kickTotal - returnTotal) — capped 0-100
    let ballLand, ballAfterReturn;
    if (state.kickoffWho === 0) {
      // P1 kicks toward P2 end zone (yard 100)
      ballLand = Math.min(100, Math.max(0, 100 - kickTotal));
      ballAfterReturn = Math.min(100, Math.max(0, ballLand + returnTotal));
    } else {
      // P2 kicks toward P1 end zone (yard 0)
      ballLand = Math.min(100, Math.max(0, kickTotal));
      ballAfterReturn = Math.min(100, Math.max(0, ballLand - returnTotal));
    }

    if (fumble) {
      // Kicking team recovers at landing spot
      state.possession = state.kickoffWho;
      state.ballYard = ballLand;
      log(`Player ${returner + 1} returns for ${returnTotal} yards — FUMBLE! Totals match (${kickTotal})! Kicking team recovers!`, 'turnover');
    } else {
      state.ballYard = ballAfterReturn;
      log(`Player ${returner + 1} returns for ${returnTotal} yards. Ball at ${yardLineText(state.ballYard)}.`, 'info');
    }

    // Check for return TD
    const offenseGoal = state.possession === 0 ? 100 : 0;
    if ((state.possession === 0 && state.ballYard >= 100) || (state.possession === 1 && state.ballYard <= 0)) {
      scoreTouchdown();
      $('kickoff-modal').classList.add('hidden');
      return;
    }

    // Start normal play
    state.down = 1;
    state.yardsToGo = 10;
    setFirstDownMarker();
    state.phase = 'play';
    $('kickoff-modal').classList.add('hidden');
    $('action-btn').disabled = false;
    $('action-btn').textContent = 'Play Card';
    updateScoreboard();
    drawField();
  }
}

function setFirstDownMarker() {
  if (state.possession === 0) {
    state.firstDownMarker = Math.min(100, state.ballYard + 10);
  } else {
    state.firstDownMarker = Math.max(0, state.ballYard - 10);
  }
  state.yardsToGo = 10;
}

// --- Main Play ---
function doPlay() {
  if (state.hands[0].length === 0 || state.hands[1].length === 0) {
    endGame();
    return;
  }

  $('action-btn').disabled = true;

  // Each player plays top card of their (shuffled) hand
  const p1Card = state.hands[0].pop();
  const p2Card = state.hands[1].pop();

  // Show face down first, then reveal
  setCardFaceDown('p1-card');
  setCardFaceDown('p2-card');

  setTimeout(() => {
    showCard('p1-card', p1Card);
    showCard('p2-card', p2Card);
    resolvePlay(p1Card, p2Card);
  }, 400);
}

function resolvePlay(p1Card, p2Card) {
  const offense = state.possession;
  const offCard = offense === 0 ? p1Card : p2Card;
  const defCard = offense === 0 ? p2Card : p1Card;

  // Check same rank — INTERCEPTION
  if (p1Card.rank === p2Card.rank) {
    log(`${cardLabel(p1Card)} vs ${cardLabel(p2Card)} — SAME RANK! INTERCEPTION!`, 'turnover');
    state.possession = 1 - state.possession;
    state.down = 1;
    setFirstDownMarker();
    setTimeout(() => {
      updateScoreboard();
      drawField();
      $('action-btn').disabled = false;
    }, 800);
    return;
  }

  // Check same color — NO GAIN
  if (cardColor(p1Card) === cardColor(p2Card)) {
    log(`${cardLabel(p1Card)} vs ${cardLabel(p2Card)} — Same color, no gain. ${downLabel(state.down)} down.`, 'no-gain');
    advanceDown(0);
    return;
  }

  // Opposite color — gain yards equal to offense card value
  const yards = cardValue(offCard);
  log(`${cardLabel(p1Card)} vs ${cardLabel(p2Card)} — Opposite colors! Player ${offense + 1} gains ${yards} yards!`, 'gain');
  advanceDown(yards);
}

function advanceDown(yardsGained) {
  // Move ball
  if (state.possession === 0) {
    state.ballYard += yardsGained;
  } else {
    state.ballYard -= yardsGained;
  }

  // Check touchdown
  if ((state.possession === 0 && state.ballYard >= 100) || (state.possession === 1 && state.ballYard <= 0)) {
    setTimeout(() => {
      scoreTouchdown();
    }, 600);
    return;
  }

  // Clamp
  state.ballYard = Math.max(0, Math.min(100, state.ballYard));

  // Check first down
  let madeFirstDown = false;
  if (state.possession === 0 && state.ballYard >= state.firstDownMarker) {
    madeFirstDown = true;
  } else if (state.possession === 1 && state.ballYard <= state.firstDownMarker) {
    madeFirstDown = true;
  }

  if (madeFirstDown) {
    state.down = 1;
    setFirstDownMarker();
    log(`First down! Player ${state.possession + 1} at ${yardLineText(state.ballYard)}.`, 'info');
  } else {
    state.down++;
    if (yardsGained > 0) {
      state.yardsToGo -= yardsGained;
      if (state.yardsToGo < 0) state.yardsToGo = 0;
    }
    if (state.down > 4) {
      // Turnover on downs
      log(`Turnover on downs! Player ${(1 - state.possession) + 1} takes over.`, 'turnover');
      state.possession = 1 - state.possession;
      state.down = 1;
      setFirstDownMarker();
    }
  }

  setTimeout(() => {
    updateScoreboard();
    drawField();
    $('action-btn').disabled = false;
    checkCardsOut();
  }, 600);
}

function scoreTouchdown() {
  state.ballYard = state.possession === 0 ? 100 : 0;
  state.scores[state.possession] += 7;
  log(`🏈 TOUCHDOWN Player ${state.possession + 1}! (+7 points)`, 'touchdown');

  updateScoreboard();
  drawField();

  // Check win
  if (state.scores[state.possession] >= WIN_SCORE) {
    endGame();
    return;
  }

  // Other team kicks off
  state.kickoffWho = state.possession;
  state.possession = 1 - state.possession;

  setTimeout(() => {
    beginKickoff();
  }, 1500);
}

function checkCardsOut() {
  if (state.hands[0].length === 0 || state.hands[1].length === 0) {
    endGame();
  }
}

function endGame() {
  state.phase = 'gameover';
  $('action-btn').disabled = true;

  let winnerText;
  if (state.scores[0] > state.scores[1]) {
    winnerText = 'Player 1 Wins!';
  } else if (state.scores[1] > state.scores[0]) {
    winnerText = 'Player 2 Wins!';
  } else {
    winnerText = "It's a Tie!";
  }

  $('gameover-title').textContent = winnerText;
  $('gameover-text').textContent = `Final Score: Player 1 ${state.scores[0]} — Player 2 ${state.scores[1]}`;
  $('gameover-modal').classList.remove('hidden');
  log(`GAME OVER: ${winnerText} (${state.scores[0]} - ${state.scores[1]})`, 'info');
}

// --- Init ---
function init() {
  updateScoreboard();
  drawField();
  $('action-btn').textContent = 'Flip Coin';
  log('Welcome to Football Cards! Flip the coin to start.', 'info');
}

init();
