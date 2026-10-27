import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const corePath = new URL('../src/services/profileEditingCore.ts', import.meta.url);
const servicePath = new URL('../src/services/profileEditing.ts', import.meta.url);
const migrationPath = new URL('../supabase/migrations/20261012090000_add_profile_editing.sql', import.meta.url);
const [coreSource, serviceSource, migration] = await Promise.all([
  readFile(corePath, 'utf8'),
  readFile(servicePath, 'utf8'),
  readFile(migrationPath, 'utf8'),
]);

const transpiledCore = ts.transpileModule(coreSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const coreModuleUrl = `data:text/javascript;base64,${Buffer.from(transpiledCore).toString('base64')}`;
const core = await import(coreModuleUrl);
const journalSource = await readFile(new URL('../src/services/profileAvatarJournalCore.ts', import.meta.url), 'utf8');
const journalCode = ts.transpileModule(journalSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const journalCoreUrl = `data:text/javascript;base64,${Buffer.from(journalCode).toString('base64')}`;
const journalCore = await import(journalCoreUrl);
// Use the real journal core; only its external persistence boundary is replaced.
const journalAdapterUrl = `data:text/javascript;base64,${Buffer.from(`
  import { createProfileAvatarJournal } from '${journalCoreUrl}';
  export const profileAvatarJournal = createProfileAvatarJournal({
    getItem: (...args) => globalThis.__profileJournalStore.getItem(...args),
    setItem: (...args) => globalThis.__profileJournalStore.setItem(...args),
    removeItem: (...args) => globalThis.__profileJournalStore.removeItem(...args),
    runExclusive: (...args) => globalThis.__profileJournalStore.runExclusive(...args),
  });
`).toString('base64')}`;
const cryptoModuleUrl = `data:text/javascript;base64,${Buffer.from("export const randomUUID=()=> '99999999-9999-4999-8999-999999999999';").toString('base64')}`;
const clientModuleUrl = `data:text/javascript;base64,${Buffer.from("export const getSupabaseClient=()=>globalThis.__profileEditingMockClient; export const supabaseConfig={url:'https://profile-business-fixture.supabase.co',publishableKey:'sb_publishable_fixture'}; export class SupabaseConfigurationError extends Error {}").toString('base64')}`;
// External SDK seams only. These legacy business tests keep their existing
// Data/Storage results; real transport/Auth behavior has its own public-SDK suite.
const dataSdkModuleUrl = `data:text/javascript;base64,${Buffer.from('export class PostgrestClient { from(...args) { return globalThis.__profileEditingMockClient.from(...args); } rpc(...args) { return globalThis.__profileEditingMockClient.rpc(...args); } } export class StorageClient { from(...args) { return globalThis.__profileEditingMockClient.storage.from(...args); } }').toString('base64')}`;
const coordinatorSource = await readFile(new URL('../src/services/authSessionOperation.ts', import.meta.url), 'utf8');
const coordinatorCode = ts.transpileModule(coordinatorSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const coordinatorModuleUrl = `data:text/javascript;base64,${Buffer.from(coordinatorCode).toString('base64')}`;
const coordinator = await import(coordinatorModuleUrl);
let transpiledService = ts.transpileModule(serviceSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
transpiledService = transpiledService
  .replace("from 'expo-crypto'", `from '${cryptoModuleUrl}'`)
  .replace("from '@supabase/postgrest-js'", `from '${dataSdkModuleUrl}'`)
  .replace("from '@supabase/storage-js'", `from '${dataSdkModuleUrl}'`)
  .replace("from './profileEditingCore'", `from '${coreModuleUrl}'`)
  .replace("from './profileAvatarJournalCore'", `from '${journalCoreUrl}'`)
  .replace("from './profileAvatarJournal'", `from '${journalAdapterUrl}'`)
  .replace("from './supabaseClient'", `from '${clientModuleUrl}'`)
  .replace("from './authSessionOperation'", `from '${coordinatorModuleUrl}'`)
  .replace('const PROFILE_EDIT_TIMEOUT_MS = 20_000;', 'const PROFILE_EDIT_TIMEOUT_MS = 15;')
  .replace('const PROFILE_AVATAR_CLEANUP_TIMEOUT_MS = 3_000;', 'const PROFILE_AVATAR_CLEANUP_TIMEOUT_MS = 15;');
const profileEditing = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledService).toString('base64')}`
);

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OBJECT_ID = '22222222-2222-4222-8222-222222222222';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function profile(overrides = {}) {
  return {
    id: USER_ID,
    email: 'pilot@doso.test',
    username: 'pilot_01',
    username_claimed_at: '2026-10-12T00:00:00.000Z',
    username_provenance: 'registration',
    display_name: 'Pilot',
    avatar_url: null,
    app_role: 'user',
    account_status: 'active',
    suspended_at: null,
    suspension_reason: null,
    created_at: '2026-10-12T00:00:00.000Z',
    updated_at: '2026-10-12T00:00:00.000Z',
    ...overrides,
  };
}

function journalStorage() {
  const values = new Map();
  let queue = Promise.resolve();
  return {
    values,
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); },
    async runExclusive(key, work) {
      const result = queue.then(work, work);
      queue = result.then(() => {}, () => {});
      return result;
    },
  };
}

function mockClient({ users = [USER_ID], currentAvatar = null, uploadError = null, uploadPromise, rpcResult, rpcPromise, cleanupPrepResults = [], removeResults = [], readAvatars = [], journalStore = journalStorage(), onAuth, onUpload, onProfileSaved } = {}) {
  const calls = { rpc: [], cleanupPrep: [], cleanupSequence: [], profileRead: [], upload: [], remove: [], signed: [] };
  let userIndex = 0;
  let lastUserId = users[0] ?? null;
  let storedAvatar = currentAvatar;
  let profileReadIndex = 0;
  const bucket = {
    upload: async (...args) => {
      calls.upload.push(args);
      onUpload?.();
      if (uploadPromise) return uploadPromise;
      return { data: uploadError ? null : { path: args[0] }, error: uploadError };
    },
    remove: async (paths) => {
      calls.remove.push(paths);
      calls.cleanupSequence.push('remove');
      const response = removeResults[calls.remove.length - 1];
      if (response instanceof Error) throw response;
      if (typeof response === 'function') return response();
      return response ?? { data: paths.map(name => ({ name })), error: null };
    },
    createSignedUrl: async (...args) => {
      calls.signed.push(args);
      return { data: { signedUrl: 'https://signed.test/avatar' }, error: null };
    },
  };
  const client = {
    auth: {
      getUser: async () => {
        const id = users[Math.min(userIndex, users.length - 1)];
        lastUserId = id;
        userIndex += 1;
        if (onAuth) await onAuth(userIndex);
        return { data: { user: id ? { id } : null }, error: null };
      },
      getSession: async () => ({ data: { session: lastUserId ? { access_token: 'synthetic-business-session', user: { id: lastUserId } } : null }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const next = profileReadIndex < readAvatars.length ? readAvatars[profileReadIndex++] : storedAvatar;
            calls.profileRead.push(next);
            if (next instanceof Error) throw next;
            return { data: { avatar_url: next }, error: null };
          },
        }),
      }),
    }),
    storage: { from: () => bucket },
    rpc: async (...args) => {
      if (args[0] === 'prepare_my_profile_avatar_cleanup') {
        calls.cleanupPrep.push(args);
        calls.cleanupSequence.push('prepare');
        const response = cleanupPrepResults[calls.cleanupPrep.length - 1];
        if (response instanceof Error) throw response;
        if (typeof response === 'function') return response(args[1], value => { storedAvatar = value; });
        return response ?? {
          data: { status: 'retired', ownerId: args[1].p_expected_user_id, objectPath: args[1].p_object_path },
          error: null,
        };
      }
      calls.rpc.push(args);
      const response = rpcPromise ? await rpcPromise : rpcResult ?? { data: profile(), error: null };
      if (!response.error && response.data) {
        storedAvatar = response.data.avatar_url;
        onProfileSaved?.();
      }
      return response;
    },
  };
  globalThis.__profileEditingMockClient = client;
  globalThis.__profileJournalStore = journalStore;
  return calls;
}

const jpegSelection = {
  uri: 'file://avatar.jpg',
  base64: jpeg.toString('base64'),
  mimeType: 'image/jpeg',
};

test('avatar persistence failure prevents both upload and profile mutation', async () => {
  const store = journalStorage();
  store.setItem = async () => { throw new Error('private platform error'); };
  const calls = mockClient({ journalStore: store });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, { username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection }),
    error => error instanceof journalCore.AvatarJournalError && !/private platform/.test(error.message),
  );
  assert.equal(calls.upload.length, 0);
  assert.equal(calls.rpc.length, 0);
});

test('a verified avatar commit clears its record only after cleanup and a fresh profile check', async () => {
  const store = journalStorage();
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const replacement = `profile-avatars/${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const calls = mockClient({ journalStore: store, currentAvatar: previous,
    rpcResult: { data: profile({ avatar_url: replacement }), error: null } });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  });
  assert.equal(result.avatarCleanup, 'removed');
  assert.equal(calls.remove.length, 1);
  assert.equal(await journalCore.createProfileAvatarJournal(store).read(USER_ID), null);
});

