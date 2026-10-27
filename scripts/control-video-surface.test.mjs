import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);

function mount(initial = {}) {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let tree;
  let interruptions = 0;
  let props = { active: true, onInterrupted: () => interruptions++, ...initial };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const module = { exports: {} };
  const dependencies = {
    react: {
      useRef(value) { return slots[cursor++] ??= { current: value }; },
      useEffect(effect, deps) {
        const index = cursor++;
        if (!slots[index] || deps.some((value, i) => !Object.is(value, slots[index].deps[i]))) {
          pending.push(() => { slots[index] = { deps, cleanup: effect() }; });
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { View: 'View', StyleSheet: { create: value => value, absoluteFill: { position: 'absolute' }, absoluteFillObject: { position: 'absolute' } } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    './AppText': { Text: 'Text' },
  };
  const source = readFileSync(new URL('../src/components/ControlVideoSurface.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module, exports: module.exports,
    require: name => dependencies[name] ?? require(name),
  });
  function render(changes = {}) {
    props = { ...props, ...changes };
    cursor = 0;
    pending = [];
    tree = module.exports.ControlVideoSurface(props);
    for (const effect of pending) effect();
  }
  function find(id, node = tree) {
    if (!node || typeof node !== 'object') return undefined;
    if (node.props?.testID === id) return node;
    for (const child of [node.props?.children].flat(Infinity).filter(value => value !== undefined)) {
      const result = find(id, child);
      if (result) return result;
    }
  }
  render();
  return { render, find, get interruptions() { return interruptions; } };
}

const player = { type: 'ActualReceiverSurface', props: {} };
const source = phase => ({ id: 'camera-session-1', phase });

test('unconfigured or failed setup neither mounts a player nor cancels line-of-sight control', () => {
  const view = mount();
  assert.ok(view.find('control-video-status'));
  assert.equal(view.find('control-video-player'), undefined);
  view.render({ presentation: source('connecting'), surface: player });
  view.render({ presentation: source('error') });
  assert.equal(view.interruptions, 0);
  assert.equal(view.find('control-video-player'), undefined);
});

test('lost live video hides old frames, retires old manual intent once, and recovery does not rearm', () => {
  const view = mount({ presentation: source('receiving'), surface: player });
  assert.equal(view.find('control-video-status'), undefined);
  assert.ok(view.find('control-video-player'));
  view.render({ presentation: source('stalled') });
  assert.ok(view.find('control-video-status'));
  assert.equal(view.find('control-video-player').props.style[1].opacity, 0);
  assert.equal(view.interruptions, 1);
  view.render({ presentation: source('stalled') });
  view.render({ presentation: source('error') });
  view.render({ presentation: source('receiving') });
  assert.equal(view.interruptions, 1);
});

test('replacement of a live receiver cancels its old intent even if replacement already has frames', () => {
  const view = mount({ presentation: source('receiving'), surface: player });
  view.render({ presentation: { id: 'camera-session-2', phase: 'receiving' } });
  assert.equal(view.interruptions, 1);
  view.render({ presentation: { id: 'camera-session-2', phase: 'receiving' } });
  assert.equal(view.interruptions, 1);
});

test('a missing renderer cannot be advertised as live and cancels a previously live feed', () => {
  const view = mount({ presentation: source('receiving') });
  assert.ok(view.find('control-video-status'));
  assert.equal(view.find('control-video-player'), undefined);
  view.render({ surface: player });
  assert.equal(view.find('control-video-status'), undefined);
  view.render({ surface: null });
  assert.ok(view.find('control-video-status'));
  assert.equal(view.interruptions, 1);
});

test('background unmounts media and resume waits for a fresh receiver session without rearming', () => {
  const view = mount({ presentation: source('receiving'), surface: player });
  view.render({ active: false });
  assert.equal(view.find('control-video-player'), undefined);
  assert.ok(view.find('control-video-status'));
  view.render({ presentation: source('error') });
  view.render({ active: true, presentation: source('receiving') });
  assert.equal(view.interruptions, 0);
  assert.ok(view.find('control-video-status'), 'old receiving metadata is not post-resume frame evidence');
  assert.equal(view.find('control-video-player').props.style[1].opacity, 0);
  view.render({ presentation: { id: 'post-resume-session', phase: 'receiving' } });
  assert.ok(view.find('control-video-player'));
  assert.equal(view.find('control-video-status'), undefined);
  assert.equal(view.interruptions, 0);
});
