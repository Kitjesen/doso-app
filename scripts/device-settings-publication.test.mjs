// Actual extracted App callback + production repository/query/coordinator and
// installed public SDK. Auth UI/React lifecycle inputs, HTTP and storage are
// controlled; this is not a mounted React/native or live-account proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';
const ROOT = new URL('../', import.meta.url), USER = '11111111-1111-4111-8111-111111111111', OTHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION_A = '22222222-2222-4222-8222-222222222222', SESSION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function deferred() { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; }
function session(label, lifetime = 3600, userId = USER, sessionId = SESSION_A) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), exp = Math.floor(Date.now() / 1000) + lifetime;
  return { access_token: `${encode({ alg: 'none' })}.${encode({ sub: userId, session_id: sessionId, exp, label })}.synthetic`, refresh_token: `synthetic-${label}`, expires_at: exp, expires_in: lifetime, token_type: 'bearer', user: { id: userId, aud: 'authenticated', app_metadata: {}, user_metadata: {} } };
}
const response = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' } });
const fixtureSource = readFileSync(new URL('scripts/device-data-query.test.mjs', ROOT), 'utf8');
const fixtureFile = ts.createSourceFile('device-data-query.test.mjs', fixtureSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fixtureNode = fixtureFile.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'fixture'); assert.ok(fixtureNode);
const fixtureModule = { exports: {} };
vm.runInNewContext(`${fixtureNode.getText(fixtureFile)}\nmodule.exports=fixture;`, {
  module: fixtureModule, assert, readFileSync, ROOT, ts, vm, createClient, PostgrestClient, createAuthRequestFetch, USER, session, response, deferred, sequence: 0,
  Error, Promise, Map, URL, Headers, Response,
});
const appText = readFileSync(new URL('App.tsx', ROOT), 'utf8'), app = ts.createSourceFile('App.tsx', appText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function initializer(name, required = true) { let result; const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(app) === name) result = node.initializer; ts.forEachChild(node, visit); }; visit(app); if (required) assert.ok(result, `Missing App initializer ${name}`); return result?.getText(app); }
function evaluate(source, globals) { const module = { exports: {} }; const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText; vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, Symbol, atob, Uint8Array, TextDecoder, ...globals }); return module.exports; }
const identity = evaluate(readFileSync(new URL('src/services/authSessionIdentity.ts', ROOT), 'utf8'), {});
const humanize = (() => { let found; const visit = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'humanizeAuthError') found = node.getText(app); ts.forEachChild(node, visit); }; visit(app); assert.ok(found); return evaluate(`${found}\nmodule.exports=humanizeAuthError;`, { SupabaseConfigurationError: class extends Error {} }); })();
async function host() {
  const sdk = await fixtureModule.exports(), writes = [], notices = [], requests = [];
  let cleanup;
  const context = { user: { id: USER }, session: session('A'), device: { ...sdk.rows[0], display_name: 'Original A', alerts_enabled: true },
    preparedUserId: USER, preparedSessionKey: 'prepared-A', useRef: value => ({ current: value }), deviceRepository: sdk.repository.deviceRepository,
    readAuthSessionIdentity: identity.readAuthSessionIdentity, humanizeAuthError: humanize,
    currentUserIdRef: { current: USER }, preparedUserIdRef: { current: USER }, preparedSessionKeyRef: { current: 'prepared-A' },
    notify(...args) { notices.push(args); },
    setDevice(value) { context.device = typeof value === 'function' ? value(context.device) : value; writes.push(context.device); render(); },
  };
  for (const name of ['deviceSettingsAttemptRef', 'deviceSettingsMountedRef', 'deviceSettingsContext']) {
    const source = initializer(name, false); if (source) context[name] = evaluate(`module.exports=${source};`, context);
  }
  let contextProjection, lifecycle;
  const visit = node => {
    if (ts.isIfStatement(node) && node.expression.getText(app).includes('deviceSettingsContext.current.identity')) contextProjection = node.getText(app);
    if (ts.isCallExpression(node) && node.expression.getText(app) === 'useEffect' && node.arguments[0]?.getText(app).includes('deviceSettingsMountedRef.current = true')) lifecycle = node.arguments[0].getText(app);
    ts.forEachChild(node, visit);
  }; visit(app);
  if (initializer('deviceSettingsContext', false)) assert.ok(contextProjection);
  function render(values = {}) {
    Object.assign(context, values);
    context.currentUserIdRef.current = context.user?.id ?? null;
    context.preparedUserIdRef.current = context.preparedUserId;
    context.preparedSessionKeyRef.current = context.preparedSessionKey;
    context.mfaIdentity = evaluate(`module.exports=${initializer('mfaIdentity')};`, context);
    const expression = initializer('deviceSettingsIdentity', false);
    if (expression) context.deviceSettingsIdentity = evaluate(`module.exports=${expression};`, context);
    if (contextProjection) evaluate(`module.exports=()=>{${contextProjection}};`, context)();
    const renderContext = initializer('deviceSettingsRenderContext', false);
    if (renderContext) context.deviceSettingsRenderContext = evaluate(`module.exports=${renderContext};`, context);
  }
  const factory = evaluate(`module.exports=(device, deviceSettingsRenderContext)=>(${initializer('persistDeviceSettings')});`, context);
  render(); if (lifecycle) cleanup = evaluate(`module.exports=${lifecycle};`, context)();
  sdk.setDataHandler((url, init) => {
    const gate = deferred(); requests.push({ url, init, gate }); return gate.promise;
  });
  return { sdk, context, writes, notices, requests, render,
    handler: () => factory(context.device, context.deviceSettingsRenderContext), save: (settings, message) => factory(context.device, context.deviceSettingsRenderContext)(settings, message),
    async entered(index = 0) { for (let n = 0; n < 100 && !requests[index]; n++) await new Promise(resolve => setImmediate(resolve)); assert.ok(requests[index], 'Actual SDK device HTTP was reached'); return requests[index]; },
    unmount() { cleanup?.(); }, mount() { if (lifecycle) cleanup = evaluate(`module.exports=${lifecycle};`, context)(); },
    async dispose() { cleanup?.(); for (const request of requests) request.gate.resolve(response(sdk.rows[0])); await sdk.dispose(); },
  };
}

