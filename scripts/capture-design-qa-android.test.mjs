import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { encodeRgbaPng } from './compose-design-comparison.mjs';

import {
  assertCaptureUiDump,
  buildAdbArguments,
  buildAndroidBundleUrl,
  buildDevelopmentClientUrl,
  buildLaunchArguments,
  buildMetroInvocation,
  buildPreviewMarker,
  buildStageDirectories,
  childHasExited,
  clearExistingAndroidSystemErrorDialog,
  displayStatesEqual,
  findAndroidDialogButtonCenter,
  hasAndroidSystemErrorDialog,
  inspectPng,
  isTcpPortOpen,
  parseArguments,
  parseDisplayState,
  parseStageList,
  prepareStageDirectories,
  previewDumpMatches,
  prepareAndroidDevice,
  publishStageDirectory,
  restoreDeviceState,
  runCommand,
  shouldLaunchPreview,
  stopMetro,
  waitForCaptureDimensions,
  waitForPreview,
} from './capture-design-qa-android.mjs';

function truncatedPngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

test('parses explicit serial and per-stage states', () => {
  const options = parseArguments([
    '--adb', 'D:/Android/adb.exe',
    '--adb-server-port', '5038',
    '--npx', 'C:/node/npx.cmd',
    '--serial', 'emulator-5554',
    '--output', './artifacts/run',
    '--stages', 'auth-login,device-provisioning:unavailable',
    '--port', '8181',
  ]);
  assert.equal(options.serial, 'emulator-5554');
  assert.equal(options.adbServerPort, 5038);
  assert.equal(options.port, 8181);
  assert.equal(options.timeoutMilliseconds, 240_000);
  assert.deepEqual(options.stages, [
    { stage: 'auth-login', state: 'default' },
    { stage: 'device-provisioning', state: 'unavailable' },
  ]);
});

test('builds fail-closed Metro environment and development-client launch command', () => {
  const options = {
    activity: '.MainActivity',
    adbServerPort: 5038,
    npxPath: 'npx.cmd',
    packageName: 'com.doso.robot',
    port: 8087,
    scheme: 'doso',
    serial: 'emulator-5554',
  };
  const invocation = buildMetroInvocation(options, { stage: 'main-profile', state: 'default' });
  assert.equal(
    buildAndroidBundleUrl(options),
    'http://127.0.0.1:8087/index.bundle?platform=android&dev=true&lazy=true&minify=false&app=com.doso.robot&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server',
  );
  if (process.platform === 'win32') {
    assert.equal(invocation.command, process.execPath);
    assert.deepEqual(invocation.args, [
      path.resolve('node_modules', 'expo', 'bin', 'cli'),
      'start', '--dev-client', '--clear', '--host', 'lan', '--port', '8087', '--max-workers', '2',
    ]);
  } else {
    assert.equal(invocation.command, 'npx.cmd');
    assert.deepEqual(invocation.args, ['expo', 'start', '--dev-client', '--clear', '--host', 'lan', '--port', '8087', '--max-workers', '2']);
  }
  assert.equal(invocation.env.EXPO_PUBLIC_DESIGN_QA, '1');
  assert.equal(invocation.env.EXPO_PUBLIC_DESIGN_QA_CAPTURE, '1');
  assert.equal(invocation.env.EXPO_PUBLIC_DESIGN_QA_STAGE, 'main-profile');
  assert.equal(invocation.env.EXPO_PUBLIC_DESIGN_QA_STATE, 'default');
  assert.equal(buildDevelopmentClientUrl(options), 'doso://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8087');
  assert.equal(buildPreviewMarker({ stage: 'main-profile', state: 'default' }), 'design-qa-preview:main-profile:default');
  assert.deepEqual(buildAdbArguments(options, ['get-state']), ['-P', '5038', '-s', 'emulator-5554', 'get-state']);
  assert.deepEqual(buildLaunchArguments(options), [
    '-P', '5038',
    '-s', 'emulator-5554',
    'shell', 'am', 'start', '-S',
    '-n', 'com.doso.robot/.MainActivity',
    '-a', 'android.intent.action.VIEW',
    '-d', 'doso://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8087',
  ]);
  assert.equal(previewDumpMatches(options, { stage: 'main-profile', state: 'default' }, [
    '<hierarchy>',
    '<node package="com.doso.robot" content-desc="design-qa-preview:main-profile:default" />',
    '</hierarchy>',
  ].join('')), true);
  assert.equal(previewDumpMatches(options, { stage: 'main-profile', state: 'default' }, [
    '<node package="com.other.app" content-desc="design-qa-preview:main-profile:default" />',
  ].join('')), false);
  assert.equal(previewDumpMatches(options, { stage: 'auth-login', state: 'default' }, [
    '<node package="com.doso.robot" content-desc="design-qa-preview:main-profile:default" />',
  ].join('')), false);
  assert.equal(previewDumpMatches(options, { stage: 'main-profile', state: 'default' }, [
    '<node package="com.doso.robot" content-desc="ordinary-content" />',
    '<node package="com.other.app" content-desc="design-qa-preview:main-profile:default" />',
  ].join('')), false);
});

