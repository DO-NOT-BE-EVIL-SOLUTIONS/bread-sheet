import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

// Keep the real rate limiter (the subject under test). Stub out db so importing
// the route tree doesn't spin up a real Prisma client, and stub auth so its
// top-level Supabase client isn't constructed at import time.
vi.mock('./db.js', () => ({ default: {} }));
vi.mock('./middlewares/authMiddleware.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRegistered: (_req: any, _res: any, next: any) => next(),
}));

import app from './app.js';

describe('trust proxy / express-rate-limit behind CloudFront + API Gateway', () => {
  it('trusts exactly two proxy hops so req.ip resolves to the forwarded client', () => {
    // 2 = CloudFront + API Gateway/the VPC link (the VPC
    // link is transparent — just ENIs `false`
    // would make every client behind one edge location share a rate-limit
    // key; `true` would trust spoofed X-Forwarded-For headers.
    expect(app.get('trust proxy')).toBe(2);
  });

  it('does not throw ERR_ERL_UNEXPECTED_X_FORWARDED_FOR when X-Forwarded-For is present', async () => {
    // The api limiter runs on every /api/* request before routing, so an
    // unmatched path still exercises its IP key generator. With trust proxy
    // unset this combination throws and surfaces as a 500; with the fix the
    // request simply falls through to a 404.
    const res = await request(app)
      .get('/api/__ratelimit_probe__')
      .set('X-Forwarded-For', '203.0.113.7, 203.0.113.8');

    expect(res.status).toBe(404);
  });
});

describe('requireOriginSecret wiring (ADR 0005 Phase 2)', () => {
  // config.ts reads ORIGIN_VERIFY_SECRET once at module load, and app.js is
  // imported statically at the top of this file — so this only exercises the
  // "unset" (no-op) branch, which is what the test env actually runs with.
  // The enforced branch has its own unit tests in requireOriginSecret.test.ts.
  it('lets /api/* requests reach routing when ORIGIN_VERIFY_SECRET is unset (local dev, tests)', async () => {
    const res = await request(app).get('/api/__origin_secret_probe__');
    expect(res.status).toBe(404); // reached routing — not rejected at the origin-secret gate
  });
});

describe('CORS runs ahead of the gates (ADR 0005 Phase 2 follow-up)', () => {
  // Regression test for the failure mode that made the origin-secret header
  // mismatch so hard to read: requireOriginSecret used to be mounted above
  // `cors`, so its 403 carried no Access-Control-Allow-Origin. A browser
  // cannot see the status of such a response — fetch rejects with a bare
  // TypeError, lib/api.ts turns that into NetworkError, and the app told the
  // user they were offline while the server was in fact returning 403 to every
  // /api/* request. These tests pin the ordering, not the gate itself.
  const ORIGIN = 'http://localhost:8081';

  async function appWithGateEnforcing() {
    vi.resetModules();
    process.env.ORIGIN_VERIFY_SECRET = 'topsecret';
    process.env.ALLOWED_ORIGINS = ORIGIN;
    const mod = await import('./app.js');
    return mod.default;
  }

  afterEach(() => {
    delete process.env.ORIGIN_VERIFY_SECRET;
    delete process.env.ALLOWED_ORIGINS;
    vi.resetModules();
  });

  it('puts Access-Control-Allow-Origin on an origin-secret 403 so the browser sees a 403, not a network error', async () => {
    const res = await request(await appWithGateEnforcing())
      .get('/api/__origin_secret_probe__')
      .set('Origin', ORIGIN);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('answers the CORS preflight instead of rejecting it at the gate', async () => {
    const res = await request(await appWithGateEnforcing())
      .options('/api/__origin_secret_probe__')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'GET');

    // The preflight carries no X-Origin-Verify of its own (the browser does not
    // send it), so a gate mounted above `cors` would 403 it and the real
    // request would never be attempted.
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });
});
