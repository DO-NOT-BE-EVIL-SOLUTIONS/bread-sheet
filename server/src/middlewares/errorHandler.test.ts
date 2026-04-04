import { describe, it, expect, vi } from 'vitest';
import { errorHandler, type AppError } from './errorHandler.js';

function makeReqResNext() {
  const req: any = {};
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next: any = vi.fn();
  return { req, res, next };
}

describe('errorHandler', () => {
  it('uses err.status when provided', () => {
    const { req, res, next } = makeReqResNext();
    const err: AppError = Object.assign(new Error('Not Found'), { status: 404 });
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Not Found' });
  });

  it('defaults to status 500 when err.status is absent', () => {
    const { req, res, next } = makeReqResNext();
    const err: AppError = new Error('Something broke');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Something broke' });
  });

  it('falls back to "Internal Server Error" when message is empty', () => {
    const { req, res, next } = makeReqResNext();
    const err: AppError = Object.assign(new Error(''), { status: 500 });
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith({ message: 'Internal Server Error' });
  });
});
