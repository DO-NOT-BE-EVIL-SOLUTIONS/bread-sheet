# ──────────── ADR 0005 § L4 — Backstops ────────────────────────────────────────
#
# "Everything else failed and nobody was looking" tier. L2 bounds Gemini spend
# per day, D raises an alarm within the hour — L4 is what fires if both of
# those were somehow bypassed or misconfigured, which is why its trigger sits
# above both: 100% of the same €40/$40 budget D's other thresholds are
# fractions of (detection.tf), well above L2's ~$32.40/mo undetected ceiling.
#
# Two independent halves, one per vendor: L4 does not touch AWS from the GCP
# side or vice versa — each card gets its own hard stop.

# ═══════════════════════════ AWS side — stop RDS ═══════════════════════════════
#
# A `RUN_SSM_DOCUMENTS` budget action targeting the RDS instance. This is
# cheap insurance, not a real defence (ADR 0005 § Negative Consequences: RDS's
# pricing is flat, so it's rarely the actual runaway) — the AWS side's real
# stop is L1's stage throttle. `AUTOMATIC` approval because a backstop nobody
# has to click through isn't a backstop.

resource "aws_iam_role" "budget_action_ssm" {
  name = "${local.name_prefix}-budget-action-ssm"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "budgets.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = merge(local.tags, { Name = "${local.name_prefix}-budget-action-ssm" })
}

# AWS-managed policy scoped exactly to this use case: EC2/RDS start-stop
# conditioned on `aws:CalledVia = ssm.amazonaws.com`, plus StartAutomationExecution
# on the four AWS-owned Start/Stop{EC2,Rds}Instance documents. No custom inline
# policy needed — see docs/architecture/infrastructure.md § L4 backstops for the
# full policy this attaches, quoted from AWS's own docs.
resource "aws_iam_role_policy_attachment" "budget_action_ssm" {
  role       = aws_iam_role.budget_action_ssm.name
  policy_arn = "arn:aws:iam::aws:policy/AWSBudgetsActions_RolePolicyForResourceAdministrationWithSSM"
}

resource "aws_budgets_budget_action" "stop_rds" {
  budget_name        = aws_budgets_budget.monthly.name
  action_type        = "RUN_SSM_DOCUMENTS"
  approval_model     = "AUTOMATIC"
  notification_type  = "ACTUAL"
  execution_role_arn = aws_iam_role.budget_action_ssm.arn

  # 150% of budget_limit_usd (var, default 45) — deliberately above the 80%/
  # FORECASTED-100% notifications in budget.tf, which are "tell a person" not
  # "take an action". This tier only fires once those have already been
  # ignored for a while.
  action_threshold {
    action_threshold_type  = "PERCENTAGE"
    action_threshold_value = 150
  }

  definition {
    ssm_action_definition {
      action_sub_type = "STOP_RDS_INSTANCES"
      instance_ids    = [aws_db_instance.main.identifier]
      region          = var.aws_region
    }
  }

  # Same topic every other AWS-side alert in this ADR uses (budget.tf already
  # grants budgets.amazonaws.com publish rights on it).
  subscriber {
    address           = aws_sns_topic.billing_alerts.arn
    subscription_type = "SNS"
  }
}

# ═══════════════════════════ GCP side — detach billing ═════════════════════════
#
# GCP budget (detection.tf, google_billing_budget.dev) → Pub/Sub → this Cloud
# Function → cloudbilling.projects.updateBillingInfo with an empty
# billingAccountName. Detaching billing stops every Google service in the
# project immediately (Vertex/Gemini included); nothing here reverses it —
# re-attaching a billing account is a manual step, deliberately, since the
# whole point of this layer is a hard stop rather than a soft one.

data "google_project" "current" {
  project_id = var.gcp_project
}

# `var.gcp_location` is "global" in dev.tfvars — correct for Vertex AI model
# routing (infrastructure.md § the GOOGLE_CLOUD_LOCATION fix), but "global" is
# not a real GCS/Cloud Functions/Eventarc region and every one of those
# rejects it outright. This function's resources need an actual region, so
# they get their own, independent of Vertex's location choice.
locals {
  l4_function_region = "europe-west1"
}

