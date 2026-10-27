import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const EXPECTED_APP_VERSION = '0.0.1';

const requiredFiles = [
  'app.json',
  'package.json',
  'package-lock.json',
  '.env.example',
  'README.md',
  'docs/CURRENT_RELEASE_STATUS.md',
  'docs/APP_ROBOT_LIFECYCLE_PRD.md',
  'docs/PRODUCTION_VERIFICATION_MATRIX.md',
  'docs/ROBOT_LIFECYCLE_TDD.md',
  'docs/NETWORK_BACKEND.md',
  'docs/SOCIAL_AUTH.md',
  'src/domain/device-protocol/index.ts',
  'src/domain/device-provisioning/index.ts',
  'src/domain/device-safety/index.ts',
  'src/domain/firmware-lifecycle/index.ts',
  'src/features/robot-lifecycle/robotDiagnosticsGateway.ts',
  'src/features/robot-lifecycle/robotDiagnosticsPanel.tsx',
  'src/features/robot-lifecycle/provisioningGateway.ts',
  'src/features/robot-lifecycle/firmwareUpdateGateway.ts',
  'src/screens/ProvisioningScreen.tsx',
  'src/screens/FirmwareUpdateScreen.tsx',
  'src/services/sessionService.ts',
  'src/services/socialAuthService.ts',
  'src/services/socialAuthService.native.ts',
  'iot/simulator/provisioning-simulator.ts',
  'iot/simulator/firmware-lifecycle-simulator.ts',
  'iot/simulator/g008-command-delivery-simulator.ts',
  'scripts/verify-robot-provisioning.mts',
  'scripts/verify-g008-command-delivery.mts',
  'scripts/verify-g008-diagnostic-ui.mts',
  'scripts/verify-robot-simulator.mjs',
  'scripts/verify-firmware-lifecycle.mts',
  'scripts/verify-provisioning-ui.mts',
  'scripts/verify-firmware-update-ui.mts',
  'scripts/verify-robot-lifecycle-ui.mjs',
  'scripts/verify-trusted-device-data-ui.mjs',
  'scripts/verify-release-gate.mjs',
  'supabase/migrations/20260823130000_add_one_time_username_claim.sql',
  'supabase/migrations/20260824090000_add_external_identity_registry.sql',
];

const [
  packageJson,
  packageLock,
  appJson,
  envExample,
  readme,
  releaseStatus,
  matrix,
  networkBackend,
  sessionService,
  androidGradle,
  releaseGateScript,
] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('app.json'),
  readText('.env.example'),
  readText('README.md'),
  readText('docs/CURRENT_RELEASE_STATUS.md'),
  readText('docs/PRODUCTION_VERIFICATION_MATRIX.md'),
  readText('docs/NETWORK_BACKEND.md'),
  readText('src/services/sessionService.ts'),
  readOptionalText('android/app/build.gradle'),
  readText('scripts/verify-release-gate.mjs'),
]);

const checks = [
  ['required production files exist', verifyRequiredFiles],
  ['application versions are consistent', verifyVersions],
  ['robot delivery priorities are explicit', verifyRobotPriorities],
  ['example social-provider flags default to disabled', verifyProviderDefaults],
  ['production matrix scenarios have stable unique IDs', verifyStableScenarioIds],
  ['production matrix includes every priority level', verifyPriorityCoverage],
  ['production matrix scenarios declare executable evidence contracts', verifyScenarioContracts],
  ['production matrix covers required release areas', verifyRequiredCoverage],
  ['release gate executes every required validation step', verifyReleaseGate],
  ['BLOCKED and EXCLUDED release rules are explicit', verifyDispositionRules],
];

for (const [name, verify] of checks) {
  await verify();
  console.log(`PASS ${name}`);
}

console.log(`DOSO production baseline PASS (${checks.length} checks, offline/no secrets)`);

async function verifyRequiredFiles() {
  for (const path of requiredFiles) await access(new URL(path, root));
}

