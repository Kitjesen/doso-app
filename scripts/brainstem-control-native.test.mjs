import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const native = new URL('modules/brainstem-grpc/android/src/', root);
const source = (name) => fileURLToPath(new URL(`main/java/expo/modules/brainstemgrpc/${name}`, native));
const fixture = (name) => fileURLToPath(new URL(`test/${name}`, native));

async function cachedArtifact(group, artifact, version, extension = 'jar', classifier = '') {
  const base = path.join(homedir(), '.gradle/caches/modules-2/files-2.1', group, artifact, version);
  for (const hash of await readdir(base)) {
    const files = await readdir(path.join(base, hash));
    const selected = files.find((file) => file === `${artifact}-${version}${classifier}.${extension}`);
    if (selected) return path.join(base, hash, selected);
  }
  throw new Error(`Existing cached runtime missing: ${artifact} ${version}`);
}
const jar = (group, artifact, version) => cachedArtifact(group, artifact, version);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000, windowsHide: true, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout;
}

test('native control session compiles and obeys the lease/ACK/deadman lifecycle using a local fake channel', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'doso-control-native-'));
  try {
    const classes = path.join(output, 'classes');
    await mkdir(classes);
    const clock = path.join(output, 'SystemClock.java');
    await writeFile(clock, [
      'package android.os; public final class SystemClock {',
      'private static volatile long testTime = -1L;',
      'public static long elapsedRealtime() { return testTime >= 0 ? testTime : System.nanoTime()/1000000L; }',
      'public static void setTestElapsedRealtime(long value) { testTime = value; }',
      '}',
    ].join('\n'));
    run('javac', ['-encoding', 'UTF-8', '-d', classes, clock, source('ControlStatusParser.java'),
      source('ProfileInfoParser.java'), source('VoltageParser.java'), source('MotorStatusParser.java'),
      source('ControlWire.java'), fixture('java/expo/modules/brainstemgrpc/ControlWireTest.java')]);
    assert.match(run('java', ['-cp', classes, 'expo.modules.brainstemgrpc.ControlWireTest']), /PASS: control wire/);
    const compiler = await Promise.all([
      jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
      jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
      jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
      jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
      jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
      jar('org.jetbrains', 'annotations', '13.0'),
      jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
    ]);
    const grpc = await jar('io.grpc', 'grpc-api', '1.85.1');
    const guava = await jar('com.google.guava', 'guava', '33.6.0-android');
    const classpath = [classes, compiler[1], grpc, guava, compiler[5]].join(path.delimiter);
    run('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes,
      source('ControlSession.kt'), fixture('kotlin/expo/modules/brainstemgrpc/ControlSessionTest.kt')]);
    assert.match(run('java', ['-cp', classpath, 'expo.modules.brainstemgrpc.ControlSessionTestKt']), /PASS: native lease/);

    // Compile the real Expo bridge too, using the SDK and already-built/cached dependencies.
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    assert.ok(sdk, 'Set ANDROID_HOME to the existing SDK');
    const android = path.join(sdk, 'platforms/android-36/android.jar');
    const expo = fileURLToPath(new URL('node_modules/expo-modules-core/android/build/intermediates/compile_library_classes_jar/debug/bundleLibCompileToJarDebug/classes.jar', root));
    await access(android); await access(expo);
    const react = await cachedArtifact('com.facebook.react', 'react-android', '0.86.2', 'aar', '-release');
    const extracted = path.join(output, 'react'); await mkdir(extracted);
    run('jar', ['xf', react, 'classes.jar'], { cwd: extracted });
    const bridgeClasspath = [classpath, android, expo, path.join(extracted, 'classes.jar'), compiler[6],
      await jar('androidx.lifecycle', 'lifecycle-common-jvm', '2.9.0'),
      await jar('io.grpc', 'grpc-okhttp', '1.85.1'), await jar('io.grpc', 'grpc-core', '1.85.1')].join(path.delimiter);
    run('javac', ['-encoding', 'UTF-8', '-cp', android, '-d', classes, source('LocalIdentityCrypto.java')]);
    run('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', bridgeClasspath, '-d', classes,
      source('ControlSession.kt'), source('LocalClientIdentityStore.kt'), source('BrainstemGrpcModule.kt')]);
  } finally { await rm(output, { recursive: true, force: true }); }
});

