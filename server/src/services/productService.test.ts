import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchFromOpenFoodFacts } from './productService.js';

function makeResponse(body: object, ok = true, status = 200): Promise<Response> {
  return Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: () => Promise.resolve(body),
  } as Response);
}

describe('fetchFromOpenFoodFacts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when OFF reports product not found (status 0)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(makeResponse({ status: 0 })));
    await expect(fetchFromOpenFoodFacts('1234567890123')).resolves.toBeNull();
  });

  it('returns null when OFF response has no product field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(makeResponse({ status: 1 })));
    await expect(fetchFromOpenFoodFacts('1234567890123')).resolves.toBeNull();
  });

  it('maps all product fields correctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(makeResponse({
      status: 1,
      product: {
        product_name: '  Sourdough Bread  ',
        brands: 'BakeryCo',
        image_url: 'https://example.com/img.jpg',
        generic_name: 'Bread',
      },
    })));

    const result = await fetchFromOpenFoodFacts('1234567890123');
    expect(result).toEqual({
      barcode: '1234567890123',
      name: 'Sourdough Bread',
      brand: 'BakeryCo',
      image: 'https://example.com/img.jpg',
      description: 'Bread',
    });
  });

  it('uses "Unknown Product" fallback and null fields when product data is sparse', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(makeResponse({
      status: 1,
      product: { product_name: '' },
    })));

    const result = await fetchFromOpenFoodFacts('1234567890123');
    expect(result?.name).toBe('Unknown Product');
    expect(result?.brand).toBeNull();
    expect(result?.image).toBeNull();
    expect(result?.description).toBeNull();
  });

  it('throws when the OFF API returns a non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(makeResponse({}, false, 503)));
    await expect(fetchFromOpenFoodFacts('1234567890123')).rejects.toThrow('Open Food Facts API error: 503');
  });
});
