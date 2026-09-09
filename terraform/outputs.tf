output "rds_endpoint" {
  description = "RDS endpoint (host:port) for assembling DATABASE_URL."
  value       = aws_db_instance.main.endpoint
}

output "images_bucket" {
  description = "S3 bucket name for product images."
  value       = aws_s3_bucket.images.bucket
}

output "images_cdn_domain" {
  description = "CloudFront distribution domain serving product images (ADR 0005 L5) — this is ASSET_BASE_URL's host."
  value       = aws_cloudfront_distribution.images.domain_name
}

output "images_cdn_distribution_id" {
  description = <<-EOT
    CloudFront distribution ID for the images CDN. Terraform cannot subscribe
    it to the flat-rate Free plan (ADR 0005 L5) — no provider support exists
    for that yet. Do it once per stage, by hand:

      AWS Console → CloudFront → Distributions → this ID → Manage Plan → Free

    Until that step is done for a given stage, its distribution serves on
    ordinary pay-as-you-go CloudFront pricing — cheap at low volume, but not
    the hard $0-overage cap the ADR is actually after. Done for dev
    (2026-09-09). NOT done for prod when prod.tfvars is first applied — this
    is the second of the account's 3 Free plan slots, and the caveat in ADR
    0005 § L5 (degraded delivery over the allowance) needs re-deciding for a
    user-facing stage before subscribing, not silently reused from dev.
  EOT
  value       = aws_cloudfront_distribution.images.id
}

output "api_endpoint" {
  description = "API Gateway's default execute-api endpoint. DISABLED since ADR 0005 Phase 2 (disable_execute_api_endpoint = true, api-gateway.tf) — this URL 403s/refuses regardless of what it shows here. Kept only so the value is visible if execute-api ever needs re-enabling for direct-to-gateway debugging."
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "phase2_edge_bypass_secret" {
  description = <<-EOT
    ADR 0005 Phase 2: the X-Edge-Bypass header value CI must send to skip the
    DE-only geo restriction (GitHub-hosted runners are not in Germany). Not
    automatable from here — no GitHub provider is configured — copy it out by
    hand once:

      terraform output -raw phase2_edge_bypass_secret | gh secret set EDGE_BYPASS_SECRET

    .github/workflows/test-native-e2e.yml reads it as
    EXPO_PUBLIC_EDGE_BYPASS_SECRET: $${{ secrets.EDGE_BYPASS_SECRET }} (already wired).
    The VPC-link keepalive Lambda (keepalive.tf) gets the same value directly
    as a Terraform-managed env var — nothing to copy there.
  EOT
  value       = random_password.edge_bypass_secret.result
  sensitive   = true
}

output "server_url" {
  description = "Public URL of the server."
  value       = "https://${aws_route53_record.server.fqdn}"
}

output "ecs_cluster_name" {
  description = "ECS cluster name (used by CI deploy)."
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name (used by CI deploy)."
  value       = aws_ecs_service.server.name
}

output "task_execution_role_arn" {
  description = "ECS task execution role ARN."
  value       = aws_iam_role.ecs_execution.arn
}

output "task_role_arn" {
  description = "ECS task role ARN."
  value       = aws_iam_role.ecs_task.arn
}

output "deployer_role_arn" {
  description = "CI deployer role ARN (GitHub Actions assumes this)."
  value       = aws_iam_role.deployer.arn
}

output "route53_zone_id" {
  description = "Route 53 hosted zone ID for dev.bread-sheet.com."
  value       = aws_route53_zone.dev.zone_id
}

output "route53_nameservers" {
  description = "NS records to delegate from the parent zone."
  value       = aws_route53_zone.dev.name_servers
}

output "billing_alerts_topic_arn" {
  description = <<-EOT
    SNS topic the budget publishes to. Subscribers are added out of band so no
    address lands in the repo or in Terraform state:

      aws sns subscribe --topic-arn <this> --protocol email \
        --notification-endpoint you@example.com

    Then confirm via the emailed link — until that is done the subscription is
    pending and nothing is delivered.
  EOT
  value       = aws_sns_topic.billing_alerts.arn
}
