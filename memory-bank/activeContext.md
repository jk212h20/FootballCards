# Active Context

## Current State (March 2026)
MVP is complete and playable. All core mechanics working.

## Architecture
```
index.html  — HTML shell (scoreboard, field canvas, card slots, modals, play log)
style.css   — Dark theme, clean UI, card styling, modal animations
game.js     — All game logic (state machine, deck, kickoff, play resolution, field drawing)
```

## Game Phases (state machine in `game.js`)
1. `coin-flip` → animated coin, determines receiver
2. `kickoff-kicker` → modal card picker (3 different-rank cards)
3. `kickoff-returner` → modal card picker (3 different-rank cards), fumble check
4. `play` → simultaneous card flip, resolve (interception/no-gain/gain)
5. `touchdown` → score update, kickoff to opponent
6. `gameover` → win modal

## Field System
- Yard 0 = P1 end zone, yard 100 = P2 end zone
- P1 attacks right (→), P2 attacks left (←)
- Canvas 800x320, end zones are 10% width each side
- Blue scrimmage line, yellow dashed first-down marker

## What Works
- Coin flip with animation
- Kickoff card picker (3 different ranks, totals displayed, fumble on match)
- Normal play (same rank=interception, same color=no gain, opposite=gain yards)
- Downs tracking (4 downs, 10 yards, turnover on downs)
- Touchdown scoring (7pts auto), win at 21
- Field rendering with ball, scrimmage, first-down marker
- Play log with color-coded entries

## Not Built Yet
- No AI opponent (currently both hands play randomly from top of deck)
- No sound effects
- No card strategy (players don't choose which card to play during normal turns)
- No punt/field goal options
- No halftime or quarters
