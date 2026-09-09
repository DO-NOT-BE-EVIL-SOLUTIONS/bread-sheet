// ADR 0005 L4 — GCP billing kill switch.
//
// Triggered by the Pub/Sub topic attached to `google_billing_budget.dev`'s
// `all_updates_rule` (detection.tf). Budget notifications are published
// several times a day regardless of spend — this function is a no-op on
// every one of them except the message that reports the account has
// actually gone over budget, at which point it detaches Cloud Billing from
// the project. That is the "everything else failed and nobody was looking"
// backstop: L2 bounds Gemini spend day to day, D raises the alarm within the
// hour, this is what fires if both of those were somehow bypassed.
//
// Detaching billing stops every Google service in the project immediately
// (Vertex/Gemini included) and is not something `terraform apply` undoes —
// re-attaching a billing account is a manual console/CLI step. This is
// deliberate: the point of L4 is to be a hard stop, not a soft one.
const { google } = require('googleapis');
const functions = require('@google-cloud/functions-framework');

const PROJECT_ID = process.env.GCP_PROJECT_ID;

function decodeBudgetNotification(cloudEvent) {
  const base64Data = cloudEvent.data?.message?.data;
  if (!base64Data) {
    throw new Error('Pub/Sub message carried no data field');
  }
  return JSON.parse(Buffer.from(base64Data, 'base64').toString('utf8'));
}

functions.cloudEvent('stopBilling', async (cloudEvent) => {
  let notification;
  try {
    notification = decodeBudgetNotification(cloudEvent);
  } catch (err) {
    // A malformed message is not something retrying fixes, and the trigger
    // is configured RETRY_POLICY_DO_NOT_RETRY anyway — log and stop.
    console.error('billing-killswitch: could not parse budget notification', {
      error: String(err),
      eventId: cloudEvent.id,
    });
    return;
  }

  const { costAmount, budgetAmount, budgetDisplayName, currencyCode } = notification;
  console.log('billing-killswitch: budget notification received', {
    budgetDisplayName,
    costAmount,
    budgetAmount,
    currencyCode,
  });

  if (typeof costAmount !== 'number' || typeof budgetAmount !== 'number') {
    console.error('billing-killswitch: notification missing costAmount/budgetAmount, cannot evaluate', {
      notification,
    });
    return;
  }

  // Budget notifications fire on a schedule, not just on threshold crossings
  // (per Google's own docs: "sent to the Pub/Sub topic multiple times per
  // day with the current status of your budget") — this comparison is what
  // turns that stream of updates into a single one-shot action.
  if (costAmount <= budgetAmount) {
    console.log('billing-killswitch: under budget, no action', { costAmount, budgetAmount });
    return;
  }

  if (!PROJECT_ID) {
    console.error('billing-killswitch: GCP_PROJECT_ID not configured — cannot detach billing');
    return;
  }

  console.warn('billing-killswitch: OVER BUDGET — detaching Cloud Billing', {
    budgetDisplayName,
    costAmount,
    budgetAmount,
    currencyCode,
    project: PROJECT_ID,
  });

  const auth = new google.auth.GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/cloud-billing',
      'https://www.googleapis.com/auth/cloud-platform',
    ],
  });
  const cloudbilling = google.cloudbilling({ version: 'v1', auth });

  // PUT https://cloudbilling.googleapis.com/v1/{name=projects/*}/billingInfo
  // An empty billingAccountName is how the API detaches billing from a project.
  await cloudbilling.projects.updateBillingInfo({
    name: `projects/${PROJECT_ID}`,
    requestBody: { billingAccountName: '' },
  });

  console.warn('billing-killswitch: billing detached', { project: PROJECT_ID });
});
