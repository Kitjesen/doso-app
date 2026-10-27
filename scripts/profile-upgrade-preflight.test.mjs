import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function preflight(...flags) {
  const result = spawnSync(process.execPath, [
    'scripts/verify-username-upgrade.mjs', '--preflight-only', ...flags,
  ], { cwd: root, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(result.stdout, /PASS (?:start isolated|reset and seed|apply release-tail|run post-upgrade pgTAP)/);
  return result.stdout.split(/\r?\n/)
    .filter((line) => line.startsWith('PREFLIGHT PLAN '))
    .map((line) => JSON.parse(line.slice('PREFLIGHT PLAN '.length)));
}

test('profile upgrade preflight stages both security candidates after the outbox boundary', () => {
  const plans = preflight('--profile-editing-only');
  assert.equal(plans.length, 1, 'preflight must expose the actual staged migration identities');
  assert.equal(plans[0].scenario, 'profileediting');
  assert.equal(plans[0].initialCutoff, '20260827070734');
  assert.deepEqual(plans[0].releaseTailMigrations, [
    '20261012090000_add_profile_editing.sql',
    '20261016155923_require_auth_session_authority.sql',
  ]);
  assert.deepEqual(plans[0].stagedTailMigrations, plans[0].releaseTailMigrations);
  assert.equal(plans[0].databaseStarted, false);
});

test('default username upgrade preflights retain their historical boundaries', () => {
  const plans = preflight();
  assert.deepEqual(plans.map((plan) => plan.scenario), ['corrective', 'fullrelease']);
  assert.deepEqual(plans.map((plan) => plan.initialCutoff), ['20260824090000', '20260823111035']);
  for (const plan of plans) {
    assert.deepEqual(plan.releaseTailMigrations, [
      '20260824100000_add_username_provenance.sql',
      '20260824101000_canonicalize_login_method_contract.sql',
      '20260824102000_harden_audit_log_privileges.sql',
    ]);
    assert.deepEqual(plan.stagedTailMigrations, plan.releaseTailMigrations);
    assert.equal(plan.databaseStarted, false);
  }
});
