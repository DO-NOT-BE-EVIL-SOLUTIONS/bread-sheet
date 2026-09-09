import prisma from '../db.js';
import logger from '../logger.js';
import config from '../configs/config.js';
import type { AppError } from '../middlewares/errorHandler.js';

/**
 * Raised when today's `GEMINI_DAILY_CALL_CAP` has already been reserved, or
 * when the reservation itself could not be made (fail closed — ADR 0005 L2
 * rule 3: if the counter can't be read or written, the answer is 503, never
 * a model call).
 */
export class GeminiDailyQuotaExhaustedError extends Error implements AppError {
  readonly status = 503;
  readonly code = 'daily_quota_exhausted';

  constructor(readonly cap: number) {
    super(`Gemini daily call cap (${cap}) reached`);
    this.name = 'GeminiDailyQuotaExhaustedError';
  }
}

/**
 * Reserve one Gemini call against today's `GEMINI_DAILY_CALL_CAP`, atomically,
 * before the call is made. Both Gemini call sites (`imagePlausibilityService`,
 * `labelExtractionLlmService`) call this first and let a rejection propagate
 * instead of calling Gemini.
 *
 * Reserve-before-call, never count-after: incrementing first means concurrent
 * requests can't overshoot the cap by the width of the in-flight window, and a
 * call that times out or fails still counts — Google bills input tokens it has
 * already processed, so an aborted call is not a free one. The reservation is
 * never rolled back.
 *
 * The `WHERE calls < cap` guard on the conflict branch is what makes this a
 * single atomic statement rather than a check-then-increment race: Postgres
 * either performs the update and returns the row, or matches nothing and
 * returns no row, with no window for two concurrent requests to both read
 * "under cap" and both increment past it.
 */
export async function reserveGeminiCall(operation: string): Promise<void> {
  const cap = config.geminiDailyCallCap;
  if (cap === null) {
    // Only reachable if a Gemini call site runs without VISION_MODE=llm or
    // PLAUSIBILITY_MODE=gemini configured — config.ts's own `geminiNeeded`
    // check requires GEMINI_DAILY_CALL_CAP at startup whenever either is set,
    // so this is a programming error, not a runtime condition to handle.
    throw new Error('reserveGeminiCall called without GEMINI_DAILY_CALL_CAP configured');
  }

  let rows: { calls: number }[];
  try {
    rows = await prisma.$queryRaw<{ calls: number }[]>`
      INSERT INTO "GeminiDailyUsage" (day, calls)
      VALUES (CURRENT_DATE, 1)
      ON CONFLICT (day) DO UPDATE SET calls = "GeminiDailyUsage".calls + 1
        WHERE "GeminiDailyUsage".calls < ${cap}
      RETURNING calls
    `;
  } catch (err) {
    logger.error('gemini:quota reservation failed — failing closed', {
      operation,
      errorName: (err as Error)?.name,
      errorMessage: (err as Error)?.message,
    });
    throw new GeminiDailyQuotaExhaustedError(cap);
  }

  if (rows.length === 0) {
    logger.warn('gemini:daily quota exhausted', { operation, cap });
    throw new GeminiDailyQuotaExhaustedError(cap);
  }

  logger.info('gemini:quota reserved', { operation, cap, calls: rows[0]!.calls });
}
