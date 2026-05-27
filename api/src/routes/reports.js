import express from 'express';
import db from '../config/db.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { sendNotification } from '../services/notifications.js';

const router = express.Router();

router.get('/reports/summary', authenticateToken, authorizeRoles('admin', 'teacher'), async (req, res, next) => {
  try {
    const attendance = await db.query('SELECT status, COUNT(*) AS count FROM attendance GROUP BY status');
    const daily = await db.query(
      `SELECT strftime('%Y-%m-%d', timestamp) AS day, status, COUNT(*) AS count
       FROM attendance
       WHERE timestamp >= datetime('now', '-14 days')
       GROUP BY day, status
       ORDER BY day DESC`
    );

    const devices = await db.query(
      `SELECT device_id, COUNT(*) AS count
       FROM attendance
       GROUP BY device_id
       ORDER BY count DESC
       LIMIT 10`
    );

    const summary = {
      statusBreakdown: attendance.rows,
      dailyTrend: daily.rows,
      topDevices: devices.rows
    };

    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/send', authenticateToken, authorizeRoles('admin', 'teacher'), async (req, res, next) => {
  try {
    const { recipientId, type, message, studentId } = req.body;
    if (!recipientId || !type || !message) {
      return res.status(400).json({ error: 'recipientId, type, and message are required.' });
    }

    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await db.query(
      'INSERT INTO notifications (id, recipient_id, type, message, student_id) VALUES ($1, $2, $3, $4, $5)',
      [id, recipientId, type, message, studentId || null]
    );

    await sendNotification({ recipientId, type, message, studentId });
    res.json({ sent: true, notificationId: id });
  } catch (error) {
    next(error);
  }
});

export default router;
