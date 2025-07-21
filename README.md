# **Stremio Watch Party Plugin**
![License](https://img.shields.io/badge/license-MIT-blue)
![PeerJS](https://img.shields.io/badge/PeerJS-P2P-green)

**Real-time sync with P2P (PeerJS), auto-load, progress-based playback alignment, and a modern UI for creating and joining watch parties.**
**Made it so my brother and cousin can use it- Reason**
**It is a work in progress and I am new to this site (github) so thanks for trying out.**

 
---

## ✅ Features
- **P2P Sync**: No central server – all data flows directly via WebRTC using PeerJS.
- **Auto-Load**: Guests automatically load the same video as the host.
- **Progress-Based Sync**:
  - Eliminates offset from adaptive streams.
  - Smooth catch-up with playback speed adjustment.
  - Hard seek only when drift > 5%.
- **UI Controls**:
  - Create Party / Join Party
  - Force Sync
  - Copy Party ID
  - Sync Toggle (Coming soon)
  - Strict Host Control (Coming soon)
- **Privacy First**: No data stored on any server.

---

## 🔒 Why P2P?
- No playback data stored on central servers.
- Faster sync with direct peer connections.
- Works fully P2P after initial signaling (serverless mode).

---

## 🚀 How to Use
1. Open **Stremio Desktop App**.
2. Press `F12` → go to **Console**.
3. Paste this:
```javascript
const script = document.createElement('script');
script.src = 'https://raw.githubusercontent.com/knightinfected/stremioP2P-watchparty/main/watchparty.js';
document.body.appendChild(script);
Click the 🎉 Watch Party button in Stremio’s navigation bar.

🛠 How It Works
Built on PeerJS (WebRTC) for P2P connectivity.

Host acts as the source of truth for playback state.

Guests auto-navigate, sync progress, and adjust playback speed for smooth alignment.

No central server needed beyond initial signaling.

📦 Tech Stack
JavaScript (Vanilla)

PeerJS for P2P signaling

CustomPlayerAPI for robust player control

📌 Roadmap
✅ Stable P2P sync

⬜ In-party chat

⬜ Participant list

⬜ Multi-host support

⬜ Option for custom PeerJS signaling server

⬜ Debug overlay for testing

🖼 Screenshots
 Coming soon


📄 License
MIT License © knightinfected
