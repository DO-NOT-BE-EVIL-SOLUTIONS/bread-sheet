import { rateLimit } from 'express-rate-limit';
import { AuthRequest } from './authMiddleware.js';

// IP-based limiter for the whole API — stops unsophisticated floods
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 429, message: 'Too many requests, please try again later.' },
});

// Per-user limiter for expensive authenticated endpoints.
// Keyed on the authenticated user ID so that an attacker cycling through
// anonymous accounts is still rate-limited per account, not just per IP.
export const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => (req as AuthRequest).user?.id ?? 'unauthenticated',
  skip: (req) => !(req as AuthRequest).user,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 429, message: 'Too many requests, please try again later.' },
});

// Strict per-IP limiter for the user sync endpoint.
// Relaxed in development to avoid hitting the limit during hot-reloads.
export const syncLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 500,
  message: { status: 429, message: 'Too many sync attempts, please try again later.' },
});
