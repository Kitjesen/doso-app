import { spawnSync } from 'node:child_process';

const DESIGN_AUDIT_FLAG = '--design-audit';
const unknownArguments = process.argv.slice(2).filter((argument) => argument !== DESIGN_AUDIT_FLAG);
if (unknownArguments.length > 0) throw new Error(`Unknown release gate argument: ${unknownArguments.join(', ')}`);
const designAudit = process.argv.includes(DESIGN_AUDIT_FLAG);
const DESIGN_AUDIT_EXTERNAL_RUNTIME_STEPS = new Set(['test:db']);

const RELEASE_GATE_STEPS = Object.freeze([
  'test:production-baseline',
  'test:release-gate-core',
  'test:apple-auth-core',
  'test:apple-display-name-recovery',
  'test:authing-broker',
  'test:authing-oidc-verifier',
  'test:social-auth',
  'test:auth-errors',
  'test:auth-request-fetch',
  'test:app-font',
  'test:nav',
  'test:otp-errors',
  'test:robot-simulator',
  'test:robot-capability-readiness',
  'test:robot-command-executor',
  'test:robot-transport-contract',
  'test:firmware-lifecycle',
  'test:provisioning-ui',
  'test:firmware-update-ui',
  'test:ble-discovery',
  'test:wifi-discovery',
  'test:brainstem-readiness',
  'test:control-state',
  'test:profile-upgrade-preflight',
  'test:control-ui',
  'email:check',
  'test:functions',
  'test:db',
  'test:robot-ingress-contract',
  'test:robot-command-worker-contract',
  'test:robot-operations-observability',
  'test:config',
  'test:account-email-ops',
  'typecheck',
]);

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run the release gate through npm so npm_execpath is available.');

for (const step of RELEASE_GATE_STEPS) {
  if (designAudit && DESIGN_AUDIT_EXTERNAL_RUNTIME_STEPS.has(step)) {
    console.log(`\nDESIGN AUDIT SCOPE: npm run ${step} remains enforced by the full release gate`);
    continue;
  }
  console.log(`\nRELEASE GATE: npm run ${step}`);
  const result = spawnSync(process.execPath, [npmCli, 'run', step], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!process.exitCode) {
  if (designAudit) {
    console.log('\nPAGE RELEASE AUDIT PASS — GLOBAL 20-PAGE DESIGN COMPLETION STILL REQUIRED; GATT AUTH / WIFI PROVISIONING / REAL CONTROL BLOCKED');
  } else {
    console.log('\nSIMULATED/OFFLINE CONTRACTS + BLE DISCOVERY CODE GATE PASS — GATT AUTH / WIFI PROVISIONING / REAL CONTROL BLOCKED');
  }
}
