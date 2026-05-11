# ⚡ Photon Browser — Decentralized P2P Ecosystem

Photon is a fully autonomous, client-side P2P web browser and social ecosystem. It operates entirely without traditional servers, using a hybrid discovery network and direct WebRTC peer-to-peer tunnels to share files, messages, and websites.

## 🚀 Features

| Feature | Implementation | Description |
|---------|----------------|-------------|
| **Global Feed** | `feed.js` | Cryptographically signed social posts broadcast to the swarm. |
| **Encrypted DMs**| `dm-manager.js`| End-to-end encrypted messaging using ECDH and AES-256-GCM. |
| **File Swarm** | `torrent.js` | BitTorrent-style piece exchange for sharing files via magnet links. |
| **P2P Hosting** | `sw.js` | Host and browse HTML pages directly from other peers using `photon-site://`. |
| **High Capacity**| `storage-idb.js`| Multi-gigabyte content-addressed storage using IndexedDB. |
| **Reputation** | `reputation.js`| Autonomous peer scoring based on uptime and network contributions. |

## 🏗️ Architecture

### 1. Identity & Cryptography
Photon uses **ECDSA P-256** for identity. There are no passwords or emails. Your identity is a keypair stored in your browser. Every message and file you share is signed, ensuring authenticity and non-repudiation.

### 2. Hybrid Discovery Network
Photon uses a two-tier discovery system:
- **Local Swarm**: Uses `BroadcastChannel` to instantly sync tabs and devices on the same local instance.
- **Global Swarm**: Connects to a WebSocket signaling relay to discover and handshake with remote peers across the internet.

### 3. P2P Routing Engine
Once peers are discovered via the relay, Photon establishes direct **WebRTC DataChannels**.
- **Data In**: Incoming WebRTC messages are injected directly into the DHT state machine.
- **Data Out**: Local broadcasts are mirrored across all active WebRTC tunnels, creating a distributed mesh network.

### 4. Storage & Transport
Files and websites are broken into **16KB chunks**, hashed with **SHA-256**, and stored in **IndexedDB**. Chunks are requested by their hash from the swarm. If one peer goes offline, the browser automatically finds another seeder for the missing pieces.

### 5. Service Worker Hosting
The `sw.js` (Service Worker) acts as a local proxy. When you navigate to a P2P site, the worker intercepts the request, pulls the manifest from the DHT, fetches the binary chunks from the swarm, and reconstructs the page in real-time.

## 🛠️ Getting Started

### Installation
Photon is a standalone web app. No complex backend is required.

```bash
# Clone the repository
git clone https://github.com/mikelewis1971/photon-browser-p2p.git
cd photon-browser-p2p

# Install dependencies (only serve for local hosting)
npm install

# Start the browser
npm start
```

### Initial Setup
1. Open the browser (typically `http://localhost:3000`).
2. **Create Identity**: Enter a display name to generate your cryptographic keys.
3. **Import Identity**: If you have a `photon-data-export.json`, you can import it to restore your account.
4. **Join the Swarm**: The browser will automatically connect to the signaling relay and discover other online peers.

## 🔐 Security & Privacy
- **E2EE**: Direct messages use Elliptic Curve Diffie-Hellman (ECDH) for secret derivation.
- **Standalone**: All logic runs in your browser. Your private keys never leave your machine.
- **Local-First**: The browser remains functional even if the signaling relay is down (via local BroadcastChannel discovery).

## 📄 License
MIT © 2026 Michael Lewis
