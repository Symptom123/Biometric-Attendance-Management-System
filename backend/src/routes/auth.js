import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import { hashPassword, comparePassword, generateJwt } from '../utils/crypto.js';

const router = express.Router();
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

function parseDuration(value) {
  if (!value) return 7 * 24 * 60 * 60 * 1000;
  const num = parseInt(value, 10);
  if (value.endsWith('d')) return num * 24 * 60 * 60 * 1000;
  if (value.endsWith('h')) return num * 60 * 60 * 1000;
  if (value.endsWith('m')) return num * 60 * 1000;
  return num * 1000;
}

function sanitizeUser(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return safe;
}

function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return password && password.length >= 8;
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role = 'student', studentId, grade, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.rows && existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email address is already registered.' });
    }

    const id = `${role}-${uuidv4()}`;
    const passwordHash = hashPassword(password);

    await db.query(
      `INSERT INTO users (id, role, name, email, password_hash, student_id, grade, department, biometric_enrolled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
      [id, role, name, email, passwordHash, studentId || null, grade || null, department || null]
    );

    const accessToken = generateJwt({ id, role, email, name, studentId }, ACCESS_EXPIRES_IN);
    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXPIRES_IN)).toISOString();

    await db.query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
      [refreshToken, id, expiresAt]
    );

    const user = { id, role, name, email, student_id: studentId, grade, department, biometric_enrolled: false };

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const userResult = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!userResult.rows || userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = userResult.rows[0];
    if (!user.password_hash || !comparePassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const accessToken = generateJwt({ id: user.id, role: user.role, email: user.email, name: user.name, studentId: user.student_id }, ACCESS_EXPIRES_IN);
    const refreshToken = uuidv4();
    const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXPIRES_IN)).toISOString();

    await db.query('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)', [refreshToken, user.id, expiresAt]);

    await db.query('UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    res.json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken
    });
  } catch (error) {
    next(error);
  }
})

router.post('/token', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required.' });
    }

    const tokenResult = await db.query('SELECT user_id, expires_at FROM refresh_tokens WHERE token = ?', [refreshToken]);
    if (!tokenResult.rows || tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid refresh token.' });
    }

    const tokenRecord = tokenResult.rows[0];
    if (new Date(tokenRecord.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Refresh token expired.' });
    }

    const userResult = await db.query('SELECT id, email, role FROM users WHERE id = ?', [tokenRecord.user_id]);
    if (!userResult.rows || userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = userResult.rows[0];
    const accessToken = generateJwt({ id: user.id, role: user.role, email: user.email }, ACCESS_EXPIRES_IN);
    res.json({ accessToken });
  } catch (error) {
    next(error);
  }
});

export default router;
