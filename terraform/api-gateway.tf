
resource "aws_apigatewayv2_api" "main" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  # Deliberately no cors_configuration — Express owns CORS (app.ts:21,
  # `cors({ origin: ALLOWED_ORIGINS, credentials: true })`). Setting it here
  # makes API Gateway answer preflights itself and override the backend's
  # headers, which would silently stop ALLOWED_ORIGINS being the source of truth.

  tags = local.tags
}

resource "aws_apigatewayv2_vpc_link" "main" {
  name               = "${local.name_prefix}-vpclink"
  subnet_ids         = [for s in aws_subnet.public : s.id]
  security_group_ids = [aws_security_group.vpclink.id]

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "server" {
  api_id             = aws_apigatewayv2_api.main.id
  integration_type   = "HTTP_PROXY"
  integration_method = "ANY"
  connection_type    = "VPC_LINK"
  connection_id      = aws_apigatewayv2_vpc_link.main.id
  integration_uri    = aws_service_discovery_service.server.arn
  timeout_milliseconds = 30000
}

resource "aws_apigatewayv2_route" "proxy" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.server.id}"
}

# ──────────── API Gateway Stage ───────────────────────────────────────────────

# HTTP APIs deliver access logs through CloudWatch's vended-log-delivery path,
# which manages its own resource policy — so unlike REST APIs there is no
# account-level `aws_api_gateway_account` CloudWatch role to provision here.
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/${local.name_prefix}-api"
  retention_in_days = 1

  tags = merge(local.tags, { Name = "${local.name_prefix}-apigw-log-group" })
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # One JSON line per request. `integrationStatus` + `integrationErrorMessage`
  # are the only place a VPC Link / Cloud Map failure shows up — when the
  # integration never reaches the task, the client just sees a bare 503 and the
  # ECS log group has nothing at all.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId               = "$context.requestId"
      ip                      = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      path                    = "$context.path"
      routeKey                = "$context.routeKey"
      status                  = "$context.status"
      protocol                = "$context.protocol"
      responseLength          = "$context.responseLength"
      responseLatency         = "$context.responseLatency"
      integrationStatus       = "$context.integration.status"
      integrationLatency      = "$context.integration.latency"
      integrationErrorMessage = "$context.integrationErrorMessage"
      userAgent               = "$context.identity.userAgent"
    })
  }
}

resource "aws_apigatewayv2_api_mapping" "server" {
  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.server.id
  stage       = aws_apigatewayv2_stage.default.id
}

# ──────────── API Gateway Custom Domain ───────────────────────────────────────

resource "aws_apigatewayv2_domain_name" "server" {
  domain_name = "server.dev.bread-sheet.com"

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.server.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = merge(local.tags, { Name = "server.dev.bread-sheet.com" })
}