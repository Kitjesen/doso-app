import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadPreview({ countResult = { count: 0, error: null }, authError = null,
  useRealAuth = false, terminalResult = { data: { id: 'TERMINAL_CANARY', revoked_at: null }, error: null },
  accountStatus = 'active', countThrows = false } = {}) {
  const sources = new Map();
  const calls = [];
  const logs = [];
  const forbidOperations = (target) => new Proxy(target, { get(object, key) {
    if (['insert', 'update', 'upsert', 'delete', 'rpc', 'storage', 'admin'].includes(key)) {
      calls.push(['forbiddenOperation', key]);
      throw new Error('Preview must not attempt a mutation or privileged operation');
    }
    return Reflect.get(object, key);
  } });
  let served;
  const globals = { Headers, Request, Response, URL, atob,
    console: { error: (...values) => logs.push(values), log: (...values) => logs.push(values) },
    Deno: { env: { get(name) {
      if (['DOSO_ALLOWED_WEB_ORIGINS', 'DOSO_ALLOWED_ADMIN_ORIGIN', 'DOSO_ALLOW_ALL_WEB_ORIGINS_FOR_LOCAL_DEV'].includes(name)) return undefined;
      if (useRealAuth) {
        if (name === 'SUPABASE_URL') return 'https://example.invalid';
        if (name === 'SUPABASE_SERVICE_ROLE_KEY') return 'SYNTHETIC_SERVICE_CANARY';
        if (name === 'SUPABASE_ANON_KEY') return 'SYNTHETIC_ANON_CANARY';
      }
      throw new Error('Real environment or credential access is forbidden');
    } }, serve(handler) { served = handler; } },
  };
  const userId = '91000000-0000-4000-8000-000000000001';
  const token = `fixture.${Buffer.from(JSON.stringify({ session_id: 'SESSION_CANARY', aal: 'aal1' })).toString('base64url')}.signature`;
  const serviceDb = {
    auth: { async getUser(received) {
      assert.equal(received, token); calls.push(['getUser']);
      return { data: { user: { id: userId } }, error: null };
    } },
    from(table) {
      calls.push(['serviceProfile']); assert.equal(table, 'profiles');
      const q = { select() { return q; }, eq() { return q; }, async maybeSingle() {
        return { data: { id: userId, account_status: accountStatus, app_role: 'user',
          email: 'EMAIL_CANARY', display_name: 'NAME_CANARY' }, error: null };
      } };
      return q;
    },
  };
  const userDb = forbidOperations({ from(table) {
    if (useRealAuth && table === 'account_terminals') {
      calls.push(['callerTerminal']);
      const q = { select() { return q; }, eq() { return q; }, async maybeSingle() { return terminalResult; } };
      return q;
    }
    calls.push(['from', table]); assert.equal(table, 'devices');
    const query = forbidOperations({ select(...args) { calls.push(['select', ...args]); return query; },
      eq(...args) { calls.push(['eq', ...args]); return query; },
      then(resolve, reject) { return (countThrows ? Promise.reject(new Error('RAW_DB_TOKEN_CANARY')) :
        Promise.resolve(countResult)).then(resolve, reject); } });
    return query;
  } });
  function load(path) {
    if (sources.has(path)) return sources.get(path);
    const module = { exports: {} };
    const source = readFileSync(new URL(`../supabase/functions/${path}`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText;
    vm.runInNewContext(js, { ...globals, module, exports: module.exports, require(name) {
      if (name === '../_shared/http.ts' || name === './http.ts') return load('_shared/http.ts');
      if (name === './preview.ts') return load('account-deletion-preview/preview.ts');
      if (name === 'npm:@supabase/supabase-js@2.112.3' && useRealAuth) return { createClient(_url, key, options) {
        if (key === 'SYNTHETIC_SERVICE_CANARY') return serviceDb;
        assert.equal(key, 'SYNTHETIC_ANON_CANARY');
        assert.equal(options.global.headers.Authorization, `Bearer ${token}`);
        return userDb;
      } };
      if (name === '../_shared/auth.ts' && useRealAuth) return load('_shared/auth.ts');
      if (name === '../_shared/auth.ts') return { async authenticate(...args) {
        calls.push(['authenticate', args.length]);
        if (authError) throw typeof authError === 'function' ? authError(load('_shared/http.ts')) : authError;
        return { caller: { user: { id: userId }, token: 'TOKEN_CANARY', sessionId: 'SESSION_CANARY',
          profile: { email: 'EMAIL_CANARY', avatar_url: 'PATH_CANARY' } }, userDb,
          db: new Proxy({}, { get(_object, key) { calls.push(['forbiddenOperation', key]);
            throw new Error('Privileged client must not be used by preview'); } }) };
      } };
      throw new Error(`Unexpected preview dependency ${name}`);
    } }, { filename: path });
    sources.set(path, module.exports);
    return module.exports;
  }
  load('account-deletion-preview/index.ts');
  return { run: served, calls, logs, userId, token, http: load('_shared/http.ts') };
}

test('real preview entry returns a private non-submittable plan with no device rows disclosed', async () => {
  const fixture = loadPreview();
  const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.state, 'planning_only');
  assert.equal(body.canSubmit, false);
  assert.equal(body.requestCreated, false);
  assert.equal(body.executionAvailable, false);
  assert.equal(body.hasVisibleBoundPhysicalRobot, false);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls)), [
    ['authenticate', 1], ['from', 'devices'], ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'owner_id', fixture.userId], ['eq', 'is_demo', false],
  ]);
  assert.equal(fixture.logs.length, 0);
  assert.doesNotMatch(JSON.stringify(body), /CANARY|91000000|requestId|safeToDelete|eligible/);
});

