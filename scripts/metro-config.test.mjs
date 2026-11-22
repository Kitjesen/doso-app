import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../metro.config.js', import.meta.url), 'utf8');

test('production transforms get fresh cache identities while development keeps Expo defaults', () => {
  let sequence = 0;
  const load = mode => {
    const module = { exports: {} };
    vm.runInNewContext(source, { module, __dirname: '/app', process: { env: { NODE_ENV: mode } },
      require(name) {
        if (name === 'node:crypto') return { randomUUID: () => `build-${++sequence}` };
        assert.equal(name, 'expo/metro-config');
        return { getDefaultConfig(root) { assert.equal(root, '/app'); return { cacheVersion: 'expo', resolver: { assetExts: ['otf', 'png'] } }; } };
      },
    });
    return module.exports;
  };
  const first = load('production'), second = load('production');
  assert.notEqual(first.cacheVersion, second.cacheVersion);
  assert.equal(load('development').cacheVersion, 'expo');
  assert.equal(load(undefined).cacheVersion, 'expo');
  assert.deepEqual(first.resolver.assetExts, ['otf', 'png']);
  assert.doesNotMatch(first.cacheVersion, /SUPABASE|publishable/);
});
