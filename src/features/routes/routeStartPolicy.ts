export type RouteCandidateSource = 'custom' | 'preview' | 'template' | 'trusted';

export type RouteGeometryValidation = 'invalid' | 'unknown' | 'validated';

export type RouteStartCandidate = Readonly<{
  displayName: string;
  geometryValidation: RouteGeometryValidation;
  routeId: string | null;
  source: RouteCandidateSource;
}>;

export type RouteStartPolicyInput = Readonly<{
  candidate: RouteStartCandidate | null;
  control: Readonly<{ available: boolean }>;
  executor: Readonly<{ available: boolean }> | null;
}>;

export type RouteStartBlockCode =
  | 'candidate-missing'
  | 'control-unavailable'
  | 'custom-empty'
  | 'custom-untrusted'
  | 'executor-unavailable'
  | 'geometry-invalid'
  | 'geometry-unknown'
  | 'preview-only'
  | 'route-id-invalid'
  | 'route-id-missing'
  | 'source-untrusted'
  | 'template-only';

export type RouteStartReadiness =
  | Readonly<{
    code: RouteStartBlockCode;
    enabled: false;
    reason: string;
  }>
  | Readonly<{
    enabled: true;
    trustedRouteId: string;
  }>;

const BLOCK_REASONS: Readonly<Record<RouteStartBlockCode, string>> = Object.freeze({
  'candidate-missing': '尚未选择路线，请先选择一条已同步的可信路线。',
  'control-unavailable': '路线控制当前不可用，请先恢复设备连接与运动控制权限。',
  'custom-empty': '自定义路线为空，请先完成路线绘制并通过可信同步。',
  'custom-untrusted': '自定义路线尚未经过可信同步，当前不能启动。',
  'executor-unavailable': '生产路线执行器当前不可用，不能下发路线。',
  'geometry-invalid': '路线几何校验未通过，请修复路线后重试。',
  'geometry-unknown': '路线几何状态尚未验证，当前不能启动。',
  'preview-only': '预览路线仅用于查看，不能下发到机器人。',
  'route-id-invalid': '可信路线标识格式无效，当前不能启动。',
  'route-id-missing': '可信路线缺少可信路线标识，当前不能启动。',
  'source-untrusted': '路线来源未经信任，当前不能启动。',
  'template-only': '路线模板尚未生成可信路线，当前不能启动。',
});

const TRUSTED_ROUTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function blocked(code: RouteStartBlockCode): RouteStartReadiness {
  return Object.freeze({ code, enabled: false, reason: BLOCK_REASONS[code] });
}

export function deriveRouteStartReadiness(input: RouteStartPolicyInput): RouteStartReadiness {
  if (input.control?.available !== true) return blocked('control-unavailable');
  if (input.executor?.available !== true) return blocked('executor-unavailable');

  const candidate = input.candidate;
  if (!candidate) return blocked('candidate-missing');
  if (candidate.source === 'preview') return blocked('preview-only');
  if (candidate.source === 'template') return blocked('template-only');
  if (candidate.source === 'custom') {
    return blocked(
      typeof candidate.displayName === 'string' && candidate.displayName.trim()
        ? 'custom-untrusted'
        : 'custom-empty',
    );
  }
  if (candidate.source !== 'trusted') return blocked('source-untrusted');
  if (candidate.routeId === null || candidate.routeId === undefined) return blocked('route-id-missing');
  if (typeof candidate.routeId !== 'string') return blocked('route-id-invalid');

  const trustedRouteId = candidate.routeId.trim();
  if (!trustedRouteId) return blocked('route-id-missing');
  if (!TRUSTED_ROUTE_ID_PATTERN.test(trustedRouteId)) return blocked('route-id-invalid');
  if (candidate.geometryValidation === 'unknown') return blocked('geometry-unknown');
  if (candidate.geometryValidation === 'invalid') return blocked('geometry-invalid');
  if (candidate.geometryValidation !== 'validated') return blocked('geometry-unknown');

  return Object.freeze({ enabled: true, trustedRouteId });
}

export function attemptRouteStart(
  currentInput: RouteStartPolicyInput,
  onStart: (trustedRouteId: string) => void,
): RouteStartReadiness {
  const readiness = deriveRouteStartReadiness(currentInput);
  if (!readiness.enabled) return readiness;
  onStart(readiness.trustedRouteId);
  return readiness;
}
