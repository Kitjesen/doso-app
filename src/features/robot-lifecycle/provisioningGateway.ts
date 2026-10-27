import {
  createInitialProvisioningState,
  reduceProvisioning,
  type DeviceProvisioningReport,
  type DeviceProvisioningReportType,
  type ProvisioningFailureCode,
  type ProvisioningPhase,
  type ProvisioningState,
// @ts-expect-error Node 24 verifier needs the explicit TypeScript entrypoint.
} from '../../domain/device-provisioning/index.ts';

export type ProvisioningDemoScenario =
  | 'success'
  | 'device_not_found'
  | 'identity_verification_failed'
  | 'ownership_invalidated'
  | 'wifi_password_error'
  | 'connection_interruption'
  | 'session_expired';

export type ProvisioningPreflightPhase = 'ready' | 'discovering' | 'wifi_form' | 'cancelled' | 'expired' | 'failed';
export type ProvisioningPresentationPhase = ProvisioningPreflightPhase | ProvisioningPhase;

export interface ProvisioningGatewayState {
  available: boolean;
  scenario: ProvisioningDemoScenario;
  preflight: ProvisioningPreflightPhase | null;
  domain: ProvisioningState | null;
  maskedNetworkName: string | null;
  connectionInterrupted: boolean;
  connectionRecovered: boolean;
  resultMessage: string | null;
}

export type ProvisioningGatewayEvent =
  | { type: 'start' }
  | { type: 'robot_discovered' }
  | { type: 'wifi_submitted'; ssid: string; hasPassword: boolean }
  | { type: 'device_authenticated' }
  | { type: 'credentials_sent' }
  | { type: 'advance_scenario' }
  | { type: 'resume_connection' }
  | { type: 'network_connected' }
  | { type: 'cloud_confirmed' }
  | { type: 'cancel' }
  | { type: 'expire' };

export interface ProvisioningPresentation {
  available: boolean;
  availabilityMessage: string | null;
  phase: ProvisioningPresentationPhase;
  maskedNetworkName: string | null;
  connectionInterrupted: boolean;
  connectionRecovered: boolean;
  credentialsSubmitted: boolean;
  resultMessage: string | null;
}

export interface ProvisioningGateway {
  create(options?: { scenario?: ProvisioningDemoScenario }): ProvisioningGatewayState;
  transition(state: ProvisioningGatewayState, event: ProvisioningGatewayEvent): ProvisioningGatewayState;
  present(state: ProvisioningGatewayState): ProvisioningPresentation;
}

const TERMINAL_PHASES = new Set<ProvisioningPresentationPhase>([
  'succeeded',
  'cancelled',
  'expired',
  'invalidated',
  'failed',
]);

export function maskNetworkName(ssid: string): string {
  const normalized = ssid.trim();
  if (normalized.length <= 2) return '••';
  if (normalized.length <= 4) return `${normalized[0]}${'•'.repeat(normalized.length - 1)}`;
  return `${normalized.slice(0, 2)}${'•'.repeat(normalized.length - 4)}${normalized.slice(-2)}`;
}

function phaseOf(state: ProvisioningGatewayState): ProvisioningPresentationPhase {
  if (state.domain) return state.domain.phase;
  return state.preflight ?? 'ready';
}

function requirePreflight(state: ProvisioningGatewayState, expected: ProvisioningPreflightPhase, event: string) {
  if (state.domain || state.preflight !== expected) throw new Error(`${event} is out of order from ${phaseOf(state)}`);
}

function requireDomain(state: ProvisioningGatewayState): ProvisioningState {
  if (!state.domain) throw new Error(`provisioning domain state is unavailable from ${phaseOf(state)}`);
  return state.domain;
}

function nextReport(
  domain: ProvisioningState,
  eventType: DeviceProvisioningReportType,
  failureCode: ProvisioningFailureCode | null = null,
): DeviceProvisioningReport {
  return {
    provisioning_id: domain.provisioning_id,
    challenge_id: domain.challenge_id,
    nonce_b64url: domain.nonce_b64url,
    device_id: domain.device_id,
    auth_session_id: domain.auth_session_id,
    authorization_epoch: domain.authorization_epoch,
    factory_reset_counter: domain.factory_reset_counter,
    device_event_sequence: domain.device_event_sequence + 1,
    event_type: eventType,
    failure_code: failureCode,
    reported_at_ms: domain.issued_at_ms + (domain.device_event_sequence + 1) * 1_000,
  };
}

