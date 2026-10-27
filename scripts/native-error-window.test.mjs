import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { classifyErrorWindow } from './helpers/native-error-window.mjs';

const displayDump = ({ id = 'a1b2c3', title = 'Application Not Responding: com.doso.robot.qa', user = 0 } = {}) =>
  `WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)\n  Display: mDisplayId=0\n  mCurrentFocus=Window{${id} u${user} ${title}}`;
const windowDump = ({ id = 'a1b2c3', title = 'Application Not Responding: com.doso.robot.qa', user = 0,
  owner = 'mOwnerUid=1000 showForAllUsers=true package=android appop=NONE' } = {}) =>
  `WINDOW MANAGER WINDOWS (dumpsys window windows)\n  Window #0 Window{${id} u${user} ${title}}:\n    ${owner}\nWINDOW MANAGER POLICY STATE (dumpsys window policy)`;
const UNKNOWN = { windowKind: 'unknown', expectedTitleMatch: 'unknown', rawValuesRetained: false };
const classify = overrides => classifyErrorWindow({ displayDump: displayDump(), windowDump: windowDump(),
  markerIds: ['android:id/aerr_wait'], expectedProcessKnown: true, ...overrides });

test('attributes one source-shaped ANR window across two matching snapshots', () => {
  assert.deepEqual(classify({ markerIds: ['android:id/aerr_close', 'android:id/aerr_wait'] }),
    { windowKind: 'anr-title', expectedTitleMatch: 'match', rawValuesRetained: false });
});

test('classifies app error and treats a different ASCII process only as not confirmed', () => {
  const title = 'Application Error: com.doso.other:worker';
  assert.deepEqual(classify({ displayDump: displayDump({ title }), windowDump: windowDump({ title }),
    markerIds: ['android:id/aerr_restart'] }),
  { windowKind: 'app-error-title', expectedTitleMatch: 'not-confirmed', rawValuesRetained: false });
});

test('requires known expected process and exact four-field input shape', () => {
  assert.deepEqual(classify({ expectedProcessKnown: false }), UNKNOWN);
  assert.deepEqual(classify({ privateCanary: 'private-field-canary' }), UNKNOWN);
  for (const value of [null, [], {}, { displayDump: displayDump(), windowDump: windowDump(), markerIds: [], expectedProcessKnown: 'true' }]) {
    assert.deepEqual(classifyErrorWindow(value), UNKNOWN);
  }
});

test('validates each snapshot independently and forbids cross-side records', () => {
  assert.deepEqual(classify({ displayDump: `${displayDump()}\nWINDOW MANAGER WINDOWS (dumpsys window windows)` }), UNKNOWN);
  assert.deepEqual(classify({ displayDump: `${displayDump()}\n  Window #0 Window{a1b2c3 u0 Other}:` }), UNKNOWN);
  assert.deepEqual(classify({ windowDump: `${windowDump()}\nWINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)` }), UNKNOWN);
  assert.deepEqual(classify({ windowDump: `${windowDump()}\n    mCurrentFocus=Window{a1b2c3 u0 Other}` }), UNKNOWN);
});

test('requires one exact focus in DISPLAY and one exact WINDOWS header', () => {
  assert.deepEqual(classify({ displayDump: `${displayDump()}\n  mCurrentFocus=private-focus-canary` }), UNKNOWN);
  assert.deepEqual(classify({ displayDump: displayDump().replace('DISPLAY CONTENTS', 'DISPLAY CONTENT') }), UNKNOWN);
  assert.deepEqual(classify({ displayDump: `${displayDump()}\nWINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)` }), UNKNOWN);
  assert.deepEqual(classify({ windowDump: windowDump().replace('WINDOW MANAGER WINDOWS', 'WINDOW MANAGER WINDOW') }), UNKNOWN);
  assert.deepEqual(classify({ windowDump: `${windowDump()}\nWINDOW MANAGER WINDOWS (dumpsys window windows)` }), UNKNOWN);
  assert.deepEqual(classify({ displayDump: displayDump().replace('  mCurrentFocus=', '    mCurrentFocus=') }), UNKNOWN);
  assert.deepEqual(classify({ windowDump: windowDump().replace('  Window #0', '    Window #0') }), UNKNOWN);
});

