import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function compile(file) {
  return ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function mountScreen() {
  const module = { exports: {} };
  vm.runInNewContext(compile('src/components/PrismaticLoadingScreen.tsx'), {
    module, exports: module.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'expo-status-bar') return { StatusBar: 'StatusBar' };
      if (name === 'react') return {};
      if (name === 'react-native') return {
        View: 'View', Image: 'Image', Text: 'Text', StyleSheet: { create: value => value },
        useWindowDimensions: () => ({ width: 390, height: 844 }),
      };
      if (name.endsWith('.png')) return 'bundled-wordmark';
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const render = () => module.exports.PrismaticLoadingScreen({ label: '恢复会话', children: 'guest-actions' });
  return { render };
}

test('loading uses a plain surface and preserves the supplied escape actions', () => {
  const screen = mountScreen().render();
  assert.equal(screen.props.children.length, 4);
  assert.equal(screen.props.children[1].props.children.props.role, 'status');
  assert.equal(screen.props.children[1].props.children.props.children, '恢复会话');
  assert.equal(screen.props.children[2].props.children, 'guest-actions');
});
