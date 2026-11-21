import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const moduleRoot = path.join(root, 'modules/media-capture');
const nativeSrc = path.join(moduleRoot, 'android/src');
const kotlinMain = (name) => path.join(nativeSrc, 'main/java/expo/modules/mediacapture', name);
const javaMain = path.join(nativeSrc, 'main/java/com/oney/WebRTCModule/DosoWebRtcTrackLookup.java');

function resolveJavaBin(toolName) {
  const candidates = [
    process.env.JAVA_HOME,
    'D:\\Program Files\\Java\\jdk-24',
    'C:\\Program Files\\Java\\jdk-21',
    'C:\\Program Files\\Java\\jdk-17',
    'C:\\Program Files\\Android\\Android Studio\\jbr',
  ].filter(Boolean);
  const exe = process.platform === 'win32' ? '.exe' : '';
  for (const home of candidates) {
    const candidate = path.join(home, 'bin', `${toolName}${exe}`);
    if (existsSync(candidate)) return candidate;
  }
  return `${toolName}${exe}`;
}

function resolveAndroidSdk() {
  for (const candidate of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, 'D:\\Android\\Sdk', 'C:\\Android\\Sdk']) {
    if (candidate && existsSync(path.join(candidate, 'platforms/android-36/android.jar'))) {
      return candidate;
    }
  }
  throw new Error('Required Android SDK platform android-36 missing');
}

async function cached(group, artifact, version, extension = 'jar', classifier = '') {
  const directory = path.join(homedir(), '.gradle/caches/modules-2/files-2.1', group, artifact, version);
  for (const hash of await readdir(directory)) {
    const files = await readdir(path.join(directory, hash));
    const exact = `${artifact}-${version}${classifier}.${extension}`;
    if (files.includes(exact)) return path.join(directory, hash, exact);
  }
  throw new Error(`Required cached dependency absent: ${artifact} ${version}`);
}

function run(tool, args, options = {}) {
  const result = spawnSync(resolveJavaBin(tool), args, {
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
    ...options,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}

test('native media-capture core passes JVM unit tests and compiles cleanly against Expo, React Native, and WebRTC 155', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'doso-media-capture-native-'));
  try {
    const classes = path.join(output, 'classes');
    await mkdir(classes, { recursive: true });

    const compiler = await Promise.all([
      cached('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
      cached('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
      cached('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
      cached('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
      cached('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
      cached('org.jetbrains', 'annotations', '13.0'),
      cached('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
    ]);

    const compileKotlin = (classpath, files) => run('java', [
      '-cp', compiler.join(path.delimiter),
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17',
      '-classpath', classpath.join(path.delimiter),
      '-d', classes,
      ...files,
    ]);

    // 1. Run pure JVM core tests.
    const coreClasspath = [classes, compiler[1], compiler[5]];
    compileKotlin(coreClasspath, [
      kotlinMain('MediaCaptureCore.kt'),
      path.join(nativeSrc, 'test/kotlin/expo/modules/mediacapture/MediaCaptureCoreTest.kt'),
    ]);
    const coreTestOut = run('java', [
      '-cp', coreClasspath.join(path.delimiter),
      'expo.modules.mediacapture.MediaCaptureCoreTestKt',
    ]);
    assert.match(coreTestOut, /PASS: media capture core/);

    // 2. Compile full Android module (Java + Kotlin) against real SDK, Expo, RN, react-native-webrtc, and org.webrtc.
    const sdk = resolveAndroidSdk();
    const androidJar = path.join(sdk, 'platforms/android-36/android.jar');
    const expoJar = path.join(root, 'node_modules/expo-modules-core/android/build/intermediates/compile_library_classes_jar/debug/bundleLibCompileToJarDebug/classes.jar');
    const rnWebRtcJar = path.join(root, 'node_modules/react-native-webrtc/android/build/intermediates/runtime_library_classes_jar/release/bundleLibRuntimeToJarRelease/classes.jar');
    await access(androidJar);
    await access(expoJar);
    await access(rnWebRtcJar);

    const reactAar = await cached('com.facebook.react', 'react-android', '0.86.2', 'aar', '-release');
    const reactExtracted = path.join(output, 'react');
    await mkdir(reactExtracted, { recursive: true });
    run('jar', ['xf', reactAar, 'classes.jar'], { cwd: reactExtracted });

    const webrtcAar = await cached('org.jitsi', 'webrtc', '155.0.1', 'aar');
    const webrtcExtracted = path.join(output, 'webrtc');
    await mkdir(webrtcExtracted, { recursive: true });
    run('jar', ['xf', webrtcAar, 'libs/libwebrtc.jar'], { cwd: webrtcExtracted });

    const fullClasspath = [
      classes,
      compiler[1],
      compiler[5],
      compiler[6],
      androidJar,
      expoJar,
      path.join(reactExtracted, 'classes.jar'),
      rnWebRtcJar,
      path.join(webrtcExtracted, 'libs/libwebrtc.jar'),
      await cached('androidx.annotation', 'annotation-jvm', '1.9.1'),
    ];

    run('javac', [
      '-encoding', 'UTF-8',
      '-cp', fullClasspath.join(path.delimiter),
      '-d', classes,
      javaMain,
    ]);

    compileKotlin(fullClasspath, [
      kotlinMain('MediaCaptureCore.kt'),
      kotlinMain('AndroidMediaStoreWriter.kt'),
      kotlinMain('AndroidWebRtcRecorder.kt'),
      kotlinMain('MediaCaptureModule.kt'),
    ]);

    const config = JSON.parse(await readFile(path.join(moduleRoot, 'expo-module.config.json'), 'utf8'));
    assert.deepEqual(config.android.modules, ['expo.modules.mediacapture.MediaCaptureModule']);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
