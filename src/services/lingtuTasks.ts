// @ts-expect-error Node's type stripping requires the explicit TypeScript extension.
import { ConnectionCheckError, readJson } from './brainstemReadOnly.ts';
// @ts-expect-error Node's type stripping requires the explicit TypeScript extension.
import { isLingtuStatusFresh, LingtuReadOnlyError, validateLingtuOrigin } from './lingtuReadOnly.ts';

export type LingtuTaskSnapshot = Readonly<{
  endpoint: string;
  observedAt: number;
  taskId: string | null;
  found: boolean;
  state: string | null;
  phase: string | null;
  terminal: boolean | null;
  currentTaskId: string | null;
  currentTaskState: string | null;
  source: string | null;
  evidenceStatus: string | null;
  producedAt: number | null;
  stopConfirmation: string | null;
  controlAuthority: string | null;
  motionPermission: string | null;
  motionAuthorized: false;
}>;
export type LingtuTaskCancelReceipt = Readonly<{
  endpoint: string;
  taskId: string;
  requestId: string;
  accepted: true;
  completionConfirmed: false;
}>;
export class LingtuTaskError extends Error {
  constructor(readonly code: 'cancel_blocked' | 'cancel_unknown') {
    super(code === 'cancel_blocked' ? '任务状态不可取消，请重新查询当前任务。'
      : '取消结果未知，请查询任务状态，不要重复提交。');
    this.name = 'LingtuTaskError';
  }
}

type ReadOptions = {
  endpoint: string; allowLocalHttp?: boolean; taskId?: string; signal?: AbortSignal;
  fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number;
};
const invalid = (): never => { throw new LingtuReadOnlyError('invalid_response'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : invalid();
const text = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 256) return invalid();
  return value.trim() || null;
};
const bool = (value: unknown): boolean | null => value == null ? null : typeof value === 'boolean' ? value : invalid();
const stateNames = ['IDLE', 'PLANNING', 'EXECUTING', 'RECOVERING', 'PAUSED', 'SUCCESS', 'FAILED', 'CANCELLED', 'UNKNOWN'];
const phaseStates: Readonly<Record<string, string>> = { PLANNING: 'PLANNING', PATH_ACTIVE: 'EXECUTING',
  EXECUTING: 'EXECUTING', PAUSED: 'PAUSED', RECOVERING: 'RECOVERING', REACHED: 'SUCCESS',
  SUCCESS: 'SUCCESS', FAILED: 'FAILED', CANCELLED: 'CANCELLED' };
const choice = (value: unknown, allowed: readonly string[]): string | null => {
  const result = text(value);
  return result === null || allowed.includes(result) ? result : invalid();
};
const taskIdentity = (value: unknown): string | null => {
  const id = text(value);
  if (id && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) return invalid();
  return id;
};
const readError = (error: unknown) => error instanceof LingtuReadOnlyError ? error
  : new LingtuReadOnlyError(error instanceof ConnectionCheckError ? error.code : 'unavailable');

