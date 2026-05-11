export const reputation = {
  scores: new Map(),
  
  getScore(peerId) {
    return this.scores.get(peerId) || 0;
  },
  
  updateScore(peerId, delta) {
    const current = this.getScore(peerId);
    this.scores.set(peerId, current + delta);
  },
  
  getTier(peerId) {
    const score = this.getScore(peerId);
    if (score >= 500) return 'Legend';
    if (score >= 200) return 'Trusted';
    if (score >= 50) return 'Active';
    return 'New';
  }
};
