import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { assertBuildConfig, cloudInvocation, projectRoot } from './ios-cloud.mjs';

const env = { npm_execpath: 'C:/npm/npm-cli.js', PATH: 'preserved', EAS_PROJECT_ROOT: 'wrong' };
const buildId = 'ca1d0d14-e5e6-48e9-8a39-fa26b6e71a61';

test('build pins CLI and app scope without store submission or shell interpolation', () => {
  const command = cloudInvocation(['build'], env);
  assert.equal(command.options.cwd, projectRoot);
  assert.equal(command.options.env.EAS_PROJECT_ROOT, projectRoot);
  assert.equal(command.options.env.EAS_NO_VCS, '1');
  assert.equal(command.options.env.EXPO_NO_DOTENV, '1');
  assert.equal(command.options.env.PATH, 'preserved');
  assert.equal(command.options.shell, false);
  assert.ok(command.args.includes('--package=eas-cli@24.12.0'));
  assert.ok(command.args.includes('ios-simulator'));
  assert.ok(!command.args.some(arg => /submit|production|auto-submit/.test(arg)));
  assert.equal(env.EAS_PROJECT_ROOT, 'wrong');
  assert.equal(projectRoot, path.resolve(projectRoot));
  assert.ok(!projectRoot.endsWith(path.sep), 'EAS project root must not retain a trailing directory separator');
});

test('browser preview explicitly selects the isolated simulator profile', () => {
  const command = cloudInvocation(['preview'], env);
  assert.ok(command.args.includes('ios-browser-preview'));
  assert.ok(command.args.includes('--json'));
  assert.equal(command.options.env.ENTRY_FILE, undefined);
  assert.ok(!command.args.includes('--auto-submit'));
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url)));
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url)));
  assert.doesNotThrow(() => assertBuildConfig(config, eas, 'ios-browser-preview'));
  const unsafe = structuredClone(eas);
  unsafe.build['ios-browser-preview'].ios = { simulator: false };
  assert.throws(() => assertBuildConfig(config, unsafe, 'ios-browser-preview'));
  unsafe.build['ios-browser-preview'].ios = { simulator: true };
  unsafe.build['ios-browser-preview'].env.ENTRY_FILE = 'App.tsx';
  assert.throws(() => assertBuildConfig(config, unsafe, 'ios-browser-preview'));
});

test('status is read-only and requires an exact UUID', () => {
  const command = cloudInvocation(['status', buildId], env);
  assert.deepEqual(command.args.slice(-3), ['build:view', buildId, '--json']);
  for (const args of [[], ['submit'], ['status'], ['status', '../other'], ['build', '--auto-submit'], ['status', buildId, 'extra']]) {
    assert.throws(() => cloudInvocation(args, env));
  }
  assert.throws(() => cloudInvocation(['build'], {}), /npm run/);
});

test('wrong project or device build cannot silently replace simulator build', () => {
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url)));
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url)));
  assert.doesNotThrow(() => assertBuildConfig(config, eas));
  for (const mutate of [
    value => { value.expo.owner = 'another-team'; },
    value => { value.expo.extra.eas.projectId = buildId; },
    value => { value.expo.ios.bundleIdentifier = 'another.app'; },
  ]) {
    const changed = structuredClone(config);
    mutate(changed);
    assert.throws(() => assertBuildConfig(changed, eas));
  }
  const changedEas = structuredClone(eas);
  changedEas.build['ios-simulator'].ios.simulator = false;
  assert.throws(() => assertBuildConfig(config, changedEas));
});
