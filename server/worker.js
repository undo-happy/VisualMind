import { startWorker } from './queue.js';
import { startReviewWorker } from './reviewQueue.js';

startWorker();
startReviewWorker();
