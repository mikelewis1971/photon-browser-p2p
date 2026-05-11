import { generateKeypair, importPrivateKey, importPublicKey, sha256 } from './crypto.js';

const STORAGE_KEY = 'p2pweb_identity';

export async function getIdentity() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const id = JSON.parse(stored);
    // Re-import keys to get usable CryptoKey objects
    id.publicKey = await importPublicKey(id.publicKeyB64);
    id.privateKey = await importPrivateKey(id.privateKeyB64);
    return id;
  } catch (e) {
    console.error('Failed to load identity:', e);
    return null;
  }
}

export async function createNewIdentity(displayName = 'Anonymous') {
  const kp = await generateKeypair();
  const fingerprint = await sha256(kp.publicKeyB64);
  const identity = {
    fingerprint,
    displayName,
    publicKeyB64: kp.publicKeyB64,
    privateKeyB64: kp.privateKeyB64,
    bio: '',
    following: [],
    blocked: [],
    seq: 0,
    createdAt: Date.now()
  };
  saveIdentity(identity);
  return await getIdentity(); // Return with CryptoKey objects
}

export function saveIdentity(identity) {
  // Strip CryptoKey objects before storing
  const toStore = { ...identity };
  delete toStore.publicKey;
  delete toStore.privateKey;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
}

export async function importIdentityFromJson(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    const idData = typeof data.data?.p2pweb_identity === 'string' 
      ? JSON.parse(data.data.p2pweb_identity) 
      : data.data?.p2pweb_identity || data;
      
    // Normalize fields if they come from the export format
    const identity = {
      fingerprint: idData.fingerprint,
      displayName: idData.displayName || 'Michael Lewis',
      publicKeyB64: idData.publicKeyB64 || idData.publicKey?.x ? await deriveB64FromJwk(idData.publicKey) : idData.publicKeyB64,
      privateKeyB64: idData.privateKeyB64 || idData.privateKey?.d ? await deriveB64FromJwk(idData.privateKey, true) : idData.privateKeyB64,
      bio: idData.bio || '',
      following: idData.following || [],
      blocked: idData.blocked || [],
      seq: idData.seq || 0,
      createdAt: idData.createdAt || Date.now()
    };

    // If it's JWK format (as in the export), we need to handle that.
    // The export actually has JWKs. Let's fix the import.
    if (idData.publicKey?.kty === 'EC') {
      const pub = await crypto.subtle.importKey('jwk', idData.publicKey, {name:'ECDSA',namedCurve:'P-256'}, true, ['verify']);
      const priv = await crypto.subtle.importKey('jwk', idData.privateKey, {name:'ECDSA',namedCurve:'P-256'}, true, ['sign']);
      
      const pubBuf = await crypto.subtle.exportKey('spki', pub);
      const privBuf = await crypto.subtle.exportKey('pkcs8', priv);
      
      identity.publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(pubBuf)));
      identity.privateKeyB64 = btoa(String.fromCharCode(...new Uint8Array(privBuf)));
    }

    saveIdentity(identity);
    return await getIdentity();
  } catch (e) {
    console.error('Import failed:', e);
    throw new Error('Invalid identity format');
  }
}

async function deriveB64FromJwk(jwk, isPrivate = false) {
  const type = isPrivate ? 'pkcs8' : 'spki';
  const keyUsages = isPrivate ? ['sign'] : ['verify'];
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'ECDSA',namedCurve:'P-256'}, true, keyUsages);
  const buf = await crypto.subtle.exportKey(type, key);
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
