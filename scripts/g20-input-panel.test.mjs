import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/G20InputPanel.tsx', import.meta.url), 'utf8');
const typography = { compactTitle: { fontSize: 20 }, cardTitle: { fontSize: 16 }, body: { fontSize: 16 }, caption: { fontSize: 12 } };
const colors = { background: '#FFFFFF', surface: '#F4F7FA', ink: '#253441', muted: '#586675', line: '#E2E6F0', authPrimary: '#0066FF', authPrimaryInk: '#FFFFFF' };
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function renderPanel(initial = {}) {
  const module = { exports: {} };
  const dependencies = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    './AppText': { Text: 'Text' },
    '../theme': { useAppTheme: () => ({ colors }) },
    '../typography': { typography },
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: name => {
    assert.ok(name in dependencies, `Unexpected G20 panel dependency: ${name}`);
    return dependencies[name];
  } });
  const calls = [];
  const state = {
    status: 'stopped', reading: false, available: true, message: null,
    sample: null, axes: {}, buttons: {}, calibrating: false, calibrated: false, vector: null,
    ...initial.state,
  };
  const props = {
    state,
    onStart: () => calls.push('start'), onStop: () => calls.push('stop'),
    onBeginCalibration: () => calls.push('begin'), onFinishCalibration: () => calls.push('finish'),
    onClearCalibration: () => calls.push('clear'), onClose: () => calls.push('close'),
    onLearnAxis: axis => calls.push(['axis', axis]), onLearnButton: action => calls.push(['button', action]),
    source: 'touch', onSourceChange: source => calls.push(['source', source]),
    ...initial, state,
  };
  let nodes;
  const copy = node => {
    if (node == null || typeof node === 'boolean') return '';
    if (Array.isArray(node)) return node.map(copy).join(' ');
    if (typeof node !== 'object') return String(node);
    return copy(node.props?.children);
  };
  function render(update = {}) {
    Object.assign(props, update);
    nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      nodes.push(node);
      walk(node.props?.children);
    }
    walk(module.exports.G20InputPanel(props));
  }
  render();
  const find = id => nodes.find(node => node.props?.testID === id);
  return {
    calls, props, render, find,
    copy: id => copy(find(id)).replace(/\s+/g, ' ').trim(),
    press(id) {
      const node = find(id);
      assert.ok(node, `Missing action: ${id}`);
      node.props.onPress();
    },
    get nodes() { return nodes; },
  };
}

function sampleState(overrides = {}) {
  return { status: 'reading', available: true, reading: true,
    sample: { channels: Array.from({ length: 16 }, (_, channel) => 1500 + channel) },
    ...overrides };
}

test('unavailable input stays unknown and cannot start, calibrate or select physical controls', () => {
  const panel = renderPanel({ state: { available: false, status: 'unavailable', message: '当前设备不是 G20' } });
  assert.equal(panel.copy('g20-input-status'), '不可用');
  assert.equal(panel.copy('g20-input-message'), '当前设备不是 G20');
  for (const id of ['g20-input-start', 'g20-calibration-begin', 'g20-source-physical', 'g20-learn-leftX', 'g20-learn-button-stand']) {
    assert.equal(panel.find(id).props.disabled, true);
    panel.press(id);
  }
  assert.deepEqual(panel.calls, []);
  for (let channel = 1; channel <= 16; channel++) assert.equal(panel.copy(`g20-channel-${channel}`), '—');
  for (const axis of ['leftX', 'leftY', 'rightX', 'rightY']) assert.equal(panel.copy(`g20-value-${axis}`), '—');
});

test('read, cancel during startup, stop, and return actions call only their assigned callbacks', () => {
  const panel = renderPanel();
  panel.press('g20-input-start');
  panel.render({ state: { ...panel.props.state, status: 'starting' } });
  assert.equal(panel.find('g20-input-start'), undefined);
  panel.press('g20-input-stop');
  panel.render({ state: { ...panel.props.state, ...sampleState() } });
  panel.press('g20-input-stop');
  panel.press('g20-input-close');
  assert.deepEqual(panel.calls, ['start', 'stop', 'stop', 'close']);
});

test('only real finite input values are rendered, including valid zero', () => {
  const channels = Array(16).fill(1500);
  channels[1] = Number.NaN;
  const panel = renderPanel({ state: sampleState({ sample: { channels }, vector: { leftX: 0, leftY: -0.5, rightX: 1, rightY: Number.POSITIVE_INFINITY } }) });
  assert.equal(panel.copy('g20-channel-1'), '1500');
  assert.equal(panel.copy('g20-channel-2'), '—');
  assert.equal(panel.copy('g20-value-leftX'), '0.00');
  assert.equal(panel.copy('g20-value-leftY'), '-0.50');
  assert.equal(panel.copy('g20-value-rightX'), '1.00');
  assert.equal(panel.copy('g20-value-rightY'), '—');
});

