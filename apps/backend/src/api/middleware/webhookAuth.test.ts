import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock config before importing webhookAuth
vi.mock('../../lib/config.js', () => ({
  config: { webhookSecret: 'test-secret' },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

import { webhookAuth } from './webhookAuth.js';

function createMockReqRes(secret?: string) {
  const req = { headers: { 'x-webhook-secret': secret }, ip: '127.0.0.1' } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('webhookAuth', () => {
  it('calls next() with valid secret', () => {
    const { req, res, next } = createMockReqRes('test-secret');
    webhookAuth(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 with invalid secret', () => {
    const { req, res, next } = createMockReqRes('wrong-secret');
    webhookAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 with missing secret', () => {
    const { req, res, next } = createMockReqRes(undefined);
    webhookAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
