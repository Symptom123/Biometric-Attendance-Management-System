import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import fingerprintRoutes from './routes/fingerprint.js';
import attendanceRoutes from './routes/attendance.js';
import reportRoutes from './routes/reports.js';
import { initDatabase } from './scripts/initDb.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8000';

app.use(helmet());
app.use(express.json({ limit: '15mb' }));
app.use(cors({ origin: FRONTEND_URL, credentials: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api', userRoutes);
app.use('/api', fingerprintRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', reportRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

await initDatabase();

// Only listen on a port if not running in a serverless environment (like Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`BAMS backend listening on http://localhost:${PORT}`);
  });
}

// Export for Vercel Serverless
export default app;
