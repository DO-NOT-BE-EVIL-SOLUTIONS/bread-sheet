# ──────────── S3 Images Bucket ─────────────────────────────────────────────────

resource "aws_s3_bucket" "images" {
  bucket = var.s3_bucket_name

  tags = merge(local.tags, { Name = var.s3_bucket_name })
}

resource "aws_s3_bucket_ownership_controls" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "images" {
  bucket = aws_s3_bucket.images.id

  # ADR 0005 L5: the bucket has no public policy statement at all any more —
  # only the CloudFront distribution in cloudfront.tf can read it, via OAC.
  # Blocking public policies/ACLs outright means nothing can silently reopen
  # this bucket to the internet without also removing this block.
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id

  # ADR 0005 L5: replaces the old Principal:"*" statement (unbounded, no-limit
  # image egress at $0.09/GB) with one scoped to the CloudFront distribution's
  # OAC identity via aws:SourceArn — the same pattern AWS uses for every
  # OAC-fronted bucket. Direct S3 URLs now 403; only requests that go through
  # cloudfront.tf's distribution (and therefore its Free-plan allowance and
  # attached WAF) can read an object.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipalReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.images.arn}/processed/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.images.arn
        }
      }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.images]
}

resource "aws_s3_bucket_cors_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
  }
}