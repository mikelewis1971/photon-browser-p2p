import { sign, verify, sha256 } from './crypto.js';
import { dht } from './dht.js';

export async function postToFeed(identity, text) {
  const post = {
    type: 'feed_post',
    author: identity.fingerprint,
    displayName: identity.displayName,
    text,
    timestamp: Date.now(),
    seq: identity.seq++
  };
  
  const postStr = JSON.stringify(post);
  const signature = await sign(identity.privateKey, postStr);
  const hash = await sha256(postStr + signature);
  
  const signedPost = { ...post, signature, hash };
  
  dht.putMessage(signedPost);
  return signedPost;
}

export async function validatePost(post, publicKey) {
  const { signature, hash, ...data } = post;
  const postStr = JSON.stringify(data);
  const isValidSig = await verify(publicKey, postStr, signature);
  if (!isValidSig) return false;
  
  const calculatedHash = await sha256(postStr + signature);
  return calculatedHash === hash;
}
