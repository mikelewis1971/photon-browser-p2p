import { dht } from './dht.js';
import { signalRelay } from './signal-relay.js';

export class PeerConnection {
  constructor(targetId, isInitiator = false) {
    this.targetId = targetId;
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    this.dataChannel = null;
    
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._sendSignal({ type: 'candidate', candidate: e.candidate });
      }
    };
    
    if (isInitiator) {
      this.dataChannel = this.pc.createDataChannel('photon_data');
      this._setupDataChannel();
      this._createOffer();
    } else {
      this.pc.ondatachannel = (e) => {
        this.dataChannel = e.channel;
        this._setupDataChannel();
      };
    }
  }
  
  async _createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this._sendSignal({ type: 'offer', sdp: offer });
  }
  
  async handleSignal(signal) {
    if (signal.type === 'offer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this._sendSignal({ type: 'answer', sdp: answer });
    } else if (signal.type === 'answer') {
      await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    } else if (signal.type === 'candidate') {
      await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  }
  
  _setupDataChannel() {
    this.dataChannel.onopen = () => console.log('P2P connection open with', this.targetId);
    this.dataChannel.onmessage = (e) => console.log('P2P message from', this.targetId, e.data);
  }

  _sendSignal(data) {
    // Broadcast via Local DHT (BroadcastChannel)
    dht.signal(this.targetId, data);
    // AND via Global Relay if connected
    signalRelay.sendSignal(this.targetId, data);
  }
  
  send(data) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(data);
    }
  }
}

export const webrtc = {
  connections: new Map(),
  
  init() {
    dht.on('signal', (msg) => {
      let conn = this.connections.get(msg.from);
      if (!conn) {
        conn = new PeerConnection(msg.from, false);
        this.connections.set(msg.from, conn);
      }
      conn.handleSignal(msg.data);
    });
  },
  
  connect(targetId) {
    if (this.connections.has(targetId)) return this.connections.get(targetId);
    const conn = new PeerConnection(targetId, true);
    this.connections.set(targetId, conn);
    return conn;
  }
};
