import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { classifyNativeUi } from './helpers/native-ui-state.mjs';

const pkg = 'com.doso.robot.qa';
const login = ['auth-entry-header', 'login-form', 'login-email', 'login-password', 'login-submit', 'login-register'];
const register = ['auth-entry-header', 'register-form', 'register-username', 'register-email', 'register-password', 'register-submit', 'register-login'];
const node = (resourceId, extra = {}) => ({ packageName: pkg, resourceId, className: 'android.view.View', text: '', description: '', password: false, ...extra });
const input = (ids, extra = {}) => ({ expectedPackage: pkg, expectedActivityResumed: true, nodes: ids.map(id => node(id)), ...extra });

test('exact QA signed-out login quorum permits only offline warm testing', () => {
  const result = classifyNativeUi(input(login));
  assert.equal(result.state, 'signed-out-login');
  assert.equal(result.safeForWarm, true);
  assert.deepEqual(result.markerIds, [...login].sort());
  assert.equal(result.rawValuesRetained, false);
});

test('partial, duplicate, conflicting, foreign, and wrong-activity evidence never authorizes warm testing', () => {
  const cases = [
    input([]), input(login.slice(1)), input([...login, 'login-submit']),
    input([...login, 'register-form']), input([...login, 'home-control']),
    input(login, { expectedActivityResumed: false }), input(login, { expectedPackage: 'foreign' }),
    input(login, { nodes: login.map(id => node(id, { packageName: 'foreign' })) }),
    input(login, { nodes: [...login.map(id => node(id)), node('', { packageName: 'com.android.permissioncontroller' })] }),
    input(login, { nodes: [...login.map(id => node(id)), node('', { packageName: 'com.android.systemui' })] }),
  ];
  for (const scenario of cases) assert.equal(classifyNativeUi(scenario).safeForWarm, false);
});

test('registration and Android-qualified IDs use exact IDs only, including cross-state conflicts', () => {
  for (const ids of [login, register]) {
    const expected = ids === login ? 'signed-out-login' : 'signed-out-register';
    assert.equal(classifyNativeUi(input(ids)).state, expected);
    assert.equal(classifyNativeUi(input(ids.map(id => `${pkg}:id/${id}`))).state, expected);
    assert.equal(classifyNativeUi(input(ids.map(id => `foreign:id/${id}`))).safeForWarm, false);
    assert.equal(classifyNativeUi(input(ids.map(id => `prefix-${id}`))).safeForWarm, false);
    assert.equal(classifyNativeUi(input([...ids, 'font-loading'])).safeForWarm, false);
    assert.equal(classifyNativeUi(input([...ids, 'design-qa-preview'])).safeForWarm, false);
  }
  assert.equal(classifyNativeUi(input([...new Set([...login, ...register])])).safeForWarm, false);
});

test('loading, recovery error, preview, main and system states are diagnostic only and never safe', () => {
  const fixtures = [
    [input(['font-loading']), 'font-loading'],
    [input(['app-font-misans'], { nodes: [node('app-font-misans'), node('', { text: '正在恢复安全会话…' })] }), 'auth-restoring'],
    [input([], { nodes: [node('app-font-misans'), node('', { description: 'DOSO SERVICE, 无法恢复账户会话, 重新尝试' })] }), 'auth-recovery-error'],
    [input(['design-qa-preview']), 'design-qa'],
    [input(['main-navigation']), 'authenticated-or-main'],
    [input([], { nodes: [node('', { packageName: 'com.android.permissioncontroller' })] }), 'permission-dialog'],
    [input([], { nodes: [node('', { packageName: 'com.android.systemui' })] }), 'system-ui'],
    [input([]), 'native-splash-or-empty'],
  ];
  for (const [scenario, expected] of fixtures) {
    const result = classifyNativeUi(scenario);
    assert.equal(result.state, expected);
    assert.equal(result.safeForWarm, false);
  }
});

