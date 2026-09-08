# P9-005 Implementation Plan — Provider-Agnostic Agentic QA Environment

**Date:** 2026-09-08
**Branch:** TBD (target: `main`)
**Ticket:** [TICKET-P9-005] Agentic Exploratory QA Environment *(to be added to `FEATURES.md`,
replacing the "E2E Testing Flow - Agents can run and control emulators" future-plans note)*

---

## Background

The repo has two *scripted* E2E surfaces and no exploratory one:

- `bread-sheet-app/e2e/*.spec.ts` — Playwright against Expo web. Two specs, both stopping at
  "guest reached Home", because CI never sets `EXPO_PUBLIC_API_URL` — there is no backend behind
  them.
- `bread-sheet-app/e2e/maestro/*.yaml` — two Maestro flows on a headless AVD, driven by the
  self-provisioning runner `bread-sheet-app/scripts/test-maestro.js` (P9-003).

Both can only fail on regressions someone already thought to assert. `FEATURES.md`'s
future-plans note — *"E2E Testing Flow - Agents can run and control emulators — Setup works on a
local mac mini and on cachyos desktop pc"* — is the gap this ticket closes: an LLM agent that
drives the real app on a real emulator, improvises against a charter, and produces bug reports
for what it finds.

Two constraints shape the design:

1. **The agent drives a real device, not a script.** Maestro YAML is a *pre-written* flow and is
   therefore the wrong interface for exploration.
2. **The setup must not be Claude-specific.** ADR 0004 already establishes the pattern — one
   shared contract, swappable harnesses, `agent-team/src/config.ts` gating `AGENT_MODEL*` behind
   `ALLOWED_PROVIDER_PREFIXES` (`anthropic/`, `openai/`, `deepseek/`) with per-provider key
   checks and no silent default. This ticket extends that pattern to a QA role rather than
   inventing a parallel, Claude-shaped one.

---

## Key Decisions

### Perception/action loop, not a flow script

The agent works one step at a time against the emulator:

| Need | Mechanism |
|---|---|
| Read the screen | `maestro hierarchy` → structured text. RN `testID`s land as `resource-id`, and the app already carries ~50 (`home-screen`, `product-not-found`, `manual-barcode-input`, `rating-queued-offline`, …) |
| See the screen | `adb exec-out screencap -p` — evidence always; a model input only when `QA_VISION=on` |
| Act | `adb shell input tap/text/keyevent/swipe`, `adb shell am start -a VIEW -d 'breadsheet://…'` (reaching the `__DEV__` scan-injection seam in `app/(tabs)/scan.tsx`) |
| Evidence | `adb logcat`, the server's stdout (`request:finish` carries `status`/`durationMs`/`userId`; `errorHandler` logs full stacks), `adb shell pm clear` for clean-state replay |

### The tool surface is MCP, not a shell

A naive design would let the agent shell out via Claude Code's `Bash` tool and *look* at
screenshots via Claude Code's `Read` tool (which renders PNGs). Both are harness-specific
capabilities, and depending on them makes the setup Claude-only in practice regardless of what
the contract says.

So the driver is a **library**, with three thin wrappers: a CLI, an **MCP stdio server**, and
native Mastra tools. MCP is the one tool protocol Claude Code, Mastra, OpenAI's Agents SDK,
Gemini CLI and the rest all speak. Every capability is a typed tool with a JSON result — never
"run this shell string and parse the prose".

### Vision is optional, and text must stand alone

Not every model in the allow-list is multimodal, and vision is expensive on all of them. The
`describe` verb — a compact structured render of the current screen (visible `testID`s, texts,
bounds, enabled/focused, scrollability, current route) — must therefore be **sufficient on its
own** to complete every charter except the explicitly visual ones. Screenshots are captured as
evidence unconditionally and fed to the model only under `QA_VISION=on`. Charters declare
`requires-vision: true|false`.

