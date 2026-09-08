# Server — Production Checklist

## Environment Variables

- [ ] `DATABASE_URL` — points to production RDS instance, not localhost
- [ ] `SUPABASE_URL` — production Supabase project URL
- [ ] `SUPABASE_PUBLISHABLE_DEFAULT_KEY` — production Supabase anon key
- [ ] `ALLOWED_ORIGINS` — comma-separated list of production frontend origins (e.g. `https://app.breadsheet.com`). Currently defaults to `http://localhost:8081` which must not reach production
- [ ] `NODE_ENV=production`
- [ ] `PORT` — set if different from 3000
- [ ] `APP_DEEP_LINK_SCHEME=breadsheet` — use the bare scheme for production builds (not `exp+breadsheet`, which is Expo Go only)
- [ ] `VISION_MODE` — set explicitly (`live` or `llm` in prod; never `mock`, which returns fixture OCR). No default — the server refuses to boot if unset
- [ ] `PLAUSIBILITY_MODE=gemini` — the upload image plausibility / abuse gate. Must **not** be `mock` in production (`mock` accepts every image, including abusive uploads). No default — the server refuses to boot if unset
- [ ] `S3_MODE=aws` — selects the S3 backend / addressing style (`localstack` is local dev only; it forces path-style addressing, which LocalStack requires but real S3 deprecates). No default — the server refuses to boot if unset
- [ ] `S3_BUCKET_NAME` — production image bucket
- [ ] `AWS_REGION` — **required** in prod: the S3 client sets no region and ECS does not inject one on Fargate (without it every S3 call throws "Region is missing"). Do **not** set `AWS_ENDPOINT_URL` in real AWS — it would misroute S3 off AWS (LocalStack-only)
- [ ] `ASSET_BASE_URL` — public base URL where stored image keys resolve, **including the bucket part**: `https://<bucket>.s3.<region>.amazonaws.com` (or the CDN domain once one fronts the bucket). The DB stores S3 keys only; this is the single switch for where clients fetch images from. No default — the server refuses to boot if unset
- [ ] **Gemini credentials** — required when `VISION_MODE=llm` or `PLAUSIBILITY_MODE=gemini`. Pick one auth method (validated at startup by `config.ts`):
  - [ ] **Preferred (keyless):** `GOOGLE_GENAI_USE_VERTEXAI=true` + `GOOGLE_CLOUD_PROJECT` + `GOOGLE_CLOUD_LOCATION`, plus the WIF vars `GCP_WORKLOAD_IDENTITY_AUDIENCE` + `GCP_SERVICE_ACCOUNT_EMAIL`. Authenticates via Workload Identity Federation (the AWS task role impersonates the GCP service account; `services/gcpWorkloadIdentity.ts`) — same path as `live` Vision; the service account needs `roles/aiplatform.user`. No long-lived secret to store or rotate.
  - [ ] **Alternative:** `GEMINI_API_KEY` (Google AI Studio). Store as a secret, never in the image. Do **not** set alongside `GOOGLE_GENAI_USE_VERTEXAI=true`.

## Supabase

- [ ] Settings → Authentication → URL Configuration → Redirect URLs — add `https://api.breadsheet.com/auth/callback` (the server's `/auth/callback` endpoint, not a custom scheme URL — Supabase rejects non-HTTP schemes)

## Database

- [ ] Run migrations before deploying: `npm run db:deploy`
- [ ] Confirm the RDS security group only accepts connections from the Fargate **task** SG on `5432`, not the public internet
- [ ] Enable RDS automated backups and set retention period

## Email (SMTP)

- [ ] Configure a custom SMTP provider in Supabase dashboard (Settings → Auth → SMTP). The free tier caps outbound auth emails at 3 per hour — this will break the signup and account upgrade flows under any real usage
- [ ] Recommended providers: Resend, Mailgun, or AWS SES (already in the stack)
- [ ] Configure auth email templates (verification, password reset) with production branding and a `Reply-To` address
- [ ] Confirm the `From` address matches a domain with valid SPF/DKIM records to avoid spam filtering

## Security

- [ ] Verify `ALLOWED_ORIGINS` is set — the CORS default allows localhost only, production will block the app otherwise
- [ ] Review rate limit thresholds (`apiLimiter`, `userLimiter`, `syncLimiter`) against expected production traffic
- [ ] Ensure error responses never leak stack traces — `errorHandler` should not forward `err.stack` in `NODE_ENV=production`
- [ ] Put WAF rules (AWS WAF or Cloudflare) in front of the API Gateway HTTP API for network-layer DDoS protection
- [ ] Set anonymous user cap in Supabase project settings

## Infrastructure

- [ ] Confirm the Docker image builds cleanly locally: `docker build ./server` — Docker Compose is local dev only; ECS pulls the image from **GHCR** (`ghcr.io/fabelhaft-io/bread-sheet-server`, public), not ECR
- [ ] Push-CD wired: a gated prod release (tag/release + `environment: production` reviewer) promotes the same `:<git-sha>` already running in dev to the prod ECS service (see `infrastructure.md` § Deployment Pipeline)
- [ ] Container `healthCheck` points to `GET /` with a `startPeriod` covering migrate-on-boot (there is no target group any more — the container health check is the only liveness signal, and the only one ECS reports into Cloud Map)
- [ ] Fargate task CPU/memory sized for the workload (start `256`/`512`, bump on OOM); ECS deployment circuit breaker + rollback enabled
- [ ] ECS Service Auto Scaling configured if traffic is variable

## Observability

- [ ] Winston log level set to `warn` or `error` in production (not `info`)
- [ ] Logs shipped to CloudWatch or equivalent
- [ ] Uptime monitoring on `GET /` health check endpoint

## Before Each Release

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` succeeds locally before pushing
- [ ] Database migrations reviewed — no destructive column drops without a rollback plan
