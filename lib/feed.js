import { sign, verify, sha256, buildFileManifest } from './crypto.js';
import { dht } from './dht.js';
import { storageIDB } from './storage-idb.js';

// ---- Post Types ----
// feed_post: Standard text/media post
// feed_reply: Reply to another post
// feed_like: Like another post
// feed_repost: Repost another post's hash

export async function postToFeed(identity, text, mediaFile = null) {
  let mediaHash = null;
  
  // If media is attached, chunk it and store it
  if (mediaFile) {
    const manifest = await buildFileManifest(mediaFile);
    for (const chunk of manifest.chunks) {
      await storageIDB.putChunk(chunk.hash, chunk.data);
    }
    await storageIDB.putManifest(manifest.manifestHash, manifest);
    mediaHash = manifest.manifestHash;
  }

  const post = {
    type: 'feed_post',
    author: identity.fingerprint,
    displayName: identity.displayName,
    text,
    media: mediaHash,
    mediaType: mediaFile?.type || null,
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

export async function likePost(identity, postHash) {
  const like = {
    type: 'feed_like',
    author: identity.fingerprint,
    target: postHash,
    timestamp: Date.now()
  };
  const likeStr = JSON.stringify(like);
  const signature = await sign(identity.privateKey, likeStr);
  const hash = await sha256(likeStr + signature);
  
  const signedLike = { ...like, signature, hash };
  dht.putMessage(signedLike);
  
  // Store locally
  const key = 'p2p_likes_' + postHash;
  const likes = JSON.parse(localStorage.getItem(key) || '[]');
  if (!likes.includes(identity.fingerprint)) {
    likes.push(identity.fingerprint);
    localStorage.setItem(key, JSON.stringify(likes));
  }
  return signedLike;
}

export function getLikes(postHash) {
  return JSON.parse(localStorage.getItem('p2p_likes_' + postHash) || '[]');
}

export async function replyToPost(identity, parentHash, text) {
  const reply = {
    type: 'feed_reply',
    author: identity.fingerprint,
    displayName: identity.displayName,
    parentHash,
    text,
    timestamp: Date.now(),
    seq: identity.seq++
  };
  const replyStr = JSON.stringify(reply);
  const signature = await sign(identity.privateKey, replyStr);
  const hash = await sha256(replyStr + signature);
  
  const signedReply = { ...reply, signature, hash };
  dht.putMessage(signedReply);
  
  // Store locally
  const key = 'p2p_replies_' + parentHash;
  const replies = JSON.parse(localStorage.getItem(key) || '[]');
  replies.push(signedReply);
  localStorage.setItem(key, JSON.stringify(replies.slice(-200)));
  return signedReply;
}

export function getReplies(parentHash) {
  return JSON.parse(localStorage.getItem('p2p_replies_' + parentHash) || '[]');
}

export async function repostToFeed(identity, originalHash) {
  const repost = {
    type: 'feed_repost',
    author: identity.fingerprint,
    displayName: identity.displayName,
    originalHash,
    timestamp: Date.now()
  };
  const repostStr = JSON.stringify(repost);
  const signature = await sign(identity.privateKey, repostStr);
  const hash = await sha256(repostStr + signature);
  
  const signedRepost = { ...repost, signature, hash };
  dht.putMessage(signedRepost);
  return signedRepost;
}

export async function validatePost(post, publicKey) {
  const { signature, hash, ...data } = post;
  const postStr = JSON.stringify(data);
  const isValidSig = await verify(publicKey, postStr, signature);
  if (!isValidSig) return false;
  
  const calculatedHash = await sha256(postStr + signature);
  return calculatedHash === hash;
}
