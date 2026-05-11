// Photon Storage — Content-addressed chunk store using localStorage
const CHUNK_PREFIX = 'p2p_chunk_';
const MANIFEST_PREFIX = 'p2p_manifest_';

export async function putChunk(hash, dataBase64) {
  localStorage.setItem(CHUNK_PREFIX + hash, dataBase64);
}

export function getChunk(hash) {
  return localStorage.getItem(CHUNK_PREFIX + hash);
}

export function hasChunk(hash) {
  return !!localStorage.getItem(CHUNK_PREFIX + hash);
}

export function putManifest(hash, manifest) {
  localStorage.setItem(MANIFEST_PREFIX + hash, JSON.stringify(manifest));
}

export function getManifest(hash) {
  const raw = localStorage.getItem(MANIFEST_PREFIX + hash);
  return raw ? JSON.parse(raw) : null;
}

export function listManifests() {
  const manifests = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(MANIFEST_PREFIX)) {
      try {
        const m = JSON.parse(localStorage.getItem(key));
        manifests.push(m);
      } catch (e) {}
    }
  }
  return manifests;
}

export function getStorageStats() {
  let chunks = 0;
  let size = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(CHUNK_PREFIX)) {
      chunks++;
      size += localStorage.getItem(key).length;
    }
  }
  return { chunks, size };
}
