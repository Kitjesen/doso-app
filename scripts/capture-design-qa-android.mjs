import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { decodePng } from './verify-design-acceptance-evidence.mjs';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PAGE_ID = /^[a-z0-9-]+$/;
const STATE_ID = /^[a-z0-9-]+$/;
const ANDROID_NIGHT_MODES = new Set(['auto', 'custom_bedtime', 'custom_schedule', 'no', 'yes']);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseIntegerOption(name, value) {
  if (!/^\d+$/.test(String(value ?? ''))) throw new Error(`${name} must be an integer`);
  return Number(value);
}

export function parseStageList(value, defaultState = 'default') {
  if (!STATE_ID.test(defaultState)) throw new Error('--state must be a lowercase state ID');
  const stages = String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(':');
      const stage = separator === -1 ? entry : entry.slice(0, separator);
      const state = separator === -1 ? defaultState : entry.slice(separator + 1);
      if (!PAGE_ID.test(stage)) throw new Error(`Invalid stage ID: ${stage || entry}`);
      if (!STATE_ID.test(state)) throw new Error(`Invalid state ID for ${stage}: ${state || '(empty)'}`);
      return { stage, state };
    });

  if (stages.length === 0) throw new Error('--stages requires at least one stage');
  const keys = stages.map(({ stage }) => stage);
  if (new Set(keys).size !== keys.length) throw new Error('--stages must not contain duplicate stage IDs');
  return stages;
}

export function parseArguments(argv) {
  const options = {
    activity: '.MainActivity',
    adbPath: process.env.DOSO_ADB_PATH ?? 'adb',
    adbServerPort: null,
    density: 160,
    npxPath: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    outputDirectory: null,
    packageName: 'com.doso.robot',
    port: 8081,
    scheme: 'doso',
    serial: null,
    stageValue: null,
    state: 'default',
    timeoutMilliseconds: 240_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [name, inlineValue] = argument.split('=', 2);
    if (!name.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`);
    const value = inlineValue ?? argv[++index];
    if (!value) throw new Error(`${name} requires a value`);
    if (name === '--activity') options.activity = value;
    else if (name === '--adb') options.adbPath = value;
    else if (name === '--adb-server-port') options.adbServerPort = parseIntegerOption(name, value);
    else if (name === '--density') options.density = parseIntegerOption(name, value);
    else if (name === '--npx') options.npxPath = value;
    else if (name === '--output') options.outputDirectory = value;
    else if (name === '--package') options.packageName = value;
    else if (name === '--port') options.port = parseIntegerOption(name, value);
    else if (name === '--scheme') options.scheme = value;
    else if (name === '--serial') options.serial = value;
    else if (name === '--stages') options.stageValue = value;
    else if (name === '--state') options.state = value;
    else if (name === '--timeout-ms') options.timeoutMilliseconds = parseIntegerOption(name, value);
    else throw new Error(`Unknown argument: ${name}`);
  }

  if (!options.serial || /\s/.test(options.serial)) throw new Error('--serial is required and must identify one explicit ADB device');
  if (!options.outputDirectory) throw new Error('--output is required');
  if (!options.stageValue) throw new Error('--stages is required');
  if (!/^[A-Za-z][A-Za-z0-9+.-]*$/.test(options.scheme)) throw new Error('--scheme must be a valid URI scheme');
  if (!/^[A-Za-z0-9_.]+$/.test(options.packageName)) throw new Error('--package must be a valid Android package name');
  if (!/^\.?[A-Za-z0-9_.$]+$/.test(options.activity)) throw new Error('--activity must be a valid Android activity name');
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('--port must be between 1024 and 65535');
  if (options.adbServerPort !== null && (!Number.isInteger(options.adbServerPort) || options.adbServerPort < 1 || options.adbServerPort > 65535)) {
    throw new Error('--adb-server-port must be between 1 and 65535');
  }
  if (!Number.isInteger(options.density) || options.density < 72 || options.density > 1000) throw new Error('--density must be between 72 and 1000');
  if (!Number.isInteger(options.timeoutMilliseconds) || options.timeoutMilliseconds < 5_000 || options.timeoutMilliseconds > 300_000) {
    throw new Error('--timeout-ms must be between 5000 and 300000');
  }

  return {
    ...options,
    outputDirectory: path.resolve(options.outputDirectory),
    stages: parseStageList(options.stageValue, options.state),
  };
}

export function buildMetroInvocation(options, { stage, state }, platform = process.platform) {
  const startArguments = [
    'start',
    '--dev-client',
    '--clear',
    '--host',
    'lan',
    '--port',
    String(options.port),
    '--max-workers',
    '2',
  ];
  const requiresNodeCli = platform === 'win32' && /\.(?:cmd|bat)$/i.test(options.npxPath);
  return {
    command: requiresNodeCli ? process.execPath : options.npxPath,
    args: requiresNodeCli
      ? [path.resolve('node_modules', 'expo', 'bin', 'cli'), ...startArguments]
      : ['expo', ...startArguments],
    env: {
      ...process.env,
      CI: '1',
      EXPO_PUBLIC_DESIGN_QA: '1',
      EXPO_PUBLIC_DESIGN_QA_CAPTURE: '1',
      EXPO_PUBLIC_DESIGN_QA_STAGE: stage,
      EXPO_PUBLIC_DESIGN_QA_STATE: state,
    },
  };
}

export function buildDevelopmentClientUrl({ port, scheme }) {
  const bundleUrl = `http://127.0.0.1:${port}`;
  return `${scheme}://expo-development-client/?url=${encodeURIComponent(bundleUrl)}`;
}

export function buildPreviewMarker({ stage, state }) {
  return `design-qa-preview:${stage}:${state}`;
}

export function shouldLaunchPreview(captureIndex) {
  return captureIndex === 0;
}

export function previewDumpMatches(options, stageSpec, xml) {
  const expectedMarker = buildPreviewMarker(stageSpec);
  const nodes = String(xml).match(/<node\b[^>]*>/gi) ?? [];
  return nodes.some((node) => {
    const nodePackage = /\bpackage="([^"]*)"/i.exec(node)?.[1];
    const nodeDescription = /\bcontent-desc="([^"]*)"/i.exec(node)?.[1];
    return nodePackage === options.packageName && nodeDescription === expectedMarker;
  });
}

