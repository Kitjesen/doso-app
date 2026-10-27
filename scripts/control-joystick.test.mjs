import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function createRuntime(initialProps = {}, componentKind = 'single', platform = 'android') {
  const slots = [];
  const effects = [];
  const pendingEffects = [];
  const timers = new Map();
  let timerId = 0;
  let clock = 0;
  let cursor = 0;
  let nodes = [];
  let disposed = false;
  let lateUpdates = 0;
  const changes = [];
  const activeChanges = [];
  const leftChanges = [];
  const rightChanges = [];
  const leftActiveChanges = [];
  const rightActiveChanges = [];
  const singleProps = {
    label: '移动',
    testID: 'joystick',
    size: 160,
    axis: 'xy',
    disabled: false,
    resetKey: 0,
    onChange: value => changes.push(value),
    onActiveChange: active => activeChanges.push(active),
  };
  const pairProps = {
    size: 160,
    gap: 24,
    disabled: false,
    resetKey: 0,
    left: {
      label: '移动', testID: 'drive', axis: 'xy',
      onChange: value => leftChanges.push(value),
      onActiveChange: active => leftActiveChanges.push(active),
    },
    right: {
      label: '转向', testID: 'turn', axis: 'x',
      onChange: value => rightChanges.push(value),
      onActiveChange: active => rightActiveChanges.push(active),
    },
  };
  let props = { ...(componentKind === 'pair' ? pairProps : singleProps), ...initialProps };

  const react = {
    useCallback(callback, deps) {
      const key = cursor++;
      const previous = slots[key];
      if (!previous || deps.some((value, index) => value !== previous.deps[index])) {
        slots[key] = { callback, deps };
      }
      return slots[key].callback;
    },
    useRef(initial) {
      const key = cursor++;
      return slots[key] ??= { current: initial };
    },
    useState(initial) {
      const key = cursor++;
      if (!(key in slots)) slots[key] = initial;
      return [slots[key], value => {
        if (disposed) lateUpdates++;
        slots[key] = typeof value === 'function' ? value(slots[key]) : value;
      }];
    },
    useEffect(effect, deps) {
      const key = cursor++;
      const previous = effects[key];
      const changed = !previous || deps.some((value, index) => value !== previous.deps[index]);
      if (changed) pendingEffects.push(() => {
        previous?.cleanup?.();
        effects[key] = { deps, cleanup: effect() };
      });
    },
  };

  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} };
    const output = ts.transpileModule(readFileSync(new URL(path, root), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    const dependencies = {
      react,
      'react/jsx-runtime': require('react/jsx-runtime'),
      'react-native': {
        Platform: { OS: platform },
        StyleSheet: { create: styles => styles },
        View: 'View',
      },
      './AppText': { Text: 'Text' },
      '../theme': {
        useAppTheme: () => ({
          isDark: false,
          colors: {
            authFocus: '#06f', line: '#ddd', surfaceStrong: '#eee', background: '#fff',
            muted: '#667', inkSoft: '#223',
          },
        }),
      },
      '../appearance': {
        getProductAppearance: () => ({
          action: '#98D1FF', actionInk: '#17354D', blueInk: '#214F71', blueSoft: '#EAF5FF',
          border: '#E4E7EC', canvas: '#FFFFFF', ink: '#253441', raised: '#FFFFFF', secondary: '#586675', surface: '#F4F7FA',
        }),
      },
    };
    vm.runInNewContext(output, {
      module,
      exports: module.exports,
      setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: clock + delay }); return id; },
      clearTimeout: id => timers.delete(id),
      setInterval: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, at: clock + delay, interval: delay }); return id; },
      clearInterval: id => timers.delete(id),
      require: name => {
        if (name in dependencies) return dependencies[name];
        if (name === '../features/robot-lifecycle/joystickInput') {
          return load('src/features/robot-lifecycle/joystickInput.ts');
        }
        throw Error(`Unexpected dependency: ${name}`);
      },
    }, { filename: path });
    cache.set(path, module.exports);
    return module.exports;
  }

  const exports = load('src/components/ControlJoystick.tsx');
  const Component = componentKind === 'pair' ? exports.ControlJoystickPair : exports.ControlJoystick;
  function render(nextProps, flushEffects = true) {
    if (nextProps) props = { ...props, ...nextProps };
    cursor = 0;
    nodes = [];
    function walk(node) {
      if (node == null || typeof node === 'boolean') return;
      if (Array.isArray(node)) return node.forEach(walk);
      if (typeof node !== 'object') return;
      if (typeof node.type === 'function') return walk(node.type(node.props));
      nodes.push(node);
      walk(node.props?.children);
    }
    walk(Component(props));
    if (flushEffects) pendingEffects.splice(0).forEach(run => run());
  }

  render();
  return {
    activeChanges,
    changes,
    leftChanges,
    rightChanges,
    leftActiveChanges,
    rightActiveChanges,
    render,
    flushEffects() { pendingEffects.splice(0).forEach(run => run()); },
    advanceTime(ms) {
      clock += ms;
      for (const [id, timer] of timers) if (timer.at <= clock) {
        if (timer.interval) timer.at = clock + timer.interval; else timers.delete(id);
        timer.callback();
      }
    },
    get pendingTimers() { return timers.size; },
    find: testID => nodes.find(node => node.props?.testID === testID),
    get lateUpdates() { return lateUpdates; },
    unmount() {
      disposed = true;
      effects.forEach(effect => effect?.cleanup?.());
    },
  };
}

