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

test('production entry mounts its root below FontProvider', () => {
  for (const file of ['index.ts']) {
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
  const exceptions = new Set(['src/components/AppText.tsx', 'src/components/PrismaticLoadingScreen.tsx', 'src/fonts/FontProvider.tsx']);
  const violations = [];
  for (const file of files.filter(file => !exceptions.has(file))) {
    const source = readFileSync(new URL(file, root), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const renderedNames = new Set();
    const importedFromAppText = new Set();
    function visit(node) {
      if (ts.isImportDeclaration(node) && /(?:^|\/)(?:AppText|HomeText)$/.test(node.moduleSpecifier.text)) {
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

function loadText(os) {
  const module = { exports: {} };
  vm.runInNewContext(compile('src/components/AppText.tsx'), {
    module, exports: module.exports,
    require(name) {
      if (name === 'react') return { useContext: () => os !== 'ios' };
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === 'react-native') return {
        Platform: { OS: os }, Text: 'Text', TextInput: 'TextInput',
        StyleSheet: { flatten: value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean)) },
      };
      if (name === '../fonts/home') return {
        ProductFontContext: {},
        productFont: style => {
          const value = Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
          if (value.fontFamily && !value.fontFamily.startsWith('Home')) return undefined;
          const weight = value.fontWeight === 'bold' ? 700 : Number(value.fontWeight ?? 400);
          return { fontFamily: weight >= 700 ? 'HomeBold' : weight >= 600 ? 'HomeSemibold' : weight >= 500 ? 'HomeMedium' : 'HomeRegular', fontWeight: '400' };
        },
      };
      throw new Error(name);
    },
  });
  return module.exports;
}

for (const os of ['ios', 'android', 'web']) {
  test(os + ': text wrappers preserve weights, refs, scaling and input events', () => {
    const { Text, TextInput } = loadText(os);
    const ref = { current: null };
    const style = { fontWeight: '600', fontStyle: 'italic', lineHeight: 24 };
    const onChangeText = () => {};
    for (const Component of [Text, TextInput]) {
      const node = Component({ ref, style, children: '设备 123', onChangeText, allowFontScaling: true });
      assert.equal(node.props.ref, ref);
      assert.equal(node.props.onChangeText, onChangeText);
      assert.equal(node.props.allowFontScaling, true);
      assert.equal(node.props.style[1], style);
      if (os === 'ios') assert.equal(node.props.style[0], undefined);
      else assert.equal(node.props.style[0].fontFamily, 'HomeSemibold');
      const explicit = Component({ style: { fontFamily: 'monospace' } });
      assert.equal(explicit.props.style[0], undefined);
    }
    const nested = Text({ children: Text({ children: 'nested' }) });
    assert.equal(nested.props.children.props.style[1], undefined, 'nested text keeps native weight inheritance');
  });
}


test('product fonts select real face files instead of synthesized bold', () => {
  const module = { exports: {} };
  vm.runInNewContext(compile('src/fonts/home.ts'), { module, exports: module.exports, require(name) {
    if (name === 'react') return { createContext: value => ({ value }) };
    if (name === 'react-native') return { Platform: { OS: 'android' }, StyleSheet: { flatten: value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean)) } };
    throw Error(name);
  } });
  const font = module.exports.productFont;
  for (const [weight, face] of [['400', 'HomeRegular'], ['500', 'HomeMedium'], ['600', 'HomeSemibold'], ['700', 'HomeBold']]) {
    assert.equal(font({ fontWeight: weight }).fontFamily, face);
    assert.equal(font({ fontWeight: weight }).fontWeight, '400');
  }
  assert.equal(font({ fontFamily: 'monospace' }), undefined);
  assert.equal(font({ fontFamily: 'Feather' }), undefined);
  const ios = { module: { exports: {} } };
  vm.runInNewContext(compile('src/fonts/home.ts'), { module: ios.module, exports: ios.module.exports, require(name) {
    if (name === 'react') return { createContext: value => ({ value }) };
    if (name === 'react-native') return { Platform: { OS: 'ios' }, StyleSheet: { flatten: value => value ?? {} } };
    throw Error(name);
  } });
  assert.equal(ios.module.exports.productFont({ fontWeight: '600' }), undefined);
});

test('font provider waits for local faces and falls back on a loading error', () => {
  for (const [loaded, error] of [[false, null], [true, null], [false, Error('load failed')]]) {
    const module = { exports: {} };
    vm.runInNewContext(compile('src/fonts/FontProvider.tsx'), {
      module, exports: module.exports, require(name) {
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
        if (name === 'react') return { useState: initial => [initial, () => {}], useEffect() {} };
        if (name === 'react-native') return { Platform: { OS: 'android' }, ActivityIndicator: 'Spinner', View: 'View', StyleSheet: { create: value => value } };
        if (name === 'expo-font') return { useFonts: () => [loaded, error] };
        if (name === '@expo/vector-icons') return { Feather: { font: {} }, Ionicons: { font: {} } };
        if (name === './home') return { ProductFontContext: { Provider: 'FontContext' } };
        if (name.endsWith('.otf')) return name;
        throw Error(name);
      },
    });
    const node = module.exports.FontProvider({ children: 'app' });
    if (!loaded && !error) assert.equal(node.props.children.type, 'Spinner');
    else { assert.equal(node.props.value, loaded); assert.equal(node.props.children.props.children, 'app'); }
  }
});

test('web waits for glyph loading and preserves a usable fallback on failure', async () => {
  for (const fail of [false, true]) {
    const module = { exports: {} }, effects = [], faces = [];
    let state = null;
    vm.runInNewContext(compile('src/fonts/FontProvider.tsx'), {
      module, exports: module.exports,
      document: { fonts: { load(face) { faces.push(face); return fail ? Promise.reject(Error('font unavailable')) : Promise.resolve([]); } } },
      require(name) {
        if (name === 'react') return { useState: () => [state, value => { state = value; }], useEffect: effect => effects.push(effect) };
        if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
        if (name === 'react-native') return { Platform: { OS: 'web' }, ActivityIndicator: 'Spinner', View: 'View', StyleSheet: { create: value => value } };
        if (name === 'expo-font') return { useFonts: () => [true, null] };
        if (name === '@expo/vector-icons') return { Feather: { font: {} }, Ionicons: { font: {} } };
        if (name === './home') return { ProductFontContext: { Provider: 'FontContext' } };
        if (name.endsWith('.otf')) return name;
        throw Error(name);
      },
    });
    assert.equal(module.exports.FontProvider({ children: 'app' }).props.children.type, 'Spinner');
    const cleanup = effects.shift()();
    for (let i = 0; i < 8; i++) await Promise.resolve();
    const node = module.exports.FontProvider({ children: 'app' });
    assert.equal(node.props.value, !fail);
    assert.equal(node.props.children.props.children, 'app');
    assert.equal(faces.length, 4);
    cleanup();
  }
});
