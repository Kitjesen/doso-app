import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OP = '22222222-2222-4222-8222-222222222222';
const CANDIDATE = `${OWNER}/33333333-3333-4333-8333-333333333333.jpg`;
const PREVIOUS = `${OWNER}/44444444-4444-4444-8444-444444444444.png`;

async function loadJournal() {
  const source = await readFile(new URL('../src/services/profileAvatarJournalCore.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

async function loadPlatformJournal(os, store, locks) {
  const core = await loadJournal();
  const source = await readFile(new URL('../src/services/profileAvatarJournal.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports,
    navigator: locks ? { locks } : undefined,
    localStorage: {
      getItem: key => store.values.get(key) ?? null,
      setItem: (key, value) => store.values.set(key, value),
      removeItem: key => store.values.delete(key),
    },
    require(name) {
      if (name === './profileAvatarJournalCore') return core;
      if (name === 'react-native') return { Platform: { OS: os } };
      if (name === 'expo-secure-store') return {
        getItemAsync: store.getItem, setItemAsync: store.setItem,
        deleteItemAsync: store.removeItem, WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return module.exports.profileAvatarJournal;
}

// Persistent storage + cross-client lock are external boundaries. Reconstructing
// the journal never reconstructs this store, modelling an App process restart.
function storage() {
  const values = new Map();
  const locks = new Map();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
    async runExclusive(key, work) {
      const prior = locks.get(key) ?? Promise.resolve();
      const result = prior.then(work, work);
      const settled = result.then(() => {}, () => {});
      locks.set(key, settled);
      try { return await result; }
      finally { if (locks.get(key) === settled) locks.delete(key); }
    },
  };
}

test('an uncertain avatar operation survives reconstruction without recording account secrets or images', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  await createProfileAvatarJournal(store).begin(OWNER, OP, CANDIDATE, PREVIOUS);
  const entry = await createProfileAvatarJournal(store).read(OWNER);
  assert.deepEqual(entry, { version: 1, ownerId: OWNER, operationId: OP, candidatePath: CANDIDATE, previousPath: PREVIOUS, phase: 'uncertain' });
  const serialized = [...store.values.values()][0];
  assert.ok(Buffer.byteLength(serialized) < 1024);
  assert.doesNotMatch(serialized, /password|token|base64|displayName|email|data:image/i);
});

test('only the matching operation can confirm and clear a journal, never an uncertain record', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
  const proof = { phase: 'committed', currentAvatarValue: `profile-avatars/${CANDIDATE}`, cleanupPath: PREVIOUS, outcome: 'removed' };
  await assert.rejects(() => journal.clearResolved(OWNER, OP, proof));
  await assert.rejects(() => journal.mark(OWNER, '55555555-5555-4555-8555-555555555555', 'committed'));
  assert.equal((await journal.read(OWNER)).phase, 'uncertain');
  await journal.mark(OWNER, OP, 'committed');
  await assert.rejects(() => journal.mark(OWNER, OP, 'rolled-back'));
  await assert.rejects(() => journal.clearResolved(OWNER, '55555555-5555-4555-8555-555555555555', proof));
  assert.equal((await createProfileAvatarJournal(store).read(OWNER)).phase, 'committed');
  await journal.clearResolved(OWNER, OP, proof);
  assert.equal(await journal.read(OWNER), null);
});

test('resume planning preserves unknown outcomes and chooses cleanup from a verified current reference', async () => {
  const { createProfileAvatarJournal, planAvatarJournalResume } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
  const uncertain = await journal.read(OWNER);
  const value = path => path === null ? null : `profile-avatars/${path}`;
  assert.deepEqual(planAvatarJournalResume(uncertain, value(PREVIOUS)), { kind: 'wait' });
  assert.deepEqual(planAvatarJournalResume(uncertain, null), { kind: 'wait' });
  assert.deepEqual(planAvatarJournalResume(uncertain, value(CANDIDATE)), { kind: 'confirmed', phase: 'committed', cleanupPath: PREVIOUS });
  assert.equal((await journal.read(OWNER)).phase, 'uncertain', 'planning performs no durable transition or deletion');
  const committed = { ...uncertain, phase: 'committed' };
  assert.deepEqual(planAvatarJournalResume(committed, value(CANDIDATE)), { kind: 'confirmed', phase: 'committed', cleanupPath: PREVIOUS });
  assert.deepEqual(planAvatarJournalResume(committed, value(PREVIOUS)), { kind: 'confirmed', phase: 'committed', cleanupPath: CANDIDATE });
  assert.deepEqual(planAvatarJournalResume(committed, 'https://provider.example/changed.png'), { kind: 'wait' });
  assert.deepEqual(planAvatarJournalResume(committed, undefined), { kind: 'wait' });
  const removal = { ...committed, candidatePath: null };
  assert.deepEqual(planAvatarJournalResume(removal, null), { kind: 'confirmed', phase: 'committed', cleanupPath: PREVIOUS });
  assert.deepEqual(planAvatarJournalResume(removal, value(PREVIOUS)), { kind: 'confirmed', phase: 'committed', cleanupPath: null });
  assert.deepEqual(planAvatarJournalResume({ ...removal, phase: 'uncertain' }, null), { kind: 'wait' });
  const rolledBack = { ...uncertain, phase: 'rolled-back' };
  assert.deepEqual(planAvatarJournalResume(rolledBack, value(PREVIOUS)), { kind: 'confirmed', phase: 'rolled-back', cleanupPath: CANDIDATE });
  assert.deepEqual(planAvatarJournalResume(rolledBack, value(CANDIDATE)), { kind: 'confirmed', phase: 'rolled-back', cleanupPath: null });
});

test('two reconstructed clients cannot overwrite an existing operation, including concurrent begin', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const results = await Promise.allSettled([
    createProfileAvatarJournal(store).begin(OWNER, OP, CANDIDATE, PREVIOUS),
    createProfileAvatarJournal(store).begin(OWNER, '55555555-5555-4555-8555-555555555555', CANDIDATE, null),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await createProfileAvatarJournal(store).read(OWNER)).operationId, OP);
});

test('account slots are isolated and paths cannot cross owners', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  const other = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
  assert.equal(await journal.read(other), null);
  await assert.rejects(() => journal.begin(other, OP, CANDIDATE, null));
  await journal.begin(other, OP, `${other}/33333333-3333-4333-8333-333333333333.jpg`, null);
  assert.equal((await journal.read(OWNER)).ownerId, OWNER);
  assert.equal((await journal.read(other)).ownerId, other);
});

test('corrupt, oversized, unknown-version and extra-field records are preserved and rejected', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
  const key = [...store.values.keys()][0];
  const valid = JSON.parse(store.values.get(key));
  const cases = ['not-json', 'x'.repeat(1025),
    JSON.stringify({ ...valid, version: 2 }), JSON.stringify({ ...valid, token: 'never-accept' }),
    JSON.stringify({ ...valid, ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    JSON.stringify({ ...valid, operationId: [OP] }), JSON.stringify({ ...valid, phase: 'guess-success' })];
  for (const raw of cases) {
    store.values.set(key, raw);
    await assert.rejects(() => journal.read(OWNER), error => error.name === 'AvatarJournalError' && !/never-accept|not-json/.test(error.message));
    await assert.rejects(() => journal.begin(OWNER, OP, CANDIDATE, null));
    assert.equal(store.values.get(key), raw);
  }
});

test('invalid identifiers and meaningless or unsafe path pairs never reach storage', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  for (const args of [
    ['not-an-owner', OP, CANDIDATE, null], [OWNER, 'not-an-operation', CANDIDATE, null],
    [OWNER, OP, null, null], [OWNER, OP, CANDIDATE, CANDIDATE],
    [OWNER, OP, `https://example.com/avatar.png`, null],
    [OWNER, OP, `${OWNER}/../../../avatar.jpg`, null],
  ]) await assert.rejects(() => journal.begin(...args));
  assert.equal(store.values.size, 0);
});

test('storage failures never fall back to volatile success or expose raw diagnostics', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  for (const action of ['getItem', 'setItem']) {
    const store = storage();
    store[action] = async () => { throw new Error('sensitive platform diagnostic'); };
    await assert.rejects(() => createProfileAvatarJournal(store).begin(OWNER, OP, CANDIDATE, PREVIOUS),
      error => error.name === 'AvatarJournalError' && !/sensitive/.test(error.message));
  }
  const store = storage();
  store.setItem = async () => {};
  await assert.rejects(() => createProfileAvatarJournal(store).begin(OWNER, OP, CANDIDATE, PREVIOUS));
});

test('failed terminal writes and failed clearing retain the original operation for a later client', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
  const originalSet = store.setItem;
  store.setItem = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(() => journal.mark(OWNER, OP, 'committed'));
  assert.equal((await createProfileAvatarJournal(store).read(OWNER)).phase, 'uncertain');
  store.setItem = originalSet;
  await journal.mark(OWNER, OP, 'rolled-back');
  const proof = { phase: 'rolled-back', currentAvatarValue: `profile-avatars/${PREVIOUS}`, cleanupPath: CANDIDATE, outcome: 'removed' };
  store.removeItem = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(() => journal.clearResolved(OWNER, OP, proof));
  assert.equal((await createProfileAvatarJournal(store).read(OWNER)).phase, 'rolled-back');
  store.removeItem = async () => {};
  await assert.rejects(() => journal.clearResolved(OWNER, OP, proof));
  assert.equal((await createProfileAvatarJournal(store).read(OWNER)).phase, 'rolled-back');
});

