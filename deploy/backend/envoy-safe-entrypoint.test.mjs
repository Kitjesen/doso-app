import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { constants } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import test from 'node:test';
import { renderListener, runEnvoy, writeListener } from './envoy-safe-entrypoint.mjs';

const upstream = new URL('../../artifacts/release-readiness/20261026-aliyun-server-inventory/host-overlay-validation/reviewed/candidate/docker/volumes/api/envoy/', import.meta.url);
const template = await readFile(new URL('lds.template.yaml', upstream), 'utf8');
const newNames = ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'ANON_KEY_ASYMMETRIC', 'SERVICE_ROLE_KEY_ASYMMETRIC'];
const names = ['ANON_KEY', 'SERVICE_ROLE_KEY', ...newNames, 'SUPABASE_PUBLIC_URL', 'DASHBOARD_BASIC_AUTH'];
const jsonPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function jwt(role, asymmetric = false) {
  const header = { alg: asymmetric ? 'ES256' : 'HS256', typ: 'JWT' };
  if (asymmetric) header.kid = '01234567-89ab-4cde-8fab-0123456789ab';
  return [jsonPart(header), jsonPart({ role, iss: 'supabase', iat: 1700000000, exp: 1900000000 }), Buffer.alloc(asymmetric ? 64 : 32, 7).toString('base64url')].join('.');
}
function opaque(prefix) {
  const value = prefix + 'A'.repeat(22);
  return value + '_' + createHash('sha256').update('supabase-self-hosted|' + value).digest('base64url').slice(0, 8);
}
const environment = {
  ANON_KEY: jwt('anon'), SERVICE_ROLE_KEY: jwt('service_role'),
  ANON_KEY_ASYMMETRIC: jwt('anon', true), SERVICE_ROLE_KEY_ASYMMETRIC: jwt('service_role', true),
  SUPABASE_PUBLISHABLE_KEY: opaque('sb_publishable_'), SUPABASE_SECRET_KEY: opaque('sb_secret_'),
  SUPABASE_PUBLIC_URL: 'https://api-test.dosorobotics.com',
  DASHBOARD_USERNAME: 'synthetic-admin', DASHBOARD_PASSWORD: 'synthetic-only-password',
};

test('the reviewed upstream entrypoint and template use exactly the eight approved substitutions', async () => {
  const placeholders = new Set([...template.matchAll(/\$\{([^}]*)\}/g)].map((match) => match[1]));
  assert.deepEqual([...placeholders].sort(), [...names].sort());
  const original = await readFile(new URL('docker-entrypoint.sh', upstream), 'utf8');
  for (const name of names) assert.ok(original.includes('${' + name + '}'));
  assert.equal(createHash('sha256').update(template).digest('hex'), 'f6b7e2c7a58abf54fe0f5eba6ad144c9f0d2a8c445ab66e05b298fb64bf6fa32');
});

test('only the approved placeholder bytes change; the routes and Lua stay identical', () => {
  const rendered = renderListener(template, environment);
  const expected = template.replace(/\$\{([^}]*)\}/g, (_match, name) => name === 'DASHBOARD_BASIC_AUTH'
    ? environment.DASHBOARD_USERNAME + ':{SHA}' + createHash('sha1').update(environment.DASHBOARD_PASSWORD).digest('base64')
    : environment[name]);
  assert.ok(rendered === expected, 'exact_upstream_substitution_without_secret_diff');
  assert.ok(!rendered.includes('${'));
  assert.ok(!rendered.includes(environment.DASHBOARD_PASSWORD));
  assert.ok(rendered.includes('inline_string: \'synthetic-admin:{SHA}'));
});

test('the upstream bootstrap and cluster health checks are left unchanged', async () => {
  const files = { 'envoy.yaml': '3697f23b0be9ec5b829f937c600eb9b878f1f778ab510b42ad5e4f14742447e9', 'cds.yaml': '1d7514b891370ed27c25911df008887402e16ab09273e6e433225bb7f09f7905' };
  for (const [name, hash] of Object.entries(files)) {
    const bytes = await readFile(new URL(name, upstream));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  }
});

