# ──────────── VPC Link Keepalive ──────────────────────────────────────────────
#
# A VPC link that carries no traffic for 60 days transitions to INACTIVE: API
# Gateway deletes its network interfaces and every request fails for the several
# minutes it takes to reprovision them. A private stage can plausibly be silent
# that long, so this is a correctness requirement rather than a nicety
# (ADR 0003, Negative Consequences).
#
# Why a Lambda rather than the EventBridge Scheduler rule the ADR sketched:
# Scheduler's universal targets invoke AWS API actions, not arbitrary HTTPS
# endpoints. Reaching a public URL needs either EventBridge API Destinations
# (which require a Connection with an auth scheme we do not want) or a function.
#
# The request must traverse the **custom domain**, not the task directly — it is
# traffic through the link that resets the 60-day clock.

data "archive_file" "vpclink_keepalive" {
  type        = "zip"
  output_path = "${path.module}/.build/vpclink-keepalive.zip"

  source {
    filename = "index.mjs"
    content  = <<-JS
      // Keeps the API Gateway VPC link out of its 60-day INACTIVE transition.
      // Throwing on a non-2xx makes a broken ingress visible as a Lambda error
      // metric, which is worth having now that the ALB health check is gone.
      export const handler = async () => {
        const url = process.env.KEEPALIVE_URL;
        const startedAt = Date.now();
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        const result = { url, status: res.status, elapsedMs: Date.now() - startedAt };
        console.log(JSON.stringify(result));
        if (!res.ok) throw new Error(`keepalive: $${url} returned $${res.status}`);
        return result;
      };
    JS
  }
}

resource "aws_iam_role" "lambda_keepalive" {
  name = "${local.name_prefix}-lambda-keepalive"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(local.tags, { Name = "${local.name_prefix}-lambda-keepalive" })
}

# Logs only. The function calls a public URL over the internet and touches no
# AWS resource, so it needs no VPC config and no further permissions.
resource "aws_iam_role_policy_attachment" "lambda_keepalive_basic" {
  role       = aws_iam_role.lambda_keepalive.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_function" "vpclink_keepalive" {
  function_name    = "${local.name_prefix}-vpclink-keepalive"
  role             = aws_iam_role.lambda_keepalive.arn
  filename         = data.archive_file.vpclink_keepalive.output_path
  source_code_hash = data.archive_file.vpclink_keepalive.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  timeout          = 20
  memory_size      = 128

  environment {
    variables = {
      KEEPALIVE_URL = "https://${aws_route53_record.server.fqdn}/"
    }
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-vpclink-keepalive" })
}

# Weekly is ample against a 60-day window and keeps invocations to ~52/year,
# comfortably inside the Lambda free tier.
resource "aws_cloudwatch_event_rule" "vpclink_keepalive" {
  name                = "${local.name_prefix}-vpclink-keepalive"
  description         = "Weekly request through the VPC link so it does not go INACTIVE"
  schedule_expression = "rate(7 days)"

  tags = merge(local.tags, { Name = "${local.name_prefix}-vpclink-keepalive" })
}

resource "aws_cloudwatch_event_target" "vpclink_keepalive" {
  rule      = aws_cloudwatch_event_rule.vpclink_keepalive.name
  target_id = "lambda"
  arn       = aws_lambda_function.vpclink_keepalive.arn
}

resource "aws_lambda_permission" "vpclink_keepalive" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.vpclink_keepalive.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.vpclink_keepalive.arn
}
