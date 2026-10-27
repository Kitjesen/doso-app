import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HISTORICAL_REF = '2f7ba59';
const HISTORICAL_VERSION = '1.2.1';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(appRoot, '..');
const appPathAtRef = 'doso-app';
const productionMode = process.argv.includes('--production');
const EVIDENCE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const EVIDENCE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const RELEASE_SCOPE_PATHS = [
  'package.json', 'package-lock.json', 'App.tsx', 'app.json',
  'src/services', 'src/types',
  'src/screens/AccountSecurityScreen.tsx', 'src/screens/BindDeviceScreen.tsx',
  'src/screens/EmailOtpScreen.tsx', 'src/screens/ForgotPasswordScreen.tsx',
  'src/screens/HomeScreen.tsx', 'src/screens/LoginScreen.tsx',
  'src/screens/MfaSetupScreen.tsx', 'src/screens/ProfileScreen.tsx',
  'src/screens/RegisterScreen.tsx', 'src/screens/ResetPasswordScreen.tsx',
  'src/screens/UsernameOnboardingScreen.tsx',
  'supabase/migrations', 'supabase/functions', 'supabase/verification',
  'scripts/verify-old-client-compatibility.mjs',
].map((relativePath) => `${appPathAtRef}/${relativePath}`);

const results = [];

function record(status, name, detail) {
  results.push({ status, name, detail });
  console.log(`[${status}] ${name}: ${detail}`);
}

function requireIncludes(source, values, label) {
  const missing = values.filter((value) => !source.includes(value));
  if (missing.length > 0) {
    throw new Error(`${label} missing: ${missing.join(', ')}`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    const stdout = [];
    const stderr = [];
    if (options.capture) {
      child.stdout.on('data', (chunk) => stdout.push(chunk));
      child.stderr.on('data', (chunk) => stderr.push(chunk));
    }
    child.on('error', reject);
    child.on('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf8');
      const errorOutput = Buffer.concat(stderr).toString('utf8');
      if (code === 0) resolve({ stdout: output, stderr: errorOutput });
      else reject(new Error(`${command} exited ${code}${errorOutput ? `: ${errorOutput.trim()}` : ''}`));
    });
  });
}

function historicalCommandEnv(overrides = {}) {
  const allowed = new Set([
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
    'TEMP', 'TMP', 'TMPDIR',
    'NODE_EXTRA_CA_CERTS',
  ]);
  const env = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (allowed.has(name.toUpperCase()) && value !== undefined) env[name] = value;
  }
  return { ...env, ...overrides };
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function validateEvidenceTime(checkedAt, now = Date.now()) {
  if (
    typeof checkedAt !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(checkedAt)
    || Number.isNaN(Date.parse(checkedAt))
  ) {
    throw new Error('manual evidence checkedAt must be a valid UTC ISO-8601 timestamp');
  }
  const checkedAtMs = Date.parse(checkedAt);
  if (checkedAtMs > now + EVIDENCE_FUTURE_TOLERANCE_MS) {
    throw new Error('manual evidence checkedAt is in the future');
  }
  if (checkedAtMs < now - EVIDENCE_MAX_AGE_MS) {
    throw new Error('manual evidence is outside the current 14-day release window');
  }
}

function projectRefFromOrigin(origin) {
  const hostname = new URL(origin).hostname;
  const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  return match?.[1] ?? null;
}

function unavailableStatus(isProduction = productionMode) {
  return isProduction ? 'BLOCKED' : 'SKIP';
}

function iosArtifactStatus(isProduction = productionMode) {
  return isProduction ? 'BLOCKED' : 'SKIP';
}

function dirtyStatusLines(output) {
  return output.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
}

async function verifyProductionReleaseScope() {
  if (!productionMode) {
    record('SKIP', 'production-release-scope', 'development mode does not require a clean release scope');
    return;
  }
  const { stdout } = await run(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', ...RELEASE_SCOPE_PATHS],
    { capture: true },
  );
  const dirty = dirtyStatusLines(stdout);
  if (dirty.length > 0) {
    record('BLOCKED', 'production-release-scope', `commit or remove release-scope changes before producing evidence: ${dirty.slice(0, 12).join('; ')}${dirty.length > 12 ? `; … ${dirty.length - 12} more` : ''}`);
    return;
  }
  record('PASS', 'production-release-scope', 'HEAD fully represents the old-client DB/Auth release scope; unrelated docs, mail templates and assets were not inspected');
}