test('retry reconciles a positively referenced candidate without submitting another edit', async () => {
  const store = journalStorage();
  const journal = journalCore.createProfileAvatarJournal(store);
  const candidate = `${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const previous = `${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  await journal.begin(USER_ID, OBJECT_ID, candidate, previous);
  const calls = mockClient({ journalStore: store, currentAvatar: `profile-avatars/${candidate}` });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  }), /上次头像操作已核对/);
  assert.equal(calls.upload.length, 0);
  assert.equal(calls.rpc.length, 0);
  assert.deepEqual(calls.remove, [[previous]]);
  assert.equal(await journal.read(USER_ID), null);
});

test('a completed removal RPC with an incompatible response retains a committed record without cleanup', async () => {
  const store = journalStorage();
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({ journalStore: store, currentAvatar: previous,
    rpcResult: { data: null, error: null } });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  }), /返回结果无法验证/);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'committed');
  assert.equal(calls.remove.length, 0);
});

test('an uncertain non-current candidate blocks retry, including text-only edits, without losing its record', async () => {
  const store = journalStorage();
  const journal = journalCore.createProfileAvatarJournal(store);
  await journal.begin(USER_ID, OBJECT_ID, `${USER_ID}/${OBJECT_ID}.jpg`, null);
  const before = [...store.values.values()][0];
  const calls = mockClient({ journalStore: store });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_02', displayName: 'Pilot',
  }), /本次未提交修改/);
  assert.equal(calls.upload.length + calls.rpc.length + calls.remove.length, 0);
  assert.equal([...store.values.values()][0], before);
});

test('removing an owned avatar also requires durable intent before the RPC', async () => {
  const store = journalStorage();
  store.setItem = async () => { throw new Error('storage offline'); };
  const calls = mockClient({ journalStore: store,
    currentAvatar: `profile-avatars/${USER_ID}/${OBJECT_ID}.jpg` });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  }), journalCore.AvatarJournalError);
  assert.equal(calls.upload.length + calls.rpc.length + calls.remove.length, 0);
});

test('begin write that persists but cannot be read back starts no network mutation and is retained', async () => {
  const store = journalStorage();
  const read = store.getItem;
  let confirmationFails = true;
  store.getItem = async key => {
    if (confirmationFails && store.values.has(key)) { confirmationFails = false; throw new Error('readback unavailable'); }
    return read(key);
  };
  const calls = mockClient({ journalStore: store });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  }), journalCore.AvatarJournalError);
  assert.equal(calls.upload.length + calls.rpc.length + calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'prepared');
});

test('an upload timeout preserves uncertain intent and never starts the profile RPC or cleanup', async () => {
  const store = journalStorage();
  const calls = mockClient({ journalStore: store, uploadPromise: new Promise(() => {}) });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  }), profileEditing.ProfileEditTimeoutError);
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.rpc.length + calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'uncertain');
});

test('commit confirmation persistence failure preserves successful profile save but suppresses all cleanup', async () => {
  const store = journalStorage();
  const write = store.setItem;
  store.setItem = async (key, value) => {
    if (JSON.parse(value).phase === 'committed') throw new Error('platform private details');
    return write(key, value);
  };
  const calls = mockClient({ journalStore: store,
    currentAvatar: `profile-avatars/${USER_ID}/${OBJECT_ID}.png`,
    rpcResult: { data: profile(), error: null } });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.profile.id, USER_ID);
  assert.equal(result.avatarCleanup, 'pending');
  assert.equal(calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'uncertain');
});

test('rollback confirmation persistence failure preserves the business error and never deletes', async () => {
  const store = journalStorage();
  const write = store.setItem;
  store.setItem = async (key, value) => {
    if (JSON.parse(value).phase === 'rolled-back') throw new Error('private write detail');
    return write(key, value);
  };
  const calls = mockClient({ journalStore: store,
    rpcResult: { data: null, error: { code: 'P0001', message: 'username_taken' } } });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'taken_name', displayName: 'Pilot', avatar: jpegSelection,
  }), error => error instanceof profileEditing.ProfileEditCleanupError && /用户名已被使用/.test(error.message));
  assert.equal(calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'uncertain');
});

test('rollback phase is durable before orphan cleanup and a confirmed cleanup clears the record', async () => {
  const store = journalStorage();
  const calls = mockClient({ journalStore: store,
    rpcResult: { data: null, error: { code: 'P0001', message: 'username_taken' } },
    removeResults: [() => {
      const entry = JSON.parse([...store.values.values()][0]);
      assert.equal(entry.phase, 'rolled-back');
      return { data: [{ name: entry.candidatePath }], error: null };
    }] });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'taken_name', displayName: 'Pilot', avatar: jpegSelection,
  }), /用户名已被使用/);
  assert.equal(calls.remove.length, 1);
  assert.equal(await journalCore.createProfileAvatarJournal(store).read(USER_ID), null);
});