test('rejects Android error dialogs and missing preview markers before capture', () => {
  const options = { packageName: 'com.doso.robot' };
  const stage = { stage: 'device-ble-discovery', state: 'default' };
  const marker = buildPreviewMarker(stage);
  const preview = `<node package="com.doso.robot" content-desc="${marker}" />`;
  assert.doesNotThrow(() => assertCaptureUiDump(options, stage, preview));
  assert.equal(hasAndroidSystemErrorDialog('<node text="DOSO isn\'t responding" />'), true);
  assert.deepEqual(findAndroidDialogButtonCenter(
    '<node resource-id="android:id/aerr_wait" bounds="[26,471][364,519]" />',
    'aerr_wait',
  ), { x: 195, y: 495 });
  const commands = [];
  assert.equal(clearExistingAndroidSystemErrorDialog(options, {
    adbFn: (_options, args) => {
      commands.push(args);
      return args[0] === 'exec-out'
        ? { stdout: '<node resource-id="android:id/aerr_close" bounds="[26,423][364,471]" />' }
        : { stdout: '' };
    },
  }), true);
  assert.deepEqual(commands[1], ['shell', 'input', 'tap', '195', '447']);
  assert.throws(
    () => assertCaptureUiDump(options, stage, `${preview}<node resource-id="android:id/aerr_close" text="Close app" />`),
    /system error dialog/,
  );
  assert.throws(() => assertCaptureUiDump(options, stage, '<node package="com.doso.robot" />'), /marker disappeared/);
});

test('wakes and unlocks the Android device before capture setup', () => {
  const calls = [];
  prepareAndroidDevice({}, { adbFn: (_options, args) => { calls.push(args); return { status: 0 }; } });
  assert.deepEqual(calls, [
    ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP'],
    ['shell', 'wm', 'dismiss-keyguard'],
  ]);
});

test('keeps choosing Wait within the overall timeout before accepting a stable preview', async () => {
  const options = { packageName: 'com.doso.robot', timeoutMilliseconds: 90_000 };
  const stage = { stage: 'main-tasks', state: 'default' };
  const marker = `<node package="com.doso.robot" content-desc="${buildPreviewMarker(stage)}" />`;
  const responses = [
    ...Array.from({ length: 6 }, () => '<node resource-id="android:id/aerr_wait" bounds="[26,460][364,508]" />'),
    marker,
    marker,
  ];
  const calls = [];
  const delays = [];
  await waitForPreview(options, stage, {
    adbFn: (_options, args) => {
      calls.push(args);
      return { stdout: args[0] === 'exec-out' ? responses.shift() ?? marker : '' };
    },
    delayFn: async (milliseconds) => { delays.push(milliseconds); },
    nowFn: () => 0,
  });
  assert.deepEqual(calls[1], ['shell', 'input', 'tap', '195', '484']);
  assert.deepEqual(delays, [...Array(6).fill(8_000), 350, 1_200]);
});

test('rejects ambiguous devices, invalid stages, duplicate stages, and unsafe numeric arguments', () => {
  assert.throws(() => parseArguments(['--output', 'x', '--stages', 'auth-login']), /--serial is required/);
  assert.throws(() => parseArguments(['--serial', 'a b', '--output', 'x', '--stages', 'auth-login']), /explicit ADB device/);
  assert.throws(() => parseStageList('Auth Login'), /Invalid stage ID/);
  assert.throws(() => parseStageList('auth-login,auth-login:error'), /duplicate/);
  assert.throws(
    () => parseArguments(['--serial', 'device-1', '--output', 'x', '--stages', 'auth-login', '--port', '80']),
    /--port must be between/,
  );
  assert.throws(
    () => parseArguments(['--serial', 'device-1', '--output', 'x', '--stages', 'auth-login', '--adb-server-port', '70000']),
    /--adb-server-port must be between/,
  );
  assert.throws(
    () => parseArguments(['--serial', 'device-1', '--output', 'x', '--stages', 'auth-login', '--port', '8087junk']),
    /--port must be an integer/,
  );
  assert.deepEqual(buildAdbArguments({ adbServerPort: null, serial: 'device-1' }, ['get-state']), ['-s', 'device-1', 'get-state']);
});

