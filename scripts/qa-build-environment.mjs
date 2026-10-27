import { dirname, delimiter, join, isAbsolute, resolve } from 'node:path';
import { realpathSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'vchvqfdlkomlrjenkdhj';
const OFF_FLAGS = ['EXPO_PUBLIC_DESIGN_QA', 'EXPO_PUBLIC_DESIGN_QA_CAPTURE',
  'EXPO_PUBLIC_CONNECTION_DIAGNOSTICS', 'EXPO_PUBLIC_BRAINSTEM_SIMULATION',
  'EXPO_PUBLIC_APPLE_AUTH_ENABLED', 'EXPO_PUBLIC_WECHAT_AUTH_ENABLED', 'EXPO_PUBLIC_QQ_AUTH_ENABLED'];

export function parseQaPublishableInput(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 256 || !/[\r\n]$/.test(text)) {
    throw new Error('qa_public_configuration_rejected');
  }
  const key = text.slice(0, text.endsWith('\r\n') ? -2 : -1);
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(key)) throw new Error('qa_public_configuration_rejected');
  return { projectId: PROJECT_ID, publishableKey: key };
}

export function createQaBuildEnvironment(host, configuration) {
  if (!configuration || typeof configuration !== 'object' || Array.isArray(configuration) ||
      Object.keys(configuration).sort().join(',') !== 'projectId,publishableKey' ||
      configuration.projectId !== PROJECT_ID ||
      typeof configuration.publishableKey !== 'string' ||
      !/^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(configuration.publishableKey)) {
    throw new Error('qa_public_configuration_rejected');
  }
  const directory = (name) => {
    try {
      const keys = Object.keys(host).filter(key => key.toUpperCase() === name.toUpperCase());
      if (keys.length !== 1) throw new Error();
      const value = host[keys[0]];
      if (typeof value !== 'string' || !isAbsolute(value) || /[\0\r\n]/.test(value)) throw new Error();
      const path = realpathSync(value);
      if (!statSync(path).isDirectory()) throw new Error();
      return path;
    } catch { throw new Error('qa_toolchain_environment_rejected'); }
  };
  const systemRoot = directory('SystemRoot');
  const java = directory('JAVA_HOME');
  const android = directory('ANDROID_HOME');
  try {
    for (const path of [join(java, 'bin'), join(android, 'platform-tools'), join(systemRoot, 'System32')]) {
      if (!statSync(path).isDirectory()) throw new Error();
    }
    if (!statSync(join(systemRoot, 'System32', 'cmd.exe')).isFile()) throw new Error();
  } catch { throw new Error('qa_toolchain_environment_rejected'); }
  return {
    SystemRoot: systemRoot, WINDIR: systemRoot,
    ComSpec: join(systemRoot, 'System32', 'cmd.exe'), PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [dirname(process.execPath), join(java, 'bin'), join(android, 'platform-tools'),
      join(systemRoot, 'System32'), systemRoot].join(delimiter),
    TEMP: directory('TEMP'), TMP: directory('TMP'),
    JAVA_HOME: java, ANDROID_HOME: android, ANDROID_SDK_ROOT: android,
    CI: '1', NODE_ENV: 'production', ENTRY_FILE: 'index.ts', EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_SUPABASE_URL: `https://${PROJECT_ID}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_URL_ANDROID: `https://${PROJECT_ID}.supabase.co`,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: configuration.publishableKey,
    ...Object.fromEntries(OFF_FLAGS.map(flag => [flag, '0'])),
  };
}

async function readNoEchoInput() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') throw new Error();
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  return await new Promise((accept, reject) => {
    let input = '';
    const finish = (error) => {
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onEnd);
      process.stdin.pause();
      if (error) reject(new Error('qa_public_configuration_rejected'));
      else accept(input);
    };
    const onEnd = () => finish(true);
    const onData = (text) => {
      input += text;
      if (Buffer.byteLength(input, 'utf8') > 256 || /[^\x20-\x7e\r\n]/.test(input)) return finish(true);
      if (/[\r\n]/.test(input)) finish(false);
    };
    const timer = setTimeout(() => finish(true), 45000);
    process.stdin.on('data', onData);
    process.stdin.once('end', onEnd);
    process.stdin.once('error', onEnd);
    // The orchestrator must see this exact marker before sending any real value.
    process.stdout.write('QA_PUBLIC_CONFIG_INPUT_READY_NO_ECHO\n');
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let phase = 'arguments';
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--probe') throw new Error();
    phase = 'input';
    const configuration = parseQaPublishableInput(await readNoEchoInput());
    phase = 'toolchain_environment';
    const childEnv = createQaBuildEnvironment(process.env, configuration);
    // Static argv only. Public key is passed through env, never argv or a file.
    phase = 'child';
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const env = process.env;
      const flags = ${JSON.stringify(OFF_FLAGS)};
      console.log(JSON.stringify({
        publicConfigurationPresent: /^sb_publishable_[A-Za-z0-9_-]{16,200}$/.test(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''),
        targetUrlsExact: env.EXPO_PUBLIC_SUPABASE_URL === 'https://${PROJECT_ID}.supabase.co' && env.EXPO_PUBLIC_SUPABASE_URL_ANDROID === env.EXPO_PUBLIC_SUPABASE_URL,
        dotenvDisabled: env.EXPO_NO_DOTENV === '1', normalEntry: env.ENTRY_FILE === 'index.ts',
        standardFlagsOff: flags.every(flag => env[flag] === '0'),
        unsafeVariablesPresent: Object.keys(env).some(key => /SECRET|PASSWORD|TOKEN|DATABASE_URL|^SUPABASE_|^DOSO_ANDROID_|^NODE_OPTIONS$|^JAVA_TOOL_OPTIONS$|^GRADLE_OPTS$|^NODE_EXTRA_CA_CERTS$/.test(key.toUpperCase()))
      }));
    `], { env: childEnv, shell: false, windowsHide: true, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, maxBuffer: 8192 });
    if (child.error || child.status !== 0) throw new Error();
    phase = 'child_contract';
    const proof = JSON.parse(child.stdout);
    const expected = ['publicConfigurationPresent', 'targetUrlsExact', 'dotenvDisabled', 'normalEntry',
      'standardFlagsOff', 'unsafeVariablesPresent'];
    if (Object.keys(proof).sort().join(',') !== expected.sort().join(',') ||
        expected.some(key => proof[key] !== (key !== 'unsafeVariablesPresent'))) throw new Error();
    console.log(JSON.stringify({ mode: 'public_config_child_probe_only', ...proof,
      buildStarts: 0, resourceProbed: false, filesWritten: 0 }));
  } catch {
    console.error(`QA public configuration probe failed at ${phase}; no build started or configuration persisted.`);
    process.exitCode = 1;
  } finally {
    try {
      if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
    } catch {
      console.error('QA probe terminal restoration could not be confirmed.');
      process.exitCode = 1;
    }
    process.stdin.pause();
  }
}