export function hasAndroidSystemErrorDialog(xml) {
  return /resource-id="android:id\/aerr_|(?:isn['’]?t|not) responding|无响应|关闭应用|Close app/i.test(String(xml));
}

export function findAndroidDialogButtonCenter(xml, resourceId) {
  const node = String(xml).match(new RegExp(`<node\\b[^>]*resource-id="android:id/${resourceId}"[^>]*>`, 'i'))?.[0];
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i);
  if (!bounds) return null;
  return {
    x: Math.round((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.round((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

export function clearExistingAndroidSystemErrorDialog(options, adapters = {}) {
  const adbFn = adapters.adbFn ?? adb;
  const dump = adbFn(options, ['exec-out', 'uiautomator', 'dump', '/dev/tty'], { tolerateFailure: true });
  const closeButton = findAndroidDialogButtonCenter(dump.stdout, 'aerr_close');
  if (!closeButton) return false;
  adbFn(options, ['shell', 'input', 'tap', String(closeButton.x), String(closeButton.y)]);
  return true;
}

export function prepareAndroidDevice(options, adapters = {}) {
  const adbFn = adapters.adbFn ?? adb;
  adbFn(options, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']);
  adbFn(options, ['shell', 'wm', 'dismiss-keyguard']);
}

export function assertCaptureUiDump(options, stageSpec, xml) {
  const dump = String(xml);
  if (hasAndroidSystemErrorDialog(dump)) {
    throw new Error('Android system error dialog is covering the design-QA preview');
  }
  if (!previewDumpMatches(options, stageSpec, dump)) {
    throw new Error(`Design-QA preview marker disappeared before capture: ${buildPreviewMarker(stageSpec)}`);
  }
}

export function buildAdbArguments(options, args) {
  return [
    ...(options.adbServerPort === null || options.adbServerPort === undefined ? [] : ['-P', String(options.adbServerPort)]),
    '-s', options.serial,
    ...args,
  ];
}

export function buildLaunchArguments(options) {
  return buildAdbArguments(options, [
    // Preview readiness is verified by waitForPreview below. Avoid `-W` here:
    // on Windows, adb can remain blocked waiting for ActivityManager even after
    // the child-process timeout, which leaves an otherwise healthy capture stuck.
    'shell', 'am', 'start', '-S',
    '-n', `${options.packageName}/${options.activity}`,
    '-a', 'android.intent.action.VIEW',
    '-d', buildDevelopmentClientUrl(options),
  ]);
}

export function inspectPng(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Screenshot is not a PNG');
  }
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let sawHeader = false;
  let sawImageData = false;
  let sawEnd = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error('PNG has a truncated chunk header');
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) throw new Error(`PNG chunk ${type} is truncated`);
    if (!sawHeader && type !== 'IHDR') throw new Error('PNG first chunk must be IHDR');
    if (type === 'IHDR') {
      if (sawHeader || length !== 13) throw new Error('PNG must contain one 13-byte IHDR chunk');
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
      sawHeader = true;
    } else if (type === 'IDAT') {
      sawImageData ||= length > 0;
    } else if (type === 'IEND') {
      if (length !== 0) throw new Error('PNG IEND chunk must be empty');
      sawEnd = true;
      offset = chunkEnd;
      break;
    }
    offset = chunkEnd;
  }
  if (!sawHeader) throw new Error('PNG is missing IHDR');
  if (!sawImageData) throw new Error('PNG is missing IDAT image data');
  if (!sawEnd) throw new Error('PNG is missing IEND');
  if (offset !== bytes.length) throw new Error('PNG contains trailing bytes after IEND');
  if (width === 0 || height === 0) throw new Error('PNG dimensions must be positive');
  return {
    height,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    width,
  };
}

export function parseDisplayState({ density, nightMode, rotation, size }) {
  const physicalSize = /^Physical size:[ \t]*(\d+)x(\d+)[ \t]*$/im.exec(size);
  const physicalDensity = /^Physical density:[ \t]*(\d+)[ \t]*$/im.exec(density);
  const overrideSize = /^Override size:[ \t]*(\d+)x(\d+)[ \t]*$/im.exec(size);
  const overrideDensity = /^Override density:[ \t]*(\d+)[ \t]*$/im.exec(density);
  const rotationMatch = /^(lock|free)(?:[ \t]+(\d+))?[ \t]*$/im.exec(rotation);
  const nightMatch = /^Night mode:[ \t]*([a-z][a-z0-9_-]*)[ \t]*$/im.exec(nightMode);
  if (!physicalSize) throw new Error('Unable to parse the physical Android display size');
  if (!physicalDensity) throw new Error('Unable to parse the physical Android display density');
  if (/^Override size:/im.test(size) && !overrideSize) throw new Error('Unable to parse the Android override display size');
  if (/^Override density:/im.test(density) && !overrideDensity) throw new Error('Unable to parse the Android override display density');
  if (!rotationMatch || (rotationMatch[1].toLowerCase() === 'lock' && rotationMatch[2] === undefined)) {
    throw new Error('Unable to parse the Android user-rotation state');
  }
  if (!nightMatch) throw new Error('Unable to parse the Android night-mode state');
  const parsedNightMode = nightMatch[1].toLowerCase();
  if (!ANDROID_NIGHT_MODES.has(parsedNightMode)) throw new Error(`Unsupported Android night mode: ${parsedNightMode}`);
  return {
    density: overrideDensity ? Number.parseInt(overrideDensity[1], 10) : null,
    nightMode: parsedNightMode,
    rotation: {
      mode: rotationMatch[1].toLowerCase(),
      value: rotationMatch[2] === undefined ? 0 : Number.parseInt(rotationMatch[2], 10),
    },
    size: overrideSize ? `${overrideSize[1]}x${overrideSize[2]}` : null,
  };
}

export function displayStatesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function runCommand(command, args, {
  encoding = 'utf8',
  retryTimeouts = 0,
  spawnSyncFn = spawnSync,
  timeout = 30_000,
  tolerateFailure = false,
} = {}) {
  let result;
  for (let attempt = 0; attempt <= retryTimeouts; attempt += 1) {
    result = spawnSyncFn(command, args, {
      encoding,
      maxBuffer: 20 * 1024 * 1024,
      timeout,
      windowsHide: true,
    });
    if (result.error?.code !== 'ETIMEDOUT' || attempt === retryTimeouts) break;
  }
  if (result.error && !tolerateFailure) throw result.error;
  if (result.status !== 0 && !tolerateFailure) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : String(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${stderr.trim()}`);
  }
  return result;
}

function adb(options, args, settings = {}) {
  return runCommand(options.adbPath, buildAdbArguments(options, args), { retryTimeouts: 2, ...settings });
}

function readDeviceState(options) {
  return parseDisplayState({
    density: adb(options, ['shell', 'wm', 'density']).stdout,
    nightMode: adb(options, ['shell', 'cmd', 'uimode', 'night']).stdout,
    rotation: adb(options, ['shell', 'wm', 'user-rotation']).stdout,
    size: adb(options, ['shell', 'wm', 'size']).stdout,
  });
}

export function restoreDeviceState(options, original, adapters = {}) {
  const adbFn = adapters.adbFn ?? adb;
  const readDeviceStateFn = adapters.readDeviceStateFn ?? readDeviceState;
  const errors = [];
  const restore = (args) => {
    const result = adbFn(options, args, { tolerateFailure: true });
    if (result.error || result.status !== 0) {
      const issue = result.error?.message || String(result.stderr ?? '').trim() || `status ${result.status}`;
      errors.push(new Error(`ADB display restore failed (${args.join(' ')}): ${issue}`));
    }
  };
  restore(original.rotation?.mode === 'lock'
    ? ['shell', 'wm', 'user-rotation', 'lock', String(original.rotation.value)]
    : ['shell', 'wm', 'user-rotation', 'free']);
  restore(['shell', 'cmd', 'uimode', 'night', original.nightMode]);
  restore(original.size ? ['shell', 'wm', 'size', original.size] : ['shell', 'wm', 'size', 'reset']);
  restore(original.density ? ['shell', 'wm', 'density', String(original.density)] : ['shell', 'wm', 'density', 'reset']);
  try {
    const restored = readDeviceStateFn(options);
    if (!displayStatesEqual(restored, original)) {
      errors.push(new Error(`Android display state was not restored: expected ${JSON.stringify(original)}, received ${JSON.stringify(restored)}`));
    }
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  if (errors.length > 0) throw new AggregateError(errors, 'Android display restoration failed');
}

export function buildAndroidBundleUrl({ packageName, port }) {
  return `http://127.0.0.1:${port}/index.bundle?platform=android&dev=true&lazy=true&minify=false&app=${encodeURIComponent(packageName)}&modulesOnly=false&runModule=true&excludeSource=true&sourcePaths=url-server`;
}

async function waitForMetro(options, child, readSpawnError = () => null) {
  const deadline = Date.now() + options.timeoutMilliseconds;
  let lastIssue = 'Metro has not answered yet';
  while (Date.now() < deadline) {
    const spawnError = readSpawnError();
    if (spawnError) throw new Error(`Metro failed to start: ${spawnError.message}`);
    if (childHasExited(child)) throw new Error(`Metro exited before readiness (code ${child.exitCode ?? child.signalCode})`);
    try {
      const response = await fetch(`http://127.0.0.1:${options.port}/status`);
      const body = await response.text();
      if (response.ok && body.includes('packager-status:running')) {
        const bundle = await fetch(buildAndroidBundleUrl(options));
        if (bundle.ok) {
          await bundle.arrayBuffer();
          return;
        }
        lastIssue = `Metro bundle ${bundle.status}: ${(await bundle.text()).slice(0, 120)}`;
        await delay(250);
        continue;
      }
      lastIssue = `Metro status ${response.status}: ${body.slice(0, 120)}`;
    } catch (error) {
      lastIssue = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Metro did not become ready: ${lastIssue}`);
}

export function isTcpPortOpen(port, timeoutMilliseconds = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeoutMilliseconds, () => finish(false));
  });
}

async function waitForPortClosed(port, timeoutMilliseconds = 5_000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (!(await isTcpPortOpen(port))) return;
    await delay(200);
  }
  throw new Error(`Metro port ${port} remained open after process-tree termination`);
}

export function childHasExited(child) {
  return child.exitCode != null || child.signalCode != null;
}

export async function stopMetro(child, options, adapters = {}) {
  const delayFn = adapters.delayFn ?? delay;
  const platform = adapters.platform ?? process.platform;
  const runCommandFn = adapters.runCommandFn ?? runCommand;
  const waitForPortClosedFn = adapters.waitForPortClosedFn ?? waitForPortClosed;
  if (!child) {
    await waitForPortClosedFn(options.port);
    return;
  }
  if (childHasExited(child)) {
    await waitForPortClosedFn(options.port);
    return;
  }
  const terminationIssues = [];
  const taskkill = () => {
    const result = runCommandFn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { tolerateFailure: true });
    if (result.error || result.status !== 0) {
      terminationIssues.push(result.error?.message || String(result.stderr ?? '').trim() || `status ${result.status}`);
    }
  };
  if (platform === 'win32' && child.pid) {
    taskkill();
  } else if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGINT');
    } catch {
      child.kill('SIGINT');
    }
  } else {
    child.kill('SIGINT');
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delayFn(3_000),
  ]);
  if (childHasExited(child)) {
    await waitForPortClosedFn(options.port);
    return;
  }
  if (platform === 'win32' && child.pid) {
    taskkill();
  } else if (child.pid) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  } else {
    child.kill('SIGKILL');
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delayFn(3_000),
  ]);
  await waitForPortClosedFn(options.port);
  if (!childHasExited(child)) {
    const detail = terminationIssues.length > 0 ? `; taskkill issues: ${terminationIssues.join(' | ')}` : '';
    throw new Error(`Metro process ${child.pid ?? '(unknown pid)'} remained alive after process-tree termination${detail}`);
  }
}

export async function waitForPreview(options, stageSpec, adapters = {}) {
  const adbFn = adapters.adbFn ?? adb;
  const delayFn = adapters.delayFn ?? delay;
  const nowFn = adapters.nowFn ?? Date.now;
  const deadline = nowFn() + options.timeoutMilliseconds;
  let lastXml = '';
  let stableMatches = 0;
  while (nowFn() < deadline) {
    const dump = adbFn(options, ['exec-out', 'uiautomator', 'dump', '/dev/tty'], { tolerateFailure: true });
    lastXml = String(dump.stdout ?? '');
    if (lastXml.includes('设计验收参数无效')) throw new Error('The native design-QA harness rejected the requested stage/state');
    if (hasAndroidSystemErrorDialog(lastXml)) {
      const waitButton = findAndroidDialogButtonCenter(lastXml, 'aerr_wait');
      if (!waitButton) {
        throw new Error('Android system error dialog appeared while loading the design-QA preview');
      }
      adbFn(options, ['shell', 'input', 'tap', String(waitButton.x), String(waitButton.y)]);
      await delayFn(8_000);
      continue;
    }
    if (previewDumpMatches(options, stageSpec, lastXml)) {
      stableMatches += 1;
      if (stableMatches >= 2) {
        await delayFn(1_200);
        return;
      }
    } else {
      stableMatches = 0;
    }
    await delayFn(350);
  }
  throw new Error(`Native design-QA preview did not become ready; UI dump tail: ${lastXml.slice(-300)}`);
}

export function buildStageDirectories(outputDirectory, stage, processId = process.pid) {
  return {
    finalDirectory: path.join(outputDirectory, stage),
    temporaryDirectory: path.join(outputDirectory, `.${stage}.tmp-${processId}`),
  };
}

export function prepareStageDirectories({ finalDirectory, temporaryDirectory }) {
  if (existsSync(finalDirectory)) throw new Error(`Refusing to overwrite existing stage evidence: ${finalDirectory}`);
  if (existsSync(temporaryDirectory)) throw new Error(`Temporary capture directory already exists: ${temporaryDirectory}`);
  mkdirSync(temporaryDirectory, { recursive: false });
}

export function publishStageDirectory({ finalDirectory, temporaryDirectory }) {
  if (existsSync(finalDirectory)) throw new Error(`Refusing to overwrite existing stage evidence: ${finalDirectory}`);
  renameSync(temporaryDirectory, finalDirectory);
}

async function launchPreview(options, stageSpec) {
  runCommand(options.adbPath, buildLaunchArguments(options), { retryTimeouts: 2 });
  await waitForPreview(options, stageSpec);
}

export async function waitForCaptureDimensions(options, capture, adapters = {}) {
  const adbFn = adapters.adbFn ?? adb;
  const delayFn = adapters.delayFn ?? delay;
  const inspectPngFn = adapters.inspectPngFn ?? inspectPng;
  const nowFn = adapters.nowFn ?? Date.now;
  const deadline = nowFn() + Math.min(options.timeoutMilliseconds, 60_000);
  let lastObservation = 'no screenshot returned';

  // Launching or reloading the Android activity can race the rotation request
  // that was applied before launch. Reassert it at the actual capture boundary.
  adbFn(options, ['shell', 'wm', 'user-rotation', 'lock', String(capture.rotation)]);

  while (nowFn() < deadline) {
    const result = adbFn(options, ['exec-out', 'screencap', '-p'], {
      encoding: null,
      timeout: 5_000,
      tolerateFailure: true,
    });
    if (!result.error && result.status === 0 && Buffer.isBuffer(result.stdout)) {
      try {
        const metadata = inspectPngFn(result.stdout);
        lastObservation = `${metadata.width}x${metadata.height}`;
        if (metadata.width === capture.width && metadata.height === capture.height) {
          await delayFn(2_000);
          return metadata;
        }
      } catch (error) {
        lastObservation = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastObservation = result.error?.message || String(result.stderr ?? '').trim() || `status ${result.status}`;
    }
    await delayFn(250);
  }

  throw new Error(
    `${capture.filename} display did not settle at ${capture.width}x${capture.height}; last observation: ${lastObservation}`,
  );
}

function configureCapture(options, { dark, rotation }) {
  adb(options, ['shell', 'wm', 'size', '390x844']);
  adb(options, ['shell', 'wm', 'density', String(options.density)]);
  adb(options, ['shell', 'wm', 'user-rotation', 'lock', String(rotation)]);
  adb(options, ['shell', 'cmd', 'uimode', 'night', dark ? 'yes' : 'no']);
}

async function capturePng(options, temporaryDirectory, capture, stageSpec, launch) {
  configureCapture(options, capture);
  if (launch) await launchPreview(options, stageSpec);
  await waitForCaptureDimensions(options, capture);
  let uiDump = adb(options, ['exec-out', 'uiautomator', 'dump', '/dev/tty'], { tolerateFailure: true });
  if (hasAndroidSystemErrorDialog(uiDump.stdout)) {
    const waitButton = findAndroidDialogButtonCenter(uiDump.stdout, 'aerr_wait');
    if (waitButton) {
      adb(options, ['shell', 'input', 'tap', String(waitButton.x), String(waitButton.y)]);
      await waitForPreview(options, stageSpec);
      uiDump = adb(options, ['exec-out', 'uiautomator', 'dump', '/dev/tty'], { tolerateFailure: true });
    }
  }
  if (launch && !previewDumpMatches(options, stageSpec, uiDump.stdout)) {
    await waitForPreview(options, stageSpec);
    uiDump = adb(options, ['exec-out', 'uiautomator', 'dump', '/dev/tty'], { tolerateFailure: true });
  }
  if (hasAndroidSystemErrorDialog(uiDump.stdout)) {
    throw new Error('Android system error dialog is covering the design-QA preview');
  }
  if (launch) assertCaptureUiDump(options, stageSpec, uiDump.stdout);
  const result = adb(options, ['exec-out', 'screencap', '-p'], { encoding: null });
  const bytes = result.stdout;
  const screenshotPath = path.join(temporaryDirectory, capture.filename);
  writeFileSync(screenshotPath, bytes);
  const persistedBytes = readFileSync(screenshotPath);
  const metadata = inspectPng(persistedBytes);
  const decoded = decodePng(screenshotPath);
  if (decoded.width !== metadata.width || decoded.height !== metadata.height) {
    throw new Error(`${capture.filename} PNG decoders disagree on its dimensions`);
  }
  if (metadata.width !== capture.width || metadata.height !== capture.height) {
    throw new Error(`${capture.filename} dimensions differ: expected ${capture.width}x${capture.height}, received ${metadata.width}x${metadata.height}`);
  }
  return metadata;
}

async function captureStage(options, stageSpec) {
  const { finalDirectory, temporaryDirectory } = buildStageDirectories(options.outputDirectory, stageSpec.stage);
  prepareStageDirectories({ finalDirectory, temporaryDirectory });

  const metroInvocation = buildMetroInvocation(options, stageSpec);
  let metro = null;
  let metroOutput = '';
  let metroSpawnError = null;
  let captureError = null;
  let publishedDirectory = null;

  try {
    if (await isTcpPortOpen(options.port)) throw new Error(`Refusing to start while Metro port ${options.port} is already in use`);
    metro = spawn(metroInvocation.command, metroInvocation.args, {
      cwd: process.cwd(),
      detached: process.platform !== 'win32',
      env: metroInvocation.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    metro.on('error', (error) => { metroSpawnError = error; });
    metro.stdout?.on('data', (chunk) => { metroOutput = `${metroOutput}${chunk}`.slice(-8_000); });
    metro.stderr?.on('data', (chunk) => { metroOutput = `${metroOutput}${chunk}`.slice(-8_000); });
    await waitForMetro(options, metro, () => metroSpawnError);
    const files = {};
    for (const [captureIndex, capture] of [
      { dark: false, filename: 'app-light.png', height: 844, rotation: 0, width: 390 },
      { dark: true, filename: 'app-dark.png', height: 844, rotation: 0, width: 390 },
      { dark: false, filename: 'app-landscape.png', height: 390, rotation: 1, width: 844 },
    ].entries()) {
      files[capture.filename] = await capturePng(
        options,
        temporaryDirectory,
        capture,
        stageSpec,
        shouldLaunchPreview(captureIndex),
      );
    }
    writeFileSync(path.join(temporaryDirectory, 'app-capture.json'), `${JSON.stringify({
      schemaVersion: 1,
      pageId: stageSpec.stage,
      runId: path.basename(options.outputDirectory),
      state: stageSpec.state,
      source: 'development-android-design-qa',
      serial: options.serial,
      files,
    }, null, 2)}\n`);
    publishStageDirectory({ finalDirectory, temporaryDirectory });
    publishedDirectory = finalDirectory;
  } catch (error) {
    const detail = metroOutput.trim();
    if (detail) console.error(`Metro output for ${stageSpec.stage}:\n${detail}`);
    captureError = error instanceof Error ? error : new Error(String(error));
  }
  const cleanupErrors = [];
  try {
    await stopMetro(metro, options);
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
  }
  try {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
  }
  if (captureError && cleanupErrors.length > 0) {
    throw new AggregateError([captureError, ...cleanupErrors], `Capture and cleanup failed for ${stageSpec.stage}`);
  }
  if (captureError) throw captureError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, `Cleanup failed for ${stageSpec.stage}`);
  return publishedDirectory;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  mkdirSync(options.outputDirectory, { recursive: true });
  const state = adb(options, ['get-state']).stdout.trim();
  if (state !== 'device') throw new Error(`ADB serial ${options.serial} is not ready (state=${state || 'unknown'})`);
  prepareAndroidDevice(options);
  clearExistingAndroidSystemErrorDialog(options);
  const originalDisplayState = readDeviceState(options);
  adb(options, ['reverse', `tcp:${options.port}`, `tcp:${options.port}`]);

  const outputDirectories = [];
  let captureError = null;
  try {
    for (const stage of options.stages) outputDirectories.push(await captureStage(options, stage));
  } catch (error) {
    captureError = error instanceof Error ? error : new Error(String(error));
  }
  const cleanupErrors = [];
  try {
    adb(options, ['reverse', '--remove', `tcp:${options.port}`]);
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
  }
  try {
    restoreDeviceState(options, originalDisplayState);
  } catch (error) {
    cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
  }
  if (captureError && cleanupErrors.length > 0) {
    throw new AggregateError([captureError, ...cleanupErrors], 'Android design-QA capture and cleanup failed');
  }
  if (captureError) throw captureError;
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Android design-QA cleanup failed');
  console.log(JSON.stringify({ outputDirectories, serial: options.serial }, null, 2));
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