const plain = value => JSON.parse(JSON.stringify(value));

test('production held-touch samples at 50 Hz without an early first sample', () => {
  const samples = [];
  const runtime = createRuntime({ left: { axis: 'xy', label: '移动', testID: 'drive',
    onChange() {}, onSample: value => samples.push(plain(value)) } }, 'pair');
  const owner = touch(1, 80, 80, 120, 80);
  runtime.find('control-joystick-pair').props.onResponderGrant(event({ touches: [owner] }));
  runtime.render();
  runtime.advanceTime(19);
  assert.equal(samples.length, 0);
  runtime.advanceTime(1);
  assert.equal(samples.length, 1, 'the first held sample arrives at 20 ms');
  for (let tick = 1; tick < 50; tick++) runtime.advanceTime(20);
  assert.equal(samples.length, 50, 'one second of held input produces 50 samples');
  assert.ok(samples.every(value => value.x > 0 && value.y === 0));
  runtime.unmount();
  assert.equal(runtime.pendingTimers, 0);
});

test('50 Hz held samples stop on release, cancel, disable, reset and unmount', () => {
  for (const reason of ['release', 'cancel', 'disable', 'reset', 'unmount']) {
    const samples = [], changes = [];
    const runtime = createRuntime({ left: { axis: 'xy', label: '移动', testID: 'drive',
      onChange: value => changes.push(plain(value)),
      onSample: value => samples.push(plain(value)) } }, 'pair');
    const owner = touch(2, 80, 80, 120, 80);
    runtime.find('control-joystick-pair').props.onResponderGrant(event({ touches: [owner] }));
    runtime.render();
    runtime.advanceTime(20);
    assert.equal(samples.length, 1, reason);
    if (reason === 'release') runtime.find('control-joystick-pair').props.onResponderEnd(event({ touches: [], changedTouches: [owner] }));
    if (reason === 'cancel') runtime.find('control-joystick-pair').props.onTouchCancel();
    if (reason === 'disable') runtime.render({ disabled: true });
    if (reason === 'reset') runtime.render({ resetKey: 1 });
    if (reason === 'unmount') runtime.unmount();
    assert.deepEqual(changes.at(-1), { x: 0, y: 0 }, reason);
    // Ownership refs stop delivery immediately, even before the next effect cleanup.
    runtime.advanceTime(20);
    assert.equal(samples.length, 1, reason);
    if (reason !== 'unmount') { runtime.render(); runtime.unmount(); }
    for (let tick = 0; tick < 50; tick++) runtime.advanceTime(20);
    assert.equal(samples.length, 1, reason);
    assert.equal(runtime.pendingTimers, 0, reason);
  }
});

test('50 Hz paired sampling retains only the finger that is still held', () => {
  const leftSamples = [], rightSamples = [], leftChanges = [];
  const runtime = createRuntime({
    left: { axis: 'xy', label: '移动', testID: 'drive',
      onChange: value => leftChanges.push(plain(value)), onSample: value => leftSamples.push(plain(value)) },
    right: { axis: 'x', label: '转向', testID: 'turn',
      onChange() {}, onSample: value => rightSamples.push(plain(value)) },
  }, 'pair');
  const left = touch(3, 80, 80, 120, 80), right = touch(4, 300, 80, 304, 80);
  runtime.find('control-joystick-pair').props.onResponderGrant(event({ touches: [left, right] }));
  runtime.render();
  for (let tick = 0; tick < 50; tick++) runtime.advanceTime(20);
  assert.equal(leftSamples.length, 50);
  assert.equal(rightSamples.length, 50);
  runtime.find('control-joystick-pair').props.onResponderEnd(event({ touches: [right], changedTouches: [left] }));
  assert.deepEqual(leftChanges.at(-1), { x: 0, y: 0 });
  runtime.render();
  for (let tick = 0; tick < 50; tick++) runtime.advanceTime(20);
  assert.equal(leftSamples.length, 50, 'released movement input is never renewed');
  assert.equal(rightSamples.length, 100, 'held turn input continues at 50 Hz');
  assert.ok(rightSamples.every(value => value.x > 0 && value.y === 0));
  runtime.unmount();
  assert.equal(runtime.pendingTimers, 0);
});

