import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { classifyFailure, prepareBundle, validateLock } from './prepare.mjs';

const commit = 'a'.repeat(40);
const contents = Buffer.from('services:\n  example: {}\n');
const templateContents = {
  'compose.doso.yml': 'services: {}\n',
  Caddyfile: ':80 { respond "ready" }\n',
  'compose.host-nginx.yml': 'services:\n  api-gw:\n    ports: !override ["127.0.0.1:18000:8000/tcp"]\n',
  'nginx.doso.conf.example': 'server { listen 443 ssl; server_name api.doso.invalid; }\n',
};
function record(name = 'docker/docker-compose.yml', bytes = contents) {
  return { path: name, mode: '100644', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), gitBlobSha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') };
}
function lock(files = [record()]) { return { repository: 'supabase/supabase', commit, files }; }
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'doso-backend-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('doso-backend-test-'));
    await rm(root, { recursive: true, force: true });
  });
  const templateDir = path.join(root, 'templates');
  await mkdir(templateDir);
  for (const [name, text] of Object.entries(templateContents)) await writeFile(path.join(templateDir, name), text);
  return { root, templateDir, output: path.join(root, 'bundle') };
}
const successfulFetch = async () => new Response(contents);

test('prepares verified upstream bytes and overlays, with completion manifest last', async (t) => {
  const { templateDir, output } = await fixture(t);
  const executable = record('docker/scripts/example.sh');
  executable.mode = '100755';
  const requests = [];
  const manifest = await prepareBundle(lock([record(), executable]), output, { templateDir, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return new Response(contents);
  } });
  assert.deepEqual(await readFile(path.join(output, 'docker/docker-compose.yml')), contents);
  assert.equal(await readFile(path.join(output, 'docker/doso/compose.doso.yml'), 'utf8'), 'services: {}\n');
  assert.deepEqual(JSON.parse(await readFile(path.join(output, 'package-manifest.json'), 'utf8')), manifest);
  assert.equal(manifest.completed, true);
  assert.equal(manifest.credentialsGenerated, false);
  assert.equal(manifest.servicesStarted, false);
  assert.deepEqual(manifest.overlays, Object.entries(templateContents).map(([name, text]) => ({
    path: `docker/doso/${name}`, size: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'),
  })));
  for (const [name, text] of Object.entries(templateContents)) assert.equal(await readFile(path.join(output, 'docker/doso', name), 'utf8'), text);
  assert.equal(requests[0].url, `https://raw.githubusercontent.com/supabase/supabase/${commit}/docker/docker-compose.yml`);
  assert.equal(requests[0].options.redirect, 'error');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
  if (process.platform !== 'win32') assert.equal((await lstat(path.join(output, executable.path))).mode & 0o777, 0o755);
  assert.equal((await readdir(output)).includes('.env'), false);
  assert.equal((await readdir(output)).includes('package-manifest.pending.json'), false);
});

test('rejects bad size, sha256 and git blob hash without publishing success', async (t) => {
  for (const field of ['size', 'sha256', 'gitBlobSha']) {
    await t.test(field, async (t) => {
      const { templateDir, output } = await fixture(t);
      const entry = record();
      entry[field] = field === 'size' ? contents.length + 1 : '0'.repeat(field === 'sha256' ? 64 : 40);
      await assert.rejects(prepareBundle(lock([entry]), output, { templateDir, fetchImpl: successfulFetch }), /integrity_mismatch/);
      await assert.rejects(lstat(path.join(output, 'package-manifest.json')), { code: 'ENOENT' });
      assert.match(await readFile(path.join(output, 'PREPARATION_FAILED.txt'), 'utf8'), /incomplete/);
    });
  }
});

test('refuses HTTP redirects and errors, including followed redirects', async (t) => {
  for (const response of [new Response(null, { status: 302 }), new Response('no', { status: 500 }), { redirected: true, status: 200 }]) {
    const { templateDir, output } = await fixture(t);
    await assert.rejects(prepareBundle(lock(), output, { templateDir, fetchImpl: async () => response }), /response_rejected/);
    await assert.rejects(lstat(path.join(output, 'package-manifest.json')), { code: 'ENOENT' });
  }
});

