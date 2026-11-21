import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const find = predicate => { const all = []; const visit = node => { if (predicate(node)) all.push(node); ts.forEachChild(node, visit); }; visit(source); return all; };
const entry = find(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'RobotConnectionScreen')[0];
const binding = entry.attributes.properties.find(prop => prop.name?.getText(source) === 'onUseNavigation').initializer.expression.getText(source);
const endpointExpression = find(node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'navigationEndpoint')[0].initializer.getText(source);
const evaluate = (expression, values) => {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(`module.exports = (${expression});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, ...values });
  return module.exports;
};

test('control accepts only a validated video source on the current direct robot host', () => {
  const owner = {}, values = [], context = { current: owner }, selection = { current: { owner, ready: true } };
  const controlEndpoint = { host: 'lingtu.example.test', port: 13145 };
  const callback = evaluate(binding, {
    canOpenRobotAccountActions: true, deviceSettingsContext: context, deviceSettingsRenderContext: owner, navigationSelection: selection,
    videoTargetGeneration: { current: { generation: 0 } }, navigationVideoGeneration: 0, controlTarget: 'direct', controlEndpoint, robotConnectionOwnerKey: 'owner',
    bindVideoOrigin(key, endpoint, origin) { return new URL(origin).hostname === endpoint.host ? key : null; },
    AppState: { currentState: 'active' }, isBrainstemLanAvailable: () => false,
    validateLingtuOrigin: value => { const url = new URL(value); if (url.protocol !== 'https:') throw new Error(); return url.origin; },
    setNavigationBinding: value => values.push(value),
    setStage: stage => values.push(stage), setRobotConnectionVisible: value => values.push(value),
  });
  assert.equal(callback('http://192.168.1.3:5050'), false); assert.equal(values.length, 0);
  assert.equal(callback('https://other.example.test'), false);
  assert.equal(callback('https://lingtu.example.test/'), true);
  assert.equal(values[0].owner, owner); assert.equal(values[0].endpoint, 'https://lingtu.example.test');
  assert.deepEqual(values.slice(1), ['control', false]);
  selection.current.ready = false; assert.equal(callback('https://lingtu.example.test'), false);
  selection.current.ready = true;
  context.current = {}; assert.equal(callback('https://lingtu.example.test'), false);
  assert.equal(values.length, 3);
});

test('diagnostic and blocked account routes never receive a navigation binding callback', () => {
  assert.equal(evaluate(binding, { canOpenRobotAccountActions: false }), undefined);
  assert.equal(evaluate(binding, { canOpenRobotAccountActions: true, controlTarget: 'account' }), undefined);
  assert.equal(evaluate(binding, { canOpenRobotAccountActions: true, controlTarget: 'direct', controlEndpoint: null }), undefined);
});

test('saved navigation address is hidden after session/device owner replacement or readiness loss', () => {
  const owner = {}, binding = { owner, endpoint: 'https://lingtu.example.test' };
  for (const [ready, currentOwner, expected] of [[true, owner, binding.endpoint], [false, owner, null], [true, {}, null]]) {
    assert.equal(evaluate(endpointExpression, { directConnectionReady: ready, navigationBinding: binding, deviceSettingsRenderContext: currentOwner }), expected);
  }
  const pages = find(node => ts.isJsxSelfClosingElement(node) && ['LingtuMapsScreen', 'LingtuTaskScreen', 'MapScreen', 'TasksScreen', 'AnalysisScreen', 'HomeScreen'].includes(node.tagName.getText(source)));
  assert.equal(pages.length, 0);
});
