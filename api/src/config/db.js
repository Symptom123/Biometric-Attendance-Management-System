import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set. Ensure you have provided a Supabase connection string.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const db = {
  query: async (sql, params = []) => {
    try {
      const res = await pool.query(sql, params);
      return { rows: res.rows || [], rowCount: res.rowCount || 0 };
    } catch (err) {
      console.error('Database query error:', err, 'SQL:', sql);
      throw err;
    }
  },
  exec: async (sql) => {
    const client = await pool.connect();
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  },
  close: async () => {
    await pool.end();
  }
};

export default db;
