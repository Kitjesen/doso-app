import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse, parseDocument } from 'yaml';
import ts from 'typescript';
import { renderListener } from '../envoy-safe-entrypoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const upstream = resolve(root, 'artifacts/release-readiness/20261026-aliyun-server-inventory/host-overlay-validation/reviewed/candidate/docker');
const base = resolve(here, '../gateway-loopback-20261027');
const read = (path) => readFile(path, 'utf8');
const manifest = JSON.parse(await read(resolve(here, 'manifest.json')));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const template = await read(resolve(here, 'lds.template.yaml'));
const original = await read(resolve(base, 'lds.template.yaml'));
const listener = (text) => parse(text).resources[0].filter_chains[0].filters[0].typed_config;
const routes = listener(template).route_config.virtual_hosts[0].routes;
const oldRoutes = listener(original).route_config.virtual_hosts[0].routes;
const document = parseDocument(await read(resolve(here, 'compose.account-sessions.yml')));
const services = document.toJS().services;

test('every runtime file and seven source snapshots match their recorded hashes', async () => {
  assert.equal(Object.keys(manifest.files).length, 11);
  assert.equal(Object.keys(manifest.source_pins).length, 7);
  for (const [name, record] of Object.entries(manifest.files)) {
    const bytes = await readFile(resolve(here, name));
    assert.equal(bytes.length, record.bytes, name);
    assert.equal(sha(bytes), record.sha256, name);
  }
  for (const [name, record] of Object.entries(manifest.source_pins)) {
    const source = await readFile(resolve(root, record.path));
    assert.equal(sha(source), record.sha256, name);
    assert.deepEqual(await readFile(resolve(here, name)), source, name);
  }
});

test('the only extra route is exact account-sessions and retains the function name after rewrite', async () => {
  assert.equal(routes.length, oldRoutes.length + 1);
  assert.deepEqual(routes.slice(0, -2), oldRoutes.slice(0, -1));
  assert.deepEqual(routes.at(-1), oldRoutes.at(-1));
  const officialRoutes = listener(await read(resolve(upstream, 'volumes/api/envoy/lds.template.yaml'))).route_config.virtual_hosts[0].routes;
  const expected = structuredClone(officialRoutes.find((route) => route.name === 'functions-v1-all'));
  expected.name = 'doso-account-sessions-only';
  expected.match = { path: '/functions/v1/account-sessions' };
  expected.route.prefix_rewrite = '/account-sessions';
  assert.deepEqual(routes.at(-2), expected);
  assert.equal(routes.at(-2).route.cluster, 'functions');
  assert.equal(routes.at(-2).match.prefix, undefined);
  for (const path of ['/functions/v1/account-sessions-extra', '/functions/v1/account-sessions/', '/functions/v1/device-binding']) {
    assert.notEqual(path, routes.at(-2).match.path);
  }
});

test('all existing HTTP filters remain byte-for-byte unchanged', () => {
  assert.deepEqual(listener(template).http_filters, listener(original).http_filters);
  const anchor = '              http_filters:';
  assert.equal(template.slice(template.indexOf(anchor)), original.slice(original.indexOf(anchor)));
});

test('only the unchanged official Functions cluster is added to the two existing clusters', async () => {
  const current = parse(await read(resolve(here, 'cds.yaml'))).resources;
  const old = parse(await read(resolve(base, 'cds.yaml'))).resources;
  const official = parse(await read(resolve(upstream, 'volumes/api/envoy/cds.yaml'))).resources;
  assert.deepEqual(current.slice(0, 2), old);
  assert.deepEqual(current.at(-1), official.find((cluster) => cluster.name === 'functions'));
  assert.deepEqual(current.map((cluster) => cluster.name), ['auth', 'rest', 'functions']);
});

test('gateway overlay changes only the two LDS/CDS mount sources and preserves its other binds', async () => {
  const previous = parseDocument(await read(resolve(base, 'compose.gateway-loopback.yml'))).toJS().services['api-gw'];
  assert.deepEqual(Object.keys(services['api-gw']), ['volumes']);
  const expected = structuredClone(previous.volumes);
  for (const mount of expected) {
    if (['/etc/envoy/cds.yaml', '/etc/envoy/lds.template.yaml'].includes(mount.target)) {
      mount.source = mount.source.replace('gateway-loopback-20261027', 'account-sessions-20261027');
    }
  }
  assert.deepEqual(services['api-gw'].volumes, expected);
  assert.equal(document.errors.length, 0);
  assert.equal(document.warnings.length, 4);
  assert.ok(document.warnings.every((warning) => warning.code === 'TAG_RESOLVE_FAILED'));
  for (const path of [['api-gw', 'volumes'], ['functions', 'depends_on'], ['functions', 'environment'], ['functions', 'volumes']]) {
    assert.equal(document.getIn(['services', ...path], true).tag, '!override');
  }
});

