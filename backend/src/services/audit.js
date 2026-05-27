import db from '../config/db.js';

export async function logAudit({ action, description, actorId = null, targetId = null, ipAddress = null } = {}) {
  // Minimal validation
  if (!action || !description) return;

  await db.query(
    `INSERT INTO audit_logs (id, action, description, actor_id, target_id, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      action,
      description,
      actorId,
      targetId,
      ipAddress
    ]
  );
}