function verifyVersions() {
  const packageVersion = requiredVersion(packageJson.version, 'package.json version');
  const expoVersion = requiredVersion(appJson.expo?.version, 'app.json expo.version');
  const publicVersion = requiredEnvValue(envExample, 'EXPO_PUBLIC_APP_VERSION');
  const networkGuideVersion = requiredEnvValue(networkBackend, 'EXPO_PUBLIC_APP_VERSION');
  assert.equal(packageVersion, EXPECTED_APP_VERSION, 'current client version must remain at the pre-release 0.0.1 baseline');
  assert.equal(packageLock.version, packageVersion, 'package-lock root version must equal package version');
  assert.equal(packageLock.packages?.['']?.version, packageVersion, 'package-lock workspace version must equal package version');
  assert.equal(expoVersion, packageVersion, 'Expo version must equal package version');
  assert.equal(publicVersion, packageVersion, 'EXPO_PUBLIC_APP_VERSION must equal package version');
  assert.equal(networkGuideVersion, packageVersion, 'NETWORK_BACKEND EXPO_PUBLIC_APP_VERSION example must equal package version');
  assert.match(readme, /当前源码版本为 `0\.0\.1`/, 'README must identify 0.0.1 as the current source version');
  assert.match(releaseStatus, /^# DOSO 0\.0\.1 当前发布状态$/m, 'release status title must identify 0.0.1');
  assert.match(sessionService, /EXPO_PUBLIC_APP_VERSION\?\.trim\(\) \|\| '0\.0\.1'/, 'terminal registration fallback must use 0.0.1');

  const androidVersionCode = appJson.expo?.android?.versionCode;
  const iosBuildNumber = Number(appJson.expo?.ios?.buildNumber);
  assert.ok(Number.isInteger(androidVersionCode) && androidVersionCode > 0, 'Android versionCode must remain a positive build counter');
  assert.ok(Number.isInteger(iosBuildNumber) && iosBuildNumber > 0, 'iOS buildNumber must remain a positive build counter');

  if (androidGradle) {
    const gradleVersion = androidGradle.match(/versionName\s+["']([^"']+)["']/)?.[1];
    assert.ok(gradleVersion, 'generated android/app/build.gradle must declare versionName when present');
    assert.equal(gradleVersion, packageVersion, 'generated Android versionName must equal package version');
  }
}

function verifyRobotPriorities() {
  const scenarios = new Map(parseScenarios(matrix).map((scenario) => [scenario.id, scenario]));
  const provisioning = scenarios.get('ROBOT-PROVISION-001');
  const firmware = scenarios.get('ROBOT-FIRMWARE-001');
  assert.ok(provisioning, 'matrix must include ROBOT-PROVISION-001');
  assert.ok(firmware, 'matrix must include ROBOT-FIRMWARE-001');
  assert.equal(inlineCodeValue(field(provisioning.body, 'Priority')), 'P0', 'secure provisioning must be P0');
  assert.equal(inlineCodeValue(field(firmware.body, 'Priority')), 'P0', 'firmware lifecycle must be P0');
  assert.match(field(provisioning.body, 'Command'), /npm run test:robot-provisioning/, 'provisioning must name its future contract test');
  assert.match(field(firmware.body, 'Command'), /npm run test:firmware-lifecycle/, 'firmware lifecycle must name its future contract test');
  assert.equal(packageJson.scripts?.['test:robot-provisioning'], 'node --experimental-strip-types scripts/verify-robot-provisioning.mts', 'package scripts must execute the provisioning contract');
  assert.equal(packageJson.scripts?.['test:g008-command-delivery'], 'node --experimental-strip-types scripts/verify-g008-command-delivery.mts', 'package scripts must execute the G008 command-delivery contract');
  assert.equal(packageJson.scripts?.['test:g008-diagnostic-ui'], 'node --experimental-strip-types scripts/verify-g008-diagnostic-ui.mts', 'package scripts must execute the G008 diagnostic UI contract');
  assert.equal(packageJson.scripts?.['test:robot-simulator'], 'node --experimental-strip-types scripts/verify-robot-simulator.mjs', 'package scripts must expose the canonical robot simulator gate');
  assert.equal(packageJson.scripts?.['test:firmware-lifecycle'], 'node --experimental-strip-types scripts/verify-firmware-lifecycle.mts', 'package scripts must execute the firmware lifecycle contract');
  assert.equal(packageJson.scripts?.['test:provisioning-ui'], 'node --experimental-strip-types scripts/verify-provisioning-ui.mts', 'package scripts must execute the provisioning UI contract');
  assert.equal(packageJson.scripts?.['test:firmware-update-ui'], 'node --experimental-strip-types scripts/verify-firmware-update-ui.mts', 'package scripts must execute the firmware UI contract');
  assert.equal(packageJson.scripts?.['test:robot-lifecycle-ui'], 'node scripts/verify-robot-lifecycle-ui.mjs', 'package scripts must execute the lifecycle navigation guard');
  assert.equal(packageJson.scripts?.['test:trusted-device-data-ui'], 'node scripts/verify-trusted-device-data-ui.mjs', 'package scripts must reject invented device telemetry');
  assert.match(field(provisioning.body, 'BLOCKED'), /尚未实现/, 'provisioning must remain explicitly BLOCKED until implemented');
  assert.match(field(firmware.body, 'BLOCKED'), /尚未实现/, 'firmware lifecycle must remain explicitly BLOCKED until implemented');
  assert.match(releaseStatus, /1\. \*\*蓝牙\/Wi-Fi 安全配网\*\*/, 'release status must place secure provisioning first');
  assert.match(releaseStatus, /2\. \*\*固件升级与回滚\*\*/, 'release status must place firmware lifecycle second');
}

function verifyProviderDefaults() {
  for (const variable of [
    'EXPO_PUBLIC_APPLE_AUTH_ENABLED',
    'EXPO_PUBLIC_WECHAT_AUTH_ENABLED',
    'EXPO_PUBLIC_QQ_AUTH_ENABLED',
  ]) {
    assert.equal(requiredEnvValue(envExample, variable), 'false', `${variable} must default to false in .env.example`);
  }
}

function verifyStableScenarioIds() {
  const scenarios = parseScenarios(matrix);
  assert.ok(scenarios.length >= 12, 'matrix must contain at least 12 executable scenarios');
  const ids = scenarios.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, 'scenario IDs must be unique');
  for (const id of ids) {
    assert.match(id, /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}$/, `${id} must use a stable AREA-NAME-001 ID`);
  }
}

