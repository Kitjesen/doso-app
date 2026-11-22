import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
function mount(props = {}) {
  const slots = [], refs = [];
  let cursor = 0, refCursor = 0, nodes = [];
  const module = { exports: {} };
  const react = {
    useState(value) { const id = cursor++; if (!(id in slots)) slots[id] = value; return [slots[id], value => { slots[id] = typeof value === 'function' ? value(slots[id]) : value; }]; },
    useRef(value) { const id = refCursor++; return refs[id] ??= { current: value }; },
    useCallback: fn => fn,
    useEffect() {},
  };
  const code = ts.transpileModule(readFileSync(new URL('../src/components/TaskEditor.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, JSON, Error, require(name) {
    if (name.endsWith('/fonts/home')) return { productType: { title: {}, section: {}, body: {}, caption: {}, button: {} } };
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
    if (name === 'react-native') return { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } };
    if (name === '@expo/vector-icons') return { Feather: 'Feather' };
    if (name === './AppText') return { TextInput: 'TextInput' };
    if (name === './ControlPanelMotion') return { ControlPanelMotion: 'View' };
    if (name === '../features/tasks/draft') { const draftModule = { exports: {} }; vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/features/tasks/draft.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: draftModule, exports: draftModule.exports }); return draftModule.exports; }
    if (name === './HomeText') return { Text: 'Text', TextInput: 'TextInput' };
    if (name === '../appearance') return { useProductAppearance: () => ({ isDark: true }) };
    throw new Error(name);
  } });
  const saved = [], published = [];
  let closed = 0;
  const input = { initial: { ...module.exports.makeTaskDraft('2026-11-11'), name: '巡检', route: '东侧步道', checkpointCount: 6, checkpoint: 3 }, onClose: () => closed++, onSaveDraft: value => saved.push(value), ...props };
  function render() {
    cursor = 0; refCursor = 0; nodes = [];
    function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node == null || typeof node === 'boolean') return;
      if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
      if (typeof node.type === 'function') return walk(node.type(node.props));
      nodes.push(node); walk(node.props.children);
    }
    walk(module.exports.TaskEditor(input));
  }
  render();
  return { ...module.exports, render, saved, published, get closed() { return closed; }, get copy() { return nodes.filter(n => n.type === 'copy').map(n => n.value).join(' '); },
    action: id => nodes.find(n => n.props?.testID === id || n.props?.accessibilityLabel === id),
    button: text => nodes.find(n => n.type === 'Pressable' && JSON.stringify(n.props.children).includes(text)),
  };
}

test('draft validation rejects bad dates, time, route and checkpoint bounds', () => {
  const { draftError, makeTaskDraft } = mount();
  const base = { ...makeTaskDraft('2026-11-11'), name: '巡检', route: '路线', checkpointCount: 6, checkpoint: 3 };
  assert.equal(draftError(base), null);
  for (const patch of [{ name: '' }, { route: '' }, { date: '2026-02-30' }, { time: '24:00' }, { checkpoint: 7 }, { checkpointCount: 0 }, { dwellSeconds: -1 }, { dwellSeconds: 3601 }]) assert.equal(typeof draftError({ ...base, ...patch }), 'string');
});

test('editor changes name, actions and dwell, saves an isolated session draft without publishing', async () => {
  const screen = mount();
  screen.action('任务名称').props.onChangeText('  新巡检  '); screen.render();
  screen.action('拍照').props.onPress(); screen.render();
  screen.action('增加停留时间').props.onPress(); screen.render();
  assert.equal(screen.action('task-publish').props.disabled, true);
  await screen.action('task-save-draft').props.onPress();
  assert.equal(screen.saved.length, 1);
  assert.equal(screen.saved[0].name, '新巡检');
  assert.equal(screen.saved[0].photo, true);
  assert.equal(screen.saved[0].dwellSeconds, 11);
  assert.equal(screen.closed, 1);
});

test('dirty exit asks before discarding and publish failures retain edited values', async () => {
  const screen = mount({ onPublish: async () => { throw new Error('网络不可用'); } });
  screen.action('任务名称').props.onChangeText('保留修改'); screen.render();
  screen.action('返回任务日程').props.onPress(); screen.render();
  assert.match(screen.copy, /放弃未保存的修改/);
  assert.equal(screen.closed, 0);
  await screen.action('task-publish').props.onPress(); screen.render();
  assert.match(screen.copy, /网络不可用/);
  assert.equal(screen.action('任务名称').props.value, '保留修改');
  assert.equal(screen.closed, 0);
});

test('checkpoint selector saves only a checkpoint from the selected route', async () => {
  const screen = mount();
  screen.action('选择检查点').props.onPress(); screen.render();
  assert.equal(screen.action('检查点 7'), undefined);
  screen.action('检查点 5').props.onPress(); screen.render();
  assert.equal(screen.action('检查点 5'), undefined);
  await screen.action('task-save-draft').props.onPress();
  assert.equal(screen.saved[0].checkpoint, 5);
});

test('choosing another route resets the checkpoint to its own range', async () => {
  const screen = mount({ routes: [{ name: '短路线', checkpointCount: 2 }] });
  screen.action('选择路线').props.onPress(); screen.render();
  screen.action('短路线').props.onPress(); screen.render();
  await screen.action('task-save-draft').props.onPress();
  assert.equal(screen.saved[0].route, '短路线');
  assert.equal(screen.saved[0].checkpointCount, 2);
  assert.equal(screen.saved[0].checkpoint, 1);
});

test('a failed local save retains the editor and can be retried', async () => {
  let fail = true;
  const screen = mount({ onSaveDraft: async () => { if (fail) throw Error('磁盘不可用'); } });
  await screen.action('task-save-draft').props.onPress(); screen.render();
  assert.equal(screen.closed, 0);
  assert.match(screen.copy, /磁盘不可用/);
  assert.equal(screen.action('task-save-draft').props.disabled, false);
  fail = false;
  await screen.action('task-save-draft').props.onPress();
  assert.equal(screen.closed, 1);
});