test('invalid/oversized inputs fail closed without exposing transient canaries', () => {
  const secret = 'private-canary@example.invalid Xs!FakePassword 87654321 654321 eyJfake-token <&>\nnot-for-output';
  for (const value of [null, {}, { nodes: 'bad' }, input([], { nodes: [null] }), input([], { nodes: Array(10001).fill(node('')) }), input([], { nodes: [node('', { text: 'x'.repeat(4097) + secret })] })]) {
    const result = classifyNativeUi(value);
    assert.equal(result.state, 'invalid-input');
    assert.equal(result.safeForWarm, false);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
  const values = input(login, { nodes: [...login.map(id => node(id)), node('', { text: secret, description: secret, className: 'android.widget.EditText', password: true }), node(secret, { text: secret, description: secret, packageName: secret, className: secret })] });
  const result = classifyNativeUi(values);
  for (const canary of secret.split(/\s+/)) assert.equal(JSON.stringify(result).includes(canary), false);
  assert.equal(result.safeForWarm, false);
  const spoof = input([], { nodes: [node('app-font-misans'), node('', { className: 'android.widget.EditText', text: 'DOSO SERVICE, 无法恢复账户会话, 重新尝试' })] });
  assert.equal(classifyNativeUi(spoof).state, 'unknown');
});

test('UTF-8 stdin CLI emits only a fixed schema and never echoes invalid or secret input', () => {
  const run = value => spawnSync(process.execPath, ['scripts/classify-native-ui.mjs'], { input: value, encoding: 'utf8', timeout: 5000 });
  const good = run(JSON.stringify(input(login)));
  assert.equal(good.status, 0);
  assert.equal(JSON.parse(good.stdout).state, 'signed-out-login');
  for (const value of ['<xml><!DOCTYPE x [<!ENTITY x "canary-secret">]></xml>', '{"nodes":"canary-secret"', 'x'.repeat(8 * 1024 * 1024 + 1)]) {
    const bad = run(value);
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).state, 'invalid-input');
    assert.equal(bad.stderr, '');
    assert.equal(bad.stdout.includes('canary-secret'), false);
  }
  const merged = run(JSON.stringify(input([], { nodes: [node('app-font-system-fallback'), node('', { description: 'DOSO SERVICE, 无法恢复账户会话, 重新尝试' })] })));
  assert.equal(JSON.parse(merged.stdout).state, 'auth-recovery-error');
  assert.equal(JSON.parse(merged.stdout).safeForWarm, false);
});

test('an extra app-owned sensitive input cannot ride along with an otherwise safe form', () => {
  for (const ids of [login, register]) {
    for (const extra of [{ className: 'android.widget.EditText' }, { password: true }]) {
      const result = classifyNativeUi(input([], { nodes: [...ids.map(id => node(id)), node('untrusted-field', { ...extra, text: 'synthetic-private-value' })] }));
      assert.equal(result.safeForWarm, false);
      assert.equal(JSON.stringify(result).includes('synthetic-private-value'), false);
    }
  }
});

test('foreign packages become only exact fixed category counts, never raw identifiers', () => {
  const packages = ['android', 'android', 'com.android.systemui', 'com.android.permissioncontroller',
    'com.android.inputmethod.latin', 'com.android.launcher3', 'com.android.settings', 'com.android.shell',
    'com.doso.robot', '', 'private-canary@example.invalid-token-87654321'];
  const result = classifyNativeUi(input([], { nodes: packages.map(packageName => node('', { packageName })) }));
  assert.deepEqual(result.foreignNodeCounts, { framework: 2, systemUi: 1, permissionController: 1,
    inputMethod: 1, launcher: 1, settings: 1, shell: 1, dosoNamespace: 1, missingPackage: 1, other: 1 });
  assert.equal(result.safeForWarm, false);
  assert.equal(Object.values(result.foreignNodeCounts).reduce((a, b) => a + b, 0), result.nodeCount - result.appNodeCount);
  for (const packageName of packages.filter(Boolean)) assert.equal(JSON.stringify(result).includes(packageName), false);
});

