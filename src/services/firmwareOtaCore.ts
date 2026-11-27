export interface CloudOtaDevice {
  id: string;
  displayName: string;
  serialNumber: string | null;
  modelCode: string | null;
  firmwareVersion: string | null;
  isSimulated: boolean;
}

export interface CloudOtaDeviceStatus {
  deviceId: string;
  reportedAtMs?: number;
  lastSeenAgeMs?: number;
  bootId?: string;
  firmwareVersion?: string;
  releaseId?: string;
  brainstemReady?: boolean;
  strategyReady?: boolean;
  activeProfile?: string;
  slots?: Record<string, string>;
}

export interface CloudOtaRelease {
  releaseId: string;
  version: string;
  sequence: number;
  channel: string;
  model: string;
  hardwareRevision: string;
  artifactSizeBytes: number;
  artifactSha256: string;
  artifactType: 'brainstem_release' | 'policy_package' | 'component_release' | 'release_bundle' | string;
  policySlot?: string;
  component?: string;
  adminOnly?: boolean;
}

export interface CloudOtaInspectResult {
  deviceId: string;
  deviceName: string;
  serialNumber: string | null;
  isAdmin: boolean;
  registeredForOta: boolean;
  status: CloudOtaDeviceStatus | null;
  releases: CloudOtaRelease[];
}

export interface CloudOtaJob {
  jobId: string;
  deviceId: string;
  releaseId: string;
  idempotencyKey: string;
  phase: string;
  createdAtMs?: number;
  updatedAtMs?: number;
  bytesDownloaded?: number;
  totalBytes?: number | null;
  targetVersion?: string | null;
  currentVersion?: string | null;
  message?: string | null;
}

export interface FirmwareOtaTransport {
  accessToken: string;
  baseUrl: string;
  publishableKey?: string;
  fetchImpl?: typeof fetch;
}

const PHASE_LABELS: Record<string, string> = {
  idle: '就绪',
  scheduled: '等待下载',
  downloading: '下载中',
  waiting_safe_window: '待安全条件',
  verifying: '校验中',
  installing: '安装中',
  rebooting: '重启中',
  health_checking: '自检中',
  succeeded: '更新完成',
  failed: '更新失败',
  rollback_pending: '准备回滚',
  rolling_back: '回滚中',
  rolled_back: '已自动回滚',
  recovery_required: '需人工恢复',
  cancelled: '已取消',
};

const TERMINAL_PHASES = new Set([
  'succeeded',
  'failed',
  'rolled_back',
  'recovery_required',
  'cancelled',
]);

export function formatFirmwarePhase(phase: string | null | undefined): string {
  if (!phase) return '未知状态';
  return PHASE_LABELS[phase] ?? phase;
}

export function isTerminalOtaPhase(phase: string | null | undefined): boolean {
  return Boolean(phase && TERMINAL_PHASES.has(phase));
}

export function canCancelOtaPhase(phase: string | null | undefined): boolean {
  return phase === 'scheduled' || phase === 'downloading' || phase === 'waiting_safe_window';
}

export function formatFirmwareBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}

export function describeReleaseTitle(release: CloudOtaRelease): string {
  if (release.artifactType === 'release_bundle') return '整机系统更新';
  if (release.artifactType === 'brainstem_release') return '主控系统更新';
  if (release.artifactType === 'policy_package') return '步态策略更新';
  if (release.artifactType === 'component_release') {
    const comp = (release.component ?? '').toLowerCase();
    if (comp === 'voice') return '语音交互更新';
    if (comp === 'brainstem') return '主控系统更新';
    if (comp === 'fw-esp32') return '外设板固件';
    if (comp === 'fw-bms') return '电池管理固件';
    if (comp === 'ota') return '更新服务组件';
  }
  return '系统组件更新';
}

export function partitionFirmwareReleases(releases: readonly CloudOtaRelease[]): {
  primaryRelease: CloudOtaRelease | null;
  userReleases: CloudOtaRelease[];
  adminHardwareReleases: CloudOtaRelease[];
} {
  const userReleases = releases
    .filter((r) => !r.adminOnly)
    .slice()
    .sort((a, b) => b.sequence - a.sequence);
  const adminHardwareReleases = releases
    .filter((r) => Boolean(r.adminOnly))
    .slice()
    .sort((a, b) => b.sequence - a.sequence);
  const bundle = userReleases.find((r) => r.artifactType === 'release_bundle');
  const primaryRelease = bundle ?? userReleases[0] ?? null;
  return { primaryRelease, userReleases, adminHardwareReleases };
}

export function isDeviceOnlineFromStatus(status: CloudOtaDeviceStatus | null): boolean {
  if (!status) return false;
  if (typeof status.lastSeenAgeMs === 'number') {
    return status.lastSeenAgeMs >= 0 && status.lastSeenAgeMs <= 90_000;
  }
  return Boolean(status.brainstemReady);
}

export async function callFirmwareOtaEndpoint<T>(
  payload: Record<string, unknown>,
  transport: FirmwareOtaTransport,
): Promise<T> {
  const baseUrl = transport.baseUrl.replace(/\/+$/, '');
  if (!baseUrl) throw new Error('未连接云服务');
  if (!transport.accessToken) throw new Error('请先登录账号');

  const fetchImpl = transport.fetchImpl ?? globalThis.fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${transport.accessToken}`,
    'content-type': 'application/json',
    Accept: 'application/json',
  };
  if (transport.publishableKey) {
    headers.apikey = transport.publishableKey;
  }

  const response = await fetchImpl(`${baseUrl}/functions/v1/firmware-ota`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => null)) as
    | { error?: { message?: string; code?: string } }
    | T
    | null;
  if (!response.ok) {
    const code = data && typeof data === 'object' && 'error' in data
      ? data.error?.code
      : undefined;
    if (response.status === 401) throw new Error('登录状态已失效');
    if (response.status === 403 && code === 'firmware_admin_only') {
      throw new Error('仅管理员可升级底层固件');
    }
    if (response.status === 403) throw new Error('无权操作该设备');
    throw new Error('更新请求失败');
  }
  return data as T;
}
