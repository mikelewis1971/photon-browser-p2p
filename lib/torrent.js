import { dht } from './dht.js';
import { storageIDB } from './storage-idb.js';

const SWARM_CHANNEL = 'photon_swarm';
const swarm = new BroadcastChannel(SWARM_CHANNEL);

export const torrent = {
  activeDownloads: new Map(),
  listeners: {},
  
  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  },
  
  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  },
  
  init() {
    swarm.onmessage = (e) => this._handleMessage(e.data);
  },
  
  async _handleMessage(msg) {
    if (msg.type === 'piece_request') {
      const chunk = await storageIDB.getChunk(msg.hash);
      if (chunk) {
        swarm.postMessage({
          type: 'piece_response',
          hash: msg.hash,
          data: chunk,
          from: dht.identity?.fingerprint
        });
      }
    } else if (msg.type === 'piece_response') {
      const download = this.activeDownloads.get(msg.hash);
      if (download) {
        download.resolve(msg.data);
        this.activeDownloads.delete(msg.hash);
      }
    }
  },
  
  async requestPiece(hash) {
    if (await storageIDB.hasChunk(hash)) return storageIDB.getChunk(hash);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.activeDownloads.delete(hash);
        reject(new Error('Timeout requesting piece ' + hash));
      }, 10000);
      
      this.activeDownloads.set(hash, {
        resolve: (data) => {
          clearTimeout(timeout);
          storageIDB.putChunk(hash, data);
          resolve(data);
        }
      });
      
      swarm.postMessage({ type: 'piece_request', hash });
    });
  },
  
  async downloadFile(manifestHash) {
    const manifest = await storageIDB.getManifest(manifestHash);
    if (!manifest) throw new Error('Manifest not found locally: ' + manifestHash);
    
    const total = manifest.chunks.length;
    let completed = 0;
    
    this._emit('download_start', { manifestHash, name: manifest.name, total });
    
    const results = [];
    for (const chunkInfo of manifest.chunks) {
      const data = await this.requestPiece(chunkInfo.hash);
      results.push(data);
      completed++;
      this._emit('download_progress', { manifestHash, completed, total, percent: Math.round((completed/total)*100) });
    }
    
    this._emit('download_complete', { manifestHash, name: manifest.name });
    return results;
  }
};

torrent.init();
