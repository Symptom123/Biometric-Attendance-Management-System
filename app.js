// ============================================================
// APP.JS - Biometric Attendance Management System
// Main application logic, router, and all view renderers
// ============================================================

import { DB, WebAuthnHelper, Toast } from './database.js';
import { apiClient } from './api-config.js';
import { renderLogin, renderSignup, bindAuth } from './auth-ui.js';

// ── STATE ─────────────────────────────────────────────────────
const State = {
  currentUser: null,
  currentRole: null,
  delegateOnline: true,
  scannerActive: false,
  scannerStudentId: null,
  webAuthnSupported: false,
  authMode: 'login'
};

// ── ROLE META ─────────────────────────────────────────────────
const ROLES = [
  { id: 'admin',    label: '⚙️ Admin',    icon: '⚙️', desc: 'Administrator' },
  { id: 'student',  label: '🎓 Student',  icon: '🎓', desc: 'Student' },
  { id: 'delegate', label: '📡 Delegate', icon: '📡', desc: 'Attendance Delegate' }
];

// ── INIT ──────────────────────────────────────────────────────
// ── AUTH CALLBACK ─────────────────────────────────────────────
function handleAuth(user) {
  State.currentUser = user;
  State.currentRole = user.role;
  renderTopbar();
  renderView(State.currentRole);
}

async function init() {
  DB.init();
  State.webAuthnSupported = await WebAuthnHelper.isAvailable();

  // Check if token exists
  if (apiClient.token) {
    const user = await apiClient.getCurrentUser();
    if (user) {
      State.currentUser = user;
      State.currentRole = user.role;
      renderTopbar();
      renderView(State.currentRole);
    } else {
      apiClient.logout();
      renderLogin();
      bindAuth({ onAuthed: handleAuth });
    }
  } else {
    renderLogin();
    bindAuth({ onAuthed: handleAuth });
  }

  startClock();
  addRippleEffect();
}

// Local renderLogin, renderSignup, and bindAuth functions removed to resolve ESM import conflicts and use auth-ui.js


// ── CLOCK ─────────────────────────────────────────────────────
function startClock() {
  const el = document.getElementById('topbar-clock');
  const update = () => {
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  update();
  setInterval(update, 1000);
}

// ── RIPPLE ────────────────────────────────────────────────────
function addRippleEffect() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  });
}

// ── TOPBAR ────────────────────────────────────────────────────
function renderTopbar() {
  const roleContainer = document.getElementById('role-switcher');
  if (!State.currentUser) {
    roleContainer.innerHTML = '';
    return;
  }

  const userRole = ROLES.find(r => r.id === State.currentRole) || ROLES[0];
  const tabs = ROLES.filter(r => r.id === State.currentRole).map(r => `
    <button class="role-tab active" title="${r.desc}">
      ${r.label}
    </button>
  `).join('');

  roleContainer.innerHTML = tabs + `
    <div style="margin-left:auto;display:flex;gap:12px;align-items:center">
      <span style="font-size:13px;color:var(--text-muted)">${State.currentUser.email}</span>
      <button id="logout-btn" class="btn btn-ghost">Logout</button>
    </div>`;

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      apiClient.logout();
      State.currentUser = null;
      State.currentRole = null;
      Toast.show('Signed out', 'info');
      renderLogin();
      bindAuth({ onAuthed: handleAuth });
    });
  }
}

// ── ROUTER ────────────────────────────────────────────────────
function renderView(role) {
  if (!State.currentUser) {
    renderLogin();
    bindAuth({ onAuthed: handleAuth });
    return;
  }

  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  requestAnimationFrame(() => {
    switch (role) {
      case 'admin':    content.innerHTML = renderAdmin();    bindAdmin();    break;
      case 'student':  content.innerHTML = renderStudent();  bindStudent();  break;
      case 'delegate': content.innerHTML = renderDelegate(); bindDelegate(); break;
    }
    animateCounters();
    animateRings();
    animateBars();
  });
}



