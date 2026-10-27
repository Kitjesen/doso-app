export const DESIGN_QA_STAGES = [
  'auth-login',
  'auth-register',
  'auth-email-otp',
  'auth-forgot-password',
  'auth-reset-password',
  'auth-username',
  'auth-display-name',
  'auth-mfa',
  'model-select',
  'main-home',
  'main-routes',
  'main-tasks',
  'main-analysis',
  'main-profile',
  'robot-control',
  'device-bind',
  'device-ble-discovery',
  'device-provisioning',
  'device-firmware',
  'account-security',
] as const;

export type DesignQaStage = (typeof DESIGN_QA_STAGES)[number];
export type DesignQaState =
  | 'default'
  | 'loading'
  | 'error'
  | 'nonce'
  | 'unavailable'
  | 'trusted-empty'
  | 'expired'
  | 'permission-denied'
  | 'bluetooth-off'
  | 'scanning'
  | 'empty';

const allowedStates: Record<DesignQaStage, readonly DesignQaState[]> = {
  'auth-login': ['default', 'loading', 'error'],
  'auth-register': ['default', 'loading', 'error'],
  'auth-email-otp': ['default', 'loading', 'error', 'expired'],
  'auth-forgot-password': ['default', 'loading', 'error'],
  'auth-reset-password': ['default', 'loading', 'error', 'nonce'],
  'auth-username': ['default', 'loading', 'error'],
  'auth-display-name': ['default', 'loading', 'error'],
  'auth-mfa': ['unavailable', 'loading'],
  'model-select': ['default', 'loading'],
  'main-home': ['default'],
  'main-routes': ['default'],
  'main-tasks': ['default'],
  'main-analysis': ['default', 'trusted-empty'],
  'main-profile': ['default'],
  'robot-control': ['default'],
  'device-bind': ['default', 'loading', 'error'],
  'device-ble-discovery': ['default', 'permission-denied', 'bluetooth-off', 'scanning', 'empty'],
  'device-provisioning': ['unavailable'],
  'device-firmware': ['unavailable'],
  'account-security': ['unavailable', 'loading'],
};

const defaultStates: Partial<Record<DesignQaStage, DesignQaState>> = {
  'auth-mfa': 'unavailable',
  'device-provisioning': 'unavailable',
  'device-firmware': 'unavailable',
  'account-security': 'unavailable',
};

export type DesignQaRequest = {
  stage: DesignQaStage | null;
  state: DesignQaState | null;
  issue: string | null;
};

function isStage(value: string | null): value is DesignQaStage {
  return DESIGN_QA_STAGES.some((stage) => stage === value);
}

export function isDesignQaRequested(search: string) {
  return new URLSearchParams(search).get('design-qa') === '1';
}

export function parseDesignQaRequest(search: string): DesignQaRequest {
  const params = new URLSearchParams(search);
  const stageValue = params.get('qa-stage');
  if (!isStage(stageValue)) {
    return { stage: null, state: null, issue: 'qa-stage 缺失或不受支持' };
  }

  const requestedState = params.get('qa-state') ?? defaultStates[stageValue] ?? 'default';
  const state = allowedStates[stageValue].find((candidate) => candidate === requestedState) ?? null;
  if (!state) {
    return { stage: stageValue, state: null, issue: `${stageValue} 不支持 qa-state=${requestedState}` };
  }

  return { stage: stageValue, state, issue: null };
}
