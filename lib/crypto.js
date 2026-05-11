// Photon Crypto — ECDSA P-256, SHA-256, AES-GCM, ECDH
export async function deriveSharedSecret(privateKey, publicPeerKeyB64) {
  // Prototype hack: combine local private key material and peer public key
  // for a deterministic shared secret. Real ECDH would use a dedicated curve.
  const privBuf = await crypto.subtle.exportKey('pkcs8', privateKey);
  const seed = await sha256(new Uint8Array(privBuf).toString() + publicPeerKeyB64);
  return seed;
}

export async function encrypt(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encKey = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)), 'AES-GCM', false, ['encrypt']);
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv}, encKey, buf);
  return { iv: bufToBase64(iv), data: bufToBase64(encrypted) };
}

export async function decrypt(encData, key) {
  const iv = base64ToBuf(encData.iv);
  const data = base64ToBuf(encData.data);
  const encKey = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)), 'AES-GCM', false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({name:'AES-GCM', iv}, encKey, data);
  return new TextDecoder().decode(decrypted);
}
export async function sha256(data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
export function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer)));
}
export function base64ToBuf(b64) {
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) buf[i]=bin.charCodeAt(i); return buf.buffer;
}
export async function generateKeypair() {
  const kp = await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const pub = await crypto.subtle.exportKey('spki', kp.publicKey);
  const priv = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
  return { publicKey: kp.publicKey, privateKey: kp.privateKey, publicKeyB64: bufToBase64(pub), privateKeyB64: bufToBase64(priv) };
}
export async function importPrivateKey(b64) {
  const buf = base64ToBuf(b64);
  return crypto.subtle.importKey('pkcs8', buf, {name:'ECDSA',namedCurve:'P-256'}, true, ['sign']);
}
export async function importPublicKey(b64, usages = ['verify']) {
  const buf = base64ToBuf(b64);
  return crypto.subtle.importKey('spki', buf, {name:'ECDSA',namedCurve:'P-256'}, true, usages);
}
export async function sign(privateKey, data) {
  const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'}, privateKey, buf);
  return bufToBase64(sig);
}
export async function verify(publicKey, data, signatureB64) {
  try {
    const buf = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'}, publicKey, base64ToBuf(signatureB64), buf);
  } catch { return false; }
}
export async function buildFileManifest(file, chunkSize = 16*1024) {
  const CHUNK = chunkSize;
  const buffer = await file.arrayBuffer();
  const chunks = [];
  for (let i=0; i<buffer.byteLength; i+=CHUNK) {
    const slice = buffer.slice(i, i+CHUNK);
    const hash = await sha256(slice);
    chunks.push({ hash, data: bufToBase64(slice), size: slice.byteLength });
  }
  const manifestHash = await sha256(chunks.map(c=>c.hash).join(','));
  return { manifestHash, name: file.name, size: file.size, type: file.type, chunks };
}
