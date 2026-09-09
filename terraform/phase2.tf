# ──────────── ADR 0005 § Phase 2 — CloudFront over the API ────────────────────
#
# `server.dev.bread-sheet.com` moves from an alias straight at API Gateway to
# an alias at this distribution — a second flat-rate Free plan (L5's images
# distribution used the first of the account's three), fronting the API for
# two things Fact 1 says the HTTP API cannot provide on its own: per-IP rate
# limiting and geo-restriction, both enforced at the edge for $0 and both
# exempt from the plan's usage allowance when they block a request. See the
# ADR's "Why this needs CloudFront" and "Three ways to draw the boundary" for
# the reasoning; this file is the G-C (WAF, country-level) implementation it
# lands on.
#
# Two secrets, two different jobs:
#   - origin_verify_secret: inserted as X-Origin-Verify on every request this
#     WAF allows through (both the default DE-pass and the edge-bypass rule).
#     requireOriginSecret (server/src/app.ts) 403s anything lacking it — this
#     is what makes origin.dev.bread-sheet.com's public resolvability harmless
#     (disable_execute_api_endpoint, api-gateway.tf, closes the *other* public
#     door). Never leaves AWS: generated here, read by Express via SSM.
#   - edge_bypass_secret: what CI (GitHub-hosted runners, not in Germany) and
#     the VPC-link keepalive Lambda send to skip the geo rule. Copied out to
#     GitHub manually (see the phase2_edge_bypass_secret output) since no
#     GitHub provider is configured here.

resource "random_password" "origin_verify_secret" {
  length  = 32
  special = false
}

resource "random_password" "edge_bypass_secret" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "origin_verify_secret" {
  name        = "/breadsheet/dev/ORIGIN_VERIFY_SECRET"
  description = "ADR 0005 Phase 2 - shared secret the CloudFront WAF inserts as X-Origin-Verify on every request it allows; requireOriginSecret (server/src/app.ts) checks it"
  type        = "SecureString"
  value       = random_password.origin_verify_secret.result

  tags = merge(local.tags, { Name = "/breadsheet/dev/ORIGIN_VERIFY_SECRET" })
}

# ──────────── WAF Web ACL (CLOUDFRONT scope → us-east-1, same as l4.tf) ────────

resource "aws_wafv2_web_acl" "api" {
  provider = aws.use1

  name        = "${local.name_prefix}-api"
  description = "ADR 0005 Phase 2 - geo DE + rate limit in front of the API, CI/keepalive bypass, origin-secret header insertion"
  scope       = "CLOUDFRONT"

  # Priority 0: CI (Maestro on GitHub-hosted runners) and the VPC-link keepalive
  # Lambda are not in Germany and would otherwise be geo-blocked below. Both
  # send this header (keepalive.tf; .github/workflows/test-native-e2e.yml) —
  # matching it here, ahead of the geo rule, is what the ADR calls "simpler"
  # than allowlisting GitHub's rotating runner IP ranges. Terminating (ALLOW)
  # so a match never reaches the geo rule at all.
  rule {
    name     = "edge-bypass"
    priority = 0

    statement {
      byte_match_statement {
        search_string         = random_password.edge_bypass_secret.result
        positional_constraint = "EXACTLY"

        field_to_match {
          single_header {
            name = "x-edge-bypass"
          }
        }

        text_transformation {
          priority = 0
          type     = "NONE"
        }
      }
    }

    action {
      allow {
        custom_request_handling {
          insert_header {
            name  = "x-origin-verify"
            value = random_password.origin_verify_secret.result
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-api-edge-bypass"
      sampled_requests_enabled   = true
    }
  }

  # Priority 1: country-level only — never DE-BW. ISO 3166-2 subdivision
  # geolocation fails for German mobile carriers (Telekom/Vodafone/O2 route
  # subscriber traffic through central egress points), which would lock the
  # real dev team out intermittently with a 403 that looks nothing like a bug
  # in the app. See the ADR's "The accuracy problem" for the full reasoning —
  # region-level stays documented as an opt-in tightening, not the default.
  rule {
    name     = "geo-de-only"
    priority = 1

    statement {
      not_statement {
        statement {
          geo_match_statement {
            country_codes = ["DE"]
          }
        }
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-api-geo-block"
      sampled_requests_enabled   = true
    }
  }

  # Priority 2: same threshold as detection.tf's API Gateway flood alarm
  # (> 1000 in 5 min, ~3.3 rps sustained) — deliberate, so "too many requests"
  # means the same thing at the edge and at the alarm that watches what gets
  # past it.
  rule {
    name     = "rate-limit"
    priority = 2

    statement {
      rate_based_statement {
        limit                 = 1000
        evaluation_window_sec = 300
        aggregate_key_type    = "IP"
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-api-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Everything reaching here is from Germany and under the rate limit (or
  # matched the edge-bypass rule above, which inserts the same header itself
  # and never reaches this default action). Insert the header
  # requireOriginSecret checks for — a request that skipped this distribution
  # entirely (e.g. straight to origin.dev.bread-sheet.com) never carries it.
  default_action {
    allow {
      custom_request_handling {
        insert_header {
          name  = "x-origin-verify"
          value = random_password.origin_verify_secret.result
        }
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-api"
    sampled_requests_enabled   = true
  }

  tags = local.tags
}

# ──────────── CloudFront Distribution ──────────────────────────────────────────

# AllViewerExceptHostHeader, not AllViewer: AWS's own docs call out API Gateway
# origins specifically here — they expect the Host header to carry the
# origin's own domain name, not the viewer's requested one, and forwarding the
# viewer's Host can break the origin. Excluding it does not affect
# Authorization or any other header; CloudFront substitutes the origin's
# domain_name automatically. Caching is fully disabled — this is a dynamic
# API, not a CDN of static assets like the images distribution in cloudfront.tf.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "api" {
  enabled = true
  comment = "${local.name_prefix} API (ADR 0005 Phase 2)"

  aliases = ["server.dev.bread-sheet.com"]

  origin {
    domain_name = aws_route53_record.origin.fqdn
    origin_id   = "api-origin"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  default_cache_behavior {
    target_origin_id         = "api-origin"
    viewer_protocol_policy   = "https-only"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    compress                 = true
  }

  restrictions {
    geo_restriction {
      # Geo-blocking lives in the WAF rule above (G-C), not here (G-A) — the
      # ADR is explicit that WAF-blocked requests are the ones documented as
      # exempt from the plan's usage allowance; a block from CloudFront's own
      # geo_restriction is "inference, not established fact" on that point.
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront_server.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  web_acl_id = aws_wafv2_web_acl.api.arn

  tags = local.tags
}
