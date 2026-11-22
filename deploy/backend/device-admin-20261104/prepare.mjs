import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../supabase/functions');
const previous = resolve(here, '../device-cloud-20261103');
const router = resolve(here, '../account-sessions-20261027/functions');
const output = resolve(here, 'functions');

await mkdir(output, { recursive: true });
for (const name of ['main', 'deno.jsonc']) {
  await cp(resolve(router, name), resolve(output, name), { recursive: true });
}
for (const name of ['account-sessions', 'device-binding', 'remote-state', 'remote-state-sync', 'admin-devices']) {
  await mkdir(resolve(output, name), { recursive: true });
  await cp(resolve(source, name, 'index.ts'), resolve(output, name, 'index.ts'));
}
for (const name of ['remote-state', 'remote-state-sync', 'admin-devices']) {
  await cp(resolve(source, name, 'handler.ts'), resolve(output, name, 'handler.ts'));
}
await mkdir(resolve(output, '_shared'), { recursive: true });
for (const name of ['actions.ts', 'audit.ts', 'auth.ts', 'crypto.ts', 'deviceBinding.ts', 'http.ts', 'robotIngress.ts']) {
  await cp(resolve(source, '_shared', name), resolve(output, '_shared', name));
}
await mkdir(resolve(here, 'sql'), { recursive: true });
for (const name of ['20261104090000_claim_device_by_uuid.sql', '20261104100000_create_device_inventory.sql', '20261104110000_issue_factory_claim.sql']) {
  await cp(resolve(source, '../migrations', name), resolve(here, 'sql', name));
}

const listener = parseDocument(await readFile(resolve(previous, 'lds.template.yaml'), 'utf8'));
const routes = listener.getIn(['resources', 0, 'filter_chains', 0, 'filters', 0, 'typed_config', 'route_config', 'virtual_hosts', 0, 'routes']);
const base = routes.items.find(route => route.get('name') === 'doso-account-sessions-only');
assert.ok(base, 'Existing authenticated function route is required');
assert.ok(!routes.items.some(route => route.get('name') === 'doso-admin-devices-only'));
const admin = base.clone();
admin.set('name', 'doso-admin-devices-only');
admin.setIn(['match', 'path'], '/functions/v1/admin-devices');
admin.setIn(['route', 'prefix_rewrite'], '/admin-devices');
routes.items.splice(-1, 0, admin);
await writeFile(resolve(here, 'lds.template.yaml'), listener.toString({ lineWidth: 0 }));
await cp(resolve(previous, 'cds.yaml'), resolve(here, 'cds.yaml'));
const compose = (await readFile(resolve(previous, 'compose.device-cloud.yml'), 'utf8'))
  .replaceAll('device-cloud-20261103', 'device-admin-20261104')
  .replace('Append after the active account-sessions layer.', 'Append after the active device-cloud layer.');
await writeFile(resolve(here, 'compose.device-admin.yml'), compose);

const https = await readFile(resolve(here, '../api-https-20261103/https.conf'), 'utf8');
const allowlist = 'account-sessions|device-binding|remote-state|remote-state-sync';
assert.equal(https.split(allowlist).length, 2);
await writeFile(resolve(here, 'https.conf'), https.replace(allowlist, allowlist + '|admin-devices'));
for (const [name, target] of [['deploy.py', 'runtime_base.py'], ['deploy-database.py', 'database_base.py']]) {
  await cp(resolve(previous, name), resolve(here, target));
}
console.log('Prepared five business functions, exact admin routes, three new SQL migrations and existing deployment helpers.');
