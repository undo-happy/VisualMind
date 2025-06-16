import { describe, it, expect } from 'vitest';
import helmet from 'helmet';
import cors from 'cors';

// Basic checks for security middleware exports

describe('security middleware', () => {
  it('helmet and cors are functions', () => {
    expect(typeof helmet).toBe('function');
    expect(typeof cors).toBe('function');
  });
});
