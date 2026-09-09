# Cost Blast Radius and Emergency Stop

* Status: Proposed
* Date: 2026-09-09

## Context and Problem Statement

BreadSheet is funded out of one private credit card. [ADR 0003](0003-always-on-production-cost-architecture.md)
optimised the stack for *flat* cost and, in doing so, deliberately traded a flat $18.40/mo ALB for
**per-request** API Gateway pricing. Step 6 of that ADR named the mitigation — "an AWS Budget with
an alert at ~$40/mo" — and `terraform/budget.tf` delivers it.

An alert is not a stop. The question this ADR answers is: **when the bill starts running, what
actually halts it, how fast, and who is holding the card when it does?**

The trigger is not hypothetical abuse research. It is the specific shape of this stack: a public,
unauthenticated-signup API in front of a paid multimodal model, with a world-readable S3 bucket
beside it, three separate vendors billing independently, and exactly one budget watching one of
them.

## The stack as it stands — why our options are what they are

Reading order for the rest of this ADR. Everything below follows from these three facts.

### 1. We run an HTTP API, not a REST API

`terraform/api-gateway.tf:2` creates `aws_apigatewayv2_api` with `protocol_type = "HTTP"`. That
choice came from ADR 0003 — HTTP APIs cost $1.00/M against REST's $3.50/M, and only HTTP APIs
support the Cloud Map private integration that let us delete the load balancer.

The bill for that saving is the entire per-client cost-control catalogue:

| Control | REST API (v1) | **HTTP API (v2) — what we run** |
|---|:---:|:---:|
| API keys | ✅ | ❌ |
| Usage plans — requests/day, requests/month quotas | ✅ | ❌ |
| Per-client rate limiting | ✅ | ❌ |
| AWS WAF (incl. geo match, IP sets, rate rules) | ✅ | ❌ |
| Resource policy (`aws:SourceIp` allowlist) | ✅ | ❌ |
| Mock integration (a free "return 429" sink) | ✅ | ❌ |
| Stage + per-route throttling (rate/burst) | ✅ | ✅ |
| JWT authorizer | ❌ | ✅ |

Every piece of generic "protect your API Gateway" advice — usage plans, API keys, WAF rules —
is written for the API type we do not have. **The only native control we own is stage and per-route
throttling**, and `aws_apigatewayv2_stage.default` currently sets none, so we sit at the account
default of 10,000 rps.

### 2. Throttling does not cap the API Gateway line item

API Gateway bills on **calls received**. A request throttled to a 429 *by the gateway itself* is
still a billable call. So the stage throttle bounds everything *behind* the gateway — Gemini, S3
writes, the resize Lambda, RDS — but it does not bound the gateway's own charge.

At the current account-default 10,000 rps, the theoretical ceiling is 864M requests/day ≈
**$864/day** on the API Gateway line alone. Nothing in the stack prevents that today.

### 3. Three vendors bill us; one budget watches one of them

| Surface | Billed by | What bounds it today | Worst case |
|---|---|---|---|
| API Gateway requests | **AWS** $1.00/M | nothing (10,000 rps default) | ~$864/day |
| S3 `GetObject` egress | **AWS** $0.09/GB | nothing — `s3.tf:29` grants `Principal: "*"` read on `processed/*`, CORS `*` | ~$92/TB, bypasses the API entirely |
| CloudWatch Logs ingestion | **AWS** ~$0.57/GB | request volume (`retention_in_days = 1` caps storage, not ingest) | scales with the flood |
| Gemini / Vertex AI | **Google** per call | task throughput only | **invisible to `budget.tf`** |
| Anonymous user rows / MAU | **Supabase** | nothing — `signInAnonymously()` is open to the world | tier escalation |
| Fargate task | AWS | `desired_count = 1`, no autoscaling | flat $9.01/mo |
| RDS + gp3 storage | AWS | instance class; storage autoscale ceiling 50 GiB | flat, +$3.80 at ceiling |

Two things fall out of this table.

**The one real guardrail we already have is accidental.** `ecs.tf` runs a single 256-CPU /
512 MB task with no autoscaling. Nothing downstream of the gateway can be consumed faster than one
0.25 vCPU task can push it. That is a genuine bulkhead on Gemini spend, and it is load-bearing —
adding ECS autoscaling would remove it.

**The most expensive plausible incident is on the wrong card.** `POST /api/products/upload-image`
(`server/src/routes/productRoutes.ts:57`) is guarded by `requireAuth` only — anonymous Supabase
sessions reach it — and every call runs the `PLAUSIBILITY_MODE=gemini` check before the S3 write.
`budget.tf` cannot see one cent of that spend, because it is a Google Cloud charge against project
`breadsheet-496522`.

