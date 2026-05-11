import { dht } from './lib/dht.js';
import { getIdentity, createNewIdentity, importIdentityFromJson } from './lib/identity.js';
import { postToFeed } from './lib/feed.js';
import { sendChatMessage, subscribeToRoom } from './lib/chat.js';
import { torrent } from './lib/torrent.js';
import { webrtc } from './lib/webrtc.js';
import { signalRelay } from './lib/signal-relay.js';
import { reputation } from './lib/reputation.js';
import { handleIncomingDM, sendDM, getDMHistory } from './lib/dm-manager.js';

let identity = null;
let currentView = 'feed';
const activeTransfers = new Map();

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(() => console.log('SW Registered'));
  }
  
  identity = await getIdentity();
  if (!identity) {
    showSetup();
    return;
  }
  
  dht.init(identity);
  webrtc.init();
  signalRelay.connect(identity.fingerprint);
  
  // Listen for DMs
  dht.subscribe('dm:' + identity.fingerprint, async (msg) => {
    const decoded = await handleIncomingDM(identity, msg.data);
    if (decoded && currentView === 'dm') renderDM(document.getElementById('view-container'), decoded.from);
  });

  // Listen for Downloads
  torrent.on('download_progress', (data) => {
    activeTransfers.set(data.manifestHash, data);
    if (currentView === 'transfers') renderTransfers(document.getElementById('view-container'));
  });

  setupNav();
  renderView('feed');
  updatePeerCount();
  
  setInterval(updatePeerCount, 5000);
}

function showSetup() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <div class="view-content" style="text-align:center; padding-top: 10vh;">
      <h1>Welcome to Photon</h1>
      <p>Decentralized. Private. Peer-to-Peer.</p>
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h3>Create Identity</h3>
        <input type="text" id="setup-name" placeholder="Display Name">
        <button class="btn btn-primary" id="btn-create">Generate Keypair</button>
        <div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 1rem;">
          <p style="font-size: 0.8rem;">Or import from export.json</p>
          <input type="file" id="setup-import" style="display:none">
          <button class="btn btn-secondary" onclick="document.getElementById('setup-import').click()">Import Identity</button>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('btn-create').onclick = async () => {
    const name = document.getElementById('setup-name').value || 'Anonymous';
    identity = await createNewIdentity(name);
    location.reload();
  };
  
  document.getElementById('setup-import').onchange = async (e) => {
    const file = e.target.files[0];
    const text = await file.text();
    identity = await importIdentityFromJson(text);
    location.reload();
  };
}

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.onclick = () => {
      document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      renderView(item.dataset.view);
    };
  });
}

function updatePeerCount() {
  const peers = dht.getPeers();
  const countEl = document.getElementById('peer-count');
  if (countEl) countEl.innerText = peers.length + ' peers online';
}

function renderView(view) {
  currentView = view;
  const content = document.getElementById('view-container');
  const title = document.getElementById('view-title');
  
  switch(view) {
    case 'feed':
      title.innerText = 'Global Feed';
      renderFeed(content);
      break;
    case 'files':
      title.innerText = 'P2P Files';
      renderFiles(content);
      break;
    case 'rooms':
      title.innerText = 'Public Rooms';
      renderRooms(content);
      break;
    case 'peers':
      title.innerText = 'Network Discovery';
      renderPeers(content);
      break;
    case 'transfers':
      title.innerText = 'Active Transfers';
      renderTransfers(content);
      break;
    case 'dm':
      title.innerText = 'Direct Messages';
      // peerId passed via view state or similar
      break;
  }
}

async function renderFeed(container) {
  container.innerHTML = `
    <div class="card">
      <textarea id="feed-input" placeholder="What's happening in the swarm?"></textarea>
      <button class="btn btn-primary" id="btn-post">Post to Swarm</button>
    </div>
    <div id="feed-list"></div>
  `;
  
  document.getElementById('btn-post').onclick = async () => {
    const text = document.getElementById('feed-input').value;
    if (!text) return;
    await postToFeed(identity, text);
    document.getElementById('feed-input').value = '';
    // The feed will update via DHT events
  };
  
  const refreshFeed = () => {
    const messages = dht.getMessages(identity.fingerprint); // Should ideally get from all followed peers
    const list = document.getElementById('feed-list');
    if (!list) return;
    list.innerHTML = messages.map(m => `
      <div class="post">
        <div class="post-header">
          <div class="avatar"></div>
          <div>
            <div class="username">${escapeHTML(m.displayName)}</div>
            <div class="timestamp">${new Date(m.timestamp).toLocaleString()}</div>
          </div>
        </div>
        <div class="post-body">${escapeHTML(m.text)}</div>
      </div>
    `).join('');
  };
  
  dht.on('new_message', refreshFeed);
  refreshFeed();
}

