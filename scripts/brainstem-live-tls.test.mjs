import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

// Offline toolchain only. Override paths for another workstation; nothing is installed.
const root = fileURLToPath(new URL('../', import.meta.url));
const python = process.env.DOSO_TEST_PYTHON || path.join(homedir(), 'miniconda3/python.exe');
const jdk = process.env.DOSO_TEST_JDK || path.resolve(root,
  '../.local-toolchains/microsoft-jdk-21/jdk-21.0.12.1+1');
const java = path.join(jdk, 'bin/java.exe');
const javac = path.join(jdk, 'bin/javac.exe');
const protoRoot = process.env.DOSO_TEST_PROTO_ROOT || 'D:/inovxio/brain/brainstem/brainstem_api';
const fixture = path.join(root, 'scripts/fixtures/brainstem-tls-server.py');
const native = path.join(root, 'modules/brainstem-grpc/android/src');
const source = (name) => path.join(native, 'main/java/expo/modules/brainstemgrpc', name);
const childStates = new WeakMap();
function observeChild(child) {
  const state = { spawnError: null, closed: false };
  childStates.set(child, state);
  child.once('error', (error) => { state.spawnError = error; });
  child.once('close', () => { state.closed = true; });
  child.stdin?.on('error', () => {}); // An already-exited fixture can close its stdin before cleanup.
  return child;
}

