import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const historical = read('supabase/migrations/20260822185835_add_account_terminal_security.sql');
const outbox = read('supabase/migrations/20260825070607_add_account_email_outbox.sql');
const fixture = read('supabase/verification/local/auth_session_authority.fixture.sql');
const candidate = read('supabase/migrations/20261016155923_require_auth_session_authority.sql');

function definition(source, name) {
  const start = source.indexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const bodyStart = source.indexOf('as $$', start);
  assert.ok(bodyStart > start, `Missing body for ${name}`);
  const bodyEnd = source.indexOf('$$;', bodyStart + 5);
  assert.ok(bodyEnd > bodyStart, `Missing body end for ${name}`);
  return source.slice(start, bodyEnd + 3);
}

test('baseline fixture uses the actual historical authority function definitions', () => {
  for (const name of ['private.current_session_id', 'private.is_account_active', 'private.is_session_active']) {
    assert.equal(definition(fixture, name), definition(historical, name));
  }
});

test('candidate registration preserves the latest outbox function apart from the explicit Auth guard', () => {
  const registration = definition(candidate, 'public.register_account_terminal');
  const guard = "  if not private.is_current_auth_session_present() then\n"
    + "    raise exception using errcode = '42501', message = 'auth_session_inactive';\n"
    + '  end if;\n';
  assert.equal(registration.split(guard).length, 2, 'Exactly one Auth-only guard');
  assert.equal(registration.replace(guard, ''), definition(outbox, 'public.register_account_terminal'));
  assert.ok(registration.indexOf(guard) < registration.indexOf('insert into public.account_terminals'));
});

test('candidate keeps the Auth-only helper internal and limits existing entrypoint grants', () => {
  assert.match(candidate, /revoke all on function private\.is_current_auth_session_present\(\) from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(candidate, /grant\s+execute\s+on\s+function\s+private\.is_current_auth_session_present/i);
  assert.match(candidate, /grant execute on function private\.is_session_active\(\) to authenticated, service_role;/);
  assert.match(candidate, /grant execute on function public\.register_account_terminal\(text, text, text, text, text\) to authenticated;/);
  assert.doesNotMatch(candidate, /grant\s+[^;]*\bon\s+(?:table\s+)?auth\.sessions\b/i);
});