test('Functions uses the cached digest and only required credentials, with read-only sources and no host ports', () => {
  const service = services.functions;
  assert.equal(service.image, manifest.functions_image);
  assert.equal(service.pull_policy, 'never');
  assert.deepEqual(service.depends_on, { 'api-gw': { condition: 'service_healthy' } });
  assert.equal(service.environment.SUPABASE_URL, 'http://api-gw:8000');
  assert.equal(service.environment.VERIFY_JWT, 'false');
  assert.deepEqual(Object.keys(service.environment).sort(), ['DENO_DIR', 'DOSO_ALLOWED_WEB_ORIGINS', 'SUPABASE_ANON_KEY', 'SUPABASE_PUBLIC_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'VERIFY_JWT']);
  assert.equal(service.environment.DENO_DIR, '/root/.cache/deno');
  assert.deepEqual(service.volumes, [
    { type: 'bind', source: './doso/account-sessions-20261027/functions', target: '/home/deno/functions', read_only: true, bind: { create_host_path: false } },
    { type: 'volume', source: 'deno-cache', target: '/root/.cache/deno' },
  ]);
  assert.equal(service.ports, undefined);
  assert.equal(service.network_mode, undefined);
  assert.equal(service.privileged, undefined);
  assert.equal(service.read_only, true);
  assert.deepEqual(service.cap_drop, ['ALL']);
  assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
  assert.deepEqual(service.logging, { driver: 'none' });
  assert.deepEqual(service.ulimits.core, { soft: 0, hard: 0 });
  assert.equal(service.mem_limit, '512m');
  assert.equal(service.pids_limit, 128);
});

test('the official router can omit JWT signing material only because handler verification remains enabled', async () => {
  const main = await read(resolve(here, 'functions/main/index.ts'));
  assert.ok(main.includes("if (req.method !== 'OPTIONS' && VERIFY_JWT)"));
  assert.ok(main.includes("if (!raw) return null"));
  const auth = await read(resolve(here, 'functions/_shared/auth.ts'));
  assert.ok(auth.includes('await db.auth.getUser(token)'));
  assert.ok(auth.includes('const userDb = clients.callerClient(token)'));
  assert.ok(auth.includes('.eq(\n        "auth_session_id",\n        sessionId,\n      )') || auth.includes('"auth_session_id",\r\n        sessionId,'));
  assert.ok(auth.includes('"session_check_failed"'));
  assert.ok(auth.includes('"profile_unavailable"'));
  const account = await read(resolve(here, 'functions/account-sessions/index.ts'));
  assert.ok(account.includes('action !== "register"'));
  assert.ok(account.includes('userDb.rpc("register_account_terminal"'));
  assert.ok(account.includes('userDb.rpc("heartbeat_current_terminal"'));
});

test('the credential-free dependency probe imports exactly the two runtime modules without client requests', async () => {
  const probe = await read(resolve(here, 'dependency-probe/index.ts'));
  assert.ok(probe.includes("from 'jsr:@panva/jose@6'"));
  assert.ok(probe.includes("from 'npm:@supabase/supabase-js@2.112.3'"));
  assert.ok(!/Deno\.env|fetch\(|createClient\(|Authorization|SERVICE_ROLE|password/i.test(probe));
  assert.ok(probe.includes("status: 'doso_function_imports_ready'"));
  const compiled = ts.transpileModule(probe, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, reportDiagnostics: true });
  assert.deepEqual(compiled.diagnostics, []);
});

test('the new listener retains the exact reviewed render contract with fabricated keys only', () => {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = (role) => [part({ alg: 'HS256', typ: 'JWT' }), part({ role, iss: 'supabase', iat: 1700000000, exp: 1900000000 }), Buffer.alloc(32, 7).toString('base64url')].join('.');
  const rendered = renderListener(template, { ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role'), SUPABASE_PUBLIC_URL: 'https://api-test.dosorobotics.com', DASHBOARD_USERNAME: 'synthetic-admin', DASHBOARD_PASSWORD: 'synthetic-only-password' });
  assert.equal(rendered.includes('${'), false);
  assert.equal(rendered.includes('synthetic-only-password'), false);
  assert.equal(parse(rendered).resources[0].name, 'supabase');
});