test('post-cleanup refresh failures keep committed debt instead of claiming it was resolved', async () => {
  for (const postValue of [undefined, new Error('offline'), 'profile-avatars/other-owner/object.png']) {
    const store = journalStorage();
    const previous = `profile-avatars/${USER_ID}/${OBJECT_ID}.png`;
    const calls = mockClient({ journalStore: store, currentAvatar: previous,
      readAvatars: [previous, postValue], rpcResult: { data: profile(), error: null } });
    const result = await profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_01', displayName: 'Pilot', avatar: null,
    });
    assert.equal(calls.remove.length, 1);
    assert.equal(result.avatarCleanup, 'pending');
    assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'committed');
  }
});

test('post-cleanup account switch and journal-clear failure both retain the debt', async () => {
  for (const scenario of ['account-switch', 'clear-failure']) {
    const store = journalStorage();
    if (scenario === 'clear-failure') store.removeItem = async () => { throw new Error('private delete detail'); };
    const users = [USER_ID];
    const calls = mockClient({ journalStore: store, users,
      currentAvatar: `profile-avatars/${USER_ID}/${OBJECT_ID}.png`,
      removeResults: scenario === 'account-switch' ? [() => {
        users[0] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
        return { data: [{ name: `${USER_ID}/${OBJECT_ID}.png` }], error: null };
      }] : [],
      rpcResult: { data: profile(), error: null } });
    const result = await profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_01', displayName: 'Pilot', avatar: null,
    });
    assert.equal(calls.remove.length, 1);
    assert.equal(result.avatarCleanup, 'pending');
    assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'committed');
  }
});

test('a committed cleanup retry remains a separate attempt and never overwrites pending debt', async () => {
  const store = journalStorage();
  const journal = journalCore.createProfileAvatarJournal(store);
  const candidate = `${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const previous = `${USER_ID}/${OBJECT_ID}.png`;
  await journal.begin(USER_ID, OBJECT_ID, candidate, previous);
  await journal.mark(USER_ID, OBJECT_ID, 'committed');
  const calls = mockClient({ journalStore: store, currentAvatar: `profile-avatars/${candidate}`,
    removeResults: [{ data: null, error: { statusCode: '403' } }] });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  }), /本次未提交修改/);
  assert.equal(calls.upload.length + calls.rpc.length, 0);
  assert.equal(calls.remove.length, 1);
  assert.equal((await journal.read(USER_ID)).operationId, OBJECT_ID);
});

test('a response missing an explicit RPC error field is not proof of completion', async () => {
  const store = journalStorage();
  const calls = mockClient({ journalStore: store,
    currentAvatar: `profile-avatars/${USER_ID}/${OBJECT_ID}.png`, rpcResult: { data: profile() } });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  }), /返回结果无法验证/);
  assert.equal(calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'uncertain');
});

test('a timed-out RPC that later commits is reconciled without replaying upload or RPC', async () => {
  const store = journalStorage();
  let completeRpc;
  const rpcPromise = new Promise(resolve => { completeRpc = resolve; });
  const calls = mockClient({ journalStore: store, rpcPromise });
  const input = { username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection };
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), profileEditing.ProfileEditTimeoutError);
  const journal = journalCore.createProfileAvatarJournal(store);
  const entry = await journal.read(USER_ID);
  assert.equal(entry.phase, 'uncertain');
  completeRpc({ data: profile({ avatar_url: `profile-avatars/${entry.candidatePath}` }), error: null });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), /上次头像操作已核对/);
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.remove.length, 0);
  assert.equal(await journal.read(USER_ID), null);
});

test('a timed-out DELETE that later succeeds does not clear debt on a subsequent empty response', async () => {
  const store = journalStorage();
  let completeDelete;
  const deletePromise = new Promise(resolve => { completeDelete = resolve; });
  const previous = `${USER_ID}/${OBJECT_ID}.png`;
  const calls = mockClient({ journalStore: store, currentAvatar: `profile-avatars/${previous}`,
    rpcResult: { data: profile(), error: null },
    removeResults: [deletePromise, { data: [], error: null }] });
  const input = { username: 'pilot_01', displayName: 'Pilot', avatar: null };
  const result = await profileEditing.saveProfileEdits(USER_ID, input);
  assert.equal(result.avatarCleanup, 'pending');
  completeDelete({ data: [{ name: previous }], error: null });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), /本次未提交修改/);
  assert.equal(calls.remove.length, 2);
  assert.equal(calls.rpc.length, 1);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'committed');
});

test('a timed-out DELETE that actually succeeded is resolved by exact retired-missing proof without another DELETE', async () => {
  const store = journalStorage();
  let completeDelete;
  const deletePromise = new Promise(resolve => { completeDelete = resolve; });
  const previous = `${USER_ID}/${OBJECT_ID}.png`;
  const calls = mockClient({
    journalStore: store,
    currentAvatar: `profile-avatars/${previous}`,
    rpcResult: { data: profile(), error: null },
    cleanupPrepResults: [
      { data: { status: 'retired', ownerId: USER_ID, objectPath: previous }, error: null },
      { data: { status: 'retired-missing', ownerId: USER_ID, objectPath: previous }, error: null },
    ],
    removeResults: [deletePromise],
  });
  const input = { username: 'pilot_01', displayName: 'Pilot', avatar: null };
  const first = await profileEditing.saveProfileEdits(USER_ID, input);
  assert.equal(first.avatarCleanup, 'pending');
  completeDelete({ data: [{ name: previous }], error: null });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), /上次头像操作已核对/);
  assert.equal(calls.remove.length, 1, 'retired-missing is terminal proof and must not repeat DELETE');
  assert.equal(calls.cleanupPrep.length, 2);
  assert.equal(calls.profileRead.at(-1), null, 'journal clearing uses a fresh non-current profile read');
  assert.equal(await journalCore.createProfileAvatarJournal(store).read(USER_ID), null);
  const next = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot',
  });
  assert.equal(next.profile.id, USER_ID);
  assert.equal(calls.rpc.length, 2, 'recovery does not replay the edit; the next separate edit may proceed');
});

test('protected-current debt naturally replans to clean the orphaned candidate on the next recovery', async () => {
  const store = journalStorage();
  const previous = `${USER_ID}/${OBJECT_ID}.png`;
  const candidate = `${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const calls = mockClient({
    journalStore: store,
    currentAvatar: `profile-avatars/${previous}`,
    rpcResult: { data: profile({ avatar_url: `profile-avatars/${candidate}` }), error: null },
    cleanupPrepResults: [
      (_args, setCurrentAvatar) => {
        setCurrentAvatar(`profile-avatars/${previous}`);
        return { data: { status: 'protected-current', ownerId: USER_ID, objectPath: previous }, error: null };
      },
      { data: { status: 'retired', ownerId: USER_ID, objectPath: candidate }, error: null },
    ],
  });
  const input = { username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection };
  const first = await profileEditing.saveProfileEdits(USER_ID, input);
  assert.equal(first.avatarCleanup, 'protected-current');
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'committed');
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), /上次头像操作已核对/);
  assert.deepEqual(calls.remove, [[candidate]], 'recovery removes the non-current candidate, not the protected previous path');
  assert.equal(await journalCore.createProfileAvatarJournal(store).read(USER_ID), null);
  const next = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot',
  });
  assert.equal(next.profile.id, USER_ID);
  assert.equal(calls.rpc.length, 2);
});