test('production held-touch samples stop immediately after release, reset and unmount', () => {
  const samples = [];
  const runtime = createRuntime({ left: { axis: 'xy', label: '移动', testID: 'drive',
    onChange() {}, onSample: value => samples.push(plain(value)) } }, 'pair');
  runtime.advanceTime(160); assert.equal(samples.length, 0);
  const owner = touch(1, 80, 80);
  runtime.find('control-joystick-pair').props.onResponderGrant(event({ touches: [owner] }));
  runtime.render(); runtime.advanceTime(80); assert.equal(samples.length, 1);
  runtime.find('control-joystick-pair').props.onResponderEnd(event({ touches: [], changedTouches: [owner] }));
  runtime.render(); runtime.advanceTime(160); assert.equal(samples.length, 1);
  runtime.unmount(); runtime.advanceTime(160); assert.equal(samples.length, 1);
  assert.equal(runtime.pendingTimers, 0);
});

function touch(identifier, pageX, pageY, locationX = 80, locationY = 80) {
  return { identifier, pageX, pageY, locationX, locationY };
}

function event({ touches = [], changedTouches = touches, locationX = 80, locationY = 80 }) {
  return { nativeEvent: { touches, changedTouches, locationX, locationY } };
}

const disc = (size, centerX, centerY) => ({ size, centerX, centerY, left: centerX - size / 2, top: centerY - size / 2 });
const configuredLayout = () => ({ usable: true, left: disc(100, 100, 150), right: disc(160, 460, 170) });

test('configured pair uses independent fixed discs and per-side normalization without growing its bounds', () => {
  const runtime = createRuntime({ layout: configuredLayout(), size: 400, floating: true,
    touchAreaWidth: 600, touchAreaHeight: 300 }, 'pair');
  const pair = runtime.find('control-joystick-pair');
  assert.equal(pair.props.style.at(-1).width, 600);
  assert.equal(pair.props.style.at(-1).height, 300);
  assert.equal(runtime.find('drive').props.style.at(-1).width, 100);
  assert.equal(runtime.find('turn').props.style.at(-1).width, 160);
  const left = touch(101, 0, 0, 125, 150), right = touch(102, 0, 0, 500, 170);
  pair.props.onResponderGrant(event({ touches: [left, right] }));
  // Both fingers begin half a radius from the fixed center, despite different sizes.
  assert.deepEqual(plain(runtime.leftChanges.at(-1)), { x: .444, y: 0 });
  assert.deepEqual(plain(runtime.rightChanges.at(-1)), { x: .444, y: 0 });
  runtime.render();
  runtime.find('control-joystick-pair').props.onResponderMove(event({ touches: [
    touch(101, 0, 0, 150, 150), touch(102, 0, 0, 540, 170),
  ] }));
  assert.deepEqual(plain(runtime.leftChanges.at(-1)), { x: 1, y: 0 });
  assert.deepEqual(plain(runtime.rightChanges.at(-1)), { x: 1, y: 0 });
  runtime.unmount();
});

test('configured pair declines empty half-space and circle corners before responder capture', () => {
  const runtime = createRuntime({ layout: configuredLayout(), floating: true,
    touchAreaWidth: 600, touchAreaHeight: 300 }, 'pair');
  const pair = runtime.find('control-joystick-pair');
  for (const outside of [touch(103, 0, 0, 220, 150), touch(104, 0, 0, 145, 195),
    touch(105, 0, 0, 530, 240), touch(106, 0, 0, 100, 301)]) {
    const input = event({ touches: [outside] });
    assert.equal(pair.props.onStartShouldSetResponderCapture(input), false);
    assert.equal(pair.props.onStartShouldSetResponder(input), false);
    pair.props.onResponderGrant(input);
  }
  assert.equal(runtime.leftActiveChanges.length, 0);
  assert.equal(runtime.rightActiveChanges.length, 0);
  assert.equal(runtime.leftChanges.length, 0);
  assert.equal(runtime.rightChanges.length, 0);
  const inside = event({ touches: [touch(107, 0, 0, 100, 150)] });
  assert.equal(pair.props.onStartShouldSetResponderCapture(inside), true);
  runtime.unmount();
});