test('account A settings success cannot replace account B device or publish an old toast', { timeout: 10000 }, async t => {
  const h = await host(), settings = { display_name: 'Saved A' };
  const pending = h.save(settings, 'A saved');
  try {
    const request = await h.entered(); assert.deepEqual(JSON.parse(request.init.body), settings);
    const current = { id: 'device-B', owner_id: OTHER, display_name: 'Current B' };
    h.render({ user: { id: OTHER }, session: session('B', 3600, OTHER, SESSION_B), device: current, preparedUserId: OTHER, preparedSessionKey: 'prepared-B' });
    const beforeWrites = h.writes.length, beforeNotices = h.notices.length;
    request.gate.resolve(response({ ...h.sdk.rows[0], ...settings })); await pending;
    t.diagnostic(JSON.stringify({ scenario: 'device-settings-stale-success', lateWrites: h.writes.length - beforeWrites, lateNotices: h.notices.length - beforeNotices, currentOwnerPreserved: h.context.device.owner_id === OTHER, actualDeviceRequests: h.requests.length }));
    assert.equal(h.context.device, current); assert.equal(h.writes.length, beforeWrites); assert.equal(h.notices.length, beforeNotices);
  } finally { for (const request of h.requests) request.gate.resolve(response(h.sdk.rows[0])); await pending.catch(() => undefined); await h.dispose(); }
});

const rejectedResponse = () => new Response(JSON.stringify({ code: '42501', message: 'Synthetic rejected', details: null, hint: null }), { status: 403, headers: { 'content-type': 'application/json' } });
async function finish(h, pending) { for (const request of h.requests) request.gate.resolve(response(h.sdk.rows[0])); await Promise.allSettled(Array.isArray(pending) ? pending : [pending]); await h.dispose(); }

test('a failure after committed logout cannot restore the old device or show an old error', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ alerts_enabled: false });
  try {
    const request = await h.entered(); h.render({ user: null, session: null, device: null, preparedUserId: null, preparedSessionKey: null });
    const writes = h.writes.length, notices = h.notices.length;
    request.gate.resolve(rejectedResponse()); await pending;
    assert.equal(h.context.device, null); assert.equal(h.writes.length, writes); assert.equal(h.notices.length, notices);
  } finally { await finish(h, pending); }
});

