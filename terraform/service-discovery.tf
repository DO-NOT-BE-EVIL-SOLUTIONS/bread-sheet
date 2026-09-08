# ──────────── Cloud Map Namespace ─────────────────────────────────────────────
# Replaces the ALB's target registration. With `awsvpc` every task gets a fresh
# ENI and private IP on each deploy.
# A private DNS namespace creates a Route 53 *private* hosted zone.

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${local.name_prefix}.local"
  description = "Service discovery for ${local.name_prefix} — API Gateway resolves tasks through this"
  vpc         = aws_vpc.main.id

  tags = local.tags
}

# ──────────── Cloud Map Service ───────────────────────────────────────────────

resource "aws_service_discovery_service" "server" {
  name = "server"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    # SRV, not A. API Gateway resolves instances via DiscoverInstances and needs
    # both IP *and* port (A record carries no port)
    dns_records {
      type = "SRV"
      ttl  = 15
    }

    routing_policy = "MULTIVALUE"
  }

  # ECS is the health authority, not Cloud Map: Route 53 health checks do not
  # work against a private hosted zone, so ECS reports task health in and
  # DiscoverInstances only returns healthy instances.
  #
  # `failure_threshold` is deprecated and ignored by AWS (always treated as 1),
  # but it must be set anyway: an empty block sends nothing, AWS then creates the
  # service with HealthCheckCustomConfig = null, the read returns null, and every
  # subsequent plan tries to add the block again — which forces replacement and
  # recreates the same nothing. Setting it makes the block round-trip. The
  # deprecation warning is the cost of a config that converges.
  health_check_custom_config {
    failure_threshold = 1
  }

  tags = local.tags
}