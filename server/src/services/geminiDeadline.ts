import logger from '../logger.js';
import type { AppError } from '../middlewares/errorHandler.js';

/**
 * Deadline budget for the two synchronous Gemini paths — the plausibility gate
 * inside `POST /api/products/upload-image` and `POST /api/products/extract-label`
 * when `VISION_MODE=llm`.
 *
 * The budgets are nested so the innermost always fires first and the outermost
 * is never reached:
 *
 *   20 s  this module, on the Gemini call itself   → 503 `upstream_timeout`
 *   25 s  `requestDeadline` on the route           → 503 `request_timeout`
 *   30 s  API Gateway's integration timeout        → 504, opaque, upload lost
 *
 * The 30 s figure is not ours to move: HTTP APIs cap the integration timeout at
 * 30 s and AWS documents it as not increasable. Without an inner bound a slow
 * Gemini response becomes that opaque 504 — the upload is gone and the client
 * cannot tell a timeout from a crash. With one, the same slowness is a clean
 * 503 the client can retry.
 *
 * This matters independently of the ingress: an unbounded call occupies a
 * request on a single 0.25 vCPU task for as long as the upstream feels like it.
 *
 * See ADR 0003 § Implementation step 0.
 */
export const GEMINI_CALL_TIMEOUT_MS = 20_000;

/**
 * Raised when a Gemini call outlives {@link GEMINI_CALL_TIMEOUT_MS}.
 *
 * The message is for the server log only — `errorHandler` collapses every 5xx
 * to generic copy, and the app's `formatApiError` does the same on its side.
 * `code` is the part that reaches the client, so branch on that.
 */
export class GeminiTimeoutError extends Error implements AppError {
  readonly status = 503;
  readonly code = 'upstream_timeout';

  constructor(
    readonly operation: string,
    readonly elapsedMs: number,
    readonly budgetMs: number,
  ) {
    super(`Gemini call "${operation}" exceeded its ${budgetMs}ms budget after ${elapsedMs}ms`);
    this.name = 'GeminiTimeoutError';
  }
}

/**
 * Run a Gemini call under the deadline budget. The callback receives the
 * `AbortSignal` it must pass to the SDK as `config.abortSignal` — without that
 * the request is not actually cancelled, only abandoned.
 *
 * `budgetMs` is a parameter rather than a constant read so tests can exercise
 * the timeout without waiting 20 seconds.
 */
export async function withGeminiDeadline<T>(
  operation: string,
  call: (signal: AbortSignal) => Promise<T>,
  budgetMs: number = GEMINI_CALL_TIMEOUT_MS,
): Promise<T> {
  const signal = AbortSignal.timeout(budgetMs);
  const startedAt = Date.now();

  try {
    return await call(signal);
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    // Ask the signal, not the error. How the SDK surfaces an abort — a
    // DOMException, a wrapped fetch failure, something else again — is not part
    // of any contract we control; `signal.aborted` is unambiguous.
    if (signal.aborted) {
      logger.warn('gemini:deadline exceeded', { operation, elapsedMs, budgetMs });
      throw new GeminiTimeoutError(operation, elapsedMs, budgetMs);
    }
    throw err;
  }
}