/** Queries the selected task; historical records never inherit another task's stop status. */
export async function readLingtuTask(options: ReadOptions): Promise<LingtuTaskSnapshot> {
  const endpoint = validateLingtuOrigin(options.endpoint, options.allowLocalHttp === true);
  const now = options.now ?? (() => globalThis.performance?.now() ?? NaN);
  const observedAt = now();
  if (!isLingtuStatusFresh({ observedAt }, observedAt)) return invalid();
  const requestedId = taskIdentity(options.taskId);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) throw new LingtuReadOnlyError('cancelled');
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const nav = object(await readJson(`${endpoint}/api/v1/navigation/status`, { Accept: 'application/json' }, {
      signal: controller.signal, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs,
    }));
    if (controller.signal.aborted) throw new LingtuReadOnlyError('cancelled');
    if (nav.schema_version !== 3 || typeof nav.ts !== 'number' || !Number.isFinite(nav.ts) || nav.ts < 0) return invalid();
    const current = object(nav.task), control = object(nav.control), motion = object(nav.motion);
    const currentTaskId = taskIdentity(current.task_id), currentTaskState = choice(current.state, stateNames);
    const controlAuthority = choice(control.authority, ['AUTONOMY', 'OPERATOR', 'NONE', 'UNKNOWN']);
    const motionPermission = choice(motion.permission, ['CLEAR', 'HELD', 'ESTOPPED', 'UNKNOWN']);
    const reportedStop = choice(motion.stop_confirmation, ['NOT_REQUESTED', 'PENDING', 'CONFIRMED', 'FAILED', 'UNKNOWN']);
    const taskId = requestedId ?? currentTaskId;
    let found = false, state = taskId ? null : currentTaskState, phase: string | null = null, terminal: boolean | null = null;
    let source: string | null = null, evidenceStatus: string | null = null, producedAt: number | null = null;
    if (taskId) {
      const detail = object(await readJson(`${endpoint}/api/v1/navigation/tasks/${encodeURIComponent(taskId)}`, { Accept: 'application/json' }, {
        signal: controller.signal, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs,
      }));
      if (controller.signal.aborted) throw new LingtuReadOnlyError('cancelled');
      if (detail.schema_version !== 1 || taskIdentity(detail.task_id) !== taskId || typeof detail.found !== 'boolean'
        || typeof detail.ts !== 'number' || !Number.isFinite(detail.ts) || detail.ts < 0) return invalid();
      found = detail.found;
      source = choice(detail.source, ['live_gateway_cache', 'durable_task_ledger', 'durable_native_goal_status']);
      evidenceStatus = text(detail.evidence_status);
      if (found) {
        const status = object(detail.status);
        if (taskIdentity(status.task_id) !== taskId) return invalid();
        const lifecycle = choice(status.lifecycle_state_name, stateNames), reportedState = choice(status.state_name, stateNames);
        if (lifecycle && reportedState && lifecycle !== reportedState) return invalid();
        state = lifecycle ?? reportedState; phase = choice(status.phase, Object.keys(phaseStates)); terminal = bool(status.terminal);
        if (phase && state && phaseStates[phase] !== state) return invalid();
        const terminalState = state ?? (phase ? phaseStates[phase] : null);
        if (terminal !== null && terminalState && terminal !== ['SUCCESS', 'FAILED', 'CANCELLED'].includes(terminalState)) return invalid();
        if (status.ts != null && (typeof status.ts !== 'number' || !Number.isFinite(status.ts) || status.ts < 0)) return invalid();
        producedAt = typeof status.ts === 'number' ? status.ts : null;
      } else if (detail.status != null) return invalid();
    }
    const snapshot: LingtuTaskSnapshot = { endpoint, observedAt, taskId, found, state, phase, terminal,
      currentTaskId, currentTaskState, source, evidenceStatus, producedAt,
      stopConfirmation: taskId && currentTaskId === taskId && currentTaskState && !['UNKNOWN', 'IDLE'].includes(currentTaskState)
        ? reportedStop : null,
      controlAuthority, motionPermission, motionAuthorized: false };
    if (!isLingtuStatusFresh(snapshot, now())) return invalid();
    return snapshot;
  } catch (error) { throw readError(error); }
  finally {
    options.signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}

/** Sends one targeted cancel request; acceptance is not task completion or physical stop. */
export async function cancelLingtuTask(options: {
  snapshot: LingtuTaskSnapshot; allowLocalHttp?: boolean; requestId: string; signal?: AbortSignal;
  fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number;
}): Promise<LingtuTaskCancelReceipt> {
  const { snapshot, requestId } = options;
  const now = options.now ?? (() => globalThis.performance?.now() ?? NaN);
  if (!isLingtuStatusFresh(snapshot, now()) || snapshot.found !== true || snapshot.terminal !== false
    || !snapshot.taskId || snapshot.currentTaskId !== snapshot.taskId
    || !['PLANNING', 'EXECUTING', 'RECOVERING', 'PAUSED'].includes(snapshot.currentTaskState ?? '')
    || !taskIdentity(snapshot.taskId) || typeof requestId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId) || requestId === snapshot.taskId) {
    throw new LingtuTaskError('cancel_blocked');
  }
  const endpoint = validateLingtuOrigin(snapshot.endpoint, options.allowLocalHttp === true);
  if (options.signal?.aborted) throw new LingtuReadOnlyError('cancelled');
  try {
    const receipt = object(await readJson(`${endpoint}/api/v1/navigation/tasks/${encodeURIComponent(snapshot.taskId)}/cancel`, {
      Accept: 'application/json', 'Content-Type': 'application/json',
    }, { method: 'POST', body: JSON.stringify({ task_id: snapshot.taskId, request_id: requestId,
      client_id: 'doso-app', reason: 'client_cancel' }), signal: options.signal,
      fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs }));
    const command = object(receipt.command);
    if (receipt.schema_version !== 1 || receipt.ok !== true || receipt.accepted !== true
      || receipt.status !== 'cancel_requested' || receipt.task_id !== snapshot.taskId
      || command.name !== 'navigation_cancel' || command.task_id !== snapshot.taskId
      || command.request_id !== requestId || command.client_id !== 'doso-app' || command.accepted !== true) {
      throw new LingtuTaskError('cancel_unknown');
    }
    return { endpoint, taskId: snapshot.taskId, requestId, accepted: true, completionConfirmed: false };
  } catch { throw new LingtuTaskError('cancel_unknown'); }
}