test('configured unusable geometry cannot acquire a touch or accessibility pulse', () => {
  const runtime = createRuntime({ layout: { ...configuredLayout(), usable: false },
    touchAreaWidth: 600, touchAreaHeight: 300 }, 'pair');
  const input = event({ touches: [touch(108, 0, 0, 125, 150)] });
  const pair = runtime.find('control-joystick-pair');
  assert.equal(pair.props.onStartShouldSetResponderCapture(input), false);
  pair.props.onResponderGrant(input);
  assert.equal(runtime.find('drive').props.accessibilityState.disabled, true);
  runtime.find('drive').props.onAccessibilityAction({ nativeEvent: { actionName: 'move-right' } });
  assert.equal(runtime.leftChanges.length, 0);
  runtime.unmount();
});

test('mounting or editing idle configured geometry does not interrupt transport', () => {
  let interrupts = 0;
  const runtime = createRuntime({ layout: configuredLayout(), floating: true,
    touchAreaWidth: 600, touchAreaHeight: 300, onCancel: () => interrupts++ }, 'pair');
  assert.equal(interrupts, 0);
  runtime.render({ layout: { ...configuredLayout(), left: disc(120, 140, 160) } });
  assert.equal(interrupts, 0);
  runtime.unmount();
});

test('adding configured geometry retires a legacy held-touch timer before effect cleanup', () => {
  const order = [], samples = [];
  const runtime = createRuntime({ floating: true, touchAreaWidth: 600, touchAreaHeight: 300,
    onCancel: () => order.push('interrupt'), left: { label: '移动', testID: 'drive', axis: 'xy',
      onChange: () => order.push('left'), onSample: value => samples.push(plain(value)) } }, 'pair');
  const owner = touch(113, 0, 0, 100, 100);
  runtime.find('control-joystick-pair').props.onResponderGrant(event({ touches: [owner] }));
  runtime.render();
  runtime.find('control-joystick-pair').props.onResponderMove(event({ touches: [touch(113, 0, 0, 140, 100)] }));
  runtime.advanceTime(20); assert.equal(samples.length, 1);
  order.length = 0;
  runtime.render({ layout: configuredLayout() }, false);
  runtime.advanceTime(20); assert.equal(samples.length, 1);
  runtime.flushEffects();
  assert.deepEqual(order, ['interrupt', 'left']);
  runtime.unmount();
});

test('configured size or position changes cancel before zero and retire old touch callbacks', () => {
  for (const change of ['size', 'position']) {
    const order = [], samples = [];
    const initialLayout = configuredLayout();
    const runtime = createRuntime({ layout: initialLayout, floating: true,
      touchAreaWidth: 600, touchAreaHeight: 300, onCancel: () => order.push('interrupt'),
      left: { label: '移动', testID: 'drive', axis: 'xy', onChange: () => order.push('left'), onSample: value => samples.push(plain(value)) },
      right: { label: '转向', testID: 'turn', axis: 'x', onChange: () => order.push('right') },
    }, 'pair');
    assert.deepEqual(order, [], 'first mount must not cancel transport');
    const left = touch(109, 0, 0, 125, 150), right = touch(110, 0, 0, 500, 170);
    runtime.find('control-joystick-pair').props.onResponderGrant(event({ touches: [left, right] }));
    runtime.render();
    const oldPair = runtime.find('control-joystick-pair');
    runtime.advanceTime(20); assert.equal(samples.length, 1);
    order.length = 0;
    const changedLayout = { ...initialLayout, left: change === 'size' ? disc(120, 100, 150) : disc(100, 140, 150) };
    runtime.render({ layout: changedLayout }, false);
    // A queued timer or an old closure cannot move while the geometry effect is pending.
    runtime.advanceTime(20); assert.equal(samples.length, 1);
    oldPair.props.onResponderMove(event({ touches: [touch(109, 0, 0, 150, 150), right] }));
    assert.deepEqual(order, []);
    runtime.flushEffects();
    assert.deepEqual(order, ['interrupt', 'left', 'right'], change);
    runtime.render();
    oldPair.props.onResponderGrant(event({ touches: [touch(111, 0, 0, 150, 150)] }));
    const currentPair = runtime.find('control-joystick-pair');
    currentPair.props.onResponderGrant(event({ touches: [left, right] }));
    currentPair.props.onResponderMove(event({ touches: [left, right] }));
    runtime.advanceTime(20);
    assert.equal(samples.length, 1);
    assert.equal(order.length, 3, 'old held fingers cannot reacquire under the new layout');
    currentPair.props.onResponderEnd(event({ touches: [], changedTouches: [left, right] }));
    const next = touch(112, 0, 0, changedLayout.left.centerX + 25, 150);
    assert.equal(currentPair.props.onStartShouldSetResponderCapture(event({ touches: [next] })), true);
    currentPair.props.onResponderGrant(event({ touches: [next] }));
    assert.equal(order.at(-1), 'left', 'a new gesture may use the new geometry');
    runtime.unmount();
  }
});