test('reads exact PNG dimensions and SHA-256 and rejects malformed screenshots', () => {
  const bytes = encodeRgbaPng(2, 3, Buffer.alloc(2 * 3 * 4, 255));
  assert.deepEqual(inspectPng(bytes), {
    height: 3,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width: 2,
  });
  assert.throws(() => inspectPng(Buffer.from('not a png')), /not a PNG/);
  assert.throws(() => inspectPng(truncatedPngHeader(390, 844)), /not a PNG|missing IDAT|missing IEND/i);
});

test('cold-starts only the first capture state', () => {
  assert.equal(shouldLaunchPreview(0), true);
  assert.equal(shouldLaunchPreview(1), false);
  assert.equal(shouldLaunchPreview(2), false);
});

test('retries only transient command timeouts and returns the eventual result', () => {
  let calls = 0;
  const success = runCommand('adb', ['get-state'], {
    retryTimeouts: 2,
    spawnSyncFn: () => {
      calls += 1;
      return calls < 3
        ? { error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), status: null }
        : { error: null, status: 0, stdout: 'device' };
    },
  });
  assert.equal(calls, 3);
  assert.equal(success.stdout, 'device');
  assert.throws(() => runCommand('adb', ['get-state'], {
    retryTimeouts: 2,
    spawnSyncFn: () => ({ error: new Error('permission denied'), status: null }),
  }), /permission denied/);
});

test('waits until Android rotation produces the requested screenshot dimensions', async () => {
  const portrait = encodeRgbaPng(2, 3, Buffer.alloc(2 * 3 * 4, 255));
  const landscape = encodeRgbaPng(3, 2, Buffer.alloc(3 * 2 * 4, 255));
  const screenshots = [null, portrait, landscape];
  const adbCalls = [];
  const delays = [];
  let calls = 0;
  const metadata = await waitForCaptureDimensions(
    { timeoutMilliseconds: 15_000 },
    { filename: 'app-landscape.png', height: 2, rotation: 1, width: 3 },
    {
      adbFn: (_options, args) => {
        adbCalls.push(args);
        if (args[0] === 'shell') return { error: null, status: 0, stdout: '' };
        const screenshot = screenshots[calls++];
        return screenshot
          ? { error: null, status: 0, stdout: screenshot }
          : { error: new Error('spawnSync adb ETIMEDOUT'), status: null, stdout: Buffer.alloc(0) };
      },
      delayFn: async (milliseconds) => { delays.push(milliseconds); },
      nowFn: () => 0,
    },
  );
  assert.deepEqual(adbCalls[0], ['shell', 'wm', 'user-rotation', 'lock', '1']);
  assert.equal(calls, 3);
  assert.equal(delays.at(-1), 2_000);
  assert.equal(metadata.width, 3);
  assert.equal(metadata.height, 2);
});

