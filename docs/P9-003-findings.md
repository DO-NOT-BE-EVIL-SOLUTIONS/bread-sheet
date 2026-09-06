# P9-003 Findings — Android Emulator + Maestro E2E Coverage

**Date:** 2026-09-07 (reviewer run on the final cycle, at `d8481bc`)
**Branch:** `agent/P9-003` (base: `main`) — PR [#110](https://github.com/fabelhaft-io/bread-sheet/pull/110), open
**Ticket:** [TICKET-P9-003] Android Emulator + Maestro E2E Coverage
**Status:** ✅ **PASS** — the deliverable was executed end to end by the reviewer, twice, and
proven able to fail. Acceptance criterion 1 is ticked under the **per-run** reading of "without
manual per-run setup"; that judgement call is spelled out in full below so it can be overruled
with the whole picture in view.

> **Supersedes** the 2026-08-11 `BLOCKED` doc (blocked on provisioning, not defects) and, before
> it, the 2026-08-11 `BLOCKED` (4 defects) and the 2026-08-10 `✅ PASS` (which passed a runner
> that had never executed past its first prerequisite check). The defect history is preserved in
> git; this revision records only what is true at `d8481bc`.

---

## Current State

The blockage in the previous revision was environmental, not a code defect: the Maestro CLI was
not installed, `cmdline-tools` was absent so the runner could not create its own AVD, and the
only JDK the runner could see was too new for the Android Gradle Plugin. Those are now resolved
on this machine, and five hand-written commits closed the code-side gaps that only a real run
could have surfaced.

**`npm run test:maestro` now completes green, and the reviewer reproduced that independently
rather than taking it from a report.** Both flows pass against a debug build on a headless
emulator, and a mutation of the camera flow turns it red for the right reason — so the suite is
covering the scan chain, not merely proving the app boots.

## What Was Implemented (this cycle)

Five commits, all hand-written by the human's session rather than by an implementer agent, and
none previously reviewed. They are reviewed here as agent work would be. Four of the five were
found *by running the thing* — which is the pattern this ticket was reopened to force.

| Commit | Change | Assessment |
|--------|--------|-----------|
| `48575f6` | README gains a "Native E2E (camera & barcode scan)" subsection beside the Playwright one, plus a Prerequisites bullet | **Accepted.** The install runbook previously lived only in this findings doc, which is a per-ticket artifact and the wrong permanent home. One inconsistency it introduced is noted under Non-Blocking Findings. |
| `57384d8` | `ensureEnvFile()` → `ensureAppCredentials()`: process environment first, `bread-sheet-app/.env` second; half-set is a hard error | **Accepted, and the right call.** The previous design forced a credentials file into a worktree the dev-team agents read. Rejecting a half-set environment is the non-obvious part and is correct: mixing one exported var with one from the file boots the app and fails much later inside a flow. This is the change that let *this* review run the suite with nothing written into the working tree. |
| `f03a606` | `MAX_JAVA_MAJOR = 21` (`MAESTRO_MAX_JAVA` override), floor-only check → `isUsableJavaMajor()` range predicate | **Accepted.** A floor-only check let JDK 26 through and burnt 10m35s on an impossible build. The commit message carries the measured evidence for both 26 and 25 (and honestly flags that its first JDK 25 measurement was invalid because `ANDROID_HOME` was unset) — that is the standard of evidence this ticket had been missing. |
| `65a606f` | `systemJavaCandidates()` enumerates `/usr/lib/jvm`, `/usr/lib64/jvm`, `~/.jdks` between the `PATH` and JBR probes | **Accepted.** Without it, the ceiling from `f03a606` would reject 26 and 25 and then tell the user to install a JDK they already had — which would itself have failed AC 1. Roots are a parameter so the test can point at a temp tree. Verified live in this review: `Java: /usr/lib/jvm/java-21-openjdk/bin/java`. |
| `d8481bc` | `hideKeyboard` before the submit tap in `manual-entry.yaml` | **Accepted.** An off-screen Android view is absent from the accessibility hierarchy rather than merely covered, so the open IME produced "Element not found", not a mis-aimed tap. Keeping the button tap instead of switching to `pressKey: Enter` is right — `onSubmitEditing` is a different handler from the one a user taps, and the button is what the flow exists to cover. Two latent bugs recorded in the message and deliberately not fixed are assessed below. |

`server/` is untouched (`git diff main...HEAD -- server/` is empty).

## Test Results

Everything below was executed by the reviewer on this machine today. Credentials were supplied by
exporting `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` and
`EXPO_PUBLIC_API_URL` from a file outside the repository; no value is reproduced here or anywhere
in the branch.

| Check | Exit | Observed |
|-------|------|----------|
| `npm --prefix server run typecheck` / `test` | not_run | `git diff main...HEAD -- server/` is empty — server pillar untouched |
| `npm --prefix bread-sheet-app run typecheck` | 0 | clean (both `tsconfig.json` and `tsconfig.test.json`) |
| `npm --prefix bread-sheet-app run lint` | 0 | `✖ 1 problem (0 errors, 1 warning)` — `review-edit/[editId].tsx:149 'approvalsLeft' unused`, pre-existing and outside this diff |
| `npm --prefix bread-sheet-app test` | 0 | **29 suites / 262 tests passed** (254 → 262 across the five commits: +3 credential resolution, +4 JDK range/parsing, +1 system JDK discovery) |
| `npm --prefix bread-sheet-app run test:e2e` (Playwright) | 0 | **2 passed** — `auth.spec.ts` and `scan-tab.spec.ts` in 11.5 s. Both failed locally last cycle for want of `bread-sheet-app/.env`; with the same two variables *exported* they pass, which independently confirms both the previous cycle's diagnosis and that the new environment route reaches Expo web as well as Metro |
| **`npm --prefix bread-sheet-app run test:maestro`** | **0** | **`[Passed] barcode-scan (27s)` · `[Passed] manual-entry (31s)` · `✅ all Maestro flows passed`.** Full unattended run: credentials from the environment → SDK `/home/jano/Android/Sdk` → `Java: /usr/lib/jvm/java-21-openjdk/bin/java` → `Maestro: /home/jano/.maestro/bin/maestro` → `using existing AVD "breadsheet-e2e"` → `device booted (API 35)` → `BUILD SUCCESSFUL in 9s` → `Metro is serving` → both flows → teardown. Wall clock ≈ 2 min |
| **Falsification: same runner, mutated flow** | **1** | **`Assertion 'id: .*product-(screen|not-found|offline).* is visible' failed`**, `❌ Maestro flows failed`. See below |
| Teardown | — | `pgrep qemu` empty and no `emulator -avd` / `expo start` process survives either run; `git status --porcelain` clean (no stray artifacts written into the tree) |
| GitHub CI on PR #110 at `d8481bc` | 0 | all 7 checks pass on the exact HEAD sha — App unit, App E2E (Playwright, Expo web), Server unit & integration, CodeQL, both Analyze jobs, GitGuardian |

### The falsification run (guardrails: "what production bug would this actually fail on?")

A green E2E suite is worth nothing until it has been seen to go red. I copied `barcode-scan.yaml`
to the scratch directory, deleted exactly one line — the `- openLink: "breadsheet://scan?inject=…"`
step that stands in for the pixel decode — and ran that mutant through the **real** runner via
`MAESTRO_FLOW`, so the emulator, build, install and Metro were all identical. No file under
`bread-sheet-app/` was modified.

```
[test:maestro] running Maestro flows: …/scratchpad/mutant/barcode-scan-no-inject.yaml
 > Flow barcode-scan-no-inject
Assertion 'id: .*product-(screen|not-found|offline).* is visible' failed.
[test:maestro] ❌ Maestro flows failed
MUTANT RUNNER EXITED code=1
```

This is the evidence that matters for acceptance criterion 2. The flow does not pass because the
app launched, or because a guest signed in, or because the scan tab rendered — all of that still
happened in the mutant. It passes only when a scan actually reaches
`/(app)/product/<barcode>`. The landing assertion carries the flow, and the runner propagates a
flow failure into a non-zero exit rather than swallowing it.

The jest tests added this cycle are also falsifiable, and I checked rather than assumed. They are
pure-function tests over real state (`process.env`, a real temp directory) with no mocks at all,
so the guardrails' frozen-mock failure mode does not apply. Confirmed by mutation using the
runner's own documented override: `MAESTRO_MAX_JAVA=99 npx jest -t "JDK version acceptance"` →
`1 failed` at `expect(runner.isUsableJavaMajor(26)).toBe(false)`, with the other three tests in
the block still green (so they are independent, not one coupled blob).

## Acceptance Criteria Tracking

- [x] **Android emulator runs locally (or in CI) without manual per-run setup.**
  **Met, under the per-run reading — and the reading is a judgement call I am making explicitly.**
  See "The judgement call" below for the argument and for exactly what a fresh machine still
  costs. Evidence for the per-run claim: two complete runs today (one green, one mutant), each
  starting from nothing but exported credentials, each booting the emulator, building, installing,
  starting Metro and tearing down with zero human intervention and zero prompts.
- [x] **At least one Maestro flow exercises barcode scanning end-to-end against a debug build.**
  **Met.** `barcode-scan` passed in 27 s against the debug APK built and installed by the runner
  in the same invocation, and the mutation above proves the pass is load-bearing rather than
  vacuous. `manual-entry` covers the camera-free path in the same run. The one link not covered
  is the pixel decode itself (CameraX → ML Kit), which Maestro structurally cannot drive because
  it cannot control what the emulator camera sees; the `__DEV__`-only injection seam feeds the
  identical `processScan` path, so validation, navigation and every downstream product-screen
  state are real. That limitation is documented in the flow, in `docs/architecture/frontend.md`,
  and here — it is a property of the tool, not a shortcut taken by this implementation.
- [x] **The reviewer's already-wired conditional step actually runs.**
  **Met, and no longer only in the static sense** — which is what the previous two revisions could
  not say. The reviewer's test matrix fired the conditional step because the diff touches
  camera/scan code; `bread-sheet-app/package.json` exposes `"test:maestro"`; and the script
  produced *both* signals a test command must be able to produce: exit 0 on a real pass and
  exit 1 on a real failure.

## The Judgement Call: "without manual per-run setup"

Reaching green required three things installed by hand on this machine, none of them by the
runner: the **Maestro CLI**, **`cmdline-tools`** (unzipped into `~/Android/Sdk/cmdline-tools/latest`,
without which the runner cannot create its own AVD), and a **JDK 21**. Only after `cmdline-tools`
existed could the runner provision `breadsheet-e2e` and pull the `android-35;google_apis;x86_64`
system image itself. So the criterion reads two ways, and both are defensible.

**I took the per-run reading, and ticked the box.** Three reasons, in order of weight:

1. **The criterion says "per-run", not "per-machine".** That word is doing work; it is the
   distinction between a bootstrap cost and a repeat cost. On the repeat cost the runner is
   unambiguously clean — my two runs needed nothing, not even an AVD name, and did not stop to
   ask for anything.
2. **The ticket's own Implementation section assigns the bootstrap to the human:** *"Install
   Android SDK + create an AVD (locally and/or as a CI-hosted emulator action) and add the
   `test:maestro` script"* and *"Install Maestro and author its declarative YAML flows"*.
   Installing the toolchain is listed as work *of* the ticket, not as behaviour required *of* the
   script. Reading AC 1 as "the script must install its own toolchain" contradicts the
   implementation plan directly above it.
3. **The one place the runner does bootstrap itself, it does.** Given `cmdline-tools`, it creates
   the AVD and downloads the system image unattended. And `MAESTRO_INSTALL=1` will install the
   Maestro CLI — deliberately opt-in, because the mechanism is `curl … | bash`, and defaulting a
   supply-chain surface to on to satisfy a checkbox would be the wrong trade. I would not accept a
   patch that flipped it.

**The per-machine reading in full, so this can be overruled with eyes open.** A fresh machine
needs three manual installs before the first green run. That is genuinely more than the README
currently prepares a reader for: the README lists JDK, Android SDK and Maestro, and describes
`cmdline-tools` as *"needed only to create an AVD; an existing one is discovered without it"* —
true, but the default path on a fresh machine *is* creating an AVD, so `cmdline-tools` is
effectively required and is not in the prerequisite list. Fixing that sentence is the cheapest
way to make the per-run reading honest to a newcomer; it is recorded as a follow-up rather than
folded in here, since `README.md` is outside every agent role's write scope.

The durable answer to both readings is the same and is not in this ticket: a CI job
(`reactivecircus/android-emulator-runner`) provisions the whole toolchain declaratively, which
makes "per-machine" a solved problem and makes the suite run whether or not someone remembers to
run it. See Open Questions.

## Documentation Check (CLAUDE.md "Mandatory Post-Implementation Steps")

- **Tests** — added and passing (262). ✅
- **`docs/architecture/frontend.md`** — updated across the cycle. Two factual staleness spots
  remained and **I corrected them in this commit** (in scope: `docs/`): the prerequisite summary
  still said "JDK 17+", contradicting the "17–21" range stated fourteen lines later in the same
  section, and the `/usr/lib/jvm` probing added by `65a606f` was undocumented. Both now describe
  the code as shipped. Nothing else in `docs/architecture/` is in this diff's scope.
- **ADR** — none needed. The choice of Maestro for native E2E predates this ticket and is recorded
  in `docs/architecture/agent-dev-team.md`; the ticket implements a documented decision rather than
  making a new one. ✅
- **`docs/bruno/`** — N/A, no endpoint changed. ✅
- **`README.md`** — updated by `48575f6`/`57384d8`/`f03a606`, with one leftover inconsistency
  (below). Outside reviewer write scope.

## Non-Blocking Findings

Numbered fresh; the previous revision's closed defects are not carried forward.

1. **`takeScreenshot` does write PNGs — just not where the repo says.** Both flows end with
   `takeScreenshot: e2e/maestro/artifacts/<flow>`, and `bread-sheet-app/e2e/maestro/artifacts/`
   held only `emulator.log` and `metro.log` after a passing run. This is not a silent failure:
   Maestro resolves the argument relative to **its own per-run output directory**, so my run's
   screenshots landed at
   `~/.maestro/tests/2026-09-07_000644/{barcode-scan,manual-entry}/takeScreenshot/e2e/maestro/artifacts/<flow>.png`
   — the repo-relative path is reproduced verbatim *inside* Maestro's directory. Verified by
   `find`, and attributed to my run by timestamp. Consequences: the `.gitignore` entry and the
   failure message pointing at `e2e/maestro/artifacts/` are both misleading for screenshots
   (they remain correct for the two logs, which the runner itself writes there), and the
   diagnostics are hard to find precisely when a flow has failed. Fix is either to pass an
   absolute path or to drop the step and point at `~/.maestro/tests/` in the failure message.
   Diagnostics only — no assertion depends on it. **Follow-up.**
2. **The two latent `installedSystemImages()` bugs are a follow-up, not a blocker — but they must
   be fixed together.** `/^android-(\d+)$/` cannot match `android-37.1`, and the flavour allowlist
   excludes `google_apis_playstore_ps16k`. I traced the blast radius: the function is only
   consulted on the AVD-*creation* path, and under-reporting degrades to "install
   `PREFERRED_SYSTEM_IMAGE`" — `android-35;google_apis;x86_64`, exactly the image the flows target.
   Under-reporting is the safe direction; over-reporting would be the dangerous one and does not
   occur. Worth flagging loudly for whoever picks this up: on *this* machine the narrow matcher is
   currently load-bearing in the right direction, because the only image it hides is the
   `android-37.1` Play Store one that `d8481bc` measured hanging Maestro's `inputText` for 2m59s.
   Widening the regex **without** also excluding the `_ps16k` flavour would regress the suite into
   that hang, and the failure would look like a flow bug rather than an image bug. **Follow-up,
   with that coupling recorded.**
3. **The build log line overstates the cost unconditionally.** `building + installing debug APK
   (first Gradle run downloads dependencies; this can take 10–40 minutes)` printed before a build
   that took **9 s** on one run and **10 s** on the other. The parenthetical does say "first
   Gradle run", but "this can take 10–40 minutes" is what a reader anchors on, and a warm run
   looks stalled by comparison rather than fast. The README already scopes the figure correctly to
   the first run. A one-line conditional on whether `android/app/build/` exists would make the log
   match. Cosmetic. **Follow-up.**
4. **Nothing tests that `resolveJava()` actually consults `systemJavaCandidates()`.** Proven
   statically, which is legitimate for a structural claim: `resolveJava` is not in the runner's
   `module.exports`, so no test can reach it. `systemJavaCandidates()` itself is well covered
   (real temp tree, exact paths, absent root tolerated), but deleting `...systemJavaCandidates()`
   from the candidate list would leave the entire suite green while reintroducing exactly the bug
   `65a606f` fixed. Today's live run is the evidence that the wiring works
   (`Java: /usr/lib/jvm/java-21-openjdk/bin/java`); what is missing is the regression guard.
   **Follow-up.**
5. **`MAESTRO_MAX_JAVA` is not validated.** `Number(process.env.MAESTRO_MAX_JAVA || 21)` yields
   `NaN` for a typo, `isUsableJavaMajor` then rejects every JDK, and the error reads "No JDK
   between 17 and NaN found". Fails fast, but with a message that points at the wrong thing.
   Minor, and adjacent to CLAUDE.md's "fail fast, no inline defaults" convention. **Follow-up.**
6. **`test:e2e` and `test:maestro` cannot run concurrently, and the failure would be confusing.**
   Both use port 8081, and `playwright.config.ts` sets `reuseExistingServer: !process.env.CI` — so
   a local Playwright run started while Metro is up would silently attach to the *native* bundler
   instead of Expo web and fail in a way that looks like an app regression. I sequenced my runs
   deliberately for this reason. `MAESTRO_METRO_PORT` exists as an escape hatch. Worth a sentence
   in the README, or a guard. **Follow-up.**
7. **README prerequisite bullet contradicts its own section.** `README.md:55` still says
   **"JDK 17+"**; the section it links to says "a JDK between 17 and 21". `f03a606` updated the
   section and missed the bullet it had itself added in `48575f6`. A reader who follows the bullet
   installs the newest JDK, which is precisely the trap the ceiling exists to prevent — the runner
   rejects it in one second with an actionable message, so the cost is confusion, not ten minutes.
   Outside reviewer write scope. **Human/implementer task.**
8. **`barcode-scan.yaml`'s header comment is stale after `57384d8`.** It still states the Supabase
   config comes "via `bread-sheet-app/.env`"; the environment route is now preferred. One comment
   line, frontend pillar. **Implementer task.**
9. **Known-stale docs outside every agent's write scope.** Unchanged from the previous revision,
   restated because they are now the last inaccuracies about this suite in the repo:
   - `CLAUDE.md`'s frontend command list has no `test:maestro` entry.
   - `bread-sheet-app/playwright.config.ts:4-6`'s docblock still says *"no Android SDK on this
     machine yet; Maestro/Android is a documented follow-up, not built"*. Verified still present;
     it is now false on both counts.
   - **PR #110's body** still carries the original run's passing test table from the first,
     withdrawn `PASS`. A commit cannot rewrite a PR description — **a human must edit it.** This
     one matters most: #110 is what a reviewer of this branch reads first, and its body currently
     describes a run that did not happen.
10. **The 866-line runner is still never linted.** `npm run lint` resolves to
    `eslint app components`, so nothing under `scripts/` is checked. Unchanged. **Follow-up.**
11. **`expo prebuild` still runs only when `android/` is absent**, so a stale native project
    survives an `app.json` change. Unchanged. **Follow-up.**
12. **The emulator still boots before the Gradle build.** Now much less costly than it looked
    when the build was assumed to take 10–40 minutes, since a warm build is ~10 s. Splitting
    `assembleDebug` from `installDebug` remains the fix if a cold CI build makes it matter.
    **Follow-up.**

## Open Questions

No product decisions outstanding. Three for the human, in priority order:

1. **Is the per-run reading of AC 1 the intended one?** I have ticked the box on that reading and
   given the full argument and the full counter-argument above. If "without manual per-run setup"
   was meant as "a fresh machine runs this with one command", the box should be unticked and the
   CI job below becomes part of *this* ticket rather than the next one. This is the only part of
   the verdict I would expect a reasonable person to overrule.
2. **Open the CI job as its own ticket now.** `reactivecircus/android-emulator-runner` would run
   these flows on every PR. This branch reached a green PR twice with a runner that could not run;
   the only durable defence against a third time is a suite that executes without anyone choosing
   to execute it — and it also dissolves question 1 by making the toolchain declarative.
   Recommendation: merge #110 on this evidence, file the CI ticket immediately.
3. **Should the runner keep silently borrowing an arbitrary AVD when `cmdline-tools` is missing?**
   Carried forward and now less pressing, since `cmdline-tools` is installed here and the runner
   creates and reuses its own `breadsheet-e2e`. On a machine whose first AVD is Wear OS or API 24
   it would still boot something the app cannot install on, and the failure would present as a
   build failure. Requiring `MAESTRO_AVD` when it cannot create its own is the stricter option.
   Not blocking; needs a call.

---

## Addendum — follow-ups closed (2026-09-07, human session)

Every follow-up this doc recorded has been implemented and verified by a live run; the verdict
above is unchanged. Suite is now 268 jest tests, `npm run lint` covers `scripts/` for the first
time, and `npm run test:maestro` is green end to end (`[Passed] barcode-scan (27s)`,
`[Passed] manual-entry (30s)`, exit 0, no orphaned processes).

- **`takeScreenshot`** — flows now pass a bare name. Maestro resolves the argument inside its
  own per-run directory, so the repo-relative path only ever recreated that tree there.
  Verified: `~/.maestro/tests/<run>/<flow>/takeScreenshot/<flow>.png`. The `.gitignore` comment
  and the runner's failure message now point at Maestro's run directory for screenshots and
  hierarchies, keeping `artifacts/` for the emulator and Metro logs it really does hold.
- **`installedSystemImages()`** — fixed as one change, per this doc's warning. The API match
  accepts a dotted directory (`android-37.1`) **and** Play-Store flavours are rejected
  outright, so widening the match cannot resurrect the `inputText` hang. Four tests, including
  one asserting no Play image is ever offered whatever its suffix.
- **"10–40 minutes"** — conditional on whether `~/.gradle/caches` exists.
- **Runner never linted** — `eslint.config.js` gained a `scripts/**` block (CommonJS, Node +
  Jest globals; the Expo preset assumes RN/browser, which is why 73 "not defined" errors were
  hiding there), and `lint` is now `expo lint && eslint scripts`.
- **CI** — `.github/workflows/test-native-e2e.yml`: KVM, JDK 21 pinned with the reason,
  Gradle cache, path-filtered to the camera/scan surface plus `workflow_dispatch`, credentials
  from repo variables, Maestro's run directory uploaded as an artifact.
- **Emulator idled through the build** (finding 11) — `assembleDebug` is split from the
  install and started before the boot wait. Measured: `BUILD SUCCESSFUL in 4s` arrives *before*
  `device booted`, i.e. entirely inside the boot window.
- **Stale native project** (finding 12) — `ensureNativeProject()` fingerprints `app.json` +
  `package.json` and forces `prebuild --clean` when they change.
- **Doc staleness** — `CLAUDE.md` command list, `playwright.config.ts:4-6`, `README.md:55`
  (JDK 17–21), and `barcode-scan.yaml`'s `.env`-only credentials header.

One bug was found in the guards themselves while updating them: `indexOf('installDebugApk(…)')`
matched the function *declaration*, which sits above every call site, making the "X after Y"
ordering assertions vacuous — the `pm clear` guard had been passing for that reason. Both now
anchor on the call site via a `callSiteIndex()` helper.

Still human-scope, unchanged: PR #110's body.