// ──────────────────────────────────────────────────────────────
// ADMIN VIEW (with integrated Teacher class stats)
// ──────────────────────────────────────────────────────────────
function renderAdmin() {
  const students = DB.getUsers('student');
  const devices  = DB.getDevices();
  const logs     = DB.getAttendance().slice(0, 8);
  const total    = DB.getAttendance().length;
  const todayStr = new Date().toISOString().split('T')[0];
  const todayLogs = DB.getAttendance({ since: todayStr });
  const todayPresent = todayLogs.filter(l => l.status === 'present').length;

  // Class stats (merged from Teacher view)
  const classStats = DB.getClassStats();
  const lowAttendance = classStats.filter(s => s.stats.rate < 75);
  const classAvg = Math.round(classStats.reduce((acc,s) => acc + s.stats.rate, 0) / (classStats.length||1));
  const totalLate = classStats.reduce((acc,s) => acc + s.stats.late, 0);

  const webAuthnBadge = State.webAuthnSupported
    ? `<div class="webauthn-status supported">
        <span>✓</span>
        <span>Real fingerprint sensor detected on this device — WebAuthn ready!</span>
       </div>`
    : `<div class="webauthn-status unsupported">
        <span>⚠</span>
        <span>WebAuthn not available. Open on a smartphone with Touch ID / fingerprint sensor.</span>
       </div>`;

  // Rich student cards for the registry tab (merged from Teacher view)
  const studentCards = classStats.map(s => {
    const isLow = s.stats.rate < 75;
    const isMid = s.stats.rate >= 75 && s.stats.rate < 85;
    const color = isLow ? 'var(--accent-red)' : isMid ? 'var(--accent-amber)' : 'var(--accent-green)';
    const barBg = isLow ? 'var(--grad-red)' : isMid ? 'var(--grad-amber)' : 'var(--grad-green)';

    return `
      <div class="card" style="padding:var(--space-md) var(--space-lg)">
        <div style="display:flex;align-items:center;gap:var(--space-md)">
          <div class="avatar avatar-lg" style="background:${s.avatarColor}22;color:${s.avatarColor}">${s.avatar}</div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-weight:700;font-size:14px">${s.name}</span>
              ${isLow ? '<span class="badge badge-critical">🚨 Low</span>' : ''}
              ${s.biometricEnrolled
                ? '<span class="badge badge-present">✓ Enrolled</span>'
                : '<span class="badge badge-absent">No FP</span>'}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${s.department || '—'} · ${s.grade || '—'} · ${s.studentId || s.id}</div>
            <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
              <div class="progress-wrap" style="flex:1">
                <div class="progress-bar" style="width:${s.stats.rate}%;background:${barBg}"></div>
              </div>
              <span style="font-size:14px;font-weight:800;color:${color};min-width:40px">${s.stats.rate}%</span>
            </div>
            <div style="display:flex;gap:var(--space-md);margin-top:8px">
              <span style="font-size:11px;color:var(--accent-green)">✓ ${s.stats.present} present</span>
              <span style="font-size:11px;color:var(--accent-amber)">⏰ ${s.stats.late} late</span>
              <span style="font-size:11px;color:var(--accent-red)">✕ ${s.stats.absent} absent</span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-secondary btn-sm enroll-btn" data-id="${s.id}" data-name="${s.name}">
              ${s.biometricEnrolled ? '🔄 Re-enroll' : '👆 Enroll FP'}
            </button>
            <button class="btn btn-ghost btn-sm notify-parent-btn" data-id="${s.id}" data-name="${s.name}" data-rate="${s.stats.rate}" title="Notify Parent">📬</button>
            <button class="btn btn-ghost btn-sm manual-att-btn" data-id="${s.id}" data-name="${s.name}" title="Manual Override">✏️</button>
            <button class="btn btn-ghost btn-sm remove-user-btn" data-id="${s.id}" title="Remove">🗑</button>
          </div>
        </div>
      </div>`;
  }).join('');

  // Performance insights (from Teacher view)
  const sortedByRate = [...classStats].sort((a,b) => b.stats.rate - a.stats.rate);
  const insights = [
    {
      emoji: '📈',
      title: 'Highest Attendance',
      desc: sortedByRate.length ? `${sortedByRate[0].name} leads with ${sortedByRate[0].stats.rate}%` : '—'
    },
    {
      emoji: '⚠️',
      title: `${lowAttendance.length} Students Below 75%`,
      desc: lowAttendance.length ? lowAttendance.map(s => s.name).join(', ') : 'All students on track!'
    },
    {
      emoji: '🕐',
      title: 'Late Arrivals',
      desc: `${totalLate} total late entries logged`
    },
    {
      emoji: '🖐️',
      title: 'Biometric Enrollment',
      desc: `${classStats.filter(s => s.biometricEnrolled).length} of ${classStats.length} students enrolled`
    }
  ];

  const insightCards = insights.map(i => `
    <div class="insight-card">
      <div class="insight-emoji">${i.emoji}</div>
      <div class="insight-content">
        <div class="insight-title">${i.title}</div>
        <div class="insight-desc">${i.desc}</div>
      </div>
    </div>`).join('');

  const recentRows = logs.map(l => {
    const student = DB.getUserById(l.studentId);
    const device  = devices.find(d => d.id === l.deviceId);
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            ${student ? `<div class="avatar" style="width:28px;height:28px;font-size:11px;background:${student.avatarColor}22;color:${student.avatarColor}">${student.avatar}</div>` : ''}
            <span style="color:var(--text-primary);font-size:13px">${student ? student.name : '—'}</span>
          </div>
        </td>
        <td>${new Date(l.timestamp).toLocaleString()}</td>
        <td><span class="badge badge-${l.status}">${l.status.toUpperCase()}</span></td>
        <td>${device ? device.name : l.deviceId}</td>
        <td><span class="badge ${l.synced ? 'badge-present' : 'badge-warning'}">${l.synced ? 'Synced' : 'Pending'}</span></td>
      </tr>`;
  }).join('');

  const deviceCards = devices.map(d => `
    <div class="card device-card">
      <div class="device-icon">📡</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:14px;color:var(--text-primary)">${d.name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${d.location}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${d.model} · ${d.ipAddress}</div>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <span class="badge badge-${d.status}">${d.status === 'online' ? '🟢' : '🔴'} ${d.status}</span>
          ${d.offlineCache.length > 0 ? `<span class="badge badge-warning">⏳ ${d.offlineCache.length} cached</span>` : ''}
        </div>
      </div>
    </div>`).join('');

  const auditRows = DB.getAuditLogs(5).map(l => `
    <tr>
      <td style="font-family:monospace;font-size:11px">${l.action}</td>
      <td>${l.description}</td>
      <td>${new Date(l.timestamp).toLocaleTimeString()}</td>
    </tr>`).join('');

  return `
    <div style="padding:var(--space-lg);display:flex;flex-direction:column;gap:var(--space-lg)">
      <div class="view-header">
        <div>
          <h1 class="view-title">Admin Dashboard</h1>
          <p class="view-subtitle">Biometric Attendance Management System · Control Center</p>
        </div>
        <div class="view-actions">
          <button class="btn btn-secondary btn-sm" id="export-btn">📊 Export Report</button>
          <button class="btn btn-secondary btn-sm" id="add-user-btn">➕ Add Student</button>
          <button class="btn btn-danger btn-sm" id="reset-db-btn">🔄 Reset DB</button>
        </div>
      </div>

      <!-- Tab Bar -->
      <div style="display:flex;gap:4px;background:rgba(255,255,255,0.03);padding:4px;border-radius:var(--radius-lg);border:1px solid rgba(255,255,255,0.06)">
        <button class="admin-tab active" data-tab="dashboard" style="flex:1;padding:10px 16px;border:none;border-radius:var(--radius-md);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;background:rgba(99,102,241,0.15);color:var(--accent-primary);box-shadow:0 2px 8px rgba(99,102,241,0.15)">📊 Dashboard</button>
        <button class="admin-tab" data-tab="registry" style="flex:1;padding:10px 16px;border:none;border-radius:var(--radius-md);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;background:transparent;color:var(--text-muted)">🎓 Student Registry</button>
        <button class="admin-tab" data-tab="devices" style="flex:1;padding:10px 16px;border:none;border-radius:var(--radius-md);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.2s;background:transparent;color:var(--text-muted)">📡 Devices & Logs</button>
      </div>

      <!-- WebAuthn Status -->
      ${webAuthnBadge}

      <!-- TAB: Dashboard -->
      <div class="admin-tab-panel" data-panel="dashboard">
        <!-- Stats -->
        <div class="grid-4" style="margin-bottom:var(--space-lg)">
          <div class="card stat-card blue">
            <div class="stat-icon blue">👥</div>
            <div class="stat-value" data-count="${students.length}">${students.length}</div>
            <div class="stat-label">Total Students</div>
          </div>
          <div class="card stat-card green">
            <div class="stat-icon green">✅</div>
            <div class="stat-value" data-count="${todayPresent}">${todayPresent}</div>
            <div class="stat-label">Present Today</div>
            <div class="stat-trend up">▲ Live</div>
          </div>
          <div class="card stat-card purple">
            <div class="stat-icon purple">📊</div>
            <div class="stat-value" data-count="${classAvg}">${classAvg}%</div>
            <div class="stat-label">Class Average Rate</div>
          </div>
          <div class="card stat-card red">
            <div class="stat-icon red">🚨</div>
            <div class="stat-value" data-count="${lowAttendance.length}">${lowAttendance.length}</div>
            <div class="stat-label">Below 75% Threshold</div>
          </div>
        </div>

        <!-- Performance Insights -->
        <div style="margin-bottom:var(--space-lg)">
          <div class="section-title">Performance Insights</div>
          <div style="display:flex;flex-direction:column;gap:8px">${insightCards}</div>
        </div>

        <!-- Recent Attendance Log -->
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Recent Attendance Log</div>
              <div class="card-subtitle">Last ${logs.length} of ${total} entries</div>
            </div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrap">
              <table>
                <thead><tr><th>Student</th><th>Timestamp</th><th>Status</th><th>Device</th><th>Sync</th></tr></thead>
                <tbody>${recentRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB: Student Registry -->
      <div class="admin-tab-panel" data-panel="registry" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md)">
          <div>
            <div class="section-title" style="margin:0">Class Attendance Overview</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${students.length} students · ${students.filter(s=>s.biometricEnrolled).length} enrolled</div>
          </div>
          <button class="btn btn-secondary btn-sm" id="teacher-export-btn">📊 Export Class Report</button>
        </div>

        <!-- Registry Stats -->
        <div class="grid-4" style="margin-bottom:var(--space-lg)">
          <div class="card stat-card blue">
            <div class="stat-icon blue">👥</div>
            <div class="stat-value" data-count="${classStats.length}">${classStats.length}</div>
            <div class="stat-label">Total Students</div>
          </div>
          <div class="card stat-card red">
            <div class="stat-icon red">🚨</div>
            <div class="stat-value" data-count="${lowAttendance.length}">${lowAttendance.length}</div>
            <div class="stat-label">Below 75%</div>
          </div>
          <div class="card stat-card green">
            <div class="stat-icon green">📊</div>
            <div class="stat-value" data-count="${classAvg}">${classAvg}%</div>
            <div class="stat-label">Class Average</div>
          </div>
          <div class="card stat-card amber">
            <div class="stat-icon amber">⏰</div>
            <div class="stat-value" data-count="${totalLate}">${totalLate}</div>
            <div class="stat-label">Late Arrivals</div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px">${studentCards}</div>
      </div>

      <!-- TAB: Devices & Logs -->
      <div class="admin-tab-panel" data-panel="devices" style="display:none">
        <div>
          <div class="section-title">Delegate Devices</div>
          <div class="grid-2">${deviceCards}</div>
        </div>

        <div style="display:flex;gap:var(--space-sm);margin-top:var(--space-lg)">
          <button class="btn btn-secondary btn-sm" id="add-device-btn">➕ Register New Device</button>
        </div>

        <!-- Audit Log -->
        <div class="card" style="margin-top:var(--space-lg)">
          <div class="card-header">
            <div class="card-title">Audit Log</div>
          </div>
          <div class="card-body" style="padding:0">
            <div class="table-wrap">
              <table>
                <thead><tr><th>Action</th><th>Description</th><th>Time</th></tr></thead>
                <tbody>${auditRows}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function bindAdmin() {
  // Tab switching logic
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const targetPanel = tab.dataset.tab;
      // Update tab active states
      document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active');
        t.style.background = 'transparent';
        t.style.color = 'var(--text-muted)';
        t.style.boxShadow = 'none';
      });
      tab.classList.add('active');
      tab.style.background = 'rgba(99,102,241,0.15)';
      tab.style.color = 'var(--accent-primary)';
      tab.style.boxShadow = '0 2px 8px rgba(99,102,241,0.15)';
      // Show/hide panels
      document.querySelectorAll('.admin-tab-panel').forEach(panel => {
        panel.style.display = panel.dataset.panel === targetPanel ? '' : 'none';
      });
      // Re-animate bars and counters when switching tabs
      if (targetPanel === 'registry') {
        animateBars();
        animateCounters();
      }
    });
  });

  // Enroll Fingerprint buttons
  document.querySelectorAll('.enroll-btn').forEach(btn => {
    btn.addEventListener('click', () => openEnrollModal(btn.dataset.id, btn.dataset.name));
  });

  // Remove student buttons
  document.querySelectorAll('.remove-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      DB.removeUser(btn.dataset.id);
      Toast.show('Student removed.', 'info');
      renderView('admin');
    });
  });

  // Notify parent buttons (merged from Teacher view)
  document.querySelectorAll('.notify-parent-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const student = DB.getUserById(btn.dataset.id);
      const parent = student?.parentId ? DB.getUserById(student.parentId) : null;
      if (!parent) { Toast.show('No parent linked for this student.', 'warning'); return; }
      const rate = btn.dataset.rate;
      DB.addNotification(parent.id, rate < 75 ? 'critical' : 'warning',
        `⚠️ ${btn.dataset.name}'s attendance is at ${rate}%. Please encourage regular attendance.`,
        btn.dataset.id);
      Toast.show(`Notification sent to ${parent.name}!`, 'success');
    });
  });

  // Manual attendance buttons (merged from Teacher view)
  document.querySelectorAll('.manual-att-btn').forEach(btn => {
    btn.addEventListener('click', () => openManualAttModal(btn.dataset.id, btn.dataset.name));
  });

  // Export (main)
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const csv = DB.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `attendance_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Report exported as CSV!', 'success');
  });

  // Export (class report — registry tab)
  document.getElementById('teacher-export-btn')?.addEventListener('click', () => {
    const csv = DB.exportCSV();
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `class_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    Toast.show('Class report exported!', 'success');
  });

  // Add student
  document.getElementById('add-user-btn')?.addEventListener('click', openAddStudentModal);

  // Add device
  document.getElementById('add-device-btn')?.addEventListener('click', openAddDeviceModal);

  // Reset
  document.getElementById('reset-db-btn')?.addEventListener('click', () => {
    if (confirm('Reset all data? This will clear the database and re-seed demo data.')) {
      DB.reset();
      Toast.show('Database reset with fresh demo data.', 'info');
      renderView('admin');
    }
  });
}

