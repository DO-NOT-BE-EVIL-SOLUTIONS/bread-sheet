/**
 * TICKET-P9-003 — guards for the Maestro native E2E suite.
 *
 * Two jobs:
 *
 *  1. Wiring that must not rot: the reviewer's test matrix runs
 *     `npm --prefix bread-sheet-app run test:maestro` conditionally for
 *     camera/scan tickets, so the npm script, the runner and the flows have to
 *     keep matching each other.
 *  2. Regressions for the defects that made the runner unable to complete a run
 *     (missing `await`, adb calls before the install, AVD discovery through a
 *     tool that isn't installed). Those are unit-tested against the runner's own
 *     exported helpers where the logic is pure, and asserted structurally where
 *     the code needs a real device.
 *
 * No emulator and no Maestro CLI are required — the runner exercises those.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUNNER_PATH = path.join(ROOT, 'scripts', 'test-maestro.js');
const RUNNER_SRC = fs.readFileSync(RUNNER_PATH, 'utf8');
// Requiring the runner must not execute it — it guards on `require.main`.
const runner = require('./test-maestro.js');

/** A throwaway SDK layout with an `emulator` binary that prints AVD names. */
function fakeSdkWithAvds(names) {
  const sdk = fs.mkdtempSync(path.join(os.tmpdir(), 'p9003-sdk-'));
  fs.mkdirSync(path.join(sdk, 'emulator'), { recursive: true });
  const bin = path.join(sdk, 'emulator', 'emulator');
  fs.writeFileSync(bin, `#!/bin/sh\n${names.map((n) => `echo "${n}"`).join('\n')}\n`);
  fs.chmodSync(bin, 0o755);
  return sdk;
}

/**
 * Index of a call site, skipping the function declaration of the same name — `indexOf` on a
 * bare name finds `function foo(` first, which sits above every call and quietly makes any
 * "X happens after Y" ordering assertion vacuous.
 */
function callSiteIndex(src, name) {
  const re = new RegExp(`^[^\\S\\n]+(?:await\\s+)?${name}\\(`, 'm');
  const match = re.exec(src);
  return match ? match.index : -1;
}

describe('Maestro E2E wiring (TICKET-P9-003)', () => {
  test('package.json exposes the test:maestro script the reviewer runs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.scripts['test:maestro']).toBe('node scripts/test-maestro.js');
  });

  test('runner script exists and parses as valid JavaScript', () => {
    expect(fs.existsSync(RUNNER_PATH)).toBe(true);
    // node --check compiles without executing — catches syntax errors that would
    // otherwise only surface when the reviewer runs the script.
    expect(() =>
      execFileSync(process.execPath, ['--check', RUNNER_PATH], { stdio: 'pipe' })
    ).not.toThrow();
  });

  test('every Maestro flow targets the app and asserts it reached the product screen', () => {
    const dir = path.join(ROOT, 'e2e', 'maestro');
    const flows = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
      .sort();
    expect(flows.length).toBeGreaterThanOrEqual(1);

    for (const flow of flows) {
      const yaml = fs.readFileSync(path.join(dir, flow), 'utf8');
      expect(yaml).toContain('appId: com.breadsheetexpo.breadsheet');
      // Landing assertions must be on the product screen's testIDs. Asserting
      // the literal barcode instead is vacuous: it is also the manual sheet's
      // placeholder, so it stays on screen when navigation never happened.
      // Matched loosely on purpose: the set of product-screen states may grow (it gained
      // `error` after a CI run showed a failed lookup reading as a navigation failure). What
      // must not change is that flows assert a product-screen testID rather than the barcode
      // text — "4006381333931" is also the manual sheet's placeholder, so a text assertion
      // stays satisfied when navigation never happened.
      expect(yaml).toMatch(/id: "\.\*product-\((?:screen\|not-found\|offline[^"]*)\)\.\*"/);
      expect(yaml).not.toMatch(/visible: ["']4006381333931["']/);
      expect(yaml).not.toMatch(/visible:\s*"4006381333931"/);
      // Every flow starts from a signed-out app: they run in sequence and each
      // signs in as a guest, so a flow that inherits the previous one's session
      // never sees "Continue as Guest".
      expect(yaml).toMatch(/launchApp:\s*\n\s*clearState: true/);
    }

    // The camera flow must actually drive a scan (the dev-only inject deep link).
    const scan = fs.readFileSync(path.join(dir, 'barcode-scan.yaml'), 'utf8');
    expect(scan).toContain('openLink');
    expect(scan).toContain('breadsheet://scan?inject=');
  });
});