test('requires exact ID, title and user correlation across non-atomic snapshots', () => {
  assert.deepEqual(classify({ windowDump: windowDump({ id: 'd4e5f6' }) }), UNKNOWN);
  assert.deepEqual(classify({ windowDump: windowDump({ title: 'Application Error: com.doso.robot.qa' }) }), UNKNOWN);
  assert.deepEqual(classify({ displayDump: displayDump({ user: 10 }), windowDump: windowDump({ user: 10 }) }), UNKNOWN);
  const duplicate = windowDump().replace('WINDOW MANAGER POLICY STATE',
    '  Window #1 Window{a1b2c3 u0 Application Error: com.doso.robot.qa}:\n    mOwnerUid=1000 showForAllUsers=false package=android appop=NONE\nWINDOW MANAGER POLICY STATE');
  assert.deepEqual(classify({ windowDump: duplicate }), UNKNOWN);
});

test('uses only the matched block owner and requires a block terminator', () => {
  const borrowed = windowDump().replace('    mOwnerUid=1000 showForAllUsers=true package=android appop=NONE',
    '  Window #1 Window{d4e5f6 u0 Other}:\n    mOwnerUid=1000 showForAllUsers=true package=android appop=NONE');
  assert.deepEqual(classify({ windowDump: borrowed }), UNKNOWN);
  for (const owner of ['mOwnerUid=10001 showForAllUsers=true package=android appop=NONE',
    'mOwnerUid=1000 showForAllUsers=true package=com.doso.robot.qa appop=NONE',
    'mOwnerUid=1000 showForAllUsers=true package=android appop=none',
    'mOwnerUid=1000 showForAllUsers=yes package=android appop=NONE']) {
    assert.deepEqual(classify({ windowDump: windowDump({ owner }) }), UNKNOWN);
  }
  assert.deepEqual(classify({ windowDump: windowDump().replace('    mOwnerUid=', '    mOwnerUid=private-owner-canary\n    mOwnerUid=') }), UNKNOWN);
  assert.deepEqual(classify({ windowDump: windowDump().replace(/\nWINDOW MANAGER POLICY STATE.*$/u, '') }), UNKNOWN);
});

test('accepts a matched block closed by the next window when an unrelated final block reaches EOF', () => {
  const realistic = `WINDOW MANAGER WINDOWS (dumpsys window windows)
  Window #0 Window{a1b2c3 u0 Application Not Responding: com.doso.robot.qa}:
    mOwnerUid=1000 showForAllUsers=true package=android appop=NONE
  Window #1 Window{d4e5f6 u0 Other}:
    mOwnerUid=1000 showForAllUsers=false package=android appop=NONE`;
  assert.deepEqual(classify({ windowDump: realistic }),
    { windowKind: 'anr-title', expectedTitleMatch: 'match', rawValuesRetained: false });
});

test('requires exact unique allowed markers consistent with the title kind', () => {
  for (const markerIds of [[], ['android:id/aerr_wait', 'android:id/aerr_wait'],
    ['android:id/aerr_wait', 'private-marker-canary'], ['android:id/aerr_wait', 'android:id/aerr_restart'],
    'android:id/aerr_wait']) assert.deepEqual(classify({ markerIds }), UNKNOWN);
  const title = 'Application Error: com.doso.robot.qa';
  assert.deepEqual(classify({ displayDump: displayDump({ title }), windowDump: windowDump({ title }), markerIds: ['android:id/aerr_close'] }), UNKNOWN);
  assert.deepEqual(classify({ displayDump: displayDump({ title }), windowDump: windowDump({ title }), markerIds: ['android:id/aerr_wait'] }), UNKNOWN);
});

test('rejects title lookalikes and non-ASCII process suffixes', () => {
  for (const title of ['Application Not Responding : com.doso.robot.qa',
    'application Not Responding: com.doso.robot.qa', 'Application Not Responding: com/doso/robot/qa',
    'Application Not Responding: 私有进程', 'Application Error: com.doso.robot.qa extra']) {
    assert.deepEqual(classify({ displayDump: displayDump({ title }), windowDump: windowDump({ title }) }), UNKNOWN);
  }
});

