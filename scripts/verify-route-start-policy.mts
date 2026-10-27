// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as routeStartPolicy from '../src/features/routes/routeStartPolicy.ts';
import {
  attemptRouteStart,
  deriveRouteStartReadiness,
  type RouteStartCandidate,
  type RouteStartPolicyInput,
} from '../src/features/routes/routeStartPolicy.ts';

const trustedCandidate = (overrides: Partial<RouteStartCandidate> = {}): RouteStartCandidate => ({
  displayName: '园区巡检路线',
  geometryValidation: 'validated',
  routeId: 'route_trusted_7f3a',
  source: 'trusted',
  ...overrides,
});

const readyInput = (overrides: Partial<RouteStartPolicyInput> = {}): RouteStartPolicyInput => ({
  candidate: trustedCandidate(),
  control: { available: true },
  executor: { available: true },
  ...overrides,
});

test('all unsafe route states fail closed with a distinct readable reason and never dispatch', () => {
  const cases: ReadonlyArray<Readonly<{
    expectedCode: string;
    expectedReason: RegExp;
    input: RouteStartPolicyInput;
    label: string;
  }>> = [
    {
      expectedCode: 'control-unavailable',
      expectedReason: /路线控制当前不可用/,
      input: readyInput({ control: { available: false } }),
      label: 'control unavailable',
    },
    {
      expectedCode: 'control-unavailable',
      expectedReason: /路线控制当前不可用/,
      input: readyInput({ control: { available: 'yes' } as unknown as { available: boolean } }),
      label: 'malformed truthy control gate',
    },
    {
      expectedCode: 'executor-unavailable',
      expectedReason: /生产路线执行器当前不可用/,
      input: readyInput({ executor: null }),
      label: 'null executor',
    },
    {
      expectedCode: 'executor-unavailable',
      expectedReason: /生产路线执行器当前不可用/,
      input: readyInput({ executor: { available: false } }),
      label: 'disabled executor',
    },
    {
      expectedCode: 'executor-unavailable',
      expectedReason: /生产路线执行器当前不可用/,
      input: readyInput({ executor: { available: 1 } as unknown as { available: boolean } }),
      label: 'malformed truthy executor gate',
    },
    {
      expectedCode: 'candidate-missing',
      expectedReason: /尚未选择路线/,
      input: readyInput({ candidate: null }),
      label: 'missing candidate',
    },
    {
      expectedCode: 'preview-only',
      expectedReason: /预览路线仅用于查看/,
      input: readyInput({ candidate: trustedCandidate({ source: 'preview' }) }),
      label: 'preview candidate',
    },
    {
      expectedCode: 'template-only',
      expectedReason: /路线模板尚未生成可信路线/,
      input: readyInput({ candidate: trustedCandidate({ source: 'template' }) }),
      label: 'template candidate',
    },
    {
      expectedCode: 'custom-empty',
      expectedReason: /自定义路线为空/,
      input: readyInput({ candidate: trustedCandidate({ displayName: '   ', routeId: null, source: 'custom' }) }),
      label: 'empty custom candidate',
    },
    {
      expectedCode: 'custom-untrusted',
      expectedReason: /自定义路线尚未经过可信同步/,
      input: readyInput({ candidate: trustedCandidate({ displayName: '我画的路线', source: 'custom' }) }),
      label: 'non-empty custom candidate',
    },
    {
      expectedCode: 'custom-empty',
      expectedReason: /自定义路线为空/,
      input: readyInput({
        candidate: trustedCandidate({ displayName: 1 as unknown as string, source: 'custom' }),
      }),
      label: 'malformed custom display name',
    },
    {
      expectedCode: 'source-untrusted',
      expectedReason: /路线来源未经信任/,
      input: readyInput({
        candidate: trustedCandidate({ source: 'mystery' as unknown as RouteStartCandidate['source'] }),
      }),
      label: 'unknown candidate source',
    },
    {
      expectedCode: 'route-id-missing',
      expectedReason: /缺少可信路线标识/,
      input: readyInput({ candidate: trustedCandidate({ routeId: null }) }),
      label: 'missing trusted routeId',
    },
    {
      expectedCode: 'route-id-missing',
      expectedReason: /缺少可信路线标识/,
      input: readyInput({ candidate: trustedCandidate({ routeId: '   ' }) }),
      label: 'blank trusted routeId',
    },
    {
      expectedCode: 'route-id-invalid',
      expectedReason: /可信路线标识格式无效/,
      input: readyInput({ candidate: trustedCandidate({ routeId: 'route with spaces' }) }),
      label: 'trusted routeId with internal spaces',
    },
    {
      expectedCode: 'route-id-invalid',
      expectedReason: /可信路线标识格式无效/,
      input: readyInput({ candidate: trustedCandidate({ routeId: '../route-secret' }) }),
      label: 'invalid trusted routeId',
    },
    {
      expectedCode: 'route-id-invalid',
      expectedReason: /可信路线标识格式无效/,
      input: readyInput({ candidate: trustedCandidate({ routeId: 7 as unknown as string }) }),
      label: 'non-string trusted routeId',
    },
    {
      expectedCode: 'geometry-unknown',
      expectedReason: /路线几何状态尚未验证/,
      input: readyInput({ candidate: trustedCandidate({ geometryValidation: 'unknown' }) }),
      label: 'unknown geometry',
    },
    {
      expectedCode: 'geometry-invalid',
      expectedReason: /路线几何校验未通过/,
      input: readyInput({ candidate: trustedCandidate({ geometryValidation: 'invalid' }) }),
      label: 'invalid geometry',
    },
    {
      expectedCode: 'geometry-unknown',
      expectedReason: /路线几何状态尚未验证/,
      input: readyInput({
        candidate: trustedCandidate({
          geometryValidation: 'pending' as unknown as RouteStartCandidate['geometryValidation'],
        }),
      }),
      label: 'unknown runtime geometry value',
    },
  ];

  for (const scenario of cases) {
    const readiness = deriveRouteStartReadiness(scenario.input);
    assert.equal(readiness.enabled, false, scenario.label);
    if (readiness.enabled) assert.fail(`${scenario.label} unexpectedly enabled route start`);
    assert.equal(readiness.code, scenario.expectedCode, scenario.label);
    assert.match(readiness.reason, scenario.expectedReason, scenario.label);

    let callbackCalls = 0;
    const attempt = attemptRouteStart(scenario.input, () => { callbackCalls += 1; });
    assert.equal(attempt.enabled, false, scenario.label);
    assert.equal(callbackCalls, 0, scenario.label);
  }
});

