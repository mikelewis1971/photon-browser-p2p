// Photon Call Manager — P2P Voice & Video Calling via WebRTC
import { dht } from './dht.js';
import { signalRelay } from './signal-relay.js';

class CallManager {
  constructor() {
    this.pc = null;
    this.localStream = null;
    this.remoteStream = null;
    this.callState = 'idle'; // idle | ringing | incoming | active
    this.currentCallPeer = null;
    this.isVideo = false;
    this.onStateChange = null; // callback for UI updates
    this._pendingCandidates = [];
  }

  async startCall(peerId, video = false) {
    this.isVideo = video;
    this.currentCallPeer = peerId;
    this.callState = 'ringing';
    this._notifyUI();

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video
      });
    } catch (err) {
      console.error('Failed to get media:', err);
      this.hangup();
      return;
    }

    this._createPC(true);

    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this._sendSignal({
      type: 'call_offer',
      sdp: offer,
      isVideo: video,
      from: dht.identity?.fingerprint,
      displayName: dht.identity?.displayName
    });
  }

  async handleIncomingSignal(msg) {
    const data = msg.data || msg;

    if (data.type === 'call_offer') {
      this.currentCallPeer = data.from || msg.from;
      this.isVideo = data.isVideo;
      this.callState = 'incoming';
      this._incomingDisplayName = data.displayName || 'Unknown';
      this._pendingOffer = data.sdp;
      this._notifyUI();
    }

    if (data.type === 'call_answer') {
      if (this.pc) {
        await this.pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        this._flushCandidates();
        this.callState = 'active';
        this._notifyUI();
      }
    }

    if (data.type === 'call_candidate') {
      if (this.pc && this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        this._pendingCandidates.push(data.candidate);
      }
    }

    if (data.type === 'call_hangup') {
      this.hangup(true);
    }
  }

  async acceptCall() {
    if (this.callState !== 'incoming') return;

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.isVideo
      });
    } catch (err) {
      console.error('Failed to get media:', err);
      this.hangup();
      return;
    }

    this._createPC(false);

    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));

    await this.pc.setRemoteDescription(new RTCSessionDescription(this._pendingOffer));
    this._flushCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this._sendSignal({
      type: 'call_answer',
      sdp: answer,
      from: dht.identity?.fingerprint
    });

    this.callState = 'active';
    this._notifyUI();
  }

  rejectCall() {
    this._sendSignal({ type: 'call_hangup', from: dht.identity?.fingerprint });
    this.callState = 'idle';
    this.currentCallPeer = null;
    this._notifyUI();
  }

  hangup(remote = false) {
    if (!remote && this.currentCallPeer) {
      this._sendSignal({ type: 'call_hangup', from: dht.identity?.fingerprint });
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteStream = null;
    this.callState = 'idle';
    this.currentCallPeer = null;
    this._pendingCandidates = [];
    this._notifyUI();
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
      }
    }
    return true;
  }

  toggleCamera() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
      }
    }
    return true;
  }

  _createPC(isInitiator) {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.remoteStream = new MediaStream();

    this.pc.ontrack = (e) => {
      e.streams[0].getTracks().forEach(t => this.remoteStream.addTrack(t));
      this._notifyUI();
    };

    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._sendSignal({
          type: 'call_candidate',
          candidate: e.candidate,
          from: dht.identity?.fingerprint
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === 'disconnected' || this.pc?.connectionState === 'failed') {
        this.hangup(true);
      }
    };
  }

  _flushCandidates() {
    for (const c of this._pendingCandidates) {
      this.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    this._pendingCandidates = [];
  }

  _sendSignal(data) {
    dht.signal(this.currentCallPeer, data);
    signalRelay.sendSignal(this.currentCallPeer, data);
  }

  _notifyUI() {
    if (this.onStateChange) this.onStateChange(this);
  }
}

export const callManager = new CallManager();
