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

test('production control lists per-operation integration gaps without granting physical callbacks', () => {
  const readiness = readExpression('operationReadiness');
  for (const operation of ['stop', 'stand', 'sit', 'enableMotor', 'disableMotor', 'switchPolicy']) {
    assert.equal(readiness[operation]?.ready, false, operation);
    assert.ok(readiness[operation]?.blockedReason?.trim(), `${operation} needs an actionable unavailable reason`);
  }
  assert.equal(attribute('operationCallbacks'), undefined, 'read-only native module cannot actuate physical operations');
  assert.match(source, /PRODUCTION_ROBOT_COMMAND_EXECUTOR: RobotCommandExecutor \| null = null/);
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