describe('runner regressions (TICKET-P9-003)', () => {
  test('AVD discovery finds AVDs without cmdline-tools installed', () => {
    // The maintainer's machine: an SDK with an emulator and an AVD, but no
    // cmdline-tools — so no avdmanager. Discovering AVDs through avdmanager made
    // the runner refuse an AVD that exists, in exactly the case the fallback was
    // written for.
    const sdk = fakeSdkWithAvds(['Medium-Phone-Android-17', 'breadsheet-e2e']);
    expect(fs.existsSync(path.join(sdk, 'cmdline-tools'))).toBe(false);

    expect(runner.listExistingAvds(sdk)).toEqual(
      expect.arrayContaining(['Medium-Phone-Android-17', 'breadsheet-e2e'])
    );
  });

  test('AVD discovery also reads ANDROID_AVD_HOME when the emulator cannot run', () => {
    const avdHome = fs.mkdtempSync(path.join(os.tmpdir(), 'p9003-avd-'));
    fs.writeFileSync(path.join(avdHome, 'From-Disk.ini'), 'path=/nowhere\n');
    const previous = process.env.ANDROID_AVD_HOME;
    process.env.ANDROID_AVD_HOME = avdHome;
    try {
      // An SDK whose emulator binary does not exist at all.
      expect(runner.listExistingAvds(path.join(avdHome, 'no-such-sdk'))).toEqual(['From-Disk']);
    } finally {
      if (previous === undefined) delete process.env.ANDROID_AVD_HOME;
      else process.env.ANDROID_AVD_HOME = previous;
    }
  });

  test('adb device listing skips the header and reports serials', () => {
    const sdk = fs.mkdtempSync(path.join(os.tmpdir(), 'p9003-adb-'));
    fs.mkdirSync(path.join(sdk, 'platform-tools'), { recursive: true });
    const bin = path.join(sdk, 'platform-tools', 'adb');
    fs.writeFileSync(
      bin,
      '#!/bin/sh\nprintf "List of devices attached\\nemulator-5554\\tdevice\\nemulator-5556\\toffline\\n\\n"\n'
    );
    fs.chmodSync(bin, 0o755);

    expect(runner.listDeviceSerials(sdk)).toEqual(['emulator-5554', 'emulator-5556']);
  });

  test('the Gradle build step is awaited', () => {
    // `runStreaming` returns a Promise. Reading `.code` off it without awaiting
    // makes `res.code !== 0` true on every run, so the runner aborted with
    // "exit undefined" while the Gradle child kept going orphaned.
    // Asserted on the source, not on `fn.constructor.name`: babel-jest
    // transpiles async functions away when this module is required.
    expect(RUNNER_SRC).toMatch(/async function assembleDebug\(/);
    // The build is kicked off before the boot wait and awaited after it, so the two overlap.
    // Both halves matter: starting it without awaiting would install a half-built APK.
    expect(RUNNER_SRC).toMatch(/const assembling = assembleDebug\(/);
    expect(RUNNER_SRC).toMatch(/await assembling;/);
    const unawaited = RUNNER_SRC.split('\n').filter(
      (line) => /(?:^|[^.\w])runStreaming\(/.test(line) && !/await runStreaming\(/.test(line)
        && !/^\s*(?:\*|\/\/)/.test(line) && !/function runStreaming/.test(line)
    );
    expect(unawaited).toEqual([]);
  });

  test('app data is wiped and CAMERA granted only after the APK is installed', () => {
    // Before the install the package does not exist, so `pm clear` / `pm grant`
    // fail: no camera pre-grant on a first run, and no wipe on later runs — the
    // previous run's guest session then survives and both flows stall on
    // "Continue as Guest". Verified against a booted emulator: `pm clear` on a
    // package that is not installed exits 1 with "Failed".
    const install = callSiteIndex(RUNNER_SRC, 'installDebugApk');
    const clear = RUNNER_SRC.indexOf("'pm', 'clear'");
    const grant = RUNNER_SRC.indexOf("'pm', 'grant'");
    expect(install).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(install);
    // `pm clear` revokes runtime permissions, so the grant has to follow it too.
    expect(grant).toBeGreaterThan(clear);
  });

  test('child processes are spawned onto a real file descriptor', () => {
    // `fs.createWriteStream` opens asynchronously, so its `fd` is still null on
    // the next line and `spawn` throws ERR_INVALID_ARG_VALUE for the stdio
    // argument — the runner died the moment it tried to boot the emulator.
    expect(RUNNER_SRC).not.toMatch(/createWriteStream\(/);
    expect(RUNNER_SRC).toMatch(/fs\.openSync\(path\.join\(ARTIFACTS_DIR/);
  });

  test('JDK probing rejects a JDK older than the Gradle build needs', () => {
    expect(runner.javaMajorVersion('openjdk version "21.0.3" 2024-04-16')).toBe(21);
    expect(runner.javaMajorVersion('openjdk version "17" 2021-09-14')).toBe(17);
    expect(runner.javaMajorVersion('java version "1.8.0_401"')).toBe(8);
    expect(runner.javaMajorVersion('no version here')).toBeNull();
    expect(runner.MIN_JAVA_MAJOR).toBe(17);
  });

  test('a failed step throws so the emulator and Metro still get torn down', () => {
    // `process.exit` does not unwind `finally`; every post-boot failure used to
    // orphan a headless emulator and a Metro server holding :8081.
    expect(RUNNER_SRC).toMatch(/function fail\([^)]*\)\s*\{\s*throw new RunnerError/);
    expect(RUNNER_SRC).toMatch(/\}\s*finally\s*\{\s*\n\s*teardown\(/);
  });

  // TICKET-P9-003 — credentials may come from the process environment, so a machine
  // running the agent dev team never has to park a credentials file in a worktree
  // agents can read. Half-set is an error, not a silent mix with the file.
  describe('Supabase credential resolution', () => {
    const KEYS = runner.REQUIRED_APP_ENV;
    let saved;

    beforeEach(() => {
      saved = KEYS.map((k) => process.env[k]);
      KEYS.forEach((k) => delete process.env[k]);
      delete process.env.MAESTRO_SKIP_ENV_CHECK;
    });

    afterEach(() => {
      KEYS.forEach((k, i) => {
        if (saved[i] === undefined) delete process.env[k];
        else process.env[k] = saved[i];
      });
    });

    test('both exported is accepted without touching the filesystem', () => {
      KEYS.forEach((k) => { process.env[k] = 'exported-value'; });
      expect(() => runner.ensureAppCredentials()).not.toThrow();
    });

    test('exporting only one is a hard error naming the missing key', () => {
      process.env[KEYS[0]] = 'exported-value';
      expect(() => runner.ensureAppCredentials()).toThrow(new RegExp(KEYS[1]));
    });

    test('the bypass flag still short-circuits the whole check', () => {
      process.env.MAESTRO_SKIP_ENV_CHECK = '1';
      expect(() => runner.ensureAppCredentials()).not.toThrow();
      delete process.env.MAESTRO_SKIP_ENV_CHECK;
    });
  });


  // TICKET-P9-003 — a floor-only JDK check let JDK 26 through and burnt 10m35s on a Gradle
  // build that could not succeed (JdkImageTransform/jlink on every library module, plus both
  // CMake configure tasks). JDK 25 was measured too: jlink fine, CMake still fails on the
  // JDK 24+ restricted-native-access rule. The bound has to be a range, not a minimum.
  describe('JDK version acceptance', () => {
    test('rejects a JDK older than the Gradle build needs', () => {
      expect(runner.isUsableJavaMajor(11)).toBe(false);
      expect(runner.isUsableJavaMajor(runner.MIN_JAVA_MAJOR - 1)).toBe(false);
    });

    test('rejects a JDK too new for the Android Gradle Plugin', () => {
      expect(runner.isUsableJavaMajor(26)).toBe(false); // observed: 5 Gradle failures
      expect(runner.isUsableJavaMajor(25)).toBe(false); // observed: 2 CMake failures
      expect(runner.isUsableJavaMajor(runner.MAX_JAVA_MAJOR + 1)).toBe(false);
    });

    test('accepts both ends of the supported range', () => {
      expect(runner.isUsableJavaMajor(runner.MIN_JAVA_MAJOR)).toBe(true);
      expect(runner.isUsableJavaMajor(runner.MAX_JAVA_MAJOR)).toBe(true);
    });

    test('parses the major version out of every java -version shape', () => {
      expect(runner.javaMajorVersion('openjdk version "26.0.2" 2026-07-21')).toBe(26);
      expect(runner.javaMajorVersion('openjdk version "25.0.2" 2026-01-20')).toBe(25);
      expect(runner.javaMajorVersion('openjdk version "21.0.3"')).toBe(21);
      expect(runner.javaMajorVersion('java version "1.8.0_401"')).toBe(8);
    });
  });


  // TICKET-P9-003 — a distro can have several JDKs with `default` pointing at the newest,
  // which is the one AGP cannot use. Probing only JAVA_HOME/PATH/JBR made an installed,
  // in-range JDK invisible and told the user to install one they already had.
  describe('system JDK discovery', () => {
    test('finds every java under the given roots, and tolerates absent roots', () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jvms-'));
      for (const name of ['java-21-openjdk', 'java-26-openjdk']) {
        fs.mkdirSync(path.join(root, name, 'bin'), { recursive: true });
        fs.writeFileSync(path.join(root, name, 'bin', 'java'), '');
      }
      fs.mkdirSync(path.join(root, 'not-a-jdk'), { recursive: true });

      const found = runner.systemJavaCandidates([root, '/definitely/not/here']);
      expect(found).toEqual([
        path.join(root, 'java-21-openjdk', 'bin', 'java'),
        path.join(root, 'java-26-openjdk', 'bin', 'java'),
      ]);
    });
  });


  // TICKET-P9-003 — the API-directory match and the Play-Store exclusion are one change,
  // not two. The old scanner matched /^android-(\d+)$/ and an allowlist that between them
  // hid `android-37.1/google_apis_playstore_ps16k`. Widening the match without excluding
  // Play images would make that image selectable — and Maestro's inputText hangs on it
  // indefinitely (measured: 2m59s timeout, vs seconds on android-35;google_apis).
  describe('system image selection', () => {
    function fakeSdk(images) {
      const sdk = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-'));
      for (const img of images) {
        fs.mkdirSync(path.join(sdk, 'system-images', ...img.split('/'), 'x86_64'), { recursive: true });
      }
      return sdk;
    }

    test('accepts a dotted API directory, which the old digits-only match skipped', () => {
      const sdk = fakeSdk(['android-37.1/google_apis']);
      expect(runner.installedSystemImages(sdk).map((i) => i.image)).toEqual([
        'system-images;android-37.1;google_apis;x86_64',
      ]);
    });

    test('never offers a Play-Store image, whatever its suffix', () => {
      const sdk = fakeSdk([
        'android-37.1/google_apis_playstore_ps16k',
        'android-36/google_apis_playstore',
      ]);
      expect(runner.installedSystemImages(sdk)).toEqual([]);
    });

    test('prefers the newest usable API and ignores Play images beside it', () => {
      const sdk = fakeSdk([
        'android-35/google_apis',
        'android-37.1/google_apis_playstore_ps16k',
        'android-34/default',
      ]);
      expect(runner.installedSystemImages(sdk).map((i) => i.image)).toEqual([
        'system-images;android-35;google_apis;x86_64',
        'system-images;android-34;default;x86_64',
      ]);
    });

    test('an SDK with no system-images directory is empty, not a crash', () => {
      expect(runner.installedSystemImages(fs.mkdtempSync(path.join(os.tmpdir(), 'bare-')))).toEqual([]);
    });
  });


  test('the APK is installed only after the build it came from finished', () => {
    // assembleDebug runs concurrently with the emulator boot, so the ordering that used to
    // be implicit in one function is now a real constraint: installing before `await
    // assembling` would push whatever APK happened to be on disk — silently the previous
    // build's, since adb install of a stale file succeeds.
    const awaited = RUNNER_SRC.indexOf('await assembling;');
    const install = callSiteIndex(RUNNER_SRC, 'installDebugApk');
    expect(awaited).toBeGreaterThan(-1);
    expect(install).toBeGreaterThan(awaited);
  });

  test('the native project is regenerated when the config that produced it changes', () => {
    // Regenerating only when android/ is absent left a stale native project behind after an
    // app.json or dependency change, so the suite exercised a build that no longer matched
    // the source.
    expect(RUNNER_SRC).toMatch(/function ensureNativeProject\(/);
    expect(RUNNER_SRC).toMatch(/PREBUILD_STAMP/);
    expect(RUNNER_SRC).toMatch(/args\.push\('--clean'\)/);
  });


  // TICKET-P9-003 — overlapping the Gradle build with the emulator boot helps on a developer
  // machine and breaks a small CI runner: a cold RN build saturates every core and the
  // emulator never reaches adb inside the boot timeout. Observed on a 2-vCPU GitHub runner.
  describe('build/boot overlap policy', () => {
    const saved = process.env.MAESTRO_OVERLAP_BUILD;
    afterEach(() => {
      if (saved === undefined) delete process.env.MAESTRO_OVERLAP_BUILD;
      else process.env.MAESTRO_OVERLAP_BUILD = saved;
    });

    test('follows the CPU count by default', () => {
      delete process.env.MAESTRO_OVERLAP_BUILD;
      expect(runner.canOverlapBuildAndBoot()).toBe(runner.cpuCount() >= 4);
    });

    test('MAESTRO_OVERLAP_BUILD forces the decision either way', () => {
      process.env.MAESTRO_OVERLAP_BUILD = '0';
      expect(runner.canOverlapBuildAndBoot()).toBe(false);
      process.env.MAESTRO_OVERLAP_BUILD = '1';
      expect(runner.canOverlapBuildAndBoot()).toBe(true);
    });

    test('both paths still install only after the build they came from', () => {
      // The sequential branch awaits assembleDebug directly; the parallel one awaits the
      // pending promise. Either way the install must follow, or a stale APK gets pushed.
      expect(RUNNER_SRC).toMatch(/await assembling;/);
      expect(RUNNER_SRC).toMatch(/await assembleDebug\(sdk, java\);/);
      const install = callSiteIndex(RUNNER_SRC, 'installDebugApk');
      expect(install).toBeGreaterThan(RUNNER_SRC.indexOf('await assembling;'));
      expect(install).toBeGreaterThan(RUNNER_SRC.indexOf('await assembleDebug(sdk, java);'));
    });
  });


  // TICKET-P9-003 — avdmanager writes to $ANDROID_SDK_HOME/.android/avd while the emulator
  // searches $ANDROID_SDK_HOME/avd, so on a machine with ANDROID_SDK_HOME set (GitHub's
  // hosted runners) creation reported success and the boot failed with "Unknown AVD name",
  // then sat until the boot timeout. Both honour ANDROID_AVD_HOME first, so every tool that
  // touches an AVD must be handed the same one.
  describe('AVD home is pinned for every tool', () => {
    test('creation, listing and boot all pass ANDROID_AVD_HOME', () => {
      expect(RUNNER_SRC).toMatch(/function avdHome\(\)/);
      // avdmanager (via toolEnv), `emulator -list-avds`, and the boot spawn.
      const uses = RUNNER_SRC.match(/ANDROID_AVD_HOME: avdHome\(\)/g) || [];
      expect(uses.length).toBeGreaterThanOrEqual(3);
    });

    test('the AVD home is created before avdmanager runs', () => {
      const mkdir = RUNNER_SRC.indexOf('fs.mkdirSync(avdHome()');
      const create = RUNNER_SRC.indexOf('create avd');
      expect(mkdir).toBeGreaterThan(-1);
      expect(create).toBeGreaterThan(mkdir);
    });
  });

});