test('all four optional new keys can be absent or empty, preserving legacy mode', () => {
  for (const empty of [undefined, '']) {
    const legacy = { ...environment };
    for (const name of newNames) legacy[name] = empty;
    const rendered = renderListener(template, legacy);
    assert.ok(rendered.includes('local SUPABASE_PUBLISHABLE_KEY = ""'));
    assert.ok(rendered.includes('local ANON_KEY_ASYMMETRIC = ""'));
    assert.ok(rendered.includes(environment.ANON_KEY));
  }
});

test('partial new-key quartets always fail without returning a rendered file', () => {
  for (let mask = 1; mask < 15; mask++) {
    const partial = { ...environment };
    newNames.forEach((name, index) => { if (!(mask & (1 << index))) delete partial[name]; });
    assert.throws(() => renderListener(template, partial), /^Error: invalid_envoy_configuration$/);
  }
});

test('unknown, missing, unterminated and unbraced placeholders fail closed', () => {
  for (const value of [template + '\n${UNKNOWN}', template + '\n${ANON_KEY', template + '\n$UNKNOWN', template.replaceAll('${ANON_KEY}', ''), template + '\0', 'x'.repeat(128 * 1024 + 1)]) {
    assert.throws(() => renderListener(value, environment), /^Error: invalid_envoy_configuration$/);
  }
});

test('JWT, opaque, origin and username reject quote, Lua, YAML, shell and control injection', () => {
  const malicious = ['x\nmalicious: yes', "x'", 'x"', 'x\\', 'x|', '${UNEXPECTED}', 'x;os.execute("id")', '$(id)', 'x\0', 'x\r', 'x\t'];
  for (const name of ['ANON_KEY', 'SERVICE_ROLE_KEY', ...newNames, 'SUPABASE_PUBLIC_URL', 'DASHBOARD_USERNAME']) {
    for (const value of malicious) assert.throws(() => renderListener(template, { ...environment, [name]: value }), /^Error: invalid_envoy_configuration$/);
  }
});

test('JWT length, canonical encoding, role, algorithm and signature structure are checked', () => {
  const parts = environment.ANON_KEY.split('.');
  const bad = ['', 'a.b.c', 'A'.repeat(4097), parts[0] + '=.' + parts[1] + '.' + parts[2], parts.slice(0, 2).join('.') + '.AA', jwt('service_role'), jwt('anon', true), jsonPart({ alg: 'HS256', typ: 'JWT' }) + '.' + jsonPart({ role: 'anon', iss: 'wrong', iat: 1, exp: 2 }) + '.' + parts[2]];
  for (const value of bad) assert.throws(() => renderListener(template, { ...environment, ANON_KEY: value }), /^Error: invalid_envoy_configuration$/);
  assert.throws(() => renderListener(template, { ...environment, ANON_KEY_ASYMMETRIC: jwt('service_role', true) }), /^Error: invalid_envoy_configuration$/);
});

test('opaque lengths and checksums, HTTPS origin structure, and credential bounds are checked', () => {
  for (const name of ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
    for (const value of ['', 'sb_secret_short', environment[name] + 'A', environment[name].slice(0, -1) + '!']) {
      assert.throws(() => renderListener(template, { ...environment, [name]: value }), /^Error: invalid_envoy_configuration$/);
    }
  }
  for (const value of ['http://api-test.dosorobotics.com', 'https://user:pass@example.test', 'https://example.test/', 'https://example.test/path', 'https://example.test?x=1', 'https://example.test#frag', 'https://a..test', 'https://' + 'a'.repeat(64) + '.test', 'https://' + 'a.'.repeat(130) + 'test']) {
    assert.throws(() => renderListener(template, { ...environment, SUPABASE_PUBLIC_URL: value }), /^Error: invalid_envoy_configuration$/);
  }
  for (const value of ['', 'x'.repeat(65), 'admin:other']) assert.throws(() => renderListener(template, { ...environment, DASHBOARD_USERNAME: value }), /^Error: invalid_envoy_configuration$/);
  for (const value of ['', 'short', ' '.repeat(16), 'x'.repeat(257), 'x'.repeat(16) + '\n']) assert.throws(() => renderListener(template, { ...environment, DASHBOARD_PASSWORD: value }), /^Error: invalid_envoy_configuration$/);
  assert.doesNotThrow(() => renderListener(template, { ...environment, DASHBOARD_USERNAME: 'a'.repeat(64), DASHBOARD_PASSWORD: 'x'.repeat(256) }));
});

