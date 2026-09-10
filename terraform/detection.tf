# ──────────── AWS Cost Anomaly Detection ───────────────────────────────────────
# Account-level monitor on AWS_SERVICES (a step change in any AWS line item,
# including ones this ADR did not think of) — free. Cost Explorer's anomaly
# detection API is only reachable via the us-east-1 endpoint regardless of
# which region the monitored resources run in, hence the aliased provider.
#
# AWS allows exactly one DIMENSIONAL/SERVICE monitor per account, and this one
# already existed — "Default-Services-Monitor", auto-created the first time
# Cost Anomaly Detection was opened in the console, predating this stack. It is
# imported (`terraform import aws_ce_anomaly_monitor.aws_services <arn>`)
# rather than created; the name below is pinned to the pre-existing value so
# adopting it into state is a no-op, not a rename. It already carries an
# unrelated "Default-Services-Subscription" (a personal $100/40%-threshold
# email alert) — untouched. The subscription below is a second, additional
# subscription on the same monitor at a much lower threshold, routed to
# billing_alerts instead of a personal inbox.
resource "aws_ce_anomaly_monitor" "aws_services" {
  provider = aws.use1

  name              = "Default-Services-Monitor"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"

  tags = local.tags
}

resource "aws_ce_anomaly_subscription" "aws_services" {
  provider = aws.use1

  name = "${local.name_prefix}-aws-services"
  frequency = "IMMEDIATE"

  monitor_arn_list = [aws_ce_anomaly_monitor.aws_services.arn]

  subscriber {
    type    = "SNS"
    address = aws_sns_topic.billing_alerts.arn
  }

  # Low absolute threshold, deliberately — this dev stage's normal spend is
  # small enough that a small anomaly is still meaningful.
  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      values        = ["5"]
      match_options = ["GREATER_THAN_OR_EQUAL"]
    }
  }

  tags = local.tags
}

# ──────────── CloudWatch: API Gateway request flood ────────────────────────────

resource "aws_cloudwatch_metric_alarm" "api_gateway_flood" {
  alarm_name          = "${local.name_prefix}-apigw-request-flood"
  alarm_description   = "ADR 0005 D — API Gateway Count > 1000 in 5 min (~3.3 rps sustained). Includes throttled requests."
  namespace           = "AWS/ApiGateway"
  metric_name         = "Count"
  dimensions          = { ApiId = aws_apigatewayv2_api.main.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 1000
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.billing_alerts.arn]
  ok_actions    = [aws_sns_topic.billing_alerts.arn]

  tags = local.tags
}

# ──────────── CloudWatch: Gemini call volume ────────────────────────────────────
# No application change: the server's structured `request:finish` log line
# (requestLogger.ts) already carries `path` for every request, in JSON (the
# task runs NODE_ENV=production — ecs.tf). This filter is what turns "how many
# Gemini calls in the last hour" into an alarm ahead of L2's daily counter.

resource "aws_cloudwatch_log_metric_filter" "gemini_calls" {
  name           = "${local.name_prefix}-gemini-calls"
  log_group_name = aws_cloudwatch_log_group.server.name

  pattern = "{ ($.message = \"request:finish\") && ($.path = \"/api/products/upload-image\" || $.path = \"/api/products/extract-label\") }"

  metric_transformation {
    name          = "GeminiCalls"
    namespace     = "Breadsheet/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "gemini_calls_high" {
  alarm_name          = "${local.name_prefix}-gemini-calls-high"
  alarm_description   = "ADR 0005 D — more than 50 Gemini-path requests (upload-image + extract-label) in an hour, ahead of L2's daily cap."
  namespace           = aws_cloudwatch_log_metric_filter.gemini_calls.metric_transformation[0].namespace
  metric_name         = aws_cloudwatch_log_metric_filter.gemini_calls.metric_transformation[0].name
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 50
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.billing_alerts.arn]
  ok_actions    = [aws_sns_topic.billing_alerts.arn]

  tags = local.tags
}

# ──────────── GCP budget alert ──────────────────────────────────────────────────
# The Google bill is invisible to every AWS control above.

resource "google_project_service" "billingbudgets" {
  project = var.gcp_project
  service = "billingbudgets.googleapis.com"

  disable_on_destroy = false
}

resource "google_billing_budget" "dev" {
  billing_account = var.gcp_billing_account
  display_name    = "${local.name_prefix}-gemini-budget"

  budget_filter {
    # Project *number*, not project ID — the Cloud Billing Budgets API requires
    # this form. 1054240616692 is breadsheet-496522, the same literal already
    # used in gcp-wif.tf / ecs.tf's GCP_WORKLOAD_IDENTITY_AUDIENCE.
    projects = ["projects/1054240616692"]
  }

  amount {
    specified_amount {
      # This billing account's currency is EUR (`gcloud billing accounts
      # describe 01E7A9-4D7E3E-165061` → currencyCode: EUR) — the Budgets API
      # rejects a mismatched currency_code with a bare 400 "invalid argument"
      # and no field-level detail, which is what the first apply attempt hit.
      currency_code = "EUR"
      units         = "40"
    }
  }

  threshold_rules {
    threshold_percent = 0.05 # €2
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.125 # €5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.25 # €10
    spend_basis       = "CURRENT_SPEND"
  }

  # This is "detach billing" — deliberately at 100%
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  # Second notification channel alongside the default email recipients
  all_updates_rule {
    pubsub_topic = google_pubsub_topic.billing_killswitch.id
  }

  depends_on = [google_project_service.billingbudgets, google_project_service.pubsub]
}
