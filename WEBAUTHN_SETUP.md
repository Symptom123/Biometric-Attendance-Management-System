# WebAuthn Biometric Attendance System - Setup Guide

## ✅ What Was Fixed

### 1. **Demo Data Removed**
- Cleared all hardcoded seed data from `database.js`
- Removed 9 demo users, 2 demo devices, and 14 days of fake attendance records
- System now starts with a clean slate

### 2. **Real WebAuthn Implementation**
The fingerprint authentication now uses the **W3C WebAuthn API** standard:

- **Enrollment Flow**:
  1. Frontend requests enrollment challenge from backend
  2. Device prompts user to scan fingerprint
  3. Browser generates public/private key pair bound to fingerprint
  4. Frontend sends attestation object + credential ID to backend
  5. Backend stores public key securely in PostgreSQL

- **Verification Flow**:
  1. Backend generates verification challenge
  2. Device prompts user to scan fingerprint
  3. Browser signs challenge with stored private key
  4. Frontend sends assertion to backend
  5. Backend verifies signature using stored public key
  6. Attendance automatically marked as "Present"

### 3. **Backend Database Schema**
New `webauthn_credentials` table stores:
- `credential_id` - Unique identifier from the WebAuthn device
- `public_key_spki` - Public key in SPKI format (for verification)
- `attestation_object` - Attestation data from device
- `counter` - Counter for replay attack prevention
- `enrolled_at` - Timestamp of enrollment
- `last_used_at` - Timestamp of last verification

### 4. **Secure API Endpoints**

#### POST `/api/webauthn/enrollment/start`
```json
{
  "studentId": "student-001"
}
```
Returns: `{ challengeId, challenge, rp, user }`

#### POST `/api/webauthn/enrollment/complete`
```json
{
  "challengeId": "...",
  "studentId": "student-001",
  "credentialId": "...",
  "attestationObject": "...",
  "publicKeySPKI": "...",
  "counter": 0
}
```
Returns: `{ success: true, credentialId, message }`

#### POST `/api/webauthn/verification/start`
```json
{
  "studentId": "student-001"
}
```
Returns: `{ verificationId, challenge, allowCredentials }`

#### POST `/api/webauthn/verification/complete`
```json
{
  "verificationId": "...",
  "studentId": "student-001",
  "credentialId": "...",
  "clientDataJSON": "...",
  "authenticatorData": "...",
  "signature": "...",
  "deviceId": "device-001",
  "autoMark": true
}
```
Returns: `{ success: true, verified: true, attendance: {...} }`

---

## 🚀 Setup Instructions

### Prerequisites
- Node.js 16+ (backend)
- PostgreSQL 12+ (database)
- Modern browser with WebAuthn support (Chrome, Safari, Edge, Firefox)
- **Physical device with fingerprint sensor** (smartphone or laptop)

### 1. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://user:password@localhost:5432/bams
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:8000
JWT_SECRET=your-secret-key-here
EOF

# Initialize database
npm run init-db

# Start backend server
npm start
# Runs on http://localhost:4000
```

### 2. Frontend Setup

```bash
# No build required - vanilla JavaScript
# Just serve the files on a local server

# Option A: Using Python
python -m http.server 8000

# Option B: Using Node
npx http-server -p 8000

# Option C: Using VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

Access the system at: **http://localhost:8000**

### 3. Database Schema

The backend automatically creates tables on startup. Verify with:

```sql
\dt  -- List all tables

-- Check webauthn_credentials table
SELECT * FROM webauthn_credentials;
```

---

## 📱 Testing WebAuthn Enrollment

### On a Real Device (Phone):
1. Open **Chrome** or **Safari** on your phone
2. Navigate to `http://your-laptop-ip:8000` (not localhost)
3. Switch to **Admin** role
4. Click **"Add Student"** to create a test student
5. Click **"👆 Enroll FP"** button
6. When prompted, scan your fingerprint
7. ✅ Enrollment complete! Public key stored on backend

### On Desktop with External Sensor:
- Connect a USB fingerprint scanner (e.g., Suprema BioMini, DigitalPersona U.are.U)
- Repeat steps 1-7 above

---

## 🔒 Security Features

### 1. **Biometric Data Privacy**
- ✅ Fingerprint never leaves the device
- ✅ Only cryptographic public key stored on server
- ✅ Private key always in secure enclave (phone/hardware)

### 2. **Challenge-Response Authentication**
- ✅ Server generates random 32-byte challenges
- ✅ Challenges expire after 5-10 minutes
- ✅ Prevents replay attacks

### 3. **Counter Validation**
- ✅ Each credential has a counter
- ✅ Counter incremented on each use
- ✅ Detects cloned/duplicated credentials