test('two concurrent service saves allow only one upload and one profile RPC', async () => {
  const store = journalStorage();
  const calls = mockClient({ journalStore: store, rpcResult: {
    data: profile({ avatar_url: `profile-avatars/${USER_ID}/99999999-9999-4999-8999-999999999999.jpg` }), error: null,
  } });
  const input = { username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection };
  const results = await Promise.allSettled([
    profileEditing.saveProfileEdits(USER_ID, input), profileEditing.saveProfileEdits(USER_ID, input),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.rpc.length, 1);
});

test('an account switch after durable begin starts neither upload nor RPC and retains prepared intent', async () => {
  const store = journalStorage();
  const calls = mockClient({ journalStore: store,
    users: [USER_ID, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  }), /当前账户与待编辑资料不一致/);
  assert.equal(calls.upload.length + calls.rpc.length + calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'prepared');
});

test('an account switch while avatar journal arm waits prevents upload and retains uncertain intent', async () => {
  const store = journalStorage();
  const write = store.setItem;
  let releaseArm;
  const armGate = new Promise(resolve => { releaseArm = resolve; });
  let armStarted;
  const started = new Promise(resolve => { armStarted = resolve; });
  store.setItem = async (key, value) => {
    if (JSON.parse(value).phase === 'uncertain') {
      armStarted();
      await armGate;
    }
    return write(key, value);
  };
  const users = [USER_ID];
  const calls = mockClient({ journalStore: store, users });
  const saving = profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  });
  const rejected = assert.rejects(saving, /当前账户与待编辑资料不一致/);
  await started;
  users[0] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  releaseArm();
  await rejected;
  assert.equal(calls.upload.length + calls.rpc.length + calls.cleanupPrep.length + calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'uncertain');
});

test('an account switch while removal journal arm waits prevents the profile RPC and cleanup', async () => {
  const store = journalStorage();
  const write = store.setItem;
  let releaseArm;
  const armGate = new Promise(resolve => { releaseArm = resolve; });
  let armStarted;
  const started = new Promise(resolve => { armStarted = resolve; });
  store.setItem = async (key, value) => {
    if (JSON.parse(value).phase === 'uncertain') {
      armStarted();
      await armGate;
    }
    return write(key, value);
  };
  const users = [USER_ID];
  const calls = mockClient({ journalStore: store, users,
    currentAvatar: `profile-avatars/${USER_ID}/${OBJECT_ID}.jpg` });
  const saving = profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  const rejected = assert.rejects(saving, /当前账户与待编辑资料不一致/);
  await started;
  users[0] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  releaseArm();
  await rejected;
  assert.equal(calls.upload.length + calls.rpc.length + calls.cleanupPrep.length + calls.remove.length, 0);
  assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'uncertain');
});

test('post-arm identity read failure sends no mutation and preserves uncertain intent', async () => {
  for (const avatar of [jpegSelection, null]) {
    const store = journalStorage();
    const write = store.setItem;
    let armed = false;
    store.setItem = async (key, value) => {
      await write(key, value);
      if (JSON.parse(value).phase === 'uncertain') armed = true;
    };
    const calls = mockClient({ journalStore: store,
      currentAvatar: `profile-avatars/${USER_ID}/${OBJECT_ID}.png`,
      onAuth: () => { if (armed) throw new Error('fixture identity read failed'); } });
    await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_01', displayName: 'Pilot', avatar,
    }), /fixture identity read failed/);
    assert.equal(calls.upload.length + calls.rpc.length + calls.cleanupPrep.length + calls.remove.length, 0);
    assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'uncertain');
  }
});

