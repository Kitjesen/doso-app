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
  const chosen = [], devices = [], stages = [], notices = [];
  const helper = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read('src/services/deviceBootstrapIntent.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: helper, exports: helper.exports });
  const intent = helper.exports.createDeviceBootstrapIntent();
  intent.update({ userId: 'fixture-user', ready: true, reset: false });
  const invoke = vm.runInNewContext(compiled, {
    deviceBootstrapIntent: { current: intent },
    setSelectedModel: value => chosen.push(value), setDevice: value => devices.push(value),
    setStage: value => stages.push(value),
    notify: (...args) => notices.push(args),
  });
  const model = { id: 'thunder-01', name: 'THUNDER 01' };
  await invoke(model);
  assert.equal(chosen[0], model);
  assert.deepEqual(devices, [null]);
  assert.deepEqual(stages, ['control']);
  assert.doesNotMatch(notices.flat().join(' '), /预览|已连接|绑定成功/);
  assert.match(notices[0][1], /尚未绑定机器人.*机身二维码/);
  assert.equal(intent.preservesNavigation('fixture-user'), true);
});

test('choosing a model reports a restored local robot connection when one is remembered', async () => {
  const handler = declarations.find(node => node.name.getText(ast) === 'enterApp');
  const compiled = ts.transpileModule(`(${handler.initializer.getText(ast)})`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const notices = [];
  const helper = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read('src/services/deviceBootstrapIntent.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: helper, exports: helper.exports });
  const intent = helper.exports.createDeviceBootstrapIntent();
  intent.update({ userId: 'fixture-user', ready: true, reset: false });
  const invoke = vm.runInNewContext(compiled, {
    deviceBootstrapIntent: { current: intent },
    setSelectedModel() {}, setDevice() {}, setActiveTab() {}, setStage() {},
    controlTarget: 'direct', controlEndpoint: null,
    rememberedControl: { connection: { endpoint: { host: '192.168.66.64', port: 13145 } } },
    directConnection: { snapshot: null },
    notify: (...args) => notices.push(args),
  });
  await invoke({ id: 'thunder-01', name: 'THUNDER 01' });
  assert.match(notices[0][1], /已恢复机器狗局域网连接/);
});

test('Android upgrade preparation increments the shared version while keeping the existing QA application identity', () => {
  const config = JSON.parse(read('app.json'));
  const gradle = read('android/app/build.gradle');
  assert.equal(config.expo.android.package, 'com.doso.robot');
  assert.ok(Number.isSafeInteger(config.expo.android.versionCode) && config.expo.android.versionCode >= 51);
  const code = gradle.match(/defaultConfig\s*\{[\s\S]*?applicationId 'com\.doso\.robot'[\s\S]*?versionCode (\d+)\b/);
  assert.equal(Number(code?.[1]), config.expo.android.versionCode);
  assert.match(gradle, /qa\s*\{\s*initWith release\s*applicationIdSuffix "\.qa"/);
  assert.equal(JSON.parse(read('package.json')).main, 'index.ts');
  assert.match(read('index.ts'), /createElement\(AuthProvider, null, createElement\(App\)\)/);
  assert.match(read('src/screens/MapScreen.tsx'), /showExamples = false/);
  const mounted = new Set();
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) mounted.add(node.tagName.getText(ast));
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const screen of ['RobotMainNav', 'ControlScreen', 'JointStatusScreen', 'ProfileScreen']) assert.ok(mounted.has(screen), screen);
  for (const screen of ['HomeScreen', 'MapLibraryScreen', 'MapScreen', 'TasksScreen', 'AnalysisScreen']) assert.ok(!mounted.has(screen), screen);
});
