import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function transpile(path) {
  return ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

function loadAuthModule() {
  const httpModule = { exports: {} };
  const globals = {
    Headers,
    Request,
    Response,
    URL,
    atob,
    console,
    Deno: { env: { get() { throw new Error('real environment access is forbidden'); } } },
  };
  vm.runInNewContext(transpile('supabase/functions/_shared/http.ts'), {
    ...globals,
    exports: httpModule.exports,
    module: httpModule,
    require,
  }, { filename: 'supabase/functions/_shared/http.ts' });

  const authModule = { exports: {} };
  vm.runInNewContext(transpile('supabase/functions/_shared/auth.ts'), {
    ...globals,
    exports: authModule.exports,
    module: authModule,
    require(name) {
      if (name === './http.ts') return httpModule.exports;
      if (name === 'npm:@supabase/supabase-js@2.112.3') {
        return { createClient() { throw new Error('authenticateWithClients must use injected clients'); } };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: 'supabase/functions/_shared/auth.ts' });
  return authModule.exports;
}

function query(result) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    maybeSingle: async () => result,
  };
  return chain;
}

function accessToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `fixture.${encoded}.signature`;
}

function authFixture({
  authResponse,
  callerResponse = { data: { id: '95000000-0000-4000-8000-000000000001', revoked_at: null }, error: null },
  profileResponse,
  tokenPayload,
  token: explicitToken,
} = {}) {
  const userId = '91000000-0000-4000-8000-000000000001';
  const sessionId = '93000000-0000-4000-8000-000000000001';
  const token = explicitToken ?? accessToken(tokenPayload ?? { aal: 'aal1', session_id: sessionId, sub: userId });
  const counters = { callerClient: 0, callerTerminal: 0, serviceTerminal: 0 };
  const filters = [];
  const db = {
    auth: { getUser: async () => authResponse ?? ({ data: { user: { id: userId } }, error: null }) },
    from(table) {
      if (table === 'profiles') {
        return query(profileResponse ?? { data: {
          id: userId,
          email: 'fixture@example.invalid',
          display_name: 'Fixture',
          app_role: 'user',
          account_status: 'active',
        }, error: null });
      }
      if (table === 'account_terminals') {
        counters.serviceTerminal += 1;
        return query({ data: { id: 'service-role-result', revoked_at: null }, error: null });
      }
      throw new Error(`Unexpected service table: ${table}`);
    },
  };
  const userDb = {
    from(table) {
      assert.equal(table, 'account_terminals');
      counters.callerTerminal += 1;
      const chain = query(callerResponse);
      const originalEq = chain.eq;
      chain.eq = (column, value) => {
        filters.push([column, value]);
        return originalEq.call(chain, column, value);
      };
      return chain;
    },
  };
  const clients = {
    serviceClient: () => db,
    callerClient(receivedToken) {
      counters.callerClient += 1;
      assert.equal(receivedToken, token);
      return userDb;
    },
  };
  const request = new Request('https://fixture.invalid/functions/v1/account-deletion-preview', {
    headers: { authorization: `Bearer ${token}` },
  });
  return { clients, counters, db, filters, request, sessionId, token, userDb, userId };
}

