# TODO - Biometric Attendance Security Portal (BAMS)

## Phase 1 — Audit logging (backend)
- [x] Create `backend/src/services/audit.js` to write to `audit_logs` table.
- [x] Add lightweight middleware/helpers to capture actorId/ipAddress/role.
- [x] Update `backend/src/routes/auth.js` to write audit logs for: register, login success/failure, refresh token use.
- [x] Update `backend/src/routes/users.js` to write audit logs for admin/teacher user updates.
- [x] Update `backend/src/routes/fingerprint.js` to write audit logs for enrollment/verification start/complete success/failure.
- [x] Update `backend/src/routes/attendance.js` to write audit logs for attendance mark (manual + biometric).


## Phase 2 — Delegate approval + authorization hardening
- [ ] Update DB schema in `backend/src/scripts/initDb.js`: add `delegate_approved` column to `users`.
- [ ] Update `backend/src/routes/auth.js` register endpoint to default `delegate_approved=0` for delegates.
- [ ] Add middleware `backend/src/middleware/delegateApproval.js` to deny delegate access unless approved.
- [ ] Apply delegate approval middleware to delegate routes (attendance marking and any delegate biometric/device endpoints).
- [ ] Add admin endpoints in `backend/src/routes/users.js` to approve/deny delegates.
- [ ] Ensure audit logs are written for approve/deny actions.

## Phase 3 — WebAuthn cryptographic verification + DB-backed challenges
- [ ] Add dependency `@simplewebauthn/server` in `backend/`.
- [ ] Update WebAuthn routes (`backend/src/routes/fingerprint.js`) to use library-based verification for:
  - [ ] Registration (enrollment) attestation verification
  - [ ] Authentication (verification) signature verification
- [ ] Replace in-memory challenge `Map()` with DB-backed challenge storage (add `webauthn_challenges` table).
- [ ] Update `backend/src/scripts/initDb.js` to create `webauthn_challenges` table.
- [ ] Update enrollment/verification start/complete to create/consume challenges in DB.

## Phase 4 — HTTPS enforcement (prod hardening)
- [ ] Update `backend/src/index.js` to enable HSTS/redirect when `NODE_ENV=production`.
- [ ] Configure trusted proxy support if required.

## Phase 5 — Testing & smoke checks
- [ ] Start backend and verify `/api/health`.
- [ ] Register/login as Admin/Teacher/Student/Delegate.
- [ ] Enroll student fingerprint as Admin.
- [ ] Authenticate/verify fingerprint and confirm attendance record.
- [ ] Attempt delegate attendance before approval -> expect 403.
- [ ] Admin approves delegate -> delegate marks attendance successfully.
- [ ] Confirm audit logs show up for key actions.