This is a design constraint on the driver, not a toggle bolted on afterwards: if `describe` is
lossy, the whole setup silently becomes Claude-only.

### The agent emits a schema; the harness files the issue

Different models write differently. A bug report parsed out of free text works with one provider
and degrades silently with the next. So the agent's terminal output is a **validated finding
object**, and the coordinator — never the agent — creates the GitHub issue. This mirrors
coordinator-owned git in the dev harness (`agent-team/src/lib/handoff.ts`,
`agent-team/src/coordinator.ts`) and has a second benefit: the QA agent needs no `gh`, no git and
no repo write access at all.

### Determinism before exploration

An exploratory agent hitting live Open Food Facts, or a database whose contents vary per machine,
reports noise as defects — and *different* noise per provider, which makes harnesses
incomparable and the eval below meaningless. The stack has to be deterministic first.

### Harness B is the reference implementation

The Mastra orchestrator is where the provider is a single env var, so it is primary. Claude Code
becomes one MCP consumer among several. The acceptance test for "provider-agnostic" is that a
non-Anthropic model completes the same charter through the same tools.

---

## Contract

`agent-team/src/prompts/qa-guardrails.md` — sibling to `guardrails.md`, plain markdown, no
model-specific phrasing, embedded verbatim by every harness so they cannot drift.

- **No repo writes, no `gh`, no git.** The agent's only output is validated finding objects.
- **Reproduce before reporting.** A finding needs a clean-state replay (`reset`) before it counts
  as `confirmed`. One-shot observations are `unconfirmed` and stay in the run log. This is the
  P9-003 "execute, don't infer" rule applied to QA.
- **Budget-bounded.** Each charter declares a maximum driver-call count; exhausting it ends the
  run with whatever was confirmed, not with a guess.
- **Known-expected list**, so the environment is not filed as a defect:
  - guests get `403 Registration required` on every contribution route;
  - `REJECTED` products are `404` for everyone;
  - the scan tab shows a permission prompt when no camera is available;
  - `429` above the rate ceiling;
  - `PLAUSIBILITY_MODE=mock` returns the literal `Mock Product` / `Mock Brand`;
  - `VISION_MODE=mock` returns the fixed `MOCK_OCR_TEXT` nutrition block.

**Finding schema** (`agent-team/src/lib/qa-handoff.ts`, Zod, beside the existing `handoff.ts`):

```ts
qaFindingSchema = {
  title, severity: 'low'|'medium'|'high',
  charterId, runId, modelId,
  expected, observed,
  steps: string[],          // replayable driver verbs, in order
  evidencePaths: string[],  // screenshots + hierarchy dumps
  serverLogSlice: string,
  confirmed: boolean,       // reproduced from clean state
}
```

Validation failure is a harness error, not a silent pass — this is what makes a weaker or
differently-tuned model degrade *loudly*.

---

## Implementation Tasks

### Task 1 — `OFF_MODE` (`server/`)

`services/productService.ts:4` calls `https://world.openfoodfacts.org/api/v2/product`
unconditionally, with no mode flag — the app's only unmockable external dependency besides
Supabase. Add `OFF_MODE=live|mock` to `configs/config.ts` beside `VISION_MODE` /
`PLAUSIBILITY_MODE` (explicit allowlist, throw otherwise — no inline default), plus a
`fetchFromOpenFoodFactsMock` serving a fixture table: a hit, a 404, and a barcode that forces the
5xx path. Mirror the shape of `visionService.ocrMock()` and `imagePlausibilityService.checkMock()`.

### Task 2 — Seed data (`server/`)

There is no `prisma/seed.ts` and no `seed` key in `prisma.config.ts`. Add both, covering the
states the agent must reach without having to create them: a `VERIFIED` product, a
`PENDING_REVIEW` one (banner + reviewer screen), a `REJECTED` one (must 404), one with an open
`ProductEdit` (peer-vote screen), and one carrying ratings. Also satisfies the "fixture example
data set" item in `FEATURES.md`'s Taskfiles note.