test('active-session authority is proven through caller RLS rather than a service-role terminal read', async () => {
  const { authenticateWithClients } = loadAuthModule();
  assert.equal(typeof authenticateWithClients, 'function', 'authenticateWithClients export is required');

  const userId = '91000000-0000-4000-8000-000000000001';
  const sessionId = '93000000-0000-4000-8000-000000000001';
  const token = accessToken({ aal: 'aal1', session_id: sessionId, sub: userId });
  let serviceTerminalQueries = 0;
  let callerTerminalQueries = 0;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table) {
      if (table === 'profiles') {
        return query({ data: {
          id: userId,
          email: 'fixture@example.invalid',
          display_name: 'Fixture',
          app_role: 'user',
          account_status: 'active',
        }, error: null });
      }
      if (table === 'account_terminals') {
        serviceTerminalQueries += 1;
        return query({ data: { id: '95000000-0000-4000-8000-000000000001', revoked_at: null }, error: null });
      }
      throw new Error(`Unexpected service table: ${table}`);
    },
  };
  const userDb = {
    from(table) {
      assert.equal(table, 'account_terminals');
      callerTerminalQueries += 1;
      return query({ data: null, error: null });
    },
  };
  const request = new Request('https://fixture.invalid/functions/v1/account-deletion-preview', {
    headers: { authorization: `Bearer ${token}` },
  });

  await assert.rejects(
    authenticateWithClients(request, {
      serviceClient: () => db,
      callerClient: receivedToken => {
        assert.equal(receivedToken, token);
        return userDb;
      },
    }),
    error => error?.status === 401 && error?.code === 'session_revoked',
  );
  assert.equal(serviceTerminalQueries, 0, 'service role must not decide caller terminal authority');
  assert.equal(callerTerminalQueries, 1, 'caller RLS must decide terminal authority exactly once');
});

test('caller authority requires an explicit error-free response shape', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const userId = '91000000-0000-4000-8000-000000000001';
  const sessionId = '93000000-0000-4000-8000-000000000001';
  const token = accessToken({ aal: 'aal1', session_id: sessionId, sub: userId });
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table) {
      assert.equal(table, 'profiles');
      return query({ data: {
        id: userId,
        email: 'fixture@example.invalid',
        display_name: 'Fixture',
        app_role: 'user',
        account_status: 'active',
      }, error: null });
    },
  };
  const userDb = {
    from(table) {
      assert.equal(table, 'account_terminals');
      return query({
        data: { id: '95000000-0000-4000-8000-000000000001', revoked_at: null },
        // Deliberately omit `error`; authorization needs an exact SDK shape.
      });
    },
  };

  await assert.rejects(
    authenticateWithClients(
      new Request('https://fixture.invalid/functions/v1/account-deletion-preview', {
        headers: { authorization: `Bearer ${token}` },
      }),
      { serviceClient: () => db, callerClient: () => userDb },
    ),
    error => error?.status === 403 && error?.code === 'session_check_failed',
  );
});

test('a valid caller-scoped active terminal returns the verified caller', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture();
  const result = await authenticateWithClients(fixture.request, fixture.clients);
  assert.equal(result.caller.user.id, fixture.userId);
  assert.equal(result.caller.sessionId, fixture.sessionId);
  assert.equal(result.db, fixture.db);
  assert.equal(result.userDb, fixture.userDb);
  assert.equal(fixture.counters.callerClient, 1, 'reuse exactly one token-bound caller client');
  assert.equal(fixture.counters.serviceTerminal, 0);
  assert.equal(fixture.counters.callerTerminal, 1);
  assert.deepEqual(fixture.filters, [
    ['user_id', fixture.userId],
    ['auth_session_id', fixture.sessionId],
  ]);
});

test('a caller terminal query error fails closed without service-role fallback', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture({ callerResponse: { data: null, error: { message: 'fixture' } } });
  await assert.rejects(
    authenticateWithClients(fixture.request, fixture.clients),
    error => error?.status === 403 && error?.code === 'session_check_failed',
  );
  assert.equal(fixture.counters.callerTerminal, 1);
  assert.equal(fixture.counters.serviceTerminal, 0);
});

test('requireActiveSession false performs no terminal authority query', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture();
  const result = await authenticateWithClients(fixture.request, fixture.clients, undefined, false);
  assert.equal(result.caller.user.id, fixture.userId);
  assert.equal(fixture.counters.callerTerminal, 0);
  assert.equal(fixture.counters.serviceTerminal, 0);
});

test('getUser failure rejects before constructing or querying the caller client', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture({ authResponse: { data: { user: null }, error: { message: 'fixture' } } });
  await assert.rejects(
    authenticateWithClients(fixture.request, fixture.clients),
    error => error?.status === 401 && error?.code === 'invalid_authorization',
  );
  assert.deepEqual(fixture.counters, { callerClient: 0, callerTerminal: 0, serviceTerminal: 0 });
});

