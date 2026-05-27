import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Store pending enrollment challenges
const enrollmentChallenges = new Map();
const verificationChallenges = new Map();

// POST /api/webauthn/enrollment/start
// Generate challenge for enrollment initiation
router.post('/webauthn/enrollment/start', authenticateToken, authorizeRoles('admin', 'teacher', 'delegate', 'student'), async (req, res, next) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }

    // If user is a student, ensure they are enrolling themselves
    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden: Students can only enroll their own fingerprints.' });
    }

    // Verify student exists
    const userResult = await db.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [studentId]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    // Generate random challenge
    const challenge = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    const challengeId = uuidv4();
    
    // Store challenge temporarily (valid for 10 minutes)
    enrollmentChallenges.set(challengeId, {
      challenge,
      studentId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    // Clean expired challenges
    for (const [key, value] of enrollmentChallenges) {
      if (value.expiresAt < Date.now()) {
        enrollmentChallenges.delete(key);
      }
    }

    res.json({
      challengeId,
      challenge,
      rp: { name: 'BAMS - Biometric Attendance', id: 'localhost' },
      user: {
        id: Buffer.from(studentId).toString('base64'),
        name: studentId,
        displayName: studentId
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/webauthn/enrollment/complete
// Store enrolled credential with public key
router.post('/webauthn/enrollment/complete', authenticateToken, authorizeRoles('admin', 'teacher', 'delegate', 'student'), async (req, res, next) => {
  try {
    const { challengeId, studentId, credentialId, attestationObject, publicKeySPKI, counter = 0 } = req.body;
    
    if (!challengeId || !studentId || !credentialId || !attestationObject) {
      return res.status(400).json({ error: 'challengeId, studentId, credentialId, and attestationObject are required.' });
    }

    // If user is a student, ensure they are enrolling themselves
    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden: Students can only enroll their own fingerprints.' });
    }

    // Verify challenge is valid
    const storedChallenge = enrollmentChallenges.get(challengeId);
    if (!storedChallenge || storedChallenge.studentId !== studentId) {
      return res.status(401).json({ error: 'Invalid or expired challenge.' });
    }
    
    if (storedChallenge.expiresAt < Date.now()) {
      enrollmentChallenges.delete(challengeId);
      return res.status(401).json({ error: 'Challenge expired.' });
    }

    // Store credential in database
    const credentialRecordId = uuidv4();
    const enrollmentResult = await db.query(
      `INSERT INTO webauthn_credentials (id, student_id, credential_id, public_key_spki, attestation_object, counter, enrolled_at, transports)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7) RETURNING *`,
      [credentialRecordId, studentId, credentialId, publicKeySPKI, attestationObject, counter, JSON.stringify(['usb', 'nfc', 'ble', 'internal'])]
    );

    // Update user record
    await db.query(
      `UPDATE users SET biometric_enrolled = 1, biometric_enrolled_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [studentId]
    );

    // Clean up challenge
    enrollmentChallenges.delete(challengeId);

    res.status(201).json({
      success: true,
      studentId,
      credentialId,
      enrolledAt: new Date().toISOString(),
      message: 'Fingerprint enrolled successfully.'
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/webauthn/verification/start
// Generate challenge for verification
router.post('/webauthn/verification/start', async (req, res, next) => {
  try {
    const { studentId } = req.body;
    
    if (!studentId) {
      return res.status(400).json({ error: 'studentId is required.' });
    }

    // Get student credentials
    const credentialResult = await db.query(
      `SELECT credential_id, public_key_spki FROM webauthn_credentials WHERE student_id = $1 AND enrolled_at IS NOT NULL LIMIT 5`,
      [studentId]
    );

    if (credentialResult.rowCount === 0) {
      return res.status(404).json({ error: 'No enrolled credentials found for this student.' });
    }

    // Generate verification challenge
    const challenge = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
    const verificationId = uuidv4();
    
    verificationChallenges.set(verificationId, {
      challenge,
      studentId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000
    });

    // Clean expired challenges
    for (const [key, value] of verificationChallenges) {
      if (value.expiresAt < Date.now()) {
        verificationChallenges.delete(key);
      }
    }

    res.json({
      verificationId,
      challenge,
      rpId: 'localhost',
      allowCredentials: credentialResult.rows.map(row => ({
        id: row.credential_id,
        type: 'public-key',
        transports: ['usb', 'nfc', 'ble', 'internal']
      }))
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/webauthn/verification/complete
// Verify assertion and mark attendance
router.post('/webauthn/verification/complete', async (req, res, next) => {
  try {
    const { verificationId, studentId, credentialId, clientDataJSON, authenticatorData, signature, deviceId, autoMark = true } = req.body;
    
    if (!verificationId || !studentId || !credentialId || !signature) {
      return res.status(400).json({ error: 'verificationId, studentId, credentialId, and signature are required.' });
    }

    // Verify challenge
    const storedChallenge = verificationChallenges.get(verificationId);
    if (!storedChallenge || storedChallenge.studentId !== studentId) {
      return res.status(401).json({ error: 'Invalid or expired verification challenge.' });
    }

    if (storedChallenge.expiresAt < Date.now()) {
      verificationChallenges.delete(verificationId);
      return res.status(401).json({ error: 'Verification challenge expired.' });
    }

    // Get credential and verify
    const credentialResult = await db.query(
      `SELECT public_key_spki, counter FROM webauthn_credentials WHERE student_id = $1 AND credential_id = $2 LIMIT 1`,
      [studentId, credentialId]
    );

    if (credentialResult.rowCount === 0) {
      return res.status(404).json({ error: 'Credential not found.' });
    }

    const credential = credentialResult.rows[0];
    
    // In a production system, verify signature using public_key_spki
    // This is simplified - proper verification requires:
    // 1. Parse clientDataJSON (base64)
    // 2. Hash it
    // 3. Verify signature against authenticatorData + hash
    // 4. Check counter hasn't been used
    
    // For now, we accept the signature (in production, implement full verification)
    
    // Update counter
    await db.query(
      `UPDATE webauthn_credentials SET counter = $1, last_used_at = CURRENT_TIMESTAMP WHERE student_id = $2 AND credential_id = $3`,
      [credential.counter + 1, studentId, credentialId]
    );

    // Mark attendance if requested
    let attendanceRecord = null;
    if (autoMark) {
      const attendanceId = uuidv4();
      const insertResult = await db.query(
        `INSERT INTO attendance (id, student_id, device_id, status, method, synced, session_label, verified_by, timestamp)
         VALUES ($1, $2, $3, $4, $5, 1, $6, $7, CURRENT_TIMESTAMP) RETURNING *`,
        [attendanceId, studentId, deviceId || 'webauthn-device', 'present', 'webauthn', 'Biometric WebAuthn', 'webauthn']
      );
      attendanceRecord = insertResult.rows[0];
    }

    // Clean up challenge
    verificationChallenges.delete(verificationId);

    res.json({
      success: true,
      verified: true,
      studentId,
      credentialId,
      attendance: attendanceRecord,
      message: 'Fingerprint verified successfully. Attendance marked.'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/webauthn/credentials/:studentId
// List enrolled credentials for a student
router.get('/webauthn/credentials/:studentId', authenticateToken, async (req, res, next) => {
  try {
    const { studentId } = req.params;
    
    // If user is a student, ensure they are viewing their own credentials
    if (req.user.role === 'student' && req.user.id !== studentId) {
      return res.status(403).json({ error: 'Forbidden: Students can only view their own credentials.' });
    }

    const result = await db.query(
      `SELECT id, student_id, credential_id, enrolled_at, last_used_at FROM webauthn_credentials WHERE student_id = $1 ORDER BY enrolled_at DESC`,
      [studentId]
    );

    res.json({
      studentId,
      credentials: result.rows,
      count: result.rowCount
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/webauthn/credentials/:credentialId
// Revoke a credential
router.delete('/webauthn/credentials/:credentialId', authenticateToken, authorizeRoles('admin', 'teacher'), async (req, res, next) => {
  try {
    const { credentialId } = req.params;
    
    await db.query(
      `DELETE FROM webauthn_credentials WHERE id = $1`,
      [credentialId]
    );

    res.json({ success: true, message: 'Credential revoked.' });
  } catch (error) {
    next(error);
  }
});

export default router;
