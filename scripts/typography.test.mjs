import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const source = readFileSync(new URL('../src/typography.ts', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: module.exports });
const { typography } = module.exports;
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style || {};

test('shared text roles pair restrained weights with CJK-friendly line heights', () => {
  assert.deepEqual(Object.keys(typography), ['pageTitle', 'sectionTitle', 'cardTitle', 'body', 'secondary', 'caption', 'label', 'button', 'compactTitle', 'metric', 'supporting']);
  for (const [name, role] of Object.entries(typography)) {
    assert.ok(role.fontSize >= 12, name);
    assert.ok(role.lineHeight >= role.fontSize * 1.3, name);
    assert.ok(['400', '500', '600'].includes(role.fontWeight), name);
    assert.equal(role.fontFamily, undefined, 'use platform script-aware system fonts');
    assert.equal(role.letterSpacing, undefined, 'do not tighten Chinese tracking');
  }
  assert.equal(typography.cardTitle.fontSize, 16);
  assert.equal(typography.cardTitle.lineHeight, 24);
});

for (const size of [
  { label: 'portrait', width: 390, height: 844, fontScale: 1 },
  { label: 'landscape', width: 844, height: 390, fontScale: 1 },
  { label: 'large text', width: 390, height: 844, fontScale: 1.5 },
]) {
  test(`${size.label}: shared App header uses paired text metrics without disabling scaling`, () => {
    const screen = mountAuthScreen({ screen: 'header', ...size, displayName: 'DOSO Demo', referenceDate: new Date(2026, 9, 11) });
    const texts = screen.nodes.filter(node => node.type === 'Text');
    assert.equal(texts.length, 3, 'default avatar initial plus greeting and date');
    const greeting = flatten(texts.find(node => node.props.children === '你好，DOSO Demo').props.style);
    const role = size.width > size.height ? typography.cardTitle : typography.sectionTitle;
    assert.equal(greeting.fontSize, role.fontSize);
    assert.equal(greeting.lineHeight, role.lineHeight);
    for (const node of texts) {
      assert.notEqual(node.props.allowFontScaling, false);
      assert.equal(node.props.maxFontSizeMultiplier, undefined);
    }
    assert.ok(screen.copy.includes('DOSO Demo'));
  });
}
