import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function mountPrivacy({ dark = false, width = 390, height = 844, fontScale = 1, onBack = () => {} } = {}) {
  const host = {
    Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    useWindowDimensions: () => ({ width, height, fontScale, scale: 1 }),
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('src/screens/DataPrivacyScreen.tsx', root), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports: module.exports,
    module,
    require(name) {
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react') return { useMemo: factory => factory() };
      if (name === 'react-native') return host;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'react-native-safe-area-context') {
        return { useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: width > height ? 44 : 0, right: 0 }) };
      }
      if (name.endsWith('/AppText')) return { Text: 'Text' };
      if (name === '../appearance') return loadVisualTokenModules({ dark }).appearance;
      if (name === '../typography') return loadVisualTokenModules({ dark }).typography;
      if (name === '../theme') {
        return { useAppTheme: () => ({ colors: dark ? {
          background: '#0E1116', surface: '#1A2028', ink: '#F7F9FC', inkSoft: '#D8DEE7', muted: '#96A1AD', line: '#65707C', authPrimary: '#88BBFF', surfaceStrong: '#25303A',
        } : {
          background: '#FFFFFF', surface: '#F5F7FB', ink: '#050808', inkSoft: '#373737', muted: '#616B79', line: '#E2E6F0', authPrimary: '#0066FF', surfaceStrong: '#EAEDF8',
        }, isDark: dark }) };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename: 'src/screens/DataPrivacyScreen.tsx' });
  const nodes = [];
  function walk(node) {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
    if (typeof node.type === 'function') return walk(node.type(node.props));
    nodes.push(node);
    walk(node.props.children);
  }
  walk(module.exports.DataPrivacyScreen({ onBack }));
  return {
    nodes,
    copy: nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '),
    action: id => nodes.find(node => node.type === 'Pressable' && node.props.testID === id),
  };
}

function mountProfile({ onOpenDataPrivacy } = {}) {
  const module = { exports: {} };
  const source = readFileSync(new URL('src/screens/ProfileScreen.tsx', root), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const colors = {
    background: '#fff', surface: '#f5f7fb', surfaceStrong: '#eaedf8', ink: '#050808', inkSoft: '#373737', muted: '#616b79', line: '#e2e6f0', authPrimary: '#06f', green: '#7ea9e8', mint: '#b8d6f4', greenStrong: '#4f8bd9', greenDark: '#1f4d7a', successText: '#2f6aa3', danger: '#ff6f78', dangerText: '#b52e42', dangerSurface: '#fff2f3', authBackground: '#fff', authBorder: '#d0d5dd', authFocus: '#06f', authPrimaryInk: '#fff', navStart: '#0f172a', navEnd: '#284b6d',
  };
  let stateCursor = 0;
  const states = [];
  vm.runInNewContext(code, {
    exports: module.exports,
    module,
    require(name) {
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react') return {
        useMemo: factory => factory(),
        useCallback: callback => callback,
        useState(initial) {
          const slot = stateCursor++;
          if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
          return [states[slot], value => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }];
        },
      };
      if (name === 'react-native') return {
        Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Switch: 'Switch', View: 'View',
        StyleSheet: { create: value => value, hairlineWidth: 1 },
        useWindowDimensions: () => ({ width: 390, height: 844, fontScale: 1, scale: 1 }),
      };
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }) };
      if (name.endsWith('/AppText')) return { Text: 'Text' };
      if (name === './profileLayout') return {
        PROFILE_LANDSCAPE_CONTROLS_TOP: 0,
        PROFILE_LANDSCAPE_DEVICE_TOP: 0,
        getSafeProfileTopOffset: () => 0,
        getProfileLayoutMetrics: () => ({ contentWidth: 390, controlsColumnWidth: 390, deviceColumnWidth: 390, gridGap: 0, isLandscape: false, leadingInset: 0, usesColumns: false }),
      };
      if (name === '../theme') return { useAppTheme: () => ({ colors, isDark: false }) };
      if (name === '../appearance') return loadVisualTokenModules().appearance;
      if (name === '../typography') return loadVisualTokenModules().typography;
      if (name === '../components/FontLicenseNotice') return { FontLicenseNotice: () => null };
      throw new Error(`Unexpected profile dependency: ${name}`);
    },
  }, { filename: 'src/screens/ProfileScreen.tsx' });
  stateCursor = 0;
  const nodes = [];
  function walk(node) {
    if (node == null || typeof node === 'boolean') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
    if (typeof node.type === 'function') return walk(node.type(node.props));
    nodes.push(node); walk(node.props.children);
  }
  walk(module.exports.ProfileScreen({
    accountEmail: 'pilot@example.com', alertsEnabled: false, canOpenFirmwareUpdate: false,
    canOpenProvisioning: false, connected: false, deviceName: 'THUNDER 01', deviceType: '室外四足机器人',
    onConnect() {}, onDisconnect() {}, onOpenBleDiscovery() {}, onOpenFirmwareUpdate() {}, onOpenProvisioning() {},
    onRetry() {}, onToggleAlerts() {}, safetyLock: null, onOpenDataPrivacy,
  }));
  return { nodes, copy: nodes.filter(node => node.type === 'copy').map(node => node.value).join(' ') };
}