test('caps advertised and streaming bodies before retaining oversized bytes', async (t) => {
  for (const advertised of [true, false]) {
    const { templateDir, output } = await fixture(t);
    let canceled = false;
    const response = advertised ? new Response(contents, { headers: { 'content-length': String(2 * 1024 * 1024 + 1) } }) : new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); },
      cancel() { canceled = true; },
    }));
    await assert.rejects(prepareBundle(lock(), output, { templateDir, fetchImpl: async () => response }), /too_large|size_mismatch/);
    if (!advertised) assert.equal(canceled, true);
  }
});

test('rejects traversal, real env, Windows aliases, reserved overlays and conflicting paths', () => {
  const unsafe = ['docker/../escape', '/docker/file', 'docker\\file', 'docker//file', 'docker/.env', 'docker/.env.local', 'docker/x/.ENV', 'docker/con.txt', 'docker/end.', 'docker/doso/Caddyfile', 'docker/a:b'];
  for (const name of unsafe) assert.throws(() => validateLock(lock([record(name)])), undefined, name);
  assert.throws(() => validateLock(lock([record('docker/A'), record('docker/a')])));
  assert.throws(() => validateLock(lock([record('docker/a'), record('docker/a/file')])));
  assert.doesNotThrow(() => validateLock(lock([record('docker/.env.example')])));
});

test('rejects non-official repositories, mutable revisions, symlink modes and unreasonable locks', () => {
  assert.throws(() => validateLock({ ...lock(), repository: 'other/repo' }));
  assert.throws(() => validateLock({ ...lock(), commit: 'master' }));
  assert.throws(() => validateLock(lock([{ ...record(), mode: '120000' }])));
  assert.throws(() => validateLock(lock(Array.from({ length: 151 }, (_, i) => record(`docker/${i}`)))));
  assert.throws(() => validateLock(lock([{ ...record(), size: 2 * 1024 * 1024 + 1 }])));
  assert.throws(() => validateLock(lock(Array.from({ length: 6 }, (_, i) => ({ ...record(`docker/${i}`), size: 2 * 1024 * 1024 })))));
});

test('refuses existing output without touching it or making network requests', async (t) => {
  const { templateDir, output } = await fixture(t);
  await mkdir(output);
  await writeFile(path.join(output, 'keep.txt'), 'user data');
  await assert.rejects(prepareBundle(lock(), output, { templateDir, fetchImpl: () => assert.fail('must not fetch') }), /already_exists/);
  assert.equal(await readFile(path.join(output, 'keep.txt'), 'utf8'), 'user data');
  assert.deepEqual(await readdir(output), ['keep.txt']);
});

test('refuses missing or symlink parent and symlink templates', async (t) => {
  const { root, templateDir } = await fixture(t);
  await assert.rejects(prepareBundle(lock(), path.join(root, 'missing', 'bundle'), { templateDir }), { code: 'ENOENT' });
  const link = path.join(root, 'linked-parent');
  try { await symlink(templateDir, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('symbolic links unavailable'); return; } throw error; }
  await assert.rejects(prepareBundle(lock(), path.join(link, 'bundle'), { templateDir }), /unsafe_directory/);
  await assert.rejects(prepareBundle(lock(), path.join(root, 'bundle'), { templateDir: link }), /unsafe_directory/);
  const linkedTemplates = path.join(root, 'linked-templates');
  await mkdir(linkedTemplates);
  await symlink(path.join(templateDir, 'compose.doso.yml'), path.join(linkedTemplates, 'compose.doso.yml'), 'file');
  for (const [name, text] of Object.entries(templateContents)) if (name !== 'compose.doso.yml') await writeFile(path.join(linkedTemplates, name), text);
  await assert.rejects(prepareBundle(lock(), path.join(root, 'bundle'), { templateDir: linkedTemplates }), /unsafe_overlay_template/);
});

test('missing host-Nginx templates fail before fetching or creating an output directory', async (t) => {
  for (const name of ['compose.host-nginx.yml', 'nginx.doso.conf.example']) {
    const { templateDir, output } = await fixture(t);
    await rm(path.join(templateDir, name));
    await assert.rejects(prepareBundle(lock(), output, { templateDir, fetchImpl: () => assert.fail('must not fetch') }), { code: 'ENOENT' });
    await assert.rejects(lstat(output), { code: 'ENOENT' });
  }
});

