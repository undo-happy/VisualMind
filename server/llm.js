import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { sha256 } from './utils.js';
import cache from './cache.js';
import clamav from 'clamav.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';

const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;
const CLAMAV_HOST = process.env.CLAMAV_HOST;
const CLAMAV_PORT = parseInt(process.env.CLAMAV_PORT || '3310', 10);
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION;
if (S3_BUCKET && !AWS_REGION) {
  throw new Error('AWS_REGION must be set when using S3_BUCKET');
}
const s3 = S3_BUCKET && AWS_REGION ? new S3Client({ region: AWS_REGION }) : null;

function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

export async function uploadToS3(file) {
  if (!s3) return null;
  const key = `${uuidv4()}-${file.originalname}`;
  const fileStream = fs.createReadStream(file.path);
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: fileStream,
    ContentType: file.mimetype
  }));
  return key;
}

export async function scanFile(filePath) {
  if (!CLAMAV_HOST) return;
  await new Promise((resolve, reject) => {
    clamav.createScanner(CLAMAV_PORT, CLAMAV_HOST).scan(filePath, (err, _file, infected) => {
      if (err) return reject(err);
      if (infected) return reject(new Error('Virus detected'));
      resolve();
    });
  });
}

export async function structuredOutput(text) {
  const key = `structured:${sha256(text)}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  if (!UPSTAGE_API_KEY) {
    await cache.set(key, text);
    return text;
  }
  const res = await fetchWithTimeout('https://api.upstage.ai/v1/structured-output', {
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
  await cache.set(key, result);
  return result;
}

export async function parseDocument(filePath, mime) {
  const buffer = await fs.promises.readFile(filePath);
  const key = `ocr:${sha256(buffer)}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  if (!UPSTAGE_API_KEY) {
    const dummy = `Content from ${path.basename(filePath)}`;
    await cache.set(key, dummy);
    return dummy;
  }
  const endpoint = mime === 'application/pdf'
    ? 'https://api.upstage.ai/v1/document/parser'
    : 'https://api.upstage.ai/v1/document/ocr';
  const res = await fetchWithTimeout(endpoint, {
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
  await cache.set(key, result);
  return result;
}

export async function buildMindMap(text) {
  const key = `mindmap:${sha256(text)}`;
  const cached = await cache.get(key);
  if (cached) return cached;
  if (!UPSTAGE_API_KEY) {
    const first = text.split(/\n+/)[0] || 'MindMap';
    const dummy = { title: first, children: [] };
    await cache.set(key, dummy);
    return dummy;
  }
  const prompt = `너는 주어진 텍스트의 핵심 내용을 분석하여 마인드맵으로 정리하는 전문가야. 최대 2단계 깊이의 트리 구조를 JSON으로만 반환해줘.\n${text}`;
  const res = await fetchWithTimeout('https://api.upstage.ai/v1/solar/chat/completions', {
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
  await cache.set(key, data);
  return data;
}