test('missing error or malformed exact count never becomes a no-robot preview', async () => {
  for (const countResult of [{ count: 0 }, { count: undefined, error: null },
    { count: -1, error: null }, { count: 0.5, error: null }, { count: '0', error: null },
    { count: NaN, error: null }, { count: Number.MAX_SAFE_INTEGER + 1, error: null }]) {
    const fixture = loadPreview({ countResult });
    const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview'));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'preview_unavailable');
    assert.equal(fixture.logs.length, 0);
  }
});

test('visible physical robot only adds a decision blocker, never submission or disposition', async () => {
  const fixture = loadPreview({ countResult: { count: 2, error: null,
    data: [{ serial: 'SERIAL_CANARY', owner_id: 'OWNER_CANARY' }] } });
  const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview'));
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['state', 'canSubmit', 'requestCreated', 'executionAvailable',
    'scope', 'hasVisibleBoundPhysicalRobot', 'blockers'].sort());
  assert.equal(body.hasVisibleBoundPhysicalRobot, true);
  assert.equal(body.canSubmit, false);
  assert.equal(body.requestCreated, false);
  assert.equal(body.executionAvailable, false);
  assert.deepEqual(body.blockers, ['device_disposition_policy_unapproved', 'retention_redaction_policy_unapproved',
    'provider_revocation_not_verified', 'server_avatar_cleanup_unavailable',
    'inflight_command_enrollment_handling_unapproved', 'deletion_executor_ledger_unavailable',
    'physical_robot_binding_requires_decision']);
  assert.equal(body.scope, 'caller_rls_current_devices_only');
  assert.doesNotMatch(JSON.stringify(body), /CANARY|Count|unbind|deleteUser|completed|requestId/);
});

test('all mutation methods and query parameters are rejected before authentication or reads', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']) {
    const fixture = loadPreview();
    const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview', { method }));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.logs.length, 0);
  }
  const fixture = loadPreview();
  const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview?userId=FOREIGN_CANARY'));
  assert.equal(response.status, 400);
  assert.equal(fixture.calls.length, 0);
  assert.doesNotMatch(await response.text(), /CANARY/);
});

test('OPTIONS and denied origins use existing CORS without touching account data', async () => {
  const fixture = loadPreview();
  const options = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview', { method: 'OPTIONS' }));
  assert.equal(options.status, 204);
  assert.equal(options.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  const denied = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview', {
    headers: { origin: 'https://unapproved.example.invalid' },
  }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'no-store');
  assert.equal(fixture.calls.length, 0);
});

