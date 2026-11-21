import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { renderListener } from '../envoy-safe-entrypoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const previous = resolve(here, '../account-sessions-20261027');
const source = resolve(here, '../../../supabase/functions');
const read = (name) => readFile(name, 'utf8');
const template = await read(resolve(here, 'lds.template.yaml'));
const oldTemplate = await read(resolve(previous, 'lds.template.yaml'));
const listener = (text) => parse(text).resources[0].filter_chains[0].filters[0].typed_config;
const current = listener(template);
const old = listener(oldTemplate);
const routes = current.route_config.virtual_hosts[0].routes;
const oldRoutes = old.route_config.virtual_hosts[0].routes;
const functions = ['device-binding', 'remote-state', 'remote-state-sync'];
assert.deepEqual(routes.slice(0, -4), oldRoutes.slice(0, -1));
assert.deepEqual(routes.at(-1), oldRoutes.at(-1));
for (const [index, name] of functions.entries()) {
  const expected = JSON.parse(JSON.stringify(oldRoutes.at(-2)).replaceAll('account-sessions', name));
  assert.deepEqual(routes.at(-4 + index), expected);
  assert.equal(expected.match.path, `/functions/v1/${name}`);
  assert.equal(expected.route.prefix_rewrite, `/${name}`);
}

const bypass = '\n\n                        -- The exact sync route authenticates its independent named secret in the handler.\n                        if request_handle:streamInfo():routeName() == "doso-remote-state-sync-only" then\n                          return\n                        end';
assert.equal(template.split(bypass).length, 2);
const suffix = '              http_filters:';
assert.equal(template.replace(bypass, '').slice(template.indexOf(suffix)), oldTemplate.slice(oldTemplate.indexOf(suffix)));
assert.ok(template.includes('headers:remove("sb-api-key")' + bypass));
assert.equal(await read(resolve(here, 'cds.yaml')), await read(resolve(previous, 'cds.yaml')));

const compose = parseDocument(await read(resolve(here, 'compose.device-cloud.yml'))).toJS();
const oldCompose = parseDocument(await read(resolve(previous, 'compose.account-sessions.yml'))).toJS();
assert.deepEqual(Object.keys(compose.services).sort(), ['api-gw', 'functions']);
const expectedCompose = JSON.parse(JSON.stringify(oldCompose).replaceAll('account-sessions-20261027', 'device-cloud-20261103'));
expectedCompose.services.functions = {
  environment: expectedCompose.services.functions.environment,
  volumes: expectedCompose.services.functions.volumes,
};
expectedCompose.services.functions.environment.SUPABASE_SECRET_KEYS = '${SUPABASE_SECRET_KEYS:?Configure the dedicated remote-state-sync named key in the private self-hosted env}';
expectedCompose.services.functions.environment.DOSO_REMOTE_SYNC_SECRET_NAME = 'remote-state-sync';
assert.deepEqual(compose, expectedCompose);

assert.deepEqual((await readdir(resolve(here, 'functions'))).sort(), ['_shared', 'account-sessions', 'deno.jsonc', 'device-binding', 'main', 'remote-state', 'remote-state-sync']);
for (const name of ['account-sessions', ...functions, '_shared']) {
  const files = await readdir(resolve(here, 'functions', name));
  for (const file of files) {
    assert.equal(await read(resolve(here, 'functions', name, file)), await read(resolve(source, name, file)), `${name}/${file}`);
  }
}
for (const file of ['main/index.ts', 'deno.jsonc']) {
  assert.equal(await read(resolve(here, 'functions', file)), await read(resolve(previous, 'functions', file)), file);
}
assert.equal(await read(resolve(here, 'functions/_shared/deviceBinding.ts')),
  await read(resolve(source, '_shared/deviceBinding.ts')));
assert.equal(await read(resolve(here, 'sql/20261104090000_claim_device_by_uuid.sql')),
  await read(resolve(source, '../migrations/20261104090000_claim_device_by_uuid.sql')));
const jwt = (role) => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: 1700000000, exp: 1900000000 })).toString('base64url'), Buffer.alloc(32, 7).toString('base64url')].join('.');
const rendered = renderListener(template, { ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role'), SUPABASE_PUBLIC_URL: 'https://api-test.dosorobotics.com', DASHBOARD_USERNAME: 'synthetic-admin', DASHBOARD_PASSWORD: 'synthetic-only-password' });
assert.ok(!rendered.includes('${'));
assert.equal(listener(rendered).route_config.virtual_hosts[0].routes.length, oldRoutes.length + 3);
console.log('PASS: three exact routes, sync-only Lua exception, unchanged core/auth configuration, current source copies, and safe Envoy rendering.');
