import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../config/db.js';
import { authenticateToken, authorizeRoles, requireSelfOrRoles } from '../middleware/auth.js';

const router = express.Router();

router.post('/attendance/mark', authenticateToken, authorizeRoles('admin', 'teacher', 'delegate'), async (req, res, next) => {
  try {
    const { studentId, deviceId, status = 'present' } = req.body;
    if (!studentId || !deviceId) {
      return res.status(400).json({ error: 'studentId and deviceId are required.' });
    }

    const id = `att-${uuidv4()}`;
    const result = await db.query(
      `INSERT INTO attendance (id, student_id, device_id, status, method, synced, session_label, verified_by)
       VALUES ($1, $2, $3, $4, 'fingerprint', true, $5, $6) RETURNING *`,
      [id, studentId, deviceId, status, 'Manual mark', deviceId]
    );

    res.status(201).json({ attendance: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/attendance/report', authenticateToken, authorizeRoles('admin', 'teacher', 'parent'), async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const filters = [];
    const values = [];
    let idx = 1;

    if (startDate) {
      filters.push(`timestamp >= $${idx++}`);
      values.push(new Date(startDate));
    }
    if (endDate) {
      filters.push(`timestamp <= $${idx++}`);
      values.push(new Date(endDate));
    }

    if (req.user.role === 'parent') {
      const parentResult = await db.query('SELECT child_ids FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
      if (parentResult.rowCount === 0) {
        return res.status(404).json({ error: 'Parent account not found.' });
      }
      const children = parentResult.rows[0].child_ids || [];
      if (children.length === 0) {
        return res.json({ summary: {}, records: [] });
      }
      const placeholders = children.map((_, i) => `$${idx + i}`);
      filters.push(`student_id IN (${placeholders.join(', ')})`);
      values.push(...children);
      idx += children.length;
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await db.query(`SELECT * FROM attendance ${whereClause} ORDER BY timestamp DESC LIMIT 500`, values);

    const summary = {
      total: result.rowCount,
      present: result.rows.filter(r => r.status === 'present').length,
      late: result.rows.filter(r => r.status === 'late').length,
      absent: result.rows.filter(r => r.status === 'absent').length
    };

    res.json({ summary, records: result.rows });
  } catch (error) {
    next(error);
  }
});

router.get('/attendance/student/:id', authenticateToken, requireSelfOrRoles('admin', 'teacher'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const studentId = id;

    if (req.user.role === 'parent') {
      const parentResult = await db.query('SELECT child_ids FROM users WHERE id = $1 LIMIT 1', [req.user.id]);
      if (!parentResult.rows[0]?.child_ids?.includes(studentId)) {
        return res.status(403).json({ error: 'Forbidden: no access to this student.' });
      }
    }

    const result = await db.query('SELECT * FROM attendance WHERE student_id = $1 ORDER BY timestamp DESC LIMIT 200', [studentId]);
    const stats = {
      total: result.rowCount,
      present: result.rows.filter(r => r.status === 'present').length,
      late: result.rows.filter(r => r.status === 'late').length,
      absent: result.rows.filter(r => r.status === 'absent').length
    };

    res.json({ studentId, stats, records: result.rows });
  } catch (error) {
    next(error);
  }
});

export default router;