test('data privacy screen renders the current factual data scope as read-only scrollable content', () => {
  const screen = mountPrivacy();
  assert.match(screen.copy, /登录与个人资料/);
  assert.match(screen.copy, /终端与账户安全/);
  assert.match(screen.copy, /机器人与连接/);
  assert.match(screen.copy, /本机保存/);
  assert.match(screen.copy, /不替代正式隐私政策/);
  assert.match(screen.copy, /账户删除服务尚未接通/);
  assert.ok(screen.nodes.some(node => node.type === 'ScrollView'));
  assert.equal(screen.nodes.some(node => node.type === 'TextInput' || node.type === 'Switch'), false);
});

test('privacy screen distinguishes logout from erasing retained local records without offering a destructive action', () => {
  for (const dark of [false, true]) {
    for (const [width, height] of [[390, 844], [844, 390]]) {
      let backs = 0;
      const screen = mountPrivacy({ dark, width, height, onBack: () => { backs += 1; } });
      assert.match(screen.copy, /退出登录不会清除全部本机记录/);
      assert.match(screen.copy, /安装标识会保留/);
      assert.match(screen.copy, /未完成核对或清理的头像操作日志也会保留/);
      assert.match(screen.copy, /头像操作日志不包含密码或图片内容/);
      assert.match(screen.copy, /本页不会提交注销或解绑/);
      assert.match(screen.copy, /退出登录不等于删除账户/);
      const actions = screen.nodes.filter(node => node.type === 'Pressable');
      assert.equal(actions.length, 1, 'the read-only page must not offer erasure or account deletion');
      assert.equal(actions[0].props.accessibilityLabel, '返回');
      actions[0].props.onPress();
      assert.equal(backs, 1);
    }
  }
});

test('privacy explains legacy Android BLE location permission without implying phone-coordinate collection', () => {
  for (const dark of [false, true]) {
    for (const [width, height] of [[320, 568], [844, 390]]) {
      for (const fontScale of [1, 1.5]) {
        let backs = 0;
        const screen = mountPrivacy({ dark, width, height, fontScale, onBack: () => { backs++; } });
        const disclosure = screen.nodes.find(node => node.type === 'Text'
          && typeof node.props.children === 'string' && node.props.children.includes('BLE 扫描'));
        assert.ok(disclosure);
        assert.match(disclosure.props.children, /Android 11 及以下.*位置权限.*定位服务/);
        assert.match(disclosure.props.children, /此扫描流程仅检查定位服务是否开启/);
        assert.match(disclosure.props.children, /不读取、保存或上传手机经纬度/);
        assert.match(disclosure.props.children, /只在你主动操作时触发/);
        assert.match(disclosure.props.children, /发现广播不代表已经完成安全配网或设备连接/);
        assert.equal(disclosure.props.selectable, true);
        assert.equal(disclosure.props.numberOfLines, undefined);
        assert.ok(screen.nodes.some(node => node.type === 'ScrollView'));
        assert.equal(screen.nodes.filter(node => node.type === 'Pressable').length, 1);
        assert.match(screen.copy, /账户删除服务尚未接通/);
        screen.action('data-privacy-back').props.onPress(); assert.equal(backs, 1);
      }
    }
  }
});

test('login and register privacy entries open without unmounting or clearing form values', () => {
  for (const screenName of ['login', 'register']) {
    let opens = 0;
    const screen = mountAuthScreen({ screen: screenName, onOpenDataPrivacy: () => { opens += 1; } });
    if (screenName === 'login') {
      screen.field('邮箱地址').props.onChangeText('pilot@example.com');
      screen.field('密码').props.onChangeText('StrongPass123');
    } else {
      screen.fill('pilot_01', 'pilot@example.com', 'StrongPass123');
    }
    screen.render();
    const entry = screen.action(`${screenName}-data-privacy`);
    assert.ok(entry);
    entry.props.onPress();
    assert.equal(opens, 1);
    screen.render();
    assert.equal(screen.field(screenName === 'login' ? '邮箱地址' : '电子邮箱').props.value, 'pilot@example.com');
    assert.equal(screen.field('密码').props.value, 'StrongPass123');
    assert.equal(mountAuthScreen({ screen: screenName }).action(`${screenName}-data-privacy`), undefined);
  }
});