function openManualAttModal(studentId, studentName) {
  const modal = createModal('Manual Attendance Override', `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
      Manually record attendance for <strong>${studentName}</strong>.
    </p>
    <div class="form-group">
      <label class="form-label">Status</label>
      <select class="form-select" id="manual-status">
        <option value="present">Present</option>
        <option value="late">Late</option>
        <option value="absent">Absent</option>
      </select>
    </div>
  `, [
    { id: 'cancel-manual', label: 'Cancel', class: 'btn-secondary' },
    { id: 'confirm-manual', label: '✏️ Record', class: 'btn-primary' }
  ]);

  document.getElementById('cancel-manual').addEventListener('click', () => modal.remove());
  document.getElementById('confirm-manual').addEventListener('click', () => {
    const status = document.getElementById('manual-status').value;
    DB.markAttendance(studentId, 'device-001', 'manual', status);
    modal.remove();
    Toast.show(`Manual ${status} recorded for ${studentName}.`, 'success');
    renderView('admin');
  });
}



// ──────────────────────────────────────────────────────────────
// STUDENT VIEW
// ──────────────────────────────────────────────────────────────
function renderStudent() {
  // Find the logged-in student in local DB by email or ID match
  let student = null;
  const allStudents = DB.getUsers('student');

  if (State.currentUser) {
    student = allStudents.find(s => s.email === State.currentUser.email)
           || allStudents.find(s => s.id === State.currentUser.id);

    // If no local entry exists, create one from the logged-in user data
    if (!student) {
      const colors = ['#6366f1','#10b981','#f59e0b','#ec4899','#06b6d4','#f97316','#8b5cf6'];
      const userName = State.currentUser.name || 'Student';
      student = DB.addUser({
        id: State.currentUser.id,
        role: 'student',
        name: userName,
        email: State.currentUser.email || '',
        studentId: State.currentUser.id,
        grade: '',
        department: '',
        avatar: userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2),
        avatarColor: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  if (!student) {
    return `<div style="padding:var(--space-lg)"><div class="empty-state"><div class="empty-icon">🎓</div><div class="empty-text">No student profile found. Please log in as a student.</div></div></div>`;
  }

  const stats    = DB.getStudentStats(student.id);
  const ringColor = stats.rate < 75 ? '#ef4444' : stats.rate < 85 ? '#f59e0b' : '#10b981';
  const circumference = 2 * Math.PI * 52;
  const dashOffset = circumference * (1 - stats.rate / 100);

  const calItems = stats.calendar.map(day => {
    const d = new Date(day.date);
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    return `
      <div class="cal-day ${day.status} ${day.date === new Date().toISOString().split('T')[0] ? 'today' : ''}">
        <span class="day-name">${dayNames[d.getDay()]}</span>
        <span class="day-num">${d.getDate()}</span>
      </div>`;
  }).join('');

  const recentRows = stats.logs.map(l => {
    const device = DB.getDevices().find(d => d.id === l.deviceId);
    return `
      <tr>
        <td>${new Date(l.timestamp).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' })}</td>
        <td>${new Date(l.timestamp).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' })}</td>
        <td><span class="badge badge-${l.status}">${l.status.toUpperCase()}</span></td>
        <td style="font-size:12px">${l.sessionLabel}</td>
        <td style="font-size:12px;color:var(--text-muted)">${device ? device.name : l.deviceId}</td>
      </tr>`;
  }).join('');

  // Self-enrollment button or active status
  const enrollSection = student.biometricEnrolled
    ? `<span class="badge badge-present" style="font-size:13px;padding:8px 16px">✅ Biometric Active</span>`
    : `<button class="btn btn-primary btn-sm" id="self-enroll-btn" style="gap:6px">🖐️ Enroll My Fingerprint</button>`;

  return `
    <div style="padding:var(--space-lg);display:flex;flex-direction:column;gap:var(--space-lg)">
      <div class="view-header">
        <div>
          <h1 class="view-title">Student Dashboard</h1>
          <p class="view-subtitle">Personal attendance history & performance</p>
        </div>
        <div class="view-actions">
          ${enrollSection}
        </div>
      </div>

      <!-- Profile + Ring -->
      <div class="grid-2">
        <div class="card" style="padding:var(--space-xl)">
          <div style="display:flex;align-items:center;gap:var(--space-lg)">
            <div class="avatar avatar-lg" style="width:72px;height:72px;font-size:26px;background:${student.avatarColor}22;color:${student.avatarColor}">${student.avatar}</div>
            <div>
              <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.5px">${student.name}</h2>
              <p style="font-size:13px;color:var(--text-secondary)">${student.grade || '—'} · ${student.department || '—'}</p>
              <p style="font-size:12px;color:var(--text-muted);margin-top:4px">${student.studentId || student.id}</p>
              <div style="margin-top:12px;display:flex;gap:8px">
                ${student.biometricEnrolled
                  ? '<span class="badge badge-present">🖐️ Fingerprint Enrolled</span>'
                  : '<span class="badge badge-absent">🚫 Not Enrolled</span>'}
              </div>
            </div>
          </div>
        </div>

        <div class="card" style="padding:var(--space-xl);display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="position:relative;width:140px;height:140px">
            <svg class="ring-svg" width="140" height="140" viewBox="0 0 120 120">
              <circle class="ring-bg" cx="60" cy="60" r="52" stroke-width="10"/>
              <circle class="ring-fill"
                cx="60" cy="60" r="52"
                stroke="${ringColor}"
                stroke-width="10"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${dashOffset}"
                style="transition:stroke-dashoffset 1.2s ease"/>
            </svg>
            <div class="ring-center" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <span class="ring-percent" style="color:${ringColor}">${stats.rate}%</span>
              <span class="ring-label">Attendance</span>
            </div>
          </div>
          <div style="display:flex;gap:var(--space-lg);margin-top:var(--space-md)">
            <div style="text-align:center">
              <div style="font-size:18px;font-weight:800;color:var(--accent-green)">${stats.present}</div>
              <div style="font-size:11px;color:var(--text-muted)">Present</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:18px;font-weight:800;color:var(--accent-amber)">${stats.late}</div>
              <div style="font-size:11px;color:var(--text-muted)">Late</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:18px;font-weight:800;color:var(--accent-red)">${stats.absent}</div>
              <div style="font-size:11px;color:var(--text-muted)">Absent</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 7-Day Calendar -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Last 7 Days</div>
          <div class="legend">
            <div class="legend-item"><div class="legend-dot" style="background:var(--accent-green)"></div>Present</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--accent-amber)"></div>Late</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--accent-red)"></div>Absent</div>
          </div>
        </div>
        <div class="card-body">
          <div class="week-calendar">${calItems}</div>
        </div>
      </div>

      <!-- Alert if low -->
      ${stats.rate < 75 ? `
        <div style="padding:var(--space-lg);background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:var(--radius-lg);display:flex;gap:var(--space-md);align-items:center">
          <span style="font-size:28px">🚨</span>
          <div>
            <div style="font-weight:700;color:var(--accent-red);font-size:14px">Low Attendance Warning</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">
              Your attendance rate (${stats.rate}%) is below the 75% minimum requirement. Please contact your teacher.
            </div>
          </div>
        </div>` : ''}

      <!-- Recent Log -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Recent Attendance History</div>
          <span class="badge badge-info">Last ${stats.logs.length} sessions</span>
        </div>
        <div class="card-body" style="padding:0">
          <div class="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Time</th><th>Status</th><th>Session</th><th>Device</th></tr></thead>
              <tbody>${recentRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
}

function bindStudent() {
  // Self-enrollment button
  document.getElementById('self-enroll-btn')?.addEventListener('click', () => {
    if (State.currentUser) {
      openEnrollModal(State.currentUser.id, State.currentUser.name || 'Student');
    }
  });
}


// ──────────────────────────────────────────────────────────────
// PARENT VIEW
// ──────────────────────────────────────────────────────────────
function renderParent() {
  const parents = DB.getUsers('parent');
  const parent  = DB.getUserById(State.currentParentId) || parents[0];
  const notifications = DB.getNotifications(parent.id);
  const children = (parent.childIds || []).map(id => {
    const student = DB.getUserById(id);
    const stats   = student ? DB.getStudentStats(id) : null;
    return { student, stats };
  }).filter(c => c.student);

  const childCards = children.map(({ student, stats }) => {
    const isLow = stats.rate < parent.alertThreshold;
    const ringColor = isLow ? 'var(--accent-red)' : stats.rate < 85 ? 'var(--accent-amber)' : 'var(--accent-green)';
    const miniDots = stats.calendar.map(d =>
      `<div class="mini-dot ${d.status}" title="${d.date}: ${d.status}"></div>`
    ).join('');

    return `
      <div class="card child-card">
        <div class="avatar avatar-lg" style="background:${student.avatarColor}22;color:${student.avatarColor}">${student.avatar}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-weight:700;font-size:15px">${student.name}</span>
            ${isLow ? `<span class="badge badge-critical">🚨 Below ${parent.alertThreshold}%</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${student.grade || '—'} · ${student.department || '—'}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${student.studentId || student.id}</div>
          <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
            <div class="progress-wrap" style="flex:1">
              <div class="progress-bar" style="width:${stats.rate}%;background:${isLow ? 'var(--grad-red)' : 'var(--grad-green)'}"></div>
            </div>
            <span style="font-size:16px;font-weight:800;color:${ringColor}">${stats.rate}%</span>
          </div>
          <div class="child-attendance-mini" style="margin-top:8px">${miniDots}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Last 7 days pattern</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:800;color:var(--accent-green)">${stats.present}</div>
            <div style="font-size:10px;color:var(--text-muted)">Present</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:20px;font-weight:800;color:var(--accent-red)">${stats.absent}</div>
            <div style="font-size:10px;color:var(--text-muted)">Absent</div>
          </div>
        </div>
      </div>`;
  }).join('');

  const unread = notifications.filter(n => !n.read).length;
  const notifList = notifications.length ? notifications.map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'} ${n.type}" data-id="${n.id}">
      <div class="notif-dot"></div>
      <div style="flex:1">
        <div style="font-size:13px;color:var(--text-primary);font-weight:${n.read ? 400 : 600}">${n.message}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${new Date(n.timestamp).toLocaleString()}</div>
      </div>
    </div>`).join('') : `<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-text">No notifications yet</div></div>`;

  const parentSelector = parents.map(p =>
    `<option value="${p.id}" ${p.id === parent.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  return `
    <div style="padding:var(--space-lg);display:flex;flex-direction:column;gap:var(--space-lg)">
      <div class="view-header">
        <div>
          <h1 class="view-title">Parent Portal</h1>
          <p class="view-subtitle">Monitor your child's attendance in real-time</p>
        </div>
        <div class="view-actions">
          <select class="form-select btn-sm" id="parent-selector" style="min-width:160px">
            ${parentSelector}
          </select>
        </div>
      </div>

      <!-- Parent Profile -->
      <div class="card" style="padding:var(--space-lg)">
        <div style="display:flex;align-items:center;gap:var(--space-md)">
          <div class="avatar avatar-lg" style="background:#64748b22;color:#94a3b8">${parent.avatar}</div>
          <div>
            <div style="font-size:18px;font-weight:700">${parent.name}</div>
            <div style="font-size:13px;color:var(--text-secondary)">${parent.email}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
              Alert threshold: <strong style="color:var(--accent-amber)">${parent.alertThreshold}%</strong> ·
              Notifications: <strong style="color:${parent.notificationsEnabled ? 'var(--accent-green)' : 'var(--accent-red)'}">${parent.notificationsEnabled ? 'Enabled' : 'Disabled'}</strong>
            </div>
          </div>
          <div style="margin-left:auto">
            ${unread > 0 ? `<div class="badge badge-critical">🔔 ${unread} new</div>` : ''}
          </div>
        </div>
      </div>

      <!-- Child Cards -->
      <div>
        <div class="section-title">Children's Attendance</div>
        <div style="display:flex;flex-direction:column;gap:10px">${childCards}</div>
      </div>

      <!-- Notifications -->
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Notifications</div>
            <div class="card-subtitle">${unread} unread</div>
          </div>
          ${unread > 0 ? `<button class="btn btn-ghost btn-sm" id="mark-all-read-btn">Mark all read</button>` : ''}
        </div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
          ${notifList}
        </div>
      </div>
    </div>`;
}

function bindParent() {
  document.getElementById('parent-selector')?.addEventListener('change', e => {
    State.currentParentId = e.target.value;
    renderView('parent');
  });

  document.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => {
      DB.markNotificationRead(el.dataset.id);
      el.classList.remove('unread');
    });
  });

  document.getElementById('mark-all-read-btn')?.addEventListener('click', () => {
    const parent = DB.getUserById(State.currentParentId);
    DB.getNotifications(parent.id).forEach(n => DB.markNotificationRead(n.id));
    renderView('parent');
  });
}



// ──────────────────────────────────────────────────────────────
// DELEGATE DEVICE VIEW
// ──────────────────────────────────────────────────────────────
function renderDelegate() {
  const devices  = DB.getDevices();
  const device   = devices.find(d => d.id === State.delegateDeviceId) || devices[0];
  const students = DB.getUsers('student').filter(s => s.biometricEnrolled);
  const cacheCount = DB.getOfflineCacheCount(device.id);

  const studentOptions = students.map(s =>
    `<option value="${s.id}">${s.name} — ${s.studentId || s.id}</option>`
  ).join('');

  const deviceSelector = devices.map(d =>
    `<option value="${d.id}" ${d.id === device.id ? 'selected' : ''}>${d.name}</option>`
  ).join('');

  const recentLogs = DB.getAttendance({ deviceId: device.id }).slice(0, 5);
  const recentRows = recentLogs.map(l => {
    const s = DB.getUserById(l.studentId);
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
        <div style="display:flex;align-items:center;gap:8px">
          ${s ? `<div class="avatar" style="width:28px;height:28px;font-size:11px;background:${s.avatarColor}22;color:${s.avatarColor}">${s.avatar}</div>` : ''}
          <span style="font-size:13px;color:var(--text-primary)">${s ? s.name : '—'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="badge badge-${l.status}">${l.status}</span>
          <span style="font-size:11px;color:var(--text-muted)">${new Date(l.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="padding:var(--space-lg);display:flex;flex-direction:column;gap:var(--space-lg)">
      <div class="view-header">
        <div>
          <h1 class="view-title">Delegate Device</h1>
          <p class="view-subtitle">Fingerprint scanner simulator with offline caching</p>
        </div>
        <div class="view-actions">
          <select class="form-select btn-sm" id="device-selector" style="min-width:200px">
            ${deviceSelector}
          </select>
        </div>
      </div>

      <div class="grid-2" style="align-items:start">
        <!-- Scanner Device UI -->
        <div class="scanner-device">
          <div class="scanner-screen" style="aspect-ratio:unset;height:auto">
            <div class="scanner-header">
              <div style="display:flex;align-items:center;gap:8px">
                <div class="scanner-status-dot ${State.delegateOnline ? '' : 'offline'}" id="scanner-dot"></div>
                <span style="font-size:12px;font-weight:600;color:var(--text-secondary)">${device.name}</span>
              </div>
              <span style="font-size:11px;color:var(--text-muted)">${device.ipAddress || '—'}</span>
            </div>

            <div style="padding:var(--space-md)">
              <!-- Network Toggle -->
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-md);padding:10px var(--space-md);background:rgba(255,255,255,0.03);border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.06)">
                <div>
                  <div style="font-size:13px;font-weight:600">Network</div>
                  <div style="font-size:11px;color:var(--text-muted)">Toggle offline to test caching</div>
                </div>
                <label class="toggle">
                  <input type="checkbox" id="network-toggle" ${State.delegateOnline ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>

              <!-- Offline Cache Badge -->
              <div id="cache-badge" style="margin-bottom:var(--space-md);display:${cacheCount > 0 ? 'flex' : 'none'};align-items:center;justify-content:space-between;padding:10px var(--space-md);background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:var(--radius-md)">
                <span style="font-size:13px;color:var(--accent-amber)">⏳ <strong>${cacheCount}</strong> records cached offline</span>
                <button class="btn btn-success btn-sm" id="sync-now-btn">⬆️ Sync Now</button>
              </div>

              <!-- Simulated Student Finger Dropdown -->
              <div class="form-group" style="margin-bottom:var(--space-md)">
                <label class="form-label">Simulate Finger Placement</label>
                <select class="form-select" id="scan-student-select">
                  <option value="">-- Select student fingerprint to simulate --</option>
                  ${studentOptions || '<option value="">No enrolled students</option>'}
                </select>
              </div>

              <!-- Scanner Canvas -->
              <div class="scanner-canvas-wrap" style="margin:0 auto var(--space-md)">
                <canvas id="scanner-canvas" width="140" height="140"></canvas>
                <div class="scanner-ring" id="scanner-ring"></div>
              </div>

              <!-- Scanner Message -->
              <div class="scanner-message" id="scanner-msg">
                <span>Tap the scanner to simulate fingerprint matching</span>
              </div>

              <!-- Scan Button -->
              <button class="btn btn-primary" id="scan-btn" style="width:100%;justify-content:center">
                🖐️ Scan Fingerprint
              </button>
            </div>
          </div>
        </div>

        <!-- Right Panel: Recent + Stats -->
        <div style="display:flex;flex-direction:column;gap:var(--space-md)">
          <!-- Device Info -->
          <div class="card" style="padding:var(--space-lg)">
            <div class="section-title">Device Info</div>
            <div style="display:flex;flex-direction:column;gap:10px;font-size:13px">
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--text-muted)">Model</span>
                <span>${device.model || '—'}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--text-muted)">Location</span>
                <span>${device.location}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--text-muted)">Status</span>
                <span class="badge badge-${State.delegateOnline ? 'online' : 'offline'}" id="device-status-badge">
                  ${State.delegateOnline ? '🟢 Online' : '🔴 Offline'}
                </span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:var(--text-muted)">Cached Records</span>
                <span id="cache-count-display">${cacheCount}</span>
              </div>
            </div>
          </div>

          <!-- Recent Logs -->
          <div class="card" style="padding:var(--space-lg)">
            <div class="section-title">Recent Scans</div>
            ${recentLogs.length ? `<div id="recent-scan-list">${recentRows}</div>` : `<div class="empty-state" style="padding:var(--space-lg)"><div class="empty-icon">📭</div><div class="empty-text">No scans yet today</div></div>`}
          </div>

          <!-- Today Stats -->
          <div class="card" style="padding:var(--space-lg)">
            <div class="section-title">Today's Stats</div>
            <div class="grid-2" style="gap:10px">
              ${[
                { label: 'Total Scans', value: DB.getAttendance({ deviceId: device.id, since: new Date().toISOString().split('T')[0] }).length, color: 'var(--accent-cyan)' },
                { label: 'Successful', value: DB.getAttendance({ deviceId: device.id, status: 'present', since: new Date().toISOString().split('T')[0] }).length, color: 'var(--accent-green)' }
              ].map(s => `
                <div style="text-align:center;padding:var(--space-md);background:rgba(255,255,255,0.03);border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.06)">
                  <div style="font-size:28px;font-weight:800;color:${s.color}">${s.value}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${s.label}</div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

function bindDelegate() {
  // Draw initial fingerprint on canvas
  drawFingerprintCanvas(false, false);

  document.getElementById('device-selector')?.addEventListener('change', e => {
    State.delegateDeviceId = e.target.value;
    renderView('delegate');
  });

  document.getElementById('network-toggle')?.addEventListener('change', e => {
    State.delegateOnline = e.target.checked;
    const dot = document.getElementById('scanner-dot');
    const badge = document.getElementById('device-status-badge');
    if (dot) { dot.className = `scanner-status-dot ${State.delegateOnline ? '' : 'offline'}`; }
    if (badge) { badge.innerHTML = State.delegateOnline ? '🟢 Online' : '🔴 Offline'; badge.className = `badge badge-${State.delegateOnline ? 'online' : 'offline'}`; }

    if (State.delegateOnline) {
      const cacheCount = DB.getOfflineCacheCount(State.delegateDeviceId);
      if (cacheCount > 0) {
        Toast.show(`Network restored — auto-syncing ${cacheCount} cached records...`, 'info');
        setTimeout(() => performSync(), 1200);
      } else {
        Toast.show('Device back online.', 'success');
      }
    } else {
      Toast.show('Device offline — scans will be cached locally.', 'warning');
    }
  });

  document.getElementById('scan-btn')?.addEventListener('click', () => {
    runScanAnimation();
  });

  document.getElementById('scanner-canvas')?.addEventListener('click', () => {
    runScanAnimation();
  });

  document.getElementById('sync-now-btn')?.addEventListener('click', () => {
    performSync();
  });
}

function runScanAnimation() {
  if (State.scannerActive) return;

  const simulatedStudentId = document.getElementById('scan-student-select')?.value;
  if (!simulatedStudentId) {
    Toast.show('Please select a student fingerprint to simulate placing on the scanner.', 'warning');
    return;
  }

  State.scannerActive = true;
  const msg = document.getElementById('scanner-msg');
  const ring = document.getElementById('scanner-ring');
  const btn = document.getElementById('scan-btn');

  ring?.classList.add('active');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Scanning...';

  // Phase 1: scanning
  drawFingerprintCanvas(true, false);
  if (msg) msg.innerHTML = `<span class="spinner"></span> Reading fingerprint...`;

  setTimeout(() => {
    // Phase 2: matching (1-to-N search simulation)
    if (msg) msg.innerHTML = `🔍 Searching database (1-to-N matching)...`;
    drawFingerprintCanvas(true, false);
  }, 1000);

  setTimeout(() => {
    // Phase 3: result (identify student)
    const allStudents = DB.getUsers('student');
    const matchedStudent = allStudents.find(s => s.id === simulatedStudentId && s.biometricEnrolled);

    ring?.classList.remove('active');

    if (matchedStudent) {
      drawFingerprintCanvas(false, true);
      if (msg) msg.innerHTML = `<span style="color:var(--accent-green);font-weight:700">✓ Matched — ${matchedStudent.name}</span>`;

      if (State.delegateOnline) {
        DB.markAttendance(matchedStudent.id, State.delegateDeviceId, 'fingerprint', 'present');
        Toast.show(`✓ ${matchedStudent.name} marked Present!`, 'success');
        
        // Sync to backend API if available
        apiClient.markAttendance(matchedStudent.id, State.delegateDeviceId, 'present')
          .then(() => console.log('Attendance synced to backend API'))
          .catch(err => console.warn('Backend sync failed:', err));
      } else {
        DB.cacheAttendanceOffline(matchedStudent.id, State.delegateDeviceId);
        updateCacheBadge();
        Toast.show(`📦 Cached offline — will sync when online`, 'warning');
      }

      // Flash green
      const canvas = document.getElementById('scanner-canvas');
      if (canvas) {
        canvas.style.boxShadow = '0 0 40px rgba(16,185,129,0.8)';
        setTimeout(() => { canvas.style.boxShadow = '0 0 24px rgba(99,102,241,0.2)'; }, 1500);
      }
    } else {
      drawFingerprintCanvas(false, false);
      if (msg) msg.innerHTML = `<span style="color:var(--accent-red)">✕ No match found — try again</span>`;
      Toast.show('Fingerprint not recognized.', 'error');

      const canvas = document.getElementById('scanner-canvas');
      if (canvas) {
        canvas.style.boxShadow = '0 0 40px rgba(239,68,68,0.8)';
        setTimeout(() => { canvas.style.boxShadow = '0 0 24px rgba(99,102,241,0.2)'; }, 1500);
      }
    }

    btn.disabled = false;
    btn.innerHTML = '🖐️ Scan Fingerprint';
    State.scannerActive = false;

    // Update recent list
    const device = DB.getDevices().find(d => d.id === State.delegateDeviceId);
    const recentLogs = DB.getAttendance({ deviceId: State.delegateDeviceId }).slice(0, 5);
    const recentList = document.getElementById('recent-scan-list');
    if (recentList && recentLogs.length) {
      recentList.innerHTML = recentLogs.map(l => {
        const s = DB.getUserById(l.studentId);
        return `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.055)">
            <div style="display:flex;align-items:center;gap:8px">
              ${s ? `<div class="avatar" style="width:28px;height:28px;font-size:11px;background:${s.avatarColor}22;color:${s.avatarColor}">${s.avatar}</div>` : ''}
              <span style="font-size:13px;color:var(--text-primary)">${s ? s.name : '—'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="badge badge-${l.status}">${l.status}</span>
              <span style="font-size:11px;color:var(--text-muted)">${new Date(l.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>`;
      }).join('');
    }
  }, 2400);
}


// ── CANVAS FINGERPRINT RENDERER ────────────────────────────────
function drawFingerprintCanvas(scanning = false, success = false) {
  const canvas = document.getElementById('scanner-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = '#0a0e1a';
  ctx.beginPath();
  ctx.arc(cx, cy, cx, 0, Math.PI * 2);
  ctx.fill();

  // Fingerprint ridges
  const color = success ? 'rgba(16,185,129,0.7)' : scanning ? 'rgba(99,102,241,0.7)' : 'rgba(148,163,184,0.25)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  const numRidges = 16;
  for (let i = 0; i < numRidges; i++) {
    const r = (i + 1) * 5;
    const startAngle = Math.PI * 0.8 + (i * 0.04);
    const endAngle = Math.PI * 2.2 - (i * 0.04);
    ctx.beginPath();
    ctx.arc(cx, cy + 10, r, startAngle, endAngle);
    ctx.stroke();
  }

  // Arch ridges at top
  for (let i = 0; i < 8; i++) {
    const r = 20 + i * 7;
    ctx.beginPath();
    ctx.arc(cx, cy - 20, r, Math.PI + 0.3 - i * 0.05, Math.PI * 2 - 0.3 + i * 0.05);
    ctx.stroke();
  }

  // Center delta lines
  for (let i = 0; i < 5; i++) {
    const y1 = cy - 20 + i * 8;
    ctx.beginPath();
    ctx.moveTo(cx - 12 + i * 3, y1);
    ctx.lineTo(cx + 12 - i * 3, y1);
    ctx.stroke();
  }

  // Scan line overlay
  if (scanning && !success) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(99,102,241,0)');
    grad.addColorStop(0.5, 'rgba(99,102,241,0.5)');
    grad.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(10, 20, w - 20, 4);
  }

  // Success checkmark
  if (success) {
    ctx.strokeStyle = 'rgba(16,185,129,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy);
    ctx.lineTo(cx - 5, cy + 15);
    ctx.lineTo(cx + 20, cy - 15);
    ctx.stroke();
  }
}

// ── ANIMATIONS ─────────────────────────────────────────────────
function animateCounters() {
  document.querySelectorAll('.stat-value[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count);
    if (isNaN(target)) return;
    let start = 0;
    const duration = 800;
    const startTime = performance.now();
    const update = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(start + (target - start) * eased) + (el.dataset.suffix || '');
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  });
}

function animateRings() {
  // Rings animate via CSS transitions triggered on load
}

function animateBars() {
  document.querySelectorAll('.progress-bar').forEach(bar => {
    const w = bar.style.width;
    bar.style.width = '0';
    setTimeout(() => { bar.style.width = w; }, 100);
  });
}

// ── MODAL FACTORY ──────────────────────────────────────────────
function createModal(title, bodyHTML, buttons = []) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2 style="font-size:17px;font-weight:700">${title}</h2>
        <button class="btn btn-ghost btn-icon close-modal-btn" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div class="modal-footer">
        ${buttons.map(b => `<button class="btn ${b.class}" id="${b.id}">${b.label}</button>`).join('')}
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  backdrop.querySelector('.close-modal-btn').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });

  return backdrop;
}

