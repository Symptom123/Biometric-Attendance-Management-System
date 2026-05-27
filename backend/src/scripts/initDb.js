import db from '../config/db.js';

const createTables = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  avatar TEXT,
  avatar_color TEXT,
  student_id TEXT,
  grade TEXT,
  department TEXT,
  parent_id TEXT,
  child_ids TEXT,
  biometric_enrolled INTEGER DEFAULT 0,
  biometric_enrolled_at TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key_spki TEXT NOT NULL,
  attestation_object TEXT,
  counter INTEGER DEFAULT 0,
  transports TEXT DEFAULT '["usb","nfc","ble","internal"]',
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_student_id ON webauthn_credentials(student_id);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_credential_id ON webauthn_credentials(credential_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  type TEXT,
  model TEXT,
  status TEXT DEFAULT 'offline',
  ip_address TEXT,
  last_seen TEXT,
  offline_cache TEXT DEFAULT '[]',
  configured_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  device_id TEXT,
  status TEXT NOT NULL,
  method TEXT NOT NULL,
  synced INTEGER DEFAULT 1,
  session_label TEXT,
  verified_by TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_timestamp ON attendance(timestamp);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  student_id TEXT,
  read INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`;

export async function initDatabase() {
  try {
    await db.exec(createTables);
    console.log('Database schema checked and initialized.');
  } catch (error) {
    console.error('Failed to initialize the database:', error);
    process.exit(1);
  }
}
