import admin from 'firebase-admin';

const ADMIN_UIDS = process.env.ADMIN_UIDS ? process.env.ADMIN_UIDS.split(',') : [];

export function isAdmin(user) {
  if (!user) return false;
  return ADMIN_UIDS.includes(user.uid);
}

export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

export async function verifyAuth(req, res, next) {
  if (!admin.apps.length) {
    console.error('Firebase Admin not initialised – blocking request');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  if (req.path === '/health') return next();
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