async function jar(group, artifact, version) {
  const directory = path.join(homedir(), '.gradle/caches/modules-2/files-2.1', group, artifact, version);
  for (const hash of await readdir(directory)) {
    const found = (await readdir(path.join(directory, hash))).find((name) => name === `${artifact}-${version}.jar`);
    if (found) return path.join(directory, hash, found);
  }
  throw new Error(`Required existing cached JAR missing: ${group}:${artifact}:${version}`);
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 60000, ...options });
  assert.equal(result.status, 0, result.error?.message || `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
async function readyFile(file, child) {
  for (let i = 0; i < 100; i++) {
    const state = childStates.get(child);
    if (state?.spawnError) throw new Error(`Fixture process creation failed: ${state.spawnError.code}`);
    assert.equal(state?.closed, false, 'Loopback fixture closed before publishing its port');
    try { return JSON.parse(await readFile(file, 'utf8')); } catch {}
    if (state?.spawnError) throw new Error(`Fixture process creation failed: ${state.spawnError.code}`);
    assert.equal(child.exitCode, null, 'Loopback fixture exited before publishing its port');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Loopback TLS fixture startup exceeded 10 seconds');
}
async function stop(child) {
  // Failed spawn has no PID and emits error/close, potentially never exit.
  if (!child.pid || child.exitCode !== null || child.signalCode !== null || childStates.get(child)?.closed) return;
  let finish;
  const exited = new Promise((resolve) => { finish = resolve; child.once('exit', finish); child.once('close', finish); });
  child.stdin?.end('stop\n');
  const killTimer = setTimeout(() => { child.kill(); }, 5000);
  let expiry;
  try {
    await Promise.race([exited, new Promise((_, reject) => {
      expiry = setTimeout(() => reject(new Error('Owned loopback fixture did not exit after termination')), 10000);
    })]);
  } finally {
    clearTimeout(killTimer); clearTimeout(expiry);
    child.removeListener('exit', finish); child.removeListener('close', finish);
  }
}

test('fixture process startup failure exits cleanup without waiting for a missing exit event', { timeout: 2000 }, async () => {
  const absent = path.join(tmpdir(), `doso-live-tls-absent-${randomUUID()}.exe`);
  const child = observeChild(spawn(absent, [], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true }));
  try {
    await assert.rejects(readyFile(`${absent}.ready.json`, child), /Fixture process creation failed: ENOENT/);
  } finally { await stop(child); }
  assert.equal(child.pid, undefined);
  assert.equal(childStates.get(child).spawnError.code, 'ENOENT');
});

test('real native ControlSession crosses independent protobuf gRPC mTLS/HTTP2 fixture', { timeout: 180000 }, async (t) => {
  const temporaryRoot = await realpath(tmpdir());
  const output = await mkdtemp(path.join(temporaryRoot, 'doso-live-tls-'));
  let server;
  try {
    // Remove inherited Windows ACLs BEFORE writing ephemeral private keys. Do not print SID/key material.
    if (process.platform === 'win32') {
      const sid = run('whoami', ['/user', '/fo', 'csv', '/nh']).match(/S-1-[0-9-]+/)?.[0];
      assert.ok(sid, 'Cannot establish temporary certificate directory owner');
      run('icacls', [output, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`]);
    }
    const generated = path.join(output, 'generated');
    const classes = path.join(output, 'classes');
    await mkdir(generated); await mkdir(classes);
    const protocIncludes = run(python, ['-c', 'import pathlib,grpc_tools; print(pathlib.Path(grpc_tools.__file__).parent / "_proto")']);
    run(python, ['-m', 'grpc_tools.protoc', `-I${protoRoot}`, `-I${protocIncludes}`,
      `--python_out=${generated}`, `--grpc_python_out=${generated}`,
      path.join(protoRoot, 'brainstem_api/cms.proto'), path.join(protoRoot, 'brainstem_api/common.proto')]);
    run(python, [fixture, 'prepare', output]);
    const clock = path.join(output, 'SystemClock.java');
    await writeFile(clock, 'package android.os; public final class SystemClock { public static long elapsedRealtime() { return System.nanoTime()/1000000L; } }');
    run(javac, ['-encoding', 'UTF-8', '-d', classes, clock, ...[
      'ControlStatusParser.java', 'ProfileInfoParser.java', 'VoltageParser.java', 'MotorStatusParser.java', 'ControlWire.java'].map(source)]);
    const compiler = await Promise.all([
      jar('org.jetbrains.kotlin', 'kotlin-compiler-embeddable', '2.1.20'),
      jar('org.jetbrains.kotlin', 'kotlin-stdlib', '2.1.20'),
      jar('org.jetbrains.kotlin', 'kotlin-script-runtime', '2.1.20'),
      jar('org.jetbrains.kotlin', 'kotlin-reflect', '1.6.10'),
      jar('org.jetbrains.intellij.deps', 'trove4j', '1.0.20200330'),
      jar('org.jetbrains', 'annotations', '13.0'),
      jar('org.jetbrains.kotlinx', 'kotlinx-coroutines-core-jvm', '1.8.0')]);
    const runtime = await Promise.all([
      ...['grpc-api', 'grpc-core', 'grpc-context', 'grpc-util', 'grpc-okhttp'].map((name) => jar('io.grpc', name, '1.85.1')),
      jar('com.google.guava', 'guava', '33.6.0-android'),
      jar('com.google.guava', 'failureaccess', '1.0.3'),
      jar('io.perfmark', 'perfmark-api', '0.27.0'),
      jar('com.squareup.okio', 'okio-jvm', '3.4.0'),
      jar('com.google.code.gson', 'gson', '2.14.0')]);
    const classpath = [classes, compiler[1], compiler[5], ...runtime].join(path.delimiter);
    run(java, ['-cp', compiler.join(path.delimiter), 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-stdlib', '-no-reflect', '-jvm-target', '17', '-classpath', classpath, '-d', classes,
      source('ControlSession.kt'), path.join(native, 'test/kotlin/expo/modules/brainstemgrpc/LiveTlsControlProbe.kt')]);
    const javaVersion = spawnSync(java, ['-version'], { encoding: 'utf8', windowsHide: true });
    assert.equal(javaVersion.status, 0);
    t.diagnostic(`${javaVersion.stderr.split('\n')[0]}; ${run(python, ['-m', 'grpc_tools.protoc', '--version'])}; grpc-okhttp 1.85.1`);
    t.diagnostic(run(python, ['-c', 'import grpc,google.protobuf; print("Python grpc="+grpc.__version__+" protobuf="+google.protobuf.__version__)']));
    for (const file of [source('ControlSession.kt'), path.join(protoRoot, 'brainstem_api/cms.proto'), path.join(protoRoot, 'brainstem_api/common.proto')]) {
      t.diagnostic(`${path.basename(file)} sha256=${createHash('sha256').update(await readFile(file)).digest('hex')}`);
    }
    let nativeBaseline = false;
    for (const scenario of ['fixture-contract', 'success', 'unknown-ca', 'wrong-san', 'no-client', 'rogue-client', 'expired-client', 'unmapped', 'lost-ack', 'lost-release']) {
      await t.test(scenario, { skip: !['fixture-contract', 'success'].includes(scenario) && !nativeBaseline
        ? 'Native real-network success prerequisite failed; negative cases cannot establish certificate rejection' : false }, async (caseTest) => {
      const ready = path.join(output, `${scenario}.ready.json`);
      const report = path.join(output, `${scenario}.report.json`);
      server = observeChild(spawn(python, [fixture, 'serve', output, '--generated', generated, '--scenario', scenario,
        '--ready', ready, '--report', report], { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true,
        env: { ...process.env, GRPC_VERBOSITY: 'ERROR' } }));
      // Drain transport diagnostics without publishing certificate/network internals.
      let serverErrors = '';
      server.stderr.on('data', (chunk) => { serverErrors = (serverErrors + chunk.toString()).slice(-4000); });
      let caseError;
      try {
        const endpoint = await readyFile(ready, server);
        assert.equal(endpoint.host, '127.0.0.1');
        assert.ok(Number.isInteger(endpoint.port) && endpoint.port > 0 && endpoint.port < 65536);
        if (scenario === 'fixture-contract') {
          assert.match(run(python, [fixture, 'probe', output, '--generated', generated, '--port', String(endpoint.port)]), /PASS: independent generated-code fixture contract/);
        } else {
          assert.match(run(java, ['-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp', classpath,
            'expo.modules.brainstemgrpc.LiveTlsControlProbeKt', output, String(endpoint.port), scenario], { timeout: 15000 }),
            new RegExp(`PASS: real TLS/HTTP2 ControlSession ${scenario}`));
        }
      } catch (error) { caseTest.diagnostic(`Fixture server diagnostics: ${serverErrors || '(none)'}`); caseError = error; }
      finally { await stop(server); server = undefined; }
      let result;
      try { result = JSON.parse(await readFile(report, 'utf8')); }
      catch (error) { throw caseError || error; }
      const events = result.events;
      const walks = events.filter((event) => event.method === 'WalkChecked');
      if (caseError) {
        caseTest.diagnostic(`FAIL ${scenario}: server observed ${events.length} decoded application events, ${walks.length} fixture-only WalkChecked calls`);
        throw caseError;
      }
      if (scenario === 'fixture-contract') {
        assert.deepEqual(walks.map((event) => event.sequence), [17, 17, 18]);
        assert.deepEqual(walks.map((event) => event.vector), [[.1, 0, 0], [0, 0, 0], [0, 0, 0]]);
        assert.equal(result.lastSequence, 0); assert.equal(result.active, false);
      } else if (['unknown-ca', 'wrong-san', 'no-client', 'rogue-client', 'expired-client'].includes(scenario)) {
        assert.deepEqual(events, [], `${scenario} must fail before any application RPC`);
      } else if (scenario === 'unmapped') {
        assert.ok(events.some((event) => event.method === 'GetProfile'), 'Trusted unmapped leaf must reach public RPC');
        assert.ok(events.some((event) => event.method === 'Denied'));
        assert.deepEqual(walks, []); assert.equal(result.active, false);
      } else {
        assert.deepEqual(walks[0], { method: 'WalkChecked', sequence: 1, vector: [0, 0, 0] });
        assert.equal(events.filter((event) => event.method === 'AcquireControl').length, 1);
        if (scenario === 'lost-ack') {
          assert.deepEqual(walks.map((event) => event.sequence), [1, 2], 'Uncertain ACK must not trigger guessed or repeated sequence');
          assert.deepEqual(walks[1].vector, [.1, 0, 0]);
        } else if (scenario === 'success') {
          assert.deepEqual(walks.map((event) => event.sequence), [1, 2, 3]);
          assert.deepEqual(walks.map((event) => event.vector), [[0, 0, 0], [.1, -.1, .2], [0, 0, 0]]);
        } else {
          assert.deepEqual(walks.map((event) => event.sequence), [1, 2]);
          assert.ok(walks.every((event) => event.vector.every((value) => value === 0)));
        }
        assert.equal(events.filter((event) => event.method === 'ReleaseControl').length, 1);
        assert.equal(result.active, scenario === 'lost-release');
      }
      if (scenario === 'success') nativeBaseline = true;
      caseTest.diagnostic(`PASS ${scenario}: ${events.length} decoded application events, ${walks.length} fixture-only WalkChecked calls`);
      });
    }
  } finally {
    if (server) await stop(server);
    // Verify resolved owned target before recursive deletion on Windows.
    const resolved = await realpath(output);
    assert.equal(path.dirname(resolved).toLowerCase(), temporaryRoot.toLowerCase());
    assert.ok(path.basename(resolved).startsWith('doso-live-tls-'));
    await rm(resolved, { recursive: true, force: true });
  }
});
