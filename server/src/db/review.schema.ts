export interface ReviewJob {
  id: string;
  userId: string;
  mapId: string;
  path: string;
  rating: number;
  status: string;
  due: string | null;
}

export const createReviewJobsTable = `
CREATE TABLE IF NOT EXISTS review_jobs (
  id TEXT PRIMARY KEY,
  userId TEXT,
  mapId TEXT,
  path TEXT,
  rating INTEGER,
  status TEXT,
  due TEXT
)`;
