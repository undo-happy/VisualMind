import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import { getQuotaStmt, upsertQuotaStmt } from './db.js';

export const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
export const cache = new NodeCache({ stdTTL: 3600 });

export function checkQuota(req, res, next) {
  if (!req.user) return next();
  const date = new Date().toISOString().slice(0, 10);
  const row = getQuotaStmt.get(req.user.uid, date);
  const count = row ? row.count : 0;
  const quota = parseInt(process.env.DAILY_QUOTA || '20', 10);
  if (count >= quota) {
    return res.status(429).json({ error: 'Daily quota exceeded' });
  }
  upsertQuotaStmt.run(req.user.uid, date);
  next();
}
