import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const previous = resolve(here, '../device-location-20261108');
const gateway = resolve(here, '../device-admin-20261104');
const read = path => readFile(path, 'utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashes(directory) {
  const files = await readdir(directory, { recursive: true, withFileTypes: true });
  assert(!files.some(file => file.isSymbolicLink()));
  return Object.fromEntries(await Promise.all(files.filter(file => file.isFile()).map(async file => {
    const path = resolve(file.parentPath, file.name);
    return [relative(directory, path).replaceAll('\\', '/'), hash(await readFile(path))];
  })));
}
const before = await hashes(resolve(previous, 'functions'));
await cp(resolve(previous, 'functions'), resolve(here, 'functions'), { recursive: true });
for (const name of ['remote-history', 'telemetry-export']) {
  await mkdir(resolve(here, 'functions', name), { recursive: true });
  for (const file of ['index.ts', 'handler.ts']) {
    await cp(resolve(root, 'supabase/functions', name, file), resolve(here, 'functions', name, file));
  }
}
for (const name of ['remote-state/handler.ts', '_shared/robotIngress.ts']) {
  assert.equal((await read(resolve(previous, 'functions', name))).replaceAll('\r\n', '\n'),
    (await read(resolve(root, 'supabase/functions', name))).replaceAll('\r\n', '\n'), `Snapshot compatibility ${name}`);
}
const after = await hashes(resolve(here, 'functions'));
assert.deepEqual(Object.keys(after).filter(path => before[path] !== after[path]).sort(),
  ['remote-history/handler.ts', 'remote-history/index.ts', 'telemetry-export/handler.ts', 'telemetry-export/index.ts']);
for (const [path, digest] of Object.entries(before)) assert.equal(after[path], digest, path);
for (const file of ['runtime_base.py', 'database_base.py']) await cp(resolve(previous, file), resolve(here, file));
await cp(resolve(gateway, 'deploy.py'), resolve(here, 'gateway_base.py'));

const listener = parseDocument(await read(resolve(gateway, 'lds.template.yaml')));
const routes = listener.getIn(['resources', 0, 'filter_chains', 0, 'filters', 0, 'typed_config', 'route_config', 'virtual_hosts', 0, 'routes']);
const baseRoute = routes.items.find(route => route.get('name') === 'doso-account-sessions-only');
assert(baseRoute);
for (const name of ['video-access', 'video-authorize', 'remote-history', 'telemetry-export']) {
  assert(!routes.items.some(route => route.get('name') === `doso-${name}-only`));
  const route = baseRoute.clone();
  route.set('name', `doso-${name}-only`);
  route.setIn(['match', 'path'], `/functions/v1/${name}`);
  route.setIn(['route', 'prefix_rewrite'], `/${name}`);
  routes.items.splice(-1, 0, route);
}
let lds = listener.toString({ lineWidth: 0 });
const bypass = 'if request_handle:streamInfo():routeName() == "doso-remote-state-sync-only" then';
assert.equal(lds.split(bypass).length, 2);
lds = lds.replace(bypass, 'if request_handle:streamInfo():routeName() == "doso-remote-state-sync-only" or request_handle:streamInfo():routeName() == "doso-telemetry-export-only" then');
await writeFile(resolve(here, 'lds.template.yaml'), lds);
await cp(resolve(gateway, 'cds.yaml'), resolve(here, 'cds.yaml'));
const oldAllowlist = 'account-sessions|device-binding|remote-state|remote-state-sync|admin-devices';
const https = await read(resolve(gateway, 'https.conf'));
assert.equal(https.split(oldAllowlist).length, 2);
await writeFile(resolve(here, 'https.conf'), https.replace(oldAllowlist,
  `${oldAllowlist}|video-access|video-authorize|remote-history|telemetry-export`));

const compose = parseDocument((await read(resolve(gateway, 'compose.device-admin.yml')))
  .replaceAll('device-admin-20261104', 'remote-history-20261109'));
compose.getIn(['services', 'functions', 'environment']).delete('SUPABASE_SECRET_KEYS');
compose.setIn(['services', 'functions', 'environment', 'DOSO_ALLOWED_WEB_ORIGINS'], 'http://localhost:8081');
compose.setIn(['services', 'functions', 'environment', 'DOSO_TELEMETRY_EXPORT_SECRET_NAME'], 'telemetry-export');
compose.setIn(['services', 'functions', 'env_file'], ['/opt/doso-backend-shadow/env/remote-history.env']);
await writeFile(resolve(here, 'compose.remote-history.yml'), compose.toString({ lineWidth: 0 }));
await writeFile(resolve(here, 'baseline.json'), JSON.stringify({ functions: before }, null, 2));
await mkdir(resolve(here, 'sql'), { recursive: true });
for (const name of ['20261108020000_add_telemetry_export.sql', '20261109010000_add_history_access.sql']) {
  await cp(resolve(root, 'supabase/migrations', name), resolve(here, 'sql', name));
}
const files = ['deploy.py', 'deploy_test.py', 'runtime_base.py', 'database_base.py', 'gateway_base.py', 'baseline.json',
  'compose.remote-history.yml', 'lds.template.yaml', 'cds.yaml', 'https.conf', 'README.md'];
for (const directory of ['functions', 'sql']) {
  for (const file of await readdir(resolve(here, directory), { recursive: true, withFileTypes: true })) {
    assert(!file.isSymbolicLink());
    if (file.isFile()) files.push(relative(here, resolve(file.parentPath, file.name)).replaceAll('\\', '/'));
  }
}
assert(!files.some(file => /\.(pem|key|env)$/.test(file)));
const archive = resolve(here, 'remote-history-20261109.tar.gz');
const result = spawnSync('tar', ['-czf', archive, ...files], { cwd: here, encoding: 'utf8', windowsHide: true });
assert.equal(result.status, 0, result.stderr);
const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8', windowsHide: true });
assert.equal(listing.status, 0, listing.stderr);
assert.deepEqual(listing.stdout.trim().split(/\r?\n/).sort(), files.sort());
const evidence = { status: 'prepared_only', files: files.length, archiveSha256: hash(await readFile(archive)),
  preservedFunctions: Object.keys(before).length, addedFunctions: ['remote-history', 'telemetry-export'],
  expectedActiveLayers: { functions: 15, gateway: 13 }, nextLayer: 16, deployed: false };
await writeFile(resolve(here, 'package-verification.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
