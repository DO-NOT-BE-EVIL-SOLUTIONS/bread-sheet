#!/usr/bin/env node
/**
 * ADR 0003 § Implementation step 0b — measure the two synchronous Gemini paths
 * against the timeout budget from step 0a.
 *
 * There is no p99 to read out of CloudWatch: `dev` serves no traffic and a
 * private prod will not either. So this fires a synthetic batch of worst-case
 * requests serially and reports the distribution and, more importantly, the
 * budget breach rate.
 *
 * Note what step 0a did to this measurement: a call that would have taken 24 s
 * is now aborted at 20 s and returns `503 { code: 'upstream_timeout' }`. The raw
 * tail is no longer observable — and does not need to be. The question is
 * whether the budget holds. If it does not, raise GEMINI_CALL_TIMEOUT_MS on the
 * server, redeploy, and re-run to find where the real tail sits.
 *
 * Usage:
 *   BASE_URL=$(cd terraform && terraform output -raw server_url) \
 *   ACCESS_TOKEN=<supabase jwt> \
 *   node scripts/measure-gemini-latency.mjs --n 30 --image ./label.jpg
 *
 * Instead of ACCESS_TOKEN you may let the script sign in for you: `npm run
 * measure:gemini` loads `server/.env`, which already carries SUPABASE_URL and
 * SUPABASE_PUBLISHABLE_DEFAULT_KEY, so you only add TEST_EMAIL + TEST_PASSWORD.
 * The account must be REGISTERED — `POST /products/extract-label` is behind
 * `requireRegistered` and an anonymous token gets a 403 on every request.
 *
 * Against a local container this is the whole invocation:
 *   BASE_URL=http://localhost:3000 TEST_EMAIL=... TEST_PASSWORD=... \
 *     npm run measure:gemini -- --n 30
 *
 * A local run measures the Gemini round-trip, which dominates — but not Vertex
 * via WIF, not 0.25 vCPU Fargate, and not the AWS→GCP egress path. Treat the
 * result as a floor, not the number.
 *
 * Server preconditions (the script cannot verify these — check them yourself):
 *   PLAUSIBILITY_MODE=gemini   otherwise upload-image returns the mock verdict instantly
 *   VISION_MODE=llm            otherwise extract-label goes through Vision OCR, not Gemini
 */
import { readFile, writeFile } from 'node:fs/promises';
import { argv, env, exit } from 'node:process';
import sharp from 'sharp';

const LONGEST_EDGE = 1600; // MAX_LABEL_IMAGE_LONGEST_EDGE
const CLIENT_MAX_BYTES = 2 * 1024 * 1024; // MAX_IMAGE_BYTES
const GEMINI_BUDGET_MS = 20_000; // GEMINI_CALL_TIMEOUT_MS
const API_GATEWAY_CEILING_MS = 30_000;
const API_LIMITER_QUOTA = 100; // apiLimiter: 100 req / 15 min

function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}

const BASE_URL = (arg('base-url', env.BASE_URL) ?? '').replace(/\/$/, '');
const N = Number(arg('n', '30'));
const ONLY = arg('only'); // extract-label | upload-image
const IMAGE_PATH = arg('image');

if (!BASE_URL) {
  console.error('Missing --base-url (or BASE_URL). Try:');
  console.error('  BASE_URL=$(cd terraform && terraform output -raw server_url)');
  exit(2);
}

async function getToken() {
  if (env.ACCESS_TOKEN) return env.ACCESS_TOKEN;

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_DEFAULT_KEY, TEST_EMAIL, TEST_PASSWORD } = env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_DEFAULT_KEY || !TEST_EMAIL || !TEST_PASSWORD) {
    console.error(
      'Need ACCESS_TOKEN, or SUPABASE_URL + SUPABASE_PUBLISHABLE_DEFAULT_KEY + TEST_EMAIL + TEST_PASSWORD.',
    );
    exit(2);
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_DEFAULT_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  if (!res.ok) {
    console.error(`Supabase sign-in failed: ${res.status} ${await res.text()}`);
    exit(2);
  }
  return (await res.json()).access_token;
}

