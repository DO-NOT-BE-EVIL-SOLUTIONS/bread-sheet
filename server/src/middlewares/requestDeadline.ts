import type { RequestHandler } from 'express';
import type { AppError } from './errorHandler.js';

/**
 * Outer deadline for a request handler, sitting between the 20 s Gemini call
 * budget (`services/geminiDeadline.ts`) and API Gateway's fixed 30 s integration
 * timeout. See ADR 0003 § Implementation step 0 for the full budget table.
 *
 * Where the inner budget bounds one upstream call, this bounds everything else
 * the handler does — `sharp`, the S3 write, Prisma — so a request always gets an
 * answer from us rather than an opaque 504 from the ingress.
 */
export const REQUEST_DEADLINE_MS = 25_000;

export class RequestDeadlineError extends Error implements AppError {
  readonly status = 503;
  readonly code = 'request_timeout';

  constructor(readonly budgetMs: number) {
    super(`Request exceeded its ${budgetMs}ms deadline`);
    this.name = 'RequestDeadlineError';
  }
}

/**
 * Answer the client if the handler has not responded within `budgetMs`.
 *
 * This does **not** cancel the handler — Express has no mechanism for that. The
 * handler runs on and may later try to write to a response that has already
 * been sent, which is why `errorHandler` checks `res.headersSent` before
 * writing. Cancellation is the inner budget's job; this is the backstop.
 */
export function requestDeadline(budgetMs: number = REQUEST_DEADLINE_MS): RequestHandler {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (res.headersSent || res.writableEnded) return;
      next(new RequestDeadlineError(budgetMs));
    }, budgetMs);

    // Never hold the event loop open for a request that has already finished.
    timer.unref();

    const clear = () => clearTimeout(timer);
    res.once('finish', clear);
    res.once('close', clear);

    next();
  };
}