test('missing, pending or stale cleanup evidence never clears confirmed journal debt', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
  await journal.mark(OWNER, OP, 'committed');
  const valid = { phase: 'committed', currentAvatarValue: `profile-avatars/${CANDIDATE}`, cleanupPath: PREVIOUS, outcome: 'removed' };
  for (const proof of [undefined, {}, { ...valid, outcome: 'pending' },
    { ...valid, cleanupPath: CANDIDATE }, { ...valid, phase: 'rolled-back' },
    { ...valid, currentAvatarValue: `profile-avatars/${PREVIOUS}` },
    { ...valid, currentAvatarValue: 'https://provider.example/other.png' }]) {
    await assert.rejects(() => journal.clearResolved(OWNER, OP, proof));
    assert.equal((await journal.read(OWNER)).phase, 'committed');
  }
});

test('already-absent cleanup evidence clears only the exact non-current cleanup decision', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  for (const proof of [
    { phase: 'committed', currentAvatarValue: `profile-avatars/${CANDIDATE}`, cleanupPath: PREVIOUS, outcome: 'already-absent' },
    { phase: 'committed', currentAvatarValue: `profile-avatars/${PREVIOUS}`, cleanupPath: PREVIOUS, outcome: 'already-absent' },
    { phase: 'committed', currentAvatarValue: `profile-avatars/${CANDIDATE}`, cleanupPath: CANDIDATE, outcome: 'already-absent' },
    { phase: 'committed', currentAvatarValue: `profile-avatars/${CANDIDATE}`, cleanupPath: PREVIOUS, outcome: 'already-absent', ownerId: 'foreign' },
  ]) {
    const store = storage();
    const journal = createProfileAvatarJournal(store);
    await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
    await journal.mark(OWNER, OP, 'committed');
    if (Object.keys(proof).length === 4 && proof.currentAvatarValue === `profile-avatars/${CANDIDATE}`
      && proof.cleanupPath === PREVIOUS) {
      await journal.clearResolved(OWNER, OP, proof);
      assert.equal(await journal.read(OWNER), null);
    } else {
      await assert.rejects(() => journal.clearResolved(OWNER, OP, proof));
      assert.equal((await journal.read(OWNER)).phase, 'committed');
    }
  }
});

