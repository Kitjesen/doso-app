import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const compile = source => ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022,
} }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const sharedUrl = moduleUrl(compile(await readFile(new URL('../src/services/brainstemReadOnly.ts', import.meta.url), 'utf8')));
const readonlyUrl = moduleUrl(compile(await readFile(new URL('../src/services/lingtuReadOnly.ts', import.meta.url), 'utf8')).replace('./brainstemReadOnly.ts', sharedUrl));
const source = await readFile(new URL('../src/services/lingtuTasks.ts', import.meta.url), 'utf8');
const { readLingtuTask, cancelLingtuTask, LingtuTaskError } = await import(moduleUrl(compile(source)
  .replace('./brainstemReadOnly.ts', sharedUrl).replace('./lingtuReadOnly.ts', readonlyUrl)));
const response = (value, options = {}) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...options });
const errorCode = code => error => error.code === code;
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const taskId = 'fixture-task', requestId = 'fixture-cancel-request';
function nav(patch = {}) {
  return { schema_version: 3, ts: 1000, task: { state: 'EXECUTING', task_id: taskId, reason: '' },
    control: { authority: 'AUTONOMY', resume_required: false },
    motion: { permission: 'HELD', stop_confirmation: 'PENDING', observation: 'UNKNOWN' }, ...patch };
}
function detail(patch = {}) {
  return { schema_version: 1, ts: 1000, found: true, task_id: taskId, request_id: 'original-goal',
    source: 'live_gateway_cache', evidence_status: 'live',
    status: { task_id: taskId, request_id: 'original-goal', ts: 900, state_name: 'EXECUTING',
      lifecycle_state_name: 'EXECUTING', phase: 'PATH_ACTIVE', terminal: false }, ...patch };
}
function receipt(patch = {}) {
  return { schema_version: 1, ok: true, accepted: true, status: 'cancel_requested', task_id: taskId,
    execution_confirmed: false, command: { name: 'navigation_cancel', task_id: taskId, request_id: requestId,
      client_id: 'doso-app', accepted: true, replay: false, ts: 1000 }, ...patch };
}
function options(values = [nav(), detail()], extra = {}) {
  const calls = []; let index = 0;
  return { calls, input: { endpoint: 'https://navigation.example', now: () => 1000,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return response(values[index++]); }, ...extra } };
}
async function runningSnapshot() { return readLingtuTask(options().input); }

test('reads the current task with two fixed GETs and never grants movement', async () => {
  const f = options(); const snapshot = await readLingtuTask(f.input);
  assert.deepEqual(f.calls.map(call => call.url), [
    'https://navigation.example/api/v1/navigation/status', 'https://navigation.example/api/v1/navigation/tasks/fixture-task',
  ]);
  for (const { init } of f.calls) {
    assert.equal(init.method, 'GET'); assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined);
  }
  assert.deepEqual(snapshot, { endpoint: 'https://navigation.example', observedAt: 1000,
    taskId, found: true, state: 'EXECUTING', phase: 'PATH_ACTIVE', terminal: false,
    currentTaskId: taskId, currentTaskState: 'EXECUTING', stopConfirmation: 'PENDING',
    source: 'live_gateway_cache', evidenceStatus: 'live', producedAt: 900,
    controlAuthority: 'AUTONOMY', motionPermission: 'HELD', motionAuthorized: false });
});

test('idle without a task ID performs only one GET and leaves terminal and stop status unknown', async () => {
  const f = options([nav({ task: { state: 'IDLE', task_id: '', reason: '' } })]);
  const snapshot = await readLingtuTask(f.input);
  assert.equal(f.calls.length, 1); assert.equal(snapshot.found, false); assert.equal(snapshot.taskId, null);
  assert.equal(snapshot.state, 'IDLE'); assert.equal(snapshot.terminal, null); assert.equal(snapshot.stopConfirmation, null);
});

