# 🔥 Lolcow Fire Game Lobby

Multi-game platform featuring Cards Against The LCU and UNO with room codes!

## 🎮 Features

- **Room Code System**: Create/join private game rooms
- **2 Games**: Cards Against The LCU & UNO
- **Real-time Multiplayer**: Socket.io powered
- **Custom Modals**: Beautiful embedded UI (no window popups)
- **Admin Panel**: Game management and music control
- **Responsive Design**: Works on desktop and mobile

## 📁 File Structure

```
/
├── package.json
├── server.js (main server with both games)
├── white_cards.txt (CAH white cards)
├── black_cards.txt (CAH black cards)
└── public/
    ├── index.html (main HTML with all screens)
    ├── main.js (shared functionality, modals, navigation)
    ├── game-cah.js (Cards Against logic)
    ├── game-uno.js (UNO game logic)
    ├── cardsback.png (background image)
    ├── blkcard.png (black card background)
    └── whitecard.png (white card background)
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
6. Add environment variable: `ADMIN_PASS=YourPassword`

## 🎯 Game Rules

### Cards Against The LCU
- 3+ players required
- One Card Czar per round
- Submit funniest white card for black card prompt
- Czar picks winner (1 point)
- First to 10 points wins!

### UNO
- 2-10 players
- Match card by color or number
- Special cards: Skip, Reverse, Draw 2, Wild, Wild Draw 4
- Call "UNO!" when you have 1 card left
- First to empty their hand wins!

## 🎨 Customization

### Change Admin Password:
Set `ADMIN_PASS` environment variable in Render

### Modify Win Conditions:
Edit `WIN_POINTS` in `server.js` (line 14)

### Add Custom Cards:
Edit `white_cards.txt` and `black_cards.txt`

## 🛠 Admin Controls

Password: `Firesluts` (default) or your `ADMIN_PASS`

Features:
- Reset game
- Wipe chat
- Play YouTube music
- View player stats

## 📝 Credits

Created and Coded by Rykeen
Powered by Socket.io, Express, and Canvas Confetti

## 🐛 Known Issues

- UNO draw pile reshuffles when empty (working as intended)
- Chat persists between game switches (feature, not bug)
- Mobile layout may need optimization for UNO cards

## 📄 License

MIT License - Do whatever you want with it!