function renderFiles(container) {
  container.innerHTML = `
    <div class="card">
      <h3>Publish P2P Site</h3>
      <p style="font-size:0.8rem; color:var(--text-dim); margin-bottom:1rem">Upload an HTML file to host it on the swarm.</p>
      <input type="file" id="file-upload" accept=".html">
      <button class="btn btn-primary" id="btn-publish">Publish to Swarm</button>
      <p id="upload-status" style="font-size:0.8rem; color:var(--text-dim); margin-top:1rem"></p>
    </div>
    <div class="card">
      <h3>Download by Magnet Link</h3>
      <input type="text" id="magnet-input" placeholder="photon://...">
      <button class="btn btn-primary" id="btn-download">Download</button>
    </div>
  `;
  
  const { publishPage } = await import('./lib/webhosting.js');
  
  document.getElementById('btn-publish').onclick = async () => {
    const file = document.getElementById('file-upload').files[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    status.innerText = 'Chunking and signing...';
    
    const text = await file.text();
    const site = await publishPage(identity, file.name.split('.')[0], text);
    
    status.innerHTML = `
      <div style="color:var(--success); font-weight:600">Successfully Published!</div>
      <div style="margin-top:0.5rem">URL: <a href="/photon-site/${identity.fingerprint}/${site.manifestHash}" target="_blank" style="color:var(--primary)">View Site</a></div>
      <div style="font-size:0.7rem; margin-top:0.3rem">Magnet: photon://${site.manifestHash}</div>
    `;
  };
}

function renderPeers(container) {
  const peers = dht.getPeers();
  container.innerHTML = `
    <div class="card">
      <div id="peers-list">
        ${peers.map(p => `
          <div class="peer-item" style="justify-content:space-between">
            <div style="display:flex; align-items:center; gap:1rem">
              <div class="status-dot"></div>
              <div>
                <div class="username">${escapeHTML(p.displayName)}</div>
                <div class="timestamp" style="font-size:0.7rem">${escapeHTML(p.fingerprint)}</div>
                <div class="badge" style="font-size:0.6rem; background:rgba(14,165,233,0.1); padding:2px 6px; border-radius:4px; color:var(--primary)">
                  ${reputation.getTier(p.fingerprint)}
                </div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="window.startDM('${escapeHTML(p.fingerprint)}')">Message</button>
          </div>
        `).join('') || '<p>Searching for peers...</p>'}
      </div>
    </div>
  `;
}

window.startDM = (peerId) => {
  const content = document.getElementById('view-container');
  document.getElementById('view-title').innerText = 'DM with ' + peerId.substring(0,8);
  currentView = 'dm';
  renderDM(content, peerId);
};

function renderDM(container, peerId) {
  const history = getDMHistory(peerId);
  container.innerHTML = `
    <div class="card" style="display:flex; flex-direction:column; height: 60vh;">
      <div id="dm-messages" style="flex:1; overflow-y:auto; margin-bottom:1rem; display:flex; flex-direction:column; gap:0.5rem;">
        ${history.map(m => `
          <div style="align-self: ${m.outgoing ? 'flex-end' : 'flex-start'}; background: ${m.outgoing ? 'var(--primary-glow)' : 'var(--bg-darker)'}; padding: 0.5rem 1rem; border-radius: 1rem; max-width: 80%;">
            <div style="font-size:0.7rem; opacity:0.6">${m.outgoing ? 'You' : 'Peer'}</div>
            <div>${escapeHTML(m.text)}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex; gap:0.5rem;">
        <input type="text" id="dm-input" placeholder="Secure message..." style="margin-bottom:0">
        <button class="btn btn-primary" id="btn-send-dm">Send</button>
      </div>
    </div>
  `;
  
  document.getElementById('btn-send-dm').onclick = async () => {
    const text = document.getElementById('dm-input').value;
    if (!text) return;
    const targetPeer = dht.getPeers().find(p => p.fingerprint === peerId);
    await sendDM(identity, targetPeer, text);
    renderDM(container, peerId);
  };
}

function renderTransfers(container) {
  const transfers = Array.from(activeTransfers.values());
  container.innerHTML = `
    <div class="card">
      ${transfers.map(t => `
        <div style="margin-bottom:1.5rem">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem">
            <span>${escapeHTML(t.name) || 'Unknown File'}</span>
            <span>${t.percent}%</span>
          </div>
          <div style="height:8px; background:var(--bg-darker); border-radius:4px; overflow:hidden">
            <div style="height:100%; width:${t.percent}%; background:var(--primary); transition: width 0.3s"></div>
          </div>
          <div style="font-size:0.7rem; color:var(--text-dim); margin-top:0.3rem">
            ${t.completed} / ${t.total} pieces
          </div>
        </div>
      `).join('') || '<p>No active downloads</p>'}
    </div>
  `;
}

function renderRooms(container) {
  container.innerHTML = `
    <div style="display:grid; grid-template-columns: 200px 1fr; gap: 1rem; height: 60vh;">
      <div class="card" style="padding:1rem;">
        <h4>Channels</h4>
        <div class="nav-item active" style="padding:0.5rem">#lobby</div>
        <div class="nav-item" style="padding:0.5rem">#dev</div>
      </div>
      <div class="card" style="display:flex; flex-direction:column;">
        <div id="chat-messages" style="flex:1; overflow-y:auto; margin-bottom:1rem;"></div>
        <div style="display:flex; gap:0.5rem;">
          <input type="text" id="chat-input" placeholder="Message #lobby" style="margin-bottom:0">
          <button class="btn btn-primary" id="btn-chat">Send</button>
        </div>
      </div>
    </div>
  `;
}

init();
