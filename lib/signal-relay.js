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
    try {
      this.ws = new WebSocket(`${this.relayUrl}?peerId=${peerId}`);
    } catch (e) {
      console.warn('Signal relay unavailable:', e.message);
      return;
    }
    
    this.ws.onopen = () => {
      this.isConnected = true;
      console.log('Connected to signaling relay');
      // Announce our presence to the global swarm
      this.ws.send(JSON.stringify({ type: 'global_announce', from: this.peerId }));
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
      
      if (msg.type === 'global_announce' && msg.from !== this.peerId) {
        console.log('New remote peer discovered via relay:', msg.from);
        import('./webrtc.js').then(({webrtc}) => {
          webrtc.connect(msg.from);
        });
      }
    };

    this.ws.onerror = () => {
      console.warn('Signal relay connection error — running in local-only mode');
      this.isConnected = false;
    };

    this.ws.onclose = () => {
      this.isConnected = false;
      // Only reconnect if we had a successful connection before
      // Don't spam reconnects to a server that doesn't exist
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
