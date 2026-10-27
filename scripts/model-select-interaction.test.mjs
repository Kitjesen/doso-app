import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return typeof style === 'object' ? style : {};
}

function mountModelSelect({ busy = false, fontScale = 1, height = 844, width = 390 } = {}) {
  const slots = [];
  const cache = new Map();
  const continueCalls = [];
  let cursor = 0;
  let nodes = [];
  const props = { busy };
  const colors = {
    authPrimary: '#0066FF', authPrimaryInk: '#FFFFFF', background: '#FFFFFF',
    greenDark: '#1F4D7A', ink: '#050808', inkSoft: '#373737', line: '#E2E6F0',
    muted: '#7B7B7B', surface: '#F5F7FB', surfaceStrong: '#EAEDF8',
  };
  const robotModels = [
    { id: 'thunder-01', name: 'THUNDER 01', description: '全地形轮足巡检机器人', category: '四足', environment: '室外', image: 'thunder-01' },
    { id: 'thunder-mini', name: 'THUNDER MINI', description: '轻量灵活的室内机器人', category: '轮式', environment: '室内', image: 'thunder-mini' },
    { id: 'thunder-pro', name: 'THUNDER PRO', description: '专业级复杂地形作业', category: '四足', environment: '室外', image: 'thunder-pro' },
    { id: 'scout', name: 'SCOUT', description: '紧凑型智能侦察伙伴', category: '四足', environment: '室内', image: 'scout' },
  ];
  const react = {
    createContext: value => ({ value }),
    useContext: context => context.value,
    useCallback(callback) { return callback; },
    useMemo(factory) { return factory(); },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
  };
  const host = {
    Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: value => value, flatten: flattenStyle, hairlineWidth: 1 },
    Platform: { select: value => value.default },
    useColorScheme: () => 'light',
    useWindowDimensions: () => ({ width, height, fontScale, scale: 1 }),
  };

  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: host.Text, TextInput: host.TextInput };
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react-native') return host;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
      if (name === '../models') return { robotModels };
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === './theme') return load('src/theme.ts');
      if (name === '../theme') return {
        radii: { pill: 999 },
        useAppTheme: () => ({ colors, isDark: false }),
      };
      if (name === './modelSelectLayout') return load('src/screens/modelSelectLayout.ts');
      throw new Error(`Unexpected ModelSelectScreen dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  }

  const ModelSelectScreen = load('src/screens/ModelSelectScreen.tsx').ModelSelectScreen;
  function render(next = {}) {
    Object.assign(props, next);
    cursor = 0;
    nodes = [];
    function walk(node, parent = null) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(child => walk(child, parent));
      if (typeof node !== 'object') {
        nodes.push({ type: 'copy', value: String(node), parent });
        return;
      }
      if (typeof node.type === 'function') return walk(node.type(node.props), parent);
      const entry = { ...node, parent };
      nodes.push(entry);
      walk(node.props.children, entry);
    }
    walk(ModelSelectScreen({
      ...props,
      onBack() {},
      onContinue(model) { continueCalls.push(model.id); },
      onSkip() {},
    }));
    return nodes;
  }

  render();
  const measuredRoot = nodes.find(node => typeof node.props?.onLayout === 'function');
  measuredRoot?.props.onLayout({ nativeEvent: { layout: { width } } });
  render();

  return {
    action: id => nodes.find(node => node.type === 'Pressable' && node.props.testID === id),
    all: type => nodes.filter(node => node.type === type),
    cardIds: () => nodes
      .filter(node => node.type === 'Pressable' && node.props.testID?.startsWith('model-card-'))
      .map(node => node.props.testID),
    continueCalls,
    field: () => nodes.find(node => node.type === 'TextInput' && node.props.testID === 'model-search-input'),
    get nodes() { return nodes; },
    render,
  };
}

test('product model selection uses normal actions while disclosing that selection does not bind a robot', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 753, height: 471 }]) {
    const screen = mountModelSelect(viewport);
    const copy = () => screen.nodes.filter(node => node.type === 'copy').map(node => node.value).join(' ');
    assert.doesNotMatch(copy(), /预览/);
    assert.match(copy(), /仅选择机型，不会绑定或配置机器人/);
    assert.doesNotMatch(screen.action('model-continue').props.accessibilityHint, /预览/);
    screen.action('model-continue').props.onPress();
    assert.deepEqual(screen.continueCalls, ['thunder-01']);
    screen.render({ busy: true });
    assert.match(copy(), /正在进入/);
    assert.doesNotMatch(copy(), /预览/);
    assert.equal(screen.action('model-continue').props.disabled, true);
  }
});

test('users with a physical robot can find IP connection before choosing a display model', () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 753, height: 471 }]) {
    let opened = 0; const screen = mountModelSelect(viewport);
    screen.render({ onOpenRobotConnection: () => opened++ });
    const entry = screen.action('model-connect-robot');
    assert.ok(entry, 'IP connection must not require skipping the model catalogue first');
    entry.props.onPress(); assert.equal(opened, 1); assert.deepEqual(screen.continueCalls, []);
    screen.render({ busy: true }); const stale = screen.action('model-connect-robot');
    assert.equal(stale.props.disabled, true); stale.props.onPress(); assert.equal(opened, 1);
  }
});

test('search and clear update the native model-card result set', () => {
  const screen = mountModelSelect();
  assert.equal(screen.cardIds().length, 4);

  screen.field().props.onChangeText('mini');
  screen.render();
  assert.deepEqual(screen.cardIds(), ['model-card-thunder-mini']);
  assert.equal(screen.action('model-search-clear').props.disabled, false);

  screen.action('model-search-clear').props.onPress();
  screen.render();
  assert.equal(screen.cardIds().length, 4);
});

test('filtering fails closed until a visible model is selected and continued', () => {
  const screen = mountModelSelect();
  screen.action('model-filter-室内').props.onPress();
  screen.render();

  assert.deepEqual(screen.cardIds(), ['model-card-thunder-mini', 'model-card-scout']);
  assert.equal(screen.action('model-continue').props.disabled, true);
  assert.equal(screen.action('model-continue').props.accessibilityState.disabled, true);

  screen.action('model-card-scout').props.onPress();
  screen.render();
  const selectedCards = screen.cardIds().filter(id => screen.action(id).props.accessibilityState.selected);
  assert.deepEqual(selectedCards, ['model-card-scout']);
  assert.equal(screen.action('model-continue').props.disabled, false);

  screen.action('model-continue').props.onPress();
  assert.deepEqual(screen.continueCalls, ['scout']);
});

test('busy disables every mutation and a stale continue handler cannot dispatch', () => {
  const screen = mountModelSelect();
  const staleContinue = screen.action('model-continue').props.onPress;

  screen.render({ busy: true });
  assert.equal(screen.field().props.editable, false);
  assert.equal(screen.action('model-back').props.disabled, true);
  assert.equal(screen.action('model-skip').props.disabled, true);
  assert.equal(screen.action('model-filter-全部').props.disabled, true);
  assert.equal(screen.action('model-card-thunder-01').props.disabled, true);
  assert.equal(screen.action('model-continue').props.disabled, true);

  staleContinue();
  screen.action('model-continue').props.onPress();
  assert.deepEqual(screen.continueCalls, []);
});

test('large text uses a single native card column with readable wrapping model names', () => {
  const screen = mountModelSelect({ fontScale: 1.5 });
  const firstCard = screen.action('model-card-thunder-01');
  const cardStyle = flattenStyle(firstCard.props.style({ pressed: false }));
  const modelName = screen.nodes.find(node => node.type === 'Text' && node.props.children === 'THUNDER 01');
  const modelDescription = screen.nodes.find(node => node.type === 'Text' && node.props.children === '全地形轮足巡检机器人');

  assert.equal(cardStyle.width, 346);
  assert.equal(cardStyle.minHeight, 260);
  assert.equal(cardStyle.height, undefined);
  assert.equal(modelName.props.adjustsFontSizeToFit, undefined);
  assert.equal(modelName.props.numberOfLines, 2);
  assert.equal(modelDescription.props.numberOfLines, undefined);
});