test('a new session for the same user retires the previous settings publication', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ display_name: 'Old session' }, 'old result');
  try {
    const request = await h.entered(), current = { ...h.context.device, display_name: 'New session state' };
    h.render({ session: session('new-session', 3600, USER, SESSION_B), preparedSessionKey: 'new-ready-key', device: current });
    const writes = h.writes.length;
    request.gate.resolve(response({ ...h.sdk.rows[0], display_name: 'Old session' })); await pending;
    assert.equal(h.context.device, current); assert.equal(h.writes.length, writes); assert.equal(h.notices.length, 0);
  } finally { await finish(h, pending); }
});

test('an old failure cannot roll back a newly selected device in the same session', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ alerts_enabled: false });
  try {
    const request = await h.entered(), current = { id: 'selected-other-device', owner_id: USER, display_name: 'Other device' };
    h.render({ device: current }); const writes = h.writes.length;
    request.gate.resolve(rejectedResponse()); await pending;
    assert.equal(h.context.device, current); assert.equal(h.writes.length, writes); assert.equal(h.notices.length, 0);
  } finally { await finish(h, pending); }
});

test('A to B to A does not revive the old A attempt even with identical final identity strings', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ display_name: 'Old A' }, 'old A saved');
  try {
    const request = await h.entered();
    h.render({ user: { id: OTHER }, session: session('B', 3600, OTHER, SESSION_B), device: { id: 'B', owner_id: OTHER } });
    const current = { ...h.sdk.rows[0], display_name: 'Restored A view' };
    h.render({ user: { id: USER }, session: session('A'), device: current }); const writes = h.writes.length;
    request.gate.resolve(response({ ...h.sdk.rows[0], display_name: 'Old A' })); await pending;
    assert.equal(h.context.device, current); assert.equal(h.writes.length, writes); assert.equal(h.notices.length, 0);
  } finally { await finish(h, pending); }
});

test('current settings success publishes server result and frees admission for a later save', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ display_name: 'First saved' }, 'first result'); let second;
  try {
    const request = await h.entered(); request.gate.resolve(response({ ...h.sdk.rows[0], display_name: 'First saved' })); await pending;
    assert.equal(h.context.device.display_name, 'First saved'); assert.equal(h.notices[0][0], '设备设置已保存');
    second = h.save({ alerts_enabled: false });
    const next = await h.entered(1); next.gate.resolve(response({ ...h.sdk.rows[0], display_name: 'First saved', alerts_enabled: false })); await second;
    assert.equal(h.context.device.alerts_enabled, false); assert.equal(h.requests.length, 2);
  } finally { await finish(h, [pending, second]); }
});

test('current failure preserves original optimistic rollback and error feedback', { timeout: 10000 }, async () => {
  const h = await host(), previous = h.context.device, pending = h.save({ alerts_enabled: false });
  try {
    const request = await h.entered(); assert.equal(h.context.device.alerts_enabled, false);
    request.gate.resolve(rejectedResponse()); await pending;
    assert.equal(h.context.device, previous); assert.equal(h.notices.length, 1); assert.equal(h.notices[0][0], '保存失败'); assert.equal(h.notices[0][2], 'error');
  } finally { await finish(h, pending); }
});

test('same-context duplicate settings do not dispatch or queue another write', { timeout: 10000 }, async t => {
  const h = await host(), pending = h.save({ alerts_enabled: false });
  try {
    await h.save({ alerts_enabled: true });
    const request = await h.entered(); assert.equal(h.requests.length, 1); assert.equal(h.notices[0][0], '设备设置正在保存');
    request.gate.resolve(response({ ...h.sdk.rows[0], alerts_enabled: false })); await pending; await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.requests.length, 1); assert.equal(h.context.device.alerts_enabled, false);
    t.diagnostic(JSON.stringify({ scenario: 'device-settings-single-flight', actualDeviceRequests: 1, duplicateQueued: false }));
  } finally { await finish(h, pending); }
});