test('basic auth uses htpasswd-compatible SHA1 of the raw password only inside Node', () => {
  const password = 'synthetic $ quotes\'" \\ & | ;';
  const rendered = renderListener(template, { ...environment, DASHBOARD_PASSWORD: password });
  const expected = 'synthetic-admin:{SHA}' + createHash('sha1').update(password, 'utf8').digest('base64');
  assert.ok(rendered.includes("inline_string: '" + expected + "'"));
  assert.ok(!rendered.includes(password));
});

function fakeIo(overrides = {}) {
  const operations = [];
  const file = {
    stat: async () => ({ isFile: () => true, uid: 1000, nlink: 1, mode: 0o100600 }),
    writeFile: async (...args) => { operations.push(['write', ...args]); },
    sync: async () => { operations.push(['sync']); },
    close: async () => { operations.push(['close']); },
  };
  const io = {
    lstat: async (name) => { operations.push(['lstat', name]); return { isDirectory: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o40700 }; },
    statfs: async (name) => { operations.push(['statfs', name]); return { type: 0x01021994 }; },
    open: async (...args) => { operations.push(['open', ...args]); return file; },
    ...overrides,
  };
  return { io, file, operations };
}

test('the sole output is exclusive nofollow rootless0600 lds.yaml on private tmpfs', async () => {
  const { io, operations } = fakeIo();
  await writeListener('synthetic-rendered-config', io);
  const opened = operations.find(([name]) => name === 'open');
  assert.equal(opened[1], '/etc/envoy/lds.yaml');
  assert.equal(opened[3], 0o600);
  assert.ok(opened[2] & constants.O_EXCL);
  assert.ok(opened[2] & constants.O_CREAT);
  if (constants.O_NOFOLLOW) assert.ok(opened[2] & constants.O_NOFOLLOW);
  assert.deepEqual(operations.slice(-3).map(([name]) => name), ['write', 'sync', 'close']);
  assert.equal(operations.filter(([name]) => name === 'open').length, 1);
});

test('non-tmpfs, wrong owner/mode, symlink and non-directory fail before file creation', async () => {
  const good = { isDirectory: () => true, isSymbolicLink: () => false, uid: 1000, mode: 0o40700 };
  for (const overrides of [{ statfs: async () => ({ type: 1 }) }, ...[{ uid: 0 }, { mode: 0o40755 }, { mode: 0o44700 }, { isSymbolicLink: () => true }, { isDirectory: () => false }].map((change) => ({ lstat: async () => ({ ...good, ...change }) }))]) {
    const { io, operations } = fakeIo(overrides);
    await assert.rejects(writeListener('synthetic', io), /^Error: invalid_envoy_configuration$/);
    assert.ok(!operations.some(([name]) => name === 'open'));
  }
});

test('newly opened output must still be a single-link private regular file owned by uid1000', async () => {
  const good = { isFile: () => true, uid: 1000, nlink: 1, mode: 0o100600 };
  for (const change of [{ isFile: () => false }, { uid: 0 }, { nlink: 2 }, { mode: 0o100644 }, { mode: 0o104600 }]) {
    const fixture = fakeIo();
    fixture.file.stat = async () => ({ ...good, ...change });
    await assert.rejects(writeListener('synthetic', fixture.io), /^Error: invalid_envoy_configuration$/);
    assert.ok(!fixture.operations.some(([name]) => name === 'write'));
    assert.equal(fixture.operations.at(-1)[0], 'close');
  }
});