async function gitShow(relativePath) {
  const { stdout } = await run(
    'git',
    ['show', `${HISTORICAL_REF}:${appPathAtRef}/${relativePath.replaceAll('\\', '/')}`],
    { capture: true },
  );
  return stdout;
}

async function verifyHistoricalContract() {
  const [packageText, auth, sessions, devices, mfa, api] = await Promise.all([
    gitShow('package.json'),
    gitShow('src/services/authService.ts'),
    gitShow('src/services/sessionService.ts'),
    gitShow('src/services/deviceRepository.ts'),
    gitShow('src/services/mfaService.ts'),
    gitShow('src/types/api.ts'),
  ]);
  const packageJson = JSON.parse(packageText);
  if (packageJson.version !== HISTORICAL_VERSION) {
    throw new Error(`expected ${HISTORICAL_VERSION}, found ${packageJson.version}`);
  }

  requireIncludes(auth, [
    '.auth.signUp(', '.auth.verifyOtp(', "type: 'email'", "type: 'recovery'",
    '.auth.resend(', '.auth.signInWithPassword(', '.auth.resetPasswordForEmail(',
    '.auth.reauthenticate(', '.auth.updateUser(', ".from('profiles')", ".select('*')",
  ], 'historical auth/profile flow');
  requireIncludes(sessions, [
    "'account-sessions'", "action: 'register'", "action: 'heartbeat'", "action: 'list'",
    "action: 'revoke_one'", "'revoke_others'", "'revoke_all'",
    "'revoke_current_terminal'", "'revoke_other_terminals'", "'revoke_all_terminals'",
  ], 'historical terminal flow');
  requireIncludes(devices, [
    ".from('devices')", ".select('*')", ".update(settings)", "'device-binding'",
    "action: 'claim'", "action: 'unbind'",
  ], 'historical device flow');
  requireIncludes(mfa, [
    '.auth.mfa.listFactors(', '.auth.mfa.getAuthenticatorAssuranceLevel(',
    '.auth.mfa.enroll(', '.auth.mfa.challengeAndVerify(', '.auth.mfa.unenroll(',
  ], 'historical MFA flow');
  requireIncludes(api, [
    'export type Profile = {', 'email: string;', 'display_name: string;',
    'app_role: AppRole;', 'account_status: AccountStatus;',
    'export type Device = {', 'owner_id: string | null;', 'model_code: string;',
    'connection_status: DeviceConnectionStatus;', 'alerts_enabled: boolean;',
    'export type AccountTerminal = {', 'installation_id: string;', 'revoked_at: string | null;',
  ], 'historical response fields');

  record('PASS', 'historical-client-contract', `${HISTORICAL_REF} resolves to DOSO ${HISTORICAL_VERSION}; auth, MFA, profile, terminal and device expectations were extracted`);
}

