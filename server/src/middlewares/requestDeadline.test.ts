import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import {
  REQUEST_DEADLINE_MS,
  RequestDeadlineError,
  requestDeadline,
} from './requestDeadline.js';
import { GEMINI_CALL_TIMEOUT_MS } from '../services/geminiDeadline.js';

/** Minimal `res` double: an EventEmitter plus the two flags the middleware reads. */
function fakeRes(): Response & { headersSent: boolean; writableEnded: boolean } {
  const res = new EventEmitter() as unknown as Response & {
    headersSent: boolean;
    writableEnded: boolean;
  };
  res.headersSent = false;
  res.writableEnded = false;
  return res;
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('requestDeadline', () => {
  it('calls next() immediately so the handler runs', () => {
    const next = vi.fn();
    requestDeadline(50)({} as Request, fakeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('raises a 503 RequestDeadlineError when the handler does not respond in time', async () => {
    const next = vi.fn();
    requestDeadline(20)({} as Request, fakeRes(), next);

    await tick(60);

    expect(next).toHaveBeenCalledTimes(2);
    const err = next.mock.calls[1]![0] as RequestDeadlineError;
    expect(err).toBeInstanceOf(RequestDeadlineError);
    expect(err.status).toBe(503);
    expect(err.code).toBe('request_timeout');
    expect(err.budgetMs).toBe(20);
  });

  it('stays quiet once the response has finished', async () => {
    const next = vi.fn();
    const res = fakeRes();
    requestDeadline(20)({} as Request, res, next);

    res.emit('finish');
    await tick(60);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the client disconnects', async () => {
    const next = vi.fn();
    const res = fakeRes();
    requestDeadline(20)({} as Request, res, next);

    res.emit('close');
    await tick(60);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not fire after headers have gone out', async () => {
    const next = vi.fn();
    const res = fakeRes();
    requestDeadline(20)({} as Request, res, next);

    // Headers sent without a 'finish'/'close' event — the timer still fires but
    // must not try to answer a response that has already started.
    res.headersSent = true;
    await tick(60);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('sits between the Gemini call budget and API Gateway 30s ceiling', () => {
    expect(REQUEST_DEADLINE_MS).toBeGreaterThan(GEMINI_CALL_TIMEOUT_MS);
    expect(REQUEST_DEADLINE_MS).toBeLessThan(30_000);
  });
});
