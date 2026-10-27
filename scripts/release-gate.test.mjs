import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const gateSource = readFileSync(new URL('./verify-release-gate.mjs', import.meta.url), 'utf8');
const gateCode = ts.transpileModule(gateSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const fixtureNpm = 'synthetic-npm-cli.js';

// Run the actual CLI/argv/env contract. Only the child-process boundary is
// controlled: these tests cannot invoke npm, Docker, SQL, network or a build.
function runGate({ args = [], failStep, result = { status: 17 }, npmCli = fixtureNpm } = {}) {
  const calls = [], logs = [], module = { exports: {} };
  const processFixture = { argv: ['synthetic-node', 'scripts/verify-release-gate.mjs', ...args], execPath: 'synthetic-node', env: npmCli === null ? {} : { npm_execpath: npmCli }, cwd: () => 'synthetic-workdir' };
  let error;
  try {
    vm.runInNewContext(gateCode, { module, exports: module.exports, process: processFixture, Error, Set, Object,
      console: { log: line => logs.push(String(line)) },
      require(name) {
        assert.equal(name, 'node:child_process');
        return { spawnSync(command, argv, options) {
          assert.equal(command, processFixture.execPath);
          assert.deepEqual([...argv].slice(0, 2), [fixtureNpm, 'run']); assert.equal(argv.length, 3);
          assert.equal(options.cwd, processFixture.cwd()); assert.equal(options.env, processFixture.env);
          assert.equal(options.shell, false); assert.equal(options.stdio, 'inherit');
          const step = argv[2]; calls.push(step); return step === failStep ? result : { status: 0 };
        } };
      },
    }, { filename: 'scripts/verify-release-gate.mjs' });
  } catch (caught) { error = caught; }
  return { calls, logs, error, exitCode: processFixture.exitCode };
}

function assertStopped(run, step, code) {
  assert.equal(run.error, undefined); assert.equal(run.exitCode, code, 'Gate must propagate the required check failure');
  assert.equal(run.calls.filter(value => value === step).length, 1);
  assert.equal(run.calls.at(-1), step, 'No later stage may execute after failure');
  assert.equal(run.logs.some(line => /(?:AUDIT|GATE) PASS/.test(line)), false, 'A failed required stage cannot publish PASS');
}

test('full release gate stops when profile save safety regressions fail', () => {
  assertStopped(runGate({ failStep: 'test:profile-editing' }), 'test:profile-editing', 17);
});

test('full release gate stops when profile upgrade staging preflight fails', () => {
  assertStopped(runGate({ failStep: 'test:profile-upgrade-preflight', result: { status: 23 } }), 'test:profile-upgrade-preflight', 23);
});

test('full release gate also requires its own executable contract regressions', () => {
  assertStopped(runGate({ failStep: 'test:release-gate-core', result: { status: 19 } }), 'test:release-gate-core', 19);
});

for (const step of ['test:profile-editing', 'test:profile-upgrade-preflight', 'test:release-gate-core']) {
  test(`design audit cannot skip required local check: ${step}`, () => {
    assertStopped(runGate({ args: ['--design-audit'], failStep: step }), step, 17);
  });
}

for (const designAudit of [false, true]) test(`${designAudit ? 'design audit' : 'full release'} preserves DB boundary and runs new required checks once`, () => {
  const run = runGate({ args: designAudit ? ['--design-audit'] : [] });
  assert.equal(run.error, undefined); assert.equal(run.exitCode ?? 0, 0);
  for (const step of ['test:profile-editing', 'test:profile-upgrade-preflight', 'test:release-gate-core']) assert.equal(run.calls.filter(value => value === step).length, 1);
  const profile = run.calls.indexOf('test:profile-ui');
  assert.deepEqual(run.calls.slice(profile, profile + 4), ['test:profile-ui', 'test:profile-editing', 'test:profile-upgrade-preflight', 'test:control-ui']);
  assert.equal(run.calls.filter(value => value === 'test:db').length, designAudit ? 0 : 1);
  assert.equal(run.logs.some(line => line.includes('DESIGN AUDIT SCOPE: npm run test:db remains enforced by the full release gate')), designAudit);
  assert.equal(run.logs.filter(line => /(?:AUDIT|GATE) PASS/.test(line)).length, 1);
  assert.ok(run.logs.at(-1).includes(designAudit ? 'GLOBAL 20-PAGE DESIGN COMPLETION STILL REQUIRED' : 'SIMULATED/OFFLINE CONTRACTS'));
  assert.ok(run.logs.at(-1).includes('REAL CONTROL BLOCKED'));
});

test('profile check killed without exit status fails closed and never publishes PASS', () => {
  assertStopped(runGate({ failStep: 'test:profile-editing', result: { status: null, signal: 'SIGTERM' } }), 'test:profile-editing', 1);
});

test('profile child-process startup error propagates without later stages or PASS', () => {
  const error = new Error('synthetic process startup failure');
  const run = runGate({ failStep: 'test:profile-editing', result: { status: null, error } });
  assert.equal(run.error, error); assert.equal(run.calls.at(-1), 'test:profile-editing');
  assert.equal(run.logs.some(line => /(?:AUDIT|GATE) PASS/.test(line)), false);
});

test('unknown release arguments fail before any child process', () => {
  const run = runGate({ args: ['--skip-profile'] });
  assert.match(run.error.message, /Unknown release gate argument/); assert.equal(run.calls.length, 0);
});

test('missing npm invocation context fails before any child process', () => {
  const run = runGate({ npmCli: null });
  assert.match(run.error.message, /Run the release gate through npm/); assert.equal(run.calls.length, 0);
});

test('gate check names resolve to normal local package commands, not DB execution', () => {
  const scripts = JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).scripts;
  assert.equal(scripts['test:release-gate-core'], 'node --test scripts/release-gate.test.mjs');
  assert.equal(scripts['test:profile-upgrade-preflight'], 'node --test scripts/profile-upgrade-preflight.test.mjs');
  assert.ok(scripts['test:profile-editing'].startsWith('node --test '));
  assert.ok(scripts['test:profile-editing'].includes('scripts/profile-save-workflow.test.mjs'));
});
