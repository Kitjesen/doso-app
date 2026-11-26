import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../metro.config.js', import.meta.url), 'utf8');

test('production transforms keep deterministic cacheVersion per EXPO_PUBLIC_* env while development keeps Expo defaults', () => {
  const load = (mode, extraEnv = {}) => {
    const module = { exports: {} };
    vm.runInNewContext(source, {
      module,
      __dirname: '/app',
      process: { env: { NODE_ENV: mode, ...extraEnv } },
      require(name) {
        if (name === 'node:crypto') return { createHash };
        assert.equal(name, 'expo/metro-config');
        return {
          getDefaultConfig(root) {
            assert.equal(root, '/app');
            return { cacheVersion: 'expo', resolver: { assetExts: ['otf', 'png'] } };
          },
        };
      },
    });
    return module.exports;
  };

  const first = load('production', { EXPO_PUBLIC_ENV: 'qa', EXPO_PUBLIC_AUTH_LINK_ORIGIN: 'https://links.dosorobotics.com' });
  const same = load('production', { EXPO_PUBLIC_AUTH_LINK_ORIGIN: 'https://links.dosorobotics.com', EXPO_PUBLIC_ENV: 'qa' });
  const changed = load('production', { EXPO_PUBLIC_ENV: 'prod', EXPO_PUBLIC_AUTH_LINK_ORIGIN: 'https://links.dosorobotics.com' });

  assert.equal(first.cacheVersion, same.cacheVersion, 'identical EXPO_PUBLIC_* values must hit Metro transform cache');
  assert.notEqual(first.cacheVersion, changed.cacheVersion, 'changed EXPO_PUBLIC_* values must invalidate Metro cache');
  assert.equal(load('development').cacheVersion, 'expo');
  assert.equal(load(undefined).cacheVersion, 'expo');
  assert.deepEqual(first.resolver.assetExts, ['otf', 'png']);
  assert.doesNotMatch(first.cacheVersion, /SUPABASE|publishable|dosorobotics/);
});