resource "google_project_service" "cloudbilling" {
  project            = var.gcp_project
  service            = "cloudbilling.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "pubsub" {
  project            = var.gcp_project
  service            = "pubsub.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudfunctions" {
  project            = var.gcp_project
  service            = "cloudfunctions.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "run" {
  project            = var.gcp_project
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "eventarc" {
  project            = var.gcp_project
  service            = "eventarc.googleapis.com"
  disable_on_destroy = false
}

# Gen2 functions build via Cloud Build and push the built image to Artifact
# Registry — not obvious from the "required APIs" list Google's own docs give
# for this tutorial, which stops at cloudfunctions/run/eventarc/pubsub.
resource "google_project_service" "cloudbuild" {
  project            = var.gcp_project
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  project            = var.gcp_project
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_pubsub_topic" "billing_killswitch" {
  project = var.gcp_project
  name    = "${local.name_prefix}-billing-killswitch"

  depends_on = [google_project_service.pubsub]
}

resource "google_service_account" "billing_killswitch" {
  project      = var.gcp_project
  account_id   = "${local.name_prefix}-billing-stop"
  display_name = "ADR 0005 L4 billing kill switch (Cloud Function identity)"
}

# The one genuinely dangerous grant in this whole ADR: this SA can detach
# billing from ANY project under this billing account, not just gcp_project.
# There is no narrower standard role — GCP's billing detach API requires
# billing-account-level roles/billing.admin (or project ownership), and the
# function's own logic (index.js) is what keeps this scoped in practice: it
# only ever acts on GCP_PROJECT_ID (the environment variable set below), and
# only past its no-op check.
resource "google_billing_account_iam_member" "killswitch_admin" {
  billing_account_id = var.gcp_billing_account
  role               = "roles/billing.admin"
  member             = "serviceAccount:${google_service_account.billing_killswitch.email}"
}

# Lets this SA act as the Cloud Build worker for its own function's build
# (build_config.service_account above) — logging, pulling the uploaded
# source, and pushing the built image to Artifact Registry.
resource "google_project_iam_member" "killswitch_cloudbuild_builder" {
  project = var.gcp_project
  role    = "roles/cloudbuild.builds.builder"
  member  = "serviceAccount:${google_service_account.billing_killswitch.email}"
}

# Required for a Pub/Sub-triggered gen2 function running as a non-default SA:
# Eventarc needs the trigger identity to be able to receive events, and (via
# the underlying Cloud Run service Eventarc creates) the Pub/Sub push
# subscription needs to invoke it.
resource "google_project_iam_member" "killswitch_eventarc_receiver" {
  project = var.gcp_project
  role    = "roles/eventarc.eventReceiver"
  member  = "serviceAccount:${google_service_account.billing_killswitch.email}"
}

# The Pub/Sub service agent mints the identity tokens the push subscription
# uses to invoke the function's Cloud Run service — it needs permission to
# impersonate the trigger's own service account to do that. Missing this is a
# well-known way for a gen2 Pub/Sub trigger to silently never deliver.
resource "google_service_account_iam_member" "pubsub_agent_token_creator" {
  service_account_id = google_service_account.billing_killswitch.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_storage_bucket" "functions_source" {
  project                     = var.gcp_project
  name                        = "${var.gcp_project}-functions-source"
  location                    = upper(local.l4_function_region)
  uniform_bucket_level_access = true
  force_destroy               = true
}

data "archive_file" "billing_killswitch" {
  type        = "zip"
  source_dir  = "${path.module}/functions/billing-killswitch"
  output_path = "${path.module}/functions/billing-killswitch.zip"
}

resource "google_storage_bucket_object" "billing_killswitch" {
  bucket = google_storage_bucket.functions_source.name
  # Content-addressed name so a source change forces a new object, which
  # forces the function's build_config.source to change, which forces a
  # redeploy — a static name would let the function silently keep running
  # stale code after a source edit.
  name   = "billing-killswitch-${data.archive_file.billing_killswitch.output_md5}.zip"
  source = data.archive_file.billing_killswitch.output_path
}

resource "google_cloudfunctions2_function" "billing_killswitch" {
  project  = var.gcp_project
  name     = "${local.name_prefix}-billing-killswitch"
  location = local.l4_function_region

  build_config {
    runtime     = "nodejs22"
    entry_point = "stopBilling"
    # As of a recent GCP org-policy change the default Compute Engine SA no
    # longer gets Editor auto-granted on new projects, and Cloud Build's gen2
    # function builds use it unless told otherwise — the first apply attempt
    # here failed with "missing permission on the build service account"
    # because of exactly that. Using the killswitch SA (already granted
    # cloudbuild.builds.builder below) instead of the default compute SA
    # keeps this scoped to one purpose-built identity rather than widening
    # the shared default SA used project-wide for unrelated things.
    service_account = "projects/${var.gcp_project}/serviceAccounts/${google_service_account.billing_killswitch.email}"

    source {
      storage_source {
        bucket = google_storage_bucket.functions_source.name
        object = google_storage_bucket_object.billing_killswitch.name
      }
    }
  }

  service_config {
    # This function does one thing, rarely, and must never run concurrent
    # instances against the same budget notification stream.
    max_instance_count               = 1
    max_instance_request_concurrency = 1
    available_memory                 = "256M"
    timeout_seconds                  = 60
    service_account_email            = google_service_account.billing_killswitch.email

    environment_variables = {
      GCP_PROJECT_ID = var.gcp_project
    }
  }

  event_trigger {
    trigger_region        = local.l4_function_region
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = google_pubsub_topic.billing_killswitch.id
    service_account_email = google_service_account.billing_killswitch.email
    # A malformed or duplicate delivery is not something retrying fixes (the
    # function already treats "under budget" as a no-op), and there is no
    # value in Eventarc retrying a detach that already happened.
    retry_policy = "RETRY_POLICY_DO_NOT_RETRY"
  }

  depends_on = [
    google_project_service.cloudfunctions,
    google_project_service.run,
    google_project_service.eventarc,
    google_project_service.pubsub,
    google_project_service.cloudbilling,
    google_project_service.cloudbuild,
    google_project_service.artifactregistry,
    google_service_account_iam_member.pubsub_agent_token_creator,
    google_project_iam_member.killswitch_cloudbuild_builder,
  ]
}

# The Pub/Sub push subscription Eventarc creates invokes the function's
# underlying Cloud Run service directly — the trigger SA needs run.invoker on
# that specific service, not just the project-level eventarc role above.
resource "google_cloud_run_v2_service_iam_member" "killswitch_invoker" {
  project  = var.gcp_project
  location = local.l4_function_region
  name     = google_cloudfunctions2_function.billing_killswitch.service_config[0].service
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.billing_killswitch.email}"
}