/**
 * Worst-case input: 1600 px longest edge, as close to the 2 MB client cap as the
 * encoder will get. A real label photo is preferred — pass --image. The
 * generated fallback is high-entropy noise, which is worst-case for JPEG size
 * but not for what the model has to reason about.
 */
async function buildImage() {
  const encode = (pipeline, quality) => pipeline.jpeg({ quality }).toBuffer();

  // Step quality down until the result fits the cap a real client could send.
  // Noise at q92 lands around 2.2 MB, which no client could ever produce.
  async function fit(makePipeline, source) {
    let last;
    for (const quality of [92, 85, 75, 65, 55, 45]) {
      last = await encode(makePipeline(), quality);
      if (last.length <= CLIENT_MAX_BYTES) return { buf: last, source: `${source} @ q${quality}` };
    }
    return { buf: last, source: `${source} (could not fit under the client cap)` };
  }

  if (IMAGE_PATH) {
    const input = await readFile(IMAGE_PATH);
    return fit(
      () =>
        sharp(input).resize(LONGEST_EDGE, LONGEST_EDGE, {
          fit: 'inside',
          withoutEnlargement: true,
        }),
      IMAGE_PATH,
    );
  }

  const noise = Buffer.alloc(LONGEST_EDGE * LONGEST_EDGE * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 256);
  return fit(
    () => sharp(noise, { raw: { width: LONGEST_EDGE, height: LONGEST_EDGE, channels: 3 } }),
    'generated noise (pass --image for a real label photo)',
  );
}

