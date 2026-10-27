import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const require = createRequire(import.meta.url);
const ignore = require('ignore');
const cliVersion = '24.12.0';
const requiredFiles = ['.easignore', 'package.json', 'package-lock.json', 'app.json', 'eas.json',
  'tsconfig.json', 'App.tsx', 'index.ts', 'index.preview.ts'];
const runtimeDirectories = ['src', 'assets', 'plugins', 'iot'];
const usage = 'Usage: npm run ios:cloud -- build | preview | inspect | status <build-id>';

function walkFiles(root, directory = '', filter = () => true) {
  const result = [];
  for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = directory ? `${directory}/${entry.name}` : entry.name;
    if (!filter(relative)) continue;
    if (lstatSync(path.join(root, relative)).isSymbolicLink()) throw new Error(`Archive link is not allowed: ${relative}`);
    if (entry.isDirectory()) result.push(...walkFiles(root, relative, filter));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unsupported source entry: ${relative}`);
  }
  return result.sort();
}

export function currentSourceFiles(root) {
  const filter = ignore().add(readFileSync(path.join(root, '.easignore'), 'utf8'));
  for (const file of requiredFiles) {
    if (!existsSync(path.join(root, file))) throw new Error(`Required source missing: ${file}`);
  }
  return walkFiles(root, '', relative => {
    if (filter.ignores(relative)) return false;
    return requiredFiles.includes(relative) || runtimeDirectories.includes(relative.split('/')[0]);
  });
}

// Validate EAS's real copied archive, not just a theoretical ignore matcher.
export function assertSourceArchive(archiveRoot, sourceRoot = projectRoot) {
  const expected = currentSourceFiles(sourceRoot);
  const actual = walkFiles(archiveRoot);
  const expectedSet = new Set(expected);
  for (const file of actual) {
    if (!expectedSet.has(file)) throw new Error(`Unexpected upload file: ${file}`);
  }
  const actualSet = new Set(actual);
  const files = expected.map(file => {
    if (!actualSet.has(file)) throw new Error(`Archive missing runtime input: ${file}`);
    const source = readFileSync(path.join(sourceRoot, file));
    const copied = readFileSync(path.join(archiveRoot, file));
    if (!source.equals(copied)) throw new Error(`Archive source mismatch: ${file}`);
    return { path: file, bytes: copied.length, sha256: createHash('sha256').update(copied).digest('hex') };
  });
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > 100_000_000) throw new Error('Upload exceeds the 100 MB DOSO source safety limit.');
  const sourceSha256 = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { status: 'current-source-archive-verified', fileCount: files.length, totalBytes, sourceSha256, files };
}

// Keep build scope explicit: this app lives inside a larger, unrelated Git tree.
export function cloudInvocation(args, env = process.env) {
  const [action, buildId, ...extra] = args;
  if (extra.length || !['build', 'preview', 'inspect', 'status'].includes(action)) {
    throw new Error(usage);
  }
  if (action !== 'status' && buildId) throw new Error('Build takes no extra arguments.');
  if (action === 'status' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(buildId ?? '')) {
    throw new Error('Status requires an exact EAS build UUID.');
  }
  if (!env.npm_execpath) throw new Error('Run through npm run ios:cloud.');

  const profile = action === 'preview' || action === 'inspect' ? 'ios-browser-preview' : 'ios-simulator';
  const command = action === 'status'
    ? ['build:view', buildId, '--json']
    : ['build', '--platform', 'ios', '--profile', profile, '--non-interactive', '--no-wait', '--json'];
  const { ENTRY_FILE: _entryOverride, ...cleanEnv } = env;
  return {
    executable: process.execPath,
    args: [env.npm_execpath, 'exec', '--yes', `--package=eas-cli@${cliVersion}`, '--', 'eas', ...command],
    options: {
      cwd: projectRoot,
      shell: false,
      stdio: 'inherit',
      env: { ...cleanEnv, EAS_NO_VCS: '1', EAS_PROJECT_ROOT: projectRoot, EXPO_NO_DOTENV: '1' },
    },
  };
}

export function assertBuildConfig(config, eas, profile = 'ios-simulator') {
  const app = config.expo;
  if (app.extra?.eas?.projectId !== '090f78b1-5b6b-4ba8-9207-1e0c21c52f62'
      || app.owner !== 'kitjesens-team' || app.slug !== 'hongsen') {
    throw new Error('DOSO cloud project identity changed; verify the target before building.');
  }
  if (app.name !== 'DOSO' || app.ios?.bundleIdentifier !== 'com.doso.robot') {
    throw new Error('DOSO app identity changed; verify the target before building.');
  }
  if (eas.build?.['ios-simulator']?.ios?.simulator !== true || !['ios-simulator', 'ios-browser-preview'].includes(profile)) {
    throw new Error('This command only builds for iOS Simulator, never TestFlight or App Store.');
  }
  if (profile === 'ios-browser-preview') {
    const preview = eas.build[profile];
    if (preview?.extends !== 'ios-simulator' || preview.ios?.simulator === false
        || preview.ios?.buildConfiguration && preview.ios.buildConfiguration !== 'Release'
        || preview.env?.ENTRY_FILE !== 'index.preview.ts') {
      throw new Error('Browser preview must select the isolated entry and standalone simulator configuration.');
    }
  }
}

function runInvocation(invocation) {
  const result = spawnSync(invocation.executable, invocation.args, invocation.options);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`EAS command failed with exit code ${result.status}.`);
}

function prepareVerifiedArchive(invocation, profile) {
  const parent = path.join(projectRoot, 'artifacts/release-readiness/ios-source-preflight');
  mkdirSync(parent, { recursive: true });
  const runDirectory = mkdtempSync(path.join(parent, 'run-'));
  const archive = path.join(runDirectory, 'source');
  const inspect = {
    ...invocation,
    args: [invocation.args[0], 'exec', '--yes', `--package=eas-cli@${cliVersion}`, '--', 'eas',
      'build:inspect', '--platform', 'ios', '--profile', profile, '--stage', 'archive', '--output', archive],
  };
  runInvocation(inspect);
  const proof = assertSourceArchive(archive);
  writeFileSync(path.join(runDirectory, 'verification.json'), JSON.stringify({
    ...proof, verifiedAt: new Date().toISOString(), profile,
    platform: 'ios-simulator', runtimeVerified: false,
  }, null, 2) + '\n');
  console.error(`Verified ${proof.fileCount} current source files (${proof.totalBytes} bytes), SHA256 ${proof.sourceSha256}`);
  console.error(`Source evidence: ${runDirectory}`);
  return { archive, proof };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const invocation = cloudInvocation(process.argv.slice(2));
    const action = process.argv[2];
    const profile = ['preview', 'inspect'].includes(action) ? 'ios-browser-preview' : 'ios-simulator';
    assertBuildConfig(
      JSON.parse(readFileSync(path.join(projectRoot, 'app.json'), 'utf8')),
      JSON.parse(readFileSync(path.join(projectRoot, 'eas.json'), 'utf8')),
      profile,
    );
    if (action !== 'status') {
      const { archive, proof } = prepareVerifiedArchive(invocation, profile);
      // Detect source changes while the preflight was running; fail closed.
      if (assertSourceArchive(archive).sourceSha256 !== proof.sourceSha256) throw new Error('Source changed after preflight.');
    }
    if (action !== 'inspect') runInvocation(invocation);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
