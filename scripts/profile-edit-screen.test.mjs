import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return typeof style === 'object' ? style : {};
}

function mountEditor({
  height = 844,
  insets = { top: 24, bottom: 16, left: 0, right: 0 },
  onSave = async () => {},
  pickerResult = null,
  width = 390,
} = {}) {
  const slots = [];
  const focus = { displayName: 0, username: 0 };
  const cleanups = [];
  let cursor = 0;
  let nodes = [];
  let backCalls = 0;
  let registeredBack = null;
  const colors = {
    authPrimary: '#0066FF', authPrimaryInk: '#FFFFFF', background: '#FFFFFF',
    dangerSurface: '#FFF2F3', dangerText: '#B52E42', greenDark: '#1F4D7A',
    ink: '#050808', line: '#E2E6F0', muted: '#616B79', surface: '#F5F7FB', surfaceStrong: '#EAEDF8',
  };
  const react = {
    useCallback(callback) { return callback; },
    useEffect(callback) { const cleanup = callback(); if (cleanup) cleanups.push(cleanup); },
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
    Alert: { alert() {} },
    KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' }, Pressable: 'Pressable',
    ScrollView: 'ScrollView', StyleSheet: { create: value => value, flatten: flattenStyle, hairlineWidth: 1 },
    Text: 'Text', TextInput: 'TextInput', View: 'View', useWindowDimensions: () => ({ width, height }),
  };

  function load(relative) {
    const module = { exports: {} };
    const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const localRequire = name => {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
      if (name === 'react-native') return host;
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => insets };
      if (name.endsWith('/AppText')) return { Text: host.Text, TextInput: host.TextInput };
      if (name.endsWith('/UserAvatar')) return { UserAvatar: 'UserAvatar' };
      if (name.endsWith('/avatarPicker')) return { pickProfileAvatar: async () => pickerResult };
      if (name.endsWith('/theme')) return { useAppTheme: () => ({ colors, isDark: false }) };
      if (name.endsWith('/appearance')) return loadVisualTokenModules().appearance;
      if (name.endsWith('/typography')) return loadVisualTokenModules().typography;
      if (name.endsWith('/profileEditing')) return {};
      throw new Error(`Unexpected editor dependency: ${name}`);
    };
    vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: relative });
    return module.exports;
  }

  const EditProfileScreen = load('src/screens/EditProfileScreen.tsx').EditProfileScreen;
  const profile = { id: 'user-1', username: 'doso_user', display_name: '森哥', avatar_url: null };
  function render(next = {}) {
    cursor = 0;
    nodes = [];
    function walk(node, parent = null) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(child => walk(child, parent));
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node), parent }); return; }
      if (typeof node.type === 'function') return walk(node.type(node.props), parent);
      const entry = { ...node, parent };
      if (entry.type === 'TextInput') {
        const field = entry.props.testID.endsWith('username') ? 'username' : 'displayName';
        entry.props.ref.current = { focus: () => { focus[field]++; } };
      }
      nodes.push(entry);
      walk(node.props.children, entry);
    }
    walk(EditProfileScreen({
      profile,
      onBack: () => { backCalls++; },
      onBackRequestChange: handler => { registeredBack = handler; },
      onSave,
      ...next,
    }));
    return nodes;
  }
  render();
  return {
    action: id => nodes.find(node => node.type === 'Pressable' && node.props.testID === id),
    field: id => nodes.find(node => node.type === 'TextInput' && node.props.testID === id),
    focus,
    get backCalls() { return backCalls; },
    get registeredBack() { return registeredBack; },
    get nodes() { return nodes; },
    render,
  };
}

function loadAvatarPicker(relative = 'src/services/avatarPicker.ts', pickerModule) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = name => {
    if (name === './profileEditing') return {};
    if (name === './avatarPickerCore') return loadAvatarPicker('src/services/avatarPickerCore.ts');
    if (name === 'expo-image-picker' && pickerModule) return pickerModule;
    throw new Error(`Unexpected avatar picker dependency: ${name}`);
  };
  vm.runInNewContext(code, { exports: module.exports, module, require: localRequire }, { filename: relative });
  return module.exports;
}

test('web picker opens synchronously in the user gesture without a lazy import', async () => {
  let calls = 0;
  const { pickProfileAvatar } = loadAvatarPicker('src/services/avatarPicker.web.ts', {
    launchImageLibraryAsync(options) {
      calls++;
      assert.equal(options.base64, true);
      return Promise.resolve({ canceled: true, assets: null });
    },
  });
  const pending = pickProfileAvatar();
  assert.equal(calls, 1);
  assert.equal(await pending, null);
});

test('editor validates, focuses, normalizes and saves username and display name separately', async () => {
  const calls = [];
  const screen = mountEditor({ onSave: async input => calls.push(input) });
  screen.field('profile-edit-username').props.onChangeText('INVALID NAME');
  screen.render();
  await screen.action('profile-edit-save').props.onPress();
  screen.render();
  assert.equal(screen.focus.username, 1);
  assert.equal(calls.length, 0);

  screen.field('profile-edit-username').props.onChangeText(' New_User ');
  screen.field('profile-edit-display-name').props.onChangeText('  DOSO 森哥  ');
  screen.render();
  await screen.action('profile-edit-save').props.onPress();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].username, 'new_user');
  assert.equal(calls[0].displayName, 'DOSO 森哥');
  assert.equal(calls[0].avatar, undefined);
});

