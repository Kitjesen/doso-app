import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: here, encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) throw new Error(`Packaging step failed: ${command}`);
  return result.stdout;
}
run(process.execPath, [resolve(here, 'prepare.mjs')]);
run(process.execPath, [resolve(here, 'verify.mjs')]);
const archive = resolve(here, 'device-cloud-20261103.tar.gz');
const files = ['compose.device-cloud.yml', 'lds.template.yaml', 'cds.yaml', 'deploy.py', 'deploy-database.py', 'README.md', 'functions', 'sql'];
run('tar', ['-czf', archive, ...files]);
const entries = run('tar', ['-tzf', archive]).split(/\r?\n/).filter(Boolean);
for (const name of ['deploy-database.py', 'sql/apply.sql', 'sql/postflight.sql', 'sql/20261103140000_add_device_authorization_epoch.sql', 'sql/20261103150000_add_remote_state.sql', 'sql/20261103170000_allow_multiple_owned_devices.sql', 'sql/20261104090000_claim_device_by_uuid.sql', 'functions/main/index.ts', 'functions/account-sessions/index.ts', 'functions/device-binding/index.ts', 'functions/remote-state/index.ts', 'functions/remote-state-sync/index.ts', 'functions/_shared/robotIngress.ts', 'functions/_shared/deviceBinding.ts']) {
  if (!entries.includes(name)) throw new Error(`Archive missing ${name}`);
}
console.log(`Prepared upload archive with generated functions: ${archive}`);
