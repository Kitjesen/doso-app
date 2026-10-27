import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
const compile = file => ts.transpileModule(readFileSync(new URL(file, root), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test('both production and isolated-preview entries mount their root below FontProvider', () => {
  for (const file of ['index.ts', 'index.preview.ts']) {
    const source = readFileSync(new URL(file, root), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
    let importsFontProvider = false;
    let wrapsRoot = false;
    function visit(node) {
      if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === './src/fonts/FontProvider') {
        importsFontProvider = node.importClause?.namedBindings?.elements?.some(element => element.name.text === 'FontProvider') ?? false;
      }
      if (ts.isCallExpression(node) && node.expression.getText(ast) === 'createElement' && node.arguments[0]?.getText(ast) === 'FontProvider') wrapsRoot = true;
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.equal(importsFontProvider, true, `${file} imports FontProvider`);
    assert.equal(wrapsRoot, true, `${file} mounts its root below FontProvider`);
  }
});

test('every business JSX Text and TextInput resolves through AppText', () => {
  const files = ['App.tsx'];
  const pending = ['src'];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of require('node:fs').readdirSync(new URL(`${directory}/`, root), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) pending.push(relative);
      else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative);
    }
  }
  const exceptions = new Set(['src/components/AppText.tsx', 'src/fonts/FontProvider.tsx']);
  const violations = [];
  for (const file of files.filter(file => !exceptions.has(file))) {
    const source = readFileSync(new URL(file, root), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const renderedNames = new Set();
    const importedFromAppText = new Set();
    function visit(node) {
      if (ts.isImportDeclaration(node) && /(?:^|\/)AppText$/.test(node.moduleSpecifier.text)) {
        for (const element of node.importClause?.namedBindings?.elements ?? []) importedFromAppText.add(element.name.text);
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && ts.isIdentifier(node.tagName)
        && (node.tagName.text === 'Text' || node.tagName.text === 'TextInput')) renderedNames.add(node.tagName.text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    for (const name of renderedNames) if (!importedFromAppText.has(name)) violations.push(`${file}: <${name}>`);
  }
  assert.deepEqual(violations, []);
});

test('bundled font bytes, hashes and cmap tables match the immutable manifest', () => {
  const directory = new URL('assets/fonts/', root);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', directory), 'utf8'));
  assert.equal(manifest.modified, false);
  assert.equal(manifest.fonts.length, 4);
  for (const font of manifest.fonts) {
    const file = new URL(font.file, directory);
    assert.equal(statSync(file).size, font.bytes, `${font.file} byte length`);
    const bytes = readFileSync(file);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), font.sha256, `${font.file} SHA-256`);
    const tableCount = bytes.readUInt16BE(4);
    let cmap = null;
    for (let index = 0; index < tableCount; index += 1) {
      const record = 12 + index * 16;
      if (bytes.toString('ascii', record, record + 4) === 'cmap') cmap = {
        offset: bytes.readUInt32BE(record + 8), length: bytes.readUInt32BE(record + 12),
      };
    }
    assert.ok(cmap && cmap.length > 0 && cmap.offset + cmap.length <= bytes.length, `${font.file} contains an in-bounds cmap table`);
  }
  const license = readFileSync(new URL('MiSans-License.pdf', directory));
  assert.equal(createHash('sha256').update(license).digest('hex'), manifest.licenseSha256, 'license SHA-256');
});

function loadFontFamily() {
  const module = { exports: {} };
  vm.runInNewContext(compile('src/fonts/font-family.ts'), { module, exports: module.exports, require() { throw new Error('font resolver has no runtime dependency'); } });
  return module.exports;
}

test('font resolver maps the supported weights to real static MiSans faces', () => {
  const { fontFamilies, resolveFontStyle } = loadFontFamily();
  assert.deepEqual({ ...fontFamilies }, {
    regular: 'MiSans-Regular', medium: 'MiSans-Medium', semibold: 'MiSans-Demibold', bold: 'MiSans-Bold',
  });
  for (const [weight, family] of [
    ['300', fontFamilies.regular], ['400', fontFamilies.regular], ['normal', fontFamilies.regular],
    ['500', fontFamilies.medium], ['600', fontFamilies.semibold], ['700', fontFamilies.bold], ['bold', fontFamilies.bold],
  ]) assert.deepEqual({ ...resolveFontStyle({ fontWeight: weight }, true) }, { fontFamily: family, fontWeight: 'normal' }, weight);
});

test('font resolver preserves native fallback, explicit families and italic copy', () => {
  const { resolveFontStyle } = loadFontFamily();
  assert.equal(resolveFontStyle({ fontWeight: '600' }, false), undefined);
  assert.equal(resolveFontStyle({ fontFamily: 'monospace', fontWeight: '600' }, true), undefined);
  assert.equal(resolveFontStyle({ fontStyle: 'italic', fontWeight: '600' }, true), undefined);
});

test('font resolver inherits the nearest text weight when a nested span has no weight', () => {
  const { fontFamilies, getFontWeight, resolveFontStyle } = loadFontFamily();
  assert.equal(getFontWeight(undefined, '600'), '600');
  assert.deepEqual({ ...resolveFontStyle(undefined, true, '600') }, { fontFamily: fontFamilies.semibold, fontWeight: 'normal' });
  assert.deepEqual({ ...resolveFontStyle({ fontWeight: '500' }, true, '700') }, { fontFamily: fontFamilies.medium, fontWeight: 'normal' });
});

function loadAppText({ ready = true } = {}) {
  const contexts = [];
  const jsxRuntime = {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
  };
  const react = {
    createContext(value) {
      const context = { value };
      context.Provider = { context };
      contexts.push(context);
      return context;
    },
    useContext: context => context.value,
  };
  const native = {
    StyleSheet: { flatten: style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean)) },
    Text: 'NativeText', TextInput: 'NativeTextInput',
  };
  const fontReadyContext = { value: ready };
  const module = { exports: {} };
  vm.runInNewContext(compile('src/components/AppText.tsx'), {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return jsxRuntime;
      if (name === 'react-native') return native;
      if (name === '../fonts/FontProvider') return { FontReadyContext: fontReadyContext };
      if (name === '../fonts/font-family') return loadFontFamily();
      throw new Error(`Unexpected AppText dependency: ${name}`);
    },
  });
  return { ...module.exports, jsxRuntime };
}