test('calibration records each axis and action choice without dispatching a robot action', () => {
  const panel = renderPanel({ state: sampleState() });
  assert.equal(panel.find('g20-calibration-begin').props.disabled, false);
  panel.press('g20-calibration-begin');
  panel.press('g20-learn-leftX');
  assert.deepEqual(panel.calls, ['begin'], 'learning requires calibration context');
  panel.render({ state: { ...panel.props.state, calibrating: true } });
  for (const axis of ['leftX', 'leftY', 'rightX', 'rightY']) panel.press(`g20-learn-${axis}`);
  for (const action of ['stand', 'sit', 'stop', 'enableMotor', 'disableMotor', 'switchPolicy']) panel.press(`g20-learn-button-${action}`);
  assert.deepEqual(panel.calls, ['begin',
    ...['leftX', 'leftY', 'rightX', 'rightY'].map(axis => ['axis', axis]),
    ...['stand', 'sit', 'stop', 'enableMotor', 'disableMotor', 'switchPolicy'].map(action => ['button', action]),
  ]);
});

test('finishing calibration requires four-axis completion and stops source selection until finished', () => {
  const panel = renderPanel({ state: sampleState({ calibrating: true }) });
  assert.equal(panel.find('g20-calibration-finish').props.disabled, true);
  panel.press('g20-calibration-finish');
  panel.render({ state: { ...panel.props.state, calibrated: true } });
  assert.equal(panel.find('g20-calibration-finish').props.disabled, false);
  panel.press('g20-source-physical');
  assert.deepEqual(panel.calls, [], 'input remains disabled during calibration');
  panel.press('g20-calibration-finish');
  assert.deepEqual(panel.calls, ['finish']);
  panel.render({ state: { ...panel.props.state, calibrating: false } });
  panel.press('g20-source-physical');
  panel.press('g20-source-touch');
  assert.deepEqual(panel.calls, ['finish', ['source', 'physical'], ['source', 'touch']]);
});

test('mapped channels and button press/release state stay visible without inventing key identities', () => {
  const panel = renderPanel({ state: sampleState({
    axes: { leftX: { channel: 3, sign: 1 }, rightY: { channel: 1, sign: -1 } },
    buttons: { stand: { channel: 10 }, stop: { channel: 12 } }, pressed: ['stop'],
  }) });
  assert.match(panel.copy('g20-axis-leftX'), /CH4/);
  assert.match(panel.copy('g20-axis-leftY'), /未记录/);
  assert.match(panel.copy('g20-button-stop'), /CH13 按下/);
  assert.match(panel.copy('g20-button-stand'), /CH11 释放/);
  assert.doesNotMatch(panel.copy('g20-button-sit'), /CH\d|按下|释放/);
  panel.render({ state: { ...panel.props.state, pressed: undefined } });
  assert.match(panel.copy('g20-button-stop'), /CH13 未同步/);
  assert.doesNotMatch(panel.copy('g20-button-stop'), /按下|释放/);
});

test('stopping input immediately hides retained values and disables calibration and source choice', () => {
  const panel = renderPanel({ source: 'physical', state: sampleState({ calibrated: true, calibrating: true, vector: { leftX: 0.5, leftY: 0, rightX: 0, rightY: 0 } }) });
  panel.render({ state: { ...panel.props.state, reading: false, status: 'stopped' } });
  assert.equal(panel.copy('g20-value-leftX'), '—');
  assert.equal(panel.copy('g20-channel-1'), '—');
  for (const id of ['g20-source-physical', 'g20-calibration-begin', 'g20-calibration-finish', 'g20-learn-leftX', 'g20-learn-button-stop']) {
    assert.equal(panel.find(id).props.disabled, true);
    panel.press(id);
  }
  assert.deepEqual(panel.calls, []);
});

test('clear calibration is available only when there is calibration state', () => {
  const panel = renderPanel();
  panel.press('g20-calibration-clear');
  assert.deepEqual(panel.calls, []);
  panel.render({ state: { ...panel.props.state, calibrated: true } });
  panel.press('g20-calibration-clear');
  assert.deepEqual(panel.calls, ['clear']);
});

test('panel keeps safe-area scrolling, shared palette and three type sizes', () => {
  const panel = renderPanel({ state: sampleState() });
  const safe = panel.find('g20-input-panel');
  assert.deepEqual(Array.from(safe.props.edges), ['top', 'left', 'right', 'bottom']);
  assert.ok(panel.nodes.some(node => node.type === 'ScrollView'));
  const sizes = new Set();
  const borders = [];
  const resolve = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  for (const node of panel.nodes) {
    const style = resolve(typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style);
    if (style.fontSize) sizes.add(style.fontSize);
    for (const [key, value] of Object.entries(style)) if (/^border.*Width$/.test(key)) borders.push(value);
  }
  assert.deepEqual([...sizes].sort((a, b) => a - b), [12, 16, 20]);
  assert.ok(borders.length > 0 && borders.every(width => width === 0.5));
  assert.equal(resolve(safe.props.style).backgroundColor, colors.background);
});