test('historical task queries do not inherit the current task stop confirmation', async () => {
  const historyId = 'history:task.1';
  const f = options([nav(), detail({ task_id: historyId, status: { task_id: historyId,
    state_name: 'SUCCESS', phase: 'REACHED', terminal: true } })], { taskId: historyId });
  const snapshot = await readLingtuTask(f.input);
  assert.match(f.calls[1].url, /history%3Atask\.1$/); assert.equal(snapshot.taskId, historyId);
  assert.equal(snapshot.state, 'SUCCESS'); assert.equal(snapshot.terminal, true);
  assert.equal(snapshot.currentTaskId, taskId); assert.equal(snapshot.stopConfirmation, null);
  let sends = 0;
  await assert.rejects(cancelLingtuTask({ snapshot, requestId, now: () => 1000,
    fetchImpl: async () => { sends++; return response(receipt()); } }), errorCode('cancel_blocked'));
  assert.equal(sends, 0);
});

test('not-found and absent optional status observations remain unknown', async () => {
  const missing = await readLingtuTask(options([nav(), detail({ found: false, status: null })]).input);
  assert.equal(missing.found, false); assert.equal(missing.state, null); assert.equal(missing.terminal, null);
  const unknown = await readLingtuTask(options([nav(), detail({ status: { task_id: taskId } })]).input);
  assert.equal(unknown.found, true); assert.equal(unknown.state, null); assert.equal(unknown.phase, null); assert.equal(unknown.terminal, null);
});

test('unsupported versions, malformed values and mismatched task identities reject the read batch', async () => {
  for (const mutate of [
    values => { values[0].schema_version = 2; }, values => { values[1].schema_version = 2; },
    values => { values[1].task_id = 'different-task'; }, values => { values[1].status.task_id = 'different-task'; },
    values => { values[1].found = 'true'; }, values => { values[1].status.terminal = 'false'; },
    values => { values[1].status.phase = {}; }, values => { values[1].status = null; },
    values => { values[1].found = false; }, values => { values[1].status.lifecycle_state_name = 'FAILED'; },
    values => { values[0].task.state = 'running-ish'; }, values => { values[0].control.authority = 'APP'; },
    values => { values[0].motion.permission = 'ON'; }, values => { values[0].motion.stop_confirmation = 'DONE'; },
    values => { values[1].status.phase = 'ALMOST_DONE'; }, values => { values[1].status.terminal = true; },
    values => { values[1].status = { task_id: taskId, state_name: 'SUCCESS', phase: 'REACHED', terminal: false }; },
    values => { values[1].status.ts = '900'; }, values => { values[1].source = 'another-source'; },
  ]) {
    const values = [nav(), detail()]; mutate(values);
    await assert.rejects(readLingtuTask(options(values).input), errorCode('invalid_response'));
  }
  let index = 0;
  await assert.rejects(readLingtuTask({ endpoint: 'https://navigation.example', now: () => 1000,
    fetchImpl: async () => new Response(JSON.stringify([nav(), detail()][index++]).replace('"ts":900,', '"ts":1e400,'),
      { headers: { 'content-type': 'application/json' } }) }), errorCode('invalid_response'));
});

test('stale current navigation with a retained task ID is not considered an active cancellable task', async () => {
  const snapshot = await readLingtuTask(options([nav({ task: { state: 'UNKNOWN', task_id: taskId },
    motion: { permission: 'UNKNOWN', stop_confirmation: 'CONFIRMED' } }), detail()]).input);
  assert.equal(snapshot.found, true); assert.equal(snapshot.state, 'EXECUTING');
  assert.equal(snapshot.currentTaskState, 'UNKNOWN');
  assert.equal(snapshot.stopConfirmation, null, 'a retained unknown task cannot inherit old stop confirmation');
  let sends = 0;
  await assert.rejects(cancelLingtuTask({ snapshot, requestId, now: () => 1000,
    fetchImpl: async () => { sends++; return response(receipt()); } }), errorCode('cancel_blocked'));
  assert.equal(sends, 0);
});

