import { describe, it, expect } from 'vitest';
import { generateUploadUrl } from '../llm.js';

// This test ensures function throws when S3 is not configured

describe('generateUploadUrl', () => {
  it('throws when S3 env vars missing', async () => {
    // Clear env vars temporarily
    const { S3_BUCKET, AWS_REGION } = process.env;
    delete process.env.S3_BUCKET;
    delete process.env.AWS_REGION;
    await expect(generateUploadUrl('file.txt')).rejects.toThrow('S3 not configured');
    // Restore
    if (S3_BUCKET) process.env.S3_BUCKET = S3_BUCKET;
    if (AWS_REGION) process.env.AWS_REGION = AWS_REGION;
  });
});
