import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ENCRYPTION_SECRET = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'bams_default_encryption_key';
const JWT_SECRET = process.env.JWT_SECRET || 'bams_default_jwt_secret';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();
const ALGORITHM = 'aes-256-gcm';

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function hashTemplate(template) {
  return crypto.createHash('sha256').update(template).digest('hex');
}

export function encryptTemplate(template) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(template, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return `${iv.toString('base64')}.${tag}.${encrypted}`;
}

export function decryptTemplate(payload) {
  const [ivB64, tagB64, encrypted] = payload.split('.');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function generateJwt(payload, expiresIn = '1h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyJwt(token) {
  return jwt.verify(token, JWT_SECRET);
}
