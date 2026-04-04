import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const mockProductFindUnique = vi.hoisted(() => vi.fn());
const mockRatingCreate = vi.hoisted(() => vi.fn());
const mockRatingFindMany = vi.hoisted(() => vi.fn());

vi.mock('../db.js', () => ({
  default: {
    product: { findUnique: mockProductFindUnique },
    rating: {
      create: mockRatingCreate,
      findMany: mockRatingFindMany,
    },
  },
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

const PRODUCT = { id: 10, barcode: '1234567890123', name: 'Rye Bread' };

describe('POST /api/ratings', () => {
  beforeEach(() => {
    mockProductFindUnique.mockReset();
    mockRatingCreate.mockReset();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/ratings')
      .set('Authorization', 'Bearer token')
      .send({ barcode: '1234567890123', taste: 8 }); // missing texture and value
    expect(res.status).toBe(400);
  });

  it('returns 404 when the product does not exist in the DB', async () => {
    mockProductFindUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/ratings')
      .set('Authorization', 'Bearer token')
      .send({ barcode: '1234567890123', taste: 8, texture: 7, value: 6 });
    expect(res.status).toBe(404);
  });

  it('creates a rating and returns 201 with the rating body', async () => {
    const rating = { id: 1, userId: 'user-1', productId: 10, taste: 8, texture: 7, value: 6, score: 7, comment: null, product: PRODUCT };
    mockProductFindUnique.mockResolvedValue(PRODUCT);
    mockRatingCreate.mockResolvedValue(rating);

    const res = await request(app)
      .post('/api/ratings')
      .set('Authorization', 'Bearer token')
      .send({ barcode: '1234567890123', taste: 8, texture: 7, value: 6 });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });

  it('computes score as Math.round((taste + texture + value) / 3)', async () => {
    // (10 + 10 + 1) / 3 = 7
    mockProductFindUnique.mockResolvedValue(PRODUCT);
    mockRatingCreate.mockResolvedValue({ id: 2, score: 7, product: PRODUCT });

    await request(app)
      .post('/api/ratings')
      .set('Authorization', 'Bearer token')
      .send({ barcode: '1234567890123', taste: 10, texture: 10, value: 1 });

    expect(mockRatingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ score: 7 }),
      })
    );
  });

  it('includes an optional comment when provided', async () => {
    mockProductFindUnique.mockResolvedValue(PRODUCT);
    mockRatingCreate.mockResolvedValue({ id: 3, comment: 'Tasty!', product: PRODUCT });

    await request(app)
      .post('/api/ratings')
      .set('Authorization', 'Bearer token')
      .send({ barcode: '1234567890123', taste: 9, texture: 9, value: 9, comment: 'Tasty!' });

    expect(mockRatingCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ comment: 'Tasty!' }),
      })
    );
  });
});

describe('GET /api/ratings/product/:barcode', () => {
  beforeEach(() => {
    mockProductFindUnique.mockReset();
    mockRatingFindMany.mockReset();
  });

  it('returns 404 when the product does not exist', async () => {
    mockProductFindUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/ratings/product/1234567890123')
      .set('Authorization', 'Bearer token');
    expect(res.status).toBe(404);
  });

  it('returns the list of ratings for a known product', async () => {
    const ratings = [{ id: 1, taste: 8, user: { id: 'user-1', username: 'Jano', avatar: null } }];
    mockProductFindUnique.mockResolvedValue(PRODUCT);
    mockRatingFindMany.mockResolvedValue(ratings);

    const res = await request(app)
      .get('/api/ratings/product/1234567890123')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(ratings);
  });
});
