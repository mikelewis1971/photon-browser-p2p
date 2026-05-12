// Photon Storage IDB — IndexedDB implementation for high-capacity chunk storage
const DB_NAME = 'photon_p2p_storage';
const DB_VERSION = 1;
const CHUNK_STORE = 'chunks';
const MANIFEST_STORE = 'manifests';

class PhotonIDB {
  constructor() { this.db = null; }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(CHUNK_STORE)) db.createObjectStore(CHUNK_STORE);
        if (!db.objectStoreNames.contains(MANIFEST_STORE)) db.createObjectStore(MANIFEST_STORE);
      };
      request.onsuccess = (e) => { this.db = e.target.result; resolve(this); };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async _ensureDB() {
    if (!this.db) await this.init();
  }

  async putChunk(hash, data) {
    await this._ensureDB();
    return this._transaction(CHUNK_STORE, 'readwrite', (store) => store.put(data, hash));
  }

  async getChunk(hash) {
    await this._ensureDB();
    return this._transaction(CHUNK_STORE, 'readonly', (store) => store.get(hash));
  }

  async hasChunk(hash) {
    const data = await this.getChunk(hash);
    return data !== undefined;
  }

  async putManifest(hash, manifest) {
    await this._ensureDB();
    return this._transaction(MANIFEST_STORE, 'readwrite', (store) => store.put(manifest, hash));
  }

  async getManifest(hash) {
    await this._ensureDB();
    return this._transaction(MANIFEST_STORE, 'readonly', (store) => store.get(hash));
  }

  async listManifests() {
    await this._ensureDB();
    return this._transaction(MANIFEST_STORE, 'readonly', (store) => {
      return new Promise((resolve) => {
        const results = [];
        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) { results.push(cursor.value); cursor.continue(); }
          else { resolve(results); }
        };
      });
    });
  }

  async _transaction(storeName, mode, callback) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = callback(store);
      if (request instanceof Promise) {
        request.then(resolve).catch(reject);
      } else {
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
      }
    });
  }
}

export const storageIDB = new PhotonIDB();
