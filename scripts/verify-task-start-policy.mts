// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as taskStartPolicy from '../src/features/tasks/taskStartPolicy.ts';
import {
  attemptTaskStart,
  createTaskStartHandler,
  deriveTaskStartReadiness,
  type TaskStartCandidate,
  type TaskStartPolicyInput,
} from '../src/features/tasks/taskStartPolicy.ts';

const trustedCandidate = (overrides: Partial<TaskStartCandidate> = {}): TaskStartCandidate => ({
  displayName: '园区巡检任务',
  planValidation: 'validated',
  source: 'trusted',
  taskId: 'task_trusted_7f3a',
  ...overrides,
});

const readyInput = (overrides: Partial<TaskStartPolicyInput> = {}): TaskStartPolicyInput => ({
  candidate: trustedCandidate(),
  control: { available: true },
  executor: { available: true },
  ...overrides,
});

test('all unsafe task states fail closed with readable reasons and never dispatch', () => {
  const cases: ReadonlyArray<Readonly<{
    expectedCode: string;
    expectedReason: RegExp;
    input: TaskStartPolicyInput;
    label: string;
  }>> = [
    { expectedCode: 'control-unavailable', expectedReason: /任务控制当前不可用/, input: readyInput({ control: { available: false } }), label: 'control unavailable' },
    { expectedCode: 'control-unavailable', expectedReason: /任务控制当前不可用/, input: readyInput({ control: { available: 'yes' } as unknown as { available: boolean } }), label: 'malformed truthy control' },
    { expectedCode: 'executor-unavailable', expectedReason: /生产任务执行器当前不可用/, input: readyInput({ executor: null }), label: 'null executor' },
    { expectedCode: 'executor-unavailable', expectedReason: /生产任务执行器当前不可用/, input: readyInput({ executor: { available: false } }), label: 'disabled executor' },
    { expectedCode: 'executor-unavailable', expectedReason: /生产任务执行器当前不可用/, input: readyInput({ executor: { available: 1 } as unknown as { available: boolean } }), label: 'malformed truthy executor' },
    { expectedCode: 'candidate-missing', expectedReason: /尚未选择任务/, input: readyInput({ candidate: null }), label: 'missing candidate' },
    { expectedCode: 'preview-only', expectedReason: /预览任务仅用于查看/, input: readyInput({ candidate: trustedCandidate({ source: 'preview' }) }), label: 'preview candidate' },
    { expectedCode: 'template-only', expectedReason: /任务模板尚未生成可信任务/, input: readyInput({ candidate: trustedCandidate({ source: 'template' }) }), label: 'template candidate' },
    { expectedCode: 'custom-empty', expectedReason: /自定义任务为空/, input: readyInput({ candidate: trustedCandidate({ displayName: '   ', source: 'custom', taskId: null }) }), label: 'empty custom candidate' },
    { expectedCode: 'custom-untrusted', expectedReason: /自定义任务尚未经过可信同步/, input: readyInput({ candidate: trustedCandidate({ displayName: '我的任务', source: 'custom' }) }), label: 'custom candidate' },
    { expectedCode: 'custom-empty', expectedReason: /自定义任务为空/, input: readyInput({ candidate: trustedCandidate({ displayName: 1 as unknown as string, source: 'custom' }) }), label: 'malformed custom name' },
    { expectedCode: 'source-untrusted', expectedReason: /任务来源未经信任/, input: readyInput({ candidate: trustedCandidate({ source: 'mystery' as unknown as TaskStartCandidate['source'] }) }), label: 'unknown source' },
    { expectedCode: 'task-id-missing', expectedReason: /缺少可信任务标识/, input: readyInput({ candidate: trustedCandidate({ taskId: null }) }), label: 'missing taskId' },
    { expectedCode: 'task-id-missing', expectedReason: /缺少可信任务标识/, input: readyInput({ candidate: trustedCandidate({ taskId: '   ' }) }), label: 'blank taskId' },
    { expectedCode: 'task-id-invalid', expectedReason: /任务标识格式无效/, input: readyInput({ candidate: trustedCandidate({ taskId: 'task with spaces' }) }), label: 'space in taskId' },
    { expectedCode: 'task-id-invalid', expectedReason: /任务标识格式无效/, input: readyInput({ candidate: trustedCandidate({ taskId: 'task\u0000control' }) }), label: 'Unicode control character' },
    { expectedCode: 'task-id-invalid', expectedReason: /任务标识格式无效/, input: readyInput({ candidate: trustedCandidate({ taskId: `t${'a'.repeat(128)}` }) }), label: 'overlong taskId' },
    { expectedCode: 'task-id-invalid', expectedReason: /任务标识格式无效/, input: readyInput({ candidate: trustedCandidate({ taskId: '../task-secret' }) }), label: 'path-like taskId' },
    { expectedCode: 'task-id-invalid', expectedReason: /任务标识格式无效/, input: readyInput({ candidate: trustedCandidate({ taskId: 7 as unknown as string }) }), label: 'non-string taskId' },
    { expectedCode: 'plan-unknown', expectedReason: /任务计划状态尚未验证/, input: readyInput({ candidate: trustedCandidate({ planValidation: 'unknown' }) }), label: 'unknown plan' },
    { expectedCode: 'plan-invalid', expectedReason: /任务计划校验未通过/, input: readyInput({ candidate: trustedCandidate({ planValidation: 'invalid' }) }), label: 'invalid plan' },
    { expectedCode: 'plan-unknown', expectedReason: /任务计划状态尚未验证/, input: readyInput({ candidate: trustedCandidate({ planValidation: 'pending' as unknown as TaskStartCandidate['planValidation'] }) }), label: 'malformed validation' },
  ];

  for (const scenario of cases) {
    const readiness = deriveTaskStartReadiness(scenario.input);
    assert.equal(readiness.enabled, false, scenario.label);
    if (readiness.enabled) assert.fail(`${scenario.label} unexpectedly enabled task start`);
    assert.equal(readiness.code, scenario.expectedCode, scenario.label);
    assert.match(readiness.reason, scenario.expectedReason, scenario.label);

    let callbackCalls = 0;
    const attempt = attemptTaskStart(scenario.input, () => { callbackCalls += 1; });
    assert.equal(attempt.enabled, false, scenario.label);
    assert.equal(callbackCalls, 0, scenario.label);
  }
});

