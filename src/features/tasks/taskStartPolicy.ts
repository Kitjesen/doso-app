export type TaskCandidateSource = 'custom' | 'preview' | 'template' | 'trusted';

export type TaskPlanValidation = 'invalid' | 'unknown' | 'validated';

export type TaskStartCandidate = Readonly<{
  displayName: string;
  planValidation: TaskPlanValidation;
  source: TaskCandidateSource;
  taskId: string | null;
}>;

export type TaskStartPolicyInput = Readonly<{
  candidate: TaskStartCandidate | null;
  control: Readonly<{ available: boolean }>;
  executor: Readonly<{ available: boolean }> | null;
}>;

export type TaskStartBlockCode =
  | 'candidate-missing'
  | 'control-unavailable'
  | 'custom-empty'
  | 'custom-untrusted'
  | 'executor-unavailable'
  | 'plan-invalid'
  | 'plan-unknown'
  | 'preview-only'
  | 'source-untrusted'
  | 'task-id-invalid'
  | 'task-id-missing'
  | 'template-only';

export type TaskStartReadiness =
  | Readonly<{
    code: TaskStartBlockCode;
    enabled: false;
    reason: string;
  }>
  | Readonly<{
    enabled: true;
    trustedTaskId: string;
  }>;

const BLOCK_REASONS: Readonly<Record<TaskStartBlockCode, string>> = Object.freeze({
  'candidate-missing': '尚未选择任务，请先选择一项已同步的可信任务。',
  'control-unavailable': '任务控制当前不可用，请先恢复设备连接与任务控制权限。',
  'custom-empty': '自定义任务为空，请先完成任务配置并通过可信同步。',
  'custom-untrusted': '自定义任务尚未经过可信同步，当前不能启动。',
  'executor-unavailable': '生产任务执行器当前不可用，不能下发任务。',
  'plan-invalid': '任务计划校验未通过，请修复任务后重试。',
  'plan-unknown': '任务计划状态尚未验证，当前不能启动。',
  'preview-only': '预览任务仅用于查看，不能下发到机器人。',
  'source-untrusted': '任务来源未经信任，当前不能启动。',
  'task-id-invalid': '可信任务标识格式无效，当前不能启动。',
  'task-id-missing': '可信任务缺少可信任务标识，当前不能启动。',
  'template-only': '任务模板尚未生成可信任务，当前不能启动。',
});

const TRUSTED_TASK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

type OwnDataProperty =
  | Readonly<{ found: false }>
  | Readonly<{ found: true; value: unknown }>;

type TaskStartPolicySnapshot = Readonly<{
  candidateDisplayName: unknown;
  candidatePlanValidation: unknown;
  candidatePresent: boolean;
  candidateSource: unknown;
  candidateTaskId: unknown;
  controlAvailable: boolean;
  executorAvailable: boolean;
}>;

const MISSING_OWN_DATA_PROPERTY: OwnDataProperty = Object.freeze({ found: false });

function readOwnDataProperty(value: unknown, key: PropertyKey): OwnDataProperty {
  if (typeof value !== 'object' || value === null) {
    return MISSING_OWN_DATA_PROPERTY;
  }

  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      return MISSING_OWN_DATA_PROPERTY;
    }
    return Object.freeze({ found: true, value: descriptor.value });
  } catch {
    return MISSING_OWN_DATA_PROPERTY;
  }
}

function snapshotTaskStartPolicyInput(input: unknown): TaskStartPolicySnapshot {
  const controlProperty = readOwnDataProperty(input, 'control');
  const executorProperty = readOwnDataProperty(input, 'executor');
  const candidateProperty = readOwnDataProperty(input, 'candidate');

  const controlAvailableProperty = readOwnDataProperty(
    controlProperty.found ? controlProperty.value : null,
    'available',
  );
  const executorAvailableProperty = readOwnDataProperty(
    executorProperty.found ? executorProperty.value : null,
    'available',
  );
  const candidate = candidateProperty.found ? candidateProperty.value : null;
  const candidatePresent = candidate !== null && typeof candidate === 'object';
  const sourceProperty = readOwnDataProperty(candidate, 'source');
  const displayNameProperty = readOwnDataProperty(candidate, 'displayName');
  const taskIdProperty = readOwnDataProperty(candidate, 'taskId');
  const planValidationProperty = readOwnDataProperty(candidate, 'planValidation');

  return Object.freeze({
    candidateDisplayName: displayNameProperty.found ? displayNameProperty.value : undefined,
    candidatePlanValidation: planValidationProperty.found
      ? planValidationProperty.value
      : undefined,
    candidatePresent,
    candidateSource: sourceProperty.found ? sourceProperty.value : undefined,
    candidateTaskId: taskIdProperty.found ? taskIdProperty.value : undefined,
    controlAvailable:
      controlAvailableProperty.found && controlAvailableProperty.value === true,
    executorAvailable:
      executorAvailableProperty.found && executorAvailableProperty.value === true,
  });
}

function blocked(code: TaskStartBlockCode): TaskStartReadiness {
  return Object.freeze({ code, enabled: false, reason: BLOCK_REASONS[code] });
}

export function deriveTaskStartReadiness(input: TaskStartPolicyInput): TaskStartReadiness {
  const snapshot = snapshotTaskStartPolicyInput(input);
  if (!snapshot.controlAvailable) return blocked('control-unavailable');
  if (!snapshot.executorAvailable) return blocked('executor-unavailable');

  if (!snapshot.candidatePresent) return blocked('candidate-missing');
  if (snapshot.candidateSource === 'preview') return blocked('preview-only');
  if (snapshot.candidateSource === 'template') return blocked('template-only');
  if (snapshot.candidateSource === 'custom') {
    return blocked(
      typeof snapshot.candidateDisplayName === 'string' && snapshot.candidateDisplayName.trim()
        ? 'custom-untrusted'
        : 'custom-empty',
    );
  }
  if (snapshot.candidateSource !== 'trusted') return blocked('source-untrusted');
  if (snapshot.candidateTaskId === null || snapshot.candidateTaskId === undefined) {
    return blocked('task-id-missing');
  }
  if (typeof snapshot.candidateTaskId !== 'string') return blocked('task-id-invalid');

  const trustedTaskId = snapshot.candidateTaskId.trim();
  if (!trustedTaskId) return blocked('task-id-missing');
  if (!TRUSTED_TASK_ID_PATTERN.test(trustedTaskId)) return blocked('task-id-invalid');
  if (snapshot.candidatePlanValidation === 'unknown') return blocked('plan-unknown');
  if (snapshot.candidatePlanValidation === 'invalid') return blocked('plan-invalid');
  if (snapshot.candidatePlanValidation !== 'validated') return blocked('plan-unknown');

  return Object.freeze({ enabled: true, trustedTaskId });
}

export function attemptTaskStart(
  currentInput: TaskStartPolicyInput,
  onStart: (trustedTaskId: string) => void,
): TaskStartReadiness {
  const readiness = deriveTaskStartReadiness(currentInput);
  if (!readiness.enabled) return readiness;
  onStart(readiness.trustedTaskId);
  return readiness;
}

export function createTaskStartHandler(
  currentInput: TaskStartPolicyInput,
  onStart: (trustedTaskId: string) => void,
): () => TaskStartReadiness {
  return () => attemptTaskStart(currentInput, onStart);
}
