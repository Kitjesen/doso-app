import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL('../src/components/PointCloudView.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load({ platform = 'android', installed = true, validate = value => new URL(value).origin } = {}) {
  const validation = [], nativeNames = [], module = { exports: {} };
  const dependencies = {
    expo: { requireOptionalNativeModule(name) { nativeNames.push(name); return installed ? {} : null; } },
    'expo-modules-core': { requireNativeViewManager(name) { nativeNames.push(name); return 'NativePointCloud'; } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { Platform: { OS: platform }, View: 'View' }, './AppText': { Text: 'Text' },
    '../services/lingtuReadOnly': { validateLingtuOrigin(value, allow) { validation.push([value, allow]); return validate(value, allow); } },
  };
  vm.runInNewContext(source, { module, exports: module.exports, URL, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; } });
  return { ...module.exports, validation, nativeNames };
}

test('SDK endpoint keeps the verified host and scheme and uses the independent SDK port', () => {
  const module = load();
  assert.equal(module.pointCloudEndpoint('https://robot.example.test:5050', false), 'https://robot.example.test:5052');
  assert.equal(module.pointCloudEndpoint('http://192.168.66.64:5050', true), 'http://192.168.66.64:5052');
  assert.equal(module.pointCloudEndpoint('http://[::1]:5050', true), 'http://[::1]:5052');
  assert.equal(module.validation.length, 3); assert.equal(module.validation[1][1], true);
  const denied = load({ validate() { throw new Error('configuration denied'); } });
  assert.throws(() => denied.pointCloudEndpoint('http://public.example.test', false), /configuration denied/);
});

test('old APKs and other platforms show unavailable without creating a native view', () => {
  for (const options of [{ installed: false }, { platform: 'ios' }, { platform: 'web' }]) {
    const module = load(options), view = module.PointCloudView({ endpoint: 'https://robot:5052', kind: 2, active: true });
    assert.equal(view.props.testID, 'point-cloud-unavailable');
    assert.match(view.props.children.props.children, /当前版本不支持原生点云/);
    assert.equal(module.nativeNames.includes('NativePointCloud'), false);
  }
});

test('native props and small status events are passed without point arrays or browser IO', () => {
  const module = load(), update = () => {};
  const view = module.PointCloudView({ endpoint: 'https://robot:5052', kind: 1, active: false, onStatus: update });
  assert.equal(view.type, 'NativePointCloud'); assert.equal(view.props.kind, 1); assert.equal(view.props.active, false);
  assert.equal(view.props.onStatus, update); assert.deepEqual(Object.keys(view.props).sort(), ['active', 'endpoint', 'kind', 'onStatus']);
  assert.equal(module.nativeNames[0], 'DosoPointCloud');
});
