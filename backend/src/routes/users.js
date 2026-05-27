import express from 'express';
import db from '../config/db.js';
import { authenticateToken, authorizeRoles, requireSelfOrRoles } from '../middleware/auth.js';
import { hashPassword } from '../utils/crypto.js';

const router = express.Router();

function sanitizeUser(row) {
  const { password_hash, biometric_template, biometric_hash, ...safe } = row;
  return safe;
}

router.get('/users', authenticateToken, authorizeRoles('admin', 'teacher'), async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, role, name, email, avatar, avatar_color, student_id, grade, department, parent_id, child_ids, biometric_enrolled, created_at
       FROM users ORDER BY role, name`
    );
    res.json({ users: result.rows.map(sanitizeUser) });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', authenticateToken, requireSelfOrRoles('admin', 'teacher'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = {};
    const allowed = ['name', 'email', 'grade', 'department', 'avatar', 'avatar_color', 'student_id', 'parent_id', 'child_ids'];

    if (req.user.role === 'admin') {
      allowed.push('role');
    }

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (req.body.password) {
      updates.password_hash = hashPassword(req.body.password);
    }

    const setClauses = Object.keys(updates).map((key, idx) => `${key} = $${idx + 1}`);
    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const values = Object.values(updates);
    values.push(id);

    const result = await db.query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING id, role, name, email, avatar, avatar_color, student_id, grade, department, parent_id, child_ids, biometric_enrolled, created_at`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

export default router;