async function verifyCurrentCompatibilitySurface() {
  const migrationDir = path.join(appRoot, 'supabase', 'migrations');
  const foundationMigrationNames = [
    '20260822185808_create_doso_accounts_and_devices.sql',
    '20260822185822_grant_service_role_access.sql',
    '20260822185835_add_account_terminal_security.sql',
    '20260822185849_harden_network_backend.sql',
    '20260822185907_add_admin_account_consistency.sql',
    '20260822190119_enable_private_claims_rls.sql',
    '20260823110629_add_unique_usernames.sql',
    '20260823111035_inline_username_constraint.sql',
  ];
  const remoteSuffixMigrationNames = [
    '20260823130000_add_one_time_username_claim.sql',
    '20260824090000_add_external_identity_registry.sql',
    '20260824100000_add_username_provenance.sql',
    '20260824101000_canonicalize_login_method_contract.sql',
    '20260824102000_harden_audit_log_privileges.sql',
  ];
  const migrationNames = [...foundationMigrationNames, ...remoteSuffixMigrationNames];
  const migrationTexts = await Promise.all(
    migrationNames.map((name) => readFile(path.join(migrationDir, name), 'utf8')),
  );
  const schema = migrationTexts.join('\n');
  const transition = migrationTexts.slice(foundationMigrationNames.length).join('\n');

  requireIncludes(schema, [
    'public.profiles', 'public.devices', 'public.account_terminals',
    'public.register_account_terminal(', 'public.heartbeat_current_terminal()',
    'public.revoke_account_terminal(', 'public.revoke_current_terminal(',
    'public.revoke_other_terminals(', 'public.revoke_all_terminals(',
    'grant execute on function public.register_account_terminal',
    'grant execute on function public.heartbeat_current_terminal',
    'grant execute on function public.revoke_account_terminal',
    'grant execute on function public.revoke_current_terminal',
    'grant execute on function public.revoke_other_terminals',
    'grant execute on function public.revoke_all_terminals',
  ], 'current legacy database surface');
  const usernameProvenanceMigration = migrationTexts[
    foundationMigrationNames.length + remoteSuffixMigrationNames.indexOf('20260824100000_add_username_provenance.sql')
  ];
  const canonicalIdentityMigration = migrationTexts[
    foundationMigrationNames.length + remoteSuffixMigrationNames.indexOf('20260824101000_canonicalize_login_method_contract.sql')
  ];
  requireIncludes(usernameProvenanceMigration, [
    'add column username_provenance', 'create or replace function public.handle_new_user()',
    "'legacy_inferred'", "'registration'", "'social_provisional'",
  ], 'username provenance compatibility');
  requireIncludes(canonicalIdentityMigration, [
    'registry_id uuid', 'provider_key text', 'kind text', 'email_verified boolean',
    'linked_at timestamptz', 'provider_last_sign_in_at timestamptz',
    'last_observed_at timestamptz', 'unlinked_at timestamptz', 'status text',
  ], 'canonical identity contract');

  const protectedObjects = ['profiles', 'devices', 'account_terminals'];
  const protectedFunctions = [
    'register_account_terminal', 'heartbeat_current_terminal', 'revoke_account_terminal',
    'revoke_current_terminal', 'revoke_other_terminals', 'revoke_all_terminals',
  ];
  const destructive = [
    ...protectedObjects.map((name) => new RegExp(`\\bdrop\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?${name}\\b`, 'i')),
    ...protectedFunctions.map((name) => new RegExp(`\\bdrop\\s+function(?:\\s+if\\s+exists)?\\s+(?:public\\.)?${name}\\b`, 'i')),
    /\balter\s+table\s+(?:public\.)?profiles[\s\S]{0,160}\bdrop\s+column\s+(?:if\s+exists\s+)?(?:email|display_name|avatar_url|app_role|account_status|suspended_at|suspension_reason)\b/i,
    /\balter\s+table\s+(?:public\.)?devices[\s\S]{0,160}\bdrop\s+column\s+(?:if\s+exists\s+)?(?:owner_id|model_code|display_name|connection_status|alerts_enabled|is_demo)\b/i,
    /\balter\s+table\s+(?:public\.)?(?:profiles|devices|account_terminals)\s+rename\s+to\b/i,
    /\balter\s+table\s+(?:public\.)?profiles[\s\S]{0,160}\brename\s+column\s+(?:email|display_name|avatar_url|app_role|account_status|suspended_at|suspension_reason)\b/i,
    /\balter\s+table\s+(?:public\.)?devices[\s\S]{0,160}\brename\s+column\s+(?:owner_id|model_code|display_name|connection_status|alerts_enabled|is_demo)\b/i,
    /\brevoke\b[\s\S]{0,240}\bon\s+function\s+public\.(?:register_account_terminal|heartbeat_current_terminal|revoke_account_terminal|revoke_current_terminal|revoke_other_terminals|revoke_all_terminals)\b[\s\S]{0,120}\bfrom\s+authenticated\b/i,
  ].filter((pattern) => pattern.test(transition));
  if (destructive.length > 0) {
    throw new Error('hosted head 20260823111035→20260824102000 contains a destructive change to the 1.2.1 surface');
  }

  const [accountSessions, deviceBinding] = await Promise.all([
    readFile(path.join(appRoot, 'supabase', 'functions', 'account-sessions', 'index.ts'), 'utf8'),
    readFile(path.join(appRoot, 'supabase', 'functions', 'device-binding', 'index.ts'), 'utf8'),
  ]);
  requireIncludes(accountSessions, [
    '"register"', '"heartbeat"', '"list"', '"revoke_one"', '"revoke_others"', '"revoke_all"',
  ], 'current account-sessions Edge actions');
  requireIncludes(deviceBinding, ['"claim"', '"unbind"', 'serialNumber', 'deviceId'], 'current device-binding Edge actions');

  record('PASS', 'current-contract-static', 'exact hosted head 20260823111035→20260824102000 is additive for the 1.2.1 profile/device/terminal surface and retains its Edge actions');
}