test('host Nginx exposes the same API allowlist as Caddy and keeps other endpoints private', async () => {
  const nginx = await readFile(new URL('./nginx.doso.conf.example', import.meta.url), 'utf8');
  const caddy = await readFile(new URL('./Caddyfile', import.meta.url), 'utf8');
  const nginxRoute = new RegExp(nginx.match(/location ~ (\S+) \{/)[1]);
  const caddyPaths = caddy.match(/@doso_api path ([^\r\n]+)/)[1].trim().split(/\s+/);
  const allowedByCaddy = (uri) => caddyPaths.some((pattern) => pattern.endsWith('*') ? uri.startsWith(pattern.slice(0, -1)) : uri === pattern);
  const allowed = ['/auth/v1/health', '/auth/v1/signup', '/rest/v1/robots', '/graphql/v1', '/realtime/v1/websocket', '/storage/v1/object/a', '/functions/v1/account-sessions', '/functions/v1/account-sessions/current'];
  const blocked = ['/', '/studio', '/mcp', '/functions/v1/hello', '/functions/v1/account-sessions-extra', '/graphql/v1/', '/auth/v1', '/rest/v1', '/realtime/v1', '/storage/v1'];
  for (const [uris, expected] of [[allowed, true], [blocked, false]]) for (const uri of uris) {
    assert.equal(nginxRoute.test(uri), expected, uri);
    assert.equal(allowedByCaddy(uri), expected, uri);
  }
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:18000;/);
  assert.match(nginx, /proxy_set_header Upgrade \$http_upgrade;/);
  assert.match(nginx, /proxy_set_header Connection \$doso_connection_upgrade;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-Proto \$scheme;/);
  assert.match(nginx, /proxy_set_header X-Forwarded-For \$remote_addr;/);
  assert.match(nginx, /proxy_set_header Sb-Forwarded-For \$remote_addr;/);
  assert.doesNotMatch(nginx, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
  assert.match(nginx, /location \/ \{\s*return 404;/);
});

test('login IP forwarding is enabled only through the reviewed proxy chain', async () => {
  const compose = await readFile(new URL('./compose.doso.yml', import.meta.url), 'utf8');
  const nginx = await readFile(new URL('./nginx.doso.conf.example', import.meta.url), 'utf8');
  assert.match(compose, /GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED:\s*"true"/);
  const proxyTemplates = [
    nginx,
    await readFile(new URL('./api-https-20261103/https.conf', import.meta.url), 'utf8'),
    await readFile(new URL('./device-admin-20261104/https.conf', import.meta.url), 'utf8'),
    await readFile(new URL('./video-access-20261106/https.conf', import.meta.url), 'utf8'),
    await readFile(new URL('./remote-history-20261109/https.conf', import.meta.url), 'utf8'),
  ];
  for (const template of proxyTemplates) {
    assert.match(template, /proxy_set_header Sb-Forwarded-For \$remote_addr;/);
    assert.match(template, /proxy_set_header X-Forwarded-For \$remote_addr;/);
    assert.doesNotMatch(template, /proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;/);
    assert.match(template, /proxy_pass http:\/\/127\.0\.0\.1:18000;/);
  }
});

test('host Nginx logs status diagnostics without authentication callback URLs or tokens', async () => {
  const nginx = await readFile(new URL('./nginx.doso.conf.example', import.meta.url), 'utf8');
  const format = nginx.match(/log_format doso_api_status escape=json ([^;]+);/)[1];
  assert.deepEqual(format.match(/\$[a-z_]+/g).sort(), ['$request_method', '$status', '$upstream_status', '$request_time'].sort());
  assert.doesNotMatch(format, /\$(?:request|request_uri|uri|args|query_string|arg_[a-z_]+|http_[a-z_]+|request_body|remote_addr)\b/);
  assert.match(nginx, /access_log \/var\/log\/nginx\/doso-api-access\.log doso_api_status;/);
  assert.equal((nginx.match(/\baccess_log\b/g) ?? []).length, 1);
  assert.match(nginx, /error_log \/dev\/null;/);
  assert.equal((nginx.match(/\berror_log\b/g) ?? []).length, 1);
});

test('a network failure leaves only an explicit incomplete directory', async (t) => {
  const { templateDir, output } = await fixture(t);
  await assert.rejects(prepareBundle(lock(), output, { templateDir, fetchImpl: async () => { throw new Error('network unavailable'); } }), /network unavailable/);
  assert.deepEqual(await readdir(output), ['PREPARATION_FAILED.txt']);
});

test('preserves zero-byte gitkeep files and verifies their Git blob identity', async (t) => {
  const { templateDir, output } = await fixture(t);
  const empty = Buffer.alloc(0);
  const entry = record('docker/volumes/storage/.gitkeep', empty);
  const manifest = await prepareBundle(lock([entry]), output, { templateDir, fetchImpl: async () => new Response(empty) });
  assert.equal((await readFile(path.join(output, entry.path))).length, 0);
  assert.equal(manifest.files[0].gitBlobSha, 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
});

test('CLI defaults to a read-only plan and rejects ambiguous output arguments', async (t) => {
  const { root } = await fixture(t);
  const tool = path.join(root, 'prepare.mjs');
  await writeFile(tool, await readFile(new URL('./prepare.mjs', import.meta.url)));
  await writeFile(path.join(root, 'upstream.lock.json'), JSON.stringify(lock()));
  const before = (await readdir(root)).sort();
  const plan = spawnSync(process.execPath, [tool], { encoding: 'utf8', timeout: 5000 });
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).action, 'plan_only');
  assert.equal(JSON.parse(plan.stdout).credentialsGenerated, false);
  assert.deepEqual((await readdir(root)).sort(), before);
  const invalid = spawnSync(process.execPath, [tool, '--output'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.deepEqual((await readdir(root)).sort(), before);
});

test('includes verified upstream LICENSE but refuses every other repository-root file', async (t) => {
  const { templateDir, output } = await fixture(t);
  const license = Buffer.from('Apache License\nVersion 2.0\n');
  await prepareBundle(lock([record('LICENSE', license)]), output, { templateDir, fetchImpl: async (url) => {
    assert.equal(url, `https://raw.githubusercontent.com/supabase/supabase/${commit}/LICENSE`);
    return new Response(license);
  } });
  assert.deepEqual(await readFile(path.join(output, 'LICENSE')), license);
  for (const name of ['README.md', 'license', './LICENSE', 'LICENSE/extra', '.env', 'package.json']) {
    assert.throws(() => validateLock(lock([record(name)])), /unsafe_source_path/, name);
  }
});

test('failure classification uses only fixed categories, including wrapped network errors', () => {
  for (const [code, expected] of [['ECONNRESET', 'network_reset'], ['ENOTFOUND', 'dns_error'], ['EAI_AGAIN', 'dns_error'], ['CERT_HAS_EXPIRED', 'tls_error'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls_error'], ['ETIMEDOUT', 'network_timeout']]) {
    const nested = new Error('private upstream details', { cause: Object.assign(new Error('private network path'), { code }) });
    assert.equal(classifyFailure(nested), expected);
  }
  assert.equal(classifyFailure(new DOMException('private timeout details', 'TimeoutError')), 'network_timeout');
  assert.equal(classifyFailure(new Error('https://user:private@example.test/private')), 'preparation_error');
});

test('CLI failures distinguish existing output and TLS reset without leaking exception details', async (t) => {
  const { root, templateDir, output } = await fixture(t);
  const tool = path.join(root, 'prepare.mjs');
  await writeFile(tool, await readFile(new URL('./prepare.mjs', import.meta.url)));
  await writeFile(path.join(root, 'upstream.lock.json'), JSON.stringify(lock()));
  for (const name of Object.keys(templateContents)) await writeFile(path.join(root, name), await readFile(path.join(templateDir, name)));
  await mkdir(output);
  const existing = spawnSync(process.execPath, [tool, '--output', output], { encoding: 'utf8', timeout: 5000 });
  assert.equal(existing.status, 1);
  assert.deepEqual(JSON.parse(existing.stderr), { action: 'preparation_failed', classification: 'output_already_exists' });
  const secret = 'DO_NOT_OUTPUT_PRIVATE_PROXY_OR_TOKEN';
  const preload = `data:text/javascript,${encodeURIComponent(`globalThis.fetch = async () => { throw new TypeError('${secret}', { cause: Object.assign(new Error('${secret}'), { code: 'ECONNRESET' }) }); };`)}`;
  const reset = spawnSync(process.execPath, ['--import', preload, tool, '--output', path.join(root, 'reset-bundle')], { encoding: 'utf8', timeout: 5000 });
  assert.equal(reset.status, 1);
  assert.deepEqual(JSON.parse(reset.stderr), { action: 'preparation_failed', classification: 'network_reset' });
  assert.equal(reset.stdout, '');
  assert.equal(reset.stderr.includes(secret), false);
  assert.equal(reset.stderr.includes(root), false);
  await assert.rejects(lstat(path.join(root, 'reset-bundle/package-manifest.json')), { code: 'ENOENT' });
});
