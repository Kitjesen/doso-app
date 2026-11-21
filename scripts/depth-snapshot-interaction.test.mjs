import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const source = ts.transpileModule(read('src/components/DepthSnapshotView.tsx'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount() {
  const instances = new Map();
  let slots, cursor, nodes, copy;
  const effects = [];
  const jsx = (type, props, key) => ({ type, props, key });
  const module = { exports: {} };
  const timers = new Map();
  let nextTimer = 0;
  let now = 1000;
  let props = { host: '192.168.66.64', active: true };
  const unchanged = (previous, deps) => previous && deps.every((value, index) => Object.is(value, previous.deps[index]));
  const react = {
    useState(initial) {
      const slot = slots[cursor++] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }];
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial }; },
    useMemo(create, deps) {
      const index = cursor++;
      if (!unchanged(slots[index], deps)) slots[index] = { deps, value: create() };
      return slots[index].value;
    },
    useEffect(run, deps) {
      const index = cursor++;
      const owner = slots;
      const previous = owner[index];
      if (!unchanged(previous, deps)) effects.push(() => {
        previous?.cleanup?.();
        owner[index] = { deps, cleanup: run() };
      });
    },
  };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      Image: 'Image', Pressable: 'Pressable', View: 'View',
      StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' } },
      PanResponder: { create: panHandlers => ({ panHandlers }) },
    },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    './AppText': { Text: 'Text' },
  };
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require(name) { assert.ok(name in dependencies, name); return dependencies[name]; },
    Date: { now: () => now },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });

  function render(changes = {}) {
    props = { ...props, ...changes };
    nodes = [];
    copy = [];
    const visited = new Set();
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node === 'string') { copy.push(node); return; }
      if (!node || typeof node !== 'object') return;
      if (typeof node.type === 'function') {
        const key = node.key ?? node.type;
        if (!instances.has(key)) instances.set(key, []);
        visited.add(key);
        slots = instances.get(key);
        cursor = 0;
        walk(node.type(node.props));
        return;
      }
      nodes.push(node);
      walk(node.props.children);
    }
    walk(jsx(module.exports.DepthSnapshotView, props));
    for (const [key, previous] of instances) {
      if (visited.has(key)) continue;
      previous.forEach(slot => slot.cleanup?.());
      instances.delete(key);
    }
    effects.splice(0).forEach(effect => effect());
  }

  const find = id => nodes.find(node => node.props.testID === id)?.props;
  render();
  return {
    render, find,
    press(id) { find(id).onPress(); render(); },
    layout(width, height) {
      nodes.find(node => node.props.onLayout).props.onLayout({ nativeEvent: { layout: { width, height } } });
      render();
    },
    drag(dx, dy) {
      const handle = find('depth-resize-handle');
      assert.equal(handle.onStartShouldSetPanResponder(), true);
      handle.onPanResponderGrant();
      handle.onPanResponderMove(null, { dx, dy });
      render();
      handle.onPanResponderRelease();
    },
    advance(ms) {
      const end = now + ms;
      for (const [id, timer] of timers) {
        if (timer.at > end) continue;
        now = timer.at;
        timers.delete(id);
        timer.callback();
        render();
      }
      now = end;
    },
    get size() { return Object.assign({}, ...[find('control-hud-depth').style].flat(Infinity)).width; },
    get copy() { return copy.join(' '); },
    get pendingTimers() { return timers.size; },
  };
}