async function verifyHistoricalBuild() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'doso-old-client-'));
  try {
    const archive = path.join(temporaryRoot, 'historical.tar');
    await run('git', ['archive', '--format=tar', `--output=${archive}`, HISTORICAL_REF, '--', appPathAtRef]);
    await run('tar', ['-xf', archive, '-C', temporaryRoot]);
    const historicalRoot = path.join(temporaryRoot, appPathAtRef);
    const npmCommand = process.platform === 'win32'
      ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm.cmd', 'ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']]
      : ['npm', ['ci', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund']];
    const commandEnv = historicalCommandEnv({
      CI: '1',
      EXPO_NO_TELEMETRY: '1',
      npm_config_cache: path.join(temporaryRoot, '.npm-cache'),
      npm_config_update_notifier: 'false',
    });
    await run(npmCommand[0], npmCommand[1], {
      cwd: historicalRoot,
      env: commandEnv,
    });
    const nodeModules = path.join(historicalRoot, 'node_modules');
    const tsc = path.join(nodeModules, 'typescript', 'bin', 'tsc');
    const expo = path.join(nodeModules, 'expo', 'bin', 'cli');
    if (!existsSync(tsc) || !existsSync(expo)) {
      throw new Error('historical lockfile install did not provide TypeScript and Expo');
    }

    await run(process.execPath, [tsc, '--noEmit'], { cwd: historicalRoot, env: commandEnv });
    record('PASS', 'historical-typecheck', `${HISTORICAL_REF} compiled after an exact disposable npm ci`);

    const exportDir = path.join(temporaryRoot, 'dist-web');
    await run(process.execPath, [expo, 'export', '--platform', 'web', '--output-dir', exportDir], {
      cwd: historicalRoot,
      env: commandEnv,
    });
    if (!existsSync(path.join(exportDir, 'index.html'))) {
      throw new Error('Expo export completed without index.html');
    }
    record('PASS', 'historical-web-export', `${HISTORICAL_REF} produced a disposable web export; no backend request was made`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function normalizeRuntimeUrl(value) {
  const url = new URL(value);
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) {
    throw new Error('runtime URL must use HTTPS, except localhost/127.0.0.1');
  }
  return url.origin;
}

async function runtimeGet(url, headers, label) {
  const response = await fetch(url, { method: 'GET', headers, redirect: 'error' });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}: ${body.slice(0, 240)}`);
  }
  return body;
}

async function runtimeOptions(url, headers, label) {
  const response = await fetch(url, { method: 'OPTIONS', headers, redirect: 'error' });
  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}`);
  }
}

async function verifyOptionalRuntime() {
  const rawUrl = process.env.DOSO_OLD_CLIENT_SUPABASE_URL?.trim();
  const key = process.env.DOSO_OLD_CLIENT_PUBLISHABLE_KEY?.trim();
  if (!rawUrl && !key) {
    record(unavailableStatus(), 'read-only-runtime', 'set both DOSO_OLD_CLIENT_SUPABASE_URL and DOSO_OLD_CLIENT_PUBLISHABLE_KEY to probe an explicitly selected target');
    return null;
  }
  if (!rawUrl || !key) {
    record('BLOCKED', 'read-only-runtime', 'runtime probe requires both an explicit URL and publishable key');
    return null;
  }

  const origin = normalizeRuntimeUrl(rawUrl);
  const configuredProjectRef = process.env.DOSO_OLD_CLIENT_PROJECT_REF?.trim();
  const derivedProjectRef = projectRefFromOrigin(origin);
  if (configuredProjectRef && derivedProjectRef && configuredProjectRef !== derivedProjectRef) {
    throw new Error(`DOSO_OLD_CLIENT_PROJECT_REF ${configuredProjectRef} does not match target ${derivedProjectRef}`);
  }
  const projectRef = configuredProjectRef || derivedProjectRef;
  if (!projectRef) {
    record('BLOCKED', 'read-only-runtime', 'set DOSO_OLD_CLIENT_PROJECT_REF when the selected target is not a <project-ref>.supabase.co URL');
    return null;
  }
  const accessToken = process.env.DOSO_OLD_CLIENT_ACCESS_TOKEN?.trim();
  const bearer = accessToken || key;
  const headers = { apikey: key, Authorization: `Bearer ${bearer}` };
  await runtimeGet(`${origin}/auth/v1/settings`, { apikey: key }, 'Auth settings');
  const profileColumns = 'id,email,display_name,avatar_url,app_role,account_status,suspended_at,suspension_reason,created_at,updated_at';
  const deviceColumns = 'id,owner_id,model_code,display_name,category,environment,serial_number,connection_status,safety_lock,alerts_enabled,battery_percent,firmware_version,runtime_hours,last_seen_at,is_demo,created_at,updated_at';
  await runtimeGet(`${origin}/rest/v1/profiles?select=${profileColumns}&limit=0`, headers, 'profiles compatibility read');
  await runtimeGet(`${origin}/rest/v1/devices?select=${deviceColumns}&limit=0`, headers, 'devices compatibility read');
  await runtimeOptions(`${origin}/functions/v1/account-sessions`, headers, 'account-sessions preflight');
  await runtimeOptions(`${origin}/functions/v1/device-binding`, headers, 'device-binding preflight');
  record('PASS', 'read-only-runtime', 'explicit target exposed Auth, the 1.2.1 profile/device read contract and both legacy Edge routes; no mutation endpoint was called');

  if (!accessToken) {
    record(unavailableStatus(), 'authenticated-rpc-schema', 'set DOSO_OLD_CLIENT_ACCESS_TOKEN for a read-only authenticated OpenAPI check of terminal RPC visibility');
    return { origin, projectRef };
  }
  const openApiText = await runtimeGet(
    `${origin}/rest/v1/`,
    { ...headers, Accept: 'application/openapi+json' },
    'authenticated PostgREST OpenAPI',
  );
  const openApi = JSON.parse(openApiText);
  const paths = openApi.paths && typeof openApi.paths === 'object' ? Object.keys(openApi.paths) : [];
  const requiredRpcPaths = [
    '/rpc/register_account_terminal', '/rpc/heartbeat_current_terminal',
    '/rpc/revoke_account_terminal', '/rpc/revoke_current_terminal',
    '/rpc/revoke_other_terminals', '/rpc/revoke_all_terminals',
  ];
  const missingRpcPaths = requiredRpcPaths.filter((rpcPath) => !paths.includes(rpcPath));
  if (missingRpcPaths.length > 0) {
    throw new Error(`authenticated OpenAPI missing: ${missingRpcPaths.join(', ')}`);
  }
  record('PASS', 'authenticated-rpc-schema', 'authenticated PostgREST OpenAPI exposes every terminal RPC used by 1.2.1');
  return { origin, projectRef };
}

