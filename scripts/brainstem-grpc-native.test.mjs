import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const moduleRoot = new URL('modules/brainstem-grpc/', root);
const javaRoot = new URL('android/src/main/java/expo/modules/brainstemgrpc/', moduleRoot);
const read = async (file) => readFile(new URL(file, moduleRoot), 'utf8');

test('native read-only protobuf parser agrees with the real brainstem proto contract', async () => {
  const proto = await readFile(process.env.BRAINSTEM_CMS_PROTO || 'D:/inovxio/brain/brainstem/brainstem_api/brainstem_api/cms.proto', 'utf8');
  assert.match(proto, /package brainstem\.api\.v1;/);
  assert.match(proto, /rpc GetControlStatus\(google\.protobuf\.Empty\) returns \(ControlStatus\)/);
  const fields = (message) => [...proto.match(new RegExp(`message ${message} \\{([^}]+)\\}`))[1]
    .matchAll(/\b(\w+)\s+(\w+)\s*=\s*(\d+)\s*;/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(fields('ControlStatus'), [
    ['CmsState', 'fsm', 1], ['bool', 'motor_output_enabled', 2], ['ControlOwner', 'owner', 3],
    ['bool', 'critical_motor_fault', 4], ['bool', 'grpc_lease_active', 5], ['uint32', 'lease_remaining_ms', 6],
    ['uint64', 'last_accepted_sequence', 7], ['CommandRejectReason', 'last_decision', 8],
    ['bool', 'ready_for_walk', 9], ['string', 'owner_id', 10], ['uint64', 'accepted_count', 11], ['uint64', 'rejected_count', 12],
  ]);
  assert.deepEqual(fields('CmsState'), [['CmsStateKind', 'kind', 1], ['CmsTransitionKind', 'transition', 2], ['string', 'gesture_name', 3]]);
  for (const [name, expected] of [
    ['CmsStateKind', ['ZERO', 'GROUNDED', 'STANDING', 'WALKING', 'TRANSITIONING']],
    ['CmsTransitionKind', ['NONE', 'STAND_UP', 'SIT_DOWN', 'GESTURE']],
    ['ControlOwner', ['NONE', 'GRPC', 'YUNZHUO']],
  ]) {
    const block = proto.match(new RegExp(`enum ${name} \\{([^}]+)\\}`))[1];
    const values = [...block.matchAll(/\b[A-Z_]+_([A-Z_]+)\s*=\s*(\d+)\s*;/g)];
    // Compare suffixes separately: enum names themselves contain underscores.
    for (const [index, suffix] of expected.entries()) assert.match(block, new RegExp(`_${suffix}\\s*=\\s*${index}\\s*;`));
    assert.equal(values.length, expected.length);
  }
  const output = await mkdtemp(path.join(tmpdir(), 'doso-grpc-parser-'));
  try {
    const { fileURLToPath } = await import('node:url');
    const compile = spawnSync('javac', ['-encoding', 'UTF-8', '-d', output,
      fileURLToPath(new URL('ControlStatusParser.java', javaRoot)),
      fileURLToPath(new URL('ProfileInfoParser.java', javaRoot)),
      fileURLToPath(new URL('VoltageParser.java', javaRoot)),
      fileURLToPath(new URL('MotorStatusParser.java', javaRoot)),
      fileURLToPath(new URL('android/src/test/java/expo/modules/brainstemgrpc/ControlStatusParserTest.java', moduleRoot)),
      fileURLToPath(new URL('android/src/test/java/expo/modules/brainstemgrpc/ProfileInfoParserTest.java', moduleRoot)),
      fileURLToPath(new URL('android/src/test/java/expo/modules/brainstemgrpc/DiagnosticsParserTest.java', moduleRoot)),
    ], { encoding: 'utf8' });
    assert.equal(compile.status, 0, compile.stderr || compile.error?.message);
    const run = spawnSync('java', ['-cp', output, 'expo.modules.brainstemgrpc.ControlStatusParserTest'], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr || run.error?.message);
    assert.match(run.stdout, /PASS: 60 enum combinations, proto defaults, sensitive field omission, malformed and size fixtures/);
    const profileRun = spawnSync('java', ['-cp', output, 'expo.modules.brainstemgrpc.ProfileInfoParserTest'], { encoding: 'utf8' });
    assert.equal(profileRun.status, 0, profileRun.stderr || profileRun.error?.message);
    assert.match(profileRun.stdout, /PASS: profile metadata/);
    const diagnosticsRun = spawnSync('java', ['-cp', output, 'expo.modules.brainstemgrpc.DiagnosticsParserTest'], { encoding: 'utf8' });
    assert.equal(diagnosticsRun.status, 0, diagnosticsRun.stderr || diagnosticsRun.error?.message);
    assert.match(diagnosticsRun.stdout, /PASS: voltage and motor diagnostics/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('four read-only unary RPCs use TLS, bounded lifecycle and OS picker', async () => {
  const native = await read('android/src/main/java/expo/modules/brainstemgrpc/BrainstemGrpcModule.kt');
  assert.match(native, /brainstem\.api\.v1\.RobotControl\/GetControlStatus/);
  assert.match(native, /RobotControl\/GetProfile/);
  assert.match(native, /RobotControl\/GetVoltage/);
  assert.match(native, /RobotControl\/GetMotorStatus/);
  assert.doesNotMatch(native, /\/(?:Enable|Disable|Walk|WalkChecked|SwitchProfile|AcquireControl|RenewControlLease|ReleaseControl|StandUp|SitDown|Task|Recall)["')]/);
  assert.doesNotMatch(native, /overrideAuthority|hostnameVerifier|checkServerTrusted|(?:privateKey|key)\.encoded|FileOutputStream|Log\./);
  assert.match(native, /if \(lanDev\) builder\.usePlaintext\(\) else builder\.useTransportSecurity\(\)/);
  assert.match(native, /lanDev && \(!validLanEndpoint/);
  for (const required of ['KeyChain.choosePrivateKeyAlias', 'KeyChain.getPrivateKey', 'KeyChain.getCertificateChain',
    'useTransportSecurity()', 'sslSocketFactory(', 'maxInboundMessageSize(ControlStatusParser.MAX_BYTES)',
    'withDeadlineAfter(', 'OnActivityEntersBackground', 'OnDestroy', 'shutdownNow()', 'cancelStatus', 'AtomicBoolean']) {
    assert.ok(native.includes(required), required);
  }
  assert.match(native, /init\(emptyArray<KeyManager>\(\), null, null\)/);
  assert.match(native, /alias\?\.let \{ selectedIdentityTls\(host, port, it\) \}/);
  const gradle = await read('android/build.gradle');
  assert.match(gradle, /io\.grpc:grpc-okhttp:1\.85\.1/);
  assert.match(gradle, /io\.grpc:grpc-api:1\.85\.1/);
  const config = JSON.parse(await read('expo-module.config.json'));
  assert.deepEqual(config.platforms, ['android']);
  assert.deepEqual(config.android.modules, ['expo.modules.brainstemgrpc.BrainstemGrpcModule']);
});

test('native callback envelopes match the JS readers, including the unwrapped motor array', async () => {
  const native = await read('android/src/main/java/expo/modules/brainstemgrpc/BrainstemGrpcModule.kt');
  const service = await readFile(new URL('src/services/brainstemGrpc.ts', root), 'utf8');
  for (const [method, key, parser] of [
    ['STATUS', 'status', 'ControlStatusParser'], ['PROFILE', 'profile', 'ProfileInfoParser'], ['VOLTAGE', 'voltage', 'VoltageParser'],
  ]) {
    assert.ok(native.includes(`promise, ${method}_METHOD) { bytes -> mapOf("${key}" to ${parser}.parse(bytes)) }`), key);
    assert.ok(service.includes(`!('${key}' in value)`), `${key} JS boundary`);
  }
  assert.ok(native.includes('promise, MOTOR_STATUS_METHOD) { bytes -> MotorStatusParser.parse(bytes) }'));
  assert.match(await read('android/src/main/java/expo/modules/brainstemgrpc/MotorStatusParser.java'), /result\.put\("motors", motors\)/);
  assert.ok(service.includes("const motors = value.motors"));
  assert.ok(native.includes('mapOf("requestId" to read.id) + projected'));
  assert.doesNotMatch(native, /"status" to projected/, 'all payloads must not be placed in status');
});
