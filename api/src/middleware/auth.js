import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'bams_default_jwt_secret';

export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
    }
    next();
  };
}

export function requireSelfOrRoles(...allowedRoles) {
  return (req, res, next) => {
    if (req.user?.id === req.params.id) {
      return next();
    }
    return authorizeRoles(...allowedRoles)(req, res, next);
  };
}