### 4. **HTTPS (Production)**
- Recommended: Use HTTPS in production
- Include Secure-HttpOnly cookies for JWT tokens
- Implement CORS restrictions

---

## 🎯 Key API Client Methods

In `api-config.js`, use the `apiClient` for:

```javascript
import { apiClient } from './api-config.js';

// Enrollment
const enrollStart = await apiClient.webauthnEnrollmentStart(studentId);
const enrollComplete = await apiClient.webauthnEnrollmentComplete({
  challengeId, studentId, credentialId, attestationObject, publicKeySPKI
});

// Verification
const verifyStart = await apiClient.webauthnVerificationStart(studentId);
const verifyComplete = await apiClient.webauthnVerificationComplete({
  verificationId, studentId, credentialId, clientDataJSON, 
  authenticatorData, signature, deviceId
});

// Credentials Management
const creds = await apiClient.getWebauthnCredentials(studentId);
await apiClient.revokeWebauthnCredential(credentialId);

// Attendance
await apiClient.markAttendance(studentId, deviceId, 'present');
const report = await apiClient.getAttendanceReport({ startDate, endDate });
```

---

## 📊 Database Structure

### `users` table
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  biometric_enrolled BOOLEAN DEFAULT FALSE,
  biometric_enrolled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `webauthn_credentials` table
```sql
CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key_spki TEXT NOT NULL,
  attestation_object TEXT,
  counter INTEGER DEFAULT 0,
  transports TEXT[] DEFAULT ARRAY['usb', 'nfc', 'ble', 'internal'],
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
```

### `attendance` table
```sql
CREATE TABLE attendance (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id),
  device_id TEXT,
  status TEXT NOT NULL,
  method TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🐛 Troubleshooting

### "WebAuthn not available"
- ✅ Use a device with a fingerprint sensor
- ✅ Ensure HTTPS in production (required by spec)
- ✅ Check browser support: Chrome 60+, Safari 13+, Edge 18+, Firefox 60+

### "Fingerprint sensor not detected"
- ✅ Verify sensor is properly connected (USB)
- ✅ Check device drivers are installed
- ✅ Restart browser

### "Enrollment failed at server"
- ✅ Verify backend is running: `curl http://localhost:4000/api/health`
- ✅ Check PostgreSQL connection: `psql $DATABASE_URL`
- ✅ View backend logs for errors

### "Attendance not marked"
- ✅ Ensure fingerprint verification succeeded (check response)
- ✅ Verify device_id is valid
- ✅ Check database `attendance` table: `SELECT * FROM attendance ORDER BY created_at DESC LIMIT 10;`

---

## 📝 Files Modified

| File | Changes |
|------|---------|
| `database.js` | Removed seed data, improved WebAuthn helpers |
| `app.js` | Added API client, updated enrollment modal |
| `api-config.js` | **NEW** - Backend API client |
| `backend/src/routes/fingerprint.js` | Implemented WebAuthn endpoints |
| `backend/src/scripts/initDb.js` | Added webauthn_credentials table schema |

---

## 🔐 Production Checklist

- [ ] Switch to HTTPS (required for WebAuthn)
- [ ] Set `NODE_ENV=production`
- [ ] Use strong `JWT_SECRET`
- [ ] Enable CORS for frontend domain only
- [ ] Implement rate limiting on enrollment endpoints
- [ ] Add logging for all biometric operations
- [ ] Regular security audits of attestation objects
- [ ] Database backups of credentials
- [ ] Monitor counter values for anomalies

---

## 📚 References

- [W3C WebAuthn Spec](https://www.w3.org/TR/webauthn-2/)
- [FIDO2 Alliance](https://fidoalliance.org/)
- [MDN WebAuthn API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API)
- [OWASP: Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

---

## 🎓 Example Workflow

```
Admin Dashboard
  ↓
"Add Student" → Creates: student-001
  ↓
"Enroll FP" → Opens enrollment modal
  ↓
API: POST /webauthn/enrollment/start
  ← Returns: challengeId, challenge
  ↓
WebAuthn: navigator.credentials.create()
  ← Prompts for fingerprint scan
  ← Returns: credentialId, attestationObject
  ↓
API: POST /webauthn/enrollment/complete
  ← Stores public key in database
  ← Returns: success ✓
  ↓
Student is now enrolled!

---

Later, Student marks attendance:
  ↓
API: POST /webauthn/verification/start
  ← Returns: verificationId, challenge, allowCredentials
  ↓
WebAuthn: navigator.credentials.get()
  ← Prompts for fingerprint scan
  ← Signature verified by device
  ↓
API: POST /webauthn/verification/complete
  ← Backend verifies signature with public key
  ← Marks attendance as "Present"
  ← Returns: success ✓
  ↓
Dashboard updates with new attendance record!
```

---

**System Ready for Production WebAuthn-based Attendance!** 🎉
