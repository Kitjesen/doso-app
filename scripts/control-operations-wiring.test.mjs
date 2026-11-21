import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';
import * as modes from '../src/features/control/robotModeCapabilities.ts';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let control;
const visit = node => {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'ControlScreen') control = node;
  ts.forEachChild(node, visit);
};
visit(ast);
assert.ok(control);

const pure = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/services/directRobotConnection.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, {
  module: pure,
  exports: pure.exports,
  Date,
  URL,
  require: name => {
    assert.equal(name, '../features/control/robotModeCapabilities.ts');
    return modes;
  },
});

const attribute = name => control.attributes.properties.find(item => item.name?.getText(ast) === name);
const readExpression = (name, context = {}) => {
  const item = attribute(name);
  assert.ok(item?.initializer && ts.isJsxExpression(item.initializer), `ControlScreen must receive explicit ${name}`);
  const code = ts.transpileModule(`(${item.initializer.expression.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(code, {
    describeDirectRobotConnection: pure.exports.describeDirectRobotConnection,
    controlEndpoint: null,
    directConnection: { presentation: null },
    directTelemetry: { presentation: null },
    brainstemControl: { state: { connected: false }, operationCallbacks: {}, operationReadiness: {}, runtimeState: {} },
    ...context,
  });
};

test('unconnected control stays fail-closed without inventing lease, motor state or policy catalogue', () => {
  const state = readExpression('runtimeState');
  assert.equal(state.controlLink, 'unknown');
  assert.equal(state.controlAuthority, 'not-held');
  assert.equal(state.motorState, 'unknown');
  assert.equal(state.posture, 'unknown');
  assert.equal(state.currentPolicy, null);
  assert.equal(state.policyCatalogStatus, 'unknown');
  assert.equal(state.policyOptions.length, 0, 'local profile samples must not become the deployed robot catalogue');
  assert.equal(readExpression('canRecall'), false);
  assert.equal(readExpression('allowInteractionPreview'), false);
});

test('direct control forwards its own callbacks, readiness and profile mapping while merging only telemetry', () => {
  const callbacks = { switchPolicy() {} };
  const readiness = { switchPolicy: { ready: true } };
  const runtimeState = {
    controlLink: 'connected',
    policyCatalogStatus: 'synced',
    currentPolicy: { id: 'w5_89999', label: 'flat: W5' },
    policyOptions: [{ id: 'w5_89999', label: 'flat: W5', terrainModeId: 'flat' }],
    terrainMode: { current: 'flat', catalogStatus: 'synced', options: [{ id: 'flat', label: '平地模式' }] },
  };
  const battery = { voltageV: 52.5, source: 'device' };
  const joints = [{ id: '0', online: true }];
  const context = {
    controlEndpoint: {},
    brainstemControl: { state: { connected: true }, runtimeState, operationCallbacks: callbacks, operationReadiness: readiness },
    directTelemetry: { presentation: { runtimeState: { battery, joints, policyOptions: [], terrainMode: null } } },
  };
  assert.equal(readExpression('operationCallbacks', context), callbacks);
  assert.equal(readExpression('operationReadiness', context), readiness);
  const state = readExpression('runtimeState', context);
  assert.equal(state.terrainMode, runtimeState.terrainMode);
  assert.equal(state.currentPolicy, runtimeState.currentPolicy);
  assert.equal(state.policyOptions, runtimeState.policyOptions);
  assert.equal(state.battery, battery);
  assert.equal(state.joints, joints);
});
