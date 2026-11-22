import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const native = path.join(root, 'modules/doso-pointcloud/android/src');
const source = name => path.join(native, 'main/java/expo/modules/dosopointcloud', name);
const java = name => path.join(process.env.JAVA_HOME, 'bin', `${name}${process.platform === 'win32' ? '.exe' : ''}`);

async function cached(group, artifact, version, extension = 'jar', classifier = '') {
  const directory = path.join(homedir(), '.gradle/caches/modules-2/files-2.1', group, artifact, version);
  for (const hash of await readdir(directory)) {
    const candidate = path.join(directory, hash, `${artifact}-${version}${classifier}.${extension}`);
    try { await access(candidate); return candidate; } catch {}
  }
  throw new Error(`Required cached dependency absent: ${artifact} ${version}`);
}

function run(name, args, options = {}) {
  const result = spawnSync(java(name), args, { encoding: 'utf8', timeout: 60000, windowsHide: true, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}

test('native cloud session rejects old target frames and Android view compiles against actual Expo', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'doso-cloud-native-'));
  try {
    const classes = path.join(output, 'classes'); await mkdir(classes);
    const compiler = await Promise.all([
      cached('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
      cached('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
      cached('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
      cached('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
      cached('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
      cached('org.jetbrains', 'annotations', '13.0'),
      cached('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
    ]);
    const compile = (classpath, files) => run('java', ['-cp', compiler.join(path.delimiter),
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler', '-no-stdlib', '-no-reflect', '-jvm-target', '17',
      '-classpath', classpath.join(path.delimiter), '-d', classes, ...files]);
    const core = [classes, compiler[1], compiler[5]];
    compile(core, [source('CloudSession.kt'), source('CloudEndpoint.kt'), path.join(native, 'test/kotlin/expo/modules/dosopointcloud/CloudSessionTest.kt')]);
    assert.match(run('java', ['-cp', core.join(path.delimiter), 'expo.modules.dosopointcloud.CloudSessionTestKt']), /PASS: point-cloud target replacement/);
    const android = path.join(process.env.ANDROID_HOME, 'platforms/android-36/android.jar');
    const expo = path.join(root, 'node_modules/expo-modules-core/android/build/intermediates/compile_library_classes_jar/debug/bundleLibCompileToJarDebug/classes.jar');
    await access(android); await access(expo);
    const react = path.join(output, 'react'); await mkdir(react);
    run('jar', ['xf', await cached('com.facebook.react', 'react-android', '0.86.2', 'aar', '-release'), 'classes.jar'], { cwd: react });
    const classpath = [...core, android, expo, path.join(react, 'classes.jar'), compiler[6],
      await cached('androidx.lifecycle', 'lifecycle-common-jvm', '2.9.0')];
    compile(classpath, ['CloudSession.kt', 'CloudEndpoint.kt', 'NativeCloud.kt', 'PointCloudRenderer.kt', 'PointCloudView.kt', 'PointCloudModule.kt'].map(source));
  } finally { await rm(output, { recursive: true, force: true }); }
});
