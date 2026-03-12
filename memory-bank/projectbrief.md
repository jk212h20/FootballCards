# Football Cards — Project Brief

## Overview
A two-player card-based football game simulator. Web app (HTML/CSS/JS, no build tools).

## Rules

### Setup
- Standard 52-card deck, shuffled, split 26 cards per player
- Coin flip determines who receives the opening kickoff

### Card Values
| Card | Yards |
|------|-------|
| A | 1 |
| 2-10 | Face value |
| J | 15 |
| Q | 20 |
| K | 25 |

### Kickoff
- Kicking team picks 3 cards of **different ranks**, sum = kick distance
- Receiving team picks 3 cards of **different ranks**, sum = return yards
- If totals match exactly → **fumble**, kicking team recovers at landing spot
- All 6 kickoff cards are removed from play

### Normal Play
- Both players simultaneously flip top card of their hand
- **Same rank** → Interception (turnover, defense takes ball at current spot)
- **Same color, different rank** → No gain, next down
- **Opposite color** → Offense gains yards equal to their card's value

### Downs & First Downs
- 4 downs to gain 10 yards for a first down
- Fail to convert → turnover on downs at current spot

### Scoring
- Touchdown = 7 points (auto extra point)
- After TD, scoring team kicks off to opponent
- **Win condition**: First to 21 points (3 TDs)

### Game End
- First to 21 wins, or highest score when cards run out

## Tech Stack
- Vanilla HTML + CSS + JS (single-page, no build tools)
- Canvas for football field rendering
- File: `index.html`, `style.css`, `game.js`
