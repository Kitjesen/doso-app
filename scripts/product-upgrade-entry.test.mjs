import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const app = read('App.tsx');
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = [];
function visit(node) { if (ts.isVariableDeclaration(node)) declarations.push(node); ts.forEachChild(node, visit); }
visit(ast);

test('choosing a model enters the normal app without a fake binding or development-preview announcement', async () => {
  const handler = declarations.find(node => node.name.getText(ast) === 'enterApp');
  assert.ok(handler);
  const compiled = ts.transpileModule(`(${handler.initializer.getText(ast)})`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const chosen = [], devices = [], tabs = [], stages = [], notices = [];
  const helper = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read('src/services/deviceBootstrapIntent.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: helper, exports: helper.exports });
  const intent = helper.exports.createDeviceBootstrapIntent();
  intent.update({ userId: 'fixture-user', ready: true, reset: false });
  const invoke = vm.runInNewContext(compiled, {
    deviceBootstrapIntent: { current: intent },
    setSelectedModel: value => chosen.push(value), setDevice: value => devices.push(value),
    setActiveTab: value => tabs.push(value), setStage: value => stages.push(value),
    notify: (...args) => notices.push(args),
  });
  const model = { id: 'thunder-01', name: 'THUNDER 01' };
  await invoke(model);
  assert.equal(chosen[0], model);
  assert.deepEqual(devices, [null]);
  assert.deepEqual(tabs, ['home']);
  assert.deepEqual(stages, ['main']);
  assert.doesNotMatch(notices.flat().join(' '), /预览|已连接|绑定成功/);
  assert.match(notices[0][1], /尚未绑定机器人.*序列号和绑定码/);
  assert.equal(intent.preservesNavigation('fixture-user'), true);
});

test('Android upgrade preparation increments the shared version while keeping the existing QA application identity', () => {
  const config = JSON.parse(read('app.json'));
  const gradle = read('android/app/build.gradle');
  assert.equal(config.expo.android.package, 'com.doso.robot');
  assert.equal(config.expo.android.versionCode, 9);
  assert.match(gradle, /defaultConfig\s*\{[\s\S]*?applicationId 'com\.doso\.robot'[\s\S]*?versionCode 9\b/);
  assert.match(gradle, /qa\s*\{\s*initWith release\s*applicationIdSuffix "\.qa"/);
  assert.equal(JSON.parse(read('package.json')).main, 'index.ts');
  assert.match(read('index.ts'), /createElement\(AuthProvider, null, createElement\(App\)\)/);
  assert.match(read('src/screens/MapScreen.tsx'), /showExamples = false/);
  const maps = [];
  function visitMaps(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'MapScreen') maps.push(node);
    ts.forEachChild(node, visitMaps);
  }
  visitMaps(ast);
  assert.ok(maps.length > 0);
  for (const map of maps) {
    const examples = map.attributes.properties.find(attribute => attribute.name?.getText(ast) === 'showExamples');
    assert.ok(!examples || (examples.initializer && ts.isJsxExpression(examples.initializer)
      && examples.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword), 'normal App must never opt into example galleries');
  }
});
