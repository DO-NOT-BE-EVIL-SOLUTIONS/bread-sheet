import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueryRaw = vi.hoisted(() => vi.fn());
vi.mock('../db.js', () => ({
  default: { $queryRaw: mockQueryRaw },
}));

const mockConfig = vi.hoisted(() => ({ geminiDailyCallCap: 300 as number | null }));
vi.mock('../configs/config.js', () => ({
  default: mockConfig,
}));

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { reserveGeminiCall, GeminiDailyQuotaExhaustedError } from './geminiQuota.js';

describe('reserveGeminiCall', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
    mockConfig.geminiDailyCallCap = 300;
  });

  it('resolves when a row comes back under the cap', async () => {
    mockQueryRaw.mockResolvedValue([{ calls: 1 }]);

    await expect(reserveGeminiCall('plausibility')).resolves.toBeUndefined();
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('passes the configured cap into the query', async () => {
    mockConfig.geminiDailyCallCap = 42;
    mockQueryRaw.mockResolvedValue([{ calls: 1 }]);

    await reserveGeminiCall('plausibility');

    // Tagged-template mock call: (strings, ...values) — the cap is the only value.
    const values = mockQueryRaw.mock.calls[0]!.slice(1);
    expect(values).toEqual([42]);
  });

  it('rejects with a 503 daily_quota_exhausted error when no row is returned', async () => {
    mockQueryRaw.mockResolvedValue([]);

    const err = await reserveGeminiCall('label-extraction').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GeminiDailyQuotaExhaustedError);
    expect((err as GeminiDailyQuotaExhaustedError).status).toBe(503);
    expect((err as GeminiDailyQuotaExhaustedError).code).toBe('daily_quota_exhausted');
    expect((err as GeminiDailyQuotaExhaustedError).cap).toBe(300);
  });

  it('fails closed — a query error becomes a quota-exhausted 503, not a thrown DB error', async () => {
    mockQueryRaw.mockRejectedValue(new Error('connection refused'));

    const err = await reserveGeminiCall('plausibility').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GeminiDailyQuotaExhaustedError);
  });

  it('throws a programming error rather than silently skipping the reservation when unconfigured', async () => {
    mockConfig.geminiDailyCallCap = null;

    await expect(reserveGeminiCall('plausibility')).rejects.toThrow(
      /GEMINI_DAILY_CALL_CAP configured/,
    );
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