**And `express-rate-limit` saves nothing at the gateway.** `apiLimiter` (100 req/15 min per IP)
runs *after* API Gateway has received, routed and billed the request. It protects the task; it does
not protect the bill. It is also per-IP, which a distributed flood defeats by construction.

> Aside, worth a separate fix: `server/src/app.ts:19` sets `trust proxy: 1` with a comment reading
> "Behind the Fargate ALB". The ALB has been gone since ADR 0003. Whether `req.ip` still resolves to
> the real client behind the VPC link should be verified rather than assumed, since every IP-keyed
> limiter depends on it.

## Decision Drivers

* **Speed of stop.** The gap between "something is wrong" and "spending has stopped" is the whole
  problem. Hours is not acceptable when the ceiling is $864/day.
* **Coverage of all three bills.** An AWS-only control leaves the largest per-unit cost unguarded.
* **Do not reopen ADR 0003.** Returning to REST API or adding a load balancer would undo the
  saving this stack was rebuilt to capture.
* **Cheap at rest.** A guardrail that costs $15/mo to protect a $45/mo budget is self-defeating.
* **Reversible by one person on a phone.** The stop must be triggerable and undoable without a
  laptop and without a Terraform apply if possible.
* **A false positive must not be expensive.** Locking out the actual dev team is a real cost.

## Considered Options

### E-A — AWS Budget Actions only

Extend `budget.tf` with `aws_budgets_budget_action`. **Rejected as the primary mechanism.**
Budget actions can apply an IAM/SCP deny, stop EC2 instances, or stop RDS instances. They *cannot*
scale an ECS service or touch API Gateway — so under attack, the deny policy would stop **us**
deploying a fix while the flood continued. Budgets also re-evaluate roughly three times a day,
putting worst-case latency near 8 hours.

Retained as a **slow-lane backstop only**: an action that stops the RDS instance is a meaningful
last resort for a runaway that nothing else caught.

### E-B — CloudWatch alarm → SNS → panic Lambda

An alarm on the `AWS/ApiGateway` `Count` metric for our `ApiId` publishes to the existing
`aws_sns_topic.billing_alerts`, which invokes a Lambda that takes the actions Budget Actions cannot.
Latency is one alarm period (minutes). **Chosen.**

### E-C — Return to REST API for usage plans and WAF

Buys quotas, per-client throttling and WAF in one move. **Rejected:** 3.5× per-request price,
loses the Cloud Map private integration, and directly reverses ADR 0003's ingress decision. We would
be paying more per request for the privilege of limiting requests.

### E-D — CloudFront in front of API Gateway

Adds an edge tier that can geo-restrict, absorb floods inside its always-free tier, and host WAF if
we ever want it. **Chosen conditionally** — see the geo-restriction section below, which is the only
reason to take it.

### E-E — Application-level spend counter on the Gemini paths

A persisted per-day count of model calls; past the cap, return 503 without calling Gemini.
**Chosen.** It is the only control an attacker cannot route around by distributing source IPs or
cycling anonymous accounts, and it is the only one that defends the Google bill from inside.

### E-F — GCP billing kill switch

A Google Cloud budget → Pub/Sub → Cloud Function calling
`cloudbilling.projects.updateBillingInfo` with an empty `billingAccountName`, plus a Vertex AI
per-project quota override on Gemini requests-per-minute. **Chosen.** This is the only true hard cap
available anywhere in the stack: it detaches the billing account and the project stops serving. AWS
sells no equivalent.

## Decision Outcome

**Adopt a layered stop, ordered by how fast it fires. No single layer is sufficient; the layering
is the decision.**

| Layer | Mechanism | Latency | Caps |
|---|---|---|---|
| **L0** Quota | Vertex AI per-project requests-per-minute override | synchronous | Google spend, hard |
| **L1** Throttle | `default_route_settings` on the stage; tighter `route_settings` on the upload route | synchronous | everything behind the gateway |
| **L2** App cap | daily Gemini call counter → 503 | synchronous | Google spend, from inside |
| **L3** Panic | CloudWatch `Count` alarm → SNS → Lambda | minutes | AWS gateway + all downstream |
| **L4** Backstop | GCP budget → disable billing; AWS Budget Action → stop RDS | hours | last resort, both cards |

### L1 — stage and per-route throttling

Add to `aws_apigatewayv2_stage.default`:

```hcl
default_route_settings {
  throttling_rate_limit  = 10
  throttling_burst_limit = 25
}
```

Ten requests per second is generous for one developer and a handful of phones, and it bounds the
downstream arithmetic: 10 rps sustained for a month is 25.9M requests, so even the *unstoppable*
gateway charge is bounded at ~$26/mo rather than ~$26,000.

