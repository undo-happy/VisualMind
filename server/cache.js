import NodeCache from 'node-cache';
import Redis from 'ioredis';

const TTL = 3600;

let cache;
if (process.env.REDIS_URL) {
  const redis = new Redis(process.env.REDIS_URL);
  cache = {
    async get(key) {
      const val = await redis.get(key);
      try { return val ? JSON.parse(val) : null; } catch { return val; }
    },
    async set(key, value, ttl = TTL) {
      await redis.set(key, JSON.stringify(value), 'EX', ttl);
    }
  };
} else {
  const nc = new NodeCache({ stdTTL: TTL });
  cache = {
    async get(key) { return nc.get(key); },
    async set(key, value, ttl = TTL) { nc.set(key, value, ttl); }
  };
}

export default cache;
