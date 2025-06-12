import { Queue, Worker, QueueEvents } from 'bullmq';
import { structuredOutput, buildMindMap } from './llm.js';
import { insertMapStmt } from './db.js';
import { addFsrsForTree } from './fsrs.js';
import { v4 as uuidv4 } from 'uuid';

const connection = process.env.REDIS_URL ? { connection: { url: process.env.REDIS_URL } } : null;

export const processQueue = connection ? new Queue('process', connection) : null;
export const queueEvents = connection ? new QueueEvents('process', connection) : null;

export function startWorker() {
  if (!processQueue) return null;
  const worker = new Worker('process', async job => {
    const { text, userId } = job.data;
    const formatted = await structuredOutput(text);
    const tree = await buildMindMap(formatted);
    const id = uuidv4();
    insertMapStmt.run(id, userId, JSON.stringify(tree), text, formatted);
    addFsrsForTree(id, userId, tree);
    return { id, tree };
  }, connection);
  worker.on('failed', (job, err) => {
    console.error('Job failed', job.id, err);
  });
  return worker;
}
