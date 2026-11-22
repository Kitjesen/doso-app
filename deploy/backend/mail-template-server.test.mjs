import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createTemplateHandler } from './mail-template-server.mjs';

const confirmation = await readFile(new URL('../../supabase/templates/confirmation.html', import.meta.url));
const templateHash = createHash('sha256').update(confirmation).digest('hex');
const handler = createTemplateHandler(confirmation);

function dispatch(method, url) {
  const result = {};
  handler({ method, url }, {
    writeHead(status, headers) { result.status = status; result.headers = headers; },
    end(body) { result.body = body; },
  });
  return result;
}

test('GET serves the existing confirmation bytes without rendering the OTP', () => {
  const result = dispatch('GET', '/confirmation.html');
  assert.equal(result.status, 200);
  assert.equal(result.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(result.headers['Content-Length'], confirmation.length);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(result.headers.Connection, 'close');
  assert.equal(createHash('sha256').update(result.body).digest('hex'), templateHash);
  assert.ok(result.body.includes('{{ .Token }}'));
  assert.ok(!result.body.includes('ConfirmationURL'));
});

test('HEAD has the same template headers and no response body', () => {
  const get = dispatch('GET', '/confirmation.html');
  const head = dispatch('HEAD', '/confirmation.html');
  assert.equal(head.status, 200);
  assert.deepEqual(head.headers, get.headers);
  assert.equal(head.body, undefined);
});

test('unknown, encoded, traversal and proxy targets never return template bytes', () => {
  for (const url of ['/', '/recovery.html', '/.env', '/confirmation.html?x=1', '/confirmation.html/', '/CONFIRMATION.html', '/%63onfirmation.html', '/../confirmation.html', '/x/../confirmation.html', '/%2e%2e/confirmation.html', '/..%2fconfirmation.html', '/..\\confirmation.html', '//confirmation.html', 'http://mail-templates:8080/confirmation.html', 'http://example.test/', '/confirmation.html\0']) {
    for (const method of ['GET', 'HEAD']) {
      const result = dispatch(method, url);
      assert.equal(result.status, 404, `${method} whitelist`);
      assert.equal(result.headers['Content-Length'], 0);
      assert.equal(result.body, undefined);
    }
  }
});

test('methods other than GET and HEAD cannot post data or retrieve the template', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT']) {
    const result = dispatch(method, '/confirmation.html');
    assert.equal(result.status, 405);
    assert.equal(result.headers.Allow, 'GET, HEAD');
    assert.equal(result.body, undefined);
  }
});

test('missing OTP, link-based, empty and oversized templates fail before serving', () => {
  for (const template of ['', '<html>no OTP</html>', '{{ .Token }} {{ .ConfirmationURL }}', '{{ .Token }}' + 'x'.repeat(64 * 1024)]) {
    assert.throws(() => createTemplateHandler(template), /^Error: invalid_confirmation_template$/);
  }
});

test('the served snapshot cannot be changed by mutating the caller buffer', () => {
  const bytes = Buffer.from('{{ .Token }} synthetic');
  const isolated = createTemplateHandler(bytes);
  bytes.fill(0);
  let served;
  isolated({ method: 'GET', url: '/confirmation.html' }, { writeHead() {}, end(body) { served = body; } });
  assert.ok(served.includes('{{ .Token }}'));
});

test('the overlay pins the offline image and isolates the fixed template mounts', async () => {
  const compose = await readFile(new URL('./compose.mail-templates.yml', import.meta.url), 'utf8');
  assert.match(compose, /image: public\.ecr\.aws\/supabase\/postgres-meta@sha256:822227a8d12c109b24b8d8f1dae98a9c089a698b4586d35527dadf929e655136/);
  assert.match(compose, /pull_policy: never/);
  assert.match(compose, /GOTRUE_MAILER_TEMPLATES_CONFIRMATION: http:\/\/mail-templates:8080\/confirmation\.html/);
  assert.match(compose, /mail-templates:\s+condition: service_healthy/);
  assert.match(compose, /user: "65532:65532"/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop: \[ALL\]/);
  assert.match(compose, /security_opt: \[no-new-privileges:true\]/);
  assert.match(compose, /logging:\s+driver: none/);
  assert.match(compose, /mem_limit: 64m/);
  assert.match(compose, /cpus: 0\.25/);
  assert.match(compose, /pids_limit: 32/);
  assert.equal((compose.match(/source: /g) ?? []).length, 2);
  for (const name of ['mail-template-server.mjs', 'confirmation.html']) {
    assert.ok(compose.includes(`source: ./doso/${name}\n        target: /app/${name}\n        read_only: true\n        bind:\n          create_host_path: false`));
  }
  assert.doesNotMatch(compose, /^\s*(?:ports|env_file):/m);
  assert.doesNotMatch(compose, /SMTP_PASS|JWT_|POSTGRES_|docker\.sock/);
});