test('control channel requires explicit endpoint-approved KeyChain identity, scoped CA and hostname verification', async () => {
  const module = await readFile(source('BrainstemGrpcModule.kt'), 'utf8');
  assert.match(module, /approvedIdentities\[endpointKey\(host, port\)\] != alias/);
  assert.match(module, /chain\[index\]\.verify\(chain\[index \+ 1\]\.publicKey\)/);
  assert.match(module, /root\.basicConstraints >= 0/);
  assert.match(module, /root\.verify\(root\.publicKey\)/);
  assert.match(module, /TrustManagerFactory\.getInstance/);
  assert.match(module, /if \(!lanDev && !tls!!\.identity\.requested\.get\(\)\) throw ControlSession\.Failure\("unauthorized"\)/);
  assert.match(module, /\.useTransportSecurity\(\)/);
  assert.doesNotMatch(module, /overrideAuthority|hostnameVerifier|checkServerTrusted|FileOutputStream/);
  assert.match(module, /if \(lanDev\) builder\.usePlaintext\(\) else builder\.useTransportSecurity\(\)/);
  assert.match(module, /packageName != "com\.doso\.robot\.qa"/);
  assert.match(module, /OnActivityEntersBackground[\s\S]*?retireControl\("background"\)/);
  assert.match(module, /registerReceiver\(receiver, IntentFilter\(action\), "android\.permission\.MANAGE_DEBUGGING"/);
  assert.match(module, /intent\.`package` != context\.packageName/);
});

test('real Expo bridge admits only same-peer telemetry and keeps its executor separate from control', async t => {
  const output = await mkdtemp(path.join(tmpdir(), 'doso-module-native-'));
  try {
    const classes = path.join(output, 'classes'); await mkdir(classes);
    const clock = path.join(output, 'SystemClock.java');
    await writeFile(clock, 'package android.os; public final class SystemClock { public static long elapsedRealtime() { return System.nanoTime()/1000000L; } }');
    run('javac', ['-encoding', 'UTF-8', '-d', classes, clock,
      fixture('bridge-stubs/Base64.java'),
      ...['ControlStatusParser.java', 'ProfileInfoParser.java', 'VoltageParser.java', 'MotorStatusParser.java', 'ControlWire.java', 'LocalIdentityCrypto.java'].map(source)]);
    const compiler = await Promise.all([
      jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'), jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
      jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'), jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
      jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'), jar('org.jetbrains', 'annotations', '13.0'),
      jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0'),
    ]);
    const classpath = [classes, compiler[1], compiler[5], await jar('io.grpc', 'grpc-api', '1.85.1'),
      await jar('com.google.guava', 'guava', '33.6.0-android'), await jar('org.json', 'json', '20180813')].join(path.delimiter);
    const stubs = await readdir(fixture('bridge-stubs'));
    run('java', ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes,
      ...stubs.filter(name => name.endsWith('.kt')).map(name => fixture(`bridge-stubs/${name}`)), source('ControlSession.kt'), source('LocalClientIdentityStore.kt'), source('BrainstemGrpcModule.kt'),
      fixture('kotlin/expo/modules/brainstemgrpc/BrainstemGrpcModuleTest.kt'), fixture('kotlin/expo/modules/brainstemgrpc/LocalClientIdentityStoreTest.kt')]);
    const identity = path.join(output, 'fixture.p12');
    run('keytool', ['-genkeypair', '-alias', 'fixture', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '1',
      '-dname', 'CN=local-test-only', '-ext', 'bc=ca:true', '-keystore', identity, '-storetype', 'PKCS12',
      '-storepass', 'fixture-password', '-keypass', 'fixture-password', '-noprompt']);
    const localKey = path.join(output, 'local.p12');
    run('keytool', ['-genkeypair', '-alias', 'fixture', '-keyalg', 'EC', '-groupname', 'secp256r1', '-validity', '1',
      '-dname', 'CN=local-identity-fixture', '-keystore', localKey, '-storetype', 'PKCS12',
      '-storepass', 'fixture-password', '-keypass', 'fixture-password', '-noprompt']);
    const result = run('java', ['-cp', classpath, 'expo.modules.brainstemgrpc.BrainstemGrpcModuleTestKt', identity, localKey]);
    t.diagnostic(result.trim());
    for (const name of ['same-peer-four-reads-and-rejections', 'slow-read-independent-control-executor',
      'close-background-destroy-cancellation', 'failed-open-clears-peer-without-bypassing-mtls',
      'factory-permission-target-generation-and-cancellation', 'lan-private-ipv4-qa-and-transport-peer-guards']) {
      assert.ok(result.includes(`PASS: ${name}`), result);
    }

    const storeRunner = ['-cp', classpath, 'expo.modules.brainstemgrpc.LocalClientIdentityStoreTestKt'];
    t.diagnostic(run('java', [...storeRunner, 'prepare', localKey, output]).trim());
    const openssl = process.env.OPENSSL_BIN || 'openssl';
    const opensslConfig = path.join(output, 'openssl.cnf');
    await writeFile(opensslConfig, '[req]\ndistinguished_name=subject\n[subject]\n');
    const opensslRun = args => run(openssl, args, { env: { ...process.env, OPENSSL_CONF: opensslConfig } });
    opensslRun(['req', '-in', path.join(output, 'client.csr.pem'), '-verify', '-noout']);
    t.diagnostic('PASS: independently verified PKCS#10 signature using OpenSSL');
    for (const name of ['ca', 'other-ca']) opensslRun(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
      '-subj', `/CN=${name}`, '-keyout', path.join(output, `${name}.key.pem`), '-out', path.join(output, `${name}.cert.pem`),
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
    opensslRun(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-subj', '/CN=constrained-ca',
      '-keyout', path.join(output, 'constrained-ca.key.pem'), '-out', path.join(output, 'constrained-ca.cert.pem'),
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign',
      '-addext', 'nameConstraints=critical,permitted;DNS:.example.test']);
    const extension = (san = 'urn:doso:client:test', purpose = 'clientAuth', extra = '') =>
      `basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=${purpose}\nsubjectAltName=URI:${san}\n${extra}`;
    for (const [name, ext, days] of [
      ['client', extension(), '1'], ['wrong-san', extension('urn:doso:client:other'), '1'],
      ['wrong-purpose', extension('urn:doso:client:test', 'serverAuth'), '1'],
      ['critical', extension('urn:doso:client:test', 'clientAuth', '1.2.3.4=critical,DER:05:00\n'), '1'],
    ]) {
      const config = path.join(output, `${name}.ext`); await writeFile(config, ext);
      opensslRun(['x509', '-req', '-sha256', '-days', days, '-in', path.join(output, 'client.csr.pem'),
        '-CA', path.join(output, 'ca.cert.pem'), '-CAkey', path.join(output, 'ca.key.pem'), '-set_serial', '10',
        '-extfile', config, '-out', path.join(output, `${name}.cert.pem`)]);
    }
    const caPath = name => path.join(output, name).replaceAll('\\', '/');
    await mkdir(path.join(output, 'issued'));
    await writeFile(path.join(output, 'index.txt'), '');
    await writeFile(path.join(output, 'serial.txt'), '40\n');
    const expiredConfig = path.join(output, 'expired-ca.cnf');
    await writeFile(expiredConfig, `[ca]\ndefault_ca=fixture\n[fixture]\ndatabase=${caPath('index.txt')}\nserial=${caPath('serial.txt')}\nnew_certs_dir=${caPath('issued')}\ndefault_md=sha256\npolicy=subject\n[subject]\ncommonName=supplied\n`);
    opensslRun(['ca', '-batch', '-notext', '-config', expiredConfig, '-in', path.join(output, 'client.csr.pem'),
      '-cert', path.join(output, 'ca.cert.pem'), '-keyfile', path.join(output, 'ca.key.pem'), '-out', path.join(output, 'expired.cert.pem'),
      '-startdate', '20000101000000Z', '-enddate', '20000102000000Z', '-extfile', path.join(output, 'client.ext')]);
    opensslRun(['req', '-new', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
      '-subj', '/CN=wrong-key', '-keyout', path.join(output, 'wrong.key.pem'), '-out', path.join(output, 'wrong.csr.pem')]);
    opensslRun(['x509', '-req', '-sha256', '-days', '1', '-in', path.join(output, 'wrong.csr.pem'), '-CA', path.join(output, 'ca.cert.pem'),
      '-CAkey', path.join(output, 'ca.key.pem'), '-set_serial', '11', '-extfile', path.join(output, 'client.ext'), '-out', path.join(output, 'wrong-key.cert.pem')]);
    opensslRun(['x509', '-req', '-sha256', '-days', '1', '-in', path.join(output, 'client.csr.pem'), '-CA', path.join(output, 'constrained-ca.cert.pem'),
      '-CAkey', path.join(output, 'constrained-ca.key.pem'), '-set_serial', '12', '-extfile', path.join(output, 'client.ext'), '-out', path.join(output, 'constrained-client.cert.pem')]);
    t.diagnostic(run('java', [...storeRunner, 'verify', localKey, output]).trim());
  } finally { await rm(output, { recursive: true, force: true }); }
});
