import cluster from 'cluster';
import os from 'os';
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import admin from 'firebase-admin';
import Stripe from 'stripe';
import pino from 'pino';
import pinoHttp from 'pino-http';
import client from 'prom-client';

import {
  insertMapStmt,
  selectMapsStmt,
  selectMapsPagedStmt,
  selectMapStmt,
  selectMapByIdStmt,
  selectAllMapsStmt,
  updateMapStmt,
  updateMapAdminStmt,
  deleteMapStmt,
  deleteMapAdminStmt,
  getQuotaStmt
} from './db.js';
import {
  addFsrsForTree,
  rebuildFsrs,
  getDueCards,
  getCard,
  schedule,
  updateCard
} from './fsrs.js';
import { deleteCardsByMapStmt } from './db.js';
import {
  uploadToS3,
  parseDocument,
  structuredOutput,
  buildMindMap,
  scanFile
} from './llm.js';
import { verifyAuth, requireAdmin, isAdmin } from './auth.js';
import { limiter, checkQuota } from './middlewares.js';

if (cluster.isPrimary && process.env.CLUSTER) {
  const workers = parseInt(process.env.CLUSTER, 10) || os.cpus().length;
  for (let i = 0; i < workers; i++) {
    cluster.fork();
  }
  cluster.on('exit', worker => {
    console.log(`Worker ${worker.process.pid} died, restarting`);
    cluster.fork();
  });
} else {

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const upload = multer({ dest: 'uploads/' });
const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
client.collectDefaultMetrics();

const app = express();
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Billing not configured' });
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Webhook signature verification failed', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  logger.info('Stripe webhook received', event.type);
  res.json({ received: true });
});
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use('/api', limiter);
app.use('/api', verifyAuth);

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
}

function getMapFromDB(id, userId, adminFlag = false) {
  const row = adminFlag ? selectMapByIdStmt.get(id) : selectMapStmt.get(id, userId);
  if (!row) return null;
  return { ...row, tree: JSON.parse(row.tree) };
}

function getNodeByPath(tree, path) {
  let node = tree;
  for (const idx of path) {
    if (!node.children || !node.children[idx]) return null;
    node = node.children[idx];
  }
  return node;
}

function removeNodeByPath(tree, path) {
  if (path.length === 0) return false;
  const last = path[path.length - 1];
  const parentPath = path.slice(0, -1);
  const parent = getNodeByPath(tree, parentPath);
  if (!parent || !parent.children || !parent.children[last]) return false;
  parent.children.splice(last, 1);
  return true;
}

function addChildByPath(tree, path, child) {
  const parent = getNodeByPath(tree, path);
  if (!parent) return false;
  if (!parent.children) parent.children = [];
  parent.children.push(child);
  return true;
}

app.post('/api/upload', upload.single('file'), checkQuota, async (req, res) => {
  const { file } = req;
  try {
    await scanFile(file.path);
    const fileKey = await uploadToS3(file);
    const text = await parseDocument(file.path, file.mimetype);
    const formatted = await structuredOutput(text);
    const tree = await buildMindMap(formatted);
    const id = uuidv4();
    const userId = req.user ? req.user.uid : 'anonymous';
    insertMapStmt.run(id, userId, JSON.stringify(tree), text, formatted);
    addFsrsForTree(id, userId, tree);
    res.json({ tree, id, fileKey });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(file.path, () => {});
  }
});

app.post('/api/text', checkQuota, async (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text required' });
  }
  try {
    const formatted = await structuredOutput(text);
    const tree = await buildMindMap(formatted);
    const id = uuidv4();
    const userId = req.user ? req.user.uid : 'anonymous';
    insertMapStmt.run(id, userId, JSON.stringify(tree), text, formatted);
    addFsrsForTree(id, userId, tree);
    res.json({ tree, id });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/text-sse', checkQuota, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const { text } = req.body;
  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (typeof text !== 'string' || !text.trim()) {
    send('error', 'Text required');
    return res.end();
  }

  try {
    const formatted = await structuredOutput(text);
    send('formatted', { formatted });
    const tree = await buildMindMap(formatted);
    const id = uuidv4();
    const userId = req.user ? req.user.uid : 'anonymous';
    insertMapStmt.run(id, userId, JSON.stringify(tree), text, formatted);
    addFsrsForTree(id, userId, tree);
    send('tree', { tree, id });
    send('end', 'done');
  } catch (err) {
    logger.error(err);
    send('error', err.message);
  } finally {
    res.end();
  }
});

app.get('/api/maps', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const limit = Number.isInteger(+req.query.limit) ? Math.min(+req.query.limit, 50) : null;
  const offset = Number.isInteger(+req.query.offset) ? +req.query.offset : 0;
  let rows;
  if (limit) {
    rows = selectMapsPagedStmt.all(userId, limit, offset);
  } else {
    rows = selectMapsStmt.all(userId);
  }
  res.json(rows);
});

