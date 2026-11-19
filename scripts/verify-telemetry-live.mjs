import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runBoundedCommand } from './helpers/bounded-command.mjs';

const required = name => { assert(process.env[name], `Missing ${name}`); return process.env[name]; };
const root = resolve(required('DOSO_TELEMETRY_APP_ROOT'));
const psqlExe = required('DOSO_TELEMETRY_PSQL');
const host = required('DOSO_TELEMETRY_PGHOST');
const port = required('DOSO_TELEMETRY_PGPORT');
const database = required('DOSO_TELEMETRY_PGDATABASE');
assert.equal(host, '127.0.0.1');
assert.equal(database, 'doso_multi_device_verification');
assert(/^\d+$/.test(port));
const tbUrl = new URL(required('DOSO_THINGSBOARD_URL'));
assert(['127.0.0.1', '[::1]'].includes(tbUrl.hostname), 'Live verification only targets local ThingsBoard');
assert.equal(tbUrl.pathname, '/');
assert(!tbUrl.username && !tbUrl.password && !tbUrl.search && !tbUrl.hash);
const tbKey = required('DOSO_THINGSBOARD_KEY');
const deno = process.env.DOSO_TELEMETRY_DENO ?? 'C:\\Users\\99563\\AppData\\Local\\npm-cache\\_npx\\de10277f880c84d3\\node_modules\\deno\\deno.exe';
const workerExe = process.env.DOSO_TELEMETRY_WORKER ?? 'D:\\DOSO\\robot-cloud\\target\\debug\\doso-cloud-telemetry.exe';
const device = randomUUID();
const session = randomUUID();
const owner = '11111111-1111-4111-8111-111111111111';
const secret = randomBytes(32).toString('hex');
const evidence = join(root, 'artifacts/telemetry-live', new Date().toISOString().replace(/[:.]/g, '-'));
const report = { scope: 'LOCAL_POSTGRES_HANDLER_RUST_THINGSBOARD', deviceId: device, simulated: true, cases: [], observations: [],
  limits: ['Brainstem/robot and user Auth transport are not exercised; source is an explicitly simulated accepted status.',
    'PostgREST transport alone is replaced by a whitelist psql adapter; production handler, database functions and Rust worker execute.'] };
const children = [];
let platformDevice;
let worker;

async function sql(text) {
  const result = await runBoundedCommand(psqlExe, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', host, '-p', port,
    '-U', 'postgres', '-d', database, '-c', text], { env: process.env, timeoutMs: 20000 });
  assert.equal(result.code, 0, `Local SQL failed: ${result.stderr}`);
  return result.stdout.trim();
}
async function file(name) {
  const result = await runBoundedCommand(psqlExe, ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-w', '-h', host, '-p', port,
    '-U', 'postgres', '-d', database, '-f', join(root, 'supabase/migrations', name)], { env: process.env, timeoutMs: 20000 });
  assert.equal(result.code, 0, `Local migration failed: ${result.stderr}`);
}
async function tb(path, { method = 'GET' } = {}) {
  const response = await fetch(new URL(path, tbUrl), { method, headers: { 'X-Authorization': `ApiKey ${tbKey}` }, signal: AbortSignal.timeout(5000), redirect: 'error' });
  assert(response.ok, `ThingsBoard ${method} failed (${response.status})`);
  return response.status === 204 ? null : await response.text().then(text => text ? JSON.parse(text) : null);
}
function start(executable, args, env) {
  const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const state = { child, stdout: '', stderr: '', stopped: false };
  child.stdout.setEncoding('utf8').on('data', value => { state.stdout = (state.stdout + value).slice(-16384); });
  child.stderr.setEncoding('utf8').on('data', value => { state.stderr = (state.stderr + value).slice(-16384); });
  child.on('error', error => { state.error = error.code; });
  children.push(state);
  return state;
}
async function stop(state) {
  if (!state || state.stopped) return;
  if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill();
  const end = Date.now() + 5000;
  while (state.child.exitCode === null && state.child.signalCode === null && Date.now() < end) await new Promise(done => setTimeout(done, 50));
  assert(state.child.exitCode !== null || state.child.signalCode !== null, 'Owned process termination not confirmed');
  state.stopped = true;
}
async function waitFor(read, predicate, label, timeout = 25000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (predicate(value)) return value;
    assert(!children.some(state => !state.stopped && (state.error || state.child.exitCode !== null)), 'Owned service exited before acceptance');
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error(`Timed out: ${label}`);
}
let epoch;
async function accept(seq, failed = false) {
  const stamp = new Date().toISOString();
  const received = { receivedAt: stamp, report: { v: 1, kind: 'status.report', deviceId: device, connectionId: device,
    reportingSessionId: session, authorizationEpoch: epoch, consentVersion: 2, seq, observedAt: stamp,
    ...(failed ? { error: 'upstream_unavailable' } : { status: { state: { kind: 'CMS_STATE_KIND_STANDING', transition: 'CMS_TRANSITION_KIND_NONE' },
      control: { owner: 'CONTROL_OWNER_NONE', motorOutputEnabled: false, criticalMotorFault: false }, transport: 'mtls',
      location: { lat: 31.2304, lon: 121.4737, fixType: 1, observedAt: stamp, accuracyM: null } } }) } };
  const permission = { authorizationEpoch: epoch, consentVersion: 2, desiredEnabled: true, deviceConfirmed: true,
    reportingSessionId: session, expiresAt: new Date(Date.parse(stamp) + 30000).toISOString() };
  const batch = [{ deviceId: device, connectionId: device, lastSeenAt: stamp, reachable: true, sessionReusable: true, permission, latest: received }];
  await sql(`update private.device_remote_state set issued_at='${stamp}',expires_at='${permission.expiresAt}',confirmed_until='${permission.expiresAt}' where device_id='${device}';
    set role service_role; select public.sync_remote_state('${stamp}', '${JSON.stringify(batch)}'::jsonb);`);
  return { stamp, received, batch };
}
async function history(stamp, keys) {
  const ts = Date.parse(stamp);
  const query = new URLSearchParams({ keys: keys.join(','), startTs: String(ts), endTs: String(ts + 1), agg: 'NONE', limit: '10' });
  return tb(`api/plugins/telemetry/DEVICE/${platformDevice}/values/timeseries?${query}`);
}
function valueAt(history, key, stamp) {
  const points = history[key] ?? [];
  return points.find(point => point.ts === Date.parse(stamp))?.value;
}