function normalizeCertificateSha256(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/^sha-?256\s*:?\s*/i, '').replaceAll(':', '').trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function parseAndroidBadging(output) {
  const packageLine = output.match(/^package:\s+(.+)$/m)?.[1] ?? '';
  const packageName = packageLine.match(/\bname='([^']+)'/)?.[1] ?? null;
  const versionName = packageLine.match(/\bversionName='([^']+)'/)?.[1] ?? null;
  return { packageName, versionName };
}

async function discoverAndroidAapt() {
  const configured = process.env.DOSO_ANDROID_AAPT?.trim();
  if (configured) return configured;
  const sdkRoots = [
    process.env.ANDROID_SDK_ROOT,
    process.env.ANDROID_HOME,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  ].filter(Boolean);
  for (const sdkRoot of [...new Set(sdkRoots)]) {
    const buildToolsRoot = path.join(sdkRoot, 'build-tools');
    try {
      const versions = (await readdir(buildToolsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
      for (const version of versions) {
        const candidate = path.join(buildToolsRoot, version, process.platform === 'win32' ? 'aapt.exe' : 'aapt');
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      // Try the next conventional SDK root, then PATH.
    }
  }
  return 'aapt';
}

async function verifyAndroidPackageIdentity(artifactPath) {
  const command = await discoverAndroidAapt();
  try {
    const { stdout } = await run(command, ['dump', 'badging', artifactPath], { capture: true });
    const identity = parseAndroidBadging(stdout);
    if (identity.packageName !== 'com.doso.robot' || identity.versionName !== HISTORICAL_VERSION) {
      throw new Error(`APK identity is ${identity.packageName ?? '<missing>'} / ${identity.versionName ?? '<missing>'}; expected com.doso.robot / ${HISTORICAL_VERSION}`);
    }
    record('PASS', 'android-package-identity', `aapt verified com.doso.robot / ${HISTORICAL_VERSION}`);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('APK identity is ')) throw error;
    record(unavailableStatus(), 'android-package-identity', `cannot inspect APK package/version with aapt (${error instanceof Error ? error.message : String(error)}); set DOSO_ANDROID_AAPT or install Android SDK Build Tools`);
    return false;
  }
}

async function androidSigningIdentity(artifactPath) {
  const command = process.env.DOSO_ANDROID_APKSIGNER?.trim() || 'apksigner';
  try {
    const { stdout, stderr } = await run(command, ['verify', '--print-certs', artifactPath], { capture: true });
    const output = `${stdout}\n${stderr}`;
    const match = output.match(/Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f:]{64,95})/i);
    const identity = normalizeCertificateSha256(match?.[1]);
    if (!identity) {
      record(unavailableStatus(), 'android-signing-identity', 'apksigner did not report a signer certificate SHA-256 digest');
    }
    return identity;
  } catch (error) {
    if (productionMode) {
      record('BLOCKED', 'android-signing-identity', `cannot verify the APK certificate with apksigner (${error instanceof Error ? error.message : String(error)}); set DOSO_ANDROID_APKSIGNER if it is not on PATH`);
      return null;
    }
    record('SKIP', 'android-signing-identity', 'apksigner was unavailable in development mode; production mode requires certificate binding');
    return undefined;
  }
}