test('SDK error, null reply or rejected count yields fixed private unavailability without raw logging', async () => {
  for (const options of [{ countResult: { count: 0, error: { message: 'RAW_DB_CANARY', token: 'TOKEN_CANARY' } } },
    { countResult: null }, { countResult: { count: null, error: null } }, { countThrows: true }]) {
    const fixture = loadPreview(options);
    const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview'));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('pragma'), 'no-cache');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { error: { code: 'preview_unavailable',
      message: 'Account impact preview could not be confirmed.' } });
    assert.equal(fixture.logs.length, 0);
  }
});

test('authentication failures never read device data or disclose details', async () => {
  for (const authError of [(http) => new http.HttpError(401, 'private', 'TOKEN_CANARY', { id: 'UUID_CANARY' }),
    (http) => new http.HttpError(403, 'private', 'EMAIL_CANARY'), new Error('RAW_AUTH_CANARY')]) {
    const fixture = loadPreview({ authError });
    const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview'));
    assert.equal([401, 403, 503].includes(response.status), true);
    assert.equal(fixture.calls.length, 1);
    assert.doesNotMatch(await response.text(), /CANARY|private/);
    assert.equal(fixture.logs.length, 0);
  }
});

test('real shared auth denies missing, revoked and RLS-filtered sessions before preview reads', async () => {
  for (const terminalResult of [{ data: null, error: null },
    { data: { id: 'TERMINAL_CANARY', revoked_at: '2026-10-16T00:00:00Z' }, error: null },
    { data: null, error: { message: 'RLS_RAW_CANARY' } }]) {
    const fixture = loadPreview({ useRealAuth: true, terminalResult });
    const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview', {
      headers: { authorization: `Bearer ${fixture.token}` },
    }));
    assert.equal([401, 403].includes(response.status), true);
    assert.equal(fixture.calls.some(row => row[0] === 'callerTerminal'), true);
    assert.equal(fixture.calls.some(row => row[0] === 'from'), false);
    assert.doesNotMatch(await response.text(), /CANARY|91000000/);
    assert.equal(fixture.logs.length, 0);
  }
});

test('real shared auth missing Bearer or inactive account never reaches device count', async () => {
  const missing = loadPreview({ useRealAuth: true });
  assert.equal((await missing.run(new Request('https://example.invalid/functions/v1/account-deletion-preview'))).status, 401);
  assert.equal(missing.calls.length, 0);
  const inactive = loadPreview({ useRealAuth: true, accountStatus: 'suspended' });
  assert.equal((await inactive.run(new Request('https://example.invalid/functions/v1/account-deletion-preview', {
    headers: { authorization: `Bearer ${inactive.token}` },
  }))).status, 403);
  assert.equal(inactive.calls.some(row => row[0] === 'from'), false);
});

test('real shared auth active session reaches only one owner-filtered caller-RLS count', async () => {
  const fixture = loadPreview({ useRealAuth: true, countResult: { count: 1, error: null } });
  const response = await fixture.run(new Request('https://example.invalid/functions/v1/account-deletion-preview', {
    headers: { authorization: `Bearer ${fixture.token}` },
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.hasVisibleBoundPhysicalRobot, true);
  assert.equal(body.canSubmit, false);
  assert.equal(fixture.calls.filter(row => row[0] === 'callerTerminal').length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.calls.filter(row => ['from', 'select', 'eq'].includes(row[0])))), [
    ['from', 'devices'], ['select', 'id', { count: 'exact', head: true }],
    ['eq', 'owner_id', fixture.userId], ['eq', 'is_demo', false],
  ]);
  assert.equal(fixture.logs.length, 0);
});

test('preview source contains no mutation, privileged, Storage, audit or logging call', () => {
  for (const path of ['index.ts', 'preview.ts']) {
    const source = readFileSync(new URL(`../supabase/functions/account-deletion-preview/${path}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\.(?:insert|update|upsert|delete|rpc)\s*\(|\bauth\.admin\b|\bstorage\b|\bwriteAudit\b|\bconsole\./);
  }
});
