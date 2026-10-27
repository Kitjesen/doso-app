import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createAuthStorageGeneration } from '../src/services/authStorageGeneration.ts';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const { storePKCEVerifier, removeAllPKCEVerifiers, validatePKCEFlowId } = createRequire(import.meta.url)('@supabase/auth-js/dist/main/lib/helpers.js');

test('local exit drains an entered write, removes only auth keys and fences late old-client writes', async () => {
  const entered = deferred(), release = deferred();
  const values = new Map([['auth', 'old'], ['installation', 'keep'], ['robot-preferences', 'keep']]);
  const boundary = createAuthStorageGeneration({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { entered.resolve(); await release.promise; values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  });
  const old = boundary.forCurrentClient();
  const pending = old.setItem('auth', 'entered-before-exit');
  await entered.promise;
  const clear = boundary.clear('auth');
  const late = old.setItem('auth', 'late-old-session');
  release.resolve(); await Promise.all([pending, clear, late]);
  assert.equal(await old.getItem('auth'), null);
  assert.equal(values.has('auth'), false);
  assert.equal(values.get('installation'), 'keep');
  assert.equal(values.get('robot-preferences'), 'keep');
  const fresh = boundary.forCurrentClient();
  await fresh.setItem('auth', 'new-user');
  await old.removeItem('auth');
  assert.equal(await fresh.getItem('auth'), 'new-user');
});

test('failed cleanup rejects and can be explicitly retried without restoring retired writes', async () => {
  let fails = true;
  const values = new Map([['auth', 'old']]);
  const boundary = createAuthStorageGeneration({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { if (fails) throw new Error('synthetic storage failure'); values.delete(key); },
  });
  const old = boundary.forCurrentClient();
  await assert.rejects(boundary.clear('auth'), /synthetic storage failure/);
  await old.setItem('auth', 'resurrected');
  assert.equal(values.get('auth'), 'old');
  fails = false;
  await boundary.clear('auth');
  assert.equal(await boundary.forCurrentClient().getItem('auth'), null);
});

test('clears real SDK indexed flow slots using its validation and preserves foreign keys', async () => {
  const values = new Map([['installation', 'keep'], ['another-auth-flows-code-verifier', '["foreign123"]']]);
  const removed = [];
  const raw = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { removed.push(key); values.delete(key); },
  };
  const boundary = createAuthStorageGeneration(raw), sdkStorage = boundary.forCurrentClient();
  for (const id of ['0123456789abcdef0123456789abcdef', 'valid_ID-123']) {
    assert.equal(validatePKCEFlowId(id), id);
    await storePKCEVerifier(sdkStorage, 'auth', id, `synthetic-${id}`);
  }
  const indexKey = 'auth-flows-code-verifier';
  const index = JSON.parse(values.get(indexKey));
  values.set(indexKey, JSON.stringify([...index, '../foreign', 'short', null, {}, 'x'.repeat(65)]));
  const oracle = new Map(values);
  await removeAllPKCEVerifiers({ ...raw, getItem: async key => oracle.get(key) ?? null,
    removeItem: async key => { oracle.delete(key); } }, 'auth');
  await boundary.clear('auth');
  assert.deepEqual([...values.keys()].sort(), [...oracle.keys()].sort());
  assert.equal(removed.at(-1), indexKey);
  assert.equal(values.get('installation'), 'keep');
  assert.equal(values.has('another-auth-flows-code-verifier'), true);
  assert.ok(removed.every(key => key === 'auth' || /^auth-(?:user|code-verifier|flows-code-verifier|flow-[a-zA-Z0-9_-]{8,64}-code-verifier)$/.test(key)));
});

test('retired real SDK flow creation cannot leave an entered but not yet indexed verifier slot', async () => {
  const entered = deferred(), release = deferred(), values = new Map();
  const boundary = createAuthStorageGeneration({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => {
      if (key.includes('-flow-')) { entered.resolve(); await release.promise; }
      values.set(key, value);
    },
    removeItem: async key => { values.delete(key); },
  });
  const old = boundary.forCurrentClient();
  const storing = storePKCEVerifier(old, 'auth', '0123456789abcdef0123456789abcdef', 'synthetic-verifier');
  await entered.promise;
  const clear = boundary.clear('auth');
  release.resolve();
  await Promise.all([storing, clear]);
  assert.equal(values.size, 0);
});

test('slot cleanup failure preserves flow index for retry and index is deleted last', async () => {
  const id = '0123456789abcdef0123456789abcdef', indexKey = 'auth-flows-code-verifier';
  const values = new Map([[indexKey, JSON.stringify([id])], [`auth-flow-${id}-code-verifier`, 'synthetic']]);
  let fails = true;
  const removed = [];
  const boundary = createAuthStorageGeneration({
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => {
      if (fails && key.includes('-flow-')) throw new Error('synthetic slot failure');
      removed.push(key); values.delete(key);
    },
  });
  await assert.rejects(boundary.clear('auth'), /synthetic slot failure/);
  assert.equal(values.has(indexKey), true);
  fails = false;
  await boundary.clear('auth');
  assert.equal(values.size, 0);
  assert.equal(removed.at(-1), indexKey);
});
