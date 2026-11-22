import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const protocol = { exports: {} };
vm.runInNewContext(compile('src/components/locationMapHtml.ts'), {
  module: protocol, exports: protocol.exports, process: { env: {} },
});

function mount(native = false) {
  const slots = [], effects = [], listeners = new Map(), sent = [];
  let cursor = 0, node;
  const peer = { postMessage(value) { sent.push(typeof value === 'string' ? JSON.parse(value) : JSON.parse(JSON.stringify(value))); } };
  const frame = { contentWindow: peer };
  const bridge = { injectJavaScript(script) {
    vm.runInNewContext(script, {
      MessageEvent: class { constructor(type, values) { this.type = type; this.data = values.data; } },
      window: { dispatchEvent(event) { sent.push(JSON.parse(event.data)); } },
    });
  } };
  const react = {
    useRef() { const id = cursor++; return slots[id] ??= { current: native ? bridge : frame }; },
    useState(initial) { const id = cursor++; if (!(id in slots)) slots[id] = initial;
      return [slots[id], value => { slots[id] = value; }]; },
    useEffect(effect, deps) { const id = cursor++, previous = slots[id];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) effects.push(() => {
        previous?.cleanup?.(); slots[id] = { deps, cleanup: effect() };
      });
    },
  };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { View: 'View', StyleSheet: { create: value => value } },
    'react-native-webview': { WebView: 'WebView' }, './AppText': { Text: 'Text' },
    './MapBar': { MapBar: 'MapBar' }, './locationMapHtml': protocol.exports,
  };
  const window = { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } };
  const module = { exports: {} };
  vm.runInNewContext(compile(native ? 'src/components/LocationMap.tsx' : 'src/components/LocationMap.web.tsx'), {
    module, exports: module.exports, window, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  let props = { fresh: false, simulated: true, trail: [], trackKey: 'today' };
  const render = () => { cursor = 0; node = module.exports.LocationMap(props); while (effects.length) effects.shift()(); };
  render();
  return {
    sent, peer, render, get bar() { return node.props.children.find(value => value.type === 'MapBar').props; },
    get surface() { return node.props.children.find(value => value.type === (native ? 'WebView' : 'iframe')).props; },
    receive(value, source = peer) {
      if (native) this.surface.onMessage({ nativeEvent: { data: typeof value === 'string' ? value : JSON.stringify(value) } });
      else listeners.get('message')({ source, data: value });
      render();
    },
    update(patch) { props = { ...props, ...patch }; render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); assert.equal(listeners.size, 0); },
  };
}
const view = {
  type: 'doso-map-view', ready: true, mode: 'free', canFollow: true, canOverview: true,
  status: '最新定位', description: '模拟设备 · 最新定位 · 自由查看', error: null,
};

test('web view trusts its own frame and separates data polling from explicit camera commands', () => {
  const host = mount();
  host.receive(view, {}); assert.equal(host.bar.view.ready, false);
  host.receive({ ...view, mode: 'injected' }); assert.equal(host.bar.view.ready, false);
  host.receive(view); assert.equal(host.bar.view.mode, 'free');
  host.update({ fresh: true }); host.update({ simulated: false }); host.render();
  assert.equal(host.sent.filter(value => value.type === 'doso-map-mode').length, 0);
  host.bar.onMode('overview');
  assert.deepEqual(host.sent.at(-1), { type: 'doso-map-mode', mode: 'overview' });
  host.receive({ ...view, mode: 'overview' }); assert.equal(host.bar.view.mode, 'overview');
  assert.equal(host.sent.filter(value => value.type === 'doso-map-mode').length, 1);
  host.unmount();
});

test('native view validates returned messages and injects one command per user action', () => {
  const host = mount(true);
  host.receive('{bad'); host.receive({ ...view, canFollow: 'yes' }); assert.equal(host.bar.view.ready, false);
  host.receive(view); assert.equal(host.bar.view.status, '最新定位');
  host.update({ fresh: true }); host.surface.onLoadEnd();
  assert.equal(host.sent.filter(value => value.type === 'doso-map-mode').length, 0);
  host.bar.onMode('follow');
  assert.deepEqual(host.sent.at(-1), { type: 'doso-map-mode', mode: 'follow' });
  host.receive({ ...view, mode: 'follow' }); host.update({ trackKey: 'tomorrow' });
  assert.equal(host.sent.filter(value => value.type === 'doso-map-mode').length, 1);
  host.unmount();
});

test('map controls expose selected view and a readable status on web and native', () => {
  for (const platform of ['web', 'ios']) {
    const calls = [], module = { exports: {} };
    const dependencies = {
      'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
      'react-native': { Platform: { OS: platform }, Pressable: 'Pressable', View: 'View', StyleSheet: { create: value => value } },
      '../appearance': { getProductAppearance: () => ({}) }, '../typography': { typography: {} }, './AppText': { Text: 'Text' },
    };
    vm.runInNewContext(compile('src/components/MapBar.tsx'), {
      module, exports: module.exports, require: name => { assert.ok(name in dependencies, name); return dependencies[name]; },
    });
    const tree = module.exports.MapBar({ view: { ...view, mode: 'follow' }, onMode: mode => calls.push(mode) });
    const nodes = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node); walk(node.props.children);
    };
    walk(tree);
    const buttons = nodes.filter(node => node.type === 'Pressable');
    assert.equal(buttons[0].props.accessibilityState.selected, true);
    assert.equal(buttons[0].props['aria-pressed'], platform === 'web' ? true : undefined);
    assert.equal(buttons[1].props['aria-pressed'], platform === 'web' ? false : undefined);
    buttons[1].props.onPress(); assert.deepEqual(calls, ['overview']);
    const status = nodes.find(node => node.props.role === 'status');
    assert.equal(status.props.accessible, true); assert.equal(status.props.accessibilityLabel, view.description);
  }
});
