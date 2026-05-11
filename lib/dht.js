// Photon DHT — BroadcastChannel + localStorage peer discovery
const CHANNEL_NAME = 'p2pweb_dht';
const PEER_TTL = 30000;
const MAX_ITEMS = 500;
class DHT {
  constructor() { this.identity=null; this.channel=null; this.listeners={}; this.heartbeatTimer=null; this.peers=new Map(); }
  init(identity) {
    this.identity=identity; this.channel=new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage=(e)=>this._handleMessage(e.data);
    this._announce(); this.heartbeatTimer=setInterval(()=>this._announce(),10000);
    setInterval(()=>this._prunePeers(),15000);
  }
  _announce() { if(!this.identity)return; this._broadcast({type:'peer_announce',peerId:this.identity.fingerprint,fingerprint:this.identity.fingerprint,displayName:this.identity.displayName,bio:this.identity.bio,timestamp:Date.now()}); }
  _broadcast(msg) { this.channel?.postMessage(msg); }
  _handleMessage(msg) {
    if(!msg||!msg.type)return;
    if(msg.type==='peer_announce'&&msg.peerId!==this.identity?.fingerprint) { this.peers.set(msg.peerId,{...msg,lastSeen:Date.now()}); this._emit('peers_updated',Array.from(this.peers.values())); }
    if(msg.type==='dht_put') this._localPut(msg.key,msg.value);
    if(msg.type==='pubsub') this._emit('topic:'+msg.topic,msg);
    if(msg.type==='new_message') this._emit('new_message',msg);
    if(msg.type==='signal') this._emit('signal',msg);
  }
  _prunePeers() { const now=Date.now(); for(const[id,peer]of this.peers){if(now-peer.lastSeen>PEER_TTL)this.peers.delete(id);} this._emit('peers_updated',Array.from(this.peers.values())); }
  _localPut(key,value) { localStorage.setItem('p2pweb_dht_'+key,JSON.stringify({value,ts:Date.now()})); this._evict(); }
  _evict() { const keys=[]; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('p2pweb_dht_'))keys.push(k);} if(keys.length<=MAX_ITEMS)return; keys.sort((a,b)=>{ try{return JSON.parse(localStorage.getItem(a)).ts-JSON.parse(localStorage.getItem(b)).ts;}catch{return 0;} }).slice(0,keys.length-MAX_ITEMS).forEach(k=>localStorage.removeItem(k)); }
  put(key,value) { this._localPut(key,value); this._broadcast({type:'dht_put',key,value}); }
  get(key) { const raw=localStorage.getItem('p2pweb_dht_'+key); if(!raw)return null; try{return JSON.parse(raw).value;}catch{return null;} }
  publish(topic,data) { const msg={type:'pubsub',topic,data,ts:Date.now(),from:this.identity?.fingerprint}; this._broadcast(msg); this._emit('topic:'+topic,msg); }
  subscribe(topic,cb) { const key='topic:'+topic; if(!this.listeners[key])this.listeners[key]=[]; this.listeners[key].push(cb); return()=>{this.listeners[key]=this.listeners[key].filter(f=>f!==cb);}; }
  putMessage(msg) { const key='msg_'+msg.hash; this.put(key,msg); const authorKey='p2pweb_feed_'+msg.author; const existing=JSON.parse(localStorage.getItem(authorKey)||'[]'); if(!existing.find(h=>h===msg.hash)){existing.unshift(msg.hash);localStorage.setItem(authorKey,JSON.stringify(existing.slice(0,200)));} this._broadcast({type:'new_message',message:msg}); this._emit('new_message',{message:msg}); }
  getMessages(authorFingerprint) { const hashes=JSON.parse(localStorage.getItem('p2pweb_feed_'+authorFingerprint)||'[]'); return hashes.map(h=>this.get('msg_'+h)).filter(Boolean); }
  signal(targetId,data) { this._broadcast({type:'signal',target:targetId,from:this.identity?.fingerprint,data}); }
  on(event,cb) { if(!this.listeners[event])this.listeners[event]=[]; this.listeners[event].push(cb); }
  off(event,cb) { if(!this.listeners[event])return; this.listeners[event]=this.listeners[event].filter(f=>f!==cb); }
  _emit(event,data) { (this.listeners[event]||[]).forEach(cb=>{try{cb(data);}catch{}}); }
  getPeers() { return Array.from(this.peers.values()); }
  destroy() { clearInterval(this.heartbeatTimer); this.channel?.close(); }
}
export const dht = new DHT();
