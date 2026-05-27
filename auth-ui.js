import { apiClient } from './api-config.js';
import { Toast } from './database.js';

// NOTE: This file is intentionally small and focused on ONLY login/signup.
// It replaces the inline auth handlers in app.js (which also call bindAuth/renderLogin/renderSignup).

const ROLES = [
  { id: 'admin', label: '⚙️ Admin', desc: 'Administrator' },
  
  { id: 'student', label: '🎓 Student', desc: 'Student' },
  { id: 'delegate', label: '📡 Delegate', desc: 'Attendance Delegate' }
];

function el(id) {
  return document.getElementById(id);
}

function getFieldValue(id) {
  const v = el(id)?.value;
  return typeof v === 'string' ? v.trim() : '';
}

function showAuthDebugToast(prefix, payload) {
  // Keep user-friendly toast, but include the backend error payload.
  // Payload may be { error: '...' } or { error: { error: '...' } }
  const msg = typeof payload === 'string' ? payload : (payload?.error || payload?.message || JSON.stringify(payload));
  Toast.show(`${prefix}: ${msg}`, 'error', 6000);
}

function injectAppleStyles() {
  const styleId = 'apple-auth-styles';
  if (document.getElementById(styleId)) return;
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .apple-auth-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      width: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .apple-auth-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(40px) saturate(180%);
      -webkit-backdrop-filter: blur(40px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
      padding: 48px 36px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4);
      text-align: center;
      animation: appleFadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes appleFadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .apple-biometric-glow {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.12);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      margin-bottom: 24px;
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.03);
      transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
    }
    .apple-biometric-glow::after {
      content: '';
      position: absolute;
      inset: -5px;
      border-radius: 50%;
      border: 1.5px solid rgba(0, 113, 227, 0.4);
      opacity: 0;
      transform: scale(0.95);
      transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .apple-auth-card:hover .apple-biometric-glow {
      background: rgba(0, 113, 227, 0.05);
      border-color: rgba(0, 113, 227, 0.3);
      transform: scale(1.05);
    }
    .apple-auth-card:hover .apple-biometric-glow::after {
      opacity: 1;
      transform: scale(1);
    }
    .apple-auth-title {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.6px;
      margin: 0 0 8px;
    }
    .apple-auth-subtitle {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.55);
      margin: 0 0 32px;
      line-height: 1.4;
    }
    .apple-input-group {
      width: 100%;
    }
    .apple-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 15px 18px;
      color: #ffffff;
      font-size: 15px;
      outline: none;
      transition: all 0.25s ease;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.2);
    }
    .apple-input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
    .apple-input:focus {
      background: rgba(255, 255, 255, 0.07);
      border-color: #0071e3;
      box-shadow: 0 0 0 4px rgba(0, 113, 227, 0.18), inset 0 1px 2px rgba(0,0,0,0.2);
    }
    .apple-select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='rgba(255,255,255,0.45)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 18px center;
      background-size: 16px;
      padding-right: 46px;
    }
    .apple-select option {
      background: #11192e;
      color: #fff;
    }
    .apple-btn {
      width: 100%;
      background: #0071e3;
      color: #ffffff;
      font-size: 15px;
      font-weight: 600;
      border: none;
      border-radius: 14px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 8px 24px rgba(0, 113, 227, 0.25);
      margin-top: 8px;
    }
    .apple-btn:hover {
      background: #147efb;
      box-shadow: 0 12px 30px rgba(0, 113, 227, 0.35);
      transform: translateY(-1px);
    }
    .apple-btn:active {
      transform: translateY(1px) scale(0.99);
      background: #0062c3;
    }
    .apple-btn:disabled {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.3);
      box-shadow: none;
      cursor: not-allowed;
      transform: none;
    }
    .apple-switch-text {
      margin-top: 24px;
      font-size: 13.5px;
      color: rgba(255, 255, 255, 0.5);
    }
    .apple-switch-btn {
      background: none;
      border: none;
      color: #0071e3;
      text-decoration: none;
      cursor: pointer;
      font-size: 13.5px;
      font-weight: 600;
      padding: 0;
      margin-left: 4px;
      transition: all 0.2s ease;
    }
    .apple-switch-btn:hover {
      color: #147efb;
      text-decoration: underline;
    }
    .apple-error-area {
      min-height: 18px;
      margin-top: 20px;
      font-size: 12.5px;
      color: #ff453a;
      transition: all 0.2s ease;
      font-weight: 500;
      background: rgba(255, 69, 58, 0.08);
      border-radius: 8px;
      padding: 8px;
      display: none;
    }
    .apple-error-area:not(:empty) {
      display: block;
      animation: shake 0.4s ease-in-out;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-6px); }
      75% { transform: translateX(6px); }
    }
  `;
  document.head.appendChild(style);
}

export function renderLogin() {
  const content = el('main-content');
  if (!content) return;

  injectAppleStyles();

  content.innerHTML = `
    <div class="apple-auth-container">
      <div class="apple-auth-card">
        <div class="apple-biometric-glow">🔒</div>
        <h1 class="apple-auth-title">Sign In to BAMS</h1>
        <p class="apple-auth-subtitle">Biometric Attendance Management System</p>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="apple-input-group">
            <input id="login-email" class="apple-input" type="email" placeholder="Email address" autocomplete="email" />
          </div>
          <div class="apple-input-group">
            <input id="login-password" class="apple-input" type="password" placeholder="Password" autocomplete="current-password" />
          </div>
          <button id="login-btn" class="apple-btn">Sign In</button>
          <div class="apple-switch-text">
            Don't have an account? <button id="switch-signup" class="apple-switch-btn">Create yours now</button>
          </div>
        </div>

        <div id="auth-error-area" class="apple-error-area"></div>
      </div>
    </div>`;
}

export function renderSignup() {
  const content = el('main-content');
  if (!content) return;

  injectAppleStyles();

  content.innerHTML = `
    <div class="apple-auth-container">
      <div class="apple-auth-card">
        <div class="apple-biometric-glow">👤</div>
        <h1 class="apple-auth-title">Create Account</h1>
        <p class="apple-auth-subtitle">Register to access BAMS and enroll biometrics</p>

        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="apple-input-group">
            <input id="signup-name" class="apple-input" placeholder="Full name" autocomplete="name" />
          </div>
          <div class="apple-input-group">
            <input id="signup-email" class="apple-input" type="email" placeholder="Email address" autocomplete="email" />
          </div>
          <div class="apple-input-group">
            <input id="signup-password" type="password" class="apple-input" placeholder="Password (min 8 chars)" autocomplete="new-password" />
          </div>
          <div class="apple-input-group">
            <select id="signup-role" class="apple-input apple-select">
              ${ROLES.map(r => `<option value="${r.id}">${r.desc}</option>`).join('')}
            </select>
          </div>
          <button id="signup-btn" class="apple-btn">Create Account</button>
          <div class="apple-switch-text">
            Already have an account? <button id="switch-login" class="apple-switch-btn">Sign in</button>
          </div>
        </div>

        <div id="auth-error-area" class="apple-error-area"></div>
      </div>
    </div>`;
}

export function bindAuth({ onAuthed } = {}) {
  // onAuthed(user) is called ONLY after we successfully log in / register and verify token.

  const loginBtn = el('login-btn');
  const signupBtn = el('signup-btn');
  const switchSignup = el('switch-signup');
  const switchLogin = el('switch-login');

  const setErrorArea = (text) => {
    const area = el('auth-error-area');
    if (area) area.textContent = text || '';
  };

  const switchToSignup = () => {
    setErrorArea('');
    renderSignup();
    bindAuth({ onAuthed });
  };

  const switchToLogin = () => {
    setErrorArea('');
    renderLogin();
    bindAuth({ onAuthed });
  };

  if (switchSignup) switchSignup.addEventListener('click', switchToSignup);
  if (switchLogin) switchLogin.addEventListener('click', switchToLogin);

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      const email = getFieldValue('login-email');
      const password = el('login-password')?.value || '';

      if (!email || !password) {
        Toast.show('Email and password required', 'warning');
        return;
      }

      loginBtn.disabled = true;
      setErrorArea(`Signing in to: ${apiClient.baseURL}/api/auth/login`);

      try {
        const res = await apiClient.login(email, password);
        if (!res?.accessToken) {
          setErrorArea('Login response missing accessToken');
          Toast.show('Login failed (missing token)', 'error');
          return;
        }

        const user = await apiClient.getCurrentUser();
        if (!user) {
          Toast.show('Login succeeded but token could not be decoded', 'error', 6000);
          return;
        }

        Toast.show('Signed in successfully', 'success');
        onAuthed?.(user);
      } catch (err) {
        console.error('Login failed:', err);
        const payload = err?.message ? { error: err.message } : err;
        setErrorArea(err?.message || 'Login error');
        showAuthDebugToast('Login error', payload);
      } finally {
        loginBtn.disabled = false;
      }
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener('click', async () => {
      const name = getFieldValue('signup-name');
      const email = getFieldValue('signup-email');
      const password = el('signup-password')?.value || '';
      const role = el('signup-role')?.value || 'student';

      if (!name || !email || !password) {
        Toast.show('All fields required', 'warning');
        return;
      }
      if (password.length < 8) {
        Toast.show('Password must be 8+ characters', 'warning');
        return;
      }

      signupBtn.disabled = true;
      setErrorArea(`Registering at: ${apiClient.baseURL}/api/auth/register`);

      try {
        const res = await apiClient.register({ name, email, password, role });
        if (!res?.accessToken) {
          Toast.show('Registration failed (missing token)', 'error');
          setErrorArea('Registration response missing accessToken');
          return;
        }

        const user = await apiClient.getCurrentUser();
        if (!user) {
          Toast.show('Registration succeeded but token could not be decoded', 'error', 6000);
          return;
        }

        Toast.show('Account created successfully', 'success');
        onAuthed?.(user);
      } catch (err) {
        console.error('Registration failed:', err);
        const payload = err?.message ? { error: err.message } : err;
        setErrorArea(err?.message || 'Registration error');
        showAuthDebugToast('Registration error', payload);
      } finally {
        signupBtn.disabled = false;
      }
    });
  }
}

