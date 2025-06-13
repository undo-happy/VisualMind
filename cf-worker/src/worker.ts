import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';

interface Env {
  BUCKET: R2Bucket;
  DB: D1Database;
  UPSTAGE_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

async function parseDocument(file: File, type: string, env: Env): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  const resp = await fetch('https://api.upstage.ai/v1/document/parse', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.UPSTAGE_KEY}` },
    body: formData
  });
  if (!resp.ok) throw new Error('Parse failed');
  const data = await resp.json();
  return data.text as string;
}

async function buildMindMap(text: string, env: Env): Promise<any> {
  const resp = await fetch('https://api.upstage.ai/v1/solar/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.UPSTAGE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt: `Create a JSON mindmap: ${text}` })
  });
  if (!resp.ok) throw new Error('LLM failed');
  return resp.json();
}

app.post('/api/upload', async c => {
  const data = await c.req.formData();
  const file = data.get('file') as File | null;
  if (!file) return c.json({ error: 'file required' }, 400);
  const key = `${Date.now()}-${file.name}`;
  await c.env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const text = await parseDocument(file, file.type, c.env);
  const tree = await buildMindMap(text, c.env);
  const id = uuidv4();
  await c.env.DB.prepare(
    'INSERT INTO maps (id, tree, text) VALUES (?, ?, ?)'
  ).bind(id, JSON.stringify(tree), text).run();
  return c.json({ id, tree, fileKey: key });
});

app.get('/api/maps/:id', async c => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT * FROM maps WHERE id=?').bind(id).all();
  if (!results.length) return c.json({ error: 'Not found' }, 404);
  const row = results[0];
  return c.json({ ...row, tree: JSON.parse(row.tree as string) });
});

app.get('/api/maps', async c => {
  const { results } = await c.env.DB.prepare('SELECT id FROM maps ORDER BY rowid DESC LIMIT 100').all();
  return c.json(results);
});

export default app;