test('only exact system-owned fixed error control IDs become diagnostic markers', () => {
  const markers = ['android:id/aerr_wait', 'android:id/aerr_close', 'android:id/aerr_restart', 'android:id/aerr_report'];
  for (const packageName of ['android', 'com.android.systemui']) {
    const result = classifyNativeUi(input([], { nodes: [...markers, ...markers].map(resourceId => node(resourceId, { packageName })) }));
    assert.deepEqual(result.foreignMarkerIds, [...markers].sort());
    assert.equal(result.safeForWarm, false);
  }
  for (const packageName of [pkg, 'com.android.shell', 'com.android.inputmethod.latin', 'com.android.launcher3', 'unknown-private-package']) {
    assert.deepEqual(classifyNativeUi(input([], { nodes: markers.map(resourceId => node(resourceId, { packageName })) })).foreignMarkerIds, []);
  }
  for (const resourceId of ['aerr_close', 'android:id/aerr_close-extra', 'prefix-android:id/aerr_close', ' android:id/aerr_close', 'android:id/AERR_CLOSE']) {
    assert.deepEqual(classifyNativeUi(input([], { nodes: [node(resourceId, { packageName: 'android' })] })).foreignMarkerIds, []);
  }
});

test('aliases are exact, lookalikes collapse to other and every mixed form remains unsafe', () => {
  const cases = [
    ['com.google.android.permissioncontroller', 'permissionController'],
    ['com.google.android.inputmethod.latin', 'inputMethod'],
    ['com.google.android.apps.nexuslauncher', 'launcher'],
    ['com.doso.robot.evil', 'other'], ['com.doso.robot.qa.evil', 'other'],
    ['Android', 'other'], [' android', 'other'], ['com.android.systemui ', 'other'],
    ['__proto__', 'other'], ['constructor', 'other'], ['', 'missingPackage'],
  ];
  for (const [packageName, category] of cases) {
    const result = classifyNativeUi(input([], { nodes: [...login.map(id => node(id)), node('', { packageName })] }));
    assert.equal(result.foreignNodeCounts[category], 1);
    assert.equal(Object.values(result.foreignNodeCounts).reduce((a, b) => a + b, 0), 1);
    assert.equal(result.scope, 'mixed');
    assert.equal(result.safeForWarm, false);
  }
  for (const value of [null, {}, input([], { nodes: [node('', { packageName: null })] })]) {
    const result = classifyNativeUi(value);
    assert.deepEqual(Object.values(result.foreignNodeCounts), Array(10).fill(0));
    assert.deepEqual(result.foreignMarkerIds, []);
  }
});

test('new diagnostics do not retain any arbitrary UI attributes across helper and real CLI', () => {
  const canaries = ['private-package-canary', 'private-resource-canary', 'private-class-canary',
    'private-email@example.invalid', 'private-description-canary', 'private-password-canary'];
  const fixture = input([], { nodes: [
    node(canaries[1], { packageName: canaries[0], className: canaries[2], text: canaries[3], description: canaries[4] }),
    node('android:id/aerr_close', { packageName: 'android', text: canaries[5], password: true }),
  ] });
  const direct = classifyNativeUi(fixture);
  assert.deepEqual(direct.foreignMarkerIds, ['android:id/aerr_close']);
  assert.equal(direct.safeForWarm, false);
  const cli = spawnSync(process.execPath, ['scripts/classify-native-ui.mjs'], { input: JSON.stringify(fixture), encoding: 'utf8', timeout: 5000 });
  assert.equal(cli.status, 0);
  assert.equal(cli.stderr, '');
  assert.deepEqual(JSON.parse(cli.stdout), direct);
  for (const canary of canaries) assert.equal(JSON.stringify(direct).includes(canary) || cli.stdout.includes(canary), false);
  assert.deepEqual(Object.keys(direct).sort(), ['state', 'scope', 'nodeCount', 'appNodeCount', 'inputNodeCount',
    'markerIds', 'foreignNodeCounts', 'foreignMarkerIds', 'safeForWarm', 'rawValuesRetained'].sort());
});