test('native adapter reconstruction preserves the record through the mocked SecureStore boundary', async () => {
  const store = storage();
  await (await loadPlatformJournal('android', store)).begin(OWNER, OP, CANDIDATE, PREVIOUS);
  const restarted = await loadPlatformJournal('android', store);
  assert.equal((await restarted.read(OWNER)).operationId, OP);
});

test('two web contexts share Web Locks and cannot race localStorage begin', async () => {
  const store = storage();
  let lockCalls = 0;
  const locks = { request(key, work) { lockCalls++; return store.runExclusive(key, work); } };
  const first = await loadPlatformJournal('web', store, locks);
  const second = await loadPlatformJournal('web', store, locks);
  const results = await Promise.allSettled([
    first.begin(OWNER, OP, CANDIDATE, PREVIOUS),
    second.begin(OWNER, '55555555-5555-4555-8555-555555555555', CANDIDATE, null),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal((await second.read(OWNER)).operationId, OP);
  assert.equal(lockCalls, 3);
});

test('web without cross-context locking rejects writes instead of falling back to volatile state', async () => {
  const store = storage();
  const journal = await loadPlatformJournal('web', store);
  await assert.rejects(() => journal.begin(OWNER, OP, CANDIDATE, PREVIOUS));
  assert.equal(store.values.size, 0);
});

test('acknowledgement failures do not roll back a write that actually reached durable storage', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const originalGet = store.getItem;
  const originalSet = store.setItem;
  store.setItem = async (key, value) => {
    await originalSet(key, value);
    store.getItem = async () => { throw new Error('readback failed'); };
  };
  await assert.rejects(() => createProfileAvatarJournal(store).begin(OWNER, OP, CANDIDATE, PREVIOUS));
  store.getItem = originalGet;
  assert.equal((await createProfileAvatarJournal(store).read(OWNER)).phase, 'uncertain');
  await assert.rejects(() => createProfileAvatarJournal(store).mark(OWNER, OP, 'committed'));
  store.getItem = originalGet;
  assert.equal((await createProfileAvatarJournal(store).read(OWNER)).phase, 'committed');
});

test('a terminal journal needs valid cleanup evidence even if remove acknowledgement later fails', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
  await journal.mark(OWNER, OP, 'committed');
  const originalGet = store.getItem;
  const originalRemove = store.removeItem;
  store.removeItem = async key => {
    await originalRemove(key);
    store.getItem = async () => { throw new Error('readback failed'); };
  };
  await assert.rejects(() => journal.clearResolved(OWNER, OP, {
    phase: 'committed', currentAvatarValue: `profile-avatars/${CANDIDATE}`, cleanupPath: PREVIOUS, outcome: 'removed',
  }));
  store.getItem = originalGet;
  assert.equal(await createProfileAvatarJournal(store).read(OWNER), null);
});

