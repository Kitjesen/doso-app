import { spawn } from 'node:child_process';

// Extracted command lifecycle from the avatar baseline runner. Local tools only;
// stdout/stderr are diagnostics and must never be used as success evidence.
export function runBoundedCommand(file, args, {
  env, timeoutMs = 30000, drainMs = 250, killGraceMs = 2000, onSpawn,
} = {}) {
  for (const value of [timeoutMs, drainMs, killGraceMs]) {
    if (!Number.isFinite(value) || value < 0) throw new TypeError('Command deadlines must be finite and non-negative');
  }
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(file, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const state = { pid: child.pid ?? null, status: null, code: null, signal: null,
      timedOut: false, exitObserved: false, killSent: null, stdout: '', stderr: '', events: [] };
    let settled = false, executionTimer, drainTimer, killTimer;
    const event = (kind, fields = {}) => state.events.push({ kind, elapsedMs: Math.round(performance.now() - started), ...fields });
    const streamsClosed = () => child.stdout.readableEnded && child.stderr.readableEnded;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(executionTimer); clearTimeout(drainTimer); clearTimeout(killTimer);
      state.streamsClosed = streamsClosed();
      state.durationMs = Math.round(performance.now() - started);
      // Close only this parent's diagnostic read ends, never a descendant PID.
      // A missing exit observation is retained as an unknown termination result.
      child.stdout.destroy(); child.stderr.destroy();
      if (!state.exitObserved) child.unref();
      resolve(state);
    };
    const drain = () => {
      if (streamsClosed()) finish();
      else drainTimer = setTimeout(finish, drainMs);
    };
    const kill = () => {
      // Never send a late signal to a process whose exit is already observed.
      if (!state.exitObserved && child.exitCode === null && child.signalCode === null) {
        state.killSent = child.kill();
        event('kill-request', { sent: state.killSent });
      }
      killTimer = setTimeout(() => { event('termination-unconfirmed'); finish(); }, killGraceMs);
    };
    child.stdout.setEncoding('utf8').on('data', (text) => { state.stdout += text; });
    child.stderr.setEncoding('utf8').on('data', (text) => { state.stderr += text; });
    for (const stream of [child.stdout, child.stderr]) stream.on('end', () => {
      if ((state.exitObserved || state.status === 'spawn-error') && streamsClosed()) finish();
    });
    child.on('spawn', () => { state.pid = child.pid; event('spawn'); });
    child.on('error', (error) => {
      event('error', { code: error.code ?? null });
      state.errorCode = error.code ?? null;
      if (!child.pid) {
        state.status = 'spawn-error';
        clearTimeout(executionTimer);
        drain();
      }
      // A kill error does not prove exit; the bounded kill grace still applies.
    });
    child.on('exit', (code, signal) => {
      state.code = code; state.signal = signal; state.exitObserved = true;
      event('exit', { code, signal });
      clearTimeout(executionTimer); clearTimeout(killTimer);
      state.status = state.timedOut ? 'timed-out' : state.status === 'process-error' ? state.status
        : code === 0 ? 'exited' : code === null ? 'signal-exit' : 'nonzero-exit';
      drain();
    });
    executionTimer = setTimeout(() => {
      if (state.exitObserved || settled) return;
      state.timedOut = true; state.status = 'timed-out'; event('execution-timeout');
      kill();
    }, timeoutMs);
    try { onSpawn?.(child); }
    catch {
      state.status = 'process-error'; event('observer-error');
      clearTimeout(executionTimer); kill();
    }
  });
}