test('the only allowed state dispatches exactly once with the normalized trusted taskId', () => {
  const taskId = 'task_trusted_7f3a';
  const displayName = '这个显示名称绝不能进入命令载荷';
  const input = readyInput({ candidate: trustedCandidate({ displayName, taskId: `  ${taskId}  ` }) });
  const readiness = deriveTaskStartReadiness(input);

  assert.deepEqual(readiness, { enabled: true, trustedTaskId: taskId });
  const received: string[] = [];
  assert.deepEqual(attemptTaskStart(input, (trustedTaskId) => received.push(trustedTaskId)), readiness);
  assert.deepEqual(received, [taskId]);
  assert.notEqual(received[0], displayName);
});

test('forged readiness and a mutated input cannot bypass atomic re-derivation', () => {
  assert.equal('startTrustedTask' in taskStartPolicy, false);

  const mutableInput = readyInput() as {
    candidate: TaskStartCandidate | null;
    control: { available: boolean };
    executor: { available: boolean } | null;
    readiness?: { enabled: boolean; trustedTaskId: string };
  };
  assert.equal(deriveTaskStartReadiness(mutableInput).enabled, true);
  mutableInput.executor = null;
  mutableInput.readiness = { enabled: true, trustedTaskId: 'task_forged' };

  const received: string[] = [];
  const result = attemptTaskStart(mutableInput, (trustedTaskId) => received.push(trustedTaskId));
  assert.deepEqual(result, {
    code: 'executor-unavailable',
    enabled: false,
    reason: '生产任务执行器当前不可用，不能下发任务。',
  });
  assert.deepEqual(received, []);
});