test('a prepared operation can be cancelled without ever authorizing network dispatch', async () => {
  const { createProfileAvatarJournal, planAvatarJournalResume } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.beginPrepared(OWNER, OP, CANDIDATE, PREVIOUS);
  assert.equal((await journal.read(OWNER)).phase, 'prepared');
  assert.deepEqual(planAvatarJournalResume(await journal.read(OWNER), `profile-avatars/${CANDIDATE}`), { kind: 'wait' });
  await assert.rejects(() => journal.mark(OWNER, OP, 'committed'));
  await journal.cancelPrepared(OWNER, OP);
  assert.equal(await journal.read(OWNER), null);
});

test('arming is a one-time durable transition that fences cancellation and duplicate dispatch', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const journal = createProfileAvatarJournal(storage());
  await journal.beginPrepared(OWNER, OP, CANDIDATE, PREVIOUS);
  await journal.arm(OWNER, OP);
  assert.equal((await journal.read(OWNER)).phase, 'uncertain');
  await assert.rejects(() => journal.arm(OWNER, OP));
  await assert.rejects(() => journal.cancelPrepared(OWNER, OP));
  await journal.mark(OWNER, OP, 'committed');
  assert.equal((await journal.read(OWNER)).phase, 'committed');
});

test('shared-lock arm and cancellation have exactly one winner in either forced ordering', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  for (const winner of ['cancel', 'arm']) {
    const store = storage();
    const first = createProfileAvatarJournal(store);
    const second = createProfileAvatarJournal(store);
    await first.beginPrepared(OWNER, OP, CANDIDATE, PREVIOUS);
    const actions = winner === 'cancel'
      ? [first.cancelPrepared(OWNER, OP), second.arm(OWNER, OP)]
      : [first.arm(OWNER, OP), second.cancelPrepared(OWNER, OP)];
    const results = await Promise.allSettled(actions);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal((await first.read(OWNER))?.phase ?? null, winner === 'cancel' ? null : 'uncertain');
  }
});

test('arm confirmation failure preserves the actual durable phase and never authorizes a repeat arm', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.beginPrepared(OWNER, OP, CANDIDATE, PREVIOUS);
  const write = store.setItem;
  const read = store.getItem;
  store.setItem = async (key, value) => {
    await write(key, value);
    store.getItem = async () => { throw new Error('confirmation unavailable'); };
  };
  await assert.rejects(() => journal.arm(OWNER, OP));
  store.getItem = read;
  assert.equal((await journal.read(OWNER)).phase, 'uncertain');
  await assert.rejects(() => journal.cancelPrepared(OWNER, OP));
  await assert.rejects(() => journal.arm(OWNER, OP));
});

test('prepared cancellation checks operation, phase and removal confirmation', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  const journal = createProfileAvatarJournal(store);
  await journal.beginPrepared(OWNER, OP, CANDIDATE, PREVIOUS);
  await assert.rejects(() => journal.cancelPrepared(OWNER, '55555555-5555-4555-8555-555555555555'));
  const remove = store.removeItem;
  store.removeItem = async () => {};
  await assert.rejects(() => journal.cancelPrepared(OWNER, OP));
  assert.equal((await journal.read(OWNER)).phase, 'prepared');
  const read = store.getItem;
  store.removeItem = async key => {
    await remove(key);
    store.getItem = async () => { throw new Error('confirmation unavailable'); };
  };
  await assert.rejects(() => journal.cancelPrepared(OWNER, OP));
  store.getItem = read;
  assert.equal(await journal.read(OWNER), null);
});