The Gemini path deserves a tighter number, but `route_settings` can only key a route that exists
and we run a single `$default` catch-all. **Add an explicit `POST /api/products/upload-image` route
pointing at the same integration, purely so it can carry its own throttle** (`rate 1, burst 2`).
That is the whole trick — the route exists to be throttled, not to route.

### L2 — daily Gemini cap

A persisted counter next to `services/geminiDeadline.ts`, checked before the model call in
`imagePlausibilityService.ts` and `labelExtractionService.ts`. Over budget → `503`
`{ code: 'daily_quota_exhausted' }`, no upstream call. Chosen deliberately over a per-user limit:
anonymous accounts are free to mint, so per-user caps bound nothing in aggregate.

### L3 — the panic Lambda

Triggered automatically by a CloudWatch alarm on `AWS/ApiGateway` `Count` for our `ApiId`
(threshold on the order of 10,000 requests in 5 minutes — well above real traffic, well below
anything that costs money), and invocable by hand:

```sh
aws lambda invoke --function-name breadsheet-dev-panic-stop /dev/stdout
```

It performs, in order:

1. `ecs update-service --desired-count 0` — stops Gemini calls, RDS load and task egress. The
   biggest lever, and the fastest.
2. `apigatewayv2 delete-api-mapping` — detaches the custom domain, stopping the billable request
   count at the gateway. There is no cheaper sink: HTTP APIs have no Mock integration, and
   throttled 429s are billed.
3. Removes the `PublicReadAllowProcessed` statement from the bucket policy — closes S3 egress,
   which bypasses every other layer.
4. Publishes to `aws_sns_topic.billing_alerts` so the stop is not silent.

**Resume is `terraform apply`.** `aws_ecs_service.server` ignores `task_definition` but *not*
`desired_count`, and the api mapping and bucket policy are both Terraform-managed, so a plain apply
restores all three. This is why the Lambda mutates live state rather than writing anything durable.

### L4 — backstops

GCP budget → Pub/Sub → billing-detach function on project `breadsheet-496522`. On the AWS side, one
`aws_budgets_budget_action` stopping the RDS instance at 150% of `budget_limit_usd`. Both are the
"everything else failed and nobody was looking" tier.

---

## Geo-restriction: allowing only Germany / Baden-Württemberg on `dev`

The `dev` stage serves one development team in Baden-Württemberg. Restricting it geographically is
attractive: it shrinks the reachable surface by orders of magnitude at essentially zero cost, and
unlike every layer above it, it stops traffic *before* it becomes a billable API Gateway call.

**It is not a cost cap** — a botnet with German exit nodes defeats it entirely — so it belongs
alongside L0–L4, never instead of them.

### Why this needs CloudFront

Fact 1 above forecloses the obvious routes. Our HTTP API supports **neither WAF** (where geo-match
rules live) **nor resource policies** (where an `aws:SourceIp` allowlist would live). There is no
way to geo-filter an HTTP API at the gateway. The filter has to sit in front of it, and CloudFront
is the only in-front option that does not reintroduce a load balancer.

CloudFront's always-free tier — 1 TB egress, 10M requests, 2M CloudFront Functions invocations per
month — covers this stage completely, and blocked requests never reach API Gateway, so they never
become a $1.00/M call. It is the one layer here that reduces the gateway bill rather than the
downstream bill.

### Three ways to draw the boundary

| Option | Granularity | Cost | Notes |
|---|---|---|---|
| **G-A** CloudFront built-in `geo_restriction` | Country (`DE`) only | $0 | Four lines of Terraform. No functions, no WAF. |
| **G-B** CloudFront Function on viewer-request | Country **+ region** (`DE` + `BW`) | $0 within free tier | Reads `CloudFront-Viewer-Country` / `CloudFront-Viewer-Country-Region`. Both must be added via a **cache policy** to be visible at the viewer-request stage — an origin request policy is applied too late. Use a custom policy with TTL 0. |
| **G-C** AWS WAF on the distribution | Country **+ region**, plus IP sets and rate rules | ~$7/mo ($5 web ACL + $1/rule + $0.60/M req) | Geo-match emits the label `awswaf:clientip:geo:region:DE-BW`; a label-match rule blocks everything else. Most capable, only option that is not free. |

### The accuracy problem, which decides it

ISO 3166-2 subdivision geolocation is materially less reliable than country geolocation, and German
mobile networks are close to a worst case: Telekom, Vodafone and O2 route subscriber traffic through
a small number of central egress points, so a phone physically in Stuttgart routinely geolocates to
Hesse or Bavaria. Both AWS geo databases return `XX` when a lookup fails, and `DE-XX` fails a
`DE-BW` match.

