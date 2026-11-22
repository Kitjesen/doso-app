import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const nativeRoot = path.join(root, 'modules/robot-wifi/android/src');
const moduleKotlinPath = path.join(nativeRoot, 'main/java/expo/modules/robotwifi/RobotWifiModule.kt');
const stubDir = path.join(nativeRoot, 'test/bridge-stubs');
const read = relPath => readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');

function resolveJavaBin(name) {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const candidates = [
    process.env.JAVA_HOME,
    process.env.DOSO_G20_JAVA_HOME,
    'D:/Android/Android Studio/jbr',
  ].filter(Boolean);
  for (const home of candidates) {
    const candidate = path.join(home, 'bin', `${name}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return name;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, windowsHide: true, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}

async function cachedArtifact(group, artifact, version, extension = 'jar', classifier = '') {
  const base = path.join(homedir(), '.gradle/caches/modules-2/files-2.1', group, artifact, version);
  for (const hash of await readdir(base)) {
    const candidate = path.join(base, hash, `${artifact}-${version}${classifier}.${extension}`);
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(`Required cached runtime missing: ${artifact} ${version}`);
}

async function kotlinCompilerJars() {
  return await Promise.all([
    cachedArtifact('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
    cachedArtifact('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
    cachedArtifact('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
    cachedArtifact('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
    cachedArtifact('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
    cachedArtifact('org.jetbrains', 'annotations', '13.0'),
    cachedArtifact('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
  ]);
}

function findExpoModulesCoreJar() {
  const rel = 'node_modules/expo-modules-core/android/build/intermediates/compile_library_classes_jar/debug/bundleLibCompileToJarDebug/classes.jar';
  const direct = path.join(root, rel);
  if (existsSync(direct)) return direct;
  const gitDir = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (gitDir.status === 0 && gitDir.stdout.trim()) {
    const commonDir = path.resolve(root, gitDir.stdout.trim());
    const repoRoot = path.dirname(commonDir);
    const fromMainRepo = path.join(repoRoot, 'doso-app', rel);
    if (existsSync(fromMainRepo)) return fromMainRepo;
  }
  return null;
}

test('native Wi-Fi discovery returns SSIDs only and joins only from the explicit method', () => {
  const kotlin = read('modules/robot-wifi/android/src/main/java/expo/modules/robotwifi/RobotWifiModule.kt');
  const swift = read('modules/robot-wifi/ios/RobotWifiModule.swift');
  const manifest = read('modules/robot-wifi/android/src/main/AndroidManifest.xml');
  assert.match(kotlin, /Name\("RobotWifi"\)/);
  assert.doesNotMatch(kotlin, /rssi|RSSI|\.level|BSSID|signalLevel|StandUp|Walk\(/);
  assert.match(kotlin, /mapOf\("ssids" to names\.toList\(\), "throttled" to throttled\)/);
  const scan = kotlin.slice(kotlin.indexOf('private fun scan'), kotlin.indexOf('private fun release'));
  assert.doesNotMatch(scan, /requestNetwork|bindProcessToNetwork|WifiNetworkSpecifier/);
  const join = kotlin.slice(kotlin.indexOf('private fun join'));
  assert.match(join, /WifiNetworkSpecifier\.Builder\(\)\.setSsid\(clean\)/);
  assert.match(join, /bindProcessToNetwork\(network\)/);
  assert.match(join, /promise\.resolve\("already"\)/);
  assert.match(kotlin, /AsyncFunction\("discoverLanRobots"\)/);
  assert.match(kotlin, /AsyncFunction\("stopLanDiscovery"\)/);
  assert.match(kotlin, /"_doso-robot\._tcp\."/);
  assert.match(kotlin, /setReferenceCounted\(false\)/);
  assert.match(kotlin, /connectivity\.allNetworks/);
  const canRead = kotlin.slice(kotlin.indexOf('private fun canReadSsid'), kotlin.indexOf('private fun locationEnabled'));
  assert.match(canRead, /ACCESS_FINE_LOCATION/);
  assert.match(canRead, /locationEnabled\(context\)/);
  assert.doesNotMatch(canRead, /NEARBY_WIFI_DEVICES/);
  const problem = kotlin.slice(kotlin.indexOf('private fun scanProblem'), kotlin.indexOf('private fun normalizeSsid'));
  assert.match(problem, /ACCESS_FINE_LOCATION/);
  assert.match(problem, /locationEnabled\(context\)/);
  assert.doesNotMatch(problem, /NEARBY_WIFI_DEVICES/);
  assert.match(manifest, /android\.permission\.CHANGE_WIFI_MULTICAST_STATE/);
  assert.doesNotMatch(swift, /scanSsids|CNCopySupportedInterfaces|rssi|BSSID/);
  assert.match(swift, /NEHotspotNetwork\.fetchCurrent/);
  assert.match(swift, /configuration\.joinOnce = true/);
  assert.match(swift, /NEHotspotConfiguration\(ssid: clean\)/);
});

test('Android RobotWifiModule compiles against real SDK/Expo and passes behavioral unit tests', async t => {
  const output = await mkdtemp(path.join(tmpdir(), 'doso-robot-wifi-native-'));
  try {
    const compiler = await kotlinCompilerJars();
    const javaBin = resolveJavaBin('java');
    const jarBin = resolveJavaBin('jar');

    // 1. Compile and execute behavioral unit tests with bridge stubs
    const stubClasses = path.join(output, 'stub-classes');
    await mkdir(stubClasses);
    const stubFiles = (await readdir(stubDir))
      .filter(name => name.endsWith('.kt'))
      .sort()
      .map(name => path.join(stubDir, name));
    const stubClasspath = [stubClasses, compiler[1], compiler[5]].join(path.delimiter);
    runCommand(javaBin, [
      '-cp', compiler.join(path.delimiter),
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17',
      '-classpath', stubClasspath,
      '-d', stubClasses,
      ...stubFiles,
      moduleKotlinPath,
    ]);
    const testOutput = runCommand(javaBin, ['-cp', stubClasspath, 'expo.modules.robotwifi.RobotWifiModuleTestKt']);
    t.diagnostic(testOutput.trim());
    for (const marker of [
      'PASS: currentSsid-multi-network-and-fallback',
      'PASS: existing-wifi-functions-backwards-compatible',
      'PASS: lan-discovery-serialized-resolve-rfc1918-txt-dedup',
      'PASS: lan-discovery-api34-mixed-ipv6-clamping-stop',
      'PASS: lan-discovery-errors-and-ondestroy-lock-release',
      'PASS: all RobotWifiModule native tests',
    ]) {
      assert.ok(testOutput.includes(marker), testOutput);
    }

    // 2. Compile actual RobotWifiModule.kt against real Android SDK + Expo Modules Core
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'D:/Android/Sdk';
    const androidJar = path.join(sdk, 'platforms/android-36/android.jar');
    const expoJar = findExpoModulesCoreJar();
    assert.ok(existsSync(androidJar), `Android SDK jar missing: ${androidJar}`);
    assert.ok(expoJar, 'expo-modules-core classes.jar missing');
    const reactAar = await cachedArtifact('com.facebook.react', 'react-android', '0.86.2', 'aar', '-release');
    const reactDir = path.join(output, 'react');
    await mkdir(reactDir);
    runCommand(jarBin, ['xf', reactAar, 'classes.jar'], { cwd: reactDir });
    const sdkClasses = path.join(output, 'sdk-classes');
    await mkdir(sdkClasses);
    const sdkClasspath = [
      compiler[1],
      compiler[5],
      compiler[6],
      androidJar,
      expoJar,
      path.join(reactDir, 'classes.jar'),
      await cachedArtifact('androidx.lifecycle', 'lifecycle-common-jvm', '2.9.0'),
    ].join(path.delimiter);
    runCommand(javaBin, [
      '-cp', compiler.join(path.delimiter),
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17',
      '-classpath', sdkClasspath,
      '-d', sdkClasses,
      moduleKotlinPath,
    ]);
    t.diagnostic('PASS: RobotWifiModule.kt compiled cleanly against android-36 + expo-modules-core');
  } finally {
    await rm(output, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('platform adapters keep the hotspot rule and do not invent an iOS scan', () => {
  const android = read('src/features/robot-lifecycle/wifiDiscoveryAdapter.android.ts');
  const ios = read('src/features/robot-lifecycle/wifiDiscoveryAdapter.ios.ts');
  const web = read('src/features/robot-lifecycle/wifiDiscoveryAdapter.ts');
  assert.match(android, /androidWifiScanPermission/);
  assert.match(android, /matchRobotHotspot\(ssid\)/);
  assert.match(android, /requireOptionalNativeModule<NativeRobotWifi>\('RobotWifi'\)/);
  assert.doesNotMatch(android, /5050|5052|192\.168\.66\.64/);
  assert.match(ios, /throw new WifiDiscoveryError\('unsupported'\)/);
  assert.doesNotMatch(ios, /PermissionsAndroid|scanSsids|loadWifiList/);
  assert.match(web, /platform: 'unsupported'/);
});

test('the connection screen keeps manual entry, Bluetooth honesty, and releases a joined hotspot on edit or leave', () => {
  const screen = read('src/screens/RobotConnectionScreen.tsx');
  assert.match(screen, /WifiDiscoveryPanel/);
  assert.match(screen, /releaseWifi\.current\(\)/);
  assert.match(screen, /身份验证和配网尚未接入/);
  assert.match(screen, /查找蓝牙设备/);
  assert.match(screen, /连接机器狗/);
  assert.match(screen, /视频与诊断/);
  assert.doesNotMatch(screen, /192\.168\.66\.64|5050|5052|云端状态已通|账号设备/);
});
