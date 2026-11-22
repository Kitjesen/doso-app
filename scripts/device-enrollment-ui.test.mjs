import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

const [app, screen, service] = await Promise.all([
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/DeviceEnrollmentScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/deviceEnrollmentService.ts', import.meta.url), 'utf8'),
]);

test('device enrollment is reachable only for a bound physical device', () => {
  assert.match(app, /onOpenDeviceEnrollment=\{device && !device\.is_demo/);
  assert.match(app, /stage === 'device-enrollment' && user && device && !device\.is_demo/);
  assert.match(app, /beginDeviceEnrollment\(currentDevice\.id/);
  assert.match(screen, /账户绑定：已完成/);
  assert.match(screen, /不会在此页面发送 Wi-Fi 密码、运动指令或电机命令/);
});

test('enrollment client keeps the challenge in memory and validates the server envelope', () => {
  assert.match(service, /never persisted or logged/);
  assert.match(service, /parseDeviceEnrollmentResponse/);
  assert.match(service, /action: 'begin', deviceId/);
  assert.doesNotMatch(service, /SecureStore|AsyncStorage|console\.log/);
});

function enrollmentAttempt() {
  const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleStartDeviceEnrollment') callback = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(callback);
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const deviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  let resolve;
  const response = new Promise(done => { resolve = done; });
  const accepted = [], errors = [], busy = [];
  const context = { module: { exports: null }, AbortController, device: { id: deviceId, is_demo: false },
    currentUserIdRef: { current: userId }, preparedSessionKeyRef: { current: 'current-session' },
    preparedUserIdRef: { current: userId }, deviceEnrollmentAbortControllerRef: { current: null },
    deviceEnrollmentAttemptRef: { current: 0 }, deviceSettingsContext: { current: { deviceId } },
    BIND_DEVICE_TIMEOUT_MS: 5000, beginDeviceEnrollment: () => response,
    setDeviceEnrollment: value => accepted.push(value), setDeviceEnrollmentBusy: value => busy.push(value),
    setDeviceEnrollmentError: value => errors.push(value), humanizeAuthError: () => 'unexpected failure' };
  const code = ts.transpileModule(`module.exports = ${callback.getText(ast)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, context);
  return { run: context.module.exports, resolve, accepted, errors, busy, context, userId, deviceId };
}

test('enrollment callback rejects another account while accepting the current UUID in either case', async () => {
  const rejected = enrollmentAttempt();
  const pending = rejected.run();
  rejected.resolve({ deviceId: rejected.deviceId, ownerAccountId: rejected.deviceId });
  await pending;
  assert.equal(rejected.accepted.length, 0);
  assert.equal(rejected.errors.at(-1), '设备身份验证服务返回了无法验证的结果。');
  assert.deepEqual(rejected.busy, [true, false]);

  const valid = enrollmentAttempt();
  const completion = valid.run();
  const next = { deviceId: valid.deviceId, ownerAccountId: valid.userId.toUpperCase() };
  valid.resolve(next); await completion;
  assert.deepEqual(valid.accepted, [next]);
});

test('a late enrollment reply cannot update a replaced account, session or device', async () => {
  for (const replace of [
    f => { f.context.currentUserIdRef.current = f.deviceId; },
    f => { f.context.preparedSessionKeyRef.current = 'replacement-session'; },
    f => { f.context.deviceSettingsContext.current.deviceId = f.userId; },
  ]) {
    const f = enrollmentAttempt(); const pending = f.run(); replace(f);
    f.resolve({ deviceId: f.deviceId, ownerAccountId: f.userId }); await pending;
    assert.equal(f.accepted.length, 0);
    assert.deepEqual(f.errors, [null]);
  }
});

