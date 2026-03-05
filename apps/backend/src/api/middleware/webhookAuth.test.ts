import { describe, it, expect, vi } from 'vitest';

// Mock config before importing webhookAuth
vi.mock('../../lib/config.js', () => ({
  config: { webhookSecret: 'test-secret' },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { createMockReqRes } from '../../test/factories.js';

import { webhookAuth } from './webhookAuth.js';

describe('webhookAuth', () => {
  it('calls next() with valid secret', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-webhook-secret': 'test-secret' },
      ip: '127.0.0.1',
    });
    webhookAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 with invalid secret', () => {
    const { req, res, next } = createMockReqRes({
      headers: { 'x-webhook-secret': 'wrong-secret' },
      ip: '127.0.0.1',
    });
    webhookAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with missing secret', () => {
    const { req, res, next } = createMockReqRes({
      headers: {},
      ip: '127.0.0.1',
    });
    webhookAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