test('same-account avatar replacement still succeeds after an asynchronously delayed arm', async () => {
  const store = journalStorage();
  const write = store.setItem;
  store.setItem = async (key, value) => {
    if (JSON.parse(value).phase === 'uncertain') await new Promise(resolve => setImmediate(resolve));
    return write(key, value);
  };
  const replacement = `profile-avatars/${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const calls = mockClient({ journalStore: store,
    rpcResult: { data: profile({ avatar_url: replacement }), error: null } });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  });
  assert.equal(result.profile.avatar_url, replacement);
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.cleanupPrep.length + calls.remove.length, 0);
  assert.equal(await journalCore.createProfileAvatarJournal(store).read(USER_ID), null);
});

test('an auth failure before dispatch leaves a prepared record that a later attempt only cancels', async () => {
  const store = journalStorage();
  const input = { username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection };
  const first = mockClient({ journalStore: store, users: [USER_ID, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), /当前账户与待编辑资料不一致/);
  const journal = journalCore.createProfileAvatarJournal(store);
  assert.equal((await journal.read(USER_ID)).phase, 'prepared');
  assert.equal(first.upload.length + first.rpc.length + first.remove.length, 0);
  const retry = mockClient({ journalStore: store });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), /上次未发送的头像操作已撤销/);
  assert.equal(retry.upload.length + retry.rpc.length + retry.remove.length, 0);
  assert.equal(await journal.read(USER_ID), null);
});

test('arming failure before upload or removal RPC issues no writes and retains actual phase', async () => {
  for (const avatar of [jpegSelection, null]) {
    for (const failure of ['before-write', 'after-write']) {
      const store = journalStorage();
      const write = store.setItem;
      let rejectReadback = false;
      const read = store.getItem;
      store.setItem = async (key, value) => {
        if (JSON.parse(value).phase === 'uncertain') {
          if (failure === 'before-write') throw new Error('private platform write error');
          await write(key, value);
          rejectReadback = true;
        } else await write(key, value);
      };
      store.getItem = async key => {
        if (rejectReadback) { rejectReadback = false; throw new Error('private platform readback error'); }
        return read(key);
      };
      const calls = mockClient({ journalStore: store,
        currentAvatar: `profile-avatars/${USER_ID}/${OBJECT_ID}.png` });
      await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
        username: 'pilot_01', displayName: 'Pilot', avatar,
      }), journalCore.AvatarJournalError);
      assert.equal(calls.upload.length + calls.rpc.length + calls.remove.length, 0);
      assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase,
        failure === 'before-write' ? 'prepared' : 'uncertain');
    }
  }
});

test('a prepared retry waits for the timed-out identity SDK read before it can cancel old intent', async () => {
  const store = journalStorage();
  let releaseOriginal;
  let reachedPrepared;
  const paused = new Promise(resolve => { releaseOriginal = resolve; });
  const prepared = new Promise(resolve => { reachedPrepared = resolve; });
  const calls = mockClient({ journalStore: store, onAuth: async count => {
    if (count === 2) { reachedPrepared(); await paused; }
  } });
  const input = { username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection };
  const original = profileEditing.saveProfileEdits(USER_ID, input);
  const originalResult = assert.rejects(original, profileEditing.ProfileEditTimeoutError);
  try {
    await prepared;
    await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), coordinator.isAuthSessionOperationBusyError);
    await originalResult;
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, true, 'caller timeout is not SDK settlement');
    assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'prepared');
    releaseOriginal();
    // This is the controlled native SDK boundary in this journal-focused host.
    // The separate real-SDK suite asserts the actual promise settlement contract.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, false);
    await assert.rejects(profileEditing.saveProfileEdits(USER_ID, input), /上次未发送的头像操作已撤销/);
    assert.equal(calls.upload.length + calls.rpc.length + calls.remove.length, 0);
    assert.equal(await journalCore.createProfileAvatarJournal(store).read(USER_ID), null);
  } finally { releaseOriginal(); await originalResult; }
});

test('cancel acknowledgement failure never replays the form even if the record was actually removed', async () => {
  const store = journalStorage();
  const journal = journalCore.createProfileAvatarJournal(store);
  await journal.beginPrepared(USER_ID, OBJECT_ID, `${USER_ID}/${OBJECT_ID}.jpg`, null);
  const read = store.getItem;
  const remove = store.removeItem;
  let rejectReadback = false;
  store.removeItem = async key => { await remove(key); rejectReadback = true; };
  store.getItem = async key => {
    if (rejectReadback) { rejectReadback = false; throw new Error('private platform readback error'); }
    return read(key);
  };
  const calls = mockClient({ journalStore: store });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: jpegSelection,
  }), journalCore.AvatarJournalError);
  assert.equal(calls.upload.length + calls.rpc.length + calls.remove.length, 0);
  assert.equal(await journal.read(USER_ID), null);
});

test('profile text values are normalized and unsafe values are rejected', () => {
  assert.equal(core.normalizeProfileUsername(' Pilot_01 '), 'pilot_01');
  assert.equal(core.normalizeProfileDisplayName(' 森哥 '), '森哥');
  assert.throws(() => core.normalizeProfileUsername('ADMIN'), /不可使用/);
  assert.throws(() => core.normalizeProfileUsername('two-words'), /3–24/);
  assert.throws(() => core.normalizeProfileDisplayName('line\nbreak'), /控制字符/);
  assert.throws(() => core.normalizeProfileDisplayName('x'.repeat(51)), /1–50/);
});

test('avatar bytes must match the declared JPEG or PNG type', () => {
  assert.equal(core.prepareProfileAvatar({ uri: 'file://avatar.jpg', base64: jpeg.toString('base64'), mimeType: 'image/jpeg' }).extension, 'jpg');
  assert.equal(core.prepareProfileAvatar({ uri: 'file://avatar.png', base64: png.toString('base64'), mimeType: 'image/png' }).extension, 'png');
  assert.throws(
    () => core.prepareProfileAvatar({ uri: 'file://fake.jpg', base64: png.toString('base64'), mimeType: 'image/jpeg' }),
    /JPEG 类型不一致/,
  );
  assert.throws(
    () => core.prepareProfileAvatar({ uri: 'file://avatar.gif', base64: png.toString('base64'), mimeType: 'image/gif' }),
    /仅支持 JPEG 或 PNG/,
  );
  const oversizedBase64 = 'A'.repeat(Math.ceil((core.PROFILE_AVATAR_MAX_BYTES + 1) / 3) * 4);
  assert.throws(
    () => core.prepareProfileAvatar({ uri: 'file://huge.png', base64: oversizedBase64, mimeType: 'image/png' }),
    /3 MiB/,
  );
});

test('private avatar values are owner-scoped stable paths', () => {
  const objectPath = core.profileAvatarObjectPath(USER_ID, OBJECT_ID, 'png');
  const persisted = core.persistedProfileAvatarValue(objectPath);
  assert.equal(persisted, `profile-avatars/${USER_ID}/${OBJECT_ID}.png`);
  assert.equal(core.parseOwnedProfileAvatarValue(persisted, USER_ID), `${USER_ID}/${OBJECT_ID}.png`);
  assert.equal(core.parseOwnedProfileAvatarValue(persisted, '33333333-3333-4333-8333-333333333333'), null);
  assert.equal(core.parseOwnedProfileAvatarValue('https://example.com/avatar.png', USER_ID), null);
});

test('client rechecks identity immediately before each write boundary', () => {
  const checks = [...serviceSource.matchAll(/await assertExpectedUser\(expectedUserId\);/g)];
  assert.ok(checks.length >= 3, 'identity must be checked initially, before upload, and before RPC');
  const uploadIndex = serviceSource.indexOf('.upload(candidateObjectPath');
  const rpcIndex = serviceSource.indexOf("rpc('update_my_profile', args)");
  assert.ok(uploadIndex >= 0, 'the immutable-path upload boundary must exist');
  assert.ok(rpcIndex >= 0, 'the profile RPC boundary must exist');
  assert.ok(checks.some((match) => match.index < uploadIndex));
  assert.ok(checks.some((match) => match.index > uploadIndex && match.index < rpcIndex));
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /where id = v_user_id\s+returning \* into v_result/);
});

test('timeouts are explicitly ambiguous and do not trigger destructive cleanup', () => {
  assert.match(serviceSource, /class ProfileEditTimeoutError[\s\S]*?outcomeMayBeUnknown = true/);
  const ambiguousCatch = serviceSource.match(
    /catch \(error\) \{\s*\/\/ A transport timeout[\s\S]*?throw error;\s*\}/,
  )?.[0] ?? '';
  assert.match(ambiguousCatch, /Do not delete the/);
  assert.doesNotMatch(
    ambiguousCatch,
    /removeAvatarBestEffort/,
  );
});

test('only allowlisted rollback errors and pre-RPC failures clean uploaded objects', () => {
  const rpcErrorBranch = serviceSource.match(/if \(result\.error\) \{[\s\S]*?throw profileEditError\(result\.error\);\s*\}/)?.[0] ?? '';
  assert.match(rpcErrorBranch, /isDefinitiveProfileRollback/);
  assert.match(rpcErrorBranch, /finishAvatarOperation\(expectedUserId, journalOperationId, 'rolled-back', uploadedObjectPath\)/);
  assert.match(serviceSource, /code === 'P0001' && message === 'username_taken'/);
  assert.match(serviceSource, /code === '42501' && message === 'profile_identity_mismatch'/);
  assert.match(serviceSource, /profile RPC has not started[\s\S]*?finishAvatarOperation\(expectedUserId, journalOperationId, 'rolled-back', uploadedObjectPath\)/);
  assert.match(serviceSource, /isReturnedProfile\(result\.data, expectedUserId\)/);
  assert.match(serviceSource, /result\.data\.username !== username \|\| result\.data\.display_name !== displayName/);
  assert.match(migration, /exception\s+when unique_violation then\s+raise exception using errcode = 'P0001', message = 'username_taken'/);
});

test('migration keeps the bucket private and fences profile edits to an active session', () => {
  assert.match(migration, /'profile-avatars',[\s\S]*?false,[\s\S]*?3145728/);
  assert.match(migration, /array\['image\/jpeg', 'image\/png'\]/);
  assert.match(migration, /not private\.is_account_active\(\) or not private\.is_session_active\(\)/);
  assert.match(migration, /p_expected_user_id uuid/);
  assert.match(migration, /v_user_id is distinct from p_expected_user_id/);
  assert.match(migration, /revoke all on function public\.update_my_profile\(uuid, text, text, text, text\) from public, anon, service_role/);
  assert.match(migration, /grant execute on function public\.update_my_profile\(uuid, text, text, text, text\) to authenticated/);
});

test('migration drops verification provenance on rename and preserves user-managed metadata', () => {
  assert.match(migration, /when v_username is distinct from v_current\.username\s+then 'manual_claim'::public\.username_provenance/);
  assert.match(migration, /when v_username is distinct from v_current\.username\s+then pg_catalog\.clock_timestamp\(\)/);
  assert.match(migration, /on conflict \(id\) do update[\s\S]*?when public\.profiles\.display_name_managed_by_user then public\.profiles\.display_name[\s\S]*?when public\.profiles\.avatar_managed_by_user then public\.profiles\.avatar_url/);
  assert.match(migration, /revoke update \(avatar_url\) on table public\.profiles from authenticated/);
});

test('migration source guard: provider sync provenance distinguishes explicit edits from metadata updates', () => {
  for (const field of ['display_name_managed_by_user', 'avatar_managed_by_user']) {
    assert.match(migration, new RegExp(`alter column ${field} set default false`));
  }
  assert.match(migration, /display_name = case\s+when public\.profiles\.display_name_managed_by_user then public\.profiles\.display_name[\s\S]*?else excluded\.display_name\s+end/);
  assert.match(migration, /avatar_url = case\s+when public\.profiles\.avatar_managed_by_user then public\.profiles\.avatar_url[\s\S]*?end/);
  assert.match(migration, /display_name_managed_by_user = true/);
  assert.match(migration, /avatar_managed_by_user = v_current\.avatar_managed_by_user or v_avatar_action <> 'keep'/);
  assert.match(migration, /current_user = 'authenticated'[\s\S]*?new\.display_name_managed_by_user := true/);
  assert.match(migration, /revoke update \(display_name_managed_by_user, avatar_managed_by_user\) on table public\.profiles from authenticated/);
});

test('migration source guard: protects profiles that predate the migration without freezing future provider profiles', () => {
  const profileAlter = migration.match(/alter table public\.profiles\s+[\s\S]*?;/)?.[0] ?? '';
  for (const field of ['display_name_managed_by_user', 'avatar_managed_by_user']) {
    assert.match(profileAlter, new RegExp(`add column ${field} boolean not null default true`));
    assert.match(profileAlter, new RegExp(`alter column ${field} set default false`));
    assert.ok(profileAlter.indexOf(`add column ${field}`) < profileAlter.indexOf(`alter column ${field}`));
  }
});

test('migration source guard: omitted provider metadata does not erase existing presentation fields', () => {
  assert.match(migration, /when excluded\.display_name = '' then public\.profiles\.display_name/);
  assert.match(migration, /else coalesce\(excluded\.avatar_url, public\.profiles\.avatar_url\)/);
});

test('avatar quota is owner-serialized, fail-closed, and protects the current reference', () => {
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]*?doso\.profile-avatar/);
  assert.match(migration, /if v_count >= 20 then\s+raise exception/);
  assert.doesNotMatch(migration.match(/create or replace function private\.enforce_profile_avatar_quota[\s\S]*?\$\$;/)?.[0] ?? '', /delete from storage\.objects/);
  assert.match(migration, /message = 'avatar_quota_exceeded'/);
  assert.match(migration, /profile_avatars_delete_active_owner[\s\S]*?avatar_url = 'profile-avatars\/' \|\| storage\.objects\.name/);
});

test('saveProfileEdits executes typed RPC with expected account id and verifies success', async () => {
  const calls = mockClient({
    rpcResult: { data: profile({ username: 'pilot_02', display_name: '森哥' }), error: null },
  });
  const saved = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'Pilot_02',
    displayName: ' 森哥 ',
  });
  assert.equal(saved.profile.username, 'pilot_02');
  assert.equal(saved.avatarCleanup, 'not-needed');
  assert.deepEqual(calls.rpc, [[
    'update_my_profile',
    {
      p_expected_user_id: USER_ID,
      p_username: 'pilot_02',
      p_display_name: '森哥',
      p_avatar_action: 'keep',
      p_avatar_path: null,
    },
  ]]);
});

test('definitive duplicate rollback removes the newly uploaded orphan through Storage API', async () => {
  const calls = mockClient({
    rpcResult: { data: null, error: { code: 'P0001', message: 'username_taken' } },
  });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, {
      username: 'taken_name',
      displayName: 'Pilot',
      avatar: jpegSelection,
    }),
    /用户名已被使用/,
  );
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.rpc.length, 1);
  assert.deepEqual(calls.remove, [[`${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`]]);
});

test('retired avatar rejection reports a fixed message and cleans only through prepared rollback', async () => {
  const objectPath = `${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const calls = mockClient({
    rpcResult: { data: null, error: { code: '22023', message: 'avatar_retired' } },
  });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_retired', displayName: 'Pilot', avatar: jpegSelection,
    }),
    error => error instanceof Error
      && error.message === '该头像已进入清理，请重新选择图片。',
  );
  assert.equal(calls.rpc.length, 1, 'do not replay the rejected profile mutation');
  assert.deepEqual(calls.cleanupPrep, [[
    'prepare_my_profile_avatar_cleanup',
    { p_expected_user_id: USER_ID, p_object_path: objectPath },
  ]]);
  assert.deepEqual(calls.remove, [[objectPath]]);
});

