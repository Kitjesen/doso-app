import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = ts.createSourceFile('App.tsx', readFileSync(new URL('../App.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
const visit = node => { nodes.push(node); ts.forEachChild(node, visit); };
visit(source);
const initializer = name => nodes.find(node => ts.isVariableDeclaration(node) && node.name.getText(source) === name).initializer.getText(source);
const prop = (component, name) => nodes.find(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === component)
  .attributes.properties.find(node => node.name?.getText(source) === name).initializer.expression.getText(source);
const backEffect = nodes.find(node => ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect'
  && node.arguments[0]?.getText(source).includes("BackHandler.addEventListener('hardwareBackPress'")).arguments[0].getText(source);

function fixture() {
  const state = { stage: 'main', tab: 'home', panelVisible: true };
  let hardwareBack;
  const context = vm.createContext({
    useRef: value => ({ current: value }), useCallback: fn => fn,
    Platform: { OS: 'android' }, __DEV__: false,
    deviceTestMode: false, robotConnectionVisible: false, guestMode: false,
    canOpenRobotAccountActions: true,
    deviceName: 'Known robot',
    setStage: stage => { state.stage = stage; context.stage = stage; },
    setActiveTab: tab => { state.tab = tab; },
    setRobotConnectionVisible: value => { state.panelVisible = value; },
    BackHandler: { addEventListener(name, handler) { assert.equal(name, 'hardwareBackPress'); hardwareBack = handler; return { remove() {} }; } },
  });
  const evaluate = expression => vm.runInContext(ts.transpileModule(`(${expression});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  for (const name of ['bleReturnStage', 'bleRobotIdRef', 'returnToDeviceSettings', 'openBleDiscovery', 'returnFromBleDiscovery']) {
    context[name] = evaluate(initializer(name));
  }
  evaluate(backEffect)();
  return {
    state,
    fromBinding: () => evaluate(prop('BindDeviceScreen', 'onFindNearby'))(),
    fromSettings: () => evaluate(prop('ProfileScreen', 'onOpenBleDiscovery'))(),
    fromConnection: () => evaluate(prop('RobotConnectionScreen', 'onOpenBleDiscovery'))(),
    backButton: () => evaluate(prop('BleDiscoveryScreen', 'onBack'))(),
    selectRobot: id => evaluate(prop('BleDiscoveryScreen', 'onRobotSelected'))(id),
    expectedRobotId: () => evaluate(prop('BindDeviceScreen', 'expectedRobotId')),
    hardwareBack: () => hardwareBack(),
    displayedTarget: () => evaluate(prop('BleDiscoveryScreen', 'deviceName')),
  };
}

test('selected robot ID reaches the binding screen and resets on a new search', () => {
  const app = fixture();
  app.fromBinding();
  app.selectRobot('7369cda7-9631-4bb4-a4ce-01646b1b56d5');
  assert.equal(app.state.stage, 'bind-device');
  assert.equal(app.expectedRobotId(), '7369cda7-9631-4bb4-a4ce-01646b1b56d5');
  app.fromBinding();
  app.backButton();
  assert.equal(app.expectedRobotId(), null);
});

test('nearby discovery returns to the adding page from its screen back action', () => {
  const app = fixture();
  app.fromBinding();
  assert.equal(app.state.stage, 'ble-discovery');
  assert.equal(app.displayedTarget(), '机器人');
  app.backButton();
  assert.equal(app.state.stage, 'bind-device');
  assert.equal(app.state.tab, 'home');
});

test('Android back returns to the adding page and settings entry resets that origin', () => {
  const app = fixture();
  app.fromBinding();
  assert.equal(app.hardwareBack(), true);
  assert.equal(app.state.stage, 'bind-device');
  app.fromSettings();
  assert.equal(app.state.stage, 'ble-discovery');
  assert.equal(app.displayedTarget(), 'Known robot');
  assert.equal(app.hardwareBack(), true);
  assert.equal(app.state.stage, 'main');
  assert.equal(app.state.tab, 'profile');
});

test('connection-panel discovery closes its panel and returns to settings', () => {
  const app = fixture();
  app.fromBinding();
  app.fromConnection();
  assert.equal(app.state.panelVisible, false);
  assert.equal(app.state.stage, 'ble-discovery');
  app.backButton();
  assert.equal(app.state.stage, 'main');
  assert.equal(app.state.tab, 'profile');
});
