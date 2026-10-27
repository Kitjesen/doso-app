import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let control;
const visit = node => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'ControlScreen') control = node;
  ts.forEachChild(node, visit);
};
visit(ast);
assert.ok(control);
const attribute = name => control.attributes.properties.find(item => item.name?.getText(ast) === name);
const readExpression = (name, context = { controlTarget: 'account', device: null, deviceEnrollment: null }) => {
  const item = attribute(name);
  assert.ok(item?.initializer && ts.isJsxExpression(item.initializer), `ControlScreen must receive explicit ${name}`);
  const code = ts.transpileModule(`(${item.initializer.expression.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(code, context);
};

test('cloud control lists per-operation integration gaps without granting physical callbacks', () => {
  const readiness = readExpression('operationReadiness');
  for (const operation of ['stop', 'stand', 'sit', 'enableMotor', 'disableMotor', 'switchPolicy']) {
    assert.equal(readiness[operation]?.ready, false, operation);
    assert.ok(readiness[operation]?.blockedReason?.trim(), `${operation} needs an actionable unavailable reason`);
  }
  assert.equal(readExpression('operationCallbacks'), undefined, 'cloud devices must not receive direct physical callbacks');
  assert.match(source, /PRODUCTION_ROBOT_COMMAND_EXECUTOR: RobotCommandExecutor \| null = null/);
});

test('direct control forwards its own callbacks, readiness and profile mapping while merging only telemetry', () => {
  const callbacks = { switchPolicy() {} };
  const readiness = { switchPolicy: { ready: true } };
  const runtimeState = { controlLink: 'connected', policyCatalogStatus: 'synced',
    currentPolicy: { id: 'w5_89999', label: 'flat: W5' },
    policyOptions: [{ id: 'w5_89999', label: 'flat: W5', terrainModeId: 'flat' }],
    terrainMode: { current: 'flat', catalogStatus: 'synced', options: [{ id: 'flat', label: '平地模式' }] } };
  const battery = { voltageV: 52.5, source: 'device' };
  const joints = [{ id: '0', online: true }];
  const context = { controlTarget: 'direct', controlEndpoint: {},
    brainstemControl: { state: { connected: true }, runtimeState, operationCallbacks: callbacks, operationReadiness: readiness },
    directTelemetry: { presentation: { runtimeState: { battery, joints, policyOptions: [], terrainMode: null } } } };
  assert.equal(readExpression('operationCallbacks', context), callbacks);
  assert.equal(readExpression('operationReadiness', context), readiness);
  const state = readExpression('runtimeState', context);
  assert.equal(state.terrainMode, runtimeState.terrainMode);
  assert.equal(state.currentPolicy, runtimeState.currentPolicy);
  assert.equal(state.policyOptions, runtimeState.policyOptions);
  assert.equal(state.battery, battery);
  assert.equal(state.joints, joints);
});

test('cloud device presence does not invent a controller lease, motor state or robot policy catalogue', () => {
  const state = readExpression('runtimeState');
  assert.equal(state.controlLink, 'disconnected');
  assert.equal(state.controlAuthority, 'unknown');
  assert.equal(state.motorState, 'unknown');
  assert.equal(state.posture, 'unknown');
  assert.equal(state.currentPolicy, null);
  assert.equal(state.policyCatalogStatus, 'unknown');
  assert.equal(state.policyOptions.length, 0, 'local profile samples must not become the deployed robot catalogue');
});