test('editor prevents duplicate saves in the same tick and preserves edited input', async () => {
  let finish;
  let calls = 0;
  const screen = mountEditor({ onSave: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  screen.field('profile-edit-display-name').props.onChangeText('新昵称');
  screen.render();
  const submit = screen.action('profile-edit-save').props.onPress;
  const pending = submit();
  await submit();
  assert.equal(calls, 1);
  screen.render();
  assert.equal(screen.field('profile-edit-display-name').props.value, '新昵称');
  assert.equal(screen.action('profile-edit-save').props.accessibilityState.busy, true);
  finish();
  await pending;
});

test('dirty back uses an inline cross-platform discard confirmation and registered hardware-back handler', () => {
  const screen = mountEditor();
  screen.registeredBack();
  assert.equal(screen.backCalls, 1);
  screen.field('profile-edit-display-name').props.onChangeText('另一个昵称');
  screen.render();
  screen.registeredBack();
  screen.render();
  assert.equal(screen.backCalls, 1);
  assert.ok(screen.action('profile-edit-discard-cancel'));
  screen.action('profile-edit-discard-confirm').props.onPress();
  assert.equal(screen.backCalls, 2);
});

test('chosen avatar is visibly pending and is passed to save only after explicit submit', async () => {
  const avatar = { uri: 'file:///picked.jpg', base64: '/9j/', mimeType: 'image/jpeg' };
  const calls = [];
  const screen = mountEditor({ pickerResult: avatar, onSave: async input => calls.push(input) });
  await screen.action('profile-edit-avatar').props.onPress();
  screen.render();
  assert.equal(calls.length, 0);
  assert.equal(screen.nodes.find(node => node.type === 'UserAvatar').props.uri, avatar.uri);
  await screen.action('profile-edit-save').props.onPress();
  assert.equal(calls[0].avatar.uri, avatar.uri);
});

test('avatar picker cancellation is clean and JPEG/PNG type comes from bytes, not metadata', async () => {
  const { pickProfileAvatar } = loadAvatarPicker();
  assert.equal(await pickProfileAvatar(async () => ({
    launchImageLibraryAsync: async () => ({ canceled: true, assets: null }),
  })), null);

  let options;
  const jpeg = await pickProfileAvatar(async () => ({
    launchImageLibraryAsync: async nextOptions => {
      options = nextOptions;
      return { canceled: false, assets: [{ uri: 'file:///avatar.png', base64: '/9j/AAAA', mimeType: 'image/png' }] };
    },
  }));
  assert.equal(jpeg.mimeType, 'image/jpeg');
  assert.equal(options.allowsEditing, true);
  assert.equal(options.base64, true);
  assert.equal(JSON.stringify(options.aspect), '[1,1]');

  const png = await pickProfileAvatar(async () => ({
    launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///avatar.jpg', base64: 'iVBORw0KGgoAAAA', mimeType: 'image/jpeg' }] }),
  }));
  assert.equal(png.mimeType, 'image/png');
});

test('avatar picker gives actionable rebuild, content-type and size failures', async () => {
  const { pickProfileAvatar } = loadAvatarPicker();
  await assert.rejects(
    () => pickProfileAvatar(async () => { throw new Error('Cannot find native module ExpoImagePicker'); }),
    /重新构建并安装最新版 DOSO App/,
  );
  await assert.rejects(
    () => pickProfileAvatar(async () => ({
      launchImageLibraryAsync: async () => { throw new Error('Native module is unavailable'); },
    })),
    /重新构建并安装最新版 DOSO App/,
  );
  await assert.rejects(
    () => pickProfileAvatar(async () => ({
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///bad.webp', base64: 'UklGRgAAAAA' }] }),
    })),
    /不是有效的 JPEG 或 PNG/,
  );
  const oversized = '/9j/' + 'A'.repeat(4 * 1024 * 1024 + 8);
  await assert.rejects(
    () => pickProfileAvatar(async () => ({
      launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: 'file:///huge.jpg', base64: oversized }] }),
    })),
    /小于或等于 3 MiB/,
  );
});

test('profile uses 48dp edit/control entries and header keeps accessible profile navigation', () => {
  const profile = readFileSync(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8');
  const header = readFileSync(new URL('../src/components/AppHeader.tsx', import.meta.url), 'utf8');
  const picker = readFileSync(new URL('../src/services/avatarPicker.ts', import.meta.url), 'utf8');
  const pickerCore = readFileSync(new URL('../src/services/avatarPickerCore.ts', import.meta.url), 'utf8');
  assert.match(profile, /testID="profile-edit-entry"/);
  assert.match(profile, /testID="profile-control-entry"/);
  assert.match(profile, /editProfileButton:[\s\S]*?minHeight: 48/);
  assert.match(profile, /controlButton:[\s\S]*?minHeight: 48/);
  assert.match(header, /accessibilityLabel="编辑个人资料"/);
  assert.match(header, /<UserAvatar[\s\S]*?uri=\{avatarUrl\}/);
  assert.match(picker, /launchImageLibraryAsync/);
  assert.doesNotMatch(picker, /launchCameraAsync|requestCameraPermissionsAsync|requestMediaLibraryPermissionsAsync/);
  assert.match(pickerCore, /aspect: \[1, 1\]/);
  assert.match(pickerCore, /base64: true/);
  assert.match(pickerCore, /\^\\\/9j\\\//);
  assert.match(pickerCore, /\^iVBORw0KGgo/);
});

test('landscape editor reserves both cutout insets without shrinking touch targets', () => {
  const screen = mountEditor({
    width: 844,
    height: 390,
    insets: { top: 0, bottom: 8, left: 44, right: 28 },
  });
  const scroll = screen.nodes.find(node => node.type === 'ScrollView');
  assert.equal(scroll.props.contentContainerStyle.paddingLeft, 60);
  assert.equal(scroll.props.contentContainerStyle.paddingRight, 44);
  assert.equal(flattenStyle(screen.action('profile-edit-back').props.style({ pressed: false })).height, 44);
});
