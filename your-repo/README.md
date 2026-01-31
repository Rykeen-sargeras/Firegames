# 🔥 Lolcow Fire Game Lobby v3.0

Multi-game platform featuring Cards Against The LCU and UNO with real-time multiplayer!

## 🚀 What's Fixed in v3.0

### Lobby System Overhaul
- ✅ **Fixed script loading order** - `main.js` now loads FIRST to define `socket` before game files
- ✅ **New dedicated lobby-state event** - Separate from game state for clarity
- ✅ **Players now display correctly** - Shows username, ready status, and highlights current user
- ✅ **Ready system works** - Toggle ready/unready with visual feedback
- ✅ **Game starts properly** - When all players ready and minimum reached (3 for CAH, 2 for UNO)
- ✅ **Status messages** - Shows how many more players/ready needed
- ✅ **Join room callbacks** - Proper error handling for room not found, name taken, game in progress

### Architecture Improvements
- Centralized `broadcastLobby()` function for consistent lobby updates
- Per-player hand distribution (no hand data in shared state)
- Better state separation between lobby and game phases
- Proper room cleanup on disconnect

## 📁 File Structure

```
/
├── package.json
├── server.js              # Unified backend
├── white_cards.txt        # CAH white cards (optional)
├── black_cards.txt        # CAH black cards (optional)
└── public/
    ├── index.html         # All screens with styling
    ├── main.js            # LOADS FIRST - Socket, modals, navigation, lobby
    ├── game-cah.js        # Cards Against game logic
    ├── game-uno.js        # UNO game logic
```

## 🚀 Quick Start

### Local Development:
```bash
npm install
npm start
```
Visit `http://localhost:3000`

### Render Deployment:
1. Push all files to GitHub
2. Create new Web Service on Render
3. Connect your repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variable: `ADMIN_PASS=YourSecretPassword`

## 🎮 How It Works

### Creating a Game
1. Enter username on home screen
2. Click "New Game"
3. Select game type (Cards Against or UNO)
4. Share the 6-character room code with friends
5. Click "Ready Up" when everyone has joined
6. Game starts when all players are ready!

### Joining a Game
1. Enter username on home screen
2. Click "Join with Code"
3. Enter the room code shared by host
4. Click "Ready Up"

## 🎯 Game Rules

### Cards Against The LCU
- **3+ players required**
- One Card Czar per round picks the funniest answer
- Submit white cards to fill in the black card's blanks
- Czar picks winner (earns 1 point)
- First to 10 points wins!

### UNO
- **2-10 players**
- Match cards by color or number
- Special cards: Skip, Reverse, Draw 2, Wild, Wild Draw 4
- **Call "UNO!"** when you have 1 card left (or get 2 penalty cards)
- First to empty their hand wins!

## 🔌 Socket Events

### Lobby Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `create-room` | Client → Server | Creates new room |
| `join-room` | Client → Server | Joins existing room |
| `ready-up` | Client → Server | Toggle ready status |
| `lobby-state` | Server → Client | Updates lobby UI |

### Game Events (CAH)
| Event | Direction | Description |
|-------|-----------|-------------|
| `cah-state` | Server → Client | Full game state + hand |
| `cah-submit` | Client → Server | Submit white card |
| `cah-pick` | Client → Server | Czar picks winner |
| `cah-round-winner` | Server → Client | Announce winner |
| `cah-game-winner` | Server → Client | Game over |

### Game Events (UNO)
| Event | Direction | Description |
|-------|-----------|-------------|
| `uno-state` | Server → Client | Full game state + hand |
| `uno-play` | Client → Server | Play a card |
| `uno-draw` | Client → Server | Draw card(s) |
| `uno-call` | Client → Server | Call UNO |
| `uno-challenge` | Client → Server | Challenge another player |

## 🛠 Admin Controls

Access with admin button (bottom-left). Default password: `Firesluts`

- **Reset Game** - Returns everyone to lobby
- **Wipe Chat** - Clears all messages
- **Play Music** - Enter YouTube URL for background music

## 🎨 Customization

### Environment Variables
- `PORT` - Server port (default: 3000)
- `ADMIN_PASS` - Admin password (default: Firesluts)

### Custom Cards
Create `white_cards.txt` and `black_cards.txt` in the root directory, one card per line.

### Win Condition
Edit `WIN_POINTS` in server.js (default: 10)

## 🐛 Troubleshooting

### Players not showing in lobby
- Check browser console (F12) for socket connection
- Verify server is running (check Render logs)
- Try refreshing the page

### Game won't start
- Need minimum players (3 for CAH, 2 for UNO)
- ALL players must click "Ready Up"
- Check the status message below player list

### Socket disconnects
- Check internet connection
- Server may have restarted (Render free tier sleeps)
- Refresh page to reconnect

## 📄 License

MIT License - Do whatever you want with it!

---
Created and Coded by Rykeen | Overhauled v3.0 Lobby System
