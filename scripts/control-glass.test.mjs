import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/components/ControlGlass.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount(platform, nativeAvailable = true) {
  const slots = [], cleanups = [];
  let cursor = 0, imported = 0, lateUpdates = 0, mounted = true, changed, resolvePreference;
  const preference = new Promise(resolve => { resolvePreference = resolve; });
  const react = {
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { if (!mounted) lateUpdates++; slots[i] = value; }];
    },
    useEffect(callback) { const i = cursor++; if (!(i in slots)) { slots[i] = true; cleanups.push(callback()); } },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return require(name);
    if (name === 'expo') return { requireOptionalNativeModule() {
      assert.notEqual(platform, 'web');
      return nativeAvailable ? {} : null;
    } };
    if (name === 'expo-blur') { imported++; return { BlurView: 'BlurView', BlurTargetView: 'BlurTargetView' }; }
    if (name === 'react-native') return {
      Platform: { OS: platform }, View: 'View', StyleSheet: { absoluteFill: { position: 'absolute' } },
      AccessibilityInfo: {
        isReduceTransparencyEnabled: () => preference,
        addEventListener(_name, callback) { changed = callback; return { remove() { changed = null; } }; },
      },
    };
    throw new Error(name);
  } });
  return {
    render(dark = false) { cursor = 0; return module.exports.useControlGlass(dark); },
    target: module.exports.ControlGlassTarget,
    get imported() { return imported; }, get lateUpdates() { return lateUpdates; },
    async preference(value) { resolvePreference(value); await new Promise(resolve => setImmediate(resolve)); },
    change(value) { changed?.(value); },
    unmount() { mounted = false; cleanups.forEach(cleanup => cleanup?.()); },
  };
}

test('older Android APK keeps a noninteractive tint without loading unavailable blur', () => {
  const m = mount('android', false);
  assert.equal(m.target, 'View');
  assert.equal(m.render().backdrop(), null);
  assert.equal(m.imported, 0);
  m.unmount();
});

test('supported surfaces share one blur target and never receive input', () => {
  for (const platform of ['android', 'web']) {
    const m = mount(platform);
    const glass = m.render();
    const layer = glass.backdrop();
    assert.equal(layer.type, 'BlurView');
    assert.equal(layer.props.pointerEvents, 'none');
    assert.equal(layer.props.blurTarget, glass.target);
    assert.equal(layer.props.blurMethod, 'dimezisBlurViewSdk31Plus');
    assert.equal(layer.props.accessible, false);
    assert.equal(m.render(true).target, glass.target);
    m.unmount();
  }
});

test('reduce transparency overrides late preferences and ignores unmounted replies', async () => {
  const m = mount('ios');
  assert.equal(m.render().backdrop(), null);
  m.change(true);
  await m.preference(false);
  assert.equal(m.render().backdrop(), null);
  m.change(false);
  assert.equal(m.render().backdrop().type, 'BlurView');
  m.change(true);
  assert.equal(m.render().backdrop(), null);
  m.unmount();
  const retired = mount('ios');
  retired.render(); retired.unmount(); await retired.preference(false);
  assert.equal(retired.lateUpdates, 0);
});
