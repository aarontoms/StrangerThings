# 🎭 StrangerThings — Real-Time Peer-to-Peer Video & Chat Platform

> An Omegle-inspired, modern web application for instant 1-on-1 random video and text conversations with strangers. Built with a reactive React + TypeScript frontend, WebSockets for matchmaking and signaling, and WebRTC for direct media streaming and data relay, backed by a self-hosted Coturn TURN/STUN infrastructure.

---

## 📋 Table of Contents
- [Overview & Architecture](#-overview--architecture)
- [Key Features](#-key-features)
- [Frontend Deep Dive (Primary Focus)](#-frontend-deep-dive)
  - [Architecture & Tech Stack](#architecture--tech-stack)
  - [State Management (`useCallStore`)](#state-management-usecallstore)
  - [WebRTC Engine & Perfect Negotiation (`useWebRTC`)](#webrtc-engine--perfect-negotiation-usewebrtc)
  - [Socket Lifecycle Management (`useSocket`)](#socket-lifecycle-management-usesocket)
  - [Component Breakdown](#component-breakdown)
- [Backend Overview & Signaling](#-backend-overview--signaling)
  - [Matchmaking Flow](#matchmaking-flow)
  - [Signaling & Message Relaying](#signaling--message-relaying)
  - [Dynamic ICE Configuration Endpoint](#dynamic-ice-configuration-endpoint)
- [Project Directory Structure](#-project-directory-structure)
- [Installation & Setup](#-installation--setup)
  - [1. Backend Setup](#1-backend-setup)
  - [2. Self-Hosted Coturn (Docker STUN/TURN)](#2-self-hosted-coturn-docker-stunturn)
  - [3. Frontend Setup](#3-frontend-setup)
- [Drawbacks, Limitations & Edge Cases](#-drawbacks-limitations--edge-cases)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [License](#-license)

---

## 🌐 Overview & Architecture

**StrangerThings** connects two anonymous online users in an ephemeral room for synchronized video, audio, and text interaction. Once connected, media flows directly peer-to-peer (P2P) between the browsers using **WebRTC**, while the **Node.js Signaling Server** coordinates matchmaking, session negotiation (SDP offers/answers), ICE candidates, and chat messaging.

```
┌─────────────────┐                                  ┌─────────────────┐
│                 │       1. Join / Queue Match      │                 │
│  User A Browser │─────────────────────────────────▶│ Node.js Server  │
│  (Initiator)    │◀─────────────────────────────────│  (Socket.IO)    │
│                 │       2. Room Matched Event      │                 │
└────────┬────────┘                                  └────────┬────────┘
         │                                                    │
         │ 3. Exchange SDP Offer / Answer & ICE Candidates    │
         │◀══════════════════════════════════════════════════▶│
         │                                                    │
         │ 4. STUN/TURN Relaying (If symmetric NAT)           ▼
         │      ┌────────────────────────────────────────────────┐
         ├─────▶│  Coturn Server (Docker / Host Network)         │
         │      │  STUN: 3478 UDP | TURN: 49152-65535 UDP Relay │
         │      └────────────────────────────────────────────────┘
         │
         │ 5. Direct Peer-to-Peer WebRTC Media Stream (Audio / Video)
         ▼═════════════════════════════════════════════════════════════
┌─────────────────┐
│  User B Browser │
│   (Receiver)    │
└─────────────────┘
```

---

## ✨ Key Features

- **Instant Matchmaking Queue:** FIFO pairing engine that groups users into unique, isolated rooms immediately upon arrival or skip.
- **Low-Latency P2P Video & Audio:** Ultra-low latency streaming using browser-native WebRTC `RTCPeerConnection`.
- **Live Text Chat:** Real-time text chat synchronized with the active peer in the room.
- **Resilient WebRTC Negotiation:** Adheres to the WebRTC **Perfect Negotiation Pattern** to prevent glare and race conditions during renegotiations.
- **Adaptive Device Controls:** Live mic toggle (mute/unmute), camera switch (enable/disable), dynamic track injection, and instant skip.
- **Real-Time HUD / Telemetry:** On-screen diagnostic telemetry showing ICE connection state, signaling status, peer connection health, and active video tracks.
- **Mobile Responsive Drawer:** Seamless experience across desktop monitors and mobile devices with a slide-out live chat drawer.
- **Live Presence Counter:** Real-time counter broadcasting the total active online users.

---

## 🎨 Frontend Deep Dive

The frontend is located in [`StrangerThings/`](file:///codes/StrangerThings) and provides a fast, resilient single-page experience without page reloads.

### Architecture & Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **React 18** | Declarative component UI model with concurrent features |
| **TypeScript** | Strict type definitions across WebRTC payloads, stores, and hooks |
| **Vite** | Fast module bundler and hot-module replacement (HMR) development server |
| **Tailwind CSS** | Modern utility-first responsive dark theme design |
| **Zustand** | Centralized, lightweight call state and streaming store |
| **Socket.IO Client** | Bi-directional signaling channel with reconnection resilience |
| **Framer Motion** | Polished micro-interactions, layout transitions, and dialog reveals |
| **Lucide React** | Consistent, scalable vector iconography |

---

### State Management (`useCallStore`)
Found in [`src/store/useCallStore.ts`](file:///codes/StrangerThings/src/store/useCallStore.ts), the application relies on a single **Zustand** store to manage synchronous state across disparate components:

- **Connection State:** Tracked as `'disconnected' | 'connecting' | 'connected' | 'searching' | 'partner_left'`.
- **Media Streams:** `localStream` (User's webcam/mic) and `remoteStream` (Stranger's incoming media).
- **Hardware Toggles:** `isMuted` and `cameraOn` booleans dynamically enabling/disabling individual tracks on active streams.
- **Session Info:** Current `roomId`, `messages` array, `onlineCount`, and `isBackendOffline` connectivity flags.

---

### WebRTC Engine & Perfect Negotiation (`useWebRTC`)
Located in [`src/hooks/useWebRTC.ts`](file:///codes/StrangerThings/src/hooks/useWebRTC.ts), this is the core engine handling media life cycles and peer negotiation:

1. **Dynamic ICE Fetching:** On initial mount, queries the backend (`GET /api/ice-servers`) to obtain production STUN/TURN configurations with secure credentials, falling back to public Google STUN servers if offline.
2. **Perfect Negotiation Pattern:** Uses polite/impolite peer roles (`isInitiatorRef`) to resolve race conditions (SDP glare) where both sides attempt to create an offer simultaneously.
3. **Candidate Queueing:** Collects incoming ICE candidates in a `pendingCandidates` queue if remote descriptions have not yet finished setting, preventing `InvalidStateError`.
4. **Track Recovery:** If the user grants webcam/mic permissions *after* matching, the tracks are dynamically injected into the running `RTCPeerConnection` using `addTrack()` and renegotiated cleanly.
5. **Instant Rematch / Skip:** Cleaning up audio/video tracks, terminating current `RTCPeerConnection`, and immediately re-emitting the `join` socket event without page refresh.

---

### Socket Lifecycle Management (`useSocket`)
Located in [`src/hooks/useSocket.ts`](file:///codes/StrangerThings/src/hooks/useSocket.ts):

- **Singleton Socket Instance:** Instantiated outside the React component tree to prevent duplicate socket connections under **React 18 Strict Mode** (which aggressively mounts, unmounts, and remounts components in development).
- **Auto Reconnect & Health Tracking:** Tracks connection status and automatically sets `isBackendOffline` in the Zustand store to alert the user via an overlay when signaling drops.

---

### Component Breakdown

- **[`VideoPlayer.tsx`](file:///codes/StrangerThings/src/components/VideoPlayer.tsx):**
  - Renders the incoming full-screen stranger video with `object-cover`.
  - Floating Picture-in-Picture (PiP) mirror for the local camera feed.
  - Floating status alerts (`Searching for stranger...`, `Backend Offline`, `Stranger disconnected`).
  - Diagnostic HUD displaying real-time ICE status: `ICE: connected | Sig: stable | Conn: connected | VTracks: 1`.

- **[`ControlsBar.tsx`](file:///codes/StrangerThings/src/components/ControlsBar.tsx):**
  - Microphone Toggle: toggles audio tracks and prompts permission if missing.
  - Camera Toggle: toggles video tracks without dropping the audio call.
  - Fast-forward Skip Button: cleanly tears down the session and requests a new partner.
  - Global hotkey listener: press <kbd>Escape</kbd> to skip instantly.

- **[`ChatPanel.tsx`](file:///codes/StrangerThings/src/components/ChatPanel.tsx):**
  - Interactive message list displaying color-coded sender/stranger speech bubbles.
  - Input field with automatic focus, disabled when searching or disconnected.
  - Auto-scroll to bottom on new messages.

- **[`Header.tsx`](file:///codes/StrangerThings/src/components/Header.tsx):**
  - Clean brand bar displaying the animated live online user count indicator (`🟢 X Online`).

- **[`Home.tsx`](file:///codes/StrangerThings/src/pages/Home.tsx):**
  - Layout orchestration combining video viewport and chat panel.
  - Responsive breakpoint handler: renders chat alongside video on desktop (`lg:block`), or as an overlay sliding drawer modal on mobile devices.

---

## ⚙️ Backend Overview & Signaling

The backend source is located in [`StrangerThings backend/`](file:///codes/StrangerThings%20backend) and runs a lightweight Node.js + Express + Socket.IO server ([`server.js`](file:///codes/StrangerThings%20backend/server.js)).

### Matchmaking Flow
1. User connects and fires the `join` event.
2. The server checks `waitingUser`:
   - If empty: the caller is stored as `waitingUser`.
   - If populated (and not self): generates a unique `room_${Date.now()}`, joins both sockets to the room, sets `socket.roomId`, and emits `matched` with:
     - User A: `{ roomId, initiator: true }`
     - User B: `{ roomId, initiator: false }`
   - Resets `waitingUser = null`.

### Signaling & Message Relaying
The server acts as an efficient message relay without inspecting packet contents:
- `offer` ➡️ relays SDP offer to `roomId`.
- `answer` ➡️ relays SDP answer to `roomId`.
- `ice-candidate` ➡️ relays network routing candidates to peer.
- `chat-message` ➡️ sends text message to peer in `roomId`.
- `skip` / `disconnect` ➡️ notifies partner with `partner-left`, purges the queue if the disconnected client was waiting, and decrements the `online-count`.

### Dynamic ICE Configuration Endpoint
The backend exposes `GET /api/ice-servers` which returns:
```json
{
  "iceServers": [
    { "urls": "stun:stun.l.google.com:19302" },
    { "urls": "stun:stun1.l.google.com:19302" },
    { "urls": "stun:<YOUR_IP>:3478" },
    {
      "urls": "turn:<YOUR_IP>:3478",
      "username": "stranger",
      "credential": "thingspassword"
    },
    {
      "urls": "turn:<YOUR_IP>:3478?transport=tcp",
      "username": "stranger",
      "credential": "thingspassword"
    }
  ]
}
```

> [!WARNING]
> **Security Notice regarding Coturn Credentials:**
> The credentials shown above (`stranger` / `thingspassword`) are intended strictly as temporary demonstration credentials for local development. **Do not use these default credentials in production!** Anyone with access to your credentials and public IP can abuse your TURN server as an open relay to forward arbitrary bandwidth. Always replace these with strong, custom credentials or dynamic time-limited tokens (`--use-auth-secret`) in your `.env` and Docker configs.

---

## 📁 Project Directory Structure

```text
StrangerThings/
├── StrangerThings/                 # 💻 FRONTEND REPOSITORY (React + Vite)
│   ├── public/                     # Static assets (favicons, etc.)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx       # Text chat UI & message list
│   │   │   ├── ControlsBar.tsx     # Mic, Camera, and Skip buttons
│   │   │   ├── Header.tsx          # Brand logo & online count badge
│   │   │   └── VideoPlayer.tsx     # Video displays, PiP, and debug HUD
│   │   ├── hooks/
│   │   │   ├── useSocket.ts        # Socket.IO client singleton lifecycle
│   │   │   └── useWebRTC.ts        # PeerConnection, negotiation, tracks
│   │   ├── pages/
│   │   │   └── Home.tsx            # Main layout & mobile drawer
│   │   ├── store/
│   │   │   └── useCallStore.ts     # Central Zustand state store
│   │   ├── App.tsx                 # Root layout & Toaster provider
│   │   ├── main.tsx                # React DOM entry
│   │   └── index.css               # Tailwind CSS declarations
│   ├── .env                        # Frontend environment variables
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts
│
└── StrangerThings backend/         # 🔌 BACKEND REPOSITORY (Node.js Signaling)
    ├── .env                        # STUN/TURN and port configuration
    ├── coturn-setup.md             # Guide for on-device Coturn setup
    ├── package.json
    └── server.js                   # Express + Socket.IO signaling server
```

---

## 🚀 Installation & Setup

### 1. Backend Setup

Open a terminal and navigate to the backend directory:
```bash
cd "C:\codes\StrangerThings backend"
npm install
```

Create or configure `.env` inside `StrangerThings backend/`:
```env
PORT=3000
STUN_URL="stun:YOUR_PUBLIC_OR_LOCAL_IP:3478"
TURN_URL="turn:YOUR_PUBLIC_OR_LOCAL_IP:3478"
TURN_URL_TCP="turn:YOUR_PUBLIC_OR_LOCAL_IP:3478?transport=tcp"
TURN_USERNAME="stranger"            # Temporary demo username (change in production)
TURN_CREDENTIAL="thingspassword"    # Temporary demo password (change in production)
```

Start the signaling server:
```bash
npm start
# Output: Signaling server running on port 3000
```

---

### 2. Self-Hosted Coturn (Docker STUN/TURN)

To enable peer-to-peer traversal when clients are on different networks, behind NATs, or behind mobile cellular firewalls:

1. Ensure **Docker Desktop** is running with WSL2 enabled.
2. Run the Coturn container bound to your host network:
```powershell
docker run -d --network=host --name coturn coturn/coturn `
  -n `
  --log-file=stdout `
  --min-port=49152 `
  --max-port=65535 `
  --realm=strangerthings `
  --user=stranger:thingspassword `
  --external-ip=YOUR_PUBLIC_IP
```
> [!NOTE]
> The `--user=stranger:thingspassword` flag uses temporary demo credentials. For production deployments or public hosting, make sure to replace `stranger` and `thingspassword` with a strong, secure username and password matching your backend `.env`.
3. **Firewall & Port Forwarding:**
   - In **Windows Defender Firewall**, allow inbound rules for:
     - **UDP 3478** & **TCP 3478** (STUN/TURN)
     - **UDP 49152-65535** (WebRTC Media Relay)
   - On your home router, forward external ports `3478` and UDP `49152-65535` to your machine's local IPv4 address (`192.168.x.x`).

---

### 3. Frontend Setup

Open a new terminal and navigate to the frontend directory:
```bash
cd "C:\codes\StrangerThings"
npm install
```

Configure `.env` in `StrangerThings/`:
```env
# For local development:
VITE_BACKEND_URL="http://localhost:3000"

# Or if exposing via Dev Tunnels / ngrok / Cloudflare Tunnel:
# VITE_BACKEND_URL="https://your-tunnel-url.ms"
```

Start the Vite development server:
```bash
npm run dev
```

Visit the displayed local or network URL (typically `http://localhost:5173`) across two browser windows or different devices on your network to test matching.

To build for production:
```bash
npm run build
```

---

## ⚠️ Drawbacks, Limitations & Edge Cases

Because this project is engineered as a **self-hosted, on-device architecture** rather than utilizing enterprise cloud TURN providers (such as Twilio Network Traversal or Metered.ca), several inherent trade-offs exist:

### 1. Docker Coturn on Windows / WSL2 Hiccups
- **WSL2 Virtual NAT Layer:** Running Coturn inside Docker on Windows with `--network=host` relies on WSL2 network bridging. When the laptop goes to sleep or wakes from standby, the WSL2 virtual network adapter can become unresponsive or drop binding on UDP port ranges (`49152-65535`).
- **Symptom:** The diagnostic HUD shows `ICE: checking` or hangs indefinitely without reaching `ICE: connected`.
- **Workaround:** Simply **refreshing the webpage (<kbd>F5</kbd>)** or clicking **Skip** triggers a fresh ICE gathering cycle. If Docker has stalled, restarting the container (`docker restart coturn`) re-binds the ports immediately.

### 2. Residential Dynamic IP Shifts
- Most home ISPs assign dynamic public IP addresses that rotate every few days or on router reboots.
- If your public IP changes, the Coturn `--external-ip` parameter and the backend `.env` (`STUN_URL` / `TURN_URL`) will point to an invalid IP address, preventing remote peers from resolving relay candidates. You will need to update `.env` with your new public IP.

### 3. Symmetric NAT & Mobile Carrier Firewalls (CGNAT)
- Strict mobile networks (4G/5G) often use Carrier-Grade NAT (CGNAT) and block direct UDP hole-punching. When testing a mobile phone on cellular against a laptop on home Wi-Fi, connection success depends entirely on the TURN relay working properly.
- If port forwarding on the router is not active, peer-to-peer connection will fail across different networks.

### 4. Single-Server Signaling
- Matchmaking state is stored in memory (`waitingUser` variable in Node.js memory). If the server restarts, any active user in the queue is cleared, and active peer-to-peer connections will continue until either user skips.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :---: | :--- |
| <kbd>Escape</kbd> | **Skip to Next Stranger:** Instantly disconnects current call and queues for a new partner. |
| <kbd>Enter</kbd> | **Send Chat Message:** Submits the typed message inside the chat panel. |

---

## 📄 License

This project is licensed under the **ISC License**. Feel free to use, modify, and distribute for educational and personal experimentation.
