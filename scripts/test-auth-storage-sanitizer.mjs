import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { sanitizeAuthStorageValue } from '../src/services/authStorageSanitizer.ts';

const source = JSON.stringify({
  access_token: 'supabase-access',
  refresh_token: 'supabase-refresh',
  provider_token: 'root-provider-token',
  user: {
    provider_refresh_token: 'nested-provider-refresh',
    identities: [
      {
        provider_token: 'array-provider-token',
        identity_data: {
          credential: 'ordinary-credential-field',
          token: 'ordinary-token-field',
        },
      },
    ],
  },
});

const sanitized = sanitizeAuthStorageValue(source);
assert.equal(sanitized.changed, true);

const parsed = JSON.parse(sanitized.value);
assert.equal(parsed.access_token, 'supabase-access');
assert.equal(parsed.refresh_token, 'supabase-refresh');
assert.equal('provider_token' in parsed, false);
assert.equal('provider_refresh_token' in parsed.user, false);
assert.equal('provider_token' in parsed.user.identities[0], false);
assert.equal(parsed.user.identities[0].identity_data.credential, 'ordinary-credential-field');
assert.equal(parsed.user.identities[0].identity_data.token, 'ordinary-token-field');

const repeated = sanitizeAuthStorageValue(sanitized.value);
assert.deepEqual(repeated, { value: sanitized.value, changed: false });

const invalidJson = '{not-json';
assert.deepEqual(sanitizeAuthStorageValue(invalidJson), {
  value: invalidJson,
  changed: false,
});

const jsonString = JSON.stringify('provider_token');
assert.deepEqual(sanitizeAuthStorageValue(jsonString), {
  value: jsonString,
  changed: false,
});

const supabaseClient = await readFile(
  new URL('../src/services/supabaseClient.ts', import.meta.url),
  'utf8',
);
const diagnosticMatch = supabaseClient.match(
  /const AUTH_STORAGE_SANITIZE_WRITEBACK_FAILED\s*=\s*\n?\s*(['"])([^'"]+)\1/,
);
assert.ok(diagnosticMatch, 'a fixed write-back failure diagnostic is defined');
assert.equal(
  diagnosticMatch[2],
  '[DOSO auth storage] legacy provider credential cleanup could not be persisted',
);
assert.doesNotMatch(diagnosticMatch[2], /token|value|secret|provider_refresh/i);
assert.match(
  supabaseClient,
  /catch \{[\s\S]*?console\.warn\(AUTH_STORAGE_SANITIZE_WRITEBACK_FAILED\);[\s\S]*?\}\s*\n\s*return sanitized\.value;/,
  'failed legacy cleanup write-back emits only the fixed diagnostic and still returns the sanitized value',
);
assert.doesNotMatch(
  supabaseClient,
  /console\.warn\([^)]*(?:sanitized\.value|storedValue|error|key)/,
  'the storage diagnostic never logs values, caught errors, or storage keys',
);

const sanitizeStorageSource = supabaseClient.match(
  /function sanitizeStorage\(storage: StorageAdapter\): StorageAdapter \{[\s\S]*?\n\}/,
)?.[0];
assert.ok(sanitizeStorageSource, 'the production storage wrapper can be exercised');
const createSanitizedStorage = new Function(
  'sanitizeAuthStorageValue',
  'AUTH_STORAGE_SANITIZE_WRITEBACK_FAILED',
  `${sanitizeStorageSource.replace(
    'function sanitizeStorage(storage: StorageAdapter): StorageAdapter',
    'function sanitizeStorage(storage)',
  )}; return sanitizeStorage;`,
)(sanitizeAuthStorageValue, diagnosticMatch[2]);

const diagnostics = [];
const originalWarn = console.warn;
console.warn = (...args) => diagnostics.push(args);
try {
  const wrappedStorage = createSanitizedStorage({
    async getItem() { return source; },
    async setItem() { throw new Error('must-not-log root-provider-token'); },
    async removeItem() {},
  });
  assert.equal(
    await wrappedStorage.getItem('must-not-log-storage-key'),
    sanitized.value,
    'failed cleanup persistence still returns the sanitized session',
  );
} finally {
  console.warn = originalWarn;
}
assert.deepEqual(diagnostics, [[diagnosticMatch[2]]]);
assert.doesNotMatch(JSON.stringify(diagnostics), /root-provider-token|must-not-log-storage-key/);

console.log('Auth storage sanitizer runtime checks passed.');