// ── MISC MODALS & HELPERS ───────────────────────────────────
function openAddStudentModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">Full name</label>
      <input id="add-student-name" class="form-input" />
    </div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input id="add-student-email" class="form-input" />
    </div>
    <div class="form-group">
      <label class="form-label">Grade / Class</label>
      <input id="add-student-grade" class="form-input" />
    </div>
    <div class="form-group">
      <label class="form-label">Department</label>
      <input id="add-student-dept" class="form-input" />
    </div>`;

  const modal = createModal('Add Student', body, [
    { id: 'cancel-add-student', label: 'Cancel', class: 'btn-secondary' },
    { id: 'confirm-add-student', label: '➕ Add Student', class: 'btn-primary' }
  ]);

  document.getElementById('cancel-add-student')?.addEventListener('click', () => modal.remove());
  document.getElementById('confirm-add-student')?.addEventListener('click', () => {
    const name = document.getElementById('add-student-name')?.value?.trim();
    const email = document.getElementById('add-student-email')?.value?.trim();
    const grade = document.getElementById('add-student-grade')?.value?.trim();
    const dept = document.getElementById('add-student-dept')?.value?.trim();
    if (!name) { Toast.show('Student name required', 'warning'); return; }

    const colors = ['#6366f1','#10b981','#f59e0b','#ec4899','#06b6d4','#f97316','#8b5cf6'];
    const avatar = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    DB.addUser({ role: 'student', name, email, grade, department: dept, avatar, avatarColor, studentId: email || undefined });
    Toast.show('Student added', 'success');
    modal.remove();
    renderView('admin');
  });
}

function openAddDeviceModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">Device name</label>
      <input id="add-device-name" class="form-input" />
    </div>
    <div class="form-group">
      <label class="form-label">Model</label>
      <input id="add-device-model" class="form-input" />
    </div>
    <div class="form-group">
      <label class="form-label">Location</label>
      <input id="add-device-location" class="form-input" />
    </div>
    <div class="form-group">
      <label class="form-label">IP Address (optional)</label>
      <input id="add-device-ip" class="form-input" />
    </div>`;

  const modal = createModal('Register Device', body, [
    { id: 'cancel-add-device', label: 'Cancel', class: 'btn-secondary' },
    { id: 'confirm-add-device', label: '➕ Register Device', class: 'btn-primary' }
  ]);

  document.getElementById('cancel-add-device')?.addEventListener('click', () => modal.remove());
  document.getElementById('confirm-add-device')?.addEventListener('click', () => {
    const name = document.getElementById('add-device-name')?.value?.trim();
    const model = document.getElementById('add-device-model')?.value?.trim();
    const location = document.getElementById('add-device-location')?.value?.trim();
    const ip = document.getElementById('add-device-ip')?.value?.trim();
    if (!name) { Toast.show('Device name required', 'warning'); return; }
    DB.addDevice({ name, model, location, ipAddress: ip });
    Toast.show('Device registered', 'success');
    modal.remove();
    renderView('admin');
  });
}

