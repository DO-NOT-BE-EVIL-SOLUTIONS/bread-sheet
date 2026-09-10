# ──────────── Billing Guardrail ───────────────────────────────────────────────
# Two notifications, deliberately:
#   ACTUAL >= 80%      caught after the fact, but unambiguous.
#   FORECASTED >= 100% the one that matters for per-request pricing — it fires
#                      mid-month on a trend, before the money is spent.

# ──────────── Alert Fan-Out (SNS) ─────────────────────────────────────────────
#
# The budget notifies an SNS topic rather than a list of literal addresses.
# AWS Budgets accepts only EMAIL or SNS subscribers — there is no IAM-principal
# subscriber, and IAM users have no email attribute for AWS to resolve.
#
# Routing through a topic buys three things:
#   * no address in the repo, and none in Terraform state;
#   * subscribers change without touching the budget or re-applying;
#   * other destinations (Chatbot/Slack, a Lambda) can subscribe later.
#
# Subscribe out of band — email subscriptions require a confirmation click that
# Terraform cannot perform, so an `aws_sns_topic_subscription` for a raw address
# would sit permanently "pending confirmation" in state:
#
#   aws sns subscribe --topic-arn <this topic> --protocol email \
#     --notification-endpoint you@example.com

resource "aws_sns_topic" "billing_alerts" {
  name = "${local.name_prefix}-billing-alerts"

  tags = merge(local.tags, { Name = "${local.name_prefix}-billing-alerts" })
}

data "aws_iam_policy_document" "billing_alerts" {
  statement {
    sid     = "AllowBudgetsToPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }

    resources = [aws_sns_topic.billing_alerts.arn]

    # Confused-deputy guard: only *our* account's budgets may publish here.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid     = "AllowCostAnomalyDetectionToPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["costalerts.amazonaws.com"]
    }

    resources = [aws_sns_topic.billing_alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }

  statement {
    sid     = "AllowCloudWatchAlarmsToPublish"
    effect  = "Allow"
    actions = ["SNS:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    resources = [aws_sns_topic.billing_alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "billing_alerts" {
  arn    = aws_sns_topic.billing_alerts.arn
  policy = data.aws_iam_policy_document.billing_alerts.json
}

resource "aws_budgets_budget" "monthly" {
  name         = "${local.name_prefix}-monthly"
  budget_type  = "COST"
  time_unit    = "MONTHLY"
  limit_amount = var.budget_limit_usd
  limit_unit   = "USD"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_sns_topic_arns = [aws_sns_topic.billing_alerts.arn]
  }

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "FORECASTED"
    subscriber_sns_topic_arns = [aws_sns_topic.billing_alerts.arn]
  }
}
