# Quick Start Guide - WebAuthn Biometric Attendance

## What Changed?

✅ **Removed all demo data** - System starts clean
✅ **Implemented real WebAuthn** - Uses browser fingerprint sensor
✅ **Secure public key storage** - Private key stays on device
✅ **Backend verification** - Signature verification with stored public key
✅ **Attendance auto-marking** - After successful fingerprint scan

---

## Quick Setup (5 minutes)

### Backend
```bash
cd backend
npm install
npm start
# Backend running on http://localhost:4000
```

### Frontend
```bash
# In a new terminal, from project root
python -m http.server 8000
# Frontend running on http://localhost:8000
```

### Database
Create PostgreSQL database (backend will auto-create tables):
```sql
CREATE DATABASE bams_attendance;
```

Update `.env` in backend folder with your connection string.

---

## Test Enrollment

1. Open http://localhost:8000 in Chrome/Safari on **a phone or laptop with fingerprint sensor**
2. Click **Admin** role
3. Click **Add Student** button
4. Enter student info and click **Add Student**
5. Click **👆 Enroll FP** button
6. **Scan your fingerprint** when prompted
7. ✅ Success! Fingerprint enrolled

---

## Test Verification (Attendance Mark)

1. Click **Student** role
2. Click **Mark Attendance with Fingerprint**
3. **Scan your fingerprint** when prompted
4. ✅ Attendance marked as "Present"!

---

## Key Files

- `api-config.js` - API client for backend communication
- `database.js` - Local database and WebAuthn helpers
- `app.js` - Frontend UI and enrollment modal
- `backend/src/routes/fingerprint.js` - WebAuthn endpoints
- `backend/src/scripts/initDb.js` - Database schema

---

## Architecture

```
FRONTEND                          BACKEND
browser                          Node.js/Express
  ↓                                ↓
WebAuthn API  ←→  HTTP/REST  ←→  PostgreSQL
  ↓                                ↓
Fingerprint                      Public Keys
Sensor                           Storage
```

---

## Security

- 🔐 Fingerprint never leaves device
- 🔐 Only public key stored on server
- 🔐 Private key in device's secure enclave
- 🔐 Signature verification on backend
- 🔐 Challenge-response prevents replay attacks

---

## Troubleshooting

**"WebAuthn not available"**
→ Use phone with fingerprint sensor (Chrome/Safari)

**"Backend not responding"**
→ Check: `curl http://localhost:4000/api/health`

**"Enrollment fails"**
→ Check browser console and backend logs

---

For full documentation, see **WEBAUTHN_SETUP.md**
