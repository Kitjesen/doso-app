import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFile(resolve(root, path), 'utf8');
const [migration, worker, core, config, runbook, sessions, packageJson, gate] =
  await Promise.all([
    read('supabase/migrations/20260825070607_add_account_email_outbox.sql'),
    read('supabase/functions/account-email-worker/index.ts'),
    read('supabase/functions/account-email-worker/workerCore.ts'),
    read('supabase/config.toml'),
    read('docs/runbooks/ACCOUNT_EMAIL_OUTBOX_DEPLOYMENT.md'),
    read('supabase/functions/account-sessions/index.ts'),
    read('package.json'),
    read('scripts/verify-release-gate.mjs'),
  ]);

const checks = [];
function check(name, condition) {
  checks.push([name, Boolean(condition)]);
}

check('feature defaults off', /\('new_device_login',\s*false/.test(migration));
check('runtime excludes deletion table', !/create table public\.account_deletion_requests/.test(migration));
check('dispatch state exists', /'dispatching'/.test(migration));
check('unknown state exists', /'delivery_unknown'/.test(migration));
check('accepted is not called delivered', /'accepted'/.test(migration) && !/'delivered'/.test(migration));
check('claim is one row', /create function public\.claim_account_email\(p_worker_id uuid\)/.test(migration) && /limit 1/.test(migration));
check('claim requires enabled feature', /where f\.kind=o\.kind and f\.enabled/.test(migration));
check('dispatch rechecks enabled feature', /begin_account_email_dispatch[\s\S]*?where f\.kind=account_email_outbox\.kind and f\.enabled/.test(migration));
check('lease is server constant', /interval '90 seconds'/.test(migration) && !/p_lease_seconds/.test(migration));
check('dispatch expiry is unknown', /dispatch_lease_expired/.test(migration));
check('manual retry warns duplicate', /manual_retry_duplicate_possible/.test(migration) && /possibleDuplicate/.test(migration));
check('manual retry has one final allowance', /manual_retry_allowance/.test(migration) && /manual_retry_count<1/.test(migration));
check('PII cleanup defaults 30 days', /interval '30 days'/.test(migration) && /status in\('accepted','dead','delivery_unknown'\)/.test(migration) && /user_id=null,recipient_email='\[redacted\]'/.test(migration) && /last_error_code=null,last_error_summary=null/.test(migration));
check('payload excludes duplicated email', !/jsonb_build_object\([^;]*'account_email'\s*,/s.test(migration));
check('audit stores installation digest only', /'installationDigest',v_installation_digest/.test(migration)
  && !/'installationId'\s*,/.test(migration));
check('dedupe has database uniqueness', /unique \(kind, dedupe_digest\)/.test(migration));
check('session installation identity is stable', /on conflict\(auth_session_id\) do update[\s\S]*?set platform=excluded\.platform/.test(migration)
  && !/on conflict\(auth_session_id\) do update[\s\S]*?set installation_id=excluded\.installation_id/.test(migration));
check('new-install email has a serialized user rate limit', /pg_advisory_xact_lock/.test(migration)
  && /created_at>=now\(\)-interval '24 hours'/.test(migration)
  && /v_recent_email_count>=3/.test(migration)
  && /'rate_limited'/.test(migration));
check('terminal register owns enqueue', /create or replace function public\.register_account_terminal/.test(migration));
check('edge removed second enqueue', !/enqueue_new_device_login/.test(sessions));
check('edge removed second register audit', !/action:\s*"terminal\.register"/.test(sessions));
check('worker platform JWT disabled', /\[functions\.account-email-worker\]\s*\r?\nverify_jwt = false/.test(config));
check('worker uses named secret apikey', /SUPABASE_SECRET_KEYS/.test(core) && /headers\.get\("apikey"\)/.test(core));
check('worker rejects custom ad-hoc secret header', !/x-doso-worker-secret/i.test(worker + core));
check('provider config precedes claim', core.indexOf('ALIYUN_DM_ACCESS_KEY_ID') < core.indexOf('"claim_account_email"'));
check('provider timeout is 15 seconds', /PROVIDER_TIMEOUT_MS = 15_000/.test(core));
check('worker budget is 45 seconds', /WORKER_WALL_BUDGET_MS = 45_000/.test(core));
check('runbook uses Vault', /vault\.create_secret/.test(runbook) && /vault\.decrypted_secrets/.test(runbook));
check('runbook installs and removes Cron', /cron\.schedule/.test(runbook) && /cron\.unschedule/.test(runbook));
check('runbook documents rollback order', /flag off.*unschedule.*dispatching.*snapshot.*forward-fix/is.test(runbook));
check('runbook documents no provider idempotency key', /没有业务幂等键/.test(runbook));
check('runbook contains no literal secret', !/sb_secret_[A-Za-z0-9_-]{12,}/.test(runbook));

const pkg = JSON.parse(packageJson);
for (const script of ['test:functions', 'test:db', 'test:config', 'test:account-email-ops', 'email:check']) {
  check(`package script ${script}`, typeof pkg.scripts?.[script] === 'string');
  check(`release gate ${script}`, gate.includes(`'${script}'`));
}

for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
}
const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  console.error(`${failed.length} account-email operational contract check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`PASS ${checks.length}/${checks.length} account-email operational contract checks.`);
}