test('tracks only its initiating touch when native touch order changes', () => {
  const runtime = createRuntime();
  let pad = runtime.find('joystick');
  const owner = touch(8, 180, 100, 100, 80);
  pad.props.onResponderGrant(event({ touches: [owner], changedTouches: [owner], locationX: 100 }));
  runtime.render();
  assert.equal(runtime.activeChanges.at(-1), true);
  assert.ok(runtime.changes.at(-1).x > 0);

  pad = runtime.find('joystick');
  const other = touch(3, 999, 999);
  const movedOwner = touch(8, 80, 40);
  pad.props.onResponderMove(event({ touches: [other, movedOwner], changedTouches: [movedOwner] }));
  assert.ok(runtime.changes.at(-1).x < 0);

  pad.props.onResponderEnd(event({ touches: [movedOwner], changedTouches: [other] }));
  assert.notDeepEqual(plain(runtime.changes.at(-1)), { x: 0, y: 0 });
  pad.props.onResponderEnd(event({ touches: [], changedTouches: [movedOwner] }));
  assert.deepEqual(plain(runtime.changes.at(-1)), { x: 0, y: 0 });
  assert.equal(runtime.activeChanges.at(-1), false);
  runtime.unmount();
});

test('termination, disabling, reset, and unmount each neutralize an active control', () => {
  for (const releaseKind of ['terminate', 'disable', 'reset', 'unmount']) {
    const runtime = createRuntime();
    const owner = touch(4, 180, 80, 100, 80);
    runtime.find('joystick').props.onResponderGrant(event({ touches: [owner] }));
    runtime.render();
    assert.ok(runtime.changes.at(-1).x > 0, releaseKind);

    if (releaseKind === 'terminate') runtime.find('joystick').props.onResponderTerminate();
    if (releaseKind === 'disable') runtime.render({ disabled: true });
    if (releaseKind === 'reset') runtime.render({ resetKey: 1 });
    if (releaseKind === 'unmount') runtime.unmount();

    assert.deepEqual(plain(runtime.changes.at(-1)), { x: 0, y: 0 }, releaseKind);
    assert.equal(runtime.activeChanges.at(-1), false, releaseKind);
    if (releaseKind !== 'unmount') runtime.unmount();
  }
});

test('two joystick instances retain independent touch ownership and axis behavior', () => {
  const drive = createRuntime({ testID: 'drive', axis: 'xy' });
  const turn = createRuntime({ testID: 'turn', axis: 'x' });
  const driveTouch = touch(11, 180, 120, 100, 100);
  const turnTouch = touch(12, 60, 140, 60, 100);

  drive.find('drive').props.onResponderGrant(event({ touches: [driveTouch] }));
  turn.find('turn').props.onResponderGrant(event({ touches: [turnTouch] }));
  assert.ok(drive.changes.at(-1).x > 0 && drive.changes.at(-1).y > 0);
  assert.equal(turn.changes.at(-1).y, 0);

  drive.find('drive').props.onResponderRelease(event({ touches: [], changedTouches: [driveTouch] }));
  assert.deepEqual(plain(drive.changes.at(-1)), { x: 0, y: 0 });
  assert.notDeepEqual(plain(turn.changes.at(-1)), { x: 0, y: 0 });
  drive.unmount();
  turn.unmount();
});

