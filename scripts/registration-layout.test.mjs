import assert from 'node:assert/strict';
import test from 'node:test';
import { getRegistrationLayout, registrationPasswordChecks } from '../src/screens/registrationLayout.ts';

test('portrait content fits small, standard and tablet safe widths', () => {
  for (const width of [280, 320, 360, 390, 430, 600]) {
    const layout = getRegistrationLayout(width);
    assert.equal(layout.wide, false);
    assert.ok(layout.contentWidth + 2 * layout.gutter <= width);
    assert.equal(layout.formWidth, layout.contentWidth);
    assert.equal(layout.introWidth, layout.contentWidth);
  }
});

test('landscape has exactly bounded independent regions after the native cutout', () => {
  const layout = getRegistrationLayout(844 - 48);
  assert.equal(layout.wide, true);
  assert.equal(layout.contentWidth, 748);
  assert.equal(layout.introWidth + layout.formWidth + layout.gap, 748);
  assert.ok(layout.formWidth >= 420);
  assert.equal(layout.inlineIdentity, true);
});

test('large text stacks identity fields and then the entire composition', () => {
  assert.equal(getRegistrationLayout(796, 1.2).inlineIdentity, false);
  assert.equal(getRegistrationLayout(796, 1.5).wide, false);
});

test('wide desktop stays bounded; invalid transitional measurements never produce negative widths', () => {
  for (const width of [0, -3, NaN, Infinity, 2000]) {
    const layout = getRegistrationLayout(width);
    assert.ok(Number.isFinite(layout.contentWidth));
    assert.ok(layout.contentWidth >= 0 && layout.contentWidth <= 1040);
    assert.ok(layout.formWidth >= 0);
  }
});

test('password hint reports actual requirements, not a simulated strength score', () => {
  const valid = password => registrationPasswordChecks(password).every(check => check.met);
  assert.equal(valid(''), false);
  assert.equal(valid('Strong123'), false);
  assert.equal(valid('lowercase1234'), false);
  assert.equal(valid('UPPERCASE1234'), false);
  assert.equal(valid('StrongWithoutDigits'), false);
  assert.equal(valid('StrongPass123'), true);
});
