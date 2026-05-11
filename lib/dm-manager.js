import { dht } from './dht.js';
import { encrypt, decrypt, deriveSharedSecret, sign, sha256 } from './crypto.js';

export async function sendDM(identity, targetPeer, text) {
  const secret = await deriveSharedSecret(identity.privateKey, targetPeer.publicKeyB64);
  const encrypted = await encrypt(text, secret);
  
  const msg = {
    type: 'dm_message',
    target: targetPeer.fingerprint,
    from: identity.fingerprint,
    data: encrypted,
    timestamp: Date.now()
  };
  
  const msgStr = JSON.stringify(msg);
  const signature = await sign(identity.privateKey, msgStr);
  const hash = await sha256(msgStr + signature);
  
  const signedDM = { ...msg, signature, hash };
  dht.publish('dm:' + targetPeer.fingerprint, signedDM);
  
  // Store locally
  saveDM(targetPeer.fingerprint, { ...signedDM, text, outgoing: true });
  return signedDM;
}

export function saveDM(peerId, msg) {
  const key = 'p2p_dm_' + peerId;
  const history = JSON.parse(localStorage.getItem(key) || '[]');
  history.push(msg);
  localStorage.setItem(key, JSON.stringify(history.slice(-100)));
}

export function getDMHistory(peerId) {
  return JSON.parse(localStorage.getItem('p2p_dm_' + peerId) || '[]');
}

export async function handleIncomingDM(identity, msg) {
  if (msg.target !== identity.fingerprint) return null;
  
  const peers = dht.getPeers();
  const sender = peers.find(p => p.fingerprint === msg.from);
  if (!sender) return null;
  
  const secret = await deriveSharedSecret(identity.privateKey, sender.publicKeyB64);
  try {
    const text = await decrypt(msg.data, secret);
    const decoded = { ...msg, text, outgoing: false };
    saveDM(msg.from, decoded);
    return decoded;
  } catch (e) {
    console.error('Failed to decrypt DM:', e);
    return null;
  }
}
