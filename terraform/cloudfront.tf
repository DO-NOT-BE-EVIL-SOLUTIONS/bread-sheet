# ──────────── ADR 0005 § L5 — CloudFront flat-rate Free plan over the image bucket ────

# s3.tf's old PublicReadAllowProcessed statement let image egress bypass every
# limiter in this stack (the gateway throttle, the app, auth — all of it) at
# $0.09/GB with no ceiling. This distribution, subscribed to CloudFront's
# flat-rate Free plan, replaces that with a structural $0: there is no
# per-request or per-GB meter to run at all, only a monthly usage allowance
# that (per AWS's own docs) degrades delivery rather than billing if exceeded.
#
# Terraform cannot subscribe a distribution to a flat-rate plan — confirmed
# against both the installed aws provider's schema (no `pricing_plan`
# argument on aws_cloudfront_distribution, no aws_pricingplanmanager_*
# resource in ~> 6.39) and AWS's docs, which say plan management is
# console / AWS CLI / PricingPlanManager-API only, not part of the CloudFront
# API this provider wraps. Terraform creates and wires everything the plan
# requires (OAC, an attached WAF Web ACL — mandatory, cannot be detached
# without reverting to pay-as-you-go); subscribing the resulting distribution
# to the Free plan is the one manual step left, same shape as the SNS email
# confirmation in detection.tf:
#
#   AWS Console → CloudFront → Distributions → (this distribution, see the
#   images_cdn_distribution_id output) → Manage Plan → Free.
#
# The distribution stays on pay-as-you-go pricing (effectively free at dev's
# volume, but NOT the hard $0-overage cap the ADR is after) until that step is
# done by hand.

resource "aws_cloudfront_origin_access_control" "images" {
  name                              = "${local.name_prefix}-images-oac"
  description                       = "OAC for the private images bucket (ADR 0005 L5)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# WAFv2 web ACLs for CloudFront (scope = CLOUDFRONT) only exist in the
# us-east-1 API regardless of which region the distribution actually serves
# from — the same constraint Cost Anomaly Detection hits in detection.tf,
# reusing the same aws.use1 provider alias. Empty rule set: the ADR's
# requirement is only that a Web ACL exists (the plan precondition), not that
# it filters anything on a read-only image CDN yet.
resource "aws_wafv2_web_acl" "images" {
  provider = aws.use1

  name        = "${local.name_prefix}-images"
  description = "Required by the CloudFront Free plan, ADR 0005 L5, empty rule set, nothing to filter yet."
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-images"
    sampled_requests_enabled   = true
  }

  tags = local.tags
}

# AWS-managed cache policy (long TTL, no per-request variation) rather than a
# hand-rolled one: processed/{uuid}.jpg objects are content-addressed and
# never mutated, so there is nothing to invalidate on and no cache key beyond
# the URL path.
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_cloudfront_distribution" "images" {
  enabled = true
  comment = "${local.name_prefix} product images (ADR 0005 L5)"

  origin {
    domain_name              = aws_s3_bucket.images.bucket_regional_domain_name
    origin_id                = "s3-images"
    origin_access_control_id = aws_cloudfront_origin_access_control.images.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-images"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # No custom domain — ASSET_BASE_URL moves to the distribution's own
  # *.cloudfront.net name (ecs.tf), so no ACM certificate is needed at all.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  web_acl_id = aws_wafv2_web_acl.images.arn

  tags = local.tags
}