### Task 3 — `LOG_FORMAT` and config-driven rate limits (`server/`)

`logger.ts` ties JSON output to `NODE_ENV === 'production'`, which also flips `syncLimiter` to
20/hr. Split them: `LOG_FORMAT=pretty|json`, validated in `config.ts`. Separately, drive
`middlewares/rateLimit.ts`'s ceilings from config — 100 req/15 min per IP is tripped by a
30-minute exploratory session, and the agent would file "the app returns 429" as a bug.

### Task 4 — Session mode in the Maestro runner (`bread-sheet-app/`)

**Do not rewrite `scripts/test-maestro.js`.** Its prerequisite resolution, ABI derivation, AVD
discovery, Gradle/Metro orchestration and teardown are the product of the whole P9-003 defect
cycle. Add `--session` (`MAESTRO_SESSION=1`): run `main()`'s provisioning half — credentials →
SDK/Java/Maestro → AVD → boot → `assembleDebug` → `adb reverse` → install → `pm clear` →
`pm grant CAMERA` → Metro — then write `bread-sheet-app/.qa/session.json`
(`{serial, appId, metroPort, pid, runId, startedAt}`) and stay up instead of running flows and
tearing down. Teardown moves behind `--session-down`, reusing the existing `teardown()`.

### Task 5 — The driver (`bread-sheet-app/scripts/qa-driver/`)

`index.js` is the library; `cli.js` (with `--json` on every verb), `mcp.js` (MCP stdio server,
one typed tool per verb) and `mastra-tools.js` are wrappers over it.

Verbs: `describe`, `screenshot`, `tap <testID|text|x,y>`, `type <text>`, `key <back|enter|home>`,
`swipe <dir>`, `deeplink <url>`, `logs --since <ts>`, `reset`, `network <on|off>`
(`adb shell svc wifi disable`), `finding` (validate + persist a finding object). Every verb
writes its artifact under `docs/qa/runs/<runId>/` and returns the path in its JSON result.

Extract `resolveAndroidSdk`, `resolveJava`, `adb` and `avdHome` into a shared
`scripts/lib/android.js` that both `test-maestro.js` and the driver import.
`scripts/test-maestro-wiring.test.js` asserts runner structure and must be updated **with** the
extraction, not worked around.

### Task 6 — macOS host support

The Mac mini (M4 Pro) is the chosen host, and three things block it today:

- `systemJavaCandidates()` enumerates `/usr/lib/jvm`, `/usr/lib64/jvm`, `~/.jdks`. Add
  `/Library/Java/JavaVirtualMachines/*/Contents/Home` and `/usr/libexec/java_home -V`; only the
  Android Studio JBR path works on macOS right now.
- `-gpu swiftshader_indirect` is a CPU renderer. Default to `-gpu host` on Apple silicon with an
  `arm64-v8a` image — the `MAESTRO_EMULATOR_ARGS` hatch already exists, this makes it a platform
  default.
- `docker-compose.yml:78` mounts `${XDG_RUNTIME_DIR}/podman/podman.sock`, which does not exist on
  macOS. Add `docker-compose.macos.yml` (or make the socket path a root `.env` variable) so
  LocalStack's Lambda execution works there.

### Task 7 — Harness B, the reference implementation (`agent-team/`)

- `src/prompts/qa-guardrails.md` (the contract above) and `src/lib/qa-handoff.ts` (the schemas).
- `src/agents/qa-agent.ts` — Mastra agent with the driver's `mastra-tools` and an **environment
  facts block** computed up front, reusing `probeEnvironment()` / `formatEnvironmentFacts()` from
  `src/lib/environment.ts`, extended with session state so the agent does not burn a dozen tool
  calls rediscovering whether the emulator is up.