A `BW`-only rule would therefore lock the dev team out of the dev stage intermittently, from real
devices, with a 403 that looks nothing like a bug in the app. That is exactly the "false positive
must not be expensive" driver.

**Decision: take G-A — CloudFront with country-level `DE` — as the default.** It captures nearly all
of the surface reduction with none of the flakiness. Keep **G-B** documented as an opt-in tightening
for a period when the team is known to be at fixed lines, and only if a break-glass exists (a
Route 53 weighted record, or a header the app can send, that bypasses the distribution).
**G-C is rejected for `dev`** — $7/mo is 15% of the monthly budget to buy a rule that G-B gives away
free.

### What CloudFront in front actually requires

Putting a distribution in front does nothing for cost unless API Gateway becomes unreachable
directly. Three things, all mandatory together:

1. **`disable_execute_api_endpoint = true`** on `aws_apigatewayv2_api.main` — kills the
   `*.execute-api.eu-west-1.amazonaws.com` URL, which is currently public and published as the
   `api_endpoint` output.
2. **A secret origin header.** The API Gateway *custom domain* stays publicly resolvable and answers
   to anyone sending the right `Host`. CloudFront must inject a shared secret that Express (or a
   Lambda authorizer) requires, or the geo filter is decorative.
3. **A second ACM certificate in `us-east-1`.** CloudFront will not accept the regional
   `eu-west-1` certificate in `dns.tf`. `aws_route53_record.server` then aliases the distribution
   instead of the API Gateway domain, and the API Gateway custom domain moves to an internal name.

Point 3 is the real cost of this option and the reason it is scoped to `dev` for now.

### Positive Consequences

* Three of the five layers (L0, L1, L2) are synchronous — they cannot be outrun, unlike a budget.
* L1 turns an unbounded gateway charge into arithmetic: 10 rps is ~$26/mo, and that number is a
  dial in `.tfvars` rather than a hope.
* The Google bill, currently unguarded by anything, gets both a hard quota (L0) and an in-process
  cap (L2).
* The panic Lambda is manually invocable, so it doubles as the "I am on holiday and something looks
  wrong" button, and its resume path is an ordinary `terraform apply`.
* Geo-restriction is the only layer that reduces the *gateway* charge, and inside the CloudFront
  free tier it is free.
* None of this reopens ADR 0003: no load balancer, no REST API, no change to the Cloud Map
  integration.

### Negative Consequences

* Five layers is more surface than a single guardrail, and each needs to be understood to be
  operated. The layering is justified only because no single layer covers all three vendors.
* L3 is destructive by design: a false positive takes `dev` down until someone runs `terraform
  apply`. The alarm threshold must sit far above real traffic, and the stop must be loud.
* L1's per-route throttle requires adding a route that exists purely to be throttled — a mild
  wart in `api-gateway.tf` that needs its comment to survive future edits.
* The CloudFront option adds an edge hop, a second certificate in another region, a shared-secret
  header and a DNS change — real complexity against an architecture ADR 0003 worked to simplify.
  This is why it is `dev`-scoped and country-level.
* Subdivision-level geo is documented but not adopted; if someone enables it later without the
  break-glass, they will lock themselves out from a mobile network and it will not look like a
  geo problem.
* L4's RDS stop is only useful if the database is genuinely the runaway, which is unlikely given
  its flat pricing. It is cheap insurance, not a real defence.
* `budget.tf` remains AWS-only. The GCP budget is a separate Terraform provider / console artefact
  and will drift from this repo unless someone owns it.

## References

* [Choose between REST APIs and HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
  — the feature matrix behind Fact 1.
* [Throttle requests to your HTTP APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html)
  — stage and route settings; the only native control we own.
* [API Gateway pricing: throttled requests are billed](https://repost.aws/questions/QU5y4fo-e3RWyU5r4VmyPIzA/pricing-clarification-for-api-gateway)
  — Fact 2.
* [Add CloudFront request headers](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-cloudfront-headers.html)
  — `CloudFront-Viewer-Country-Region` is the ISO 3166-2 first-level subdivision.
* [AWS WAF geographic match rule statement](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-geo-match.html)
  — the `awswaf:clientip:geo:region:<ISO>` label, and the `XX` fallback when a lookup fails.
* [Disable billing to stop usage (Google Cloud)](https://cloud.google.com/billing/docs/how-to/notify)
  — the budget → Pub/Sub → detach-billing pattern behind L0/L4.
* [ADR 0003](0003-always-on-production-cost-architecture.md) § step 6 — the billing alarm this ADR
  extends, and the ingress decision that constrains every option here.
