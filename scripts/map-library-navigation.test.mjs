import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function mount(expectedUserId = 'owner') {
  let selected = 'local';
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/screens/MapLibraryScreen.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'react') return { useState: () => [selected, value => { selected = value; }] };
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return { View: 'View', Pressable: 'Pressable', StyleSheet: { create: value => value } };
    if (name === '../components/AppText') return { Text: 'Text' };
    if (name === '../typography') return { typography: { label: {} } };
    if (name === '../appearance') return { useProductAppearance: () => ({}) };
    if (name === './CloudMapsScreen') return { CloudMapsScreen: 'CloudMapsScreen' };
    throw new Error(`Unexpected import ${name}`);
  } });
  const render = () => module.exports.MapLibraryScreen({ expectedUserId, children: 'local-map-subtree' });
  const tab = value => render().props.children[0].props.children.find(node => node.props.testID === `map-library-${value}`);
  return { render, tab };
}

test('cloud selection unmounts local reader, uses current account, and back restores local maps', () => {
  const host = mount();
  assert.equal(host.render().props.children[1], 'local-map-subtree');
  assert.equal(host.tab('local').props.accessibilityState.selected, true);
  host.tab('cloud').props.onPress();
  const cloud = host.render().props.children[1];
  assert.equal(cloud.type, 'CloudMapsScreen');
  assert.equal(cloud.props.expectedUserId, 'owner');
  assert.equal(host.tab('cloud').props.accessibilityState.selected, true);
  cloud.props.onBack();
  assert.equal(host.render().props.children[1], 'local-map-subtree');
});

test('guest cannot open cloud catalog even through a retained tab callback', () => {
  const host = mount(null);
  assert.equal(host.tab('cloud').props.disabled, true);
  host.tab('cloud').props.onPress();
  assert.equal(host.render().props.children[1], 'local-map-subtree');
});
