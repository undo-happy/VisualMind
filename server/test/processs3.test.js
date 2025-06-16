import { describe, it, expect } from 'vitest';
import { processFileFromS3 } from '../llm.js';

describe('processFileFromS3', () => {
  it('throws when S3 not configured', async () => {
    const { S3_BUCKET, AWS_REGION } = process.env;
    delete process.env.S3_BUCKET;
    delete process.env.AWS_REGION;
    await expect(processFileFromS3('key', 'text/plain')).rejects.toThrow('S3 not configured');
    if (S3_BUCKET) process.env.S3_BUCKET = S3_BUCKET;
    if (AWS_REGION) process.env.AWS_REGION = AWS_REGION;
  });
});