test('durable task evidence and producer timestamp remain record facts instead of HTTP freshness', async () => {
  const history = detail({ source: 'durable_task_ledger', evidence_status: 'retained',
    status: { task_id: taskId, ts: 12, state_name: 'CANCELLED', phase: 'CANCELLED', terminal: true } });
  const snapshot = await readLingtuTask(options([nav(), history], { now: () => 50000 }).input);
  assert.equal(snapshot.observedAt, 50000); assert.equal(snapshot.producedAt, 12);
  assert.equal(snapshot.source, 'durable_task_ledger'); assert.equal(snapshot.evidenceStatus, 'retained');
  assert.equal(snapshot.terminal, true); assert.equal(snapshot.motionAuthorized, false);
  const absent = await readLingtuTask(options([nav(), detail({ source: '', evidence_status: '',
    status: { task_id: taskId } })]).input);
  assert.equal(absent.producedAt, null); assert.equal(absent.source, null); assert.equal(absent.evidenceStatus, null);
});

test('reads obey cancellation and timeout even when the transport returns late', async () => {
  for (const timedOut of [false, true]) {
    const controller = new AbortController(), late = deferred(); let calls = 0;
    const reading = readLingtuTask({ endpoint: 'https://navigation.example', signal: controller.signal, now: () => 1000,
      timeoutMs: timedOut ? 5 : 1000, fetchImpl: () => { calls++; return late.promise; } });
    if (!timedOut) controller.abort();
    await assert.rejects(reading, errorCode(timedOut ? 'timeout' : 'cancelled'));
    late.resolve(response(nav())); await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
  }
});

test('the task snapshot keeps the batch-start clock and rejects an expired read without wall-clock dependence', async t => {
  const wall = t.mock.method(Date, 'now', () => { throw new Error('wall clock must not be used'); });
  let at = 1000;
  const f = options([nav(), detail()], { now: () => at }); const fetch = f.input.fetchImpl;
  f.input.fetchImpl = async (...args) => { at += 500; return fetch(...args); };
  const snapshot = await readLingtuTask(f.input); assert.equal(snapshot.observedAt, 1000);
  at = 1000; const stale = options([nav(), detail()], { now: () => at }); const staleFetch = stale.input.fetchImpl;
  stale.input.fetchImpl = async (...args) => { at += 8000; return staleFetch(...args); };
  await assert.rejects(readLingtuTask(stale.input), errorCode('invalid_response'));
  assert.equal(wall.mock.callCount(), 0);
});

test('targeted cancellation sends one POST with independent request ID and reports acceptance only', async () => {
  const snapshot = await runningSnapshot(), calls = [];
  const result = await cancelLingtuTask({ snapshot, requestId, now: () => 1000,
    fetchImpl: async (url, init) => { calls.push({ url, init }); return response(receipt(), { status: 202 }); } });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://navigation.example/api/v1/navigation/tasks/fixture-task/cancel');
  assert.equal(calls[0].init.method, 'POST'); assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), { task_id: taskId, request_id: requestId, client_id: 'doso-app', reason: 'client_cancel' });
  assert.deepEqual(result, { endpoint: 'https://navigation.example', taskId, requestId, accepted: true, completionConfirmed: false });
  assert.equal(snapshot.state, 'EXECUTING'); assert.equal(snapshot.terminal, false);
});

test('cancellation requires a fresh found current active nonterminal task before any network mutation', async () => {
  const snapshot = await runningSnapshot(); let calls = 0;
  for (const patch of [
    { found: false }, { found: 'true' }, { taskId: null }, { currentTaskId: 'other' },
    { terminal: true }, { terminal: null }, { currentTaskState: 'UNKNOWN' }, { currentTaskState: 'IDLE' },
    { observedAt: -1 }, { observedAt: 1001 },
  ]) await assert.rejects(cancelLingtuTask({ snapshot: { ...snapshot, ...patch }, requestId, now: () => 1000,
    fetchImpl: async () => { calls++; return response(receipt()); } }), errorCode('cancel_blocked'));
  for (const invalidId of ['', undefined, null, taskId, 'request with spaces']) await assert.rejects(cancelLingtuTask({ snapshot,
    requestId: invalidId, now: () => 1000, fetchImpl: async () => { calls++; return response(receipt()); } }), errorCode('cancel_blocked'));
  await assert.rejects(cancelLingtuTask({ snapshot, requestId, now: () => 16000,
    fetchImpl: async () => { calls++; return response(receipt()); } }), errorCode('cancel_blocked'));
  assert.equal(calls, 0);
});

