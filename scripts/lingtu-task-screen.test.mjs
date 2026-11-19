import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL('../src/screens/LingtuTaskScreen.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
class LingtuTaskError extends Error { constructor(code) { super(code); this.code = code; } }

// Execute the actual TSX handlers with local HTTP/lifecycle/time fixtures; no robot requests.
function mount({ read, cancel, allowCancel = true, cancelAttempts } = {}) {
  let at = 1000, cursor = 0, nodes = [], dirty = false, unmounted = false, lateUpdates = 0, timerId = 0, backs = 0;
  let props = { endpoint: 'https://lingtu.example.test', allowLocalHttp: false, allowCancel, cancelAttempts, onBack: () => backs++ };
  const slots = [], effects = [], listeners = new Set(), timers = new Map(), reads = [], cancels = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => {
      if (unmounted) { lateUpdates++; return; }
      const next = typeof value === 'function' ? value(slots[i]) : value;
      if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
    }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect, deps) { const i = cursor++, old = slots[i];
      if (!old || !deps || deps.some((value, index) => !Object.is(value, old.deps[index]))) effects.push(() => {
        old?.cleanup?.(); slots[i] = { deps, cleanup: effect() };
      });
    },
  };
  const sample = (patch = {}) => ({ endpoint: props.endpoint, observedAt: at, taskId: 'nav-1', found: true,
    state: 'EXECUTING', phase: 'navigating', terminal: false, currentTaskId: 'nav-1', currentTaskState: 'EXECUTING',
    stopConfirmation: 'NOT_REQUESTED', controlAuthority: 'AUTONOMY', motionPermission: 'CLEAR', motionAuthorized: false,
    source: 'live_gateway_cache', evidenceStatus: 'observed', producedAt: 1770000000, ...patch });
  const appState = { currentState: 'active', addEventListener(_event, listener) { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const allowed = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'), 'expo-crypto': { randomUUID: () => 'cancel-request-1' },
    'react-native': { AppState: appState, Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../appearance': { cardLayout: { radius: 24, inset: 16, gap: 12 }, getProductAppearance: () => ({ surface: '#f4f7fa', ink: '#123', secondary: '#567', blue: '#98d1ff', blueInk: '#123' }) },
    '../components/AppText': { Text: 'Text', TextInput: 'TextInput' },
    '../theme': { useAppTheme: () => ({ colors: { background: '#fff' }, isDark: false }) }, '../typography': { typography: {} },
    '../services/lingtuReadOnly': { isLingtuStatusFresh: value => Number.isFinite(value?.observedAt) && at >= value.observedAt && at - value.observedAt < 15000 },
    '../services/lingtuTasks': {
      LingtuTaskError,
      readLingtuTask: options => { reads.push(options); return read ? read(options, sample) : Promise.resolve(sample()); },
      cancelLingtuTask: options => { cancels.push(options); return cancel ? cancel(options) : Promise.resolve({ accepted: true, completionConfirmed: false }); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { assert.ok(name in allowed, name); return allowed[name]; },
    AbortController, performance: { now: () => at },
    setTimeout(callback, delay) { timers.set(++timerId, { callback, due: at + delay }); return timerId; }, clearTimeout: id => timers.delete(id) });
  const render = () => {
    let count = 0;
    do {
      assert.ok(++count < 20, 'render should settle'); dirty = false; cursor = 0; nodes = [];
      const walk = node => {
        if (node == null || typeof node === 'boolean') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node !== 'object') { nodes.push({ type: 'copy', value: String(node) }); return; }
        nodes.push(node); walk(node.props.children);
      };
      walk(module.exports.LingtuTaskScreen(props));
      while (effects.length) effects.shift()();
    } while (dirty);
  };
  render();
  return { sample, reads, cancels, render,
    get lateUpdates() { return lateUpdates; }, get backs() { return backs; },
    get copy() { return nodes.filter(node => node.type === 'copy').map(node => node.value).join(' '); },
    element: id => nodes.find(node => node.props?.testID === id),
    async flush() { await settle(); render(); },
    async press(id) { const result = this.element(id).props.onPress(); render(); await result; await this.flush(); },
    fill(value) { this.element('lingtu-task-id').props.onChangeText(value); render(); },
    update(patch) { props = { ...props, ...patch }; render(); },
    advance(ms) { at += ms; for (const [id, timer] of [...timers]) if (timer.due <= at) { timers.delete(id); timer.callback(); } render(); },
    lifecycle(state) { appState.currentState = state; for (const listener of listeners) listener(state); render(); },
    unmount() { unmounted = true; slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('entry reads current task, an explicit ID queries history, diagnostic mode has no cancel', async () => {
  const host = mount({ allowCancel: false }); await host.flush();
  assert.equal(host.reads.length, 1); assert.equal(host.reads[0].taskId, undefined);
  assert.match(host.copy, /任务记录状态/); assert.match(host.copy, /执行中/);
  assert.equal(host.element('lingtu-task-cancel'), undefined);
  host.fill('old-task'); await host.press('lingtu-task-read');
  assert.equal(host.reads[1].taskId, 'old-task'); assert.equal(host.cancels.length, 0); host.unmount();
});

test('cancel requires confirmation, posts once, then queries exactly the original task', async () => {
  const pending = deferred(); const host = mount({ cancel: () => pending.promise }); await host.flush();
  await host.press('lingtu-task-cancel'); assert.equal(host.cancels.length, 0);
  const confirm = host.element('lingtu-task-confirm-cancel').props.onPress;
  const first = confirm(), duplicate = confirm(); host.render();
  assert.equal(host.cancels.length, 1); assert.equal(host.cancels[0].requestId, 'cancel-request-1');
  assert.equal(host.cancels[0].snapshot.taskId, 'nav-1');
  pending.resolve({ accepted: true, completionConfirmed: false }); await first; await duplicate; await host.flush();
  assert.equal(host.reads.at(-1).taskId, 'nav-1'); assert.match(host.copy, /取消请求已接收/);
  assert.match(host.copy, /执行中/); assert.doesNotMatch(host.copy, /已确认停稳/);
  assert.equal(host.element('lingtu-task-cancel').props.disabled, true); host.unmount();
});

test('unknown cancel outcome only queries original ID and never resubmits', async () => {
  const host = mount({ cancel: async () => { throw new Error('secret backend detail'); } }); await host.flush();
  await host.press('lingtu-task-cancel'); await host.press('lingtu-task-confirm-cancel');
  assert.equal(host.cancels.length, 1); assert.equal(host.reads.at(-1).taskId, 'nav-1');
  assert.match(host.copy, /取消请求结果未确认/); assert.doesNotMatch(host.copy, /secret backend/);
  await host.press('lingtu-task-read'); assert.equal(host.element('lingtu-task-cancel').props.disabled, true);
  assert.equal(host.cancels.length, 1); host.unmount();
});

test('withdrawing confirmation retires its retained submit handler', async () => {
  const host = mount(); await host.flush(); await host.press('lingtu-task-cancel');
  const staleConfirm = host.element('lingtu-task-confirm-cancel').props.onPress;
  await host.press('lingtu-task-keep'); await staleConfirm(); await host.flush();
  assert.equal(host.cancels.length, 0); assert.equal(host.element('lingtu-task-confirmation'), undefined); host.unmount();
});

test('unknown cancellation identity survives task-tab unmount and reentry, scoped by endpoint', async () => {
  const journal = new Map();
  const first = mount({ cancelAttempts: journal, cancel: async () => { throw new Error('unknown outcome'); } });
  await first.flush(); await first.press('lingtu-task-cancel'); await first.press('lingtu-task-confirm-cancel');
  assert.equal(journal.get('https://lingtu.example.test\0nav-1'), 'cancel-request-1'); first.unmount();
  const next = mount({ cancelAttempts: journal }); await next.flush();
  assert.equal(next.element('lingtu-task-cancel').props.disabled, true);
  assert.match(next.copy, /已为\s+nav-1\s+提交过取消请求/); await next.press('lingtu-task-cancel');
  assert.equal(next.cancels.length, 0);
  next.update({ endpoint: 'https://different.example.test' }); await next.flush();
  assert.equal(next.element('lingtu-task-cancel').props.disabled, false); next.unmount();
});

test('a known pre-dispatch state rejection does not lock future explicit cancellation', async () => {
  const journal = new Map(), host = mount({ cancelAttempts: journal, cancel: async () => { throw new LingtuTaskError('cancel_blocked'); } });
  await host.flush(); await host.press('lingtu-task-cancel'); await host.press('lingtu-task-confirm-cancel');
  assert.equal(journal.size, 0); assert.match(host.copy, /此次取消未发送/);
  assert.equal(host.element('lingtu-task-cancel').props.disabled, false); host.unmount();
});

test('cancelled record and terminal do not imply physical stop; stale/historical/current unknown tasks cannot cancel', async () => {
  for (const patch of [
    { state: 'CANCELLED', terminal: true, stopConfirmation: 'PENDING' },
    { currentTaskId: 'different-task', stopConfirmation: null },
    { currentTaskState: 'UNKNOWN' }, { found: false, terminal: null },
  ]) {
    const host = mount({ read: async (_options, sample) => sample(patch) }); await host.flush();
    assert.equal(host.element('lingtu-task-cancel').props.disabled, true);
    assert.doesNotMatch(host.copy, /已确认停稳/); host.unmount();
  }
  const host = mount(); await host.flush();
  const cancel = host.element('lingtu-task-cancel').props.onPress;
  host.advance(15000); cancel(); host.render();
  assert.equal(host.element('lingtu-task-observation'), undefined); assert.equal(host.element('lingtu-task-confirmation'), undefined);
  assert.match(host.copy, /已过期/); host.unmount();
});

test('background aborts cancel without replay or follow-up requests', async () => {
  const pending = deferred(), host = mount({ cancel: () => pending.promise }); await host.flush();
  await host.press('lingtu-task-cancel'); const first = host.press('lingtu-task-confirm-cancel');
  host.lifecycle('background'); assert.equal(host.cancels[0].signal.aborted, true);
  pending.resolve({ accepted: true }); await first; host.lifecycle('active'); await host.flush();
  assert.equal(host.reads.length, 1); assert.equal(host.cancels.length, 1);
  assert.match(host.copy, /取消结果需重新查询/); host.unmount(); assert.equal(host.lateUpdates, 0);
});

test('endpoint change aborts old reads and stale handlers cannot cancel the former target', async () => {
  const oldRead = deferred();
  const host = mount({ read: (options, sample) => options.endpoint.includes('new') ? oldRead.promise : Promise.resolve(sample()) });
  await host.flush(); const cancelOld = host.element('lingtu-task-cancel').props.onPress;
  host.update({ endpoint: 'https://new.example.test' }); cancelOld(); host.render();
  assert.equal(host.element('lingtu-task-observation'), undefined); assert.equal(host.element('lingtu-task-confirmation'), undefined);
  assert.equal(host.cancels.length, 0); host.unmount();
  assert.equal(host.reads[1].signal.aborted, true); oldRead.resolve(host.sample()); await settle(); assert.equal(host.lateUpdates, 0);
});

test('back/unmount retire reads and do not publish late results', async () => {
  for (const exit of ['back', 'unmount', 'cancel-read']) {
    const pending = deferred(), host = mount({ read: () => pending.promise });
    if (exit === 'back') await host.press('lingtu-task-back');
    if (exit === 'unmount') host.unmount();
    if (exit === 'cancel-read') await host.press('lingtu-task-stop-read');
    assert.equal(host.reads[0].signal.aborted, true);
    pending.resolve(host.sample()); await settle(); host.render();
    assert.equal(host.element('lingtu-task-observation'), undefined); assert.equal(host.lateUpdates, 0);
    if (exit !== 'unmount') host.unmount();
  }
});
