import { Request, Response, NextFunction } from 'express';
import config from '../configs/config.js';

const HEADER = 'x-origin-verify';

/**
 * Rejects any `/api/*` request that didn't arrive through the CloudFront
 * distribution in front of the API (ADR 0005 Phase 2, `terraform/phase2.tf`).
 * The distribution's WAF inserts this header on every request it lets past
 * its geo/rate rules — `disable_execute_api_endpoint` (api-gateway.tf) kills
 * the raw execute-api URL, but the API Gateway custom domain itself stays
 * publicly resolvable (CloudFront needs a real hostname to reach as a custom
 * origin), so this is what actually makes that resolvability harmless: a
 * request straight to the origin domain, or to this server run anywhere else
 * outside AWS, never carries the header and gets a 403 here regardless of
 * anything else about it.
 *
 * A no-op when `ORIGIN_VERIFY_SECRET` is unset. That is deliberate, not a gap
 * to fail fast on — local dev, tests, and any stage without a CloudFront
 * front end have nothing to check the header against, and requiring one
 * there would just break them.
 */
export function requireOriginSecret(req: Request, res: Response, next: NextFunction) {
  const secret = config.originVerifySecret;
  if (!secret) return next();

  if (req.header(HEADER) !== secret) {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
