import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import admin from 'firebase-admin';
import Database from 'better-sqlite3';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import morgan from 'morgan';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(morgan('combined'));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api', limiter);
const cache = new NodeCache({ stdTTL: 3600 });
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3001;
const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;
const FIREBASE_SERVICE_ACCOUNT = process.env.FIREBASE_SERVICE_ACCOUNT;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// SQLite database initialization
const db = new Database(path.join(__dirname, 'visualmind.db'));
db.exec(`CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  userId TEXT,
  tree TEXT,
  text TEXT,
  formatted TEXT
)`);
db.exec(`CREATE TABLE IF NOT EXISTS usage_quota (
  userId TEXT,
  date TEXT,
  count INTEGER,
  PRIMARY KEY (userId, date)
)`);
const insertMapStmt = db.prepare('INSERT INTO maps (id, userId, tree, text, formatted) VALUES (?, ?, ?, ?, ?)');
const selectMapsStmt = db.prepare('SELECT id FROM maps WHERE userId = ?');
const selectMapStmt = db.prepare('SELECT * FROM maps WHERE id = ? AND userId = ?');
const updateMapStmt = db.prepare('UPDATE maps SET tree = ?, text = ?, formatted = ? WHERE id = ? AND userId = ?');
const getQuotaStmt = db.prepare('SELECT count FROM usage_quota WHERE userId = ? AND date = ?');
const upsertQuotaStmt = db.prepare(`INSERT INTO usage_quota (userId, date, count) VALUES (?, ?, 1)
  ON CONFLICT(userId, date) DO UPDATE SET count = count + 1`);

function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

function getMapFromDB(id, userId) {
  const row = selectMapStmt.get(id, userId);
  if (!row) return null;
  return { ...row, tree: JSON.parse(row.tree) };
}

async function verifyAuth(req, res, next) {
  if (!admin.apps.length) return next();
  if (req.path === '/health') return next();
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

const DAILY_QUOTA = parseInt(process.env.DAILY_QUOTA || '20', 10);

function checkQuota(req, res, next) {
  if (!req.user) return next();
  const date = new Date().toISOString().slice(0, 10);
  const row = getQuotaStmt.get(req.user.uid, date);
  const count = row ? row.count : 0;
  if (count >= DAILY_QUOTA) {
    return res.status(429).json({ error: 'Daily quota exceeded' });
  }
  upsertQuotaStmt.run(req.user.uid, date);
  next();
}

app.use('/api', verifyAuth);

if (FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
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

async function structuredOutput(text) {
  const key = `structured:${sha1(text)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (!UPSTAGE_API_KEY) {
    cache.set(key, text);
    return text;
  }
  const res = await fetch('https://api.upstage.ai/v1/structured-output', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTAGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upstage structured request failed: ${body}`);
  }

  const data = await res.json();
  const result = data.text || text;
  cache.set(key, result);
  return result;
}

async function parseDocument(filePath, mime) {
  const buffer = await fs.promises.readFile(filePath);
  const key = `ocr:${sha1(buffer)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (!UPSTAGE_API_KEY) {
    const dummy = `Content from ${path.basename(filePath)}`;
    cache.set(key, dummy);
    return dummy;
  }
  const endpoint = mime === 'application/pdf'
    ? 'https://api.upstage.ai/v1/document/parser'
    : 'https://api.upstage.ai/v1/document/ocr';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTAGE_API_KEY}`,
      'Upstage-Structured': 'true'
    },
    body: buffer
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstage request failed: ${text}`);
  }

  const data = await res.json();
  const result = data.markdown || data.text || '';
  cache.set(key, result);
  return result;
}

async function buildMindMap(text) {
  const key = `mindmap:${sha1(text)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  if (!UPSTAGE_API_KEY) {
    const first = text.split(/\n+/)[0] || 'MindMap';
    const dummy = { title: first, children: [] };
    cache.set(key, dummy);
    return dummy;
  }

  const prompt = `너는 주어진 텍스트의 핵심 내용을 분석하여 마인드맵으로 정리하는 전문가야. 최대 2단계 깊이의 트리 구조를 JSON으로만 반환해줘.\n${text}`;

  const res = await fetch('https://api.upstage.ai/v1/solar/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTAGE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Solar Pro request failed: ${body}`);
  }

  const data = await res.json();
  cache.set(key, data);
  return data;
}

app.post('/api/upload', upload.single('file'), checkQuota, async (req, res) => {
  const { file } = req;
  try {
    const text = await parseDocument(file.path, file.mimetype);
    const formatted = await structuredOutput(text);
    const tree = await buildMindMap(formatted);
    const id = uuidv4();
    const userId = req.user ? req.user.uid : 'anonymous';
    insertMapStmt.run(id, userId, JSON.stringify(tree), text, formatted);
    res.json({ tree, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(file.path, () => {});
  }
});

// 텍스트 직접 입력 처리
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
    res.json({ tree, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 저장된 마인드맵 목록 반환
app.get('/api/maps', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const rows = selectMapsStmt.all(userId);
  res.json(rows);
});

// 특정 ID의 마인드맵 조회
app.get('/api/maps/:id', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const map = getMapFromDB(req.params.id, userId);
  if (!map) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(map);
});

// 노드 삭제
app.post('/api/maps/:id/remove', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const map = getMapFromDB(req.params.id, userId);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path } = req.body;
  if (!Array.isArray(path)) return res.status(400).json({ error: 'Invalid path' });
  const ok = removeNodeByPath(map.tree, path);
  if (!ok) return res.status(400).json({ error: 'Remove failed' });
  updateMapStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id, userId);
  res.json(map.tree);
});

// 자식 노드 추가
app.post('/api/maps/:id/add', (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const map = getMapFromDB(req.params.id, userId);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path, title } = req.body;
  if (!Array.isArray(path) || typeof title !== 'string') {
    return res.status(400).json({ error: 'Invalid body' });
  }
  const child = { title };
  const ok = addChildByPath(map.tree, path, child);
  if (!ok) return res.status(400).json({ error: 'Add failed' });
  updateMapStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id, userId);
  res.json(map.tree);
});

// LLM 기반 확장
app.post('/api/maps/:id/expand', checkQuota, async (req, res) => {
  const userId = req.user ? req.user.uid : 'anonymous';
  const map = getMapFromDB(req.params.id, userId);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path } = req.body;
  if (!Array.isArray(path)) return res.status(400).json({ error: 'Invalid path' });
  const node = getNodeByPath(map.tree, path);
  if (!node) return res.status(400).json({ error: 'Node not found' });
  try {
    const prompt = `${map.formatted}\n\n위 내용 중 '${node.title || node.name || node.key}' 항목을 더 세부적인 마인드맵으로 확장해줘.`;
    const newTree = await buildMindMap(prompt);
    node.children = newTree.children || [];
    updateMapStmt.run(JSON.stringify(map.tree), map.text, map.formatted, map.id, userId);
    res.json(map.tree);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 정적 파일 제공 (빌드된 프런트엔드)
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
  console.log(`Server running on port ${PORT}`);
});