- `src/qa-coordinator.ts` + `npm run qa-team -- <charter>`.
- `src/config.ts`: add `AGENT_MODEL_QA` to `resolveModel()`, and a fail-fast **capability floor**
  — tool calling required, `MAX_STEPS`-style budget, and a vision allow-list checked when
  `QA_VISION=on`.
- **Sandbox boundary — decide this before writing the agent.** `hardenedSandbox()`
  (`src/lib/sandbox.ts`) binds `/usr`, `/lib`, `/bin`, a few `/etc` files and *only* the
  worktree; the user's home directory is not bound and `/tmp` is a fresh tmpfs. Everything the
  driver needs lives in the unbound part: `adb` at `$ANDROID_HOME/platform-tools/adb`
  (`~/Android/Sdk`), the Maestro CLI at `~/.maestro/bin/maestro`, and adb's device-auth key at
  `~/.android/adbkey`. Loopback is fine — no caller passes `allowNetwork`, and it defaults to
  `true`, so `--unshare-net` is not applied and `localhost:5037` reaches the host's adb server.
  `--unshare-pid` plus `--die-with-parent` also means a sandboxed process cannot own the
  long-lived emulator and Metro.

  **Preferred resolution: run the driver outside the sandbox as an MCP server** that the
  coordinator starts, and give the agent only the stdio connection to it. The agent then needs
  no SDK, no Maestro and no `adb` inside its own sandbox, and the MCP boundary doubles as the
  privilege boundary — the tool list *is* the capability list. The alternative (binding the SDK
  read-only, `~/.android` read-write, and forcing artifacts onto the workspace bind so they
  survive the tmpfs) widens a sandbox that exists because an agent once committed outside its
  pillar, and should be the fallback rather than the plan.

### Task 8 — Harness A, the interactive convenience

`.mcp.json` registering `qa-driver mcp`, plus a thin `.claude/skills/qa-run/SKILL.md`
(`/qa-run <charter>`) modelled on `.claude/skills/dev-team/SKILL.md` including its bounded-retry
discipline. It is deliberately *not* the reference implementation: any MCP client registering the
same server gets the same capability with no repo change, and that is the test of whether this is
genuinely provider-agnostic.

### Task 9 — Charters (`docs/qa/charters/`)

One markdown file per charter: goal, starting state, budget (max driver calls),
`requires-vision: true|false`, out-of-scope notes. Seed set: `guest-rates-a-product`,
`manual-barcode-entry`, `offline-outbox`, `pending-product-review`, `anon-upgrade-gate`.

### Task 10 — Bug reports

- One-time human setup: `gh label create agent-qa`, `qa-confirmed`, `qa-unconfirmed` — a
  deliberate human action, same reasoning as P9-002's repo variables. The repo has **zero issues**
  today, so this starts clean.
- `.github/ISSUE_TEMPLATE/agent-qa-report.md`: charter, run id, **model id**, host, commit SHA,
  expected vs observed, numbered repro as driver verbs, evidence paths, server-log slice.
- The coordinator maps each validated `qaFinding` onto that template. Dedup first via
  `gh issue list --label agent-qa --state all --search "<terms>"`; a match gets a comment with
  the new run id, not a new issue.
- Artifacts stay under `docs/qa/runs/<runId>/`, gitignored like `e2e/maestro/artifacts/`.

### Task 11 — Provider evaluation (`docs/qa/evals/`, `npm run qa-eval`)

Supporting N providers is worthless without knowing which ones can do the job. Seed defect
fixtures — a product whose `energyKcal` renders as `NaN`, a barcode that 500s, a rating that
silently fails to persist — each shipping with the finding the agent *should* produce. `qa-eval`
runs the same charter set across every configured `AGENT_MODEL_QA` and emits a scoreboard:
defects found / missed / false positives, driver calls used, wall time, token cost, and pass rate
with `QA_VISION` on vs off.

