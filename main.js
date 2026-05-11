import { dht } from './lib/dht.js';
import { getIdentity, createNewIdentity, importIdentityFromJson, saveIdentity } from './lib/identity.js';
import { postToFeed, likePost, replyToPost, getLikes, getReplies } from './lib/feed.js';
import { sendChatMessage, subscribeToRoom } from './lib/chat.js';
import { torrent } from './lib/torrent.js';
import { webrtc } from './lib/webrtc.js';
import { signalRelay } from './lib/signal-relay.js';
import { reputation } from './lib/reputation.js';
import { handleIncomingDM, sendDM, getDMHistory } from './lib/dm-manager.js';
import { storageIDB } from './lib/storage-idb.js';
import { callManager } from './lib/call-manager.js';

let identity = null;
let currentView = 'feed';
let feedMode = 'global'; // 'global' or 'following'
const activeTransfers = new Map();

function escapeHTML(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm';
  if (s < 86400) return Math.floor(s/3600) + 'h';
  return Math.floor(s/86400) + 'd';
}

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
    
    // Listen for messages from the public profile page (via SW)
    navigator.serviceWorker.onmessage = (event) => {
      if (event.data.type === 'SEND_ACCESS_REQUEST') {
        dht.requestAccess(event.data.target);
      }
      if (event.data.type === 'START_CALL') {
        callManager.startCall(event.data.target, event.data.video);
      }
    };
  }
  identity = await getIdentity();
  if (!identity) { showSetup(); return; }

  document.getElementById('user-display-name').innerText = escapeHTML(identity.displayName);
  dht.init(identity);
  webrtc.init();
  signalRelay.connect(identity.fingerprint);

  dht.subscribe('dm:' + identity.fingerprint, async (msg) => {
    const decoded = await handleIncomingDM(identity, msg.data);
    if (decoded && currentView === 'dm') renderDM(document.getElementById('view-container'), decoded.from);
  });

  // Listen for Access Requests
  dht.on('signal', (msg) => {
    if (msg.data && msg.data.type === 'access_request') {
      handleIncomingAccessRequest(msg.data);
    }
  });

  torrent.on('download_progress', (data) => {
    activeTransfers.set(data.manifestHash, data);
    if (currentView === 'transfers') renderTransfers(document.getElementById('view-container'));
  });

  setupNav();
  setupMobileNav();
  setupCallOverlay();
  renderView('feed');
  updatePeerCount();
function handleIncomingAccessRequest(req) {
  // Show a notification or add to a pending list
  console.log('Incoming access request from:', req.displayName, req.handle);
  // For now, auto-approve if we want, or add to a pending list in the Peers view
  if (confirm(`Peer ${req.displayName} (@${req.handle}) is requesting access to your private feed. Allow?`)) {
    if (!identity.authorizedPeers) identity.authorizedPeers = [];
    if (!identity.authorizedPeers.includes(req.from)) {
      identity.authorizedPeers.push(req.from);
      saveIdentity(identity);
      alert('Access granted!');
    }
  }
}

setInterval(updatePeerCount, 5000);
}

