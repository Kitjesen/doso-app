import { createHash } from 'node:crypto';
import { chmod, link, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const TEMPLATE_NAMES = ['compose.doso.yml', 'Caddyfile', 'compose.host-nginx.yml', 'nginx.doso.conf.example'];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const blobSha = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const fail = (code) => { throw new Error(code); };
const INTERNAL_FAILURES = new Set([
  'unsafe_source_path', 'private_env_forbidden', 'reserved_overlay_path', 'invalid_upstream_lock',
  'invalid_file_count', 'invalid_file_record', 'duplicate_source_path', 'unsupported_file_mode',
  'invalid_file_hash', 'invalid_file_size', 'bundle_too_large', 'source_path_conflict',
  'unsafe_directory', 'unsafe_overlay_template', 'upstream_response_rejected', 'download_too_large',
  'download_size_mismatch', 'download_integrity_mismatch', 'output_required', 'output_already_exists', 'invalid_arguments',
]);

export function classifyFailure(error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth++) {
    if (INTERNAL_FAILURES.has(current.message)) return current.message;
    if (['AbortError', 'TimeoutError'].includes(current.name)) return 'network_timeout';
    const code = typeof current.code === 'string' ? current.code : '';
    if (code === 'ECONNRESET') return 'network_reset';
    if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'dns_error';
    if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(code)) return 'network_timeout';
    if (/CERT|^ERR_TLS_|^UNABLE_TO_(?:VERIFY|GET_ISSUER)/.test(code)) return 'tls_error';
    if (code === 'ECONNREFUSED') return 'connection_refused';
    if (code === 'ENOENT') return 'required_path_missing';
    if (code === 'EEXIST') return 'output_already_exists';
    if (['EACCES', 'EPERM'].includes(code)) return 'filesystem_permission_denied';
    if (code === 'ENOSPC') return 'disk_full';
  }
  return error instanceof SyntaxError ? 'invalid_upstream_lock' : 'preparation_error';
}

function validateSourcePath(value) {
  if (value === 'LICENSE') return;
  if (typeof value !== 'string' || !value.startsWith('docker/') || !/^[A-Za-z0-9._/-]+$/.test(value)) fail('unsafe_source_path');
  for (const segment of value.split('/')) {
    if (!segment || segment === '.' || segment === '..' || segment.endsWith('.') || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(segment)) fail('unsafe_source_path');
    if (/^\.env(?:\.|$)/i.test(segment) && segment !== '.env.example') fail('private_env_forbidden');
  }
  if (value.startsWith('docker/doso/')) fail('reserved_overlay_path');
}

export function validateLock(lock) {
  if (!lock || lock.repository !== 'supabase/supabase' || !/^[a-f0-9]{40}$/.test(lock.commit ?? '')) fail('invalid_upstream_lock');
  if (!Array.isArray(lock.files) || lock.files.length === 0 || lock.files.length > 150) fail('invalid_file_count');
  let total = 0;
  const seen = new Set();
  const files = lock.files.map((file) => {
    if (!file || typeof file !== 'object') fail('invalid_file_record');
    validateSourcePath(file.path);
    const key = file.path.toLowerCase();
    if (seen.has(key)) fail('duplicate_source_path');
    seen.add(key);
    if (!['100644', '100755'].includes(file.mode)) fail('unsupported_file_mode');
    if (!/^[a-f0-9]{40}$/.test(file.gitBlobSha ?? '') || !/^[a-f0-9]{64}$/.test(file.sha256 ?? '')) fail('invalid_file_hash');
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) fail('invalid_file_size');
    total += file.size;
    if (total > MAX_TOTAL_BYTES) fail('bundle_too_large');
    return { path: file.path, mode: file.mode, size: file.size, gitBlobSha: file.gitBlobSha, sha256: file.sha256 };
  });
  for (const file of files) {
    const segments = file.path.toLowerCase().split('/');
    for (let i = 1; i < segments.length; i++) if (seen.has(segments.slice(0, i).join('/'))) fail('source_path_conflict');
  }
  return { repository: lock.repository, commit: lock.commit, files, totalBytes: total };
}

