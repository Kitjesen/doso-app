import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importTypescript(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  for (const [from, to] of replacements) source = source.replace(from, to);
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}

const controllerUrl = await importTypescript('../src/services/brainstemSimulation.ts');
const streamUrl = await importTypescript('../src/services/brainstemSimulationStream.ts', [
  ["from './brainstemSimulation'", `from '${controllerUrl}'`],
]);
const { BrainstemSimulationError } = await import(controllerUrl);
const { createBrainstemSimulationStreamChannelFactory } = await import(streamUrl);

const SESSION_ID = '123e4567-e89b-42d3-a456-426614174000';
const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

function fakeTimers() {
  let now = 0;
  let id = 0;
  const entries = new Map();
  return {
    api: {
      setTimeout(callback, delayMs) { const handle = ++id; entries.set(handle, { callback, at: now + delayMs }); return handle; },
      clearTimeout(handle) { entries.delete(handle); },
    },
    async advance(ms) {
      now += ms;
      while (true) {
        const due = [...entries.entries()].filter(([, item]) => item.at <= now).sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        for (const [handle, item] of due) {
          if (!entries.delete(handle)) continue;
          item.callback();
          await settle();
        }
      }
    },
  };
}

class FakeSocket {
  static instances = [];
  readyState = 0;
  sent = [];
  closeCalls = [];
  listeners = new Map();
  constructor(url) { this.url = url; FakeSocket.instances.push(this); }
  addEventListener(type, listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) { for (const listener of this.listeners.get(type) ?? []) listener(event); }
  open() { this.readyState = 1; this.emit('open'); }
  message(value) { this.emit('message', { data: typeof value === 'string' ? value : JSON.stringify(value) }); }
  send(value) { if (this.readyState !== 1) throw new Error('not open'); this.sent.push(JSON.parse(value)); }
  close(code, reason) { this.closeCalls.push({ code, reason }); this.readyState = 3; }
}

function fixture() {
  FakeSocket.instances = [];
  const timers = fakeTimers();
  const abort = new AbortController();
  const factory = createBrainstemSimulationStreamChannelFactory({ WebSocketImpl: FakeSocket });
  const connecting = factory({
    origin: 'http://127.0.0.1:8122', sessionId: SESSION_ID, signal: abort.signal,
    connectTimeoutMs: 1500, inputTimeoutMs: 180, timers: timers.api,
  });
  const socket = FakeSocket.instances[0];
  return { abort, connecting, socket, timers };
}

const ready = () => ({ kind: 'stream-ready', schemaVersion: 1, simulationOnly: true, sessionId: SESSION_ID });
const inputAck = sequence => ({ kind: 'input-ack', schemaVersion: 1, simulationOnly: true,
  sessionId: SESSION_ID, inputSequence: sequence, accepted: true, gRpcSequence: sequence + 1, status: 'accepted' });
const releaseAck = () => ({ kind: 'release-ack', schemaVersion: 1, simulationOnly: true,
  sessionId: SESSION_ID, zeroAcknowledged: true, released: true });
const errorCode = expected => error => error instanceof BrainstemSimulationError && error.code === expected;

test('uses the fixed loopback stream and resolves one strictly acknowledged request at a time', async () => {
  const f = fixture();
  assert.equal(f.socket.url, `ws://127.0.0.1:8122/api/v1/simulation/sessions/${SESSION_ID}/stream`);
  f.socket.open();
  f.socket.message(ready());
  const channel = await f.connecting;
  const input = channel.sendInput({ inputSequence: 1, velocity: { x: 0.2, y: 0, z: -0.25 } });
  assert.deepEqual(f.socket.sent[0], { kind: 'input', inputSequence: 1, velocity: { x: 0.2, y: 0, z: -0.25 } });
  f.socket.message(inputAck(1));
  assert.deepEqual(await input, inputAck(1));
  const releasing = channel.release();
  assert.deepEqual(f.socket.sent[1], { kind: 'release' });
  f.socket.message(releaseAck());
  assert.deepEqual(await releasing, releaseAck());
  channel.close();
  assert.equal(f.socket.closeCalls.length, 1);
});

test('release supersedes an in-flight input and ignores only its late acknowledgement', async () => {
  const f = fixture();
  f.socket.open();
  f.socket.message(ready());
  const channel = await f.connecting;
  const input = channel.sendInput({ inputSequence: 7, velocity: { x: 0.25, y: 0, z: 0 } });
  const releasing = channel.release();
  await assert.rejects(input, errorCode('unavailable'));
  assert.deepEqual(f.socket.sent.map(frame => frame.kind), ['input', 'release']);
  f.socket.message(inputAck(7));
  f.socket.message(releaseAck());
  assert.deepEqual(await releasing, releaseAck());
});

test('ready and input deadlines close the socket without retrying or fabricating an acknowledgement', async () => {
  const handshake = fixture();
  handshake.socket.open();
  const failedReady = assert.rejects(handshake.connecting, errorCode('timeout'));
  await handshake.timers.advance(1500);
  await failedReady;
  assert.equal(handshake.socket.sent.length, 0);
  assert.equal(handshake.socket.closeCalls.length, 1);

  const inputFixture = fixture();
  inputFixture.socket.open();
  inputFixture.socket.message(ready());
  const channel = await inputFixture.connecting;
  const pending = channel.sendInput({ inputSequence: 1, velocity: { x: 0.1, y: 0, z: 0 } });
  const failedInput = assert.rejects(pending, errorCode('timeout'));
  await inputFixture.timers.advance(180);
  await failedInput;
  assert.equal(inputFixture.socket.sent.length, 1);
  assert.equal(inputFixture.socket.closeCalls.length, 1);
});

test('abort, invalid frames, oversized frames, and concurrent inputs fail closed', async () => {
  const aborted = fixture();
  const failedAbort = assert.rejects(aborted.connecting, errorCode('unavailable'));
  aborted.abort.abort();
  await failedAbort;
  assert.equal(aborted.socket.closeCalls.length, 1);

  const invalid = fixture();
  invalid.socket.open();
  const failedInvalid = assert.rejects(invalid.connecting, errorCode('invalid_response'));
  invalid.socket.message({ ...ready(), simulationOnly: false });
  await failedInvalid;

  const oversized = fixture();
  oversized.socket.open();
  const failedOversized = assert.rejects(oversized.connecting, errorCode('invalid_response'));
  oversized.socket.message('x'.repeat(16_385));
  await failedOversized;

  const concurrent = fixture();
  concurrent.socket.open();
  concurrent.socket.message(ready());
  const channel = await concurrent.connecting;
  const first = channel.sendInput({ inputSequence: 1, velocity: { x: 0, y: 0, z: 0 } });
  await assert.rejects(channel.sendInput({ inputSequence: 2, velocity: { x: 0, y: 0, z: 0 } }), errorCode('invalid_response'));
  await assert.rejects(first, errorCode('unavailable'));
  assert.equal(concurrent.socket.closeCalls.length, 1);
});
