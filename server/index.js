import express from 'express';
import multer from 'multer';
import fetch from 'node-fetch';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = process.env.PORT || 3001;
const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;

async function extractText(filePath, mime) {
  if (!UPSTAGE_API_KEY) {
    throw new Error('UPSTAGE_API_KEY not configured');
  }
  const endpoint = mime === 'application/pdf'
    ? 'https://api.upstage.ai/v1/document/parser'
    : 'https://api.upstage.ai/v1/document/ocr';

  const fileStream = fs.createReadStream(filePath);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTAGE_API_KEY}`
    },
    body: fileStream
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstage request failed: ${text}`);
  }

  const data = await res.json();
  return data.text || '';
}

async function buildMindMap(text) {
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
    const text = await res.text();
    throw new Error(`Solar Pro request failed: ${text}`);
  }

  const data = await res.json();
  return data;
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  const { file } = req;
  try {
    const text = await extractText(file.path, file.mimetype);
    const tree = await buildMindMap(text);
    res.json({ tree, id: uuidv4() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(file.path, () => {});
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