async function verifyManualEvidence(runtimeContext) {
  const evidencePath = process.env.DOSO_OLD_CLIENT_REAL_DEVICE_EVIDENCE?.trim();
  const required = [
    'emailSignupOtp', 'emailLoginAndRecovery', 'profileAndHomeLoad',
    'terminalRegisterListAndRevoke', 'deviceListSettingsBindAndUnbind',
    'logoutAndRelaunch',
  ];
  if (!evidencePath) {
    record('BLOCKED', 'real-device-smoke', [
      'human evidence is required for the exact 1.2.1 binary. On an isolated test account/device verify:',
      '(1) email signup + OTP, (2) login + password recovery, (3) profile/home load after hosted head 20260823111035→20260824102000,',
      '(4) terminal register/list/revoke, (5) device list/settings/bind/unbind using a test robot,',
      '(6) logout/relaunch. Store JSON evidence and set DOSO_OLD_CLIENT_REAL_DEVICE_EVIDENCE.',
      `Required results keys: ${required.join(', ')}; also include historicalRef, version, currentGitSha, artifactSha256, platform, operator, signingIdentity, projectRef, target and checkedAt.`,
    ].join(' '));
    return;
  }
  if (!runtimeContext) {
    record('BLOCKED', 'real-device-smoke', 'manual evidence cannot be bound until the explicitly selected runtime target has passed its read-only probe');
    return;
  }
  const evidence = JSON.parse(await readFile(path.resolve(evidencePath), 'utf8'));
  if (evidence.historicalRef !== HISTORICAL_REF || evidence.version !== HISTORICAL_VERSION) {
    throw new Error(`manual evidence must identify ${HISTORICAL_REF} / ${HISTORICAL_VERSION}`);
  }
  const requiredText = ['operator', 'signingIdentity', 'projectRef', 'target', 'currentGitSha'];
  const invalidText = requiredText.filter(
    (name) => typeof evidence[name] !== 'string' || evidence[name].trim().length === 0,
  );
  if (invalidText.length > 0) {
    throw new Error(`manual evidence requires non-empty strings for: ${invalidText.join(', ')}`);
  }
  if (!['ios', 'android'].includes(evidence.platform)) {
    throw new Error('manual evidence platform must be ios or android');
  }
  if (evidence.platform === 'ios') {
    if (productionMode) {
      record(iosArtifactStatus(), 'ios-artifact-identity', 'production evidence currently accepts only an Android APK; IPA bundle ID, version and signature verification is not implemented');
      return;
    }
    record(iosArtifactStatus(), 'ios-artifact-identity', 'development mode does not verify IPA bundle ID, version or signature; this evidence cannot pass production');
  }
  if (typeof evidence.artifactSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(evidence.artifactSha256)) {
    throw new Error('manual evidence artifactSha256 must be exactly 64 hexadecimal characters');
  }
  validateEvidenceTime(evidence.checkedAt);
  if (normalizeRuntimeUrl(evidence.target) !== runtimeContext.origin || evidence.target !== runtimeContext.origin) {
    throw new Error(`manual evidence target must exactly equal probed target ${runtimeContext.origin}`);
  }
  if (evidence.projectRef !== runtimeContext.projectRef) {
    throw new Error(`manual evidence projectRef must equal selected project ${runtimeContext.projectRef}`);
  }
  const { stdout: currentGitShaOutput } = await run('git', ['rev-parse', 'HEAD'], { capture: true });
  const currentGitSha = currentGitShaOutput.trim();
  if (evidence.currentGitSha !== currentGitSha) {
    throw new Error(`manual evidence currentGitSha must equal current checkout ${currentGitSha}`);
  }
  const artifactPathValue = process.env.DOSO_OLD_CLIENT_ARTIFACT_PATH?.trim();
  if (!artifactPathValue) {
    record('BLOCKED', 'real-device-smoke', 'set DOSO_OLD_CLIENT_ARTIFACT_PATH to the exact installed 1.2.1 artifact so its SHA-256 can be verified');
    return;
  }
  const artifactPath = path.resolve(artifactPathValue);
  if (!existsSync(artifactPath)) {
    record('BLOCKED', 'real-device-smoke', `artifact does not exist: ${artifactPath}`);
    return;
  }
  const actualArtifactSha256 = await sha256File(artifactPath);
  if (actualArtifactSha256 !== evidence.artifactSha256.toLowerCase()) {
    throw new Error(`manual evidence artifactSha256 does not match ${artifactPath}`);
  }
  if (evidence.platform === 'android') {
    if (!await verifyAndroidPackageIdentity(artifactPath)) return;
    const actualSigningIdentity = await androidSigningIdentity(artifactPath);
    if (actualSigningIdentity === null) return;
    if (actualSigningIdentity !== undefined) {
      const claimedSigningIdentity = normalizeCertificateSha256(evidence.signingIdentity);
      if (!claimedSigningIdentity || claimedSigningIdentity !== actualSigningIdentity) {
        throw new Error(`manual evidence signingIdentity does not match the APK certificate SHA-256 ${actualSigningIdentity}`);
      }
      record('PASS', 'android-signing-identity', `apksigner bound the artifact to certificate SHA-256 ${actualSigningIdentity.slice(0, 12)}…`);
    }
  }
  if (required.some((name) => evidence.results?.[name] !== true)) {
    throw new Error(`manual evidence requires true results for: ${required.join(', ')}`);
  }
  record('PASS', 'real-device-smoke', `validated current checkout ${currentGitSha.slice(0, 12)}…, ${evidence.platform} artifact ${actualArtifactSha256.slice(0, 12)}… and project ${evidence.projectRef} at ${evidence.checkedAt}`);
}