test('unknown returned gateway error preserves an upload because commit outcome is ambiguous', async () => {
  const calls = mockClient({
    rpcResult: { data: null, error: { code: '502', message: 'gateway timeout' } },
  });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, {
      username: 'gateway_case',
      displayName: 'Pilot',
      avatar: jpegSelection,
    }),
    /gateway timeout/,
  );
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.remove.length, 0);
});

test('RPC timeout preserves uploaded object and reports unknown outcome', async () => {
  const calls = mockClient({ rpcPromise: new Promise(() => {}) });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_timeout',
      displayName: 'Pilot',
      avatar: jpegSelection,
    }),
    (error) => error instanceof profileEditing.ProfileEditTimeoutError && error.outcomeMayBeUnknown,
  );
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.remove.length, 0);
});

test('session switch after upload prevents RPC from editing the new account', async () => {
  const users = [USER_ID];
  const calls = mockClient({ users,
    onUpload: () => { users[0] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; } });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_switch',
      displayName: 'Pilot',
      avatar: jpegSelection,
    }),
    /当前账户与待编辑资料不一致/,
  );
  assert.equal(calls.upload.length, 1);
  assert.equal(calls.rpc.length, 0);
  assert.equal(calls.remove.length, 0, 'do not attempt old-account cleanup with a switched identity');
});

