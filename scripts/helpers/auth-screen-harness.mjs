import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);

// Exercises actual screen handlers and semantic elements, not Yoga or a backend.
export function mountAuthScreen({ screen: screenName = 'register', width = 390, height = width > 700 ? 390 : 844, fontScale = 1, insets, dark = false, ready = [], readiness = {}, ...props } = {}) {
  let viewport = { width, height, fontScale, scale: 1 };
  let safeInsets = insets;
  const slots = [];
  const cleanups = [];
  let unmounted = false;
  let updatesAfterUnmount = 0;
  let cursor = 0;
  let focusCount = 0;
  const cache = new Map();
  const react = {
    useMemo: factory => factory(),
    createContext: value => ({ value }),
    useContext: context => context.value,
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], value => { if (unmounted) updatesAfterUnmount += 1; slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = { current: initial };
      return slots[slot];
    },
    useEffect(effect) {
      const slot = cursor++;
      if (!(slot in slots)) { slots[slot] = true; cleanups.push(effect()); }
    },
  };
  const host = {
    ActivityIndicator: 'ActivityIndicator', Image: 'Image', KeyboardAvoidingView: 'KeyboardAvoidingView',
    Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    Platform: { OS: 'android', select: value => value.default },
    useWindowDimensions: () => viewport,
    useColorScheme: () => dark ? 'dark' : 'light',
  };
  const allowed = {
    react,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': host,
    '@expo/vector-icons': { Ionicons: 'Ionicons', FontAwesome: 'FontAwesome' },
    'react-native-safe-area-context': {
      SafeAreaView: 'SafeAreaView',
      useSafeAreaInsets: () => safeInsets ?? ({ left: viewport.width > 700 ? 48 : 0, right: 0, top: 24, bottom: 24 }),
    },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'expo-system-ui': { setBackgroundColorAsync: async () => {} },
    '../components/GradientButton': { GradientButton: 'GradientButton' },
    '../assets': { images: Object.fromEntries(['thunderHero', 'homeBattery', 'homeQuickPatrol', 'homeQuickTask', 'homeQuickSafety', 'homeRecall', 'homeQuickArrow', 'homeMetricSensors', 'homeMetricTemperature', 'homeMetricMotor', 'navHome', 'navMap', 'navTasks', 'navAnalysis', 'navProfile'].map(name => [name, name === 'thunderHero' ? 'figma-thunder-robot' : name])) },
    '../services/authService': {
      normalizeRegistrationUsername(value) {
        const normalized = value.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,24}$/.test(normalized)) throw new Error('用户名格式不正确');
        if (normalized === 'admin') throw new Error('该用户名不可使用，请更换一个');
        return normalized;
      },
    },
    '../services/socialAuthService': { getSocialLoginReadiness: id => ({ provider: id, ready: ready.includes(id), blockerCodes: ready.includes(id) ? [] : ['feature-disabled'], blockerMessage: '当前尚未开放', ...readiness[id] }) },
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
      if (name === '../theme') return load('src/theme.ts');
      if (name === '../appearance') return load('src/appearance.ts');
      if (name === '../typography') return load('src/typography.ts');
      if (name === '../layout/adaptiveLayout') return load('src/layout/adaptiveLayout.ts');
      if (name === './theme') return load('src/theme.ts');
      if (name === './registrationLayout') return load('src/screens/registrationLayout.ts');
      if (name === '../screens/registrationLayout') return load('src/screens/registrationLayout.ts');
      if (name === '../components/AuthEntry') return load('src/components/AuthEntry.tsx');
      if (name === './SocialLoginFeedback') return load('src/components/SocialLoginFeedback.tsx');
      if (name === './UserAvatar') return load('src/components/UserAvatar.tsx');
      if (name === './appleSignInArtwork') return { APPLE_LOGO_ONLY_DATA_URI: 'bundled-apple-logo' };
      if (name === '../../assets/brand/doso-auth-lockup-sky-v2.png') return 'doso-auth-lockup-sky-v2';
      if (name === '../../assets/brand/doso-soft-air.png') return 'doso-soft-air';
      throw new Error(`Unexpected screen dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire, Error }, { filename: relative });
    cache.set(relative, module.exports);
    return module.exports;
  }
  const Screen = screenName === 'header' ? load('src/components/AppHeader.tsx').AppHeader
    : screenName === 'home' ? load('src/screens/HomeScreen.tsx').HomeScreen
    : screenName === 'nav' ? load('src/components/BottomNav.tsx').BottomNav
    : screenName === 'toast' ? load('src/components/AppToast.tsx').AppToast
    : screenName === 'social-entry' ? load('src/components/AuthEntry.tsx').AuthEntrySocial
    : screenName === 'social-legacy' ? load('src/components/SocialLoginButtons.tsx').SocialLoginButtons
    : screenName === 'login' ? load('src/screens/LoginScreen.tsx').LoginScreen : load('src/screens/RegisterScreen.tsx').RegisterScreen;
  let nodes = [];
  function render(next = {}) {
    Object.assign(props, next);
    cursor = 0;
    nodes = [];
    function walk(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      if (typeof node.type === 'function') return walk(node.type(node.props));
      if (node.type === 'TextInput' && node.props.ref) node.props.ref.current = { focus: () => { focusCount += 1; } };
      nodes.push(node);
      walk(node.props.children);
    }
    walk(Screen({ mode: 'login', busy: false, activeProvider: null, onLogin: () => {}, onRegister: () => {}, onBackToLogin: () => {}, ...props }));
    return nodes;
  }
  render();
  return {
    render,
    resize(next) {
      const { insets: nextInsets, ...dimensions } = next;
      viewport = { ...viewport, ...dimensions };
      if (nextInsets) safeInsets = nextInsets;
      return render();
    },
    get nodes() { return nodes; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    get updatesAfterUnmount() { return updatesAfterUnmount; },
    get focusCount() { return focusCount; },
    field: label => nodes.find(node => node.type === 'TextInput' && node.props.accessibilityLabel === label),
    action: id => nodes.find(node => node.type === 'Pressable' && node.props.testID === id),
    fill(username = ' Explorer_01 ', email = ' USER@Example.com ', password = 'StrongPass123') {
      for (const [label, value] of [['用户名', username], ['电子邮箱', email], ['密码', password]]) {
        this.field(label).props.onChangeText(value); render();
      }
    },
    unmount: () => { unmounted = true; cleanups.forEach(cleanup => cleanup?.()); },
  };
}