async function openEnrollModal(studentId, studentName) {
  const body = `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Follow the on-screen fingerprint prompt. Use your device's biometric sensor.</p>
    <div id="enroll-status" style="font-size:13px;color:var(--text-muted)">Ready</div>`;

  const modal = createModal('Biometric Enrollment', body, [
    { id: 'cancel-enroll', label: 'Cancel', class: 'btn-secondary' },
    { id: 'start-enroll', label: 'Start Enrollment', class: 'btn-primary' }
  ]);

  document.getElementById('cancel-enroll')?.addEventListener('click', () => modal.remove());

  document.getElementById('start-enroll')?.addEventListener('click', async (e) => {
    const btn = e.target;
    btn.disabled = true;
    const status = document.getElementById('enroll-status');
    if (status) status.textContent = 'Starting biometric enrollment...';

    try {
      // Step 1: Get challenge from backend
      let challengeResponse;
      try {
        challengeResponse = await apiClient.webauthnEnrollmentStart(studentId);
      } catch (err) {
        console.warn('Backend WebAuthn start failed, falling back to local DB only:', err);
      }

      // Step 2: Perform WebAuthn enrollment
      const result = await WebAuthnHelper.enrollFingerprint(studentId, studentName);
      if (!result || !result.success) {
        status.textContent = `Enrollment failed: ${result?.error || 'unknown'}`;
        Toast.show(`Enrollment failed: ${result?.error || 'unknown'}`, 'error');
        btn.disabled = false;
        return;
      }

      // Step 3: Send credential to backend for storage (if backend is up)
      if (challengeResponse) {
        try {
          await apiClient.webauthnEnrollmentComplete({
            challengeId: challengeResponse.challengeId,
            studentId,
            credentialId: result.credentialId,
            attestationObject: result.attestationObject,
            publicKeySPKI: result.publicKeySPKI,
            counter: result.counter || 0
          });
          Toast.show('Biometric enrollment synced to server', 'success');
        } catch (err) {
          console.error('Backend sync failed:', err);
          Toast.show('Enrolled locally, but server sync failed', 'warning');
        }
      }

      // Step 4: Sync with local DB
      const credentialData = {
        credentialId: result.credentialId,
        publicKeySPKI: result.publicKeySPKI,
        attestationObject: result.attestationObject,
        transports: result.transports || [],
        counter: result.counter || 0
      };

      DB.enrollBiometric(studentId, credentialData);
      status.textContent = 'Enrollment successful — biometric active';
      if (!challengeResponse) Toast.show('Biometric enrollment completed (Local only)', 'success');
      modal.remove();
      
      // Re-render current view to reflect enrolled status
      if (typeof renderView === 'function') {
        renderView(State.currentRole || 'admin');
      } else {
        location.reload();
      }
    } catch (err) {
      console.error('Enroll error', err);
      Toast.show('Enrollment failed: ' + err.message, 'error');
      status.textContent = 'Error: ' + err.message;
      btn.disabled = false;
    }
  });
}

function performSync(deviceId = State.delegateDeviceId) {
  if (!deviceId) return;
  const synced = DB.syncOfflineCache(deviceId) || [];
  if (synced.length) {
    Toast.show(`Synced ${synced.length} records`, 'success');
  } else {
    Toast.show('No cached records to sync', 'info');
  }
  updateCacheBadge();
  renderView('delegate');
}

function updateCacheBadge() {
  const badge = document.getElementById('cache-badge');
  const countEl = document.getElementById('cache-count-display');
  const count = DB.getOfflineCacheCount(State.delegateDeviceId);
  if (countEl) countEl.textContent = count;
  if (badge) badge.style.display = count > 0 ? 'flex' : 'none';
}

// ── UTILITY ────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── BOOT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
