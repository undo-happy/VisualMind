import { Queue, Worker, QueueEvents } from 'bullmq';
import { addFsrsForTree, getCard, schedule, updateCard } from './fsrs.js';
import { insertReviewJobStmt, updateReviewJobStmt } from './db.js';

const connection = process.env.REDIS_URL ? { connection: { url: process.env.REDIS_URL } } : null;

export const reviewQueue = connection ? new Queue('review', connection) : null;
export const reviewQueueEvents = connection ? new QueueEvents('review', connection) : null;

export function enqueueReview(jobId, userId, mapId, path, rating) {
  if (!reviewQueue) return null;
  insertReviewJobStmt.run(jobId, userId, mapId, JSON.stringify(path), rating, 'queued');
  return reviewQueue.add('review', { jobId, userId, mapId, path, rating });
}

export function startReviewWorker() {
  if (!reviewQueue) return null;
  const worker = new Worker('review', async job => {
    const { jobId, userId, mapId, path, rating } = job.data;
    let card = getCard(userId, mapId, path);
    if (!card) {
      addFsrsForTree(mapId, userId, {});
      card = getCard(userId, mapId, path);
    }
    const { stability, difficulty, due } = schedule(card, rating);
    updateCard(card.id, stability, difficulty, due);
    updateReviewJobStmt.run('completed', due, jobId);
    return { due };
  }, connection);

  worker.on('failed', (job, err) => {
    console.error('Review job failed', job.id, err);
    updateReviewJobStmt.run('failed', null, job.data.jobId);
  });
  return worker;
}