async function fire(endpoint, image, token) {
  const form = new FormData();
  form.append('image', new Blob([image], { type: 'image/jpeg' }), 'label.jpg');
  if (endpoint === 'upload-image') form.append('kind', 'label');

  const startedAt = performance.now();
  let status = 0;
  let code;
  try {
    const res = await fetch(`${BASE_URL}/api/products/${endpoint}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    status = res.status;
    const body = await res.text();
    try {
      code = JSON.parse(body).code ?? JSON.parse(body).error;
    } catch {
      code = undefined;
    }
  } catch (err) {
    code = `transport: ${err.message}`;
  }
  return { ms: Math.round(performance.now() - startedAt), status, code };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

function report(endpoint, runs) {
  const breaches = runs.filter((r) => r.code === 'upstream_timeout');
  const handlerTimeouts = runs.filter((r) => r.code === 'request_timeout');
  const throttled = runs.filter((r) => r.status === 429);
  // A run is usable when the Gemini round-trip actually happened:
  //   200                    the model answered and the handler completed
  //   422 image_rejected     the model answered not_a_product/unusable/abuse.
  //                          That verdict is produced AFTER the call returns,
  //                          so the timing is a real measurement — but see the
  //                          fast-path warning below.
  //   503 upstream_timeout   our own budget aborted the call: the signal we came for
  //   503 request_timeout    the outer handler deadline
  // Everything else — 403, 415, a connection refused, someone else's 500 — carries
  // no timing signal and must never be averaged in or mistaken for a passing run.
  const rejected = runs.filter((r) => r.status === 422 && r.code === 'image_rejected');
  const usable = runs.filter(
    (r) =>
      r.status === 200 ||
      (r.status === 422 && r.code === 'image_rejected') ||
      r.code === 'upstream_timeout' ||
      r.code === 'request_timeout',
  );
  const bad = runs.filter((r) => !usable.includes(r));

  const ms = usable.map((r) => r.ms).sort((a, b) => a - b);

  console.log(`\n── ${endpoint} ──────────────────────────────`);
  console.log(`  requests     ${runs.length}  (${usable.length} usable, ${bad.length} discarded)`);
  if (ms.length) {
    console.log(`  cold (1st)   ${runs[0].ms} ms  [${runs[0].status}]`);
    console.log(`  min          ${ms[0]} ms`);
    console.log(`  median       ${pct(ms, 50)} ms`);
    console.log(`  p90          ${pct(ms, 90)} ms`);
    console.log(`  max          ${ms[ms.length - 1]} ms`);
  } else {
    console.log('  no usable timings — every request failed');
  }
  console.log(`  budget breaches (503 upstream_timeout)       ${breaches.length}`);
  console.log(`  handler deadline hits (503 request_timeout)  ${handlerTimeouts.length}`);
  if (throttled.length) {
    console.log(`  ⚠ rate-limited (429)  ${throttled.length} — apiLimiter is ${API_LIMITER_QUOTA}/15min`);
  }
  if (bad.length) {
    console.log(`  ⚠ discarded  ${bad.length}:`);
    for (const r of bad.slice(0, 3)) console.log(`      ${r.status} ${r.code ?? ''}`.trimEnd());
    if (bad.length > 3) console.log(`      … and ${bad.length - 3} more`);
  }

  if (rejected.length && rejected.length === usable.length) {
    console.log('  ⚠ every image was REJECTED by the gate. That is the fast path: the model');
    console.log('    returns a short verdict, skips the name/brand extraction, and the handler');
    console.log('    skips sharp + the S3 write. Treat these numbers as a lower bound and');
    console.log('    re-run with --image <a real label photo>.');
  }

  return {
    endpoint,
    usable: usable.length,
    allRejected: rejected.length > 0 && rejected.length === usable.length,
    max: ms.length ? ms[ms.length - 1] : null,
    breaches: breaches.length + handlerTimeouts.length,
    throttled: throttled.length,
    bad: bad.length,
  };
}

function verdict(results) {
  const breaches = results.reduce((n, r) => n + r.breaches, 0);
  const throttled = results.reduce((n, r) => n + r.throttled, 0);
  const bad = results.reduce((n, r) => n + r.bad, 0);
  const maxima = results.map((r) => r.max).filter((m) => m !== null);
  const max = maxima.length ? Math.max(...maxima) : null;

  console.log('\n══ verdict (ADR 0003 § step 0b) ══════════');

  if (throttled) {
    console.log('  INCONCLUSIVE — requests were rate-limited. apiLimiter allows');
    console.log(`  ${API_LIMITER_QUOTA} req/15min; wait out the window or lower --n, then re-run.`);
    return 1;
  }
  if (bad) {
    console.log(`  INCONCLUSIVE — ${bad} request(s) produced no timing (see discarded above).`);
    console.log('  Check the base URL, the token (extract-label needs a REGISTERED account),');
    console.log('  and that the stage is actually up. A partial sample is not a measurement.');
    return 1;
  }
  if (results.some((r) => r.usable === 0)) {
    console.log('  INCONCLUSIVE — no usable timings at all.');
    return 1;
  }
  if (breaches > 0) {
    console.log(`  BUDGET BREACHED on ${breaches} request(s).`);
    console.log('  The true tail is no longer observable from here — the call was aborted at');
    console.log(`  ${GEMINI_BUDGET_MS / 1000}s. Raise GEMINI_CALL_TIMEOUT_MS (22s / 25s), redeploy, re-run.`);
    console.log(`  If it still breaches near ${API_GATEWAY_CEILING_MS / 1000}s, the synchronous design is what`);
    console.log('  fails: make the plausibility gate async, or fall back to I-E (Cloudflare Tunnel).');
    return 1;
  }
  if (max < GEMINI_BUDGET_MS * 0.75) {
    console.log(`  PASS — the ${GEMINI_BUDGET_MS / 1000}s budget held on every request (max ${max} ms).`);
    if (results.some((r) => r.allRejected)) {
      console.log('  ...but every image took the rejection fast path, so this is a lower bound,');
      console.log('  not the worst case ADR step 0b asks for. Re-run with a real label photo');
      console.log('  before treating the gate as cleared.');
      return 1;
    }
    console.log('  Proceed with ADR steps 1–7.');
    return 0;
  }
  console.log(`  MARGINAL — max ${max} ms is inside the budget but within 25% of it.`);
  console.log('  Re-run before deciding; consider the async rework regardless.');
  return 1;
}

const endpoints = ONLY ? [ONLY] : ['extract-label', 'upload-image'];

// apiLimiter is IP-keyed at 100 req / 15 min and the window is rolling, so a
// re-run inside 15 minutes shares a budget with the previous one. Refuse to
// start a batch that cannot finish rather than discovering it at request 21.
const planned = N * endpoints.length;
if (planned > API_LIMITER_QUOTA * 0.8) {
  console.error(
    `Planned ${planned} requests (${N} x ${endpoints.length} endpoints) against a ` +
      `${API_LIMITER_QUOTA} req/15min limit.`,
  );
  console.error(
    `Use --n ${Math.floor((API_LIMITER_QUOTA * 0.8) / endpoints.length)} or lower, ` +
      'or run one endpoint at a time with --only. Remember earlier runs still ' +
      'occupy the same rolling window.',
  );
  exit(2);
}

const token = await getToken();
const { buf: image, source } = await buildImage();

console.log(`base url   ${BASE_URL}`);
console.log(`image      ${image.length} bytes, ${LONGEST_EDGE}px longest edge — ${source}`);
if (image.length > CLIENT_MAX_BYTES) {
  console.log(`           ⚠ above the ${CLIENT_MAX_BYTES} byte client cap — a real client could not send this`);
}
console.log(`requests   ${N} per endpoint, serial`);
console.log('\nFire the first requests right after a task restart so a cold Vertex');
console.log('connection and the WIF token exchange land inside the sample.\n');

// The window the CloudWatch MemoryUtilization query needs. Printed at both ends
// so it survives terminal scrollback, and substituted into the command below.
const startedAt = new Date();
console.log(`started    ${startedAt.toISOString()}`);

const results = [];
const allRuns = {};
for (const endpoint of endpoints) {
  const runs = [];
  for (let i = 0; i < N; i++) {
    const run = await fire(endpoint, image, token);
    runs.push(run);
    process.stdout.write(
      `  ${endpoint} ${String(i + 1).padStart(3)}/${N}  ${String(run.ms).padStart(6)} ms  ${run.status}${run.code ? ` ${run.code}` : ''}\n`,
    );
    // The rolling window is shared with any earlier run, so the preflight cannot
    // predict this. Once throttled, every remaining request is wasted — stop.
    if (run.status === 429) {
      console.log(
        `  ⚠ rate-limited at request ${i + 1}. Stopping this endpoint; the ${API_LIMITER_QUOTA} req/15min\n` +
          '    window is shared with earlier runs. Wait out the window and re-run.',
      );
      break;
    }
  }
  results.push(report(endpoint, runs));
  allRuns[endpoint] = runs;
}

const finishedAt = new Date();
const outPath = `measure-gemini-${finishedAt.toISOString().replace(/[:.]/g, '-')}.json`;
await writeFile(
  outPath,
  JSON.stringify(
    {
      baseUrl: BASE_URL,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      image: { bytes: image.length, source },
      n: N,
      runs: allRuns,
    },
    null,
    2,
  ),
);
console.log(`\nstarted    ${startedAt.toISOString()}`);
console.log(`finished   ${finishedAt.toISOString()}`);
console.log(`Raw timings written to ${outPath}`);

console.log('\nTask memory is the other half of step 0b — grab it for the same window:');
console.log('  aws cloudwatch get-metric-statistics --namespace AWS/ECS \\');
console.log('    --metric-name MemoryUtilization --statistics Maximum --period 60 \\');
console.log(
  `    --start-time ${new Date(startedAt.getTime() - 60_000).toISOString()} ` +
    `--end-time ${new Date(finishedAt.getTime() + 60_000).toISOString()} \\`,
);
console.log('    --dimensions Name=ClusterName,Value=$(cd terraform && terraform output -raw ecs_cluster_name) \\');
console.log('                 Name=ServiceName,Value=$(cd terraform && terraform output -raw ecs_service_name)');
console.log('Above ~75% of the 512 MB task, raise it to 1 GB as part of ADR step 2.');

exit(verdict(results));
