import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { renderListener } from '../envoy-safe-entrypoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const previous = resolve(here, '../device-cloud-20261103');
const source = resolve(here, '../../../supabase/functions');
const read = path => readFile(path, 'utf8');
const listener = text => parse(text).resources[0].filter_chains[0].filters[0].typed_config;
const template = await read(resolve(here, 'lds.template.yaml'));
const current = listener(template);
const expected = listener(await read(resolve(previous, 'lds.template.yaml')));
const routes = expected.route_config.virtual_hosts[0].routes;
const admin = structuredClone(routes.find(route => route.name === 'doso-account-sessions-only'));
admin.name = 'doso-admin-devices-only';
admin.match.path = '/functions/v1/admin-devices';
admin.route.prefix_rewrite = '/admin-devices';
routes.splice(-1, 0, admin);
assert.deepEqual(current, expected, 'Only the exact admin route may change');
assert.equal(await read(resolve(here, 'cds.yaml')), await read(resolve(previous, 'cds.yaml')));
const compose = parseDocument(await read(resolve(here, 'compose.device-admin.yml'))).toJS();
const oldCompose = parseDocument(await read(resolve(previous, 'compose.device-cloud.yml'))).toJS();
assert.deepEqual(compose, JSON.parse(JSON.stringify(oldCompose).replaceAll('device-cloud-20261103', 'device-admin-20261104')));

const names = ['account-sessions', 'device-binding', 'remote-state', 'remote-state-sync', 'admin-devices'];
assert.deepEqual((await readdir(resolve(here, 'functions'))).sort(), ['_shared', 'deno.jsonc', 'main', ...names].sort());
for (const name of names) {
  const files = ['index.ts', ...(['remote-state', 'remote-state-sync', 'admin-devices'].includes(name) ? ['handler.ts'] : [])];
  assert.deepEqual((await readdir(resolve(here, 'functions', name))).sort(), files.sort());
  for (const file of files) {
    assert.equal(await read(resolve(here, 'functions', name, file)), await read(resolve(source, name, file)), `${name}/${file}`);
  }
}
const shared = ['actions.ts', 'audit.ts', 'auth.ts', 'crypto.ts', 'deviceBinding.ts', 'http.ts', 'robotIngress.ts'];
assert.deepEqual((await readdir(resolve(here, 'functions/_shared'))).sort(), shared.sort());
for (const file of shared) {
  assert.equal(await read(resolve(here, 'functions/_shared', file)), await read(resolve(source, '_shared', file)));
}
assert.deepEqual(await readdir(resolve(here, 'functions/main')), ['index.ts']);
for (const file of ['main/index.ts', 'deno.jsonc']) {
  assert.equal(await read(resolve(here, 'functions', file)), await read(resolve(here, '../account-sessions-20261027/functions', file)));
}
const sqlFiles = ['20261104090000_claim_device_by_uuid.sql', '20261104100000_create_device_inventory.sql', '20261104110000_issue_factory_claim.sql'];
for (const file of sqlFiles) {
  assert.equal(await read(resolve(here, 'sql', file)), await read(resolve(source, '../migrations', file)));
}
const apply = await read(resolve(here, 'sql/apply.sql'));
assert.deepEqual([...apply.matchAll(/^\\ir (.+)$/gm)].map(match => match[1].trim()), [...sqlFiles, 'postflight.sql']);
assert.deepEqual((await readdir(resolve(here, 'sql'))).sort(), [...sqlFiles, 'apply.sql', 'postflight.sql'].sort());
for (const [file, original] of [['runtime_base.py', 'deploy.py'], ['database_base.py', 'deploy-database.py']]) {
  assert.equal(await read(resolve(here, file)), await read(resolve(previous, original)));
}

const https = await read(resolve(here, 'https.conf'));
const oldHttps = await read(resolve(here, '../api-https-20261103/https.conf'));
assert.equal(https, oldHttps.replace('account-sessions|device-binding|remote-state|remote-state-sync', 'account-sessions|device-binding|remote-state|remote-state-sync|admin-devices'));
const pattern = new RegExp(https.match(/location ~ (.+) \{/)[1]);
assert.ok(pattern.test('/functions/v1/admin-devices'));
for (const path of ['/functions/v1/admin-devices/', '/functions/v1/admin-devices/create_inventory', '/functions/v1/admin-users']) {
  assert.ok(!pattern.test(path), path);
}
const jwt = role => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: 1700000000, exp: 1900000000 })).toString('base64url'), Buffer.alloc(32, 7).toString('base64url')].join('.');
const environment = { ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role'), SUPABASE_PUBLIC_URL: 'https://api-test.dosorobotics.com', DASHBOARD_USERNAME: 'synthetic-admin', DASHBOARD_PASSWORD: 'synthetic-only-password' };
const rendered = renderListener(template, environment);
assert.ok(!rendered.includes('${'));
const renderedExpected = listener(renderListener(await read(resolve(previous, 'lds.template.yaml')), environment));
renderedExpected.route_config.virtual_hosts[0].routes.splice(-1, 0, admin);
assert.deepEqual(listener(rendered), renderedExpected);
const migrationText = (await Promise.all(sqlFiles.map(file => read(resolve(here, 'sql', file))))).join('\n');
const handler = await read(resolve(here, 'functions/admin-devices/handler.ts'));
for (const [, name] of handler.matchAll(/db\.rpc\("([a-z_]+)"/g)) {
  assert.ok(migrationText.includes(`function public.${name}(`), `Missing migration for admin RPC ${name}`);
}
console.log('PASS: five function sources, three SQL migrations covering every admin RPC, exact admin routes, unchanged auth filters/core configuration, and safe Envoy rendering.');
