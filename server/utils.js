import crypto from 'crypto';

export function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}
