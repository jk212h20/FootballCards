// ============================================================
// FOOTBALL CARDS — Server (Express + Socket.io)
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// --- Card Constants ---
const SUITS = ['♠', '♣', '♥', '♦'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 15, Q: 20, K: 25 };
const WIN_SCORE = 21;

function isRed(suit) { return suit === '♥' || suit === '♦'; }
function cardColor(card) { return isRed(card.suit) ? 'red' : 'black'; }
function cardValue(card) { return RANK_VALUES[card.rank]; }
function cardLabel(card) { return card.rank + card.suit; }

function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// --- Matchmaking ---
let waitingSocket = null;
const games = new Map(); // gameId -> game state
const playerGames = new Map(); // socketId -> gameId

function createGame(socket1, socket2) {
  const gameId = `game_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const deck = makeDeck();

  const game = {
    id: gameId,
    players: [socket1.id, socket2.id], // [P1, P2]
    sockets: [socket1, socket2],
    hands: [deck.slice(0, 26), deck.slice(26)],
    scores: [0, 0],
    possession: -1, // set by coin flip
    ballYard: 50,
    down: 1,
    yardsToGo: 10,
    firstDownMarker: 60,
    phase: 'coin-flip',
    kickoffWho: -1,
    kickoffKickTotal: 0,
    kickoffSubmitted: [null, null], // kickoff card selections
    playSubmitted: [false, false], // whether each player clicked play
  };

  games.set(gameId, game);
  playerGames.set(socket1.id, gameId);
  playerGames.set(socket2.id, gameId);

  socket1.join(gameId);
  socket2.join(gameId);

  // Tell each player their role
  socket1.emit('game-start', { playerIndex: 0, gameId });
  socket2.emit('game-start', { playerIndex: 1, gameId });

  // Coin flip
  setTimeout(() => doCoinFlip(game), 500);

  return game;
}

function getGame(socketId) {
  const gameId = playerGames.get(socketId);
  return gameId ? games.get(gameId) : null;
}

function playerIndex(game, socketId) {
  return game.players.indexOf(socketId);
}

function opponentIndex(game, socketId) {
  return 1 - playerIndex(game, socketId);
}

// --- Broadcast helpers ---
function broadcastState(game) {
  for (let i = 0; i < 2; i++) {
    const sock = game.sockets[i];
    if (sock && sock.connected) {
      sock.emit('game-state', {
        scores: game.scores,
        ballYard: game.ballYard,
        down: game.down,
        yardsToGo: game.yardsToGo,
        firstDownMarker: game.firstDownMarker,
        possession: game.possession,
        phase: game.phase,
        cardsLeft: [game.hands[0].length, game.hands[1].length],
        myCardsLeft: game.hands[i].length,
      });
    }
  }
}

function broadcastLog(game, text, type) {
  io.to(game.id).emit('log', { text, type });
}

// --- Coin Flip ---
function doCoinFlip(game) {
  const winner = Math.random() < 0.5 ? 0 : 1;
  game.possession = winner;
  game.kickoffWho = 1 - winner;
  game.phase = 'kickoff-kicker';

  io.to(game.id).emit('coin-flip', { winner });
  broadcastLog(game, `Coin flip: Player ${winner + 1} wins, receives the kickoff.`, 'info');

  // After a delay, start kickoff
  setTimeout(() => beginKickoff(game), 1500);
}

// --- Kickoff (simultaneous) ---
function beginKickoff(game) {
  game.phase = 'kickoff';
  game.kickoffSubmitted = [null, null]; // stores { cardIndices, cards, total } per player

  const kicker = game.kickoffWho;
  const returner = 1 - kicker;

  // Both players pick simultaneously
  for (let i = 0; i < 2; i++) {
    const sock = game.sockets[i];
    if (sock && sock.connected) {
      sock.emit('kickoff-pick', {
        role: i === kicker ? 'kicker' : 'returner',
        hand: game.hands[i],
      });
    }
  }

  broadcastState(game);
}

function handleKickoffSelect(game, pIdx, cardIndices) {
  if (game.phase !== 'kickoff') return;
  if (game.kickoffSubmitted[pIdx]) return; // already submitted

  // Validate: 3 cards, different ranks, valid indices
  if (cardIndices.length !== 3) return;
  const hand = game.hands[pIdx];
  const cards = cardIndices.map(i => hand[i]).filter(Boolean);
  if (cards.length !== 3) return;
  const ranks = cards.map(c => c.rank);
  if (new Set(ranks).size !== 3) return;

  const total = cards.reduce((s, c) => s + cardValue(c), 0);
  game.kickoffSubmitted[pIdx] = { cardIndices, cards, total };

  // Notify opponent
  const oppSock = game.sockets[1 - pIdx];
  if (oppSock && oppSock.connected) {
    oppSock.emit('opponent-kickoff-ready');
  }
  // Tell submitter to wait
  const mySock = game.sockets[pIdx];
  if (mySock && mySock.connected) {
    mySock.emit('kickoff-wait', { message: 'Cards locked in! Waiting for opponent...' });
  }

  // If both submitted, resolve
  if (game.kickoffSubmitted[0] && game.kickoffSubmitted[1]) {
    resolveKickoff(game);
  }
}

function resolveKickoff(game) {
  const kicker = game.kickoffWho;
  const returner = 1 - kicker;
  const kickData = game.kickoffSubmitted[kicker];
  const returnData = game.kickoffSubmitted[returner];

  // Remove cards from both hands (sort descending to avoid index shift)
  for (let i = 0; i < 2; i++) {
    const data = game.kickoffSubmitted[i];
    const sorted = [...data.cardIndices].sort((a, b) => b - a);
    for (const idx of sorted) game.hands[i].splice(idx, 1);
  }

  const kickTotal = kickData.total;
  const returnTotal = returnData.total;
  const fumble = (kickTotal === returnTotal);

  broadcastLog(game, `Player ${kicker + 1} kicks for ${kickTotal} yards.`, 'info');

  // Calculate ball position
  let ballLand, ballAfterReturn;
  if (kicker === 0) {
    ballLand = Math.min(100, Math.max(0, 100 - kickTotal));
    ballAfterReturn = Math.min(100, Math.max(0, ballLand + returnTotal));
  } else {
    ballLand = Math.min(100, Math.max(0, kickTotal));
    ballAfterReturn = Math.min(100, Math.max(0, ballLand - returnTotal));
  }

  if (fumble) {
    game.possession = kicker;
    game.ballYard = ballLand;
    broadcastLog(game, `Player ${returner + 1} returns for ${returnTotal} yards — FUMBLE! Totals match (${kickTotal})! Kicking team recovers!`, 'turnover');
  } else {
    game.ballYard = ballAfterReturn;
    broadcastLog(game, `Player ${returner + 1} returns for ${returnTotal} yards. Ball at ${yardLineText(game.ballYard)}.`, 'info');
  }

  io.to(game.id).emit('kickoff-result', {
    kickTotal,
    returnTotal,
    fumble,
    ballYard: game.ballYard,
    possession: game.possession,
  });

  // Check return TD
  if ((game.possession === 0 && game.ballYard >= 100) || (game.possession === 1 && game.ballYard <= 0)) {
    setTimeout(() => scoreTouchdown(game), 800);
    return;
  }

  // Start play
  game.down = 1;
  game.yardsToGo = 10;
  setFirstDownMarker(game);
  game.phase = 'play';
  game.playSubmitted = [false, false];
  broadcastState(game);

  io.to(game.id).emit('phase-change', { phase: 'play' });
}

function setFirstDownMarker(game) {
  if (game.possession === 0) {
    game.firstDownMarker = Math.min(100, game.ballYard + 10);
  } else {
    game.firstDownMarker = Math.max(0, game.ballYard - 10);
  }
  game.yardsToGo = 10;
}

// --- Normal Play ---
function handlePlayCard(game, pIdx) {
  if (game.phase !== 'play') return;
  if (game.playSubmitted[pIdx]) return;

  game.playSubmitted[pIdx] = true;

  // Tell opponent this player is ready
  const oppSock = game.sockets[1 - pIdx];
  if (oppSock && oppSock.connected) {
    oppSock.emit('opponent-ready');
  }

  // If both ready, resolve
  if (game.playSubmitted[0] && game.playSubmitted[1]) {
    resolvePlay(game);
  }
}

function resolvePlay(game) {
  if (game.hands[0].length === 0 || game.hands[1].length === 0) {
    endGame(game);
    return;
  }

  const p1Card = game.hands[0].pop();
  const p2Card = game.hands[1].pop();

  const offense = game.possession;
  const offCard = offense === 0 ? p1Card : p2Card;

  // Broadcast the cards
  io.to(game.id).emit('cards-revealed', { p1Card, p2Card });

  // Check same rank — INTERCEPTION
  if (p1Card.rank === p2Card.rank) {
    broadcastLog(game, `${cardLabel(p1Card)} vs ${cardLabel(p2Card)} — SAME RANK! INTERCEPTION!`, 'turnover');
    game.possession = 1 - game.possession;
    game.down = 1;
    setFirstDownMarker(game);
    game.playSubmitted = [false, false];

    setTimeout(() => {
      broadcastState(game);
      io.to(game.id).emit('play-resolved', { result: 'interception' });
    }, 800);
    return;
  }

  // Check same color — NO GAIN
  if (cardColor(p1Card) === cardColor(p2Card)) {
    broadcastLog(game, `${cardLabel(p1Card)} vs ${cardLabel(p2Card)} — Same color, no gain.`, 'no-gain');
    advanceDown(game, 0);
    return;
  }

  // Opposite color — gain
  const yards = cardValue(offCard);
  broadcastLog(game, `${cardLabel(p1Card)} vs ${cardLabel(p2Card)} — Opposite colors! Player ${offense + 1} gains ${yards} yards!`, 'gain');
  advanceDown(game, yards);
}

function advanceDown(game, yardsGained) {
  if (game.possession === 0) {
    game.ballYard += yardsGained;
  } else {
    game.ballYard -= yardsGained;
  }

  // Check touchdown
  if ((game.possession === 0 && game.ballYard >= 100) || (game.possession === 1 && game.ballYard <= 0)) {
    setTimeout(() => scoreTouchdown(game), 800);
    return;
  }

  game.ballYard = Math.max(0, Math.min(100, game.ballYard));

  // Check first down
  let madeFirstDown = false;
  if (game.possession === 0 && game.ballYard >= game.firstDownMarker) madeFirstDown = true;
  else if (game.possession === 1 && game.ballYard <= game.firstDownMarker) madeFirstDown = true;

  if (madeFirstDown) {
    game.down = 1;
    setFirstDownMarker(game);
    broadcastLog(game, `First down! Player ${game.possession + 1} at ${yardLineText(game.ballYard)}.`, 'info');
  } else {
    game.down++;
    if (yardsGained > 0) {
      game.yardsToGo -= yardsGained;
      if (game.yardsToGo < 0) game.yardsToGo = 0;
    }
    if (game.down > 4) {
      broadcastLog(game, `Turnover on downs! Player ${(1 - game.possession) + 1} takes over.`, 'turnover');
      game.possession = 1 - game.possession;
      game.down = 1;
      setFirstDownMarker(game);
    }
  }

  game.playSubmitted = [false, false];

  setTimeout(() => {
    broadcastState(game);
    io.to(game.id).emit('play-resolved', { result: 'normal' });
    checkCardsOut(game);
  }, 800);
}

function scoreTouchdown(game) {
  game.ballYard = game.possession === 0 ? 100 : 0;
  game.scores[game.possession] += 7;
  broadcastLog(game, `🏈 TOUCHDOWN Player ${game.possession + 1}! (+7 points)`, 'touchdown');

  broadcastState(game);

  if (game.scores[game.possession] >= WIN_SCORE) {
    endGame(game);
    return;
  }

  // Other team kicks off
  game.kickoffWho = game.possession;
  game.possession = 1 - game.possession;

  io.to(game.id).emit('touchdown', { scores: game.scores });

  setTimeout(() => beginKickoff(game), 2000);
}

function checkCardsOut(game) {
  if (game.hands[0].length === 0 || game.hands[1].length === 0) {
    endGame(game);
  }
}

function endGame(game) {
  game.phase = 'gameover';
  let winner;
  if (game.scores[0] > game.scores[1]) winner = 0;
  else if (game.scores[1] > game.scores[0]) winner = 1;
  else winner = -1; // tie

  io.to(game.id).emit('game-over', {
    scores: game.scores,
    winner,
  });

  broadcastLog(game, `GAME OVER: ${winner === -1 ? "It's a Tie!" : `Player ${winner + 1} Wins!`} (${game.scores[0]} - ${game.scores[1]})`, 'info');

  // Cleanup
  cleanup(game);
}

function forfeit(game, disconnectedIdx) {
  game.phase = 'gameover';
  const winnerIdx = 1 - disconnectedIdx;

  const winnerSock = game.sockets[winnerIdx];
  if (winnerSock && winnerSock.connected) {
    winnerSock.emit('game-over', {
      scores: game.scores,
      winner: winnerIdx,
      forfeit: true,
    });
  }

  cleanup(game);
}

function cleanup(game) {
  for (const pid of game.players) {
    playerGames.delete(pid);
  }
  games.delete(game.id);
}

function yardLineText(yard) {
  if (yard <= 0) return 'P1 End Zone';
  if (yard >= 100) return 'P2 End Zone';
  if (yard === 50) return '50';
  if (yard < 50) return `P1 ${yard}`;
  return `P2 ${100 - yard}`;
}

// --- Socket.io ---
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('find-game', () => {
    if (playerGames.has(socket.id)) return; // already in a game

    if (waitingSocket && waitingSocket.connected && waitingSocket.id !== socket.id) {
      // Match!
      const opponent = waitingSocket;
      waitingSocket = null;
      console.log(`Matched: ${opponent.id} vs ${socket.id}`);
      createGame(opponent, socket);
    } else {
      waitingSocket = socket;
      socket.emit('waiting', { message: 'Waiting for an opponent...' });
      console.log(`Queued: ${socket.id}`);
    }
  });

  socket.on('cancel-find', () => {
    if (waitingSocket && waitingSocket.id === socket.id) {
      waitingSocket = null;
    }
  });

  socket.on('kickoff-select', (data) => {
    const game = getGame(socket.id);
    if (!game) return;
    const pIdx = playerIndex(game, socket.id);
    handleKickoffSelect(game, pIdx, data.cardIndices);
  });

  socket.on('play-card', () => {
    const game = getGame(socket.id);
    if (!game) return;
    const pIdx = playerIndex(game, socket.id);
    handlePlayCard(game, pIdx);
  });

  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);

    // Remove from queue
    if (waitingSocket && waitingSocket.id === socket.id) {
      waitingSocket = null;
    }

    // Handle in-game disconnect
    const game = getGame(socket.id);
    if (game) {
      const pIdx = playerIndex(game, socket.id);
      forfeit(game, pIdx);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Football Cards server running on port ${PORT}`);
});
