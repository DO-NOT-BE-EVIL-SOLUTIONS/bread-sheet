# ──────────── Route 53 Hosted Zone ────────────────────────────────────────────

resource "aws_route53_zone" "dev" {
  name    = "dev.bread-sheet.com"
  comment = "Host the dev stage of breadsheet"

  tags = merge(local.tags, { Name = "dev.bread-sheet.com" })
}

# ──────────── ACM Certificate — API Gateway origin domain (regional) ──────────
#
# ADR 0005 Phase 2: `server.dev.bread-sheet.com` moves to the CloudFront
# distribution below; API Gateway's custom domain moves to this internal-facing
# name instead. It stays *publicly resolvable* — CloudFront needs a real
# hostname to reach over the internet as a custom origin, same reasoning as the
# images bucket's OAC setup — what makes it safe is `disable_execute_api_endpoint`
# (api-gateway.tf, kills the raw execute-api URL) plus `requireOriginSecret`
# (server/src/app.ts), which 403s anything lacking the header the distribution's
# WAF inserts on every request it lets through.
moved {
  from = aws_acm_certificate.server
  to   = aws_acm_certificate.origin
}

resource "aws_acm_certificate" "origin" {
  domain_name       = "origin.dev.bread-sheet.com"
  validation_method = "DNS"

  tags = merge(local.tags, { Name = "origin.dev.bread-sheet.com" })

  lifecycle {
    create_before_destroy = true
  }
}

moved {
  from = aws_route53_record.acm_validation
  to   = aws_route53_record.origin_validation
}

resource "aws_route53_record" "origin_validation" {
  zone_id = aws_route53_zone.dev.zone_id
  name    = tolist(aws_acm_certificate.origin.domain_validation_options)[0].resource_record_name
  type    = "CNAME"
  ttl     = 300
  records = [tolist(aws_acm_certificate.origin.domain_validation_options)[0].resource_record_value]
}

moved {
  from = aws_acm_certificate_validation.server
  to   = aws_acm_certificate_validation.origin
}

resource "aws_acm_certificate_validation" "origin" {
  certificate_arn         = aws_acm_certificate.origin.arn
  validation_record_fqdns = [aws_route53_record.origin_validation.fqdn]
}

# ──────────── A Record → API Gateway origin domain ─────────────────────────────

resource "aws_route53_record" "origin" {
  zone_id = aws_route53_zone.dev.zone_id
  name    = "origin.dev.bread-sheet.com"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.origin.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.origin.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

# ──────────── ACM Certificate — CloudFront distribution (us-east-1, mandatory) ─
#
# CloudFront only accepts ACM certificates issued in us-east-1, regardless of
# where the distribution's origin lives — the same us-east-1-only constraint
# detection.tf's Cost Anomaly monitor and l4.tf's CLOUDFRONT-scope WAF ACL hit,
# reusing the same `aws.use1` provider alias from main.tf.

resource "aws_acm_certificate" "cloudfront_server" {
  provider = aws.use1

  domain_name       = "server.dev.bread-sheet.com"
  validation_method = "DNS"

  tags = merge(local.tags, { Name = "server.dev.bread-sheet.com CloudFront us-east-1" })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cloudfront_server_validation" {
  zone_id = aws_route53_zone.dev.zone_id
  name    = tolist(aws_acm_certificate.cloudfront_server.domain_validation_options)[0].resource_record_name
  type    = "CNAME"
  ttl     = 300
  records = [tolist(aws_acm_certificate.cloudfront_server.domain_validation_options)[0].resource_record_value]
}

resource "aws_acm_certificate_validation" "cloudfront_server" {
  provider = aws.use1

  certificate_arn         = aws_acm_certificate.cloudfront_server.arn
  validation_record_fqdns = [aws_route53_record.cloudfront_server_validation.fqdn]
}

# ──────────── A Record → CloudFront (ADR 0005 Phase 2 cutover) ────────────────
#
# Was an alias straight to the API Gateway custom domain; now aliases the
# CloudFront distribution (phase2.tf) sitting in front of it. CloudFront's
# hosted zone ID is a single fixed value for every distribution on the
# platform (Z2FDTNDATAQYW2) — AWS documents it as a constant, not something to
# look up per-distribution.
#
# Cutover is atomic from Terraform's point of view: `aws_cloudfront_distribution`
# defaults to `wait_for_deployment = true`, so this alias only updates once the
# distribution is fully deployed to edge locations — there is no window where
# DNS points at a distribution that isn't ready yet. There *is* a real window
# where all traffic to this hostname starts flowing through a brand-new
# WAF/geo/rate-limit configuration the moment this applies; that is reviewed
# before every apply of this specific change for exactly that reason.

resource "aws_route53_record" "server" {
  zone_id = aws_route53_zone.dev.zone_id
  name    = "server.dev.bread-sheet.com"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}
