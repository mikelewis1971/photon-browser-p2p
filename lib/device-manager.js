// Photon Device Manager — Multi-device sync, uptime tracking, hosting budget
// Each device gets a unique ID. The identity is shared across devices via export/import.

const DEVICE_KEY = 'photon_device';
const UPTIME_KEY = 'photon_uptime';
const HOSTING_KEY = 'photon_hosting_config';

function generateDeviceId() {
  return 'dev_' + crypto.getRandomValues(new Uint32Array(2)).join('_');
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return '📱 Phone';
  if (/Tablet|iPad/i.test(ua)) return '📋 Tablet';
  return '💻 Desktop';
}

class DeviceManager {
  constructor() {
    this._startTime = Date.now();
    this._tickInterval = null;
  }

  init() {
    // Ensure this device has a unique ID
    let device = JSON.parse(localStorage.getItem(DEVICE_KEY) || 'null');
    if (!device) {
      device = {
        deviceId: generateDeviceId(),
        deviceName: getDeviceName(),
        customName: '',
        firstSeen: Date.now(),
        lastSeen: Date.now()
      };
      localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
    }

    // Load uptime record
    let uptime = JSON.parse(localStorage.getItem(UPTIME_KEY) || 'null');
    if (!uptime) {
      uptime = {
        totalSeconds: 0,
        sessions: 0,
        lastSessionStart: Date.now()
      };
    }
    uptime.sessions += 1;
    uptime.lastSessionStart = Date.now();
    localStorage.setItem(UPTIME_KEY, JSON.stringify(uptime));

    // Tick uptime every 10 seconds
    this._tickInterval = setInterval(() => this._tickUptime(), 10000);

    // Update lastSeen
    device.lastSeen = Date.now();
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  }

  getDevice() {
    return JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}');
  }

  setDeviceName(name) {
    const device = this.getDevice();
    device.customName = name;
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  }

  getUptime() {
    const uptime = JSON.parse(localStorage.getItem(UPTIME_KEY) || '{"totalSeconds":0,"sessions":0}');
    const currentSessionSeconds = Math.floor((Date.now() - (uptime.lastSessionStart || Date.now())) / 1000);
    return {
      totalSeconds: uptime.totalSeconds + currentSessionSeconds,
      sessions: uptime.sessions,
      currentSessionSeconds
    };
  }

  formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  _tickUptime() {
    const uptime = JSON.parse(localStorage.getItem(UPTIME_KEY) || '{"totalSeconds":0,"sessions":0}');
    uptime.totalSeconds += 10;
    localStorage.setItem(UPTIME_KEY, JSON.stringify(uptime));

    const device = this.getDevice();
    device.lastSeen = Date.now();
    localStorage.setItem(DEVICE_KEY, JSON.stringify(device));
  }

  // ---- Hosting Budget ----
  getHostingConfig() {
    return JSON.parse(localStorage.getItem(HOSTING_KEY) || JSON.stringify({
      enabled: false,
      budgetMB: 100,
      usedMB: 0,
      hostOpenContent: true,       // host anyone's public content
      hostFollowedOnly: false,     // only host people you follow
      hostedPeers: []              // specific peers you're hosting for
    }));
  }

  setHostingConfig(config) {
    localStorage.setItem(HOSTING_KEY, JSON.stringify(config));
  }

  // ---- Call Permissions ----
  getCallPermissions() {
    return JSON.parse(localStorage.getItem('photon_call_perms') || JSON.stringify({
      allowVoice: true,
      allowVideo: true,
      publicCalls: false,     // strangers can call from public profile
      friendsOnly: true       // only authorized peers / followed can call
    }));
  }

  setCallPermissions(perms) {
    localStorage.setItem('photon_call_perms', JSON.stringify(perms));
  }

  // ---- Device Registry (broadcast via DHT) ----
  getDeviceAnnouncement() {
    const device = this.getDevice();
    const uptime = this.getUptime();
    return {
      deviceId: device.deviceId,
      deviceName: device.customName || device.deviceName,
      deviceType: device.deviceName,
      totalUptime: uptime.totalSeconds,
      currentSession: uptime.currentSessionSeconds,
      lastSeen: Date.now()
    };
  }

  destroy() {
    if (this._tickInterval) clearInterval(this._tickInterval);
  }
}

export const deviceManager = new DeviceManager();