test('the click binding rejects non-trusted candidates and dispatches only a normalized trusted id', () => {
  const received: string[] = [];
  const onStart = (trustedTaskId: string) => received.push(trustedTaskId);

  for (const candidate of [
    trustedCandidate({ source: 'template' }),
    trustedCandidate({ source: 'preview' }),
    trustedCandidate({ source: 'custom' }),
  ]) {
    const result = createTaskStartHandler(readyInput({ candidate }), onStart)();
    assert.equal(result.enabled, false);
  }
  assert.deepEqual(received, []);

  const trustedResult = createTaskStartHandler(
    readyInput({ candidate: trustedCandidate({ taskId: '  task.bound:7  ' }) }),
    onStart,
  )();
  assert.deepEqual(trustedResult, { enabled: true, trustedTaskId: 'task.bound:7' });
  assert.deepEqual(received, ['task.bound:7']);
});

test('the click binding re-derives from current input and fails closed after mutation', () => {
  const mutableInput = readyInput() as {
    candidate: TaskStartCandidate | null;
    control: { available: boolean };
    executor: { available: boolean } | null;
  };
  const received: string[] = [];
  const handler = createTaskStartHandler(mutableInput, (trustedTaskId) => received.push(trustedTaskId));

  mutableInput.candidate = trustedCandidate({ source: 'template' });
  assert.deepEqual(handler(), {
    code: 'template-only',
    enabled: false,
    reason: '任务模板尚未生成可信任务，当前不能启动。',
  });
  assert.deepEqual(received, []);
});

test('inherited policy fields never authorize a task start', () => {
  const inheritedInput = Object.create(readyInput()) as TaskStartPolicyInput;
  const inheritedControl = Object.create({ available: true });
  const inheritedExecutor = Object.create({ available: true });
  const inheritedSource = Object.assign(Object.create({ source: 'trusted' }), {
    displayName: '继承来源',
    planValidation: 'validated',
    taskId: 'task_inherited_source',
  });
  const inheritedDisplayName = Object.assign(Object.create({ displayName: '继承名称' }), {
    planValidation: 'validated',
    source: 'custom',
    taskId: 'task_inherited_name',
  });
  const inheritedTaskId = Object.assign(Object.create({ taskId: 'task_inherited_id' }), {
    displayName: '继承标识',
    planValidation: 'validated',
    source: 'trusted',
  });
  const inheritedPlan = Object.assign(Object.create({ planValidation: 'validated' }), {
    displayName: '继承计划',
    source: 'trusted',
    taskId: 'task_inherited_plan',
  });

  const cases = [
    [inheritedInput, 'control-unavailable'],
    [readyInput({ control: inheritedControl }), 'control-unavailable'],
    [readyInput({ executor: inheritedExecutor }), 'executor-unavailable'],
    [readyInput({ candidate: inheritedSource }), 'source-untrusted'],
    [readyInput({ candidate: inheritedDisplayName }), 'custom-empty'],
    [readyInput({ candidate: inheritedTaskId }), 'task-id-missing'],
    [readyInput({ candidate: inheritedPlan }), 'plan-unknown'],
  ] as const;

  for (const [input, expectedCode] of cases) {
    const received: string[] = [];
    const result = createTaskStartHandler(
      input as TaskStartPolicyInput,
      (trustedTaskId) => received.push(trustedTaskId),
    )();
    assert.equal(result.enabled, false);
    if (result.enabled) assert.fail(`inherited ${expectedCode} case unexpectedly started`);
    assert.equal(result.code, expectedCode);
    assert.deepEqual(received, []);
  }
});

