import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import db, { getQuotaStmt } from './db.js';

export const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
export const cache = new NodeCache({ stdTTL: 3600 });

export function checkQuota(req, res, next) {
  if (!req.user) return next();
  const date = new Date().toISOString().slice(0, 10);
  const quota = parseInt(process.env.DAILY_QUOTA || '20', 10);
  const { changes } = db.prepare(`
    INSERT INTO usage_quota (userId, date, count)
    VALUES (?, ?, 1)
    ON CONFLICT(userId, date) DO UPDATE
      SET count = count + 1
      WHERE count < ?
  `).run(req.user.uid, date, quota);
  if (changes === 0) {
    return res.status(429).json({ error: 'Daily quota exceeded' });
  }
  next();
}