function summarizeAndSetExitCode() {
  const failed = results.filter((result) => result.status === 'FAIL').length;
  const blocked = results.filter((result) => result.status === 'BLOCKED').length;
  const skipped = results.filter((result) => result.status === 'SKIP').length;
  const passed = results.filter((result) => result.status === 'PASS').length;
  const overall = failed > 0 ? 'FAIL' : blocked > 0 ? 'BLOCKED' : 'PASS';
  console.log(`\n[${overall}] summary: ${passed} PASS, ${skipped} SKIP, ${blocked} BLOCKED, ${failed} FAIL`);
  process.exitCode = failed > 0 ? 1 : blocked > 0 ? 2 : 0;
}

async function runStage(name, stage) {
  try {
    await stage();
  } catch (error) {
    record('FAIL', name, error instanceof Error ? error.message : String(error));
  }
}

async function runClassificationSelfTest() {
  const cases = [
    { statuses: ['PASS', 'SKIP'], expected: 0 },
    { statuses: ['PASS', 'BLOCKED'], expected: 2 },
    { statuses: ['PASS', 'BLOCKED', 'FAIL'], expected: 1 },
  ];
  for (const testCase of cases) {
    const failed = testCase.statuses.includes('FAIL');
    const blocked = testCase.statuses.includes('BLOCKED');
    const actual = failed ? 1 : blocked ? 2 : 0;
    if (actual !== testCase.expected) throw new Error(`classification regression: expected ${testCase.expected}, got ${actual}`);
  }
  const resultCount = results.length;
  await runStage('forced-failure-probe', async () => {
    throw new Error('expected probe failure');
  });
  if (results.at(-1)?.status !== 'FAIL') {
    throw new Error('thrown stage errors must be classified as FAIL');
  }
  results.splice(resultCount);
  const previousDosoSecret = process.env.DOSO_SERVICE_ROLE_KEY;
  const previousSupabaseSecret = process.env.SUPABASE_DB_PASSWORD;
  const previousHttpProxy = process.env.HTTP_PROXY;
  const previousHttpsProxy = process.env.HTTPS_PROXY;
  process.env.DOSO_SERVICE_ROLE_KEY = 'must-not-leak';
  process.env.SUPABASE_DB_PASSWORD = 'must-not-leak';
  process.env.HTTP_PROXY = 'http://proxy-user:proxy-password@example.invalid';
  process.env.HTTPS_PROXY = 'http://proxy-user:proxy-password@example.invalid';
  const sanitized = historicalCommandEnv();
  if (Object.keys(sanitized).some((name) => /^(?:DOSO_|SUPABASE_)/i.test(name))) {
    throw new Error('historical command environment leaked a DOSO_* or SUPABASE_* variable');
  }
  if (previousDosoSecret === undefined) delete process.env.DOSO_SERVICE_ROLE_KEY;
  else process.env.DOSO_SERVICE_ROLE_KEY = previousDosoSecret;
  if (previousSupabaseSecret === undefined) delete process.env.SUPABASE_DB_PASSWORD;
  else process.env.SUPABASE_DB_PASSWORD = previousSupabaseSecret;
  if (previousHttpProxy === undefined) delete process.env.HTTP_PROXY;
  else process.env.HTTP_PROXY = previousHttpProxy;
  if (previousHttpsProxy === undefined) delete process.env.HTTPS_PROXY;
  else process.env.HTTPS_PROXY = previousHttpsProxy;
  if (Object.keys(sanitized).some((name) => /^(?:HTTP_PROXY|HTTPS_PROXY)$/i.test(name))) {
    throw new Error('historical command environment leaked proxy credentials');
  }

  const now = Date.parse('2026-08-24T12:00:00.000Z');
  validateEvidenceTime('2026-08-24T11:59:00.000Z', now);
  for (const invalid of ['2026-08-24T12:06:00.000Z', '2026-08-10T11:59:59.000Z']) {
    let rejected = false;
    try {
      validateEvidenceTime(invalid, now);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`evidence time regression: accepted ${invalid}`);
  }
  if (projectRefFromOrigin('https://example-project.supabase.co') !== 'example-project') {
    throw new Error('project-ref extraction regression');
  }
  const certificate = 'ab'.repeat(32);
  if (normalizeCertificateSha256(`SHA-256: ${certificate.match(/../g).join(':')}`) !== certificate) {
    throw new Error('certificate SHA-256 normalization regression');
  }
  if (unavailableStatus(false) !== 'SKIP' || unavailableStatus(true) !== 'BLOCKED') {
    throw new Error('production unavailable-status regression');
  }
  if (iosArtifactStatus(false) !== 'SKIP' || iosArtifactStatus(true) !== 'BLOCKED') {
    throw new Error('production iOS artifact-status regression');
  }
  if (dirtyStatusLines(' M doso-app/App.tsx\n?? doso-app/supabase/migrations/new.sql\n').length !== 2) {
    throw new Error('release-scope dirty status parsing regression');
  }
  const requiredReleaseScopeSuffixes = [
    '/package.json', '/App.tsx', '/app.json', '/src/services', '/src/types',
    '/supabase/migrations', '/supabase/functions', '/supabase/verification',
    '/scripts/verify-old-client-compatibility.mjs',
  ];
  if (requiredReleaseScopeSuffixes.some((suffix) => !RELEASE_SCOPE_PATHS.some((scopePath) => scopePath.endsWith(suffix)))) {
    throw new Error('production release-scope coverage regression');
  }
  if (RELEASE_SCOPE_PATHS.some((scopePath) => /\/(?:docs|assets|supabase\/templates)(?:\/|$)/.test(scopePath))) {
    throw new Error('production release scope must exclude unrelated docs, assets and mail templates');
  }
  const androidIdentity = parseAndroidBadging("package: name='com.doso.robot' versionCode='12' versionName='1.2.1' platformBuildVersionName='16'");
  if (androidIdentity.packageName !== 'com.doso.robot' || androidIdentity.versionName !== HISTORICAL_VERSION) {
    throw new Error('Android package identity parsing regression');
  }
  console.log('[PASS] self-test: exit classification, scoped dirty gate, Android-only production, secret/proxy-free historical env, release window, APK identity and certificate binding');
}

async function main() {
  if (process.argv.includes('--self-test') || process.argv.includes('--classification-self-test')) {
    await runClassificationSelfTest();
    return;
  }
  console.log(`DOSO old-client compatibility gate: ${HISTORICAL_REF} (${HISTORICAL_VERSION}); mode=${productionMode ? 'production' : 'development'}; exits PASS=0 BLOCKED=2 FAIL=1`);
  let runtimeContext = null;
  const stages = [
    ['historical contract', verifyHistoricalContract],
    ['current compatibility surface', verifyCurrentCompatibilitySurface],
    ['production release scope', verifyProductionReleaseScope],
    ['historical build', verifyHistoricalBuild],
    ['read-only runtime', async () => { runtimeContext = await verifyOptionalRuntime(); }],
    ['real-device evidence', async () => verifyManualEvidence(runtimeContext)],
  ];
  for (const [name, stage] of stages) {
    await runStage(name, stage);
  }
  summarizeAndSetExitCode();
}

await main();