This is how a provider earns a place in `ALLOWED_PROVIDER_PREFIXES` — evidence, not vibes — and
it is the honest way to answer "can a cheaper model do this?", which is the question
provider-agnosticism exists to let you ask.

### Task 12 — Hosts and CI

`.github/workflows/qa-explore.yml`, `workflow_dispatch` + nightly `schedule`, on a self-hosted
runner labelled `[self-hosted, macos, breadsheet-qa]`: stack up → seed →
`test-maestro.js --session` → `npm run qa-team -- <charter>` → `--session-down` → upload
`docs/qa/runs/`. Note it invokes **the harness, not `claude -p`** — the provider is
`AGENT_MODEL_QA` in repo secrets alongside the provider's API key.

The CachyOS PC is the second host (native podman, KVM — honestly the easier emulator host).
Parity across both is an acceptance criterion, per the `FEATURES.md` note.

### Task 13 — Documentation

`README.md` (running a QA session), `docs/architecture/agent-dev-team.md` (the QA role beside the
dev roles), `docs/architecture/backend.md` (`OFF_MODE`, `LOG_FORMAT`, seed), `CLAUDE.md` (env
vars, commands), `docs/architecture-decision-records/0004-agentic-dev-workflow.md` (extend to the
QA role, or a new ADR if the MCP tool surface is judged a separate decision), root and
`server/.env.example`.

---

## Supabase — the one dependency with no mock

`lib/supabase.ts` throws at import without real credentials, `authMiddleware.ts` has no bypass,
and every E2E path signs in for real via `signInAnonymously()`. Use a **dedicated throwaway
Supabase project** — also the open decision in P9-002, so do that ticket first or in the same
pass. Two consequences to accept and document: every run creates a new anonymous user with no
cleanup path in the repo, and anonymous sign-in must be enabled on that project. Guest sign-in
needs only the two `EXPO_PUBLIC_*` Supabase vars; `EXPO_PUBLIC_AUTH_REDIRECT_URL` is touched only
by `signUp()` / `upgradeAccount()`.

---

## Acceptance Criteria

- [ ] `npm --prefix server test` and `npm --prefix bread-sheet-app test` green, with new unit
      tests for the `OFF_MODE` mock, the seed, `LOG_FORMAT`, and every driver verb's argument
      handling and JSON shape.
- [ ] `npm --prefix bread-sheet-app run test:e2e` and `run test:maestro` still green — the
      `lib/android.js` extraction must not regress P9-003. (Mind the port-8081 conflict between
      Playwright's web server and Metro; use `MAESTRO_METRO_PORT` when both run.)
- [ ] A real session, executed and pasted into the findings doc: stack up → `--session` →
      `describe` shows the login screen → `tap "Continue as Guest"` → `describe` shows
      `home-screen` → `deeplink breadsheet://scan?inject=<seeded barcode>` → `product-screen` →
      rate → `reset` reproduces it.
- [ ] **The same charter completes on two providers** — once via the MCP server from a Claude
      Code session, once via `npm run qa-team` on a non-Anthropic model. This is the actual
      acceptance test for provider-agnosticism.
- [ ] `npm run qa-eval` finds the seeded `NaN` defect and produces a working repro. A QA agent
      that has never produced a true positive is unverified.
- [ ] At least one `QA_VISION=off` run passes, proving the text-only path rather than assuming it.
- [ ] The session and the eval both run on **both hosts** (Mac mini and CachyOS).

## Out of Scope

- iOS simulator on the Mac mini — no Maestro iOS flows exist; add once Android is proven.
- `x-request-id` from `lib/api.ts` for exact log correlation (the `Tracing id and Idempotency`
  backlog item). This ticket correlates by anonymous `userId` + time window, both of which
  `requestLogger` already emits.
- Automatic cleanup of accumulated anonymous Supabase users.
- Local/self-hosted models on the 3070 — 8 GB VRAM is below the tool-calling capability floor
  this needs. `qa-eval` is where that gets re-tested if it changes, rather than argued.