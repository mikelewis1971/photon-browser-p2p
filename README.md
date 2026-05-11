<div align="center">
  <h1>⚡ Photon</h1>
  <p><strong>The Decentralized P2P Social Super-App</strong></p>
  <p>No Servers. No Corporations. No Censorship. You Own Your Data.</p>
</div>

---

## 🌌 What is Photon?

Photon is a next-generation decentralized social network that runs entirely in your browser. It combines the features of **Twitter (Microblogging), Facebook (Rich Profiles), and TikTok (Video Feeds)** into a single, beautiful "Super-App".

Instead of relying on corporate servers to hold your data, Photon connects you directly to other users (Peer-to-Peer) using advanced WebRTC technology. Your messages, videos, and profile exist within the "Swarm"—a network formed entirely by the people using the app.

### ✨ Key Features
- **True Decentralization:** Your identity is an unhackable cryptographic keypair. There is no central database to hack or take down.
- **Social Feed & TikTok Clone:** Post text, images, and swipe through full-screen video feeds seamlessly.
- **E2E Encrypted DMs:** Private messages are locked with military-grade encryption (ECDH P-256 + AES-GCM). Only you and the recipient can read them.
- **Voice & Video Calling:** Built-in FaceTime/Skype-style calling straight from your browser.
- **AI-Powered Public Profiles:** Use the built-in HTML Builder to create custom profile pages. Just ask ChatGPT to write the code for you, paste it in, and publish it to the Swarm!
- **Data Hosting Budget:** Choose to donate a portion of your hard drive space to host posts and videos for your friends.
- **PWA Ready:** Install Photon directly onto your Phone, Tablet, or PC like a native app.

---

## 🚀 How to Install & Run (For Beginners!)

Because Photon is a completely serverless app, installing it is incredibly easy. All the code runs locally on your machine.

### Method 1: The Easiest Way (GitHub Pages / Web)
If this repository is hosted on GitHub Pages or any HTTPS website, simply go to the URL on your phone or computer. 
*Click the **"📲 Install as App"** button in the Settings menu to add it permanently to your home screen!*

### Method 2: Running Locally on your PC
To run Photon yourself, you just need a way to serve the files locally. Because Photon uses advanced browser features (like Service Workers for offline support), you cannot just double-click `index.html`. You need a local server.

1. **Download the Code:** Click the green **Code** button at the top of this page and select **Download ZIP**. Extract the folder.
2. **Start a Local Server:**
   - **If you have Python installed:** Open your terminal/command prompt, go to the Photon folder, and type:
     `python -m http.server 8000`
   - **If you have Node.js installed:** Open your terminal, go to the Photon folder, and type:
     `npx serve .`
   - **If you have VS Code:** Install the "Live Server" extension, open the Photon folder, and click "Go Live" at the bottom right.
3. **Open your Browser:** Go to `http://localhost:8000` (or whatever port your server gave you).

---

## 📖 How to Use Photon

### 1. Create Your Identity
When you open Photon for the first time, you will be asked to create a Display Name and a Handle (e.g., `@mike123`). When you click Generate, Photon creates a secure cryptographic vault on your device. **This is your account.** There are no passwords to forget, and no emails to provide.

### 2. Multi-Device Sync (Phone + PC)
Want to use your account on your phone and your computer?
1. On your first device, go to **⚙️ Settings**.
2. Click **Export Identity Backup**. This saves a `.json` file.
3. Send that file to your other device securely.
4. On the new device, open Photon and click **Import Identity** on the welcome screen.
5. *Tip: Devices track their own uptime independently!*

### 3. Customize Your Public Profile
Photon gives you a blank canvas for your public-facing page.
1. Go to **⚙️ Settings** and click **🎨 Open HTML Profile Builder**.
2. Go to ChatGPT or Claude and say: *"Build me a cool, dark-mode HTML profile page for my social network. Include my name."*
3. Paste the code into the Builder, check the Live Preview, and click **🚀 Save & Publish**.
4. Anyone on the network who visits your unique Handle will now see your custom page!

### 4. Making Calls
Go to the **🌐 Network** tab to see everyone currently online in the Swarm. Click the 📞 (Voice) or 📹 (Video) button next to their name to call them. You can adjust who is allowed to call you in your Settings.

---

## 🛡️ Security Audit & Sanity Check

Photon has been built from the ground up to respect user privacy and security:

- **Zero-Knowledge DMs:** Direct messages are encrypted using the Web Crypto API (`crypto.subtle`). An AES-GCM shared key is derived securely via ECDH. Relays and other peers routing the data cannot read the contents.
- **Sandboxed Execution:** Public profiles and user-created scripts are executed inside strict HTML `<iframe>` sandboxes (`sandbox="allow-scripts"`). This prevents malicious profile pages from accessing your private keys in `localStorage`.
- **Granular Permissions:** You retain total control over your device. You can explicitly disable incoming voice/video calls, block strangers from contacting you, and strictly limit your network storage hosting budget.

---

## 🛠️ For Nerds: Under the Hood

- **Networking:** Hybrid architecture. Uses `BroadcastChannel` for local multi-tab sync, and a WebSocket signaling relay purely for exchanging WebRTC SDP offers. Once connected, all data flows through `RTCDataChannel`.
- **Identity:** Standard Web Crypto API. ECDSA (P-256) for signing all public feed posts to prove authorship. ECDH for deriving shared secrets.
- **Storage:** Large files (video, torrents) are chunked and stored in `IndexedDB`. Identity and lightweight settings are kept in `localStorage`.

### To-Do / Roadmap
- Implement WebTorrent protocol compatibility.
- Finish integrating the `MediaSource` sequential streaming engine for the TikTok video feed.

---
<div align="center">
  <i>Welcome to the Swarm.</i>
</div>
