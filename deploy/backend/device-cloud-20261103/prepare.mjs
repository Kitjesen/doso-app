import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../../supabase/functions');
const previous = resolve(here, '../account-sessions-20261027/functions');
const output = resolve(here, 'functions');

await mkdir(output, { recursive: true });
for (const name of ['main', 'deno.jsonc']) {
  await cp(resolve(previous, name), resolve(output, name), { recursive: true });
}
for (const name of ['account-sessions', 'device-binding', 'remote-state', 'remote-state-sync']) {
  await mkdir(resolve(output, name), { recursive: true });
  await cp(resolve(source, name, 'index.ts'), resolve(output, name, 'index.ts'));
}
for (const name of ['remote-state', 'remote-state-sync']) {
  await cp(resolve(source, name, 'handler.ts'), resolve(output, name, 'handler.ts'));
}
await mkdir(resolve(output, '_shared'), { recursive: true });
for (const name of ['actions.ts', 'audit.ts', 'auth.ts', 'crypto.ts', 'deviceBinding.ts', 'http.ts', 'robotIngress.ts']) {
  await cp(resolve(source, '_shared', name), resolve(output, '_shared', name));
}
await cp(resolve(source, '../migrations/20261104090000_claim_device_by_uuid.sql'),
  resolve(here, 'sql/20261104090000_claim_device_by_uuid.sql'));
console.log('Prepared device-cloud functions from the current production sources.');