function showSetup() {
  const main = document.querySelector('main');
  main.innerHTML = `
    <div class="view-content" style="text-align:center; padding-top: 10vh;">
      <h1>⚡ Welcome to Photon</h1>
      <p style="color:var(--text-dim)">The decentralized social network. No servers. No censorship. You own your data.</p>
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <h3>Create Your Identity</h3>
        <input type="text" id="setup-name" placeholder="Display Name">
        <input type="text" id="setup-handle" placeholder="User Handle (e.g. mike123)">
        <button class="btn btn-primary" id="btn-create" style="width:100%">Generate Keypair</button>
        <div style="margin-top: 1rem; border-top: 1px solid var(--border); padding-top: 1rem;">
          <p style="font-size: 0.8rem; color:var(--text-dim)">Or import existing identity</p>
          <input type="file" id="setup-import" style="display:none">
          <button class="btn btn-ghost" style="width:100%" onclick="document.getElementById('setup-import').click()">Import Identity</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('btn-create').onclick = async () => {
    const name = document.getElementById('setup-name').value || 'Anonymous';
    const handle = document.getElementById('setup-handle').value || '';
    identity = await createNewIdentity(name, handle);
    location.reload();
  };
  document.getElementById('setup-import').onchange = async (e) => {
    const file = e.target.files[0];
    identity = await importIdentityFromJson(await file.text());
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

function setupMobileNav() {
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.onclick = () => {
      document.querySelectorAll('.mobile-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      renderView(item.dataset.view);
    };
  });
}

function setupCallOverlay() {
  // Listen for call signals from the DHT
  dht.on('signal', (msg) => {
    if (msg.data && (msg.data.type === 'call_offer' || msg.data.type === 'call_answer' || msg.data.type === 'call_candidate' || msg.data.type === 'call_hangup')) {
      callManager.handleIncomingSignal(msg);
    }
  });

  // React to call state changes
  callManager.onStateChange = (cm) => {
    const overlay = document.getElementById('call-overlay');
    const inner = document.querySelector('.call-overlay-inner');
    const incoming = document.getElementById('incoming-call-ring');

    if (cm.callState === 'idle') {
      overlay.style.display = 'none';
      return;
    }

    overlay.style.display = 'flex';

    if (cm.callState === 'incoming') {
      inner.style.display = 'none';
      incoming.style.display = 'flex';
      document.getElementById('incoming-caller').innerText = cm._incomingDisplayName + (cm.isVideo ? ' (Video Call)' : ' (Voice Call)');

      document.getElementById('btn-accept').onclick = () => cm.acceptCall();
      document.getElementById('btn-reject').onclick = () => cm.rejectCall();
      return;
    }

    inner.style.display = 'flex';
    incoming.style.display = 'none';

    const peerName = document.getElementById('call-peer-name');
    const statusEl = document.getElementById('call-status');

    // Find the peer display name
    const peer = dht.getPeers().find(p => p.fingerprint === cm.currentCallPeer);
    peerName.innerText = peer?.displayName || cm.currentCallPeer?.substring(0,12) || 'Unknown';
    statusEl.innerText = cm.callState === 'ringing' ? 'Ringing...' : (cm.isVideo ? 'Video Call' : 'Voice Call');

    // Video feeds
    const videoArea = document.getElementById('call-video-area');
    const cameraBtn = document.getElementById('btn-camera');
    if (cm.isVideo) {
      videoArea.style.display = 'block';
      cameraBtn.style.display = 'flex';
      document.getElementById('remote-video').srcObject = cm.remoteStream;
      if (cm.localStream) {
        document.getElementById('local-video').srcObject = cm.localStream;
      }
    } else {
      videoArea.style.display = 'none';
      cameraBtn.style.display = 'none';
      // Still need audio for voice
      const rv = document.getElementById('remote-video');
      rv.srcObject = cm.remoteStream;
    }

    // Controls
    let isMuted = false;
    let isCameraOff = false;
    document.getElementById('btn-mute').onclick = () => {
      isMuted = !cm.toggleMute();
      document.getElementById('btn-mute').classList.toggle('muted', isMuted);
      document.getElementById('btn-mute').innerText = isMuted ? '🔇' : '🎤';
    };
    document.getElementById('btn-camera').onclick = () => {
      isCameraOff = !cm.toggleCamera();
      document.getElementById('btn-camera').classList.toggle('off', isCameraOff);
    };
    document.getElementById('btn-hangup').onclick = () => cm.hangup();
  };
}

function updatePeerCount() {
  const el = document.getElementById('peer-count');
  if (el) el.innerText = dht.getPeers().length + ' peers online';
}

function renderView(view) {
  currentView = view;
  const c = document.getElementById('view-container');
  const t = document.getElementById('view-title');
  switch(view) {
    case 'feed': t.innerText='Home'; renderFeed(c); break;
    case 'explore': t.innerText='Explore'; renderExplore(c); break;
    case 'videos': t.innerText='Videos'; renderVideos(c); break;
    case 'rooms': t.innerText='Rooms'; renderRooms(c); break;
    case 'profile': t.innerText='Profile'; renderProfile(c); break;
    case 'peers': t.innerText='Network'; renderPeers(c); break;
    case 'files': t.innerText='Files'; renderFiles(c); break;
    case 'transfers': t.innerText='Transfers'; renderTransfers(c); break;
    case 'dm': t.innerText='Messages'; break;
    case 'settings': t.innerText='Settings'; renderSettings(c); break;
    case 'builder': t.innerText='Profile Builder'; renderBuilder(c); break;
  }
}

// ========== FEED (Twitter-style) ==========
function getAllFeedMessages() {
  const own = dht.getMessages(identity.fingerprint);
  const peerMsgs = dht.getPeers().flatMap(p => dht.getMessages(p.fingerprint));
  const all = [...own, ...peerMsgs].filter(m => m.type === 'feed_post' || !m.type);
  all.sort((a,b) => b.timestamp - a.timestamp);
  const seen = new Set();
  return all.filter(m => { if (seen.has(m.hash)) return false; seen.add(m.hash); return true; });
}

function getFollowingFeedMessages() {
  const following = identity.following || [];
  const own = dht.getMessages(identity.fingerprint);
  const followedMsgs = following.flatMap(fp => dht.getMessages(fp));
  const all = [...own, ...followedMsgs].filter(m => m.type === 'feed_post' || !m.type);
  all.sort((a,b) => b.timestamp - a.timestamp);
  const seen = new Set();
  return all.filter(m => { if (seen.has(m.hash)) return false; seen.add(m.hash); return true; });
}

async function renderFeed(container) {
  container.innerHTML = `
    <div class="feed-tabs">
      <div class="feed-tab ${feedMode==='following'?'active':''}" data-mode="following">Following</div>
      <div class="feed-tab ${feedMode==='global'?'active':''}" data-mode="global">Global</div>
    </div>
    <div class="composer">
      <textarea id="feed-input" placeholder="What's on your mind?"></textarea>
      <div class="composer-footer">
        <div class="composer-actions">
          <input type="file" id="media-upload" accept="image/*,video/*" style="display:none">
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('media-upload').click()">📷 Media</button>
        </div>
        <button class="btn btn-primary" id="btn-post">Post</button>
      </div>
      <div id="media-preview" style="margin-top:0.5rem"></div>
    </div>
    <div id="feed-list"></div>
  `;

  document.querySelectorAll('.feed-tab').forEach(tab => {
    tab.onclick = () => { feedMode = tab.dataset.mode; renderFeed(container); };
  });

  let selectedMedia = null;
  document.getElementById('media-upload').onchange = (e) => {
    selectedMedia = e.target.files[0];
    if (selectedMedia) {
      const preview = document.getElementById('media-preview');
      if (selectedMedia.type.startsWith('image/')) {
        const url = URL.createObjectURL(selectedMedia);
        preview.innerHTML = `<img src="${url}" style="max-height:150px; border-radius:0.5rem">`;
      } else {
        preview.innerHTML = `<span style="color:var(--text-dim)">📎 ${escapeHTML(selectedMedia.name)}</span>`;
      }
    }
  };

  document.getElementById('btn-post').onclick = async () => {
    const text = document.getElementById('feed-input').value;
    if (!text && !selectedMedia) return;
    await postToFeed(identity, text, selectedMedia);
    selectedMedia = null;
    renderFeed(container);
  };

  const refreshFeed = () => {
    const messages = feedMode === 'following' ? getFollowingFeedMessages() : getAllFeedMessages();
    const list = document.getElementById('feed-list');
    if (!list) return;
    list.innerHTML = messages.map(m => renderPostCard(m)).join('');
    bindPostActions();
  };

  dht.on('new_message', refreshFeed);
  refreshFeed();
}

function renderPostCard(m) {
  const likes = getLikes(m.hash);
  const replies = getReplies(m.hash);
  const isLiked = likes.includes(identity.fingerprint);
  const isFollowing = (identity.following || []).includes(m.author);

  return `
    <div class="post" data-hash="${escapeHTML(m.hash)}">
      <div class="post-header">
        <div class="avatar"></div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:0.5rem">
            <span class="username">${escapeHTML(m.displayName)}</span>
            <span class="handle">@${escapeHTML((m.author||'').substring(0,8))}</span>
            <span class="timestamp">· ${timeAgo(m.timestamp)}</span>
          </div>
        </div>
        ${m.author !== identity.fingerprint ? `<button class="btn btn-sm ${isFollowing ? 'btn-ghost' : 'btn-primary'}" data-follow="${escapeHTML(m.author)}">${isFollowing ? 'Following' : 'Follow'}</button>` : ''}
      </div>
      <div class="post-body">${escapeHTML(m.text)}</div>
      ${m.media ? `<div class="post-media"><img src="#" data-media-hash="${escapeHTML(m.media)}" alt="media" onerror="this.style.display='none'"></div>` : ''}
      <div class="post-actions">
        <button class="post-action ${isLiked?'liked':''}" data-like="${escapeHTML(m.hash)}">
          <span>${isLiked?'❤️':'🤍'}</span> ${likes.length}
        </button>
        <button class="post-action" data-reply="${escapeHTML(m.hash)}">
          <span>💬</span> ${replies.length}
        </button>
        <button class="post-action" data-repost="${escapeHTML(m.hash)}">
          <span>🔁</span> Repost
        </button>
      </div>
      <div id="replies-${m.hash}" class="replies-drawer" style="display:none">
        ${replies.map(r => `
          <div class="reply">
            <div class="avatar" style="width:24px;height:24px"></div>
            <div><strong>${escapeHTML(r.displayName)}</strong> ${escapeHTML(r.text)}</div>
          </div>
        `).join('')}
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
          <input type="text" id="reply-input-${m.hash}" placeholder="Reply..." style="margin:0;font-size:0.85rem">
          <button class="btn btn-sm btn-primary" data-send-reply="${escapeHTML(m.hash)}">Reply</button>
        </div>
      </div>
    </div>
  `;
}

function bindPostActions() {
  document.querySelectorAll('[data-like]').forEach(btn => {
    btn.onclick = async () => {
      await likePost(identity, btn.dataset.like);
      btn.classList.add('liked','like-pop');
      renderView('feed');
    };
  });
  document.querySelectorAll('[data-reply]').forEach(btn => {
    btn.onclick = () => {
      const drawer = document.getElementById('replies-' + btn.dataset.reply);
      if (drawer) drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
    };
  });
  document.querySelectorAll('[data-send-reply]').forEach(btn => {
    btn.onclick = async () => {
      const input = document.getElementById('reply-input-' + btn.dataset.sendReply);
      if (input?.value) { await replyToPost(identity, btn.dataset.sendReply, input.value); renderView('feed'); }
    };
  });
  document.querySelectorAll('[data-follow]').forEach(btn => {
    btn.onclick = () => {
      const fp = btn.dataset.follow;
      if (!identity.following) identity.following = [];
      const idx = identity.following.indexOf(fp);
      if (idx === -1) identity.following.push(fp);
      else identity.following.splice(idx, 1);
      saveIdentity(identity);
      renderView(currentView);
    };
  });
}

// ========== EXPLORE (Trending) ==========
function renderExplore(container) {
  const all = getAllFeedMessages();
  const ranked = all.map(m => ({ ...m, score: getLikes(m.hash).length + getReplies(m.hash).length * 2 }));
  ranked.sort((a,b) => b.score - a.score);

  container.innerHTML = `
    <h3 style="margin-bottom:1rem">🔥 Trending on the Swarm</h3>
    ${ranked.slice(0, 20).map(m => renderPostCard(m)).join('') || '<p style="color:var(--text-dim)">No posts yet. Be the first!</p>'}
  `;
  bindPostActions();
}

// ========== VIDEOS (TikTok-style) ==========
function renderVideos(container) {
  const all = getAllFeedMessages().filter(m => m.mediaType?.startsWith('video/'));
  container.innerHTML = `
    <div class="composer" style="margin-bottom:1.5rem">
      <input type="file" id="video-upload" accept="video/*" style="display:none">
      <button class="btn btn-primary" onclick="document.getElementById('video-upload').click()" style="width:100%">🎬 Upload Video</button>
      <textarea id="video-caption" placeholder="Add a caption..." style="margin-top:0.75rem;display:none"></textarea>
      <button class="btn btn-primary" id="btn-post-video" style="display:none;margin-top:0.5rem">Post Video</button>
    </div>
    <div class="video-feed" id="video-feed">
      ${all.length === 0 ? '<p style="color:var(--text-dim);text-align:center">No videos yet. Upload the first one!</p>' : ''}
      ${all.map(m => `
        <div class="video-card">
          <div class="video-container">
            <div style="padding:3rem;text-align:center;color:var(--text-dim)">
              <div style="font-size:3rem">🎬</div>
              <div>Video: ${escapeHTML(m.media?.substring(0,12))}...</div>
              <button class="btn btn-primary btn-sm" style="margin-top:1rem" data-play-video="${escapeHTML(m.media)}">▶ Play</button>
            </div>
          </div>
          <div style="padding:1rem">
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
              <div class="avatar" style="width:28px;height:28px"></div>
              <span class="username" style="font-size:0.9rem">${escapeHTML(m.displayName)}</span>
              <span class="timestamp">· ${timeAgo(m.timestamp)}</span>
            </div>
            <div style="font-size:0.9rem">${escapeHTML(m.text)}</div>
            <div class="post-actions" style="margin-top:0.75rem">
              <button class="post-action" data-like="${escapeHTML(m.hash)}"><span>❤️</span> ${getLikes(m.hash).length}</button>
              <button class="post-action" data-reply="${escapeHTML(m.hash)}"><span>💬</span> ${getReplies(m.hash).length}</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  let videoFile = null;
  document.getElementById('video-upload').onchange = (e) => {
    videoFile = e.target.files[0];
    if (videoFile) {
      document.getElementById('video-caption').style.display = 'block';
      document.getElementById('btn-post-video').style.display = 'block';
    }
  };
  document.getElementById('btn-post-video').onclick = async () => {
    const caption = document.getElementById('video-caption').value || '';
    if (videoFile) { await postToFeed(identity, caption, videoFile); renderVideos(container); }
  };
  bindPostActions();
}

// ========== PROFILE ==========
function renderProfile(container) {
  const following = identity.following || [];
  const followers = dht.getPeers().filter(p => (p.following || []).includes(identity.fingerprint));
  const myPosts = dht.getMessages(identity.fingerprint).filter(m => m.type === 'feed_post' || !m.type);

  container.innerHTML = `
    <div class="profile-banner"></div>
    <div class="profile-info">
      <div class="profile-avatar"></div>
      <h2 style="margin:0">${escapeHTML(identity.displayName)}</h2>
      <div class="handle">@${escapeHTML(identity.userHandle)}</div>
      <div class="timestamp" style="margin-top:0.2rem; font-size:0.7rem; opacity:0.5">${identity.fingerprint}</div>
      <p style="margin-top:0.5rem;color:var(--text-dim)">${escapeHTML(identity.bio) || 'No bio yet.'}</p>
      <div class="profile-stats">
        <div class="profile-stat">
          <div class="profile-stat-value">${myPosts.length}</div>
          <div class="profile-stat-label">Posts</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-value">${following.length}</div>
          <div class="profile-stat-label">Following</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-value">${followers.length}</div>
          <div class="profile-stat-label">Followers</div>
        </div>
      </div>
    </div>
    <h3 style="margin-bottom:1rem">Your Posts</h3>
    ${myPosts.map(m => renderPostCard(m)).join('') || '<p style="color:var(--text-dim)">No posts yet.</p>'}
  `;

  bindPostActions();
}

// ========== SETTINGS ==========
function renderSettings(container) {
  container.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:1.5rem">Identity & Profile</h3>
      <div style="display:flex;gap:1rem;margin-bottom:0.5rem">
        <div style="flex:1">
          <label style="display:block;color:var(--text-dim);font-size:0.8rem;margin-bottom:0.25rem">Display Name</label>
          <input type="text" id="settings-name" value="${escapeHTML(identity.displayName)}" placeholder="Display Name">
        </div>
        <div style="flex:1">
          <label style="display:block;color:var(--text-dim);font-size:0.8rem;margin-bottom:0.25rem">User Handle</label>
          <input type="text" id="settings-handle" value="${escapeHTML(identity.userHandle)}" placeholder="User Handle">
        </div>
      </div>
      <div>
        <label style="display:block;color:var(--text-dim);font-size:0.8rem;margin-bottom:0.25rem">Bio</label>
        <textarea id="settings-bio" placeholder="Your Bio">${escapeHTML(identity.bio || '')}</textarea>
      </div>
      <button class="btn btn-primary" id="btn-save-profile" style="margin-right:1rem">Save Changes</button>
      <button class="btn btn-secondary" onclick="renderView('builder')">🎨 Open HTML Profile Builder</button>
    </div>
    
    <div class="card">
      <h3 style="margin-bottom:1.5rem">Security & Backup</h3>
      <div style="margin-bottom:1.5rem">
        <label style="display:block;color:var(--text-dim);font-size:0.8rem;margin-bottom:0.25rem">Your Public Fingerprint</label>
        <div style="background:rgba(0,0,0,0.5);padding:1rem;border-radius:var(--radius-md);font-family:monospace;font-size:0.9rem;word-break:break-all;border:1px solid var(--border)">
          ${identity.fingerprint}
        </div>
      </div>
      <button class="btn btn-secondary" id="btn-export-identity">Export Identity Backup</button>
    </div>

    <div class="card" style="border-color:var(--danger)">
      <h3 style="margin-bottom:1rem;color:var(--danger)">Danger Zone</h3>
      <p style="color:var(--text-dim);font-size:0.95rem;margin-bottom:1.5rem">Log out of this identity. Make sure you have exported your identity backup first, or you will lose access forever!</p>
      <button class="btn btn-danger" id="btn-logout">Logout / Clear Local Data</button>
    </div>
  `;

  document.getElementById('btn-save-profile').onclick = () => {
    identity.displayName = document.getElementById('settings-name').value;
    identity.userHandle = document.getElementById('settings-handle').value;
    identity.bio = document.getElementById('settings-bio').value;
    saveIdentity(identity);
    alert('Profile saved successfully!');
    document.getElementById('user-display-name').innerText = escapeHTML(identity.displayName);
  };

  document.getElementById('btn-export-identity').onclick = () => {
    const blob = new Blob([JSON.stringify({data:{p2pweb_identity: identity}})], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'photon-identity.json'; a.click();
  };

  document.getElementById('btn-logout').onclick = () => {
    if (confirm('Are you sure you want to log out? If you haven\\'t exported your identity backup, you will lose it permanently.')) {
      localStorage.removeItem('p2pweb_identity');
      location.reload();
    }
  };
}

// ========== PEERS ==========
function renderPeers(container) {
  const peers = dht.getPeers();
  container.innerHTML = `
    <div class="card">
      <div id="peers-list">
        ${peers.map(p => {
          const isFollowing = (identity.following||[]).includes(p.fingerprint);
          const isAuthorized = (identity.authorizedPeers||[]).includes(p.fingerprint);
          const handle = p.userHandle || p.fingerprint.substring(0,12);
          return `
          <div class="peer-item" style="justify-content:space-between">
            <div style="display:flex;align-items:center;gap:1rem">
              <div class="status-dot"></div>
              <div>
                <div class="username">${escapeHTML(p.displayName)}</div>
                <div class="handle">
                  @${escapeHTML(handle)}
                  ${isAuthorized ? '<span style="margin-left:0.5rem;color:var(--success);font-weight:600">✓ Authorized</span>' : ''}
                </div>
              </div>
            </div>
            <div style="display:flex;gap:0.5rem">
              <a href="/photon-profile/${escapeHTML(p.fingerprint)}/${escapeHTML(handle)}" target="_blank" class="btn btn-sm btn-ghost">Profile</a>
              <button class="btn btn-sm ${isFollowing?'btn-ghost':'btn-primary'}" data-follow="${escapeHTML(p.fingerprint)}">${isFollowing?'Following':'Follow'}</button>
              <button class="btn btn-secondary btn-sm" onclick="window.startDM('${escapeHTML(p.fingerprint)}')">DM</button>
              <button class="btn btn-sm btn-ghost" onclick="window.startCall('${escapeHTML(p.fingerprint)}', false)" title="Voice Call">📞</button>
              <button class="btn btn-sm btn-ghost" onclick="window.startCall('${escapeHTML(p.fingerprint)}', true)" title="Video Call">📹</button>
            </div>
          </div>`;
        }).join('') || '<p style="color:var(--text-dim)">Searching for peers...</p>'}
      </div>
    </div>
  `;
  bindPostActions();
}

window.startDM = (peerId) => {
  document.getElementById('view-title').innerText = 'DM with @' + peerId.substring(0,8);
  currentView = 'dm';
  renderDM(document.getElementById('view-container'), peerId);
};

window.startCall = (peerId, video = false) => {
  callManager.startCall(peerId, video);
};

function renderDM(container, peerId) {
  const history = getDMHistory(peerId);
  container.innerHTML = `
    <div class="card" style="display:flex;flex-direction:column;height:60vh;">
      <div id="dm-messages" style="flex:1;overflow-y:auto;margin-bottom:1rem;display:flex;flex-direction:column;gap:0.5rem;">
        ${history.map(m => `
          <div style="align-self:${m.outgoing?'flex-end':'flex-start'};background:${m.outgoing?'var(--primary-glow)':'var(--bg-darker)'};padding:0.5rem 1rem;border-radius:1rem;max-width:80%;">
            <div style="font-size:0.7rem;opacity:0.6">${m.outgoing?'You':'Peer'}</div>
            <div>${escapeHTML(m.text)}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:0.5rem;">
        <input type="text" id="dm-input" placeholder="Encrypted message..." style="margin:0">
        <button class="btn btn-primary" id="btn-send-dm">Send</button>
        <button class="btn btn-ghost" id="btn-dm-call" title="Voice Call">📞</button>
        <button class="btn btn-ghost" id="btn-dm-video" title="Video Call">📹</button>
      </div>
    </div>
  `;
  document.getElementById('btn-send-dm').onclick = async () => {
    const text = document.getElementById('dm-input').value;
    if (!text) return;
    const peer = dht.getPeers().find(p => p.fingerprint === peerId);
    await sendDM(identity, peer, text);
    renderDM(container, peerId);
  };
  document.getElementById('btn-dm-call').onclick = () => window.startCall(peerId, false);
  document.getElementById('btn-dm-video').onclick = () => window.startCall(peerId, true);
}

// ========== TRANSFERS ==========
function renderTransfers(container) {
  const transfers = Array.from(activeTransfers.values());
  container.innerHTML = `
    <div class="card">
      ${transfers.map(t => `
        <div style="margin-bottom:1.5rem">
          <div style="display:flex;justify-content:space-between;margin-bottom:0.5rem">
            <span>${escapeHTML(t.name)||'Unknown'}</span><span>${t.percent}%</span>
          </div>
          <div style="height:8px;background:var(--bg-darker);border-radius:4px;overflow:hidden">
            <div style="height:100%;width:${t.percent}%;background:var(--primary);transition:width 0.3s"></div>
          </div>
        </div>
      `).join('') || '<p style="color:var(--text-dim)">No active downloads</p>'}
    </div>
  `;
}

// ========== FILES ==========
async function renderFiles(container) {
  container.innerHTML = `
    <div class="card">
      <h3>Publish P2P Site</h3>
      <input type="file" id="file-upload" accept=".html"><button class="btn btn-primary" id="btn-publish">Publish</button>
      <p id="upload-status" style="font-size:0.8rem;color:var(--text-dim);margin-top:0.5rem"></p>
    </div>
  `;
  const { publishPage } = await import('./lib/webhosting.js');
  document.getElementById('btn-publish').onclick = async () => {
    const file = document.getElementById('file-upload').files[0];
    if (!file) return;
    const status = document.getElementById('upload-status');
    status.innerText = 'Publishing...';
    const text = await file.text();
    const site = await publishPage(identity, file.name.split('.')[0], text);
    status.innerHTML = `<span style="color:var(--success)">Published!</span> Magnet: photon://${site.manifestHash}`;
  };
}

// ========== ROOMS ==========
function renderRooms(container) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:200px 1fr;gap:1rem;height:60vh;">
      <div class="card" style="padding:1rem"><h4>Channels</h4>
        <div class="nav-item active" style="padding:0.5rem">#lobby</div>
        <div class="nav-item" style="padding:0.5rem">#dev</div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;">
        <div id="chat-messages" style="flex:1;overflow-y:auto;margin-bottom:1rem;"></div>
        <div style="display:flex;gap:0.5rem;">
          <input type="text" id="chat-input" placeholder="Message #lobby" style="margin:0">
          <button class="btn btn-primary" id="btn-chat">Send</button>
        </div>
      </div>
    </div>
  `;
}

// ========== HTML BUILDER ==========
function renderBuilder(container) {
  // Use existing custom HTML or provide a basic template
  const defaultHtml = identity.customProfileHtml || `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; background: #050505; color: #fff; text-align: center; padding: 50px; }
    h1 { color: #00f0ff; }
  </style>
</head>
<body>
  <h1>Hello, I'm ${escapeHTML(identity.displayName)}</h1>
  <p>Welcome to my custom P2P profile.</p>
</body>
</html>`;

  container.innerHTML = `
    <div class="card" style="margin-bottom:1.5rem; border:1px solid var(--primary); background:rgba(0,240,255,0.05)">
      <h3 style="color:var(--primary); margin-bottom:0.75rem; font-size:1.2rem">✨ AI-Powered Profile Builder</h3>
      <p style="color:var(--text-main); font-size:0.95rem; line-height:1.6">
        Don't know how to code? No problem! Just go to any AI (like ChatGPT or Gemini), tell it to "Build a cool HTML profile page for me", and copy/paste the result below. Once you're happy with how it looks in the live preview, click Save & Publish!
      </p>
    </div>
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; height: 50vh; min-height:400px; margin-bottom:1.5rem">
      <div style="display:flex; flex-direction:column;">
        <h4 style="margin-bottom:0.75rem; color:var(--text-dim)">HTML Editor</h4>
        <textarea id="builder-input" style="flex:1; font-family:monospace; font-size:0.85rem; padding:1rem; white-space:pre; overflow-wrap:normal; overflow-x:scroll; background:rgba(0,0,0,0.8); border:1px solid var(--border); border-radius:var(--radius-md); resize:none;">${escapeHTML(defaultHtml)}</textarea>
      </div>
      <div style="display:flex; flex-direction:column;">
        <h4 style="margin-bottom:0.75rem; color:var(--text-dim)">Live Preview</h4>
        <div style="flex:1; background:#fff; border-radius:var(--radius-md); overflow:hidden; border:1px solid var(--border)">
          <iframe id="builder-preview" style="width:100%; height:100%; border:none;" sandbox="allow-scripts"></iframe>
        </div>
      </div>
    </div>
    <div style="display:flex; gap:1rem;">
      <button class="btn btn-primary" id="btn-publish-profile">🚀 Save & Publish Profile</button>
      <button class="btn btn-secondary" onclick="renderView('settings')">Back to Settings</button>
    </div>
  `;

  const input = document.getElementById('builder-input');
  const preview = document.getElementById('builder-preview');

  const updatePreview = () => {
    preview.srcdoc = input.value;
  };

  input.addEventListener('input', updatePreview);
  updatePreview(); // initial render

  document.getElementById('btn-publish-profile').onclick = async () => {
    const html = input.value;
    identity.customProfileHtml = html;
    
    // We can also automatically publish this as a P2P site using webhosting
    const { publishPage } = await import('./lib/webhosting.js');
    const site = await publishPage(identity, 'profile', html);
    identity.profileSiteHash = site.manifestHash; // Save the magnet link to identity
    
    saveIdentity(identity);
    alert('Profile published to the swarm! Magnet link saved to identity.\\n\\nOther peers will be able to load this custom HTML when they visit your profile.');
  };
}

init();