app.get('/api/admin/maps', requireAdmin, (req, res) => {
  const rows = selectAllMapsStmt.all();
  res.json(rows);
});

app.get('/api/maps/:id', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const adminFlag = isAdmin(req.user);
  const map = getMapFromDB(req.params.id, userId, adminFlag);
  if (!map) return res.status(404).json({ error: 'Not found' });
  res.json(map);
});

app.delete('/api/maps/:id', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const adminFlag = isAdmin(req.user);
  const map = getMapFromDB(req.params.id, userId, adminFlag);
  if (!map) return res.status(404).json({ error: 'Not found' });
  if (adminFlag) {
    deleteMapAdminStmt.run(req.params.id);
  } else {
    deleteMapStmt.run(req.params.id, userId);
  }
  deleteCardsByMapStmt.run(req.params.id, userId);
  res.json({ success: true });
});

app.post('/api/maps/:id/remove', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const adminFlag = isAdmin(req.user);
  const map = getMapFromDB(req.params.id, userId, adminFlag);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path: nodePath } = req.body;
  if (!Array.isArray(nodePath)) return res.status(400).json({ error: 'Invalid path' });
  const ok = removeNodeByPath(map.tree, nodePath);
  if (!ok) return res.status(400).json({ error: 'Remove failed' });
  if (adminFlag) {
    updateMapAdminStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id);
  } else {
    updateMapStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id, userId);
  }
  rebuildFsrs(map.id, userId, map.tree);
  res.json(map.tree);
});

app.post('/api/maps/:id/add', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const adminFlag = isAdmin(req.user);
  const map = getMapFromDB(req.params.id, userId, adminFlag);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path: nodePath, title } = req.body;
  if (!Array.isArray(nodePath) || typeof title !== 'string') {
    return res.status(400).json({ error: 'Invalid body' });
  }
  const child = { title };
  const ok = addChildByPath(map.tree, nodePath, child);
  if (!ok) return res.status(400).json({ error: 'Add failed' });
  if (adminFlag) {
    updateMapAdminStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id);
  } else {
    updateMapStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id, userId);
  }
  rebuildFsrs(map.id, userId, map.tree);
  res.json(map.tree);
});

app.post('/api/maps/:id/expand', checkQuota, async (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const adminFlag = isAdmin(req.user);
  const map = getMapFromDB(req.params.id, userId, adminFlag);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path: nodePath } = req.body;
  if (!Array.isArray(nodePath)) return res.status(400).json({ error: 'Invalid path' });
  const node = getNodeByPath(map.tree, nodePath);
  if (!node) return res.status(400).json({ error: 'Node not found' });
  try {
    const prompt = `${map.formatted}\n\n위 내용 중 '${node.title || node.name || node.key}' 항목을 더 세부적인 마인드맵으로 확장해줘.`;
    const newTree = await buildMindMap(prompt);
    node.children = newTree.children || [];
    if (adminFlag) {
      updateMapAdminStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id);
    } else {
      updateMapStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id, userId);
    }
    rebuildFsrs(map.id, userId, map.tree);
    res.json(map.tree);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/usage', (req, res) => {
  if (!req.user) {
    const quota = parseInt(process.env.DAILY_QUOTA || '20', 10);
    return res.json({ count: 0, quota });
  }
  const date = new Date().toISOString().slice(0, 10);
  const row = getQuotaStmt.get(req.user.uid, date);
  const count = row ? row.count : 0;
  const quota = parseInt(process.env.DAILY_QUOTA || '20', 10);
  res.json({ count, quota });
});

app.get('/api/review', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const today = new Date().toISOString().slice(0, 10);
  res.json(getDueCards(userId, today));
});

app.post('/api/review', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const { mapId, path: nodePath, rating } = req.body;
  if (!mapId || !Array.isArray(nodePath) || typeof rating !== 'number') {
    return res.status(400).json({ error: 'Invalid body' });
  }
  let card = getCard(userId, mapId, nodePath);
  if (!card) {
    addFsrsForTree(mapId, userId, {}); // ensures table row exists
    card = getCard(userId, mapId, nodePath);
  }
  const { stability, difficulty, due } = schedule(card, rating);
  updateCard(card.id, stability, difficulty, due);
  res.json({ due });
});

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Billing not configured' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: req.body.success_url || 'https://example.com/success',
      cancel_url: req.body.cancel_url || 'https://example.com/cancel',
      customer_email: req.user?.email
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.post('/api/rum', (req, res) => {
  logger.info({ rum: req.body });
  res.json({ success: true });
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDist, 'index.html'));
    } else {
      next();
    }
  });
}

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} (pid ${process.pid})`);
});
}
