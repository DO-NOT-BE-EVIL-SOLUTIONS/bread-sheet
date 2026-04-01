import { rateLimit } from 'express-rate-limit';

/**
 * General API Rate Limiter
 * Protects against DDoS by limiting the number of requests a single IP can make.
 * 
 * Strategy for Guest Access:
 * Since guests share the same "unauthenticated" state, we rely on IP addresses.
 * A limit of 100 requests per 15 minutes is usually sufficient for a human user 
 * (guest or logged in) while blocking bot floods.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    status: 429,
    message: 'Too many requests, please try again later.',
  },
});

/**
 * Strict Auth Rate Limiter
 * Applied specifically to login/signup routes to prevent brute-force password guessing.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 login attempts per hour
  message: {
    status: 429,
    message: 'Too many login attempts, please try again after an hour.',
  },
});
