import test from 'node:test';
import assert from 'node:assert/strict';
import { access, copyFile, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const native = path.join(root, 'modules/g20-input/android/src');
const source = name => path.join(native, 'main/java/expo/modules/g20input', name);
const sdkArchive = path.join(root, 'modules/g20-input/vendor/maven/com/skydroid/rcsdk/1.9.2/rcsdk-1.9.2.aar');
const javaHome = process.env.DOSO_G20_JAVA_HOME || 'D:/Android/Android Studio/jbr';
const executable = name => path.join(javaHome, 'bin', `${name}${process.platform === 'win32' ? '.exe' : ''}`);

async function kotlinCompiler() {
  return await Promise.all([
    cached('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
    cached('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
    cached('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
    cached('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
    cached('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
    cached('org.jetbrains', 'annotations', '13.0'),
    cached('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
  ]);
}

async function cached(group, artifact, version, extension = 'jar', classifier = '') {
  const directory = path.join(homedir(), '.gradle/caches/modules-2/files-2.1', group, artifact, version);
  for (const hash of await readdir(directory)) {
    const filename = `${artifact}-${version}${classifier}.${extension}`;
    const candidate = path.join(directory, hash, filename);
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error(`Required existing cached dependency absent: ${artifact} ${version}`);
}

function run(name, args, options = {}) {
  const result = spawnSync(executable(name), args, { encoding: 'utf8', timeout: 60000, windowsHide: true, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}

test('real G20 session lifecycle runs without vendor JNI; actual Expo adapter compiles against pinned official SDK', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'doso-g20-native-'));
  try {
    const classes = path.join(output, 'classes'); await mkdir(classes);
    const compiler = await kotlinCompiler();
    const compile = (classpath, files) => run('java', ['-cp', compiler.join(path.delimiter),
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17',
      '-classpath', classpath.join(path.delimiter), '-d', classes, ...files]);
    const coreClasspath = [classes, compiler[1], compiler[5]];
    compile(coreClasspath, [source('G20InputSession.kt'), path.join(native, 'test/kotlin/expo/modules/g20input/G20InputSessionTest.kt')]);
    assert.match(run('java', ['-cp', coreClasspath.join(path.delimiter), 'expo.modules.g20input.G20InputSessionTestKt']), /PASS: 29 G20 read-only input lifecycle cases/);

    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'D:/Android/Sdk';
    const android = path.join(sdk, 'platforms/android-36/android.jar');
    const expo = path.join(root, 'node_modules/expo-modules-core/android/build/intermediates/compile_library_classes_jar/debug/bundleLibCompileToJarDebug/classes.jar');
    await access(android); await access(expo);
    const vendor = path.join(output, 'vendor'); await mkdir(vendor);
    run('jar', ['xf', sdkArchive, 'classes.jar'], { cwd: vendor });
    const react = path.join(output, 'react'); await mkdir(react);
    run('jar', ['xf', await cached('com.facebook.react', 'react-android', '0.86.2', 'aar', '-release'), 'classes.jar'], { cwd: react });
    compile([...coreClasspath, android, expo, path.join(vendor, 'classes.jar'), path.join(react, 'classes.jar'), compiler[6],
      await cached('androidx.lifecycle', 'lifecycle-common-jvm', '2.9.0')],
      [source('G20InputSession.kt'), source('SkydroidG20Source.kt'), source('G20InputModule.kt')]);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('actual G20 adapter cuts SDK-retained callbacks on close and rejects prior-open callbacks', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'doso-g20-adapter-'));
  try {
    const classes = path.join(output, 'classes'); await mkdir(classes);
    const fakeDirectory = path.join(native, 'test/adapter-fakes');
    const files = [];
    for (const name of (await readdir(fakeDirectory)).filter(name => name.endsWith('.kt.fixture')).sort()) {
      const destination = path.join(output, name.slice(0, -'.fixture'.length));
      await copyFile(path.join(fakeDirectory, name), destination); files.push(destination);
    }
    const compiler = await kotlinCompiler();
    const classpath = [classes, compiler[1], compiler[5]].join(path.delimiter);
    run('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes,
      source('G20InputSession.kt'), source('SkydroidG20Source.kt'), ...files]);
    assert.match(run('java', ['-cp', classpath, 'expo.modules.g20input.SkydroidG20SourceTestKt']),
      /PASS: 7 actual G20 adapter callback ownership cases without vendor JNI/);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('SDK bytes and read-only adapter boundary stay pinned; RC-only initialization excludes airlink', async () => {
  const archive = await readFile(sdkArchive);
  assert.equal(archive.length, 2209790);
  assert.equal(createHash('sha256').update(archive).digest('hex'), 'e5977ba3292246bcee026defdb8563a18adc9d5573fdfb20a6880ee469f0fde2');
  const adapter = await readFile(source('SkydroidG20Source.kt'), 'utf8');
  assert.doesNotMatch(adapter, /KeyManager\.(?:set|action|listen)|PipelineManager|KeyRequestPairing|KeyMotorEnable/);
  assert.match(adapter, /RCSDKUtils\.getDeviceType\(\) != DeviceType\.G20/);
  assert.ok(adapter.indexOf('Build.SUPPORTED_ABIS') < adapter.indexOf('RCSDKManager.initSDK'));
  assert.ok(adapter.indexOf('RCSDKUtils.getDeviceType()') < adapter.indexOf('RCSDKManager.initSDK'));
  assert.ok(adapter.indexOf('InternalKey.onlyConnect = InternalKey.ONLY_CONNECT_RC') < adapter.indexOf('RCSDKManager.connectToRC()'));
  assert.match(adapter, /KeyManager\.get\(RemoteControllerKey\.KeyChannels/);
  assert.match(adapter, /KeyManager\.get\(RemoteControllerKey\.KeyChannelSettings/);
  assert.match(adapter, /KeyManager\.get\(RemoteControllerKey\.KeyControlMode/);
  const module = await readFile(source('G20InputModule.kt'), 'utf8');
  assert.match(module, /OnActivityEntersBackground[\s\S]*?session\.stop\("background"\)/);
  assert.match(module, /Function\("isSampleFresh"\)/);
  assert.match(module, /Function\("captureInputFence"\)/);
  assert.match(module, /!destroyed && !paused && isForeground\(\) && session\.getStatus\(\)\["status"\] == "reading"[\s\S]*?SystemClock\.elapsedRealtime\(\) else null/);
  assert.match(module, /OnDestroy[\s\S]*?session\.destroy\(\)/);
  const gradle = await readFile(path.join(root, 'modules/g20-input/android/build.gradle'), 'utf8');
  assert.match(gradle, /rootProject\.allprojects/);
  assert.match(gradle, /includeGroup 'com\.skydroid'/);
  assert.match(gradle, /defaultConfig\s*\{[\s\S]*?versionCode\s+1\b/);
  assert.match(gradle, /defaultConfig\s*\{[\s\S]*?versionName\s+'1\.0\.0'/);
});
