import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { renderListener } from '../envoy-safe-entrypoint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const previous = resolve(here, '../device-admin-20261104');
const source = resolve(here, '../../../supabase/functions');
const read = file => readFile(file, 'utf8');
for (const file of await readdir(resolve(previous, 'functions'), { recursive: true, withFileTypes: true })) {
  assert.ok(!file.isSymbolicLink());
  if (file.isFile()) {
    const path = resolve(file.parentPath, file.name);
    const relative = path.slice(resolve(previous, 'functions').length + 1);
    assert.equal(await read(resolve(here, 'functions', relative)), await read(path), `Published function changed: ${relative}`);
  }
}
for (const name of ['video-access', 'video-authorize']) for (const file of ['index.ts', 'handler.ts']) {
  assert.equal(await read(resolve(here, 'functions', name, file)), await read(resolve(source, name, file)));
}
assert.deepEqual((await readdir(resolve(here, 'functions'))).sort(),
  [...await readdir(resolve(previous, 'functions')), 'video-access', 'video-authorize'].sort());
const template = await read(resolve(here, 'lds.template.yaml'));
const expected = parse(await read(resolve(previous, 'lds.template.yaml')));
const routes = expected.resources[0].filter_chains[0].filters[0].typed_config.route_config.virtual_hosts[0].routes;
for (const name of ['video-access', 'video-authorize']) {
  const route = structuredClone(routes.find(route => route.name === 'doso-account-sessions-only'));
  route.name = `doso-${name}-only`;
  route.match.path = `/functions/v1/${name}`;
  route.route.prefix_rewrite = `/${name}`;
  routes.splice(-1, 0, route);
}
assert.deepEqual(parse(template), expected, 'Only the two exact function routes may change');
assert.equal(await read(resolve(here, 'cds.yaml')), await read(resolve(previous, 'cds.yaml')));
const compose = parseDocument(await read(resolve(here, 'compose.video-access.yml'))).toJS();
const oldCompose = parseDocument(await read(resolve(previous, 'compose.device-admin.yml'))).toJS();
assert.deepEqual(compose, JSON.parse(JSON.stringify(oldCompose).replaceAll('device-admin-20261104', 'video-access-20261106')));
assert.equal(compose.services.functions.environment.VERIFY_JWT, 'false');
const allowlist = 'account-sessions|device-binding|remote-state|remote-state-sync|admin-devices';
const https = await read(resolve(here, 'https.conf'));
assert.equal(https, (await read(resolve(previous, 'https.conf'))).replace(allowlist, `${allowlist}|video-access|video-authorize`));
const pattern = new RegExp(https.match(/location ~ (.+) \{/)[1]);
for (const name of ['video-access', 'video-authorize']) {
  assert.ok(pattern.test(`/functions/v1/${name}`));
  for (const suffix of ['/', '/other']) assert.ok(!pattern.test(`/functions/v1/${name}${suffix}`));
}
const migration = '20261105110000_add_video_grants.sql';
assert.equal(await read(resolve(here, 'sql', migration)), await read(resolve(source, '../migrations', migration)));
assert.deepEqual((await readdir(resolve(here, 'sql'))).sort(), [migration, 'apply.sql', 'postflight.sql'].sort());
assert.deepEqual([...(await read(resolve(here, 'sql/apply.sql'))).matchAll(/^\\ir (.+)$/gm)].map(match => match[1].trim()), [migration, 'postflight.sql']);
for (const name of ['runtime_base.py', 'database_base.py']) assert.equal(await read(resolve(here, name)), await read(resolve(previous, name)));
const jwt = role => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: 1700000000, exp: 1900000000 })).toString('base64url'), Buffer.alloc(32, 7).toString('base64url')].join('.');
const rendered = renderListener(template, { ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role'), SUPABASE_PUBLIC_URL: 'https://api-test.dosorobotics.com', DASHBOARD_USERNAME: 'synthetic-admin', DASHBOARD_PASSWORD: 'synthetic-only-password' });
assert.ok(!rendered.includes('${'));
console.log('PASS existing function snapshot, exact video routes, non-JWT handler passthrough, migration and safe configuration rendering.');
