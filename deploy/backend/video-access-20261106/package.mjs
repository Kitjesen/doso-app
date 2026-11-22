import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: here, encoding: 'utf8', shell: false });
  if (result.error || result.status !== 0) throw new Error(`Packaging failed: ${command}\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return result.stdout;
}
run(process.execPath, [resolve(here, 'prepare.mjs')]);
run(process.execPath, [resolve(here, 'verify.mjs')]);
const files = ['compose.video-access.yml', 'lds.template.yaml', 'cds.yaml', 'https.conf', 'deploy.py', 'runtime_base.py', 'database_base.py', 'README.md'];
for (const directory of ['functions', 'sql']) for (const file of await readdir(resolve(here, directory), { recursive: true, withFileTypes: true })) {
  assert.ok(!file.isSymbolicLink(), 'Release must not contain symlinks');
  if (file.isFile()) files.push(relative(here, resolve(file.parentPath, file.name)).replaceAll('\\', '/'));
}
assert.ok(!files.some(file => /\.(pem|key|env)$/.test(file)));
const archive = resolve(here, 'video-access-20261106.tar.gz');
run('tar', ['-czf', archive, ...files]);
assert.deepEqual(run('tar', ['-tzf', archive]).split(/\r?\n/).filter(Boolean).sort(), files.sort());
console.log(`Prepared upload archive (${files.length} files): ${archive}`);
