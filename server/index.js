import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json());
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3001;
const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 업로드된 마인드맵을 메모리에 저장하기 위한 간단한 배열
const maps = [];

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
  if (!UPSTAGE_API_KEY) {
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
  return data.text || text;
}

async function parseDocument(filePath, mime) {
  if (!UPSTAGE_API_KEY) {
    // API 키가 없으면 파일명을 이용한 더미 텍스트 반환
    return `Content from ${path.basename(filePath)}`;
  }
  const endpoint = mime === 'application/pdf'
    ? 'https://api.upstage.ai/v1/document/parser'
    : 'https://api.upstage.ai/v1/document/ocr';

  const fileStream = fs.createReadStream(filePath);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTAGE_API_KEY}`,
      'Upstage-Structured': 'true'
    },
    body: fileStream
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstage request failed: ${text}`);
  }

  const data = await res.json();
  return data.markdown || data.text || '';
}

async function buildMindMap(text) {
  if (!UPSTAGE_API_KEY) {
    // 텍스트의 첫 문장을 루트로 하는 간단한 더미 트리 생성
    const first = text.split(/\n+/)[0] || 'MindMap';
    return { title: first, children: [] };
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
  return data;
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  const { file } = req;
  try {
    const text = await parseDocument(file.path, file.mimetype);
    const formatted = await structuredOutput(text);
    const tree = await buildMindMap(formatted);
    const id = uuidv4();
    maps.push({ id, tree, text, formatted });
    res.json({ tree, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(file.path, () => {});
  }
});

// 텍스트 직접 입력 처리
app.post('/api/text', async (req, res) => {
  const { text } = req.body;
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Text required' });
  }
  try {
    const formatted = await structuredOutput(text);
    const tree = await buildMindMap(formatted);
    const id = uuidv4();
    maps.push({ id, tree, text, formatted });
    res.json({ tree, id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 저장된 마인드맵 목록 반환
app.get('/api/maps', (req, res) => {
  res.json(maps.map(({ id }) => ({ id })));
});

// 특정 ID의 마인드맵 조회
app.get('/api/maps/:id', (req, res) => {
  const map = maps.find(m => m.id === req.params.id);
  if (!map) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json(map);
});

// 노드 삭제
app.post('/api/maps/:id/remove', (req, res) => {
  const map = maps.find(m => m.id === req.params.id);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path } = req.body;
  if (!Array.isArray(path)) return res.status(400).json({ error: 'Invalid path' });
  const ok = removeNodeByPath(map.tree, path);
  if (!ok) return res.status(400).json({ error: 'Remove failed' });
  res.json(map.tree);
});

// 자식 노드 추가
app.post('/api/maps/:id/add', (req, res) => {
  const map = maps.find(m => m.id === req.params.id);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path, title } = req.body;
  if (!Array.isArray(path) || typeof title !== 'string') {
    return res.status(400).json({ error: 'Invalid body' });
  }
  const child = { title };
  const ok = addChildByPath(map.tree, path, child);
  if (!ok) return res.status(400).json({ error: 'Add failed' });
  res.json(map.tree);
});

// LLM 기반 확장
app.post('/api/maps/:id/expand', async (req, res) => {
  const map = maps.find(m => m.id === req.params.id);
  if (!map) return res.status(404).json({ error: 'Not found' });
  const { path } = req.body;
  if (!Array.isArray(path)) return res.status(400).json({ error: 'Invalid path' });
  const node = getNodeByPath(map.tree, path);
  if (!node) return res.status(400).json({ error: 'Node not found' });
  try {
    const prompt = `${map.formatted}\n\n위 내용 중 '${node.title || node.name || node.key}' 항목을 더 세부적인 마인드맵으로 확장해줘.`;
    const newTree = await buildMindMap(prompt);
    node.children = newTree.children || [];
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