test('rejects controls and UTF-8 content above 2 MiB separately without retaining canaries', () => {
  const canary = 'private-window-canary@example.invalid-token-87654321';
  for (const overrides of [{ displayDump: `${displayDump()}\u0000${canary}` },
    { windowDump: `${windowDump()}\u000B${canary}` },
    { displayDump: `${displayDump()}\n${'界'.repeat(700_000)}${canary}` },
    { windowDump: `${windowDump()}\n${'界'.repeat(700_000)}${canary}` }]) {
    const result = classify(overrides);
    assert.deepEqual(result, UNKNOWN);
    assert.equal(JSON.stringify(result).includes(canary), false);
  }
});

test('CLI emits fixed JSON and never echoes malformed or oversized UTF-8 stdin', () => {
  const run = value => spawnSync(process.execPath, ['scripts/classify-native-error-window.mjs'],
    { input: value, encoding: 'utf8', timeout: 5000 });
  const good = run(JSON.stringify({ displayDump: displayDump(), windowDump: windowDump(),
    markerIds: ['android:id/aerr_wait'], expectedProcessKnown: true }));
  assert.equal(good.status, 0);
  assert.deepEqual(JSON.parse(good.stdout), { windowKind: 'anr-title', expectedTitleMatch: 'match', rawValuesRetained: false });
  const canary = 'private-cli-canary@example.invalid-token-87654321';
  for (const value of [`{"displayDump":"${canary}`, `${'x'.repeat(8 * 1024 * 1024)}${canary}`]) {
    const bad = run(value);
    assert.equal(bad.status, 1);
    assert.deepEqual(JSON.parse(bad.stdout), UNKNOWN);
    assert.equal(bad.stderr, '');
    assert.equal(bad.stdout.includes(canary), false);
  }
  const validUnknown = run(JSON.stringify({ displayDump: displayDump(), windowDump: windowDump(), markerIds: [], expectedProcessKnown: true }));
  assert.equal(validUnknown.status, 0);
  assert.deepEqual(JSON.parse(validUnknown.stdout), UNKNOWN);
});

test('accepts source-shaped CRLF snapshots without whitespace normalization of title or owner', () => {
  assert.deepEqual(classify({ displayDump: displayDump().replaceAll('\n', '\r\n'), windowDump: windowDump().replaceAll('\n', '\r\n') }),
    { windowKind: 'anr-title', expectedTitleMatch: 'match', rawValuesRetained: false });
  const title = 'Application Not Responding: com.doso.robot.qa.evil';
  assert.deepEqual(classify({ displayDump: displayDump({ title }), windowDump: windowDump({ title }) }),
    { windowKind: 'anr-title', expectedTitleMatch: 'not-confirmed', rawValuesRetained: false });
});

test('valid-shaped dynamic process and unrelated fields never leave helper or real CLI', () => {
  const processCanary = 'privateProcessCanary123';
  const fieldCanary = 'private-session-field-canary';
  const title = `Application Not Responding: ${processCanary}`;
  const fixture = { displayDump: displayDump({ title }), windowDump: windowDump({ title }).replace('\n    mOwnerUid=', `\n    mSession=${fieldCanary}\n    mOwnerUid=`),
    markerIds: ['android:id/aerr_wait'], expectedProcessKnown: true };
  const result = classifyErrorWindow(fixture);
  assert.deepEqual(result, { windowKind: 'anr-title', expectedTitleMatch: 'not-confirmed', rawValuesRetained: false });
  const cli = spawnSync(process.execPath, ['scripts/classify-native-error-window.mjs'], { input: JSON.stringify(fixture), encoding: 'utf8', timeout: 5000 });
  assert.equal(cli.status, 0);
  assert.equal(cli.stderr, '');
  assert.deepEqual(JSON.parse(cli.stdout), result);
  for (const canary of [processCanary, fieldCanary, title]) assert.equal(JSON.stringify(result).includes(canary) || cli.stdout.includes(canary), false);
});
