import { describe, it, expect, vi } from 'vitest';
import {
  GEMINI_CALL_TIMEOUT_MS,
  GeminiTimeoutError,
  GeminiUpstreamError,
  withGeminiDeadline,
} from './geminiDeadline.js';

vi.mock('../logger.js', () => ({
  default: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

/** A call that resolves only if its signal is never aborted. */
function slowCall(durationMs: number) {
  return (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => resolve('done'), durationMs);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
}

describe('withGeminiDeadline', () => {
  it('returns the call result when it finishes inside the budget', async () => {
    await expect(withGeminiDeadline('plausibility', slowCall(5), 200)).resolves.toBe('done');
  });

  it('hands the call an unaborted signal to pass to the SDK', async () => {
    const seen: AbortSignal[] = [];
    await withGeminiDeadline('plausibility', async (signal) => {
      seen.push(signal);
      return 'ok';
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]!.aborted).toBe(false);
  });

  it('maps a breach of the budget to a 503 GeminiTimeoutError', async () => {
    const err = await withGeminiDeadline('label-extraction', slowCall(5_000), 20).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(GeminiTimeoutError);
    const timeout = err as GeminiTimeoutError;
    expect(timeout.status).toBe(503);
    // The client only ever sees generic 5xx copy, so `code` is the contract.
    expect(timeout.code).toBe('upstream_timeout');
    expect(timeout.operation).toBe('label-extraction');
    expect(timeout.budgetMs).toBe(20);
    expect(timeout.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('wraps a non-timeout failure as a 502, keeping the original as cause', async () => {
    const upstream = new Error('Vertex said no');

    const err = await withGeminiDeadline(
      'plausibility',
      () => Promise.reject(upstream),
      5_000,
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(GeminiUpstreamError);
    expect((err as GeminiUpstreamError).status).toBe(502);
    expect((err as GeminiUpstreamError).code).toBe('upstream_error');
    expect((err as GeminiUpstreamError).cause).toBe(upstream);
  });

  it("does not let an upstream SDK error's status become our status", async () => {
    // Regression: @google/genai throws ApiError with Google's HTTP status, and
    // errorHandler trusts `err.status`. A Vertex 404 ("model not published in
    // this region") was surfacing to clients as a 404, which in this API means
    // "product not found". Observed in dev 2026-09-08.
    const vertex404 = Object.assign(new Error('Publisher model ... was not found'), {
      name: 'ApiError',
      status: 404,
    });

    const err = await withGeminiDeadline(
      'label-extraction',
      () => Promise.reject(vertex404),
      5_000,
    ).catch((e: unknown) => e);

    expect((err as GeminiUpstreamError).status).toBe(502);
    expect((err as GeminiUpstreamError).status).not.toBe(404);
  });

  it('leaves the default budget below the 25s request deadline', () => {
    // The budgets must stay nested — innermost first — or a slow Gemini call
    // surfaces as the outer deadline (or worse, API Gateway's 504) instead of
    // an actionable `upstream_timeout`. See ADR 0003 § step 0.
    expect(GEMINI_CALL_TIMEOUT_MS).toBeLessThan(25_000);
  });
});
