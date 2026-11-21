import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const previous = resolve(here, '../device-admin-20261104');
const source = resolve(here, '../../../supabase/functions');
const read = file => readFile(file, 'utf8');
await mkdir(here, { recursive: true });
await cp(resolve(previous, 'functions'), resolve(here, 'functions'), { recursive: true });
for (const name of ['video-access', 'video-authorize']) {
  await mkdir(resolve(here, 'functions', name), { recursive: true });
  for (const file of ['index.ts', 'handler.ts']) {
    await cp(resolve(source, name, file), resolve(here, 'functions', name, file));
  }
}
const listener = parseDocument(await read(resolve(previous, 'lds.template.yaml')));
const routes = listener.getIn(['resources', 0, 'filter_chains', 0, 'filters', 0, 'typed_config', 'route_config', 'virtual_hosts', 0, 'routes']);
const base = routes.items.find(route => route.get('name') === 'doso-account-sessions-only');
assert.ok(base);
for (const name of ['video-access', 'video-authorize']) {
  assert.ok(!routes.items.some(route => route.get('name') === `doso-${name}-only`));
  const route = base.clone();
  route.set('name', `doso-${name}-only`);
  route.setIn(['match', 'path'], `/functions/v1/${name}`);
  route.setIn(['route', 'prefix_rewrite'], `/${name}`);
  routes.items.splice(-1, 0, route);
}
await writeFile(resolve(here, 'lds.template.yaml'), listener.toString({ lineWidth: 0 }));
await cp(resolve(previous, 'cds.yaml'), resolve(here, 'cds.yaml'));
await writeFile(resolve(here, 'compose.video-access.yml'), (await read(resolve(previous, 'compose.device-admin.yml')))
  .replaceAll('device-admin-20261104', 'video-access-20261106')
  .replace('Append after the active device-cloud layer.', 'Append after the active device-admin layer.'));
const allowlist = 'account-sessions|device-binding|remote-state|remote-state-sync|admin-devices';
const https = await read(resolve(previous, 'https.conf'));
assert.equal(https.split(allowlist).length, 2);
await writeFile(resolve(here, 'https.conf'), https.replace(allowlist, `${allowlist}|video-access|video-authorize`));
let deploy = await read(resolve(previous, 'deploy.py'));
const replacements = [
  ["HERE = WORK / 'doso/device-admin-20261104'", "HERE = WORK / 'doso/video-access-20261106'"],
  ['BASE_RELEASE = WORK / \'doso/device-cloud-20261103\'', 'BASE_RELEASE = WORK / \'doso/device-admin-20261104\''],
  ["LAYER = 'doso/device-admin-20261104/compose.device-admin.yml'", "LAYER = 'doso/video-access-20261106/compose.video-access.yml'"],
  ["OLD_FUNCTIONS = b'account-sessions|device-binding|remote-state|remote-state-sync'", `OLD_FUNCTIONS = b'${allowlist}'`],
  ["NEW_FUNCTIONS = OLD_FUNCTIONS + b'|admin-devices'", "NEW_FUNCTIONS = OLD_FUNCTIONS + b'|video-access|video-authorize'"],
  ["layers = base.LAYERS + ('doso/device-cloud-20261103/compose.device-cloud.yml',)", "layers = base.LAYERS + ('doso/device-cloud-20261103/compose.device-cloud.yml', 'doso/device-admin-20261104/compose.device-admin.yml')"],
];
for (const [before, after] of replacements) {
  assert.equal(deploy.split(before).length, 2, before);
  deploy = deploy.replace(before, after);
}
// The existing release implementation keeps its backup, service and rollback checks.
deploy = deploy.replaceAll('device_admin', 'video_access').replaceAll('eleven', 'twelve')
  .replace('Apply device-admin SQL', 'Apply video authorization SQL')
  .replaceAll("prefix='.doso-device-admin-'", "prefix='.doso-video-access-'")
  .replaceAll("prefix='doso-device-admin-'", "prefix='doso-video-access-'")
  .replaceAll("prefix='device-admin-' + operation", "prefix='video-access-' + operation");
await writeFile(resolve(here, 'deploy.py'), deploy);
for (const file of ['runtime_base.py', 'database_base.py']) await cp(resolve(previous, file), resolve(here, file));
await mkdir(resolve(here, 'sql'), { recursive: true });
await cp(resolve(source, '../migrations/20261105110000_add_video_grants.sql'), resolve(here, 'sql/20261105110000_add_video_grants.sql'));
console.log('Prepared video authorization release with the existing five-function snapshot and twelve-layer baseline.');