test('disabled joystick declines responder ownership and exposes accessible state', () => {
  const runtime = createRuntime({ disabled: true });
  const pad = runtime.find('joystick');
  assert.equal(pad.props.onStartShouldSetResponder(), false);
  assert.equal(pad.props.accessibilityRole, 'adjustable');
  assert.equal(pad.props.accessibilityLabel, '移动');
  assert.deepEqual(plain(pad.props.accessibilityState), { disabled: true });
  assert.ok(pad.props.accessibilityActions.some(action => action.name === 'reset'));
  pad.props.onAccessibilityAction({ nativeEvent: { actionName: 'move-up' } });
  assert.equal(runtime.changes.length, 0);
  runtime.unmount();
});

test('one parent responder owns both sticks and routes a second simultaneous touch', () => {
  const runtime = createRuntime({}, 'pair');
  let pair = runtime.find('control-joystick-pair');
  const leftTouch = touch(21, 60, 80, 120, 100);
  pair.props.onResponderGrant(event({ touches: [leftTouch], changedTouches: [leftTouch] }));
  runtime.render();
  assert.equal(runtime.leftActiveChanges.at(-1), true);
  assert.ok(runtime.leftChanges.at(-1).x > 0);

  pair = runtime.find('control-joystick-pair');
  const rightTouch = touch(22, 240, 80, 304, 80);
  pair.props.onResponderStart(event({
    touches: [rightTouch, leftTouch],
    changedTouches: [rightTouch],
  }));
  runtime.render();
  assert.equal(runtime.rightActiveChanges.at(-1), true);
  assert.ok(runtime.rightChanges.at(-1).x > 0);
  assert.equal(runtime.rightChanges.at(-1).y, 0);
  runtime.unmount();
});

test('floating pair anchors each circle under the initial touch and accepts the whole side zone', () => {
  const runtime = createRuntime({ floating: true, touchAreaWidth: 640, touchAreaHeight: 250 }, 'pair');
  let pair = runtime.find('control-joystick-pair');
  const leftStart = touch(23, 0, 0, 188, 176);
  pair.props.onResponderGrant(event({ touches: [leftStart], changedTouches: [leftStart] }));
  assert.equal(runtime.leftChanges.length, 0, 'pressing anchors the left circle without a jump');
  assert.equal(runtime.leftActiveChanges.at(-1), true);
  runtime.render();
  pair = runtime.find('control-joystick-pair');
  const leftMove = touch(23, 0, 0, 260, 140);
  pair.props.onResponderMove(event({ touches: [leftMove] }));
  assert.ok(runtime.leftChanges.at(-1).x > 0);
  assert.ok(runtime.leftChanges.at(-1).y < 0);

  const rightStart = touch(24, 0, 0, 498, 78);
  pair.props.onResponderStart(event({ touches: [rightStart, leftMove], changedTouches: [rightStart] }));
  assert.equal(runtime.rightChanges.length, 0, 'pressing anchors the right circle without a jump');
  assert.equal(runtime.rightActiveChanges.at(-1), true);
  runtime.unmount();
});

test('pair survives touch reordering and releases only the lifted owner', () => {
  const runtime = createRuntime({}, 'pair');
  let pair = runtime.find('control-joystick-pair');
  const leftStart = touch(31, 30, 80, 110, 80);
  const rightStart = touch(32, 250, 80, 314, 80);
  pair.props.onResponderGrant(event({
    touches: [leftStart, rightStart],
    changedTouches: [leftStart, rightStart],
  }));
  runtime.render();

  pair = runtime.find('control-joystick-pair');
  const leftMove = touch(31, 70, 120, 150, 120);
  const rightMove = touch(32, 210, 80, 274, 80);
  pair.props.onResponderMove(event({
    touches: [rightMove, leftMove],
    changedTouches: [leftMove, rightMove],
  }));
  assert.ok(runtime.leftChanges.at(-1).x > 0 && runtime.leftChanges.at(-1).y > 0);
  assert.ok(runtime.rightChanges.at(-1).x > 0);

  pair.props.onResponderEnd(event({
    touches: [rightMove],
    changedTouches: [leftMove],
  }));
  assert.deepEqual(plain(runtime.leftChanges.at(-1)), { x: 0, y: 0 });
  assert.notDeepEqual(plain(runtime.rightChanges.at(-1)), { x: 0, y: 0 });
  assert.equal(runtime.leftActiveChanges.at(-1), false);
  assert.equal(runtime.rightActiveChanges.at(-1), true);

  pair.props.onResponderEnd(event({ touches: [], changedTouches: [rightMove] }));
  assert.deepEqual(plain(runtime.rightChanges.at(-1)), { x: 0, y: 0 });
  assert.equal(runtime.rightActiveChanges.at(-1), false);
  runtime.unmount();
});

