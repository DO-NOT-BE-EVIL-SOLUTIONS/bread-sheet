import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted ensures this mock fn exists when vi.mock() factory runs (ESM hoisting)
const mockGetUser = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}));

import { requireAuth } from './authMiddleware.js';

function makeReqResNext(authHeader?: string) {
  const req: any = { headers: {} };
  if (authHeader !== undefined) req.headers.authorization = authHeader;
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('requireAuth', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const { req, res, next } = makeReqResNext();
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authorization header missing' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the Bearer token is absent from the header', async () => {
    const { req, res, next } = makeReqResNext('Bearer');
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token missing' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase reports an invalid token', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid jwt') });
    const { req, res, next } = makeReqResNext('Bearer bad-token');
    await requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() and attaches user to req when token is valid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@example.com' } },
      error: null,
    });
    const { req, res, next } = makeReqResNext('Bearer valid-token');
    await requireAuth(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toEqual({ id: 'user-123', email: 'test@example.com' });
  });
});