test('existing files are never replaced and a write failure still closes the private descriptor', async () => {
  let fixture = fakeIo({ open: async () => { throw Object.assign(new Error('synthetic exists'), { code: 'EEXIST' }); } });
  await assert.rejects(writeListener('synthetic', fixture.io), { code: 'EEXIST' });
  fixture = fakeIo();
  fixture.file.writeFile = async () => { throw new Error('synthetic private failure'); };
  await assert.rejects(writeListener('synthetic', fixture.io));
  assert.equal(fixture.operations.at(-1)[0], 'close');
});

function childFixture(spawnError = false) {
  const runtime = new EventEmitter();
  let output = '';
  runtime.stdout = { write(value) { output += value; } };
  const child = new EventEmitter();
  child.kill = (signal) => { signals.push(signal); return true; };
  const signals = [];
  let invocation;
  const result = runEnvoy({ runtime, spawnImpl(...args) { invocation = args; if (spawnError) throw new Error('synthetic private error'); return child; } });
  return { runtime, child, signals, invocation, result, output: () => output };
}

test('child executable/argv are fixed, shell is disabled, and neither streams nor inherited secrets are exposed', async () => {
  const fixture = childFixture();
  const [binary, args, options] = fixture.invocation;
  assert.equal(binary, '/app/envoy');
  assert.deepEqual(args, ['-c', '/etc/envoy/envoy.yaml']);
  assert.deepEqual(options, { shell: false, stdio: 'ignore', cwd: '/etc/envoy', env: { LANG: 'C', LC_ALL: 'C' } });
  assert.ok(Object.values(environment).every((value) => !JSON.stringify(fixture.invocation).includes(value)));
  fixture.child.emit('close', 37, null);
  assert.equal(await fixture.result, 37);
  assert.equal(fixture.output(), '{"status":"envoy_candidate_starting"}\n{"status":"envoy_candidate_exited","code":37}\n');
  assert.equal(fixture.runtime.listenerCount('SIGTERM'), 0);
  assert.equal(fixture.runtime.listenerCount('SIGINT'), 0);
});

test('SIGTERM and SIGINT are forwarded to the child and its termination status is retained', async () => {
  for (const signal of ['SIGTERM', 'SIGINT']) {
    const fixture = childFixture();
    fixture.runtime.emit(signal);
    assert.deepEqual(fixture.signals, [signal]);
    fixture.child.emit('close', null, signal);
    assert.equal(await fixture.result, 128 + osConstants.signals[signal]);
  }
});

test('spawn failures and unknown exit states report only fixed status, exactly once', async () => {
  let fixture = childFixture(true);
  assert.equal(await fixture.result, 1);
  assert.ok(!fixture.output().includes('private'));
  fixture = childFixture();
  fixture.child.emit('error', new Error('synthetic private error'));
  fixture.child.emit('close', -1, null);
  assert.equal(await fixture.result, 1);
  assert.equal(fixture.output().split('\n').filter(Boolean).length, 2);
  assert.ok(!fixture.output().includes('private'));
  fixture = childFixture();
  fixture.child.emit('close', null, '__proto__');
  assert.equal(await fixture.result, 1);
});

test('candidate packaging copies only the two reviewed public files and never claims original OCI identity', async () => {
  const dockerfile = await readFile(new URL('./Dockerfile.envoy-candidate', import.meta.url), 'utf8');
  assert.match(dockerfile, /FROM public\.ecr\.aws\/supabase\/postgres-meta@sha256:822227a8d12c109b24b8d8f1dae98a9c089a698b4586d35527dadf929e655136/);
  assert.equal((dockerfile.match(/^COPY /gm) ?? []).length, 2);
  assert.match(dockerfile, /COPY envoy \/app\/envoy/);
  assert.match(dockerfile, /COPY envoy-safe-entrypoint\.mjs \/app\/envoy-safe-entrypoint\.mjs/);
  assert.match(dockerfile, /USER 1000:1000/);
  assert.match(dockerfile, /Candidate packaging, not the original Envoy OCI image/);
  assert.doesNotMatch(dockerfile, /^\s*(?:RUN|ADD|ARG|ENV|VOLUME)\s/m);
});
