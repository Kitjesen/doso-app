import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, statfs } from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NEW_KEYS = ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'ANON_KEY_ASYMMETRIC', 'SERVICE_ROLE_KEY_ASYMMETRIC'];
const PLACEHOLDERS = ['ANON_KEY', 'SERVICE_ROLE_KEY', ...NEW_KEYS, 'SUPABASE_PUBLIC_URL', 'DASHBOARD_BASIC_AUTH'];
const MAX_TEMPLATE_BYTES = 128 * 1024;
const fail = () => { throw new Error('invalid_envoy_configuration'); };

function jwt(value, role, asymmetric) {
  if (typeof value !== 'string' || value.length < 128 || value.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) fail();
  const parts = value.split('.');
  const decoded = parts.map((part) => Buffer.from(part, 'base64url'));
  if (decoded.some((bytes, index) => bytes.toString('base64url') !== parts[index]) || decoded[2].length !== (asymmetric ? 64 : 32)) fail();
  let header, payload;
  try {
    header = JSON.parse(decoded[0].toString('utf8'));
    payload = JSON.parse(decoded[1].toString('utf8'));
  } catch { fail(); }
  if (!header || !payload || header.alg !== (asymmetric ? 'ES256' : 'HS256') || header.typ !== 'JWT' || payload.role !== role || payload.iss !== 'supabase' || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat <= 0 || payload.exp <= payload.iat) fail();
  if (asymmetric && (typeof header.kid !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(header.kid))) fail();
  return value;
}

function opaque(value, prefix) {
  if (typeof value !== 'string' || !new RegExp('^' + prefix + '[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$').test(value)) fail();
  const checksum = createHash('sha256').update('supabase-self-hosted|' + value.slice(0, -9)).digest('base64url').slice(0, 8);
  if (!value.endsWith('_' + checksum)) fail();
  return value;
}

function origin(value) {
  if (typeof value !== 'string' || value.length > 253 || !/^https:\/\/[a-z0-9.:-]+$/.test(value)) fail();
  let parsed;
  try { parsed = new URL(value); } catch { fail(); }
  if (parsed.origin !== value || parsed.hostname.length > 253 || parsed.hostname.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) fail();
  return value;
}

export function renderListener(template, environment) {
  if (typeof template !== 'string' || Buffer.byteLength(template) > MAX_TEMPLATE_BYTES || template.includes('\0')) fail();
  const seen = new Set();
  for (const match of template.matchAll(/\$\{([^}]*)\}/g)) {
    if (!PLACEHOLDERS.includes(match[1])) fail();
    seen.add(match[1]);
  }
  if (seen.size !== PLACEHOLDERS.length) fail();
  const values = {
    ANON_KEY: jwt(environment.ANON_KEY, 'anon', false),
    SERVICE_ROLE_KEY: jwt(environment.SERVICE_ROLE_KEY, 'service_role', false),
    SUPABASE_PUBLIC_URL: origin(environment.SUPABASE_PUBLIC_URL),
  };
  const present = NEW_KEYS.filter((name) => environment[name] !== undefined && environment[name] !== '');
  if (present.length !== 0 && present.length !== NEW_KEYS.length) fail();
  for (const name of NEW_KEYS) values[name] = '';
  if (present.length) {
    values.SUPABASE_PUBLISHABLE_KEY = opaque(environment.SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_');
    values.SUPABASE_SECRET_KEY = opaque(environment.SUPABASE_SECRET_KEY, 'sb_secret_');
    values.ANON_KEY_ASYMMETRIC = jwt(environment.ANON_KEY_ASYMMETRIC, 'anon', true);
    values.SERVICE_ROLE_KEY_ASYMMETRIC = jwt(environment.SERVICE_ROLE_KEY_ASYMMETRIC, 'service_role', true);
  }
  const username = environment.DASHBOARD_USERNAME;
  const password = environment.DASHBOARD_PASSWORD;
  if (typeof username !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(username) || typeof password !== 'string' || password.length < 16 || password.length > 256 || !/^[\x20-\x7e]+$/.test(password) || !password.trim()) fail();
  values.DASHBOARD_BASIC_AUTH = username + ':{SHA}' + createHash('sha1').update(password, 'utf8').digest('base64');
  const rendered = template.replace(/\$\{([^}]*)\}/g, (_match, name) => values[name]);
  if (/\$\{|\$[A-Za-z_]/.test(rendered)) fail();
  return rendered;
}

export async function writeListener(content, io = { lstat, statfs, open }) {
  const directory = await io.lstat('/etc/envoy');
  const filesystem = await io.statfs('/etc/envoy');
  if (!directory.isDirectory() || directory.isSymbolicLink() || directory.uid !== 1000 || (directory.mode & 0o7777) !== 0o700 || filesystem.type !== 0x01021994) fail();
  const file = await io.open('/etc/envoy/lds.yaml', constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.uid !== 1000 || info.nlink !== 1 || (info.mode & 0o7777) !== 0o600) fail();
    await file.writeFile(content, 'utf8');
    await file.sync();
  } finally {
    await file.close();
  }
}

export function runEnvoy({ spawnImpl = spawn, runtime = process } = {}) {
  return new Promise((resolve) => {
    let child, finished = false;
    const term = () => child?.kill('SIGTERM');
    const interrupt = () => child?.kill('SIGINT');
    const finish = (code) => {
      if (finished) return;
      finished = true;
      runtime.removeListener('SIGTERM', term);
      runtime.removeListener('SIGINT', interrupt);
      runtime.stdout.write(JSON.stringify({ status: 'envoy_candidate_exited', code }) + '\n');
      resolve(code);
    };
    runtime.on('SIGTERM', term);
    runtime.on('SIGINT', interrupt);
    runtime.stdout.write('{"status":"envoy_candidate_starting"}\n');
    try {
      child = spawnImpl('/app/envoy', ['-c', '/etc/envoy/envoy.yaml'], { shell: false, stdio: 'ignore', cwd: '/etc/envoy', env: { LANG: 'C', LC_ALL: 'C' } });
      child.once('error', () => finish(1));
      child.once('close', (code, signal) => {
        const signalCode = typeof signal === 'string' && Object.hasOwn(osConstants.signals, signal) ? osConstants.signals[signal] : 0;
        finish(Number.isInteger(code) && code >= 0 && code <= 255 ? code : signalCode ? 128 + signalCode : 1);
      });
    } catch { finish(1); }
  });
}

async function main() {
  if (process.platform !== 'linux' || process.getuid() !== 1000 || process.argv.length !== 2) fail();
  process.umask(0o077);
  const source = await open('/etc/envoy/lds.template.yaml', constants.O_RDONLY | constants.O_NOFOLLOW);
  let template;
  try {
    const info = await source.stat();
    if (!info.isFile() || info.size > MAX_TEMPLATE_BYTES) fail();
    template = await source.readFile('utf8');
  } finally { await source.close(); }
  await writeListener(renderListener(template, process.env));
  process.exitCode = await runEnvoy();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('{"status":"envoy_candidate_failed"}');
    process.exitCode = 1;
  });
}