test('input, control, executor, and candidate getters and setters are rejected without execution', () => {
  const accessorExecutions: string[] = [];
  const throwingGetter = (label: string) => ({
    configurable: true,
    enumerable: true,
    get() {
      accessorExecutions.push(label);
      throw new Error(`${label} getter must not execute`);
    },
  });
  const defineGetter = (target: object, key: string, label: string) =>
    Object.defineProperty(target, key, throwingGetter(label));
  const defineSetter = (target: object, key: string, label: string) =>
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      set() {
        accessorExecutions.push(label);
        throw new Error(`${label} setter must not execute`);
      },
    });

  const inputControlAccessor = defineGetter(
    { candidate: trustedCandidate(), executor: { available: true } },
    'control',
    'input.control',
  );
  const inputExecutorAccessor = defineGetter(
    { candidate: trustedCandidate(), control: { available: true } },
    'executor',
    'input.executor',
  );
  const inputCandidateAccessor = defineGetter(
    { control: { available: true }, executor: { available: true } },
    'candidate',
    'input.candidate',
  );
  const controlAccessor = defineGetter({}, 'available', 'control.available');
  const executorAccessor = defineGetter({}, 'available', 'executor.available');
  const candidateSourceAccessor = defineGetter(
    { displayName: '访问器来源', planValidation: 'validated', taskId: 'task_accessor_source' },
    'source',
    'candidate.source',
  );
  const candidateDisplayNameAccessor = defineGetter(
    { planValidation: 'validated', source: 'custom', taskId: 'task_accessor_name' },
    'displayName',
    'candidate.displayName',
  );
  const candidateTaskIdAccessor = defineGetter(
    { displayName: '访问器标识', planValidation: 'validated', source: 'trusted' },
    'taskId',
    'candidate.taskId',
  );
  const candidatePlanAccessor = defineGetter(
    { displayName: '访问器计划', source: 'trusted', taskId: 'task_accessor_plan' },
    'planValidation',
    'candidate.planValidation',
  );
  const inputControlSetter = defineSetter(
    { candidate: trustedCandidate(), executor: { available: true } },
    'control',
    'input.control setter',
  );
  const controlSetter = defineSetter({}, 'available', 'control.available setter');
  const executorSetter = defineSetter({}, 'available', 'executor.available setter');
  const candidateSourceSetter = defineSetter(
    { displayName: '访问器来源', planValidation: 'validated', taskId: 'task_setter_source' },
    'source',
    'candidate.source setter',
  );

  const cases = [
    [inputControlAccessor, 'control-unavailable'],
    [inputExecutorAccessor, 'executor-unavailable'],
    [inputCandidateAccessor, 'candidate-missing'],
    [readyInput({ control: controlAccessor }), 'control-unavailable'],
    [readyInput({ executor: executorAccessor }), 'executor-unavailable'],
    [readyInput({ candidate: candidateSourceAccessor }), 'source-untrusted'],
    [readyInput({ candidate: candidateDisplayNameAccessor }), 'custom-empty'],
    [readyInput({ candidate: candidateTaskIdAccessor }), 'task-id-missing'],
    [readyInput({ candidate: candidatePlanAccessor }), 'plan-unknown'],
    [inputControlSetter, 'control-unavailable'],
    [readyInput({ control: controlSetter }), 'control-unavailable'],
    [readyInput({ executor: executorSetter }), 'executor-unavailable'],
    [readyInput({ candidate: candidateSourceSetter }), 'source-untrusted'],
  ] as const;

  for (const [input, expectedCode] of cases) {
    const received: string[] = [];
    const result = createTaskStartHandler(
      input as TaskStartPolicyInput,
      (trustedTaskId) => received.push(trustedTaskId),
    )();
    assert.equal(result.enabled, false);
    if (result.enabled) assert.fail(`accessor ${expectedCode} case unexpectedly started`);
    assert.equal(result.code, expectedCode);
    assert.deepEqual(received, []);
  }
  assert.deepEqual(accessorExecutions, []);
});
