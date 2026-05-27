// ============================================================
// DATABASE.JS - Biometric Attendance Management System
// Mock database using localStorage with pre-seeded data
// ============================================================

const DB_KEY = 'bams_db';
const WEBAUTHN_CREDS_KEY = 'bams_webauthn_creds';

// ──────────────────────────────────────────────────────────────
// SEED DATA - EMPTY (No Demo Data)
// ──────────────────────────────────────────────────────────────
const SEED_DATA = {
  meta: { version: 3, seeded: true, createdAt: new Date().toISOString() },
  users: [],
  devices: [{ id: 'device-001', name: 'Main Scanner', location: 'Entrance A', status: 'online', offlineCache: [], configuredBy: 'system', lastSeen: new Date().toISOString() }],
  credentials: [],
  attendance: [],
  auditLogs: [],
  notifications: [],
  challenges: []
};

// Main in-memory/localStorage database interface
const DB = {

  // Initialize or load existing database
  init() {
    const existing = localStorage.getItem(DB_KEY);
    if (!existing) {
      const seed = { ...SEED_DATA };
      localStorage.setItem(DB_KEY, JSON.stringify(seed));
    } else {
      // Check if re-seed needed (version check)
      try {
        const parsed = JSON.parse(existing);
        if (!parsed.meta || parsed.meta.version < 3) {
          const seed = { ...SEED_DATA };
          localStorage.setItem(DB_KEY, JSON.stringify(seed));
        }
      } catch {
        const seed = { ...SEED_DATA };
        localStorage.setItem(DB_KEY, JSON.stringify(seed));
      }
    }
    return this.load();
  },

  load() {
    return JSON.parse(localStorage.getItem(DB_KEY));
  },

  save(data) {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  },

  reset() {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(WEBAUTHN_CREDS_KEY);
    return this.init();
  },

  // ── USERS ──────────────────────────────────────────────────
  getUsers(role = null) {
    const db = this.load();
    return role ? db.users.filter(u => u.role === role) : db.users;
  },

  getUserById(id) {
    return this.load().users.find(u => u.id === id);
  },

  addUser(userData) {
    const db = this.load();
    const newUser = {
      id: `${userData.role}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      biometricEnrolled: false,
      biometricHash: null,
      ...userData
    };
    db.users.push(newUser);
    this.save(db);
    this.addAuditLog('USER_CREATED', `User ${newUser.name} created`, 'admin-001', newUser.id);
    return newUser;
  },

  updateUser(id, updates) {
    const db = this.load();
    const idx = db.users.findIndex(u => u.id === id);
    if (idx === -1) return null;
    db.users[idx] = { ...db.users[idx], ...updates };
    this.save(db);
    return db.users[idx];
  },

  removeUser(id) {
    const db = this.load();
    db.users = db.users.filter(u => u.id !== id);
    this.save(db);
    this.addAuditLog('USER_REMOVED', `User ${id} removed`, 'admin-001', id);
  },

  // ── BIOMETRIC (WebAuthn Credentials) ──────────────────────
  enrollBiometric(studentId, credentialData) {
    const db = this.load();
    // credentialData should contain: credentialId, publicKeyPem, publicKeySPKI, attestationObject
    const credential = {
      id: `cred-${Date.now()}`,
      studentId,
      credentialId: credentialData.credentialId,
      publicKeyPem: credentialData.publicKeyPem,
      publicKeySPKI: credentialData.publicKeySPKI,
      attestationObject: credentialData.attestationObject,
      counter: credentialData.counter || 0,
      enrolledAt: new Date().toISOString(),
      transports: credentialData.transports || []
    };
    db.credentials.push(credential);
    this.save(db);
    
    const user = this.updateUser(studentId, {
      biometricEnrolled: true,
      biometricEnrolledAt: new Date().toISOString(),
      lastCredentialId: credential.id
    });
    
    this.addAuditLog('BIOMETRIC_ENROLLED', `Fingerprint enrolled for student ${studentId}`, 'system', studentId);
    return { credential, user };
  },

  getCredentialByStudent(studentId) {
    const db = this.load();
    return db.credentials.filter(c => c.studentId === studentId);
  },

  getCredentialById(credentialId) {
    const db = this.load();
    return db.credentials.find(c => c.credentialId === credentialId);
  },

  storeChallenge(studentId, challenge, type = 'enrollment') {
    const db = this.load();
    const challengeRecord = {
      id: `challenge-${Date.now()}`,
      studentId,
      challenge,
      type,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minute expiry
    };
    db.challenges.push(challengeRecord);
    this.save(db);
    return challengeRecord;
  },

  verifyAndConsumeChallenge(studentId, challenge, type = 'enrollment') {
    const db = this.load();
    const idx = db.challenges.findIndex(c => 
      c.studentId === studentId && 
      c.challenge === challenge && 
      c.type === type &&
      new Date(c.expiresAt) > new Date()
    );
    if (idx === -1) return false;
    db.challenges.splice(idx, 1);
    this.save(db);
    return true;
  },

  // ── ATTENDANCE ────────────────────────────────────────────
  getAttendance(filters = {}) {
    const db = this.load();
    let logs = [...db.attendance];
    if (filters.studentId) logs = logs.filter(a => a.studentId === filters.studentId);
    if (filters.deviceId) logs = logs.filter(a => a.deviceId === filters.deviceId);
    if (filters.status) logs = logs.filter(a => a.status === filters.status);
    if (filters.since) logs = logs.filter(a => new Date(a.timestamp) >= new Date(filters.since));
    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  },

  markAttendance(studentId, deviceId, method = 'fingerprint', status = 'present') {
    const db = this.load();
    const record = {
      id: `att-${Date.now()}`,
      studentId,
      deviceId,
      timestamp: new Date().toISOString(),
      status,
      method,
      synced: true,
      sessionLabel: `Session Live`,
      verifiedBy: deviceId
    };
    db.attendance.unshift(record);
    this.save(db);
    this.addAuditLog('ATTENDANCE_MARKED', `Attendance marked ${status} for student ${studentId}`, deviceId, studentId);
    return record;
  },

  cacheAttendanceOffline(studentId, deviceId) {
    const db = this.load();
    const deviceIdx = db.devices.findIndex(d => d.id === deviceId);
    if (deviceIdx === -1) return null;
    const record = {
      id: `offline-${Date.now()}`,
      studentId,
      deviceId,
      timestamp: new Date().toISOString(),
      status: 'present',
      method: 'fingerprint',
      synced: false,
      sessionLabel: 'Offline Session'
    };
    db.devices[deviceIdx].offlineCache.push(record);
    this.save(db);
    return record;
  },

  syncOfflineCache(deviceId) {
    const db = this.load();
    const deviceIdx = db.devices.findIndex(d => d.id === deviceId);
    if (deviceIdx === -1) return [];
    const cached = db.devices[deviceIdx].offlineCache;
    const synced = cached.map(r => ({ ...r, synced: true }));
    db.attendance.unshift(...synced);
    db.devices[deviceIdx].offlineCache = [];
    this.save(db);
    this.addAuditLog('OFFLINE_SYNC', `${synced.length} offline records synced for device ${deviceId}`, deviceId, null);
    return synced;
  },

  getOfflineCacheCount(deviceId) {
    const db = this.load();
    const device = db.devices.find(d => d.id === deviceId);
    return device ? device.offlineCache.length : 0;
  },

  // ── ANALYTICS ─────────────────────────────────────────────
  getStudentStats(studentId) {
    const logs = this.getAttendance({ studentId });
    const total = logs.length;
    const present = logs.filter(l => l.status === 'present').length;
    const late = logs.filter(l => l.status === 'late').length;
    const absent = logs.filter(l => l.status === 'absent').length;
    const rate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    // Last 7 days calendar
    const calendar = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLogs = logs.filter(l => l.timestamp.startsWith(dateStr));
      calendar.push({
        date: dateStr,
        status: dayLogs.length === 0 ? 'weekend' :
          dayLogs.some(l => l.status === 'present') ? 'present' :
          dayLogs.some(l => l.status === 'late') ? 'late' : 'absent'
      });
    }

    return { total, present, late, absent, rate, calendar, logs: logs.slice(0, 10) };
  },

  getClassStats(teacherId = null) {
    const students = this.getUsers('student');
    return students.map(s => {
      const stats = this.getStudentStats(s.id);
      return { ...s, stats };
    });
  },

  // ── DEVICES ───────────────────────────────────────────────
  getDevices() {
    return this.load().devices;
  },

  updateDeviceStatus(deviceId, status) {
    const db = this.load();
    const idx = db.devices.findIndex(d => d.id === deviceId);
    if (idx !== -1) {
      db.devices[idx].status = status;
      db.devices[idx].lastSeen = new Date().toISOString();
      this.save(db);
    }
  },

  addDevice(deviceData) {
    const db = this.load();
    const device = {
      id: `device-${Date.now()}`,
      status: 'online',
      offlineCache: [],
      lastSeen: new Date().toISOString(),
      configuredBy: 'admin-001',
      ...deviceData
    };
    db.devices.push(device);
    this.save(db);
    return device;
  },

  // ── AUDIT LOGS ────────────────────────────────────────────
  addAuditLog(action, description, actorId, targetId) {
    const db = this.load();
    const log = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      action,
      description,
      actorId,
      targetId,
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.' + Math.floor(Math.random() * 254 + 1)
    };
    db.auditLogs.unshift(log);
    if (db.auditLogs.length > 500) db.auditLogs = db.auditLogs.slice(0, 500);
    this.save(db);
    return log;
  },

  getAuditLogs(limit = 50) {
    return this.load().auditLogs.slice(0, limit);
  },

  // ── NOTIFICATIONS ─────────────────────────────────────────
  addNotification(recipientId, type, message, studentId = null) {
    const db = this.load();
    const notif = {
      id: `notif-${Date.now()}`,
      recipientId,
      type, // 'warning', 'info', 'success', 'critical'
      message,
      studentId,
      timestamp: new Date().toISOString(),
      read: false
    };
    db.notifications.unshift(notif);
    this.save(db);
    return notif;
  },

  getNotifications(recipientId) {
    return this.load().notifications.filter(n => n.recipientId === recipientId);
  },

  markNotificationRead(id) {
    const db = this.load();
    const n = db.notifications.find(n => n.id === id);
    if (n) { n.read = true; this.save(db); }
  },

  // ── EXPORT ────────────────────────────────────────────────
  exportCSV(filters = {}) {
    const logs = this.getAttendance(filters);
    const db = this.load();
    const headers = ['ID', 'Student Name', 'Student ID', 'Timestamp', 'Status', 'Method', 'Device', 'Synced'];
    const rows = logs.map(l => {
      const student = db.users.find(u => u.id === l.studentId);
      const device = db.devices.find(d => d.id === l.deviceId);
      return [
        l.id,
        student ? student.name : 'Unknown',
        student ? student.studentId || l.studentId : l.studentId,
        l.timestamp,
        l.status.toUpperCase(),
        l.method,
        device ? device.name : l.deviceId,
        l.synced ? 'Yes' : 'No'
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }
};

// ── WEBAUTHN HELPERS ──────────────────────────────────────────
const WebAuthnHelper = {
  isSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials);
  },

  async isAvailable() {
    if (!this.isSupported()) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { return false; }
  },

  randomBuffer(length = 32) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    return buf;
  },

  bufToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  },

  base64ToBuf(b64) {
    return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
  },

  async extractPublicKey(credentialResponse) {
    try {
      // Parse the attestation object
      const attestationObject = new Uint8Array(credentialResponse.response.attestationObject);
      // For simplicity, store raw attestation object and can be verified server-side
      
      // Extract public key from credential (browser handles this securely)
      // This is a simplified version - in production use proper CBOR parsing
      const publicKey = credentialResponse.response.getPublicKey?.();
      return {
        publicKeySpki: publicKey ? this.bufToBase64(publicKey) : null,
        attestationObject: this.bufToBase64(attestationObject),
        credentialId: this.bufToBase64(credentialResponse.rawId),
        transports: credentialResponse.response.getTransports?.() || []
      };
    } catch (err) {
      console.error('Error extracting public key:', err);
      return null;
    }
  },

  async enrollFingerprint(studentId, studentName) {
    if (!this.isSupported()) {
      return { success: false, error: 'WebAuthn not supported on this device' };
    }

    const challenge = this.randomBuffer(32);
    const userId = this.randomBuffer(16);
    const credentialId = this.randomBuffer(32);

    const options = {
      challenge,
      rp: {
        name: 'BAMS - Biometric Attendance',
        id: window.location.hostname || 'localhost'
      },
      user: {
        id: userId,
        name: studentName,
        displayName: studentName
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'direct'
    };

    try {
      const credential = await navigator.credentials.create({ publicKey: options });
      if (!credential) {
        return { success: false, error: 'No credential created' };
      }

      const publicKeyData = await this.extractPublicKey(credential);
      if (!publicKeyData) {
        return { success: false, error: 'Failed to extract public key' };
      }

      return {
        success: true,
        credentialId: publicKeyData.credentialId,
        publicKeySPKI: publicKeyData.publicKeySpki,
        attestationObject: publicKeyData.attestationObject,
        transports: publicKeyData.transports,
        counter: 0
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Enrollment failed',
        code: err.name
      };
    }
  },

  async verifyFingerprint(allowedCredentials = null) {
    if (!this.isSupported()) {
      return { success: false, error: 'WebAuthn not supported on this device' };
    }

    const challenge = this.randomBuffer(32);
    const options = {
      challenge,
      rpId: window.location.hostname || 'localhost',
      userVerification: 'required',
      timeout: 60000,
      allowCredentials: allowedCredentials || []
    };

    try {
      const assertion = await navigator.credentials.get({ publicKey: options });
      if (!assertion) {
        return { success: false, error: 'No assertion provided' };
      }

      return {
        success: true,
        credentialId: this.bufToBase64(assertion.rawId),
        clientData: this.bufToBase64(assertion.response.clientDataJSON),
        authenticatorData: this.bufToBase64(assertion.response.authenticatorData),
        signature: this.bufToBase64(assertion.response.signature),
        userHandle: assertion.response.userHandle ? this.bufToBase64(assertion.response.userHandle) : null
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Verification failed',
        code: err.name
      };
    }
  }
};

// ── TOAST NOTIFICATION SYSTEM ─────────────────────────────────
const Toast = {
  show(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ'}</span>
      <span class="toast-msg">${message}</span>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }
};

export { DB, WebAuthnHelper, Toast };