test('the only allowed state dispatches exactly once with the normalized trusted routeId, never the display name', () => {
  const routeId = 'route_trusted_7f3a';
  const displayName = '这个显示名称绝不能进入命令载荷';
  const input = readyInput({ candidate: trustedCandidate({ displayName, routeId: `  ${routeId}  ` }) });
  const readiness = deriveRouteStartReadiness(input);

  assert.deepEqual(readiness, { enabled: true, trustedRouteId: routeId });

  const received: string[] = [];
  assert.deepEqual(attemptRouteStart(input, (trustedRouteId) => received.push(trustedRouteId)), readiness);
  assert.deepEqual(received, [routeId]);
  assert.notEqual(received[0], displayName);
});

test('dispatch cannot be reached with forged readiness and always re-derives current input', () => {
  assert.equal('startTrustedRoute' in routeStartPolicy, false);

  const forgedInput = {
    ...readyInput({ executor: null }),
    readiness: { enabled: true, trustedRouteId: 'route_forged' },
  } as RouteStartPolicyInput;
  const received: string[] = [];

  const result = attemptRouteStart(forgedInput, (trustedRouteId) => received.push(trustedRouteId));
  assert.deepEqual(result, {
    code: 'executor-unavailable',
    enabled: false,
    reason: '生产路线执行器当前不可用，不能下发路线。',
  });
  assert.deepEqual(received, []);
});