test('AppText preserves native props and refs while appending the loaded face', () => {
  const { Text, TextInput } = loadAppText();
  const textRef = { current: null };
  const inputRef = { current: null };
  const label = Text({ accessibilityLabel: '名称', ref: textRef, style: { fontWeight: '600' }, children: 'THUNDER 01' });
  const field = TextInput({ accessibilityLabel: '用户名', ref: inputRef, style: { fontWeight: '500' } });
  assert.equal(label.type, 'NativeText');
  assert.equal(label.props.ref, textRef);
  assert.equal(label.props.accessibilityLabel, '名称');
  assert.deepEqual({ ...label.props.style.at(-1) }, { fontFamily: 'MiSans-Demibold', fontWeight: 'normal' });
  assert.equal(field.type, 'NativeTextInput');
  assert.equal(field.props.ref, inputRef);
  assert.equal(field.props.accessibilityLabel, '用户名');
  assert.deepEqual({ ...field.props.style.at(-1) }, { fontFamily: 'MiSans-Medium', fontWeight: 'normal' });
});

test('nested AppText inherits its nearest parent weight instead of dropping to regular', () => {
  const { Text, jsxRuntime } = loadAppText();
  const rootNode = jsxRuntime.jsx(Text, {
    style: { fontWeight: '600' },
    children: jsxRuntime.jsx(Text, { testID: 'nested-copy', children: '内部文字' }),
  });
  const hostNodes = [];
  function render(node) {
    if (node == null || typeof node !== 'object') return;
    if (typeof node.type === 'function') return render(node.type(node.props));
    if (node.type?.context) {
      const context = node.type.context;
      const previous = context.value;
      context.value = node.props.value;
      render(node.props.children);
      context.value = previous;
      return;
    }
    hostNodes.push(node);
    render(node.props?.children);
  }
  render(rootNode);
  const nested = hostNodes.find(node => node.props.testID === 'nested-copy');
  assert.deepEqual({ ...nested.props.style.at(-1) }, { fontFamily: 'MiSans-Demibold', fontWeight: 'normal' });
});

function mountFontProvider({ loaded = false, error = null } = {}) {
  const slots = [];
  const effects = [];
  const timers = [];
  let cursor = 0;
  const readyContext = { value: false, Provider: 'FontReadyProvider' };
  const react = {
    createContext: value => Object.assign(readyContext, { value }),
    useEffect: effect => { effects.push(effect); },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in slots)) slots[slot] = initial;
      return [slots[slot], value => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compile('src/fonts/FontProvider.tsx'), {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'expo-font') return { useFonts: () => [loaded, error] };
      if (name === 'react-native') return {
        ActivityIndicator: 'ActivityIndicator', Text: 'Text', View: 'View',
        StyleSheet: { create: value => value }, useColorScheme: () => 'light',
      };
      if (name === './font-family') return loadFontFamily();
      if (name.startsWith('../../assets/fonts/')) return name;
      throw new Error(`Unexpected FontProvider dependency: ${name}`);
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
  });
  const render = () => { cursor = 0; effects.length = 0; return module.exports.FontProvider({ children: 'app' }); };
  return { exports: module.exports, render, effects, timers };
}

test('FontProvider shows one accessible preparation state while local faces load', () => {
  const app = mountFontProvider();
  const result = app.render();
  assert.equal(result.type, 'View');
  assert.equal(result.props.testID, 'font-loading');
  assert.equal(result.props.children[0].props.accessibilityLabel, '正在准备界面');
  app.effects[0]();
  assert.equal(app.timers[0].delay, app.exports.FONT_LOAD_TIMEOUT_MS);
});

test('FontProvider exposes ready only after all local faces load', () => {
  const loaded = mountFontProvider({ loaded: true }).render();
  assert.equal(loaded.type, 'FontReadyProvider');
  assert.equal(loaded.props.value, true);
  assert.equal(loaded.props.children.type, 'View');
  assert.equal(loaded.props.children.props.testID, 'app-font-misans');
  assert.equal(loaded.props.children.props.children, 'app');
});

test('FontProvider falls back to the system font after a local face load error', () => {
  const failed = mountFontProvider({ error: new Error('bad local font') }).render();
  assert.equal(failed.type, 'FontReadyProvider');
  assert.equal(failed.props.value, false);
  assert.equal(failed.props.children.type, 'View');
  assert.equal(failed.props.children.props.testID, 'app-font-system-fallback');
  assert.equal(failed.props.children.props.children, 'app');
});

test('FontProvider times out to the native fallback instead of blocking startup forever', () => {
  const app = mountFontProvider();
  app.render();
  app.effects[0]();
  app.timers[0].callback();
  const fallback = app.render();
  assert.equal(fallback.type, 'FontReadyProvider');
  assert.equal(fallback.props.value, false);
  assert.equal(fallback.props.children.props.testID, 'app-font-system-fallback');
});
