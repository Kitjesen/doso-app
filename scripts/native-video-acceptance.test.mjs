import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

function mount() {
  const slots = [], effects = [], timers = new Map();
  let cursor = 0, tree, pending, appState, receiverConfig, timerId = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const module = { exports: {} };
  const dependencies = {
    react: {
      useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = initial; return [slots[id], value => { slots[id] = typeof value === 'function' ? value(slots[id]) : value; }]; },
      useRef(initial) { const id = cursor++; return slots[id] ??= { current: initial }; },
      useEffect(effect, deps) { const id = cursor++; const old = slots[id]; if (!old || deps.some((x, i) => x !== old.deps[i])) effects.push(() => { old?.cleanup?.(); slots[id] = { deps, cleanup: effect() }; }); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { AppState: { addEventListener(_, callback) { appState = callback; return { remove() {} }; } },
      Pressable: 'Button', View: 'View', StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../components/AppText': { Text: 'Text', TextInput: 'Input' },
    '../components/ControlVideoSurface': { ControlVideoSurface: 'Video' },
    '../features/video/useControlVideoReceiver': { useControlVideoReceiver(config) { receiverConfig = config; return { presentation: { phase: config ? 'connecting' : 'unconfigured' }, surface: null }; } },
    '../services/lingtuReadOnly': {
      readLingtuStatus(options) { return new Promise((resolve, reject) => { pending = { options, resolve, reject }; }); },
      isLingtuStatusFresh: x => x.fresh,
    },
  };
  vm.runInNewContext(ts.transpileModule(read('src/screens/VideoAcceptanceScreen.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module, exports: module.exports, require: name => {
    assert.ok(dependencies[name], `unexpected dependency: ${name}`); return dependencies[name];
  }, AbortController, setTimeout: callback => { const id = ++timerId; timers.set(id, callback); return id; }, clearTimeout: id => timers.delete(id) });
  function render() { cursor = 0; tree = module.exports.VideoAcceptanceScreen(); while (effects.length) effects.shift()(); }
  function find(id, node = tree) {
    if (!node || typeof node !== 'object') return;
    if (node.props?.testID === id) return node;
    for (const child of [node.props?.children].flat(Infinity).filter(value => value !== undefined)) { const found = find(id, child); if (found) return found; }
  }
  render();
  return { render, find, background: () => appState('background'), expire: () => [...timers.values()].forEach(x => x()),
    get pending() { return pending; }, get config() { return receiverConfig; } };
}
const snapshot = { endpoint: 'http://192.168.66.65:15051', fresh: true, features: { whep: true }, readiness: { ready: false } };
const settle = () => new Promise(resolve => setImmediate(resolve));

test('video build proof accepts only the selected bundle and assemble tasks', async () => {
  const { createQaProgressScanner } = await import('./qa-build-once.mjs');
  const scanner = createQaProgressScanner({ bundle: ':app:createBundleVideotestJsAndAssets', assemble: ':app:assembleVideotest' });
  scanner.push(Buffer.from('> Task :app:createBundleQaJsAndAssets\n> Task :app:assembleQa\n'));
  assert.equal(scanner.finish().bundleExecuted, false);
  const video = createQaProgressScanner({ bundle: ':app:createBundleVideotestJsAndAssets', assemble: ':app:assembleVideotest' });
  video.push(Buffer.from('> Task :app:createBundleVideotestJsAndAssets\n> Task :app:assembleVideotest\nBUILD SUCCESSFUL in 4m\n'));
  assert.deepEqual(video.finish(), { bundleExecuted: true, assembleCompleted: true, buildSuccessful: true, rejected: false });
});

test('real fresh video capability permits receive-only testing while navigation is unready; stop and expiry release', async () => {
  const view = mount();
  view.find('video-test-endpoint').props.onChangeText(snapshot.endpoint); view.render();
  view.find('video-test-action').props.onPress(); view.render();
  assert.equal(view.pending.options.endpoint, snapshot.endpoint);
  view.pending.resolve(snapshot); await settle(); view.render();
  assert.equal(view.config.gatewayUrl, snapshot.endpoint);
  assert.match(JSON.stringify(view.find('video-test-status')), /导航未就绪/);
  view.expire(); view.render(); assert.equal(view.config, null);
});

test('changing target or background rejects the pending old read and missing WHEP never opens a receiver', async () => {
  const view = mount();
  view.find('video-test-action').props.onPress(); view.render();
  const old = view.pending;
  view.find('video-test-endpoint').props.onChangeText('http://192.168.66.66:15051'); view.render();
  assert.equal(old.options.signal.aborted, true);
  old.resolve(snapshot); await settle(); view.render(); assert.equal(view.config, null);
  view.find('video-test-action').props.onPress(); view.render();
  view.pending.resolve({ ...snapshot, features: { whep: false } }); await settle(); view.render();
  assert.equal(view.config, null);
  view.find('video-test-action').props.onPress(); view.render();
  const background = view.pending; view.background(); view.render();
  assert.equal(background.options.signal.aborted, true);
  background.resolve(snapshot); await settle(); view.render(); assert.equal(view.config, null);
});

test('native video build is separately installed, networked and has no auth or control entry', () => {
  const entry = read('index.video-test.ts');
  assert.doesNotMatch(entry, /AuthProvider|\.\/App|ControlScreen|supabase/);
  assert.match(read('plugins/android-video-test.gradle'), /applicationIdSuffix "\.videotest"/);
  const manifest = read('plugins/android-video-test-manifest.xml');
  assert.equal(read('android/app/src/videotest/AndroidManifest.xml').trim(), manifest.trim());
  assert.match(manifest, /android:usesCleartextTraffic="true"/);
  assert.doesNotMatch(manifest, /android.permission.INTERNET.*remove|android.intent.action.VIEW/);
  assert.ok(JSON.parse(read('app.json')).expo.plugins.includes('./plugins/withVideoAcceptance'));
  assert.match(read('plugins/android-preview.gradle'), /createBundleVideotestJsAndAssets.*index.video-test.ts/);
});
