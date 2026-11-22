import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const compile = source => ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }
}).outputText;
const app = ts.createSourceFile('App.tsx', read('App.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function nodes(predicate) {
  const found = []; const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(app); return found;
}
const connection = nodes(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(app) === 'RobotConnectionScreen')[0];
const viewCallback = connection.attributes.properties.find(prop => prop.name?.getText(app) === 'onViewVideo').initializer.expression.getText(app);
const evaluate = (expression, context) => vm.runInNewContext(compile(`(${expression})`), context);

test('formal App explicitly opens a foreign video source without changing a robot or navigation binding', () => {
  const selected = [], selection = { current: { ownerKey: 'local-workspace', viewReady: true } };
  const context = {
    canViewReadOnlyVideo: true, navigationSelection: selection, WORKSPACE_OWNER_KEY: 'local-workspace',
    AppState: { currentState: 'active' }, isBrainstemLanAvailable: () => true,
    validateLingtuOrigin: origin => new URL(origin).origin,
    setVideoViewing: value => selected.push(value),
  };
  const open = evaluate(viewCallback, context);
  assert.equal(open('http://192.168.66.65:15051'), true);
  assert.equal(selected[0].origin, 'http://192.168.66.65:15051');
  assert.equal(selected[0].ownerKey, 'local-workspace');
  assert.equal(selection.current.viewReady, false);
  assert.equal(open('http://192.168.66.66:15051'), false, 'a retired callback cannot replace the visible source');
  assert.equal(selected.length, 1);
});

test('video selection rejects background callbacks, invalid origins and HTTP credentials', () => {
  const selected = [], context = {
    canViewReadOnlyVideo: true, navigationSelection: { current: { ownerKey: 'local-workspace', viewReady: true } },
    WORKSPACE_OWNER_KEY: 'local-workspace', AppState: { currentState: 'active' },
    isBrainstemLanAvailable: () => true, validateLingtuOrigin: origin => { if (origin === 'bad') throw Error(); return new URL(origin).origin; },
    setVideoViewing: value => selected.push(value),
  };
  const open = evaluate(viewCallback, context);
  assert.equal(open('bad'), false);
  assert.equal(open('http://192.168.66.65:15051', 'credential'), false);
  context.AppState.currentState = 'background'; assert.equal(open('https://camera.example'), false);
  assert.equal(selected.length, 0);
  assert.equal(evaluate(viewCallback, { canViewReadOnlyVideo: false }), undefined);
});

test('closing the connection route or mismatching workspace owner retires viewing credentials', () => {
  const effect = nodes(node => ts.isCallExpression(node) && node.expression.getText(app) === 'useEffect'
    && node.arguments[0]?.getText(app).includes('videoViewing &&'))[0];
  assert.ok(effect);
  for (const update of [{ videoRouteActive: false }, { WORKSPACE_OWNER_KEY: 'other-owner' }]) {
    const discarded = [];
    evaluate(`(() => { ${effect.getText(app)} })()`, {
      useEffect: run => run(), videoViewing: { ownerKey: 'local-workspace', origin: 'https://nx.example', viewerToken: 'memory-only' },
      videoRouteActive: true, WORKSPACE_OWNER_KEY: 'local-workspace',
      setVideoViewing: value => discarded.push(value), ...update,
    });
    assert.equal(discarded.length, 1); assert.equal(discarded[0], null);
  }
});

test('a read-only viewer belongs to the connection overlay', () => {
  const route = nodes(n => ts.isVariableDeclaration(n) && n.name.getText(app) === 'videoRouteActive')[0].initializer.getText(app);
  assert.equal(evaluate(route, { robotConnectionVisible: true }), true);
  assert.equal(evaluate(route, { robotConnectionVisible: false }), false);
});

function mountViewer(initial) {
  let options, active, back, appStateChange, retries = 0, returns = 0;
  let appState = 'active', tree, mounted = false;
  let listeners = 0;
  const cleanups = [];
  const presentation = { id: 'receiver-1', phase: 'stalled' }, surface = {};
  const probe = { exports: {} };
  vm.runInNewContext(compile(read('src/features/control/videoProbeUrl.ts')), { module: probe, exports: probe.exports });
  const imports = {
    '@expo/vector-icons': { Ionicons: 'Icon' },
    react: {
      useEffect: effect => { if (!mounted) cleanups.push(effect()); },
      useState: () => [appState, next => { appState = next; }],
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': {
      AppState: { currentState: 'active', addEventListener: (_name, callback) => { appStateChange = callback; listeners++; return { remove: () => listeners-- }; } },
      BackHandler: { addEventListener: (_name, callback) => { back = callback; listeners++; return { remove: () => listeners-- }; } },
      Pressable: 'Button', View: 'View', StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' } },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../components/AppText': { Text: 'Text' }, '../components/ControlVideoSurface': { ControlVideoSurface: 'Video' },
    '../components/DepthSnapshotView': { DepthSnapshotView: 'Depth' },
    '../features/control/videoProbeUrl': probe.exports,
    '../features/video/useControlVideoReceiver': {
      useControlVideoReceiver: (config, enabled) => {
        options = config; active = enabled; return { presentation, surface, reconnect: () => retries++ };
      }
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compile(read('src/screens/VideoViewerScreen.tsx')), {
    module, exports: module.exports,
    require: name => { assert.ok(name in imports, `viewing must not import control/auth: ${name}`); return imports[name]; }
  });
  let props = { origin: 'https://nx.example', viewerToken: 'session-only', allowLocalHttp: false, onBack: () => returns++, ...initial };
  function render(changes) {
    props = { ...props, ...changes };
    tree = module.exports.VideoViewerScreen(props);
    mounted = true;
  }
  function find(id, node = tree) {
    if (!node || typeof node !== 'object') return;
    if (node.props?.testID === id || node.type === id) return node;
    for (const child of [node.props?.children].flat(Infinity).filter(value => value !== undefined)) { const found = find(id, child); if (found) return found; }
  }
  render();
  return {
    render, find, presentation, surface,
    setAppState(value) { appStateChange(value); render(); },
    back: () => back(), cleanup: () => cleanups.forEach(cleanup => cleanup()),
    get retries() { return retries; }, get returns() { return returns; }, get listeners() { return listeners; },
    get options() { return options; }, get active() { return active; },
  };
}

test('video viewer uses the shared receiver, names the source and offers retry without importing control', () => {
  const view = mountViewer();
  assert.equal(view.options.gatewayUrl, 'https://nx.example'); assert.equal(view.options.viewerToken, 'session-only');
  assert.equal(view.active, true); assert.equal(view.find('video-viewer-source').props.children, 'https://nx.example');
  assert.equal(view.find('Video').props.presentation, view.presentation); assert.equal(view.find('Video').props.surface, view.surface);
  assert.equal(view.find('Depth'), undefined);
  view.find('video-viewer-reconnect').props.onPress(); assert.equal(view.retries, 1);
  assert.equal(view.back(), true); assert.equal(view.returns, 1);
  view.find('video-viewer-back').props.onPress(); assert.equal(view.returns, 2);
  assert.equal(view.listeners, 2);
  view.cleanup(); assert.equal(view.listeners, 0);
});

test('depth stays on the selected same-origin LAN gateway and pauses with the video in background', () => {
  const origin = 'http://192.168.66.64:5050';
  const view = mountViewer({ origin, viewerToken: undefined, allowLocalHttp: true });
  assert.equal(view.find('Depth'), undefined, 'an explicitly selected video source alone cannot enable a depth probe');
  view.render({ depthHost: '192.168.66.64' });
  assert.equal(view.find('video-viewer-depth').props.pointerEvents, 'box-none');
  assert.equal(view.find('Depth').props.host, '192.168.66.64');
  assert.equal(view.find('Depth').props.active, true);
  view.setAppState('background');
  assert.equal(view.active, false); assert.equal(view.find('Depth').props.active, false);
  view.setAppState('active');
  assert.equal(view.active, true); assert.equal(view.find('Depth').props.active, true);
  for (const changes of [
    { origin: 'http://192.168.66.65:5050' },
    { origin: 'http://192.168.66.64:15051' },
    { origin: 'https://192.168.66.64:5050' },
    { origin, viewerToken: 'private' },
    { origin, allowLocalHttp: false },
    { origin: 'http://8.8.8.8:5050', depthHost: '8.8.8.8' },
  ]) {
    view.render({ origin, depthHost: '192.168.66.64', viewerToken: undefined, allowLocalHttp: true, ...changes });
    assert.equal(view.find('Depth'), undefined);
  }
  view.cleanup();
});
