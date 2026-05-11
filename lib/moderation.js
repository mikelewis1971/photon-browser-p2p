import { dht } from './dht.js';

export const moderation = {
  blockedPeers: new Set(),
  reports: new Map(), // hash -> count
  
  blockPeer(peerId) {
    this.blockedPeers.add(peerId);
  },
  
  reportContent(hash) {
    const count = (this.reports.get(hash) || 0) + 1;
    this.reports.set(hash, count);
    dht.publish('moderation_report', { hash, reporter: dht.identity?.fingerprint });
  },
  
  shouldHide(hash) {
    return (this.reports.get(hash) || 0) >= 3;
  },
  
  init() {
    dht.subscribe('moderation_report', (msg) => {
      const { hash } = msg.data;
      const count = (this.reports.get(hash) || 0) + 1;
      this.reports.set(hash, count);
    });
  }
};

moderation.init();
