/**
 * Brainstem integration readiness is a pure, non-secret projection.
 *
 * A successful GetControlStatus read is deliberately not enough to grant
 * motion authority. This module keeps the transport, device identity,
 * control-lease, executor and dead-man gates explicit so screens and future
 * command adapters cannot accidentally turn diagnostics into control.
 */

export type BrainstemGateState = 'ready' | 'pending' | 'blocked';

export type BrainstemGateId =
  | 'native-module'
  | 'endpoint'
  | 'readonly-observation'
  | 'device-identity'
  | 'remote-listener'
  | 'remote-mtls'
  | 'control-lease'
  | 'production-executor'
  | 'ack-deadman';

export type BrainstemDeviceIdentity = 'unbound' | 'bound-unverified' | 'verified';

export type BrainstemIntegrationInput = Readonly<{
  nativeModuleAvailable: boolean;
  endpointConfigured: boolean;
  readOnlyObservationFresh: boolean;
  deviceIdentity: BrainstemDeviceIdentity;
  clientIdentitySelected: boolean;
  remoteListenerConfirmed: boolean;
  remoteMtlsVerified: boolean;
  controlLeaseActive: boolean;
  productionExecutorConnected: boolean;
  ackContractReady: boolean;
  deadmanStopReady: boolean;
  // Paired local control is authorized by the server's exact leaf mapping;
  // it does not assert cloud ownership of this robot.
  pairedClientAuthorized?: boolean;
  transport?: 'tls' | 'lan-dev';
  lanDevConnectionConfirmed?: boolean;
}>;

export type BrainstemGate = Readonly<{
  id: BrainstemGateId;
  label: string;
  state: BrainstemGateState;
  detail: string;
}>;

export type BrainstemIntegrationReadiness = Readonly<{
  gates: readonly BrainstemGate[];
  readOnlyReady: boolean;
  controlReady: boolean;
  readOnlyLabel: string;
  controlLabel: string;
  controlBlockedReason: string;
}>;

export const BRAINSTEM_CONTROL_CONTRACT = Object.freeze([
  Object.freeze({ id: 'acquire-control', rpc: 'AcquireControl', scope: 'remote-mtls', safety: '租约' }),
  Object.freeze({ id: 'renew-control-lease', rpc: 'RenewControlLease', scope: 'remote-mtls', safety: '租约' }),
  Object.freeze({ id: 'release-control', rpc: 'ReleaseControl', scope: 'remote-mtls', safety: '零速确认' }),
  Object.freeze({ id: 'walk-checked', rpc: 'WalkChecked', scope: 'remote-mtls', safety: '序号与 ACK' }),
  Object.freeze({ id: 'stand-up', rpc: 'StandUp', scope: 'remote-mtls', safety: '姿态门禁' }),
  Object.freeze({ id: 'sit-down', rpc: 'SitDown', scope: 'remote-mtls', safety: '姿态门禁' }),
  Object.freeze({ id: 'switch-profile', rpc: 'SwitchProfile', scope: 'remote-mtls', safety: '设备状态' }),
  Object.freeze({ id: 'enable-motor', rpc: 'Enable', scope: 'remote-mtls', safety: '硬件级' }),
  Object.freeze({ id: 'disable-motor', rpc: 'Disable', scope: 'remote-mtls', safety: '硬件级' }),
] as const);

function gate(
  id: BrainstemGateId,
  label: string,
  state: BrainstemGateState,
  detail: string,
): BrainstemGate {
  return Object.freeze({ id, label, state, detail });
}

function identityState(identity: BrainstemDeviceIdentity): BrainstemGateState {
  return identity === 'verified' ? 'ready' : identity === 'bound-unverified' ? 'pending' : 'blocked';
}

/**
 * Builds a stable status for UI and preflight reports. No input contains a
 * token, certificate, private key or raw upstream error, and none is copied
 * into the result.
 */