function createGateway(available: boolean): ProvisioningGateway {
  return {
    create(options = {}) {
      return {
        available,
        scenario: options.scenario ?? 'success',
        preflight: 'ready',
        domain: null,
        maskedNetworkName: null,
        connectionInterrupted: false,
        connectionRecovered: false,
        resultMessage: null,
      };
    },

    transition(state, event) {
      if (!available || !state.available) {
        if (!state.available) return state;
        return {
          available: false,
          scenario: state.scenario,
          preflight: 'ready',
          domain: null,
          maskedNetworkName: null,
          connectionInterrupted: false,
          connectionRecovered: false,
          resultMessage: null,
        };
      }
      const phase = phaseOf(state);
      if (TERMINAL_PHASES.has(phase)) throw new Error(`provisioning terminal state is immutable: ${phase}`);

      if (event.type === 'cancel' || event.type === 'expire') {
        const nextPhase = event.type === 'cancel' ? 'cancelled' : 'expired';
        const resultMessage = event.type === 'cancel'
          ? state.domain?.credentials_written
            ? '模拟配网已取消；本演示未发送真实 Wi-Fi 密码。真机流程在此阶段可能仍在尝试联网。'
            : '模拟配网已取消，未发送真实 Wi-Fi 密码。'
          : '模拟会话已过期，请重新开始。';
        if (!state.domain) return { ...state, preflight: nextPhase, resultMessage };
        const transition = reduceProvisioning(state.domain, { type: event.type });
        return { ...state, domain: transition.state, resultMessage };
      }

      if (event.type === 'start') {
        requirePreflight(state, 'ready', event.type);
        return { ...state, preflight: 'discovering', resultMessage: null };
      }
      if (event.type === 'robot_discovered') {
        requirePreflight(state, 'discovering', event.type);
        if (state.scenario === 'device_not_found') {
          return { ...state, preflight: 'failed', resultMessage: '模拟结果：暂时没有找到附近的 DOSO 机器人，请检查准备步骤后重新查找。' };
        }
        return { ...state, preflight: 'wifi_form' };
      }
      if (event.type === 'wifi_submitted') {
        requirePreflight(state, 'wifi_form', event.type);
        if (!event.ssid.trim() || !event.hasPassword) throw new Error('Wi-Fi name and password are required');
        const issuedAtMs = Date.now();
        const deviceId = 'simulated-device-0001';
        return {
          ...state,
          preflight: null,
          domain: createInitialProvisioningState({
            provisioning_id: 'simulated-provisioning-0001',
            challenge_id: 'simulated-challenge-0001',
            nonce_b64url: 'c2ltdWxhdGVkLW5vbmNl',
            device_id: deviceId,
            owner_account_id: 'simulated-account',
            terminal_id: 'simulated-terminal',
            auth_session_id: 'simulated-auth-session',
            authorization_epoch: 1,
            factory_reset_counter: 0,
            issued_at_ms: issuedAtMs,
            expires_at_ms: issuedAtMs + 60_000,
          }),
          maskedNetworkName: maskNetworkName(event.ssid),
        };
      }

      const domain = requireDomain(state);
      if (event.type === 'device_authenticated') {
        if (state.scenario === 'identity_verification_failed') {
          const rejected = reduceProvisioning(domain, { type: 'device_authentication_failed' });
          return { ...state, domain: rejected.state, resultMessage: '模拟结果：无法确认这台机器人的身份，请勿继续配置并联系 DOSO 支持。' };
        }
        const transition = reduceProvisioning(domain, {
          type: 'device_authenticated',
          signature_verified: true,
          proof: {
            provisioning_id: domain.provisioning_id,
            challenge_id: domain.challenge_id,
            nonce_b64url: domain.nonce_b64url,
            device_id: domain.device_id,
            auth_session_id: domain.auth_session_id,
            authorization_epoch: domain.authorization_epoch,
            factory_reset_counter: domain.factory_reset_counter,
            proved_at_ms: domain.issued_at_ms + 500,
          },
        });
        if (state.scenario === 'ownership_invalidated') {
          const invalidated = reduceProvisioning(transition.state, { type: 'invalidate' });
          return { ...state, domain: invalidated.state, resultMessage: '模拟结果：这台机器人已不属于当前账户，请返回“我的设备”检查所有权。' };
        }
        return { ...state, domain: transition.state };
      }
      if (event.type === 'credentials_sent') {
        const transition = reduceProvisioning(domain, {
          type: 'credentials_authenticated',
          authenticated: true,
          account_id: domain.owner_account_id,
          terminal_id: domain.terminal_id,
          session_id: domain.auth_session_id,
        });
        if (!transition.effects.some((effect) => effect.type === 'write_credentials_once')) {
          throw new Error('provisioning credential write effect missing');
        }
        return { ...state, domain: transition.state };
      }
      if (event.type === 'resume_connection') {
        if (domain.phase !== 'connecting' || !state.connectionInterrupted) throw new Error('connection is not interrupted');
        return {
          ...state,
          connectionInterrupted: false,
          connectionRecovered: true,
          resultMessage: '模拟连接已恢复，正在继续。',
        };
      }
      if (event.type === 'network_connected') {
        if (state.connectionInterrupted) throw new Error('connection must be resumed first');
        const transition = reduceProvisioning(domain, {
          type: 'device_report',
          report: nextReport(domain, 'network_connected'),
          signature_verified: true,
        });
        return { ...state, domain: transition.state, resultMessage: null };
      }
      if (event.type === 'advance_scenario') {
        if (domain.phase !== 'connecting') throw new Error(`advance_scenario is out of order from ${domain.phase}`);
        if (state.scenario === 'session_expired') {
          const transition = reduceProvisioning(domain, { type: 'expire' });
          return { ...state, domain: transition.state, resultMessage: '模拟会话已过期，请重新开始。' };
        }
        if (state.scenario === 'wifi_password_error') {
          const transition = reduceProvisioning(domain, {
            type: 'device_report',
            report: nextReport(domain, 'failure_reported', 'wifi_authentication_failed'),
            signature_verified: true,
          });
          return { ...state, domain: transition.state, resultMessage: '模拟结果：Wi-Fi 密码错误，机器人未连接网络。' };
        }
        if (state.scenario === 'connection_interruption') {
          const transition = reduceProvisioning(domain, {
            type: 'device_report',
            report: nextReport(domain, 'network_disconnected'),
            signature_verified: true,
          });
          return {
            ...state,
            domain: transition.state,
            connectionInterrupted: true,
            resultMessage: '模拟连接中断，可恢复后继续。',
          };
        }
        const transition = reduceProvisioning(domain, {
          type: 'device_report',
          report: nextReport(domain, 'network_connected'),
          signature_verified: true,
        });
        return { ...state, domain: transition.state, resultMessage: null };
      }
      if (event.type === 'cloud_confirmed') {
        const transition = reduceProvisioning(domain, {
          type: 'online_confirmation',
          signature_verified: true,
          ownership_verified: true,
          confirmation: {
            provisioning_id: domain.provisioning_id,
            challenge_id: domain.challenge_id,
            nonce_b64url: domain.nonce_b64url,
            device_id: domain.device_id,
            auth_session_id: domain.auth_session_id,
            authorization_epoch: domain.authorization_epoch,
            factory_reset_counter: domain.factory_reset_counter,
            confirmed_at_ms: domain.issued_at_ms + 10_000,
          },
        });
        return { ...state, domain: transition.state, resultMessage: '模拟配网完成' };
      }

      return state;
    },

    present(state) {
      if (!available || !state.available) {
        return {
          available: false,
          availabilityMessage: '硬件连接尚未开放',
          phase: 'ready',
          maskedNetworkName: null,
          connectionInterrupted: false,
          connectionRecovered: false,
          credentialsSubmitted: false,
          resultMessage: null,
        };
      }
      return {
        available: true,
        availabilityMessage: null,
        phase: phaseOf(state),
        maskedNetworkName: state.maskedNetworkName,
        connectionInterrupted: state.connectionInterrupted,
        connectionRecovered: state.connectionRecovered,
        credentialsSubmitted: state.domain?.credentials_written ?? false,
        resultMessage: state.resultMessage,
      };
    },
  };
}

export const simulatedProvisioningGateway = createGateway(true);
export const unavailableProvisioningGateway = createGateway(false);
