# Active Context

## Current State (March 2026)
Two-player online game deployed to Railway. Matchmaking works — two visitors click "Find Game" and get paired.

## URLs
- **Live**: https://footballcards-production.up.railway.app
- **GitHub**: https://github.com/jk212h20/FootballCards
- **Railway**: https://railway.com/project/a894d26e-dd4d-4aee-bc4f-ee0fd8c582ea

## Railway IDs
- Project: `a894d26e-dd4d-4aee-bc4f-ee0fd8c582ea`
- Service: `4aa2d075-7083-4b8a-abd6-f2df292c1ce3`

## Architecture
```
server.js          — Express + Socket.io server, all game logic + matchmaking
public/
  index.html       — Lobby + game board HTML
  style.css        — Dark theme, lobby, cards, field, modals
  client.js        — Socket.io client (receives state, sends actions)
```

Old local-only files still in root (game.js, index.html, style.css) — can be removed.

## Game Flow
1. Player opens site → lobby with "Find Game" button
2. Click → joins queue, waits for opponent
3. Two players matched → server creates game room (Socket.io)
4. Coin flip (server), kickoff card selection (modal), normal play (both click "Play Card")
5. Server resolves everything, broadcasts state to both clients

## What Works
- Socket.io matchmaking (queue-based, first two matched)
- All game mechanics server-side (anti-cheat)
- Coin flip, kickoff card picker, normal play, interceptions, fumbles
- Downs, first downs, turnover on downs, touchdowns (7pts), win at 21
- Disconnect = forfeit
- Play log synced to both players

## Not Built Yet
- AI opponent (single player)
- Sound effects
- Mobile responsive layout
- Spectator mode
- Game history / stats
