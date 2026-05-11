import { dht } from './dht.js';
import { sign, verify, sha256 } from './crypto.js';

export async function sendChatMessage(identity, room, text) {
  const msg = {
    type: 'chat_message',
    room,
    author: identity.fingerprint,
    displayName: identity.displayName,
    text,
    timestamp: Date.now()
  };
  
  const msgStr = JSON.stringify(msg);
  const signature = await sign(identity.privateKey, msgStr);
  const hash = await sha256(msgStr + signature);
  
  const signedMsg = { ...msg, signature, hash };
  dht.publish('chat:' + room, signedMsg);
  return signedMsg;
}

export function subscribeToRoom(room, callback) {
  return dht.subscribe('chat:' + room, (msg) => {
    callback(msg.data);
  });
}

// DM logic would go here, requiring ECDH for encryption keys.
// For now, let's focus on public rooms.
