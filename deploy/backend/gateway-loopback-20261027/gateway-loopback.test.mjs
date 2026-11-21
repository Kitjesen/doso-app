import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse, parseDocument } from 'yaml';
import { renderListener } from '../envoy-safe-entrypoint.mjs';

const here = new URL('./', import.meta.url);
const upstream = new URL('../../../artifacts/release-readiness/20261026-aliyun-server-inventory/host-overlay-validation/reviewed/candidate/docker/volumes/api/envoy/', here);
const read = (name) => readFile(new URL(name, here), 'utf8');
const manifest = JSON.parse(await read('manifest.json'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const template = await read('lds.template.yaml');
const sourceTemplate = await readFile(new URL('lds.template.yaml', upstream), 'utf8');
const listener = parse(template).resources[0].filter_chains[0].filters[0].typed_config;
const sourceListener = parse(sourceTemplate).resources[0].filter_chains[0].filters[0].typed_config;
const routes = listener.route_config.virtual_hosts[0].routes;
const sourceRoutes = sourceListener.route_config.virtual_hosts[0].routes;
const document = parseDocument(await read('compose.gateway-loopback.yml'));
const service = document.toJS().services['api-gw'];

test('source pins, wrapper and every public runtime file match their recorded identities', async () => {
  for (const [name, hash] of Object.entries(manifest.source_sha256)) {
    assert.equal(sha(await readFile(new URL(name, upstream))), hash);
  }
  assert.equal(sha(await readFile(new URL('../envoy-safe-entrypoint.mjs', here))), manifest.wrapper_sha256);
  for (const [name, record] of Object.entries(manifest.files)) {
    const bytes = await readFile(new URL(name, here));
    assert.equal(bytes.length, record.bytes);
    assert.equal(sha(bytes), record.sha256);
  }
});

test('Auth and REST routes preserve upstream key enforcement and order; other routes are closed', () => {
  const expected = sourceRoutes.filter((route) => route.route?.cluster === 'auth'
    || (route.route?.cluster === 'rest' && (route.match.path ?? route.match.prefix) === '/rest/v1/'));
  assert.equal(expected.length, 12);
  assert.deepEqual(routes.slice(0, -1), expected);
  assert.deepEqual(listener.http_filters, sourceListener.http_filters);
  assert.equal(template.slice(template.indexOf('              http_filters:')), sourceTemplate.slice(sourceTemplate.indexOf('              http_filters:')));
  const fallback = routes.at(-1);
  assert.deepEqual(fallback.match, { prefix: '/' });
  assert.deepEqual(fallback.direct_response, { status: 404 });
  assert.equal(fallback.route, undefined);
  assert.equal(fallback.typed_per_filter_config['envoy.filters.http.basic_auth'].disabled, true);
  const policies = fallback.typed_per_filter_config['envoy.filters.http.rbac'].rbac.rules;
  assert.equal(policies.action, 'ALLOW');
  assert.deepEqual(policies.policies.unavailable, { permissions: [{ any: true }], principals: [{ any: true }] });
  assert.ok(routes.slice(0, -1).every((route) => ['auth', 'rest'].includes(route.route.cluster)));
});

test('only the unchanged Auth and REST clusters remain, and the bootstrap stays identical', async () => {
  const source = parse(await readFile(new URL('cds.yaml', upstream), 'utf8'));
  const reduced = parse(await read('cds.yaml'));
  assert.deepEqual(reduced.resources, source.resources.filter((cluster) => ['auth', 'rest'].includes(cluster.name)));
  assert.deepEqual(reduced.resources.map((cluster) => cluster.name), ['auth', 'rest']);
  assert.equal(await read('envoy.yaml'), await readFile(new URL('envoy.yaml', upstream), 'utf8'));
});

test('Compose replaces the inherited shell entrypoint and Studio dependency without new public access', () => {
  assert.equal(document.errors.length, 0);
  assert.equal(document.warnings.length, 3);
  assert.ok(document.warnings.every((warning) => warning.code === 'TAG_RESOLVE_FAILED'));
  for (const field of ['depends_on', 'ports', 'volumes']) {
    assert.equal(document.getIn(['services', 'api-gw', field], true).tag, '!override');
  }
  assert.equal(service.image, manifest.candidate_image_id);
  assert.equal(service.pull_policy, 'never');
  assert.deepEqual(service.entrypoint, ['node', '/app/envoy-safe-entrypoint.mjs']);
  assert.deepEqual(service.command, []);
  assert.deepEqual(service.depends_on, { auth: { condition: 'service_healthy' }, rest: { condition: 'service_healthy' } });
  assert.deepEqual(service.ports, ['127.0.0.1:18000:8000/tcp']);
  assert.equal(service.user, '1000:1000');
  assert.equal(service.read_only, true);
  assert.deepEqual(service.cap_drop, ['ALL']);
  assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
  assert.deepEqual(service.logging, { driver: 'none' });
  assert.deepEqual(service.ulimits.core, { soft: 0, hard: 0 });
  assert.equal(service.mem_limit, '512m');
  assert.equal(service.memswap_limit, '512m');
  assert.equal(service.pids_limit, 64);
  assert.ok(service.tmpfs.includes('/etc/envoy:rw,noexec,nosuid,nodev,size=8388608,uid=1000,gid=1000,mode=0700'));
  assert.equal(service.volumes.length, 4);
  assert.deepEqual(service.volumes.map((mount) => mount.target).sort(), ['/app/validate-config.mjs', '/etc/envoy/cds.yaml', '/etc/envoy/envoy.yaml', '/etc/envoy/lds.template.yaml']);
  for (const mount of service.volumes) {
    assert.equal(mount.type, 'bind');
    assert.ok(/^\.\/doso\/gateway-loopback-20261027\/[A-Za-z.-]+$/.test(mount.source));
    assert.equal(mount.read_only, true);
    assert.deepEqual(mount.bind, { create_host_path: false });
  }
});

test('the gateway has a bounded native Node TCP health check, independent of shell utilities', () => {
  assert.deepEqual(service.healthcheck.test.slice(0, 3), ['CMD', 'node', '-e']);
  assert.ok(service.healthcheck.test[3].includes("connect(8000,'127.0.0.1')"));
  assert.ok(service.healthcheck.test[3].includes('setTimeout(1000'));
  assert.equal(service.healthcheck.timeout, '3s');
});

test('the reduced listener still supports the reviewed renderer without real credentials', () => {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwt = (role) => [part({ alg: 'HS256', typ: 'JWT' }), part({ role, iss: 'supabase', iat: 1700000000, exp: 1900000000 }), Buffer.alloc(32, 7).toString('base64url')].join('.');
  const rendered = renderListener(template, {
    ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role'),
    SUPABASE_PUBLIC_URL: 'https://api-test.dosorobotics.com',
    DASHBOARD_USERNAME: 'synthetic-admin', DASHBOARD_PASSWORD: 'synthetic-only-password',
  });
  assert.ok(!rendered.includes('${'));
  assert.ok(!rendered.includes('synthetic-only-password'));
  assert.ok(rendered.includes('name: doso-unavailable'));
  assert.equal(parse(rendered).resources[0].name, 'supabase');
});

test('the validation helper suppresses diagnostics and reports bootstrap validation limits', async () => {
  const source = await read('validate-config.mjs');
  const check = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('validate-config.mjs', here))], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr);
  assert.ok(source.includes("await writeListener(renderListener(template, process.env))"));
  assert.ok(source.includes("['--mode', 'validate', '-c', '/etc/envoy/envoy.yaml']"));
  assert.ok(source.includes("stdio: 'pipe'"));
  assert.ok(source.includes('timeout: 15000'));
  assert.ok(source.includes('"dynamic_routes_verified":false'));
  assert.ok(!/console\.(?:error|log)|result\.(?:stdout|stderr)/.test(source));
});