test('avatar upload failure does not call profile RPC', async () => {
  const calls = mockClient({ uploadError: { message: 'storage unavailable' } });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_upload',
      displayName: 'Pilot',
      avatar: jpegSelection,
    }),
    /storage unavailable/,
  );
  assert.equal(calls.rpc.length, 0);
});

test('foreign or legacy avatar values do not request signed URLs', async () => {
  const calls = mockClient();
  assert.equal(
    await profileEditing.resolveProfileAvatarUrl(
      'profile-avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/99999999-9999-4999-8999-999999999999.png',
      USER_ID,
    ),
    null,
  );
  assert.equal(await profileEditing.resolveProfileAvatarUrl('https://example.com/avatar.png', USER_ID), null);
  assert.equal(calls.signed.length, 0);
});

test('verified replacement attempts cleanup of the previously referenced private object', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const replacement = `profile-avatars/${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const calls = mockClient({
    currentAvatar: previous,
    rpcResult: {
      data: profile({ username: 'pilot_cleanup', avatar_url: replacement }),
      error: null,
    },
  });
  await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_cleanup',
    displayName: 'Pilot',
    avatar: jpegSelection,
  });
  assert.deepEqual(calls.cleanupPrep, [[
    'prepare_my_profile_avatar_cleanup',
    { p_expected_user_id: USER_ID, p_object_path: `${USER_ID}/88888888-8888-4888-8888-888888888888.png` },
  ]]);
  assert.deepEqual(calls.cleanupSequence, ['prepare', 'remove']);
  assert.deepEqual(calls.remove, [[`${USER_ID}/88888888-8888-4888-8888-888888888888.png`]]);
});

test('committed profile remains saved while a returned Storage cleanup error is reported as pending', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  mockClient({
    currentAvatar: previous,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [{ data: null, error: { message: 'AccessDenied', statusCode: '403' } }],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.profile.avatar_url, null);
  assert.equal(result.avatarCleanup, 'pending');
});

test('cleanup never issues a DELETE under a different account after a verified profile commit', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const users = [USER_ID];
  const calls = mockClient({
    currentAvatar: previous, users,
    onProfileSaved: () => { users[0] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; },
    rpcResult: { data: profile({ avatar_url: null }), error: null },
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'pending');
  assert.equal(calls.cleanupPrep.length, 0);
  assert.equal(calls.remove.length, 0);
});

test('a transient returned cleanup error gets at most one revalidated retry', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    currentAvatar: previous,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [{ data: null, error: { message: 'Service unavailable', statusCode: '503' } }],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'removed');
  assert.equal(calls.cleanupPrep.length, 2);
  assert.equal(calls.remove.length, 2);
});

test('cleanup timeout remains pending and never immediately repeats the in-flight DELETE', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    currentAvatar: previous,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [new Promise(() => {})],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'pending');
  assert.equal(calls.remove.length, 1);
});

test('thrown cleanup failure does not lose a committed profile or expose raw Storage details', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    currentAvatar: previous,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [new Error('private diagnostic detail')],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.profile.username, 'pilot_01');
  assert.equal(result.avatarCleanup, 'pending');
  assert.doesNotMatch(JSON.stringify(result), /private diagnostic/);
  assert.equal(calls.remove.length, 1);
});

test('an empty Storage response does not falsely confirm object cleanup', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  mockClient({
    currentAvatar: previous,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [{ data: [], error: null }],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'pending');
});

test('a Storage cleanup response without an explicit success acknowledgement retains committed debt', async () => {
  const store = journalStorage();
  const objectPath = `${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    journalStore: store,
    currentAvatar: `profile-avatars/${objectPath}`,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [{ data: [{ name: objectPath }] }],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.profile.avatar_url, null, 'the verified profile commit is not undone');
  assert.equal(result.avatarCleanup, 'pending', 'missing error:null is not deletion evidence');
  assert.equal(calls.remove.length, 1, 'an ambiguous acknowledgement must not immediately repeat DELETE');
  const debt = await journalCore.createProfileAvatarJournal(store).read(USER_ID);
  assert.equal(debt.phase, 'committed');
  assert.equal(debt.previousPath, objectPath);
});

test('malformed Storage cleanup acknowledgements cannot clear committed avatar debt', async () => {
  const objectPath = `${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const matching = [{ name: objectPath }];
  for (const response of [
    { data: matching, error: undefined },
    { data: matching, error: false },
    { data: matching, error: 0 },
    { data: matching, error: '' },
    { data: { name: objectPath }, error: null },
    { data: [null], error: null },
    { data: [{ name: `${USER_ID}/other.png` }], error: null },
  ]) {
    const store = journalStorage();
    const calls = mockClient({
      journalStore: store,
      currentAvatar: `profile-avatars/${objectPath}`,
      rpcResult: { data: profile({ avatar_url: null }), error: null },
      removeResults: [response],
    });
    const result = await profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_01', displayName: 'Pilot', avatar: null,
    });
    assert.equal(result.avatarCleanup, 'pending');
    assert.equal(calls.remove.length, 1);
    assert.equal((await journalCore.createProfileAvatarJournal(store).read(USER_ID)).phase, 'committed');
  }
});

test('an ambiguous rollback cleanup acknowledgement preserves the orphan journal and original business error', async () => {
  const store = journalStorage();
  const candidate = `${USER_ID}/99999999-9999-4999-8999-999999999999.jpg`;
  const calls = mockClient({
    journalStore: store,
    rpcResult: { data: null, error: { code: 'P0001', message: 'username_taken' } },
    removeResults: [{ data: [{ name: candidate }] }],
  });
  await assert.rejects(profileEditing.saveProfileEdits(USER_ID, {
    username: 'taken_name', displayName: 'Pilot', avatar: jpegSelection,
  }), error => error instanceof profileEditing.ProfileEditCleanupError
    && error.avatarCleanup === 'pending' && /用户名已被使用/.test(error.message));
  assert.equal(calls.remove.length, 1);
  const debt = await journalCore.createProfileAvatarJournal(store).read(USER_ID);
  assert.equal(debt.phase, 'rolled-back');
  assert.equal(debt.candidatePath, candidate);
});

test('inactive account or session cleanup authority retains committed debt without issuing Storage DELETE', async () => {
  const store = journalStorage();
  const objectPath = `${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    journalStore: store,
    currentAvatar: `profile-avatars/${objectPath}`,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    cleanupPrepResults: [{ data: null, error: { code: '42501', message: 'account_or_session_inactive' } }],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.profile.avatar_url, null, 'a commit before authority changed remains a commit');
  assert.equal(result.avatarCleanup, 'pending');
  assert.equal(calls.cleanupPrep.length, 1);
  assert.equal(calls.remove.length, 0, 'this client cleanup cannot bypass a deleting/revoked account gate');
  const debt = await journalCore.createProfileAvatarJournal(store).read(USER_ID);
  assert.equal(debt.phase, 'committed');
  assert.equal(debt.previousPath, objectPath);
});

