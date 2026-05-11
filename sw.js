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
});

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
    headers: { 'Content-Type': manifest.type || 'text/html' }
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