try {
  await mkdir(evidence, { recursive: true });
  for (const migration of ['20261104100000_create_device_inventory.sql', '20261107100000_add_simulated_devices.sql', '20261108020000_add_telemetry_export.sql']) await file(migration);
  await sql(`insert into public.devices(id,owner_id,serial_number,model_code,display_name,category,environment,is_simulated)
    values('${device}','${owner}','LIVE-${device}','thunder','Telemetry local acceptance','quadruped','local',true);
    update private.device_remote_state set enabled=true,revision=2,connection_id='${device}',session_id='${session}',
      issued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '30 seconds',confirmed_until=clock_timestamp()+interval '30 seconds' where device_id='${device}';
    set role service_role; select public.configure_telemetry_export('${device}',true);`);
  epoch = Number(await sql(`select robot_authorization_epoch from public.devices where id='${device}';`));
  assert(Number.isSafeInteger(epoch) && epoch > 0);
  const first = await accept(1);
  assert.equal(await sql(`select count(*) from private.telemetry_outbox where device_id='${device}';`), '1');
  const server = start(deno, ['run', '--no-config', '--no-check', '--allow-env', '--allow-net=127.0.0.1', `--allow-run=${psqlExe}`,
    join(root, 'scripts/helpers/telemetry-live-server.ts')], { ...process.env, DOSO_TELEMETRY_LIVE_KEY: secret });
  const ready = await waitFor(() => server.stdout, value => /READY (\d+)/.test(value), 'Edge handler ready');
  const sourceUrl = `http://127.0.0.1:${/READY (\d+)/.exec(ready)[1]}/`;
  const unauthorized = await fetch(sourceUrl, { method: 'POST', body: JSON.stringify({ v: 1, action: 'claim' }), signal: AbortSignal.timeout(3000) });
  assert.equal(unauthorized.status, 401);
  const workerEnv = { ...process.env, DOSO_TELEMETRY_URL: sourceUrl, DOSO_TELEMETRY_KEY: secret };
  worker = start(workerExe, [], workerEnv);
  await waitFor(() => sql(`select state from private.telemetry_outbox where device_id='${device}' and seq=1;`), value => value === 'delivered', 'Rust delivered first status');
  platformDevice = await sql(`select tb_device_id from private.telemetry_devices where device_id='${device}' and authorization_epoch=${epoch};`);
  assert(/^[a-f0-9-]{36}$/.test(platformDevice));
  const firstHistory = await waitFor(() => history(first.stamp, ['seq', 'sampleOk', 'stateKind', 'sourceReport']),
    value => valueAt(value, 'seq', first.stamp) === '1' && valueAt(value, 'sourceReport', first.stamp) !== undefined, 'stored first sample readable');
  assert.equal(valueAt(firstHistory, 'seq', first.stamp), '1');
  assert.equal(valueAt(firstHistory, 'sampleOk', first.stamp), 'true');
  assert.equal(valueAt(firstHistory, 'stateKind', first.stamp), 'CMS_STATE_KIND_STANDING');
  assert.deepEqual(JSON.parse(valueAt(firstHistory, 'sourceReport', first.stamp)), first.received.report);
  report.observations.push({ case: 'accepted', stamp: first.stamp, history: firstHistory });
  report.cases.push('PASS actual_handler_sql_rust_thingsboard_preserves_time_and_location');
  await sql(`set role service_role; select public.sync_remote_state('${new Date().toISOString()}', '${JSON.stringify(first.batch)}'::jsonb);`);
  assert.equal(await sql(`select count(*) from private.telemetry_outbox where device_id='${device}';`), '1');
  report.cases.push('PASS repeated_sync_does_not_duplicate_delivery');
  const failed = await accept(2, true);
  await waitFor(() => sql(`select state from private.telemetry_outbox where device_id='${device}' and seq=2;`), value => value === 'delivered', 'failed sample delivered');
  const failedHistory = await waitFor(() => history(failed.stamp, ['sampleOk', 'readError', 'stateKind', 'motorOutputEnabled', 'sourceReport']),
    value => valueAt(value, 'sampleOk', failed.stamp) === 'false' && valueAt(value, 'sourceReport', failed.stamp) !== undefined, 'stored failed sample readable');
  assert.equal(valueAt(failedHistory, 'sampleOk', failed.stamp), 'false');
  assert.equal(valueAt(failedHistory, 'readError', failed.stamp), 'upstream_unavailable');
  assert.equal(valueAt(failedHistory, 'stateKind', failed.stamp), undefined);
  assert.equal(valueAt(failedHistory, 'motorOutputEnabled', failed.stamp), undefined);
  assert.deepEqual(JSON.parse(valueAt(failedHistory, 'sourceReport', failed.stamp)), failed.received.report);
  report.observations.push({ case: 'read_failure', stamp: failed.stamp, history: failedHistory });
  report.cases.push('PASS actual_read_failure_has_no_fabricated_status');
  await stop(worker);
  const closed = await accept(3);
  await sql(`update private.device_remote_state set enabled=false,revision=revision+1,session_id=null where device_id='${device}';`);
  assert.equal(await sql(`select state from private.telemetry_outbox where device_id='${device}' and seq=3;`), 'cancelled');
  worker = start(workerExe, [], workerEnv);
  await new Promise(done => setTimeout(done, 3000));
  const closedHistory = await history(closed.stamp, ['seq', 'sourceReport']);
  assert.equal(valueAt(closedHistory, 'seq', closed.stamp), undefined);
  report.cases.push('PASS closed_permission_cancels_unsent_actual_platform_delivery');
  report.result = 'PASS';
} catch (error) {
  report.result = 'FAIL';
  report.error = String(error.message).replaceAll(tbKey, '[redacted]').replaceAll(secret, '[redacted]');
  process.exitCode = 1;
} finally {
  const cleanup = [];
  for (const child of children.toReversed()) {
    try { await stop(child); cleanup.push({ pid: child.child.pid, stopped: true }); }
    catch { cleanup.push({ pid: child.child.pid, stopped: false }); process.exitCode = 1; }
  }
  report.cleanup = cleanup;
  if (platformDevice) {
    try { await tb(`api/device/${platformDevice}`, { method: 'DELETE' }); report.platformDeviceRemoved = true; }
    catch { report.platformDeviceRemoved = false; process.exitCode = 1; }
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(evidence, { recursive: true });
  await writeFile(join(evidence, 'verification.json'), JSON.stringify(report, null, 2));
  for (const item of report.cases) console.log(item);
  console.log(`Telemetry evidence: ${join(evidence, 'verification.json')}`);
  if (report.result !== 'PASS') console.error(report.error);
}
