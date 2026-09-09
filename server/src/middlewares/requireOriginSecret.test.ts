import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const mockConfig = vi.hoisted(() => ({ originVerifySecret: null as string | null }));
vi.mock('../configs/config.js', () => ({ default: mockConfig }));

import { requireOriginSecret } from './requireOriginSecret.js';

function buildApp() {
  const app = express();
  app.use(requireOriginSecret);
  app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('requireOriginSecret', () => {
  beforeEach(() => {
    mockConfig.originVerifySecret = null;
  });

  it('is a no-op when ORIGIN_VERIFY_SECRET is unset', async () => {
    const res = await request(buildApp()).get('/probe');
    expect(res.status).toBe(200);
  });

  it('403s a request with no X-Origin-Verify header when a secret is configured', async () => {
    mockConfig.originVerifySecret = 'topsecret';
    const res = await request(buildApp()).get('/probe');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  it('403s a request carrying the wrong value', async () => {
    mockConfig.originVerifySecret = 'topsecret';
    const res = await request(buildApp()).get('/probe').set('X-Origin-Verify', 'wrong');
    expect(res.status).toBe(403);
  });

  it('lets a request through with the correct header value', async () => {
    mockConfig.originVerifySecret = 'topsecret';
    const res = await request(buildApp()).get('/probe').set('X-Origin-Verify', 'topsecret');
    expect(res.status).toBe(200);
  });
});
