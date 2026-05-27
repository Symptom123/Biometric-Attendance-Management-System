// ============================================================
// API-CONFIG.JS - Backend API Configuration
// Handles all communication with the backend server
// ============================================================

const API_CONFIG = {
  // Supports either:
  // - API_URL="http://localhost:4000" (preferred)
  // Uses relative /api path if on Vercel/Production, otherwise falls back to port 4000
  baseURL: normalizeBaseURL(
    window.REACT_APP_API_URL || 
    window.API_URL || 
    (window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.') || window.location.hostname.startsWith('10.') 
      ? `http://${window.location.hostname}:4000/api` 
      : `${window.location.origin}/api`)
  ),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
};

function normalizeBaseURL(url) {
  if (!url) return 'http://localhost:4000/api';
  // Remove trailing slash
  let u = url.replace(/\/$/, '');
  // If user provided full api path, keep it. Otherwise append /api.
  if (u.toLowerCase().endsWith('/api')) return u;
  return `${u}/api`;
}

class APIClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || API_CONFIG.baseURL;
    this.timeout = config.timeout || API_CONFIG.timeout;
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  getHeaders() {
    const headers = { ...API_CONFIG.headers };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(method, endpoint, data = null) {
    const url = `${this.baseURL}${endpoint}`;
    const options = {
      method,
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(this.timeout)
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`API Error [${method} ${endpoint}]:`, error);
      throw error;
    }
  }

  // WebAuthn Endpoints
  async webauthnEnrollmentStart(studentId) {
    return this.request('POST', '/webauthn/enrollment/start', { studentId });
  }

  async webauthnEnrollmentComplete(data) {
    return this.request('POST', '/webauthn/enrollment/complete', data);
  }

  async webauthnVerificationStart(studentId) {
    return this.request('POST', '/webauthn/verification/start', { studentId });
  }

  async webauthnVerificationComplete(data) {
    return this.request('POST', '/webauthn/verification/complete', data);
  }

  async getWebauthnCredentials(studentId) {
    return this.request('GET', `/webauthn/credentials/${studentId}`);
  }

  async revokeWebauthnCredential(credentialId) {
    return this.request('DELETE', `/webauthn/credentials/${credentialId}`);
  }

  // Attendance Endpoints
  async markAttendance(studentId, deviceId, status = 'present') {
    return this.request('POST', '/attendance/mark', { studentId, deviceId, status });
  }

  async getAttendanceReport(filters = {}) {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    return this.request('GET', `/attendance/report?${params.toString()}`);
  }

  async getStudentAttendance(studentId) {
    return this.request('GET', `/attendance/student/${studentId}`);
  }

  // Users Endpoints
  async addStudent(data) {
    return this.request('POST', '/users/add', data);
  }

  async getStudents() {
    return this.request('GET', '/users/students');
  }

  async getUser(userId) {
    return this.request('GET', `/users/${userId}`);
  }

  async updateUser(userId, data) {
    return this.request('PUT', `/users/${userId}`, data);
  }

  async deleteUser(userId) {
    return this.request('DELETE', `/users/${userId}`);
  }

  // Auth Endpoints
  async login(email, password) {
    const response = await this.request('POST', '/auth/login', { email, password });
    // backend returns `accessToken` and `refreshToken` — accept either
    const token = response.accessToken || response.token || response.access_token;
    if (token) {
      this.setToken(token);
    }
    return response;
  }

  async logout() {
    localStorage.removeItem('auth_token');
    this.token = null;
  }

  async register(userData) {
    const response = await this.request('POST', '/auth/register', userData);
    const token = response.accessToken || response.token || response.access_token;
    if (token) {
      this.setToken(token);
    }
    return response;
  }

  async getCurrentUser() {
    try {
      // Decode JWT token without verification (client-side only)
      const token = this.token;
      if (!token) return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      // JWT uses base64url encoding; convert to base64 before atob()
      const base64url = parts[1];
      const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
      const decoded = JSON.parse(atob(padded));
      return decoded;
    } catch (e) {
      return null;
    }
  }

  async checkHealth() {
    try {
      const response = await fetch(`${this.baseURL.replace('/api', '')}/api/health`, {
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
const apiClient = new APIClient();

export { apiClient, APIClient, API_CONFIG };
