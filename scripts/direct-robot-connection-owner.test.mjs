import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function mount({ scope = 'account-a:session-a', ready = true } = {}) {
  const slots = [], effects = [], listeners = new Set(), timers = new Map();
  let cursor = 0, timerId = 0, now = Date.parse('2026-10-23T06:00:00Z'), value, unmounted = false, lateUpdates = 0, dirty = false;
  const react = {
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], next => { if (unmounted) lateUpdates++; const resolved = typeof next === 'function' ? next(slots[i]) : next;
        if (!Object.is(resolved, slots[i])) dirty = true; slots[i] = resolved; }]; },
    useEffect(run, deps) { const i = cursor++; const old = slots[i];
      if (!old || deps.some((entry, index) => entry !== old.deps[index])) {
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: run() }; });
      }
    },
  };
  class Clock extends Date { static now() { return now; } }
  const appState = { currentState: 'active', addEventListener(_event, callback) { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } };
  function load(path) {
    const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, Date: Clock,
      setTimeout: (callback, delay) => { timers.set(++timerId, { callback, due: now + delay }); return timerId; },
      clearTimeout: id => timers.delete(id),
      require(name) {
        if (name === 'react') return react;
        if (name === 'react-native') return { AppState: appState };
        if (name === '../../services/directRobotConnection') return load('../src/services/directRobotConnection.ts');
        throw Error('Unexpected dependency ' + name);
      },
    });
    return module.exports;
  }
  const hook = load('../src/features/robot-lifecycle/useDirectRobotConnection.ts').useDirectRobotConnection;
  function render(next = {}) { scope = next.scope === undefined ? scope : next.scope; ready = next.ready === undefined ? ready : next.ready;
    cursor = 0; dirty = false; value = hook(scope, ready); while (effects.length) effects.shift()(); return value; }
  render();
  return {
    render, get value() { return value; }, get now() { return now; }, get lateUpdates() { return lateUpdates; },
    get timers() { return timers; },
    background() { appState.currentState = 'background'; for (const callback of listeners) callback('background'); return dirty ? render() : value; },
    foreground() { appState.currentState = 'active'; for (const callback of listeners) callback('active'); return dirty ? render() : value; },
    advance(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.due <= now) { timers.delete(id); timer.callback(); } return render(); },
    unmount() { unmounted = true; for (const slot of slots) slot?.cleanup?.(); },
  };
}
const candidate = now => ({ endpoint: { host: 'robot.example.test', port: 13145 },
  observation: { source: 'brainstem.grpc.direct', transport: 'grpc-tls', observedAt: new Date(now).toISOString(),
    motionAuthorized: false, cloudBindingVerified: false, status: { fsmKind: 'standing', transition: 'none',
      motorOutputEnabled: true, owner: 'grpc', criticalMotorFault: false, grpcLeaseActive: true, readyForWalk: true } } });

test('explicit selection carries only a fresh read-only snapshot across screens', () => {
  const host = mount();
  assert.equal(host.value.snapshot, null);
  assert.equal(host.value.select(candidate(host.now)), true);
  host.render();
  assert.equal(host.value.presentation.fresh, true);
  assert.equal(host.value.presentation.runtimeState.controlAuthority, 'not-held');
  assert.notEqual(host.value.presentation.runtimeState.controlLink, 'connected');
});

test('expiry removes live fields without reconnecting or discarding the chosen address', () => {
  const host = mount(); host.value.select(candidate(host.now)); host.render();
  assert.equal(host.timers.size, 1);
  host.advance(15000);
  assert.equal(host.value.presentation.fresh, false);
  assert.equal(host.value.presentation.runtimeState.motorState, 'unknown');
  assert.equal(host.value.snapshot.endpoint.host, 'robot.example.test');
  assert.equal(host.timers.size, 0);
});

test('a system-picker pause refreshes the parent callback even when selection was already null', () => {
  const host = mount(); const oldSelect = host.value.select;
  host.background(); host.foreground();
  assert.equal(oldSelect(candidate(host.now)), false, 'the pre-picker intent is retired');
  assert.equal(host.value.select(candidate(host.now)), true, 'a new explicit selection is usable without an unrelated parent render');
});

test('an expired observation cannot look fresh again after the wall clock moves backwards', () => {
  const host = mount(); host.value.select(candidate(host.now)); host.render();
  host.advance(15000); assert.equal(host.value.presentation.fresh, false);
  host.advance(-1000); assert.equal(host.value.presentation.fresh, false);
  assert.equal(host.value.presentation.runtimeState.motorState, 'unknown');
});

test('account, session and security-readiness changes retire snapshots and old callbacks including A-B-A', () => {
  const host = mount(); const oldSelect = host.value.select;
  host.value.select(candidate(host.now)); host.render();
  host.render({ scope: 'account-b:session-b' }); assert.equal(host.value.snapshot, null);
  host.render({ scope: 'account-a:session-a' }); assert.equal(host.value.snapshot, null);
  assert.equal(oldSelect(candidate(host.now)), false);
  host.render({ ready: false }); assert.equal(host.value.select(candidate(host.now)), false);
  host.render({ ready: true }); assert.equal(host.value.select(candidate(host.now)), true);
  host.render({ scope: null }); assert.equal(host.value.snapshot, null);
  assert.equal(host.value.select(candidate(host.now)), false);
});

test('background clears the selected snapshot and foreground never resumes it automatically', () => {
  const host = mount(); host.value.select(candidate(host.now)); host.render();
  const previous = host.value.select; host.background();
  assert.equal(host.value.snapshot, null); assert.equal(host.timers.size, 0);
  host.foreground(); assert.equal(host.value.snapshot, null);
  assert.equal(previous(candidate(host.now)), false);
  assert.equal(host.value.select(candidate(host.now)), true);
});

test('clear and unmount revoke old callbacks and pending expiration without late updates', () => {
  const host = mount(); const previous = host.value.select;
  host.value.clear(); host.render(); assert.equal(previous(candidate(host.now)), false);
  host.value.select(candidate(host.now)); host.render();
  const current = host.value.select; host.unmount();
  assert.equal(host.timers.size, 0); assert.equal(current(candidate(host.now)), false);
  assert.equal(host.lateUpdates, 0);
});
