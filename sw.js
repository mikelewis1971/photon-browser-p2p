// Photon Service Worker — Resolves photon-site:// requests via IndexedDB
const CACHE_NAME = 'photon-p2p-cache';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Intercept paths starting with /photon-site/
  if (url.pathname.startsWith('/photon-site/')) {
    event.respondWith(handleP2PRequest(event.request));
  }
  
  // Intercept paths starting with /photon-profile/
  if (url.pathname.startsWith('/photon-profile/')) {
    event.respondWith(handleProfileRequest(event.request));
  }
});

self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SEND_ACCESS_REQUEST') {
    // Relay the message to all active clients (like main.js)
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage(event.data);
    });
  }
});

async function handleProfileRequest(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const fingerprint = pathParts[1]; // /photon-profile/FINGERPRINT/HANDLE
  const handle = pathParts[2];
  
  // Generate a public profile shell
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Photon Profile: ${handle}</title>
        <style>
          body { background: #0d1117; color: #e6edf3; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #161b22; border: 1px solid #30363d; padding: 2rem; border-radius: 1rem; text-align: center; max-width: 400px; }
          .btn { background: #0ea5e9; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; margin-top: 1rem; }
          .handle { color: #8b949e; margin-bottom: 1rem; }
          .script-box { margin-top: 2rem; width: 100%; border-top: 1px solid #30363d; padding-top: 1rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #0ea5e9, #8b5cf6); border-radius: 50%; margin: 0 auto 1rem;"></div>
          <h1>${handle}</h1>
          <div class="handle">Photon P2P Client</div>
          <p>This is a public Photon profile. To see my feed, DMs, and private files, please request access.</p>
          <button class="btn" id="btn-request">Request Access</button>
          
          <div class="script-box">
            <h3>JS Script Runner</h3>
            <p style="font-size: 0.8rem; color: #8b949e;">Run verified scripts from this client.</p>
            <button class="btn" style="background: #30363d;">Explore Scripts</button>
          </div>
        </div>
        <script>
          document.getElementById('btn-request').onclick = () => {
            // Post message to parent/service worker to handle the DHT broadcast
            navigator.serviceWorker.controller.postMessage({
              type: 'SEND_ACCESS_REQUEST',
              target: '${fingerprint}'
            });
            alert('Access request sent to ${handle}!');
          };
        </script>
      </body>
    </html>
  `;
  
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

async function handleP2PRequest(request) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // Expected format: /photon-site/FINGERPRINT/SITE_ID
  if (pathParts.length < 3) return new Response('Invalid Photon URL', { status: 400 });
  
  const fingerprint = pathParts[1];
  const siteId = pathParts[2];
  const siteUrl = `photon-site://${fingerprint}/${siteId}`;
  
  // We need to access IndexedDB from the Service Worker
  // Since modules aren't easily shared, we'll implement a minimal IDB reader here
  const manifest = await getManifestFromIDB(siteUrl);
  if (!manifest) return new Response('Site not found in swarm', { status: 404 });
  
  // Combine chunks into a single response
  const chunks = [];
  for (const chunkInfo of manifest.chunks) {
    const data = await getChunkFromIDB(chunkInfo.hash);
    if (!data) return new Response('Missing piece: ' + chunkInfo.hash, { status: 503 });
    chunks.push(base64ToBuf(data));
  }
  
  const fullContent = new Blob(chunks, { type: manifest.type || 'text/html' });
  return new Response(fullContent, {
    headers: { 
      'Content-Type': manifest.type || 'text/html',
      'Content-Security-Policy': "sandbox allow-scripts"
    }
  });
}

// Minimal IDB helpers for SW
function getManifestFromIDB(siteUrl) {
  return new Promise((resolve) => {
    const req = indexedDB.open('photon_p2p_storage', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('manifests', 'readonly');
      // This is a bit tricky because we store by manifestHash, not siteUrl.
      // In a real app, we'd have a sites table. 
      // For now, let's assume the siteUrl *is* the manifest hash for simplicity.
      const siteHash = siteUrl.split('/').pop(); 
      const getReq = tx.objectStore('manifests').get(siteHash);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

function getChunkFromIDB(hash) {
  return new Promise((resolve) => {
    const req = indexedDB.open('photon_p2p_storage', 1);
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('chunks', 'readonly');
      const getReq = tx.objectStore('chunks').get(hash);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
