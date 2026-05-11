import { dht } from './dht.js';

export class SignalRelay {
  constructor(relayUrl = 'wss://relay.photon-browser.io') {
    this.relayUrl = relayUrl;
    this.ws = null;
    this.peerId = null;
    this.isConnected = false;
  }

  connect(peerId) {
    this.peerId = peerId;
    this.ws = new WebSocket(`${this.relayUrl}?peerId=${peerId}`);
    
    this.ws.onopen = () => {
      this.isConnected = true;
      console.log('Connected to signaling relay');
    };

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'signal') {
        // Forward to DHT internal signal system
        dht._emit('signal', {
          from: msg.from,
          target: this.peerId,
          data: msg.data
        });
      }
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      setTimeout(() => this.connect(this.peerId), 5000);
    };
  }

  sendSignal(targetId, data) {
    if (this.isConnected) {
      this.ws.send(JSON.stringify({
        type: 'signal',
        target: targetId,
        from: this.peerId,
        data: data
      }));
    }
  }
}

export const signalRelay = new SignalRelay();
