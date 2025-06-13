import { describe, it, expect } from 'vitest';
import db, { insertReviewJobStmt } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

describe('review schema', () => {
  it('creates review_jobs table and allows insert', () => {
    const id = uuidv4();
    insertReviewJobStmt.run(id, 'u1', 'm1', '[]', 5, 'queued');
    const row = db.prepare('SELECT * FROM review_jobs WHERE id = ?').get(id);
    expect(row.userId).toBe('u1');
    expect(row.status).toBe('queued');
    db.prepare('DELETE FROM review_jobs WHERE id = ?').run(id);
  });
});
