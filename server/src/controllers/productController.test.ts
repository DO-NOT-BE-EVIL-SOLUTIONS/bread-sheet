import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());
const mockFetchFromOFF = vi.hoisted(() => vi.fn());

vi.mock('../db.js', () => ({
  default: {
    product: {
      findUnique: mockFindUnique,
      create: mockCreate,
    },
  },
}));

vi.mock('../services/productService.js', () => ({
  fetchFromOpenFoodFacts: mockFetchFromOFF,
}));

vi.mock('../middlewares/authMiddleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', email: 'test@test.com' };
    next();
  },
}));

vi.mock('../middlewares/rateLimit.js', () => ({
  apiLimiter: (_req: any, _res: any, next: any) => next(),
  userLimiter: (_req: any, _res: any, next: any) => next(),
  syncLimiter: (_req: any, _res: any, next: any) => next(),
}));

import app from '../app.js';

const VALID_BARCODE = '1234567890123';

describe('GET /api/products/:barcode', () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreate.mockReset();
    mockFetchFromOFF.mockReset();
  });

  it('returns 400 for an invalid barcode format', async () => {
    const res = await request(app)
      .get('/api/products/not-a-barcode')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid barcode/i);
  });

  it('returns the cached product from DB without calling OFF', async () => {
    const product = { id: 1, barcode: VALID_BARCODE, name: 'Sourdough' };
    mockFindUnique.mockResolvedValue(product);

    const res = await request(app)
      .get(`/api/products/${VALID_BARCODE}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(product);
    expect(mockFetchFromOFF).not.toHaveBeenCalled();
  });

  it('fetches from OFF, caches in DB, and returns the product', async () => {
    const offData = { barcode: VALID_BARCODE, name: 'Ciabatta', brand: null, image: null, description: null };
    const saved = { id: 2, ...offData };
    mockFindUnique.mockResolvedValue(null);
    mockFetchFromOFF.mockResolvedValue(offData);
    mockCreate.mockResolvedValue(saved);

    const res = await request(app)
      .get(`/api/products/${VALID_BARCODE}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(saved);
    expect(mockCreate).toHaveBeenCalledWith({ data: offData });
  });

  it('returns 404 when OFF does not recognise the barcode', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFetchFromOFF.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/products/${VALID_BARCODE}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(404);
  });
});