test('profile renders an actionable privacy row only when a callback is available', () => {
  let opens = 0;
  const enabled = mountProfile({ onOpenDataPrivacy: () => { opens += 1; } });
  const row = enabled.nodes.find(node => node.type === 'Pressable' && enabled.nodes.some(copy => copy.type === 'copy' && copy.value === '数据与隐私'));
  assert.match(enabled.copy, /数据与隐私/);
  assert.ok(row);
  const privacyRow = enabled.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityHint === '打开数据与隐私');
  privacyRow.props.onPress();
  assert.equal(opens, 1);
  assert.doesNotMatch(mountProfile().copy, /数据与隐私/);
});

test('production App modal callbacks preserve the underlying stage and support portrait and landscape close paths', () => {
  const source = readFileSync(new URL('App.tsx', root), 'utf8');
  const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = new Map();
  const jsx = new Map();
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && ['openDataPrivacy', 'closeDataPrivacy'].includes(node.name.text)) {
      callbacks.set(node.name.text, node.initializer);
    }
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = opening.tagName.getText(file);
      if (['Modal', 'DataPrivacyScreen', 'LoginScreen', 'RegisterScreen', 'ProfileScreen'].includes(name)) {
        const entries = new Map(opening.attributes.properties
          .filter(ts.isJsxAttribute)
          .map(attribute => [attribute.name.getText(file), attribute.initializer?.getText(file) ?? 'true']));
        if (!jsx.has(name)) jsx.set(name, []);
        jsx.get(name).push(entries);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.ok(callbacks.get('openDataPrivacy'));
  assert.ok(callbacks.get('closeDataPrivacy'));
  let visible = false;
  let dismisses = 0;
  const context = {
    Keyboard: { dismiss: () => { dismisses += 1; } },
    setDataPrivacyVisible: value => { visible = value; },
    useCallback: callback => callback,
  };
  const open = vm.runInNewContext(callbacks.get('openDataPrivacy').getText(file), context);
  const close = vm.runInNewContext(callbacks.get('closeDataPrivacy').getText(file), context);
  open();
  assert.equal(visible, true);
  assert.equal(dismisses, 1);
  close();
  assert.equal(visible, false, 'closing only hides the overlay and never restores an obsolete stage');

  const modal = jsx.get('Modal')?.[0];
  assert.equal(modal?.get('visible'), '{dataPrivacyVisible}');
  assert.equal(modal?.get('onRequestClose'), '{closeDataPrivacy}');
  assert.match(modal?.get('supportedOrientations') ?? '', /portrait/);
  assert.match(modal?.get('supportedOrientations') ?? '', /landscape-left/);
  assert.match(modal?.get('supportedOrientations') ?? '', /landscape-right/);
  assert.equal(jsx.get('DataPrivacyScreen')?.[0]?.get('onBack'), '{closeDataPrivacy}');
  for (const name of ['LoginScreen', 'RegisterScreen', 'ProfileScreen']) {
    assert.ok(jsx.get(name)?.some(attributes => attributes.get('onOpenDataPrivacy') === '{openDataPrivacy}'));
  }
});

test('privacy content remains scrollable, themed and safe-area padded in landscape with dynamic text', () => {
  let backs = 0;
  const screen = mountPrivacy({ dark: true, width: 844, height: 390, onBack: () => { backs += 1; } });
  const rootNode = screen.nodes.find(node => node.props.testID === 'data-privacy-screen');
  assert.ok(rootNode.props.style.flat().some(style => style?.backgroundColor === '#0E1116'));
  const scroll = screen.nodes.find(node => node.type === 'ScrollView');
  assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'automatic');
  const contentStyles = scroll.props.contentContainerStyle.flat();
  assert.ok(contentStyles.some(style => style?.paddingLeft === 68));
  assert.ok(contentStyles.some(style => style?.paddingRight === 24));
  const back = screen.action('data-privacy-back');
  assert.equal(back.props.accessibilityRole, 'button');
  assert.ok(back.props.style({ pressed: false }).flat().some(style => style?.height === 44 && style?.width === 44));
  back.props.onPress();
  assert.equal(backs, 1);
  const textNodes = screen.nodes.filter(node => node.type === 'Text');
  assert.ok(textNodes.filter(node => node.props.selectable).length >= 10);
  assert.equal(textNodes.some(node => node.props.numberOfLines != null), false, 'long privacy copy must not be truncated');
});
