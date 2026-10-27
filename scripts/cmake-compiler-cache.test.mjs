import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

test('normal build disables React Native cached bare ccache launch under an isolated PATH', () => {
  const source = readFileSync(new URL('../node_modules/react-native/ReactAndroid/cmake-utils/ReactNative-application.cmake', import.meta.url), 'utf8');
  const block = source.match(/find_program\(CCACHE_FOUND ccache\)[\s\S]*?endif\(CCACHE_FOUND\)/)?.[0];
  assert.ok(block, 'test the installed upstream CMake block, not a rewritten cache detector');
  const gradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
  const option = gradle.match(/arguments\s+"(-DCCACHE_FOUND:BOOL=FALSE)"/)?.[1];
  assert.ok(option, 'project configuration must explicitly override stale native cache discovery');
  const directory = mkdtempSync(join(tmpdir(), 'doso-cmake-cache-'));
  try {
    const script = join(directory, 'policy.cmake');
    writeFileSync(script, block + '\nget_property(launcher GLOBAL PROPERTY RULE_LAUNCH_COMPILE)\nmessage("QA_LAUNCHER=[${launcher}]")\n');
    const run = setting => spawnSync('D:/software/Android/cmake/3.22.1/bin/cmake.exe', [setting, '-P', script], {
      encoding: 'utf8', timeout: 10000, windowsHide: true,
      env: { SystemRoot: process.env.SystemRoot, PATH: join(process.env.SystemRoot, 'System32'), TEMP: tmpdir(), TMP: tmpdir() },
    });
    const stale = run('-DCCACHE_FOUND:FILEPATH=D:/old-developer-path/ccache.exe');
    assert.equal(stale.status, 0, stale.error?.message || stale.stderr);
    assert.match(stale.stderr + stale.stdout, /QA_LAUNCHER=\[ccache\]/, 'a stale cache path enables a bare launcher despite isolated PATH');
    const fixed = run(option);
    assert.equal(fixed.status, 0, fixed.error?.message || fixed.stderr);
    assert.match(fixed.stderr + fixed.stdout, /QA_LAUNCHER=\[\]/, 'native compiler must run without the unavailable cache launcher');
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()), 'remove only this test-owned temporary directory');
    rmSync(directory, { recursive: true, force: true });
  }
});
