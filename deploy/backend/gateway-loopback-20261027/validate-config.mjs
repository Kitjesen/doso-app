import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { renderListener, writeListener } from '/app/envoy-safe-entrypoint.mjs';

// The real listener contains keys: keep it in tmpfs and suppress Envoy diagnostics.
try {
  if (process.platform !== 'linux' || process.getuid() !== 1000 || process.argv.length !== 2) throw new Error();
  process.umask(0o077);
  const source = await open('/etc/envoy/lds.template.yaml', constants.O_RDONLY | constants.O_NOFOLLOW);
  let template;
  try {
    const info = await source.stat();
    if (!info.isFile() || info.size > 128 * 1024) throw new Error();
    template = await source.readFile('utf8');
  } finally { await source.close(); }
  await writeListener(renderListener(template, process.env));
  const result = spawnSync('/app/envoy', ['--mode', 'validate', '-c', '/etc/envoy/envoy.yaml'], {
    shell: false, stdio: 'pipe', timeout: 15000, maxBuffer: 1024 * 1024,
    cwd: '/etc/envoy', env: { LANG: 'C', LC_ALL: 'C' },
  });
  if (result.error || result.signal || result.status !== 0) throw new Error();
  process.stdout.write('{"status":"gateway_bootstrap_validated","dynamic_routes_verified":false}\n');
} catch {
  process.stdout.write('{"status":"gateway_bootstrap_validation_failed"}\n');
  process.exitCode = 1;
}
