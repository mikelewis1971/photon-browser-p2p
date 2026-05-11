# Photon Browser v1.0

A fully decentralized, autonomous, client-side P2P web browser.

## What is Photon?

Photon is a web application that runs entirely in your browser with no server required for core
P2P functionality. It uses:

- **BroadcastChannel** — in-browser DHT simulation for same-device tabs
- **WebRTC** — direct peer-to-peer connections across devices/networks
- **localStorage** — content-addressed chunk store (SHA-256)
- **BitTorrent-style piece exchange** — download files from multiple seeders
- **ECDSA P-256** — cryptographic identity (no passwords, no email)
- **AES-GCM** — encrypted direct messages

## Features

| Feature | Description |
|---------|-------------|
| **Feed** | Cryptographically signed social posts |
| **Files** | Upload, seed, and download files via magnet links |
| **Discover** | Browse the swarm, download by magnet link |
| **Rooms** | Public P2P chat channels |
| **Messages** | Encrypted peer-to-peer DMs |
| **Pages** | Write and host HTML pages on the swarm |
| **Scripts** | Run sandboxed JavaScript/HTML apps |
| **Peers** | See online nodes, follow/block |
| **Reputation** | Score peers by seeding, uptime, messages |
| **My Page** | Your pinned content dashboard |

## Reputation System

Peers earn reputation by:
- +2 per piece served to other peers
- +0.5 per minute online
- +1 per valid signed message  
- +5 per follower
- -20 per report received

Tiers: New → Active (50) → Trusted (200) → Legend (500)

## Moderation

Local-first moderation. Block content, mute peers. If 3+ trusted peers report
content, it is auto-hidden. Reports are broadcast to help the network self-moderate.

## P2P Web Hosting

Publish HTML pages to the swarm. Each page gets a Photon address:
`photon-site://FINGERPRINT/PAGE_ID`

Pages are stored as content-addressed chunks, seeded like files,
and loaded directly from peers.

## File Sharing

1. Upload a file → automatically chunked (16 KB pieces) + SHA-256 hashed
2. Get a magnet link: `photon://HASH?name=...&size=...&pieces=N`
3. Share the magnet link with anyone on the network
4. Recipients paste it in Discover → pieces download from all seeders
5. After download, you automatically become a seeder

## Magnet Link Format

```
photon://SHA256HASH?name=FILENAME&size=BYTES&type=MIME&pieces=N&mh=HASH
```

## Running Standalone

```bash
# Option 1: Any static server
npx serve .

# Option 2: Python
python3 -m http.server 8080

# Option 3: Just open index.html
# Works for same-device multi-tab P2P (BroadcastChannel)
# Cross-device needs a static host (GitHub Pages, Netlify, etc.)
```

## Architecture

```
Browser Tab A ──BroadcastChannel──▶ Browser Tab B
              ──WebRTC DataChannel──▶ Remote Peer
              ──localStorage──────▶ Content Store

DHT (BroadcastChannel):
  peer_announce → peer discovery
  dht_put       → key-value replication
  new_message   → feed/chat broadcast
  signal        → WebRTC handshake

Torrent (BroadcastChannel: photon_swarm):
  announce      → seeder/leecher registration
  piece_request → "I need piece N of hash H"
  piece_response → "here is piece N of hash H" (base64)
```

## File Structure

```
lib/
  crypto.js      — ECDSA, SHA-256, AES-GCM
  dht.js         — in-browser DHT + pub/sub
  torrent.js     — BitTorrent piece exchange
  webrtc.js      — WebRTC data channels + file transfer
  chat.js        — rooms + DMs
  storage.js     — content-addressed localStorage
  feed.js        — signed social messages
  identity.js    — keypair lifecycle
  reputation.js  — peer scoring
  moderation.js  — content filtering
  webhosting.js  — P2P page hosting
  scriptRunner.js — sandboxed iframe executor
```

## License

MIT — build freely, fork freely, host freely.