test('pair termination, reset and size changes neutralize both owners', () => {
  for (const releaseKind of ['terminate', 'reset', 'resize']) {
    const runtime = createRuntime({}, 'pair');
    const pair = runtime.find('control-joystick-pair');
    const leftTouch = touch(41, 10, 80, 90, 80);
    const rightTouch = touch(42, 260, 80, 324, 80);
    pair.props.onResponderGrant(event({
      touches: [leftTouch, rightTouch],
      changedTouches: [leftTouch, rightTouch],
    }));
    runtime.render();
    if (releaseKind === 'terminate') runtime.find('control-joystick-pair').props.onResponderTerminate();
    if (releaseKind === 'reset') runtime.render({ resetKey: 1 });
    if (releaseKind === 'resize') runtime.render({ size: 126, gap: 240 });
    assert.deepEqual(plain(runtime.leftChanges.at(-1)), { x: 0, y: 0 }, releaseKind);
    assert.deepEqual(plain(runtime.rightChanges.at(-1)), { x: 0, y: 0 }, releaseKind);
    runtime.unmount();
  }
});

test('pair ignores touches in the label area below either circular pad', () => {
  const runtime = createRuntime({}, 'pair');
  const pair = runtime.find('control-joystick-pair');
  const leftLabelTouch = touch(51, 50, 190, 80, 190);
  const rightLabelTouch = touch(52, 240, 180, 264, 180);
  pair.props.onResponderGrant(event({
    touches: [leftLabelTouch, rightLabelTouch],
    changedTouches: [leftLabelTouch, rightLabelTouch],
  }));
  assert.equal(runtime.leftChanges.length, 0);
  assert.equal(runtime.rightChanges.length, 0);
  assert.equal(runtime.leftActiveChanges.length, 0);
  assert.equal(runtime.rightActiveChanges.length, 0);
  runtime.unmount();
});

test('Android shared responder release preserves the remaining owner and subsequent raw touch events', () => {
  const runtime = createRuntime({}, 'pair');
  const left = touch(0, 100, 100, 110, 90);
  const right = touch(1, 300, 100, 310, 80);
  let pair = runtime.find('control-joystick-pair');
  pair.props.onResponderGrant(event({ touches: [left, right] }));
  runtime.render(); pair = runtime.find('control-joystick-pair');
  pair.props.onResponderRelease(event({ touches: [right], changedTouches: [left] }));
  assert.deepEqual(plain(runtime.leftChanges.at(-1)), {x:0,y:0});
  assert.ok(runtime.rightChanges.at(-1).x > 0);
  assert.equal(pair.props.onMoveShouldSetResponderCapture(), true);
  const rightMove = touch(1, 200, 100, 214, 80);
  pair.props.onTouchMove(event({ touches: [rightMove] }));
  assert.ok(runtime.rightChanges.at(-1).x < 0);
  pair.props.onTouchEnd(event({ touches: [], changedTouches: [rightMove] }));
  assert.deepEqual(plain(runtime.rightChanges.at(-1)), {x:0,y:0});
  assert.equal(pair.props.onMoveShouldSetResponderCapture(), false);
  runtime.unmount();
});

test('accessible directional actions move the requested axis and provide an explicit reset', () => {
  const runtime = createRuntime({}, 'pair');
  let drive = runtime.find('drive');
  let turn = runtime.find('turn');
  assert.deepEqual(
    plain(drive.props.accessibilityActions.map(action => action.name)),
    ['move-up', 'move-down', 'move-left', 'move-right', 'reset'],
  );
  assert.deepEqual(
    plain(turn.props.accessibilityActions.map(action => action.name)),
    ['move-left', 'move-right', 'reset'],
  );

  drive.props.onAccessibilityAction({ nativeEvent: { actionName: 'move-up' } });
  turn.props.onAccessibilityAction({ nativeEvent: { actionName: 'move-right' } });
  assert.deepEqual(plain(runtime.leftChanges.at(-1)), { x: 0, y: -0.5 });
  assert.deepEqual(plain(runtime.rightChanges.at(-1)), { x: 0.5, y: 0 });
  runtime.render();

  drive = runtime.find('drive');
  turn = runtime.find('turn');
  drive.props.onAccessibilityAction({ nativeEvent: { actionName: 'reset' } });
  turn.props.onAccessibilityAction({ nativeEvent: { actionName: 'reset' } });
  assert.deepEqual(plain(runtime.leftChanges.at(-1)), { x: 0, y: 0 });
  assert.deepEqual(plain(runtime.rightChanges.at(-1)), { x: 0, y: 0 });
  runtime.unmount();
});

