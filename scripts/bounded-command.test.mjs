import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runBoundedCommand } from './helpers/bounded-command.mjs';

test('an exited command is not timed out while a finite grandchild holds its diagnostic pipe', { timeout: 10000 }, async () => {
  const script = `
    const { spawn } = await import('node:child_process');
    const holder = spawn(process.execPath, ['-e', "process.send('ready'); setTimeout(() => process.exit(0), 1800)"],
      { detached: true, windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    holder.on('message', () => {
      holder.unref();
      process.stdout.write('parent-complete\\n', () => process.exit(0));
    });
  `;
  const result = await runBoundedCommand(process.execPath, ['--input-type=module', '-e', script], {
    timeoutMs: 1100, drainMs: 100,
  });
  assert.equal(result.code, 0);
  assert.equal(result.timedOut, false, 'a completed process must not hit its execution deadline while diagnostics remain open');
  assert.equal(result.exitObserved, true);
  assert.equal(result.streamsClosed, false);
  assert.equal(result.killSent, null);
  assert.match(result.stdout, /parent-complete/);
});

test('a genuinely running process times out and its termination is observed separately', { timeout: 10000 }, async () => {
  const result = await runBoundedCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    timeoutMs: 300, killGraceMs: 1000,
  });
  assert.equal(result.status, 'timed-out');
  assert.equal(result.timedOut, true);
  assert.equal(result.exitObserved, true);
  assert.equal(result.killSent, true);
  assert(result.events.some((event) => event.kind === 'execution-timeout'));
  assert(result.events.some((event) => event.kind === 'exit'));
});

test('a success-looking diagnostic never turns exit seven into a successful command', async () => {
  const result = await runBoundedCommand(process.execPath, ['-e', "process.stderr.write('Success diagnostic only\\n', () => process.exit(7));"], {
    timeoutMs: 2000,
  });
  assert.equal(result.status, 'nonzero-exit');
  assert.equal(result.code, 7);
  assert.equal(result.timedOut, false);
  assert.match(result.stderr, /Success diagnostic only/);
});

test('a missing executable is a spawn failure, not a timeout or a null-code success', async () => {
  const result = await runBoundedCommand(join(tmpdir(), `doso-absent-${randomUUID()}.exe`), [], { timeoutMs: 1000 });
  assert.equal(result.status, 'spawn-error');
  assert.equal(result.errorCode, 'ENOENT');
  assert.equal(result.timedOut, false);
  assert.equal(result.exitObserved, false);
});

test('failed termination still settles within a bounded grace and preserves unknown exit', { timeout: 10000 }, async () => {
  let owned, actualKill;
  try {
    const result = await runBoundedCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      timeoutMs: 100, killGraceMs: 100,
      onSpawn(child) { owned = child; actualKill = child.kill.bind(child); child.kill = () => false; },
    });
    assert.equal(result.status, 'timed-out');
    assert.equal(result.killSent, false);
    assert.equal(result.exitObserved, false);
    assert(result.events.some((event) => event.kind === 'termination-unconfirmed'));
  } finally {
    // Restore and stop only this test-owned child, never enumerate/kill a PID.
    if (owned && owned.exitCode === null && owned.signalCode === null) {
      const exited = once(owned, 'exit');
      actualKill();
      await exited;
    }
  }
});
