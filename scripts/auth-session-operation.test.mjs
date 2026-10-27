import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function coordinator() {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../src/services/authSessionOperation.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error });
  return module.exports;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('observers identify owned preparation without releasing exclusion or leaking owner after settlement', async () => {
  const api = coordinator(), hold = deferred(), owner = {}, snapshots = [];
  const unsubscribe = api.subscribeAuthSessionOperations(() => snapshots.push(api.getAuthSessionOperationSnapshot()));
  const unsubscribeBroken = api.subscribeAuthSessionOperations(() => { throw new Error('fixture observer'); });
  const pending = api.runAuthSessionOperation(() => hold.promise, { observerOwner: owner });
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].busy, true);
  assert.equal(snapshots[0].owner, owner);
  await assert.rejects(api.runAuthSessionOperation(async () => undefined), api.isAuthSessionOperationBusyError);
  hold.resolve(); await pending;
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[1].busy, false);
  assert.equal(snapshots[1].owner, null);
  assert.equal(snapshots[1].revision, snapshots[0].revision + 1);
  unsubscribe(); unsubscribeBroken();
  await api.runAuthSessionOperation(async () => undefined);
  assert.equal(snapshots.length, 2);
});

test('read classification never weakens busy exclusion, resets on idle and leaves writes as default', async () => {
  const api = coordinator(), hold = deferred(), owner = {}, snapshots = [];
  const unsubscribe = api.subscribeAuthSessionOperations(() => snapshots.push(api.getAuthSessionOperationSnapshot()));
  const read = api.runAuthSessionOperation(() => hold.promise, { observerOwner: owner, kind: 'session-read' });
  try {
    assert.equal(snapshots[0].busy, true);
    assert.equal(snapshots[0].kind, 'session-read');
    assert.equal(snapshots[0].owner, owner);
    await assert.rejects(api.runAuthSessionOperation(async () => 'write'), api.isAuthSessionOperationBusyError);
    hold.resolve(); await read;
    assert.equal(api.getAuthSessionOperationSnapshot().kind, null);
    await api.runAuthSessionOperation(async () => {
      assert.equal(api.getAuthSessionOperationSnapshot().kind, 'session-write');
    });
    assert.equal(api.getAuthSessionOperationSnapshot().kind, null);
  } finally { hold.resolve(); await read; unsubscribe(); }
});

test('same-tick competitors fail before their callback runs and a fresh operation can run after completion', async () => {
  const api = coordinator(), first = deferred();
  let secondStarted = false;
  const pending = api.runAuthSessionOperation(() => first.promise);
  await assert.rejects(api.runAuthSessionOperation(async () => { secondStarted = true; }),
    api.isAuthSessionOperationBusyError);
  assert.equal(secondStarted, false);
  first.resolve('done');
  assert.equal(await pending, 'done');
  assert.equal(await api.runAuthSessionOperation(async () => 'fresh'), 'fresh');
});

test('synchronous throws and actual rejected operations release their own lease', async () => {
  const api = coordinator();
  for (const start of [() => { throw new Error('fixture'); }, async () => { throw new Error('fixture'); }]) {
    await assert.rejects(api.runAuthSessionOperation(start), /fixture/);
    assert.equal(await api.runAuthSessionOperation(async () => 'available'), 'available');
  }
});

test('an outward failure does not release a retained SDK operation and late rejection is observed safely', async () => {
  const api = coordinator(), sdk = deferred();
  let retained;
  const outward = api.runAuthSessionOperation(async lease => {
    retained = lease.retain(() => sdk.promise);
    void retained.catch(() => undefined);
    throw new Error('UI deadline fixture');
  });
  await assert.rejects(outward, /UI deadline fixture/);
  await assert.rejects(api.runAuthSessionOperation(async () => undefined), api.isAuthSessionOperationBusyError);
  sdk.reject(new Error('SDK settled fixture'));
  await assert.rejects(retained, /SDK settled fixture/);
  assert.equal(await api.runAuthSessionOperation(async () => 'available'), 'available');
});

test('multiple retained SDK operations all have to settle before a new operation starts', async () => {
  const api = coordinator(), one = deferred(), two = deferred();
  let first, second;
  await api.runAuthSessionOperation(async lease => {
    first = lease.retain(() => one.promise);
    second = lease.retain(() => two.promise);
  });
  one.resolve(); await first;
  await assert.rejects(api.runAuthSessionOperation(async () => undefined), api.isAuthSessionOperationBusyError);
  two.resolve(); await second;
  assert.equal(await api.runAuthSessionOperation(async () => 'available'), 'available');
});

test('a finished lease cannot start another callback or interfere with the next owner', async () => {
  const api = coordinator(), second = deferred();
  let oldLease, staleStarted = false;
  await api.runAuthSessionOperation(async lease => { oldLease = lease; });
  const next = api.runAuthSessionOperation(() => second.promise);
  await assert.rejects(oldLease.retain(async () => { staleStarted = true; }), api.isAuthSessionOperationBusyError);
  assert.equal(staleStarted, false);
  await assert.rejects(api.runAuthSessionOperation(async () => undefined), api.isAuthSessionOperationBusyError);
  second.resolve(); await next;
});