test('disabled pair ignores accessibility actions', () => {
  const runtime = createRuntime({ disabled: true }, 'pair');
  runtime.find('drive').props.onAccessibilityAction({ nativeEvent: { actionName: 'move-up' } });
  runtime.find('turn').props.onAccessibilityAction({ nativeEvent: { actionName: 'move-right' } });
  assert.equal(runtime.leftChanges.length, 0);
  assert.equal(runtime.rightChanges.length, 0);
  runtime.unmount();
});

test('screen-reader nudges return to zero automatically and cancel timers on reset or unmount', () => {
  for (const kind of ['pair', 'single']) {
    const runtime = createRuntime({}, kind);
    const id = kind === 'pair' ? 'drive' : 'joystick';
    const changes = kind === 'pair' ? runtime.leftChanges : runtime.changes;
    runtime.find(id).props.onAccessibilityAction({ nativeEvent: { actionName: 'move-right' } });
    assert.equal(changes.at(-1).x, 0.5);
    assert.equal(runtime.pendingTimers, 1);
    runtime.advanceTime(219);
    assert.equal(changes.at(-1).x, 0.5);
    runtime.advanceTime(1);
    assert.deepEqual(plain(changes.at(-1)), {x:0,y:0});
    runtime.render();
    runtime.find(id).props.onAccessibilityAction({ nativeEvent: { actionName: 'move-right' } });
    runtime.render({ resetKey: 1 });
    assert.equal(runtime.pendingTimers, 0);
    runtime.find(id).props.onAccessibilityAction({ nativeEvent: { actionName: 'move-right' } });
    runtime.unmount();
    assert.equal(runtime.pendingTimers, 0);
    const count = changes.length;
    runtime.advanceTime(1000);
    assert.equal(changes.length, count);
  }
});

test('missing owner in a MOVE frame clears only that channel instead of latching an old value', () => {
  const runtime = createRuntime({}, 'pair');
  const left = touch(71, 0, 0, 115, 80);
  const right = touch(72, 0, 0, 304, 80);
  let pair = runtime.find('control-joystick-pair');
  pair.props.onResponderGrant(event({ touches: [left, right] }));
  runtime.render(); pair = runtime.find('control-joystick-pair');
  pair.props.onTouchMove(event({ touches: [right] }));
  assert.deepEqual(plain(runtime.leftChanges.at(-1)), {x:0,y:0});
  assert.ok(runtime.rightChanges.at(-1).x>0);
  pair.props.onTouchMove(event({ touches: [] }));
  assert.deepEqual(plain(runtime.rightChanges.at(-1)), {x:0,y:0});
  runtime.unmount();
});

test('a new real touch cancels an accessibility pulse without timing out a held input', () => {
  const runtime = createRuntime({}, 'pair');
  runtime.find('drive').props.onAccessibilityAction({ nativeEvent: { actionName: 'move-right' } });
  runtime.render();
  const left = touch(81, 0, 0, 120, 80);
  runtime.find('control-joystick-pair').props.onResponderGrant(event({ touches: [left] }));
  assert.equal(runtime.pendingTimers, 0);
  runtime.advanceTime(5000);
  assert.ok(runtime.leftChanges.at(-1).x>0);
  runtime.unmount();
});

test('Web uses its normalized responder events instead of Android raw-touch fallbacks', () => {
  const runtime = createRuntime({}, 'pair', 'web');
  const pair = runtime.find('control-joystick-pair');
  assert.equal(pair.props.onTouchMove, undefined);
  assert.equal(pair.props.onTouchEnd, undefined);
  assert.equal(pair.props.onTouchCancel, undefined);
  runtime.unmount();
});

test('native cancellation revokes authority before channel reset callbacks', () => {
  for(const action of ['onTouchCancel','onResponderTerminate']) {
    const order=[];
    const runtime=createRuntime({onCancel:()=>order.push('interrupt'),left:{label:'移动',testID:'drive',axis:'xy',onChange:()=>order.push('left')},right:{label:'转向',testID:'turn',axis:'x',onChange:()=>order.push('right')}},'pair');
    const left=touch(91,0,0,115,80),right=touch(92,0,0,304,80);
    runtime.find('control-joystick-pair').props.onResponderGrant(event({touches:[left,right]}));runtime.render();order.length=0;
    runtime.find('control-joystick-pair').props[action]();
    assert.deepEqual(order,['interrupt','left','right']);runtime.unmount();
  }
});