test('existing v1 uncertain and terminal records remain readable and never become prepared implicitly', async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  for (const phase of ['uncertain', 'committed', 'rolled-back']) {
    const store = storage();
    const journal = createProfileAvatarJournal(store);
    await journal.begin(OWNER, OP, CANDIDATE, PREVIOUS);
    if (phase !== 'uncertain') await journal.mark(OWNER, OP, phase);
    const restored = createProfileAvatarJournal(store);
    assert.equal((await restored.read(OWNER)).phase, phase);
    await assert.rejects(() => restored.cancelPrepared(OWNER, OP));
    await assert.rejects(() => restored.arm(OWNER, OP));
  }
});

test('two web contexts fence prepared cancellation against arming using shared Web Locks', async () => {
  for (const winner of ['cancel', 'arm']) {
    const store = storage();
    const locks = { request: (key, work) => store.runExclusive(key, work) };
    const first = await loadPlatformJournal('web', store, locks);
    const second = await loadPlatformJournal('web', store, locks);
    await first.beginPrepared(OWNER, OP, CANDIDATE, PREVIOUS);
    const actions = winner === 'cancel'
      ? [first.cancelPrepared(OWNER, OP), second.arm(OWNER, OP)]
      : [first.arm(OWNER, OP), second.cancelPrepared(OWNER, OP)];
    const results = await Promise.allSettled(actions);
    assert.equal(results[0].status, 'fulfilled');
    assert.equal(results[1].status, 'rejected');
    assert.equal((await second.read(OWNER))?.phase ?? null, winner === 'cancel' ? null : 'uncertain');
  }
});

// Negative capability evidence, NOT a cross-runtime safety PASS: two native
// adapter instances have different JS mutexes even with the same SecureStore.
test('UNSUPPORTED boundary: independent native runtimes can lose an armed record without shared CAS', { timeout: 3000 }, async () => {
  const { createProfileAvatarJournal } = await loadJournal();
  const store = storage();
  await createProfileAvatarJournal(store).beginPrepared(OWNER, OP, CANDIDATE, PREVIOUS);
  const read = store.getItem;
  const remove = store.removeItem;
  let releaseBothReads;
  let releaseArm;
  const bothRead = new Promise(resolve => { releaseBothReads = resolve; });
  const armed = new Promise(resolve => { releaseArm = resolve; });
  let preparedReads = 0;
  store.getItem = async key => {
    const value = await read(key);
    if (value && JSON.parse(value).phase === 'prepared' && preparedReads < 2) {
      preparedReads++;
      if (preparedReads === 2) releaseBothReads();
      await bothRead;
    }
    return value;
  };
  store.removeItem = async key => { await armed; await remove(key); };
  const first = await loadPlatformJournal('android', store);
  const second = await loadPlatformJournal('android', store);
  await Promise.all([
    first.arm(OWNER, OP).then(() => releaseArm()),
    second.cancelPrepared(OWNER, OP),
  ]);
  assert.equal(preparedReads, 2);
  assert.equal(await createProfileAvatarJournal(store).read(OWNER), null,
    'Demonstrated unsupported boundary: cancellation deleted a record already armed in another runtime');
});

test('source guard: persistent avatar service remains reachable only through the UI entrypoint', async () => {
  async function sourceFiles(relativeDirectory) {
    const entries = await readdir(new URL(`../${relativeDirectory}/`, import.meta.url), { withFileTypes: true });
    const nested = await Promise.all(entries.map(entry => {
      const relative = `${relativeDirectory}/${entry.name}`;
      return entry.isDirectory() ? sourceFiles(relative) : /\.tsx?$/.test(entry.name) ? [relative] : [];
    }));
    return nested.flat();
  }
  const edges = [];
  for (const file of ['App.tsx', 'index.ts', ...await sourceFiles('src')]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
        && node.expression.text === 'profileAvatarJournal' && node.name.text === 'begin') {
        assert.fail('Runtime saves must use beginPrepared + arm, not the legacy uncertain fixture entry');
      }
      let target;
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) target = node.moduleSpecifier;
      else if (ts.isExportDeclaration(node) && !node.isTypeOnly) target = node.moduleSpecifier;
      else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || ts.isIdentifier(node.expression) && node.expression.text === 'require')) target = node.arguments[0];
      if (target && ts.isStringLiteral(target) && /\/(profileEditing|profileAvatarJournal)(?:\.ts)?$/.test(target.text)) {
        edges.push(`${file} -> ${target.text.split('/').at(-1)}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.deepEqual(edges.sort(), [
    'App.tsx -> profileEditing', 'src/services/profileEditing.ts -> profileAvatarJournal',
  ]);
});