test('every allowed current active state still needs a matching terminal-false task snapshot', async () => {
  const snapshot = await runningSnapshot();
  for (const state of ['PLANNING', 'EXECUTING', 'RECOVERING', 'PAUSED']) {
    const result = await cancelLingtuTask({ snapshot: { ...snapshot, currentTaskState: state }, requestId, now: () => 1000,
      fetchImpl: async () => response(receipt()) });
    assert.equal(result.accepted, true); assert.equal(result.completionConfirmed, false);
  }
});

test('mismatched or rejected cancellation receipts are unknown and never retried or sent through global cancel', async () => {
  const snapshot = await runningSnapshot();
  for (const mutate of [
    value => { value.schema_version = 2; }, value => { value.task_id = 'other'; },
    value => { value.command.task_id = 'other'; }, value => { value.command.request_id = 'old'; },
    value => { value.command.client_id = 'other-client'; }, value => { value.command.name = 'stand_up'; },
    value => { value.accepted = false; }, value => { value.command.accepted = false; },
  ]) {
    const value = receipt(); mutate(value); let calls = 0;
    await assert.rejects(cancelLingtuTask({ snapshot, requestId, now: () => 1000,
      fetchImpl: async url => { calls++; assert.match(url, /\/tasks\/fixture-task\/cancel$/); return response(value); } }),
    error => error instanceof LingtuTaskError && error.code === 'cancel_unknown');
    assert.equal(calls, 1);
  }
});

test('HTTP failure, timeout, or cancellation after sending reports unknown without replay or raw error text', async () => {
  const snapshot = await runningSnapshot();
  for (const failure of ['http', 'timeout', 'abort', 'error']) {
    const controller = new AbortController(); let calls = 0;
    const promise = cancelLingtuTask({ snapshot, requestId, now: () => 1000, signal: controller.signal, timeoutMs: 5,
      fetchImpl: async () => {
        calls++;
        if (failure === 'http') return response({ message: 'private-server-details' }, { status: 500 });
        if (failure === 'error') throw new Error('private-server-details');
        return new Promise(() => {});
      } });
    if (failure === 'abort') controller.abort();
    await assert.rejects(promise, error => errorCode('cancel_unknown')(error) && !error.message.includes('private-server-details'));
    assert.equal(calls, 1);
  }
});

test('an already-cancelled caller sends no cancel request', async () => {
  const snapshot = await runningSnapshot(), controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(cancelLingtuTask({ snapshot, requestId, now: () => 1000, signal: controller.signal,
    fetchImpl: async () => { calls++; return response(receipt()); } }), errorCode('cancelled'));
  assert.equal(calls, 0);
});

test('task terminal status and physical stop confirmation remain independent observations after acceptance', async () => {
  const snapshot = await runningSnapshot();
  await cancelLingtuTask({ snapshot, requestId, now: () => 1000, fetchImpl: async () => response(receipt()) });
  const after = await readLingtuTask(options([nav({ task: { task_id: taskId, state: 'CANCELLED' } }),
    detail({ status: { task_id: taskId, state_name: 'CANCELLED', phase: 'CANCELLED', terminal: true } })]).input);
  assert.equal(after.terminal, true); assert.equal(after.state, 'CANCELLED');
  assert.equal(after.stopConfirmation, 'PENDING'); assert.equal(after.motionAuthorized, false);
});