test('profile failure rejects before caller terminal authority is queried', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture({ profileResponse: { data: null, error: null } });
  await assert.rejects(
    authenticateWithClients(fixture.request, fixture.clients),
    error => error?.status === 403 && error?.code === 'profile_unavailable',
  );
  assert.equal(fixture.counters.callerTerminal, 0);
  assert.equal(fixture.counters.serviceTerminal, 0);
});

test('inactive account rejects before caller terminal authority is queried', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture({ profileResponse: { data: {
    id: '91000000-0000-4000-8000-000000000001',
    app_role: 'user',
    account_status: 'deleting',
  }, error: null } });
  await assert.rejects(
    authenticateWithClients(fixture.request, fixture.clients),
    error => error?.status === 403 && error?.code === 'account_inactive',
  );
  assert.equal(fixture.counters.callerTerminal, 0);
  assert.equal(fixture.counters.serviceTerminal, 0);
});

test('role rejection happens before caller terminal authority is queried', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture();
  await assert.rejects(
    authenticateWithClients(fixture.request, fixture.clients, ['admin']),
    error => error?.status === 403 && error?.code === 'forbidden',
  );
  assert.equal(fixture.counters.callerTerminal, 0);
  assert.equal(fixture.counters.serviceTerminal, 0);
});

test('AAL rejection happens before caller terminal authority is queried', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture();
  await assert.rejects(
    authenticateWithClients(fixture.request, fixture.clients, undefined, true, true),
    error => error?.status === 403 && error?.code === 'mfa_required',
  );
  assert.equal(fixture.counters.callerTerminal, 0);
  assert.equal(fixture.counters.serviceTerminal, 0);
});

test('JWT payload is not decoded before getUser has verified authorization', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const fixture = authFixture({
    authResponse: { data: { user: null }, error: { message: 'fixture' } },
    token: 'not-a-jwt',
  });
  await assert.rejects(
    authenticateWithClients(fixture.request, fixture.clients),
    error => error?.status === 401 && error?.code === 'invalid_authorization',
  );
  assert.equal(fixture.counters.callerClient, 0);
});

test('untrusted JWT sub never replaces the getUser identity used by caller RLS', async () => {
  const { authenticateWithClients } = loadAuthModule();
  const maliciousSub = '99000000-0000-4000-8000-000000000099';
  const fixture = authFixture({ tokenPayload: {
    aal: 'aal1',
    session_id: '93000000-0000-4000-8000-000000000001',
    sub: maliciousSub,
  } });
  const result = await authenticateWithClients(fixture.request, fixture.clients);
  assert.equal(result.caller.user.id, fixture.userId);
  assert.deepEqual(fixture.filters, [
    ['user_id', fixture.userId],
    ['auth_session_id', fixture.sessionId],
  ]);
  assert.notEqual(result.caller.user.id, maliciousSub);
});

test('revoked or incomplete terminal rows cannot establish caller authority', async () => {
  const { authenticateWithClients } = loadAuthModule();
  for (const data of [
    null,
    {},
    { id: '95000000-0000-4000-8000-000000000001' },
    { id: '', revoked_at: null },
    { id: '95000000-0000-4000-8000-000000000001', revoked_at: '2026-10-17T00:00:00Z' },
    [],
  ]) {
    const fixture = authFixture({ callerResponse: { data, error: null } });
    await assert.rejects(authenticateWithClients(fixture.request, fixture.clients),
      error => error?.status === 401 && error?.code === 'session_revoked');
    assert.equal(fixture.counters.callerTerminal, 1);
    assert.equal(fixture.counters.serviceTerminal, 0);
  }
});

test('production authenticate wrapper rejects missing authorization before environment or SDK access', async () => {
  const { authenticate } = loadAuthModule();
  await assert.rejects(authenticate(new Request('https://fixture.invalid/functions/v1/account-sessions')),
    error => error?.status === 401 && error?.code === 'missing_authorization');
});
