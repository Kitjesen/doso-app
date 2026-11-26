import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(rootDir, 'src/components/StatusBentoCard.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function mountBento(props, { isDark = false } = {}) {
  const states = [];
  let sIdx = 0;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require(name) {
      if (name === 'react') {
        return {
          useState(initial) {
            const i = sIdx++;
            if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
            return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next; }];
          },
        };
      }
      if (name === 'react/jsx-runtime') {
        return {
          jsx: (type, p, key) => ({ type, props: p ?? {}, key }),
          jsxs: (type, p, key) => ({ type, props: p ?? {}, key }),
        };
      }
      if (name === 'react-native') {
        return {
          Image: 'Image',
          Modal: 'Modal',
          Pressable: 'Pressable',
          ScrollView: 'ScrollView',
          StyleSheet: { create: s => s, absoluteFillObject: {} },
          View: 'View',
        };
      }
      if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
      if (name === './AppText') return { Text: 'Text' };
      if (name === '../appearance') return { getProductAppearance: () => ({ canvas: '#FFFFFF', surface: '#F4F4F4', ink: '#141414', secondary: '#666666' }) };
      if (name === '../theme') return { useAppTheme: () => ({ isDark }) };
      if (name === '../typography') return { typography: { tabular: {} } };
      if (name.endsWith('.png')) return { uri: name };
      throw new Error(`Unexpected require: ${name}`);
    },
  });

  const render = (nextProps = props) => {
    sIdx = 0;
    return module.exports.StatusBentoCard(nextProps);
  };
  return {
    render,
    exports: module.exports,
  };
}

function collectText(node, out = []) {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const child of node) collectText(child, out); return out; }
  if (node.props?.children !== undefined) collectText(node.props.children, out);
  return out;
}

function findByTestId(node, id) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findByTestId(item, id);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.testID === id) return node;
  return node.props?.children ? findByTestId(node.props.children, id) : null;
}

test('STATUS_NEUTRAL keeps pure R==G==B black-gray surfaces and motorHealthLabel covers all motor states', () => {
  const { exports } = mountBento({ deviceName: 'THUNDER' });
  const neutralKeys = ['canvas', 'floatingSolid', 'bayBg', 'cardBg', 'cardElevated', 'recessed', 'activeBg', 'ink', 'muted', 'subtle', 'offlineBg', 'offlineInk'];
  for (const key of neutralKeys) {
    const hex = exports.STATUS_NEUTRAL[key];
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    assert.ok(m, `${key} should be 6-digit hex, got ${hex}`);
    assert.equal(m[1].toLowerCase(), m[2].toLowerCase(), `${key} R==G (${hex})`);
    assert.equal(m[2].toLowerCase(), m[3].toLowerCase(), `${key} G==B (${hex})`);
  }

  const health = exports.motorHealthLabel;
  assert.equal(health({ id: '0', label: '右前髋', source: 'demo' }), '未同步');
  assert.equal(health({ id: '0', label: '右前髋', source: 'device', online: false }), '离线');
  assert.equal(health({ id: '0', label: '右前髋', source: 'device', online: true, fault: 'active' }), '故障');
  assert.equal(health({ id: '0', label: '右前髋', source: 'device', online: true, errors: [12] }), '故障');
  assert.equal(health({ id: '0', label: '右前髋', source: 'device', online: true, statusCode: 0 }), '复位');
  assert.equal(health({ id: '0', label: '右前髋', source: 'device', online: true, statusCode: 1 }), '标定');
  assert.equal(health({ id: '0', label: '右前髋', source: 'device', online: true, statusCode: 2 }), '运行');
  assert.equal(health({ id: '0', label: '右前髋', source: 'device', online: true, statusCode: 99 }), '未知');
});

test('floating StatusBentoCard supports 4-leg switching, 16-joint detail inspection, voltage/IMU readouts, and close callback', () => {
  let closed = 0;
  const joints = [
    { id: '3', label: '左前髋', source: 'device', online: true, statusCode: 2, temperatureC: 36.4, positionDeg: 12.5, voltageV: 54.2, velocityRps: 0.4, torqueNm: 1.8 },
    { id: '13', label: '左前足轮', source: 'device', online: true, statusCode: 2, temperatureC: 41.0, positionDeg: 0, voltageV: 54.1, velocityRps: 2.1, torqueNm: 3.2 },
    { id: '12', label: '右前足轮', source: 'device', online: true, statusCode: 2, temperatureC: 72.5, fault: 'active', errors: [104, 208], positionDeg: -5.2, voltageV: 53.8, velocityRps: 0, torqueNm: 0 },
  ];
  const props = {
    floating: true,
    deviceName: 'DOSO THUNDER',
    connectionLabel: '已连接',
    joints,
    observedAt: '2026-11-26T06:00:00.000Z',
    onClose: () => { closed += 1; },
    body: {
      posture: 'standing',
      motorState: 'enabled',
      controlAuthority: 'held',
      controlOwner: 'this-device',
      leaseActive: true,
      faultStatus: 'active',
      voltageV: 43.2,
    },
    imu: {
      quaternion: { w: 1, x: 0, y: 0, z: 0 },
      gyroscope: { x: 0.01, y: -0.02, z: 0.03 },
    },
  };

  const host = mountBento(props, { isDark: false });
  let tree = host.render(props);
  const initialText = collectText(tree).join(' ');
  assert.match(initialText, /DOSO THUNDER/);
  assert.match(initialText, /43\.2/);
  assert.match(initialText, /偏低/);
  assert.match(initialText, /站立/);
  assert.match(initialText, /已使能/);
  assert.match(initialText, /本机/);
  assert.match(initialText, /有效/);
  assert.match(initialText, /有故障/);
  assert.match(initialText, /\+0\.0°/);

  // Close button works in floating mode.
  const closeBtn = findByTestId(tree, 'status-bento-close');
  assert.ok(closeBtn, 'floating mode must expose close button');
  closeBtn.props.onPress();
  assert.equal(closed, 1);

  // Switch selected leg to front-right -> leg chip switches active leg.
  const frChip = findByTestId(tree, 'joint-status-pod-front-right');
  assert.ok(frChip, 'front-right leg chip must exist');
  frChip.props.onPress();
  tree = host.render(props);

  // Tap joint 12 cell in the 16-joint matrix -> opens inline joint detail overlay with error codes 104、208.
  const joint12Cell = findByTestId(tree, 'joint-status-overview-12');
  assert.ok(joint12Cell, 'joint 12 cell must be tappable');
  joint12Cell.props.onPress();
  tree = host.render(props);
  assert.ok(findByTestId(tree, 'joint-status-detail-overlay'), 'floating mode renders inline detail overlay');
  const detailText = collectText(tree).join(' ');
  assert.match(detailText, /ID\s+12/);
  assert.match(detailText, /72\.5 °C/);
  assert.match(detailText, /104、208/);

  // Closing the detail overlay clears the selection cleanly.
  const detailClose = findByTestId(tree, 'joint-status-detail-close');
  assert.ok(detailClose, 'detail close button must exist');
  detailClose.props.onPress();
  tree = host.render(props);
  assert.equal(findByTestId(tree, 'joint-status-detail-overlay'), null);
});