async function assertRealDirectory(directory) {
  const absolute = path.resolve(directory);
  const root = path.parse(absolute).root;
  let current = root;
  for (const segment of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('unsafe_directory');
  }
}

async function readTemplates(directory) {
  await assertRealDirectory(directory);
  return Promise.all(TEMPLATE_NAMES.map(async (name) => {
    const source = path.join(directory, name);
    const stat = await lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES) fail('unsafe_overlay_template');
    return { path: `docker/doso/${name}`, bytes: await readFile(source) };
  }));
}

async function downloadFile(file, commit, fetchImpl) {
  const response = await fetchImpl(`https://raw.githubusercontent.com/supabase/supabase/${commit}/${file.path}`, {
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (response.redirected || response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => {});
    fail('upstream_response_rejected');
  }
  const contentLength = response.headers?.get('content-length');
  if (contentLength !== null && contentLength !== undefined && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_FILE_BYTES)) {
    await response.body.cancel().catch(() => {});
    fail('download_too_large');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > MAX_FILE_BYTES || size > file.size) fail('download_size_mismatch');
      chunks.push(Buffer.from(chunk.value));
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== file.size || sha256(bytes) !== file.sha256 || blobSha(bytes) !== file.gitBlobSha) fail('download_integrity_mismatch');
  return bytes;
}

async function writeBundleFile(output, relativePath, bytes, mode = '100644') {
  const destination = path.join(output, ...relativePath.split('/'));
  await mkdir(path.dirname(destination), { recursive: true });
  await assertRealDirectory(path.dirname(destination));
  await writeFile(destination, bytes, { flag: 'wx', mode: mode === '100755' ? 0o755 : 0o644 });
  if (mode === '100755') await chmod(destination, 0o755);
}

export async function prepareBundle(lock, output, { fetchImpl = fetch, templateDir = toolDirectory } = {}) {
  const source = validateLock(lock);
  if (typeof output !== 'string' || !output.trim()) fail('output_required');
  const destination = path.resolve(output);
  await assertRealDirectory(path.dirname(destination));
  try { await lstat(destination); fail('output_already_exists'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const templates = await readTemplates(templateDir);
  await mkdir(destination); // Exclusive creation: never reuse or overwrite a destination.
  try {
    for (const file of source.files) {
      const bytes = await downloadFile(file, source.commit, fetchImpl);
      await writeBundleFile(destination, file.path, bytes, file.mode);
    }
    for (const template of templates) await writeBundleFile(destination, template.path, template.bytes);
    const manifest = {
      schemaVersion: 1, completed: true, repository: source.repository, commit: source.commit,
      files: source.files,
      overlays: templates.map(({ path: name, bytes }) => ({ path: name, size: bytes.length, sha256: sha256(bytes) })),
      credentialsGenerated: false, servicesStarted: false, productionDataRead: false,
    };
    const pending = path.join(destination, 'package-manifest.pending.json');
    await writeFile(pending, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o644 });
    // Publish complete bytes atomically without replacing an existing file.
    await link(pending, path.join(destination, 'package-manifest.json'));
    await unlink(pending).catch(() => {});
    return manifest;
  } catch (error) {
    // Keep the partial directory for inspection. Never delete a possibly user-owned path.
    await writeFile(path.join(destination, 'PREPARATION_FAILED.txt'), 'Preparation incomplete. No package manifest was issued. Do not deploy this directory.\n', { flag: 'wx' }).catch(() => {});
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== '--output' || !args[1])) fail('invalid_arguments');
  const lock = JSON.parse(await readFile(path.join(toolDirectory, 'upstream.lock.json'), 'utf8'));
  const plan = validateLock(lock);
  if (args.length === 0) {
    console.log(JSON.stringify({ action: 'plan_only', repository: plan.repository, commit: plan.commit, files: plan.files.length, totalBytes: plan.totalBytes, credentialsGenerated: false, servicesStarted: false }, null, 2));
    return;
  }
  const manifest = await prepareBundle(lock, args[1]);
  console.log(JSON.stringify({ action: 'prepared', output: path.resolve(args[1]), commit: manifest.commit, files: manifest.files.length, credentialsGenerated: false, servicesStarted: false }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ action: 'preparation_failed', classification: classifyFailure(error) }));
    process.exitCode = 1;
  });
}