test('depth starts collapsed and resize remains locked until explicitly enabled', () => {
  const view = mount();
  assert.equal(view.find('control-hud-depth-collapsed').accessibilityState.expanded, false);
  assert.equal(view.find('depth-image'), undefined);
  view.press('control-hud-depth-collapsed');
  assert.equal(view.size, 124);
  assert.equal(view.find('depth-resize-toggle').accessibilityState.checked, false);
  assert.equal(view.find('depth-resize-handle'), undefined);
  view.press('depth-resize-toggle');
  assert.equal(view.find('depth-resize-toggle').accessibilityState.checked, true);
  view.drag(60, 0);
  assert.ok(view.size > 124);
  const grown = view.size;
  view.drag(-15, 0);
  assert.ok(view.size < grown);
  const resized = view.size;
  const oldHandle = view.find('depth-resize-handle');
  oldHandle.onPanResponderGrant();
  view.press('depth-resize-toggle');
  assert.equal(view.find('depth-resize-handle'), undefined);
  oldHandle.onPanResponderMove(null, { dx: 100, dy: 0 });
  view.render();
  assert.equal(view.size, resized);
  view.press('depth-resize-toggle');
  view.press('depth-collapse');
  view.press('control-hud-depth-collapsed');
  assert.equal(view.find('depth-resize-toggle').accessibilityState.checked, false);
  assert.equal(view.size, resized);
});

test('drag and accessibility adjustments respect depth size limits', () => {
  const view = mount();
  view.press('control-hud-depth-collapsed');
  view.press('depth-resize-toggle');
  const handle = () => view.find('depth-resize-handle');
  view.drag(1000, 0);
  assert.equal(view.size, handle().accessibilityValue.max);
  view.drag(0, 1000);
  assert.equal(view.size, handle().accessibilityValue.min);
  const smallest = view.size;
  handle().onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  view.render();
  assert.ok(view.size > smallest);
  handle().onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } });
  view.render();
  assert.equal(view.size, smallest);
  view.layout(180, 150);
  view.drag(1000, 0);
  assert.equal(view.size, 150);
});

test('depth requests retry after failure and stop in the background or when collapsed', () => {
  const view = mount();
  assert.equal(view.pendingTimers, 0);
  view.press('control-hud-depth-collapsed');
  const image = () => view.find('depth-image');
  const failed = image();
  assert.doesNotMatch(view.copy, /机器狗实时源/);
  failed.onError();
  view.render();
  assert.match(view.copy, /深度图暂不可用/);
  view.advance(1000);
  assert.notEqual(image().source.uri, failed.source.uri);
  failed.onLoad();
  view.render();
  assert.doesNotMatch(view.copy, /机器狗实时源/);
  image().onLoad();
  view.render();
  assert.match(view.copy, /机器狗实时源/);
  view.advance(4000);
  assert.doesNotMatch(view.copy, /机器狗实时源/);
  assert.match(view.copy, /深度图暂不可用/);
  view.render({ host: '192.168.66.65' });
  assert.match(image().source.uri, /192\.168\.66\.65:5050/);
  assert.doesNotMatch(view.copy, /机器狗实时源/);
  view.render({ active: false });
  assert.equal(image(), undefined);
  assert.equal(view.pendingTimers, 0);
  view.advance(5000);
  view.render({ active: true });
  assert.ok(image());
  view.press('depth-collapse');
  assert.equal(image(), undefined);
  assert.equal(view.pendingTimers, 0);
});

test('the landscape HUD mounts the depth card in a touch-through layer beside the sticks', () => {
  const file = 'src/components/controlLandscapeHud.tsx';
  const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const views = new Map();
  function attribute(node, name) {
    const prop = node.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(tree) === name);
    return prop?.initializer && ts.isStringLiteral(prop.initializer) ? prop.initializer.text : undefined;
  }
  function collect(node, parent) {
    if (ts.isJsxElement(node)) {
      const id = attribute(node, 'testID');
      if (id) views.set(id, { node, parent });
      parent = node;
    }
    ts.forEachChild(node, child => collect(child, parent));
  }
  collect(tree);
  const layer = views.get('control-hud-center-stack');
  const sticks = views.get('control-immersive-sticks');
  assert.ok(layer && sticks);
  assert.equal(layer.node.openingElement.tagName.getText(tree), 'View');
  assert.equal(attribute(layer.node, 'pointerEvents'), 'box-none');
  assert.equal(layer.parent, sticks.parent);
  assert.ok(layer.node.children.some(child => ts.isJsxExpression(child) && child.expression?.getText(tree) === 'pointCloud'));
});