function verifyPriorityCoverage() {
  const priorities = new Set(parseScenarios(matrix).map(({ body }) => inlineCodeValue(field(body, 'Priority'))));
  assert.deepEqual(priorities, new Set(['P0', 'P1', 'P2']), 'matrix must deliberately classify P0, P1 and P2 scenarios');
}

function verifyScenarioContracts() {
  const allowedEnvironments = new Set([
    'local-offline',
    'local-supabase',
    'hosted-staging',
    'production-canary',
    'ios-device',
    'android-device',
    'robot-simulator',
  ]);

  for (const { id, body } of parseScenarios(matrix)) {
    assert.match(inlineCodeValue(field(body, 'Priority')), /^P[0-2]$/, `${id} must declare P0, P1 or P2`);
    const environmentField = field(body, 'Environment');
    const environments = [...environmentField.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    assert.ok(environments.length > 0, `${id} must declare at least one environment`);
    assert.ok(environments.every((environment) => allowedEnvironments.has(environment)), `${id} has an unknown environment`);
    assert.ok(field(body, 'Command').length > 2, `${id} must declare an exact command`);
    assert.match(field(body, 'Evidence'), new RegExp(`artifacts/production-verification/<run-id>/${escapeRegExp(id)}/`), `${id} evidence must use its stable directory`);
    assert.ok(field(body, 'PASS').length > 10, `${id} must define a meaningful PASS rule`);
    assert.ok(field(body, 'FAIL').length > 10, `${id} must define a meaningful FAIL rule`);
    assert.ok(field(body, 'BLOCKED').length > 5, `${id} must define a BLOCKED rule`);
  }
}

function verifyRequiredCoverage() {
  const ids = new Set(parseScenarios(matrix).map(({ id }) => id));
  for (const id of [
    'DB-RPC-001',
    'DB-RPC-002',
    'AUTH-APPLE-A-001',
    'AUTH-APPLE-B-001',
    'AUTH-APPLE-C-001',
    'AUTH-AUTHING-A-001',
    'AUTH-AUTHING-B-001',
    'AUTH-IDENTITY-001',
    'SMTP-001',
    'SIGN-ANDROID-001',
    'SIGN-IOS-001',
    'ROBOT-PROVISION-001',
    'ROBOT-FIRMWARE-001',
    'ROBOT-SIM-GATE-001',
    'RELEASE-GATE-001',
  ]) assert.ok(ids.has(id), `matrix must include ${id}`);

  assert.match(field(parseScenarios(matrix).find(({ id }) => id === 'ROBOT-PROVISION-001').body, 'Command'), /npm run test:robot-provisioning/, 'provisioning gate must name the contract test command');
  assert.match(field(parseScenarios(matrix).find(({ id }) => id === 'ROBOT-FIRMWARE-001').body, 'Command'), /npm run test:firmware-lifecycle/, 'firmware gate must name the contract test command');
  assert.match(field(parseScenarios(matrix).find(({ id }) => id === 'ROBOT-SIM-GATE-001').body, 'Command'), /npm run test:robot-simulator/, 'robot gate must name the contract test command');
  for (const id of ['DB-RPC-002', 'AUTH-IDENTITY-001']) {
    const scenario = parseScenarios(matrix).find((candidate) => candidate.id === id);
    assert.match(field(scenario.body, 'Command'), /npm run test:identity-hosted/, `${id} must require the real hosted identity integration command`);
    assert.match(field(scenario.body, 'BLOCKED'), /test:identity-hosted[\s\S]*必须记 `BLOCKED`/, `${id} must stay BLOCKED until the hosted identity test exists`);
  }
}

function verifyReleaseGate() {
  assert.equal(packageJson.scripts?.['test:release-gate'], 'node scripts/verify-release-gate.mjs', 'package scripts must expose the executable release gate');

  const releaseGateScenario = parseScenarios(matrix).find(({ id }) => id === 'RELEASE-GATE-001');
  assert.equal(inlineCodeValue(field(releaseGateScenario.body, 'Command')), 'npm run test:release-gate', 'release matrix must invoke the complete executable gate');

  const requiredSteps = [
    'test:production-baseline',
    'test:auth-ui',
    'test:email-otp',
    'test:account-flow-screens',
    'test:otp-errors',
    'test:robot-simulator',
    'test:firmware-lifecycle',
    'test:provisioning-ui',
    'test:firmware-update-ui',
    'test:robot-lifecycle-ui',
    'test:trusted-device-data-ui',
    'typecheck',
  ];
  let previousIndex = -1;
  for (const step of requiredSteps) {
    const index = releaseGateScript.indexOf(`'${step}'`);
    assert.ok(index > previousIndex, `release gate must execute ${step} in the required order`);
    previousIndex = index;
  }
  assert.match(releaseGateScript, /spawnSync\(/, 'release gate must execute child processes synchronously');
  assert.match(releaseGateScript, /process\.exitCode\s*=\s*result\.status/, 'release gate must propagate a failing child exit status');
  assert.match(releaseGateScript, /DESIGN_AUDIT_EXTERNAL_RUNTIME_STEPS = new Set\(\['test:db'\]\)/, 'design audit may defer only the Docker-backed local database step');
  assert.match(releaseGateScript, /designAudit && DESIGN_AUDIT_EXTERNAL_RUNTIME_STEPS\.has\(step\)/, 'design audit must scope its external-runtime deferral explicitly');
}

function verifyDispositionRules() {
  assert.match(matrix, /P0 有任一 `FAIL` 或 `BLOCKED` 时禁止上线/, 'P0 blocked/failure release rule must be explicit');
  assert.match(matrix, /`BLOCKED`：仅用于外部审批/, 'BLOCKED eligibility must be explicit');
  assert.match(matrix, /`EXCLUDED`：仅用于本次发布目标客观不适用/, 'EXCLUDED eligibility must be explicit');
  assert.match(matrix, /不能用来跳过失败测试/, 'EXCLUDED must never mask failure');
}

function parseScenarios(source) {
  const matches = [...source.matchAll(/^## ([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d{3}) — .+$/gm)];
  return matches.map((match, index) => ({
    id: match[1],
    body: source.slice(match.index + match[0].length, matches[index + 1]?.index ?? source.length),
  }));
}

function field(body, name) {
  const value = body.match(new RegExp(`^- ${name}: (.+)$`, 'm'))?.[1];
  assert.ok(value, `scenario must declare ${name}`);
  return value.trim();
}

function inlineCodeValue(value) {
  return value.match(/^`([^`]+)`$/)?.[1] ?? value;
}

function requiredEnvValue(source, name) {
  const value = source.match(new RegExp(`^${name}=([^\\r\\n]*)$`, 'm'))?.[1]?.trim();
  assert.ok(value, `.env.example must declare ${name}`);
  return value;
}

function requiredVersion(value, label) {
  assert.match(value ?? '', /^\d+\.\d+\.\d+$/, `${label} must use semver`);
  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

function readText(path) {
  return readFile(new URL(path, root), 'utf8');
}

async function readOptionalText(path) {
  try {
    return await readText(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}