test('parses only override display settings so reset remains the default restoration', () => {
  const overridden = parseDisplayState({
    density: 'Physical density: 420\nOverride density: 160\n',
    nightMode: 'Night mode: auto\n',
    rotation: 'lock 1\n',
    size: 'Physical size: 1080x2400\nOverride size: 390x844\n',
  });
  assert.deepEqual(overridden, {
    density: 160,
    nightMode: 'auto',
    rotation: { mode: 'lock', value: 1 },
    size: '390x844',
  });
  assert.deepEqual(parseDisplayState({
    density: 'Physical density: 420\n',
    nightMode: 'Night mode: no\n',
    rotation: 'free\n',
    size: 'Physical size: 1080x2400\n',
  }), {
    density: null,
    nightMode: 'no',
    rotation: { mode: 'free', value: 0 },
    size: null,
  });
  assert.equal(displayStatesEqual(overridden, { ...overridden }), true);
  assert.equal(displayStatesEqual(overridden, { ...overridden, nightMode: 'yes' }), false);
  assert.throws(() => parseDisplayState({
    density: 'unknown',
    nightMode: 'Night mode: no\n',
    rotation: 'free 0\n',
    size: 'Physical size: 1080x2400\n',
  }), /physical Android display density/);
  assert.equal(parseDisplayState({
    density: 'Physical density: 420\n',
    nightMode: 'Night mode: custom_schedule\n',
    rotation: 'free 0\n',
    size: 'Physical size: 1080x2400\n',
  }).nightMode, 'custom_schedule');
  assert.throws(() => parseDisplayState({
    density: 'Physical density: 420\n',
    nightMode: 'Night mode: no\n',
    rotation: 'free 0\n',
    size: 'Physical size: 1080x2400\nOverride size: 390 by 844\n',
  }), /override display size/);
  assert.throws(() => parseDisplayState({
    density: 'Physical density: 420\nOverride density: dense\n',
    nightMode: 'Night mode: no\n',
    rotation: 'free 0\n',
    size: 'Physical size: 1080x2400\n',
  }), /override display density/);
  assert.throws(() => parseDisplayState({
    density: 'Physical density: 420\n',
    nightMode: 'Night mode: custom\n',
    rotation: 'free 0\n',
    size: 'Physical size: 1080x2400\n',
  }), /Unsupported Android night mode/);
});

test('detects a stale Metro listener and observes that its port closes', async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  assert.equal(await isTcpPortOpen(address.port), true);
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  assert.equal(await isTcpPortOpen(address.port), false);
});

test('fails closed when Metro port closes but the spawned process never exits', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.pid = 424242;
  child.kill = () => true;
  assert.equal(childHasExited(child), false);
  await assert.rejects(
    stopMetro(child, { port: 8087 }, {
      delayFn: async () => {},
      platform: 'win32',
      runCommandFn: () => ({ error: null, status: 0, stderr: '' }),
      waitForPortClosedFn: async () => {},
    }),
    /remained alive after process-tree termination/,
  );
  child.signalCode = 'SIGKILL';
  assert.equal(childHasExited(child), true);
});

test('aggregates display restore command failures and rejects mismatched rereads', () => {
  const original = {
    density: 160,
    nightMode: 'no',
    rotation: { mode: 'lock', value: 1 },
    size: '390x844',
  };
  let callCount = 0;
  assert.throws(() => restoreDeviceState({}, original, {
    adbFn: () => {
      callCount += 1;
      return callCount === 1
        ? { error: null, status: 1, stderr: 'restore denied' }
        : { error: null, status: 0, stderr: '' };
    },
    readDeviceStateFn: () => original,
  }), /Android display restoration failed/);
  assert.equal(callCount, 4);
  assert.throws(() => restoreDeviceState({}, original, {
    adbFn: () => ({ error: null, status: 0, stderr: '' }),
    readDeviceStateFn: () => ({ ...original, nightMode: 'yes' }),
  }), /Android display restoration failed/);

  const freeOriginal = { ...original, rotation: { mode: 'free', value: 0 } };
  const restoreCommands = [];
  restoreDeviceState({}, freeOriginal, {
    adbFn: (_options, args) => {
      restoreCommands.push(args);
      return { error: null, status: 0, stderr: '' };
    },
    readDeviceStateFn: () => freeOriginal,
  });
  assert.deepEqual(restoreCommands[0], ['shell', 'wm', 'user-rotation', 'free']);
});

test('publishes a complete temporary stage atomically and refuses overwrite', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'doso-android-capture-'));
  try {
    const directories = buildStageDirectories(root, 'auth-login', 1234);
    prepareStageDirectories(directories);
    writeFileSync(path.join(directories.temporaryDirectory, 'app-capture.json'), '{"ok":true}\n');
    publishStageDirectory(directories);
    assert.equal(existsSync(directories.temporaryDirectory), false);
    assert.equal(readFileSync(path.join(directories.finalDirectory, 'app-capture.json'), 'utf8'), '{"ok":true}\n');
    assert.throws(() => prepareStageDirectories(directories), /Refusing to overwrite/);

    const raceDirectories = buildStageDirectories(root, 'auth-register', 5678);
    prepareStageDirectories(raceDirectories);
    writeFileSync(raceDirectories.finalDirectory, 'racing destination');
    assert.throws(() => publishStageDirectory(raceDirectories), /Refusing to overwrite/);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});