test('root App unmount suppresses late success and notification without cancelling HTTP', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ display_name: 'Late' }, 'late result');
  try {
    const request = await h.entered(); h.unmount(); const writes = h.writes.length;
    request.gate.resolve(response({ ...h.sdk.rows[0], display_name: 'Late' })); await pending;
    assert.equal(h.requests.length, 1); assert.equal(h.writes.length, writes); assert.equal(h.notices.length, 0);
  } finally { await finish(h, pending); }
});

test('effect cleanup and immediate replay cannot revive a retired settings attempt', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ alerts_enabled: false });
  try {
    const request = await h.entered(); h.unmount(); h.mount(); const writes = h.writes.length;
    request.gate.resolve(rejectedResponse()); await pending;
    assert.equal(h.writes.length, writes); assert.equal(h.notices.length, 0);
  } finally { await finish(h, pending); }
});

test('old attempt finally cannot clear admission or optimistic state of a newer device save', { timeout: 10000 }, async () => {
  const h = await host(), first = h.save({ display_name: 'Old device' }); let second;
  try {
    const old = await h.entered(), current = { id: 'second-device', owner_id: USER, display_name: 'Second device', alerts_enabled: true };
    h.render({ device: current }); second = h.save({ alerts_enabled: false }); const next = await h.entered(1);
    old.gate.resolve(rejectedResponse()); await first;
    await h.save({ alerts_enabled: true });
    assert.equal(h.requests.length, 2); assert.equal(h.context.device.id, current.id); assert.equal(h.context.device.alerts_enabled, false);
    next.gate.resolve(response({ ...current, alerts_enabled: false })); await second;
    assert.equal(h.context.device.id, current.id); assert.equal(h.context.device.alerts_enabled, false);
    assert.equal(h.notices.filter(item => item[0] === '保存失败').length, 0);
  } finally { await finish(h, [first, second]); }
});

test('same-session JWT rotation and prepared-key refresh keep a legitimate save current', { timeout: 10000 }, async () => {
  const h = await host(), pending = h.save({ display_name: 'Still current' }, 'saved after refresh');
  try {
    const request = await h.entered();
    h.render({ session: session('rotated-jwt', 7200, USER, SESSION_A), preparedSessionKey: 'new-preparation-key' });
    request.gate.resolve(response({ ...h.sdk.rows[0], display_name: 'Still current' })); await pending;
    assert.equal(h.context.device.display_name, 'Still current'); assert.equal(h.notices[0][0], '设备设置已保存');
  } finally { await finish(h, pending); }
});

test('mounted no-device feedback is retained without a repository or HTTP call', { timeout: 10000 }, async () => {
  const h = await host();
  try {
    h.render({ device: null }); await h.save({ alerts_enabled: false });
    assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.notices[0][0], '尚未绑定设备');
  } finally { await h.dispose(); }
});

test('an old bound-device callback cannot dispatch into the new account context', { timeout: 10000 }, async () => {
  const h = await host(), old = h.handler();
  try {
    h.render({ user: { id: OTHER }, session: session('B', 3600, OTHER, SESSION_B), device: { id: 'B', owner_id: OTHER } });
    await old({ alerts_enabled: false }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0); assert.equal(h.notices.length, 0);
  } finally { await h.dispose(); }
});

test('an old render callback cannot dispatch after A to B to an identical new A context', { timeout: 10000 }, async t => {
  const h = await host(), old = h.handler();
  try {
    h.render({ user: { id: OTHER }, session: session('B', 3600, OTHER, SESSION_B), device: { id: 'B', owner_id: OTHER } });
    const current = { ...h.sdk.rows[0], display_name: 'New A context' };
    h.render({ user: { id: USER }, session: session('A'), device: current });
    h.sdk.setDataHandler(() => response({ ...h.sdk.rows[0], alerts_enabled: false }));
    await old({ alerts_enabled: false }, 'old callback');
    const actualDeviceRequests = h.sdk.events.filter(event => event.phase === 'devices').length;
    t.diagnostic(JSON.stringify({ scenario: 'device-settings-stale-closure-aba', actualDeviceRequests, writes: h.writes.length, notices: h.notices.length, currentViewPreserved: h.context.device === current }));
    assert.equal(actualDeviceRequests, 0); assert.equal(h.writes.length, 0); assert.equal(h.notices.length, 0); assert.equal(h.context.device, current);
  } finally { await h.dispose(); }
});