export function getBrainstemIntegrationReadiness(
  input: BrainstemIntegrationInput,
): BrainstemIntegrationReadiness {
  const lanDev = input.transport === 'lan-dev';
  const lanReady = lanDev && input.lanDevConnectionConfirmed === true && !input.remoteMtlsVerified && !input.clientIdentitySelected && !input.pairedClientAuthorized;
  const gates: BrainstemGate[] = [
    gate(
      'native-module',
      'Android 原生 gRPC 模块',
      input.nativeModuleAvailable ? 'ready' : 'blocked',
      input.nativeModuleAvailable ? '模块已装入当前运行时。' : '当前安装包没有 DosoBrainstemGrpc，不回退假连接。',
    ),
    gate(
      'endpoint',
      '机器狗端点',
      input.endpointConfigured ? 'ready' : 'pending',
      input.endpointConfigured ? '已填写主机和 13145 端口。' : '尚未填写或核对机器狗 gRPC 地址。',
    ),
    gate(
      'readonly-observation',
      '只读状态读取',
      input.readOnlyObservationFresh ? 'ready' : 'pending',
      input.readOnlyObservationFresh ? '最近一次状态仍在有效期内。' : '尚未获得新鲜的 GetControlStatus 状态。',
    ),
    gate(
      'device-identity',
      lanDev ? '局域网开发会话（未认证）' : input.pairedClientAuthorized ? '本地配对授权' : '设备身份与账号归属',
      lanDev ? lanReady ? 'ready' : 'blocked' : input.pairedClientAuthorized ? 'ready' : identityState(input.deviceIdentity),
      lanDev ? '测试包使用本次临时会话身份，不证明证书身份或设备归属。' : input.pairedClientAuthorized ? '机器狗已确认客户端配对身份；未据此核验云端归属。' : input.deviceIdentity === 'verified'
        ? '设备身份挑战已完成。'
        : input.deviceIdentity === 'bound-unverified'
          ? '账户归属已绑定，仍等待机器狗制造身份签名。'
          : '尚未完成账户归属和设备身份验证。',
    ),
    gate(
      'remote-listener',
      '远程监听与来源许可',
      input.remoteListenerConfirmed ? 'ready' : 'blocked',
      input.remoteListenerConfirmed ? '已由现场证据确认非 loopback 监听和来源许可。' : '尚未确认机器狗对外监听、来源 IP allowlist 和服务职责。',
    ),
    gate(
      'remote-mtls',
      lanDev ? '局域网开发明文连接' : 'Brainstem 远程 mTLS',
      (lanDev ? lanReady : input.remoteMtlsVerified) ? 'ready' : 'blocked',
      lanDev ? '仅用于私有 IPv4 与服务端允许来源的测试连接；未验证 TLS 或客户端证书。' : input.remoteMtlsVerified
        ? '服务器证书、客户端身份和 principal 映射已验收。'
        : input.clientIdentitySelected
          ? '客户端身份已由系统选择，但服务器证书、来源许可和 principal 映射仍未验收。'
          : '尚未验收服务器证书、客户端证书和 principal 映射。',
    ),
    gate(
      'control-lease',
      '控制租约',
      input.controlLeaseActive ? 'ready' : 'blocked',
      input.controlLeaseActive ? '当前控制租约由受信执行器持有。' : '尚未取得行走控制权；姿态和动力操作按设备状态单独核验。',
    ),
    gate(
      'production-executor',
      '生产执行器',
      input.productionExecutorConnected ? 'ready' : 'blocked',
      input.productionExecutorConnected ? '已连接 Android 原生控制执行器。' : '尚未连接原生控制执行器。',
    ),
    gate(
      'ack-deadman',
      'ACK、序号与失联清零',
      input.ackContractReady && input.deadmanStopReady ? 'ready' : 'blocked',
      input.ackContractReady && input.deadmanStopReady
        ? '初始零速 ACK 已确认，原生看门狗已接入；硬件急停须单独验收。'
        : '等待零速 ACK 与原生看门狗连接，不代表已验收硬件急停。',
    ),
  ];

  const readOnlyReady = input.nativeModuleAvailable
    && input.endpointConfigured
    && input.readOnlyObservationFresh;
  const controlReady = readOnlyReady
    && (lanDev ? lanReady : input.deviceIdentity === 'verified' || input.pairedClientAuthorized === true)
    && input.remoteListenerConfirmed
    && (lanDev ? lanReady : input.remoteMtlsVerified)
    && input.controlLeaseActive
    && input.productionExecutorConnected
    && input.ackContractReady
    && input.deadmanStopReady;
  const firstBlocked = gates.find(current => current.state !== 'ready');

  return Object.freeze({
    gates: Object.freeze(gates),
    readOnlyReady,
    controlReady,
    readOnlyLabel: readOnlyReady ? '只读状态可用' : '只读状态未就绪',
    controlLabel: controlReady ? '真实控制前置条件已满足' : '真实控制保持锁定',
    controlBlockedReason: controlReady
      ? '控制前置条件已满足；仍需按现场安全授权逐项放行。'
      : firstBlocked
        ? `${firstBlocked.label}：${firstBlocked.detail}`
        : '控制前置条件未满足。',
  });
}
