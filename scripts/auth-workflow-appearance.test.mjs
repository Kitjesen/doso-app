import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const flatten = value => Object.assign({}, ...(Array.isArray(value) ? value.flat(Infinity).filter(Boolean) : [value].filter(Boolean)));

function mountSharedAuth({ dark = false, width = 390, height = 844, fontScale = 1, disabled = false, error = null } = {}) {
  const slots = [];
  const cache = new Map();
  let cursor = 0;
  const react = {
    createContext: defaultValue => ({ defaultValue }),
    useContext: context => context.defaultValue,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      return slots[slot] ??= { current: initial };
    },
    useEffect() { cursor += 1; },
  };
  const host = {
    ActivityIndicator: 'ActivityIndicator', Image: 'Image', KeyboardAvoidingView: 'KeyboardAvoidingView',
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    Platform: { OS: 'android', select: value => value.default },
    useWindowDimensions: () => ({ width, height, fontScale, scale: 1 }),
    useColorScheme: () => dark ? 'dark' : 'light',
  };
  const allowed = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': host,
    '@expo/vector-icons': { Ionicons: 'Ionicons', FontAwesome: 'FontAwesome' },
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView',
      useSafeAreaInsets: () => ({ left: width > 700 ? 24 : 0, right: width > 700 ? 24 : 0, top: 24, bottom: 24 }),
    },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'expo-system-ui': { setBackgroundColorAsync: async () => {} },
    '../assets': { images: {} },
    '../services/socialAuthService': { getSocialLoginReadiness: () => ({ ready: false }) },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (/(?:^|\/)AppText$/.test(name)) return { Text: host.Text, TextInput: host.TextInput };
      if (name in allowed) return allowed[name];
      if (name === '../theme' || name === './theme') return load('src/theme.ts');
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === './registrationLayout') return load('src/screens/registrationLayout.ts');
      if (name === '../screens/registrationLayout') return load('src/screens/registrationLayout.ts');
      if (name === '../components/AuthEntry') return load('src/components/AuthEntry.tsx');
      if (name === './AuthEntry') return load('src/components/AuthEntry.tsx');
      if (name === './SocialLoginFeedback') return load('src/components/SocialLoginFeedback.tsx');
      if (name === '../components/GradientButton') return load('src/components/GradientButton.tsx');
      if (name === '../../assets/brand/doso-auth-lockup-sky-v2.png' || name === '../../assets/brand/doso-soft-air.png') return name;
      throw new Error(`Unexpected auth appearance dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire, Error }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  }
  const { AuthError, AuthField, AuthPage } = load('src/screens/LoginScreen.tsx');
  const { GradientButton } = load('src/components/GradientButton.tsx');
  const palette = load('src/components/AuthEntry.tsx').useAuthEntryPalette();
  let nodes = [];
  function Root() {
    const children = [
      AuthError({ message: error }),
      AuthField({ accessibilityLabel: '新密码', editable: !disabled, error, label: '新密码', placeholder: '输入新密码', secure: true }),
      GradientButton({ disabled, label: disabled ? '正在更新…' : '更新密码', onPress() {}, variant: 'auth' }),
    ];
    return AuthPage({ children, compact: true, onBack() {}, backDisabled: disabled, subtitle: '设置一个新的安全密码', title: '重置密码' });
  }
  function render() {
    cursor = 0;
    nodes = [];
    function walk(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') return nodes.push({ type: 'copy', value: String(node) });
      if (typeof node.type === 'function') return walk(node.type(node.props));
      nodes.push(node);
      walk(node.props.children);
    }
    walk(Root());
  }
  render();
  return { nodes, palette };
}

function nodeByType(app, type, predicate = () => true) {
  const node = app.nodes.find(candidate => candidate.type === type && predicate(candidate));
  assert.ok(node, `expected rendered ${type}`);
  return node;
}

for (const dark of [false, true]) {
  test(`shared auth page renders the ${dark ? 'dark graphite' : 'light white'} palette`, () => {
    const app = mountSharedAuth({ dark });
    const canvas = nodeByType(app, 'SafeAreaView');
    assert.equal(flatten(canvas.props.style).backgroundColor, dark ? '#17191D' : '#FFFFFF');
    const field = nodeByType(app, 'View', node => flatten(node.props.style).minHeight === 48);
    assert.equal(flatten(field.props.style).backgroundColor, dark ? '#24272D' : '#F4F7FA');
  });
}

test('shared auth field renders 48px geometry and 17/24 typography', () => {
  const app = mountSharedAuth();
  const field = nodeByType(app, 'View', node => flatten(node.props.style).minHeight === 48 && flatten(node.props.style).borderWidth === 1);
  const input = nodeByType(app, 'TextInput');
  assert.equal(flatten(field.props.style).borderRadius, 16);
  assert.equal(flatten(input.props.style).fontSize, 17);
  assert.equal(flatten(input.props.style).lineHeight, 24);
});

test('landscape keeps auth field typography and touch targets at full size', () => {
  const app = mountSharedAuth({ width: 844, height: 390 });
  const input = nodeByType(app, 'TextInput');
  const eye = nodeByType(app, 'Pressable', node => node.props.accessibilityLabel === '显示密码');
  assert.equal(flatten(input.props.style).fontSize, 17);
  assert.equal(flatten(input.props.style).lineHeight, 24);
  assert.equal(flatten(eye.props.style).minHeight, 48);
  assert.equal(flatten(eye.props.style).width, 44);
});

test('auth CTA renders 52px geometry with a 17/25 label', () => {
  const app = mountSharedAuth();
  const buttonPlate = nodeByType(app, 'View', node => flatten(node.props.style).backgroundColor === '#98D1FF');
  const buttonLabel = nodeByType(app, 'Text', node => app.nodes.some(candidate => candidate.type === 'copy' && candidate.value === '更新密码') && flatten(node.props.style).lineHeight === 25);
  assert.equal(flatten(buttonPlate.props.style).minHeight, 52);
  assert.equal(flatten(buttonPlate.props.style).borderRadius, 16);
  assert.equal(flatten(buttonLabel.props.style).fontSize, 17);
});

test('disabled auth CTA and password visibility action expose disabled state', () => {
  const app = mountSharedAuth({ disabled: true });
  const button = nodeByType(app, 'Pressable', node => node.props.disabled === true && node.props.accessibilityRole === 'button');
  const buttonPlate = nodeByType(app, 'View', node => flatten(node.props.style).backgroundColor === '#F4F7FA' && flatten(node.props.style).minHeight === 52);
  const eye = nodeByType(app, 'Pressable', node => node.props.accessibilityLabel === '显示密码');
  assert.equal(button.props.accessibilityState.disabled, true);
  assert.equal(flatten(buttonPlate.props.style).minHeight, 52);
  assert.equal(eye.props.accessibilityState.disabled, true);
});

test('field and form errors render as visible live-region feedback', () => {
  const app = mountSharedAuth({ error: '密码不符合要求' });
  const liveRegions = app.nodes.filter(node => node.type === 'Text' && node.props.accessibilityLiveRegion === 'polite');
  assert.equal(liveRegions.length, 2);
  assert.ok(liveRegions.every(node => flatten(node.props.style).color === '#B52E42'));
});

test('large text falls back from two-column landscape without shrinking controls', () => {
  const app = mountSharedAuth({ width: 844, height: 390, fontScale: 1.6 });
  const row = app.nodes.find(node => node.type === 'View' && flatten(node.props.style).flexDirection === 'row' && flatten(node.props.style).maxWidth === 796);
  const input = nodeByType(app, 'TextInput');
  assert.equal(row, undefined, 'large text must use the scrollable single-column fallback');
  assert.equal(flatten(input.props.style).fontSize, 17);
  assert.equal(flatten(input.props.style).minHeight, 46);
});

test('all five follow-up auth screens use the shared page and field/button language', () => {
  const screens = [
    'src/screens/EmailOtpScreen.tsx',
    'src/screens/ForgotPasswordScreen.tsx',
    'src/screens/ResetPasswordScreen.tsx',
    'src/screens/UsernameOnboardingScreen.tsx',
    'src/screens/DisplayNameConfirmationScreen.tsx',
  ];
  for (const relative of screens) {
    const source = readFileSync(new URL(relative, root), 'utf8');
    assert.match(source, /AuthPage/);
    assert.match(source, /(?:AuthField|codeField)/);
    assert.match(source, /GradientButton[\s\S]*variant="auth"/);
  }
});