test('a malformed cleanup preparation response fails closed without deleting', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    currentAvatar: previous,
    cleanupPrepResults: [{ data: { status: 'retired', ownerId: USER_ID }, error: null }],
    rpcResult: { data: profile({ avatar_url: null }), error: null },
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'pending');
  assert.equal(calls.cleanupPrep.length, 1);
  assert.equal(calls.remove.length, 0);
});

test('cleanup preparation errors and timeouts remain pending without replay or Storage DELETE', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  for (const response of [
    { data: null, error: { code: '503', message: 'private database detail' } },
    new Promise(() => {}),
    new Error('private transport detail'),
  ]) {
    const calls = mockClient({
      currentAvatar: previous,
      cleanupPrepResults: [response],
      rpcResult: { data: profile({ avatar_url: null }), error: null },
    });
    const result = await profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_01', displayName: 'Pilot', avatar: null,
    });
    assert.equal(result.avatarCleanup, 'pending');
    assert.equal(calls.cleanupPrep.length, 1);
    assert.equal(calls.remove.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /private database|private transport/);
  }
});

test('cleanup preparation rejects foreign, mismatched, missing-error, and object-missing proofs', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const objectPath = `${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  for (const response of [
    { data: { status: 'retired', ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', objectPath }, error: null },
    { data: { status: 'retired', ownerId: USER_ID, objectPath: `${USER_ID}/other.png` }, error: null },
    { data: { status: 'retired', ownerId: USER_ID, objectPath } },
    { data: { status: 'retired-missing', ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', objectPath }, error: null },
    { data: { status: 'retired-missing', ownerId: USER_ID, objectPath: `${USER_ID}/other.png` }, error: null },
    { data: { status: 'retired-missing', ownerId: USER_ID, objectPath } },
    { data: { status: 'object-missing', ownerId: USER_ID, objectPath }, error: null },
  ]) {
    const calls = mockClient({
      currentAvatar: previous,
      cleanupPrepResults: [response],
      rpcResult: { data: profile({ avatar_url: null }), error: null },
    });
    const result = await profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_01', displayName: 'Pilot', avatar: null,
    });
    assert.equal(result.avatarCleanup, 'pending');
    assert.equal(calls.cleanupPrep.length, 1);
    assert.equal(calls.remove.length, 0);
  }
});

test('a server-protected current object is preserved without a Storage DELETE', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const objectPath = `${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    currentAvatar: previous,
    cleanupPrepResults: [{
      data: { status: 'protected-current', ownerId: USER_ID, objectPath }, error: null,
    }],
    rpcResult: { data: profile({ avatar_url: null }), error: null },
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'protected-current');
  assert.equal(calls.cleanupPrep.length, 1);
  assert.equal(calls.remove.length, 0);
});

test('cleanup retry obtains a fresh server preparation and protects an object that became current', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const objectPath = `${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const calls = mockClient({
    currentAvatar: previous,
    cleanupPrepResults: [
      { data: { status: 'retired', ownerId: USER_ID, objectPath }, error: null },
      { data: { status: 'protected-current', ownerId: USER_ID, objectPath }, error: null },
    ],
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [{ data: null, error: { message: 'retry later', statusCode: '503' } }],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'protected-current');
  assert.equal(calls.cleanupPrep.length, 2);
  assert.equal(calls.remove.length, 1);
});

test('cleanup retry rechecks account identity rather than deleting under a switched session', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const users = [USER_ID];
  const calls = mockClient({
    currentAvatar: previous, users,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [() => {
      users[0] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      return { data: null, error: { message: 'retry later', statusCode: '503' } };
    }],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'pending');
  assert.equal(calls.remove.length, 1);
});

test('repeated server cleanup failures stop after two attempts', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const failure = { data: null, error: { message: 'retry later', statusCode: '503' } };
  const calls = mockClient({
    currentAvatar: previous,
    rpcResult: { data: profile({ avatar_url: null }), error: null },
    removeResults: [failure, failure],
  });
  const result = await profileEditing.saveProfileEdits(USER_ID, {
    username: 'pilot_01', displayName: 'Pilot', avatar: null,
  });
  assert.equal(result.avatarCleanup, 'pending');
  assert.equal(calls.remove.length, 2);
});

test('cleanup retry shares the original time budget and starts no DELETE after it expires', async () => {
  const previous = `profile-avatars/${USER_ID}/88888888-8888-4888-8888-888888888888.png`;
  const originalPerformance = globalThis.performance;
  let clock = 1000;
  Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => clock },
  });
  try {
    const calls = mockClient({
      currentAvatar: previous,
      rpcResult: { data: profile({ avatar_url: null }), error: null },
      removeResults: [() => {
        clock += 100;
        return { data: null, error: { message: 'Service unavailable', statusCode: '503' } };
      }],
    });
    const result = await profileEditing.saveProfileEdits(USER_ID, {
      username: 'pilot_01', displayName: 'Pilot', avatar: null,
    });
    assert.equal(result.avatarCleanup, 'pending');
    assert.equal(calls.cleanupPrep.length, 1);
    assert.equal(calls.remove.length, 1);
  } finally {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: originalPerformance,
    });
  }
});

test('definitive rollback retains the business error and exposes pending orphan cleanup', async () => {
  mockClient({
    rpcResult: { data: null, error: { code: 'P0001', message: 'username_taken' } },
    removeResults: [{ data: null, error: { message: 'private Storage detail', statusCode: '403' } }],
  });
  await assert.rejects(
    profileEditing.saveProfileEdits(USER_ID, { username: 'taken_name', displayName: 'Pilot', avatar: jpegSelection }),
    error => error instanceof profileEditing.ProfileEditCleanupError
      && error.avatarCleanup === 'pending'
      && /用户名已被使用/.test(error.message)
      && /清理尚未确认/.test(error.message)
      && !/private Storage detail/.test(error.message),
  );
});

test('App source guard: committed saves with pending cleanup use an informational notice', async () => {
  const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /const saveResult = await saveProfileEdits\(expectedUserId, input\);\s+saved = true/);
  assert.match(app, /saveResult\.avatarCleanup === 'pending'[\s\S]*?旧头像清理尚未确认/);
  assert.match(app, /saveResult\.avatarCleanup === 'pending' \|\| saveResult\.avatarCleanup === 'protected-current' \? 'info' : 'success'/);
});

test('App source guard: concurrently protected current avatars are not reported as a completed avatar replacement', async () => {
  const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /saveResult\.avatarCleanup === 'protected-current'[\s\S]*?已保留服务器当前头像/);
  assert.match(app, /saveResult\.avatarCleanup === 'pending' \|\| saveResult\.avatarCleanup === 'protected-current' \? 'info' : 'success'/);
});
