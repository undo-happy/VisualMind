import crypto from 'crypto';

// Use SHA-256 instead of SHA-1 which is considered broken.
// Accept both Buffer and string input.
export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}
