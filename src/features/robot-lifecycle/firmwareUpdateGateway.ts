import {
  initialFirmwareState,
  reduceFirmwareLifecycle,
  type FirmwareDeviceProfile,
  type FirmwareLifecycleState,
  type FirmwareManifest,
  type FirmwarePhase,
  type RollbackProof,
// @ts-expect-error Node 24 verifier needs the explicit TypeScript entrypoint.
} from '../../domain/firmware-lifecycle/index.ts';

export type FirmwareOutcome = 'succeeded' | 'rolled_back' | 'recovery_required';
export type FirmwareStatus = 'ready' | 'running' | 'cancelled' | FirmwareOutcome | 'failed' | 'hardware_unavailable';

export const FIRMWARE_PHASE_LABELS: Record<FirmwarePhase, string> = {
  idle: '准备',
  scheduled: '准备更新',
  downloading: '下载更新包',
  verifying: '校验更新包',
  installing: '安装固件',
  rebooting: '机器人重启',
  health_checking: '检查运行状态',
  succeeded: '更新完成',
  failed: '更新失败',
  rollback_pending: '准备回滚',
  rolling_back: '正在回滚',
  rolled_back: '已自动回滚',
  recovery_required: '需要人工恢复',
  cancelled: '更新已取消',
};

export interface FirmwareEligibilityCheck {
  action: string;
  key: 'online' | 'battery' | 'idle';
  label: string;
  passed: boolean;
}

export interface FirmwareEligibility {
  checks: FirmwareEligibilityCheck[];
  eligible: boolean;
}

export interface FirmwareUpdateGatewayState {
  available: boolean;
  scenario: FirmwareOutcome;
  domain: FirmwareLifecycleState | null;
  profile: FirmwareDeviceProfile | null;
  manifest: FirmwareManifest | null;
}

export interface FirmwareUpdatePresentation {
  status: FirmwareStatus;
  phase: FirmwarePhase | null;
  message: string;
  currentVersion: string | null;
  targetVersion: string | null;
  eligibility: FirmwareEligibility;
  progress: { label: string; percent: number | null };
  diagnosticCode: string | null;
}

export interface FirmwareUpdateGateway {
  create(options?: {
    batteryPercent?: number;
    currentVersion?: string;
    deviceId?: string;
    online?: boolean;
    scenario?: FirmwareOutcome;
    taskRunning?: boolean;
  }): FirmwareUpdateGatewayState;
  start(state: FirmwareUpdateGatewayState): FirmwareUpdateGatewayState;
  advance(state: FirmwareUpdateGatewayState): FirmwareUpdateGatewayState;
  cancel(state: FirmwareUpdateGatewayState): FirmwareUpdateGatewayState;
  present(state: FirmwareUpdateGatewayState): FirmwareUpdatePresentation;
}

const ARTIFACT_SIZE_BYTES = 18_600_000;
const DOWNLOAD_CHUNK_BYTES = ARTIFACT_SIZE_BYTES / 4;
const MANIFEST_ISSUED_AT_MS = 1_700_000_000_000;

function nextPatchVersion(version: string): string {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new Error('firmware current version invalid');
  const patch = Number(match[3]);
  if (!Number.isSafeInteger(patch + 1)) throw new Error('firmware target version invalid');
  return `${match[1]}.${match[2]}.${patch + 1}`;
}

function evaluateEligibility(profile: FirmwareDeviceProfile, manifest: FirmwareManifest): FirmwareEligibility {
  const threshold = manifest.minimumBatteryPercent;
  const checks: FirmwareEligibilityCheck[] = [
    { action: '请先连接机器人，再重新检查。', key: 'online', label: '机器人在线', passed: profile.online },
    {
      action: `请将机器人充电至 ${threshold}% 以上。`,
      key: 'battery',
      label: `电量至少 ${threshold}%`,
      passed: profile.batteryPercent >= threshold,
    },
    { action: '请停止当前任务，等待机器人空闲。', key: 'idle', label: '当前没有执行任务', passed: !profile.taskRunning },
  ];
  return { checks, eligible: checks.every((check) => check.passed) };
}

function requireRunnable(state: FirmwareUpdateGatewayState) {
  if (!state.available || !state.domain || !state.profile || !state.manifest) {
    throw new Error('硬件连接尚未开放，不能启动真实设备更新。');
  }
  return {
    domain: state.domain,
    profile: state.profile,
    manifest: state.manifest,
  };
}

function nextSequence(domain: FirmwareLifecycleState): number {
  return domain.progressSequence + 1;
}

function requireRelease(domain: FirmwareLifecycleState): FirmwareManifest {
  if (!domain.manifest) throw new Error('firmware release is not scheduled');
  return domain.manifest;
}

function createGateway(available: boolean): FirmwareUpdateGateway {
  return {
    create(options = {}) {
      if (!available) {
        return { available: false, scenario: options.scenario ?? 'succeeded', domain: null, profile: null, manifest: null };
      }
      const currentVersion = options.currentVersion ?? '0.0.1';
      const targetVersion = nextPatchVersion(currentVersion);
      const deviceId = options.deviceId ?? 'simulated-device-0001';
      const manifest: FirmwareManifest = {
        manifestVersion: 1,
        releaseId: `simulated-release-${targetVersion}`,
        version: targetVersion,
        sequence: 1,
        issuedAtMs: MANIFEST_ISSUED_AT_MS,
        expiresAtMs: MANIFEST_ISSUED_AT_MS + 86_400_000,
        models: ['DOSO Robot Demo'],
        hardwareRevisions: ['demo-rev-a'],
        minimumBootloaderVersion: '0.0.1',
        minimumBatteryPercent: 40,
        sha256: 'a'.repeat(64),
        sizeBytes: ARTIFACT_SIZE_BYTES,
        rollbackPolicy: { mode: 'automatic', healthTimeoutMs: 30_000 },
      };
      return {
        available: true,
        scenario: options.scenario ?? 'succeeded',
        domain: initialFirmwareState(deviceId, currentVersion),
        profile: {
          deviceId,
          model: 'DOSO Robot Demo',
          hardwareRevision: 'demo-rev-a',
          bootloaderVersion: '0.0.1',
          batteryPercent: options.batteryPercent ?? 82,
          online: options.online ?? true,
          taskRunning: options.taskRunning ?? false,
        },
        manifest,
      };
    },

    start(state) {
      if (!available) throw new Error('硬件连接尚未开放，不能启动真实设备更新。');
      const { domain, profile, manifest } = requireRunnable(state);
      if (!evaluateEligibility(profile, manifest).eligible) throw new Error('机器人尚未满足更新资格。');
      return {
        ...state,
        domain: reduceFirmwareLifecycle(domain, {
          type: 'schedule',
          progressSequence: nextSequence(domain),
          manifest,
          signatureVerified: true,
          nowMs: MANIFEST_ISSUED_AT_MS + 1_000,
          profile,
        }),
      };
    },

    advance(state) {
      if (!available) throw new Error('硬件连接尚未开放，不能推进真实设备更新。');
      const { domain } = requireRunnable(state);
      const manifest = requireRelease(domain);

      if (domain.phase === 'scheduled' || domain.phase === 'downloading') {
        if (domain.downloadOffset < manifest.sizeBytes) {
          const length = Math.min(DOWNLOAD_CHUNK_BYTES, manifest.sizeBytes - domain.downloadOffset);
          return {
            ...state,
            domain: reduceFirmwareLifecycle(domain, {
              type: 'download_chunk',
              progressSequence: nextSequence(domain),
              releaseId: manifest.releaseId,
              offset: domain.downloadOffset,
              length,
            }),
          };
        }
        return {
          ...state,
          domain: reduceFirmwareLifecycle(domain, {
            type: 'start_verification',
            progressSequence: nextSequence(domain),
            releaseId: manifest.releaseId,
          }),
        };
      }

      if (domain.phase === 'verifying') {
        const verified = domain.artifactVerified
          ? domain
          : reduceFirmwareLifecycle(domain, {
            type: 'finish_verification',
            progressSequence: nextSequence(domain),
            releaseId: manifest.releaseId,
            sha256: manifest.sha256,
            sizeBytes: manifest.sizeBytes,
          });
        return {
          ...state,
          domain: reduceFirmwareLifecycle(verified, {
            type: 'install',
            progressSequence: nextSequence(verified),
            releaseId: manifest.releaseId,
            currentBootId: verified.activeBootId ?? '',
          }),
        };
      }

      if (domain.phase === 'installing') {
        return {
          ...state,
          domain: reduceFirmwareLifecycle(domain, {
            type: 'reboot',
            progressSequence: nextSequence(domain),
            releaseId: manifest.releaseId,
            newBootId: 'simulated-boot-updated',
          }),
        };
      }

      if (domain.phase === 'rebooting') {
        return {
          ...state,
          domain: reduceFirmwareLifecycle(domain, {
            type: 'start_health_check',
            progressSequence: nextSequence(domain),
            releaseId: manifest.releaseId,
            startedAtMs: MANIFEST_ISSUED_AT_MS + 20_000,
          }),
        };
      }

      if (domain.phase === 'health_checking') {
        if (!domain.jobKey || !domain.activeBootId || domain.healthStartedAtMs === null) {
          throw new Error('firmware health state incomplete');
        }
        const proofSequence = nextSequence(domain);
        const checkedAtMs = domain.healthStartedAtMs + 1_000;
        let next = reduceFirmwareLifecycle(domain, {
          type: 'finish_health_check',
          progressSequence: proofSequence,
          releaseId: manifest.releaseId,
          proof: {
            deviceId: domain.deviceId,
            releaseId: manifest.releaseId,
            jobKey: domain.jobKey,
            progressSequence: proofSequence,
            bootId: domain.activeBootId,
            activeSlot: domain.activeSlot,
            version: domain.installedVersion,
            checkedAtMs,
            healthy: state.scenario === 'succeeded',
          },
          signatureVerified: true,
          receivedAtMs: checkedAtMs + 500,
        });
        if (state.scenario === 'succeeded') return { ...state, domain: next };

        return { ...state, domain: next };
      }

      if (domain.phase === 'rollback_pending') {
        return {
          ...state,
          domain: reduceFirmwareLifecycle(domain, {
          type: 'begin_rollback',
          progressSequence: nextSequence(domain),
          releaseId: manifest.releaseId,
          }),
        };
      }

      if (domain.phase === 'rolling_back') {
        const rollbackSequence = nextSequence(domain);
        const targetVersion = domain.slots[domain.lastKnownGoodSlot].version;
        if (!domain.jobKey || !targetVersion) throw new Error('firmware rollback state incomplete');
        const proof: RollbackProof = {
          deviceId: domain.deviceId,
          releaseId: manifest.releaseId,
          jobKey: domain.jobKey,
          progressSequence: rollbackSequence,
          targetSlot: domain.lastKnownGoodSlot,
          targetVersion,
          bootId: 'simulated-boot-rollback',
          rolledBackAtMs: MANIFEST_ISSUED_AT_MS + 25_000,
          outcome: state.scenario === 'rolled_back' ? 'rolled_back' : 'recovery_required',
        };
        return {
          ...state,
          domain: reduceFirmwareLifecycle(domain, {
            type: 'finish_rollback',
            progressSequence: rollbackSequence,
            releaseId: manifest.releaseId,
            proof,
            signatureVerified: state.scenario === 'rolled_back',
          }),
        };
      }

      throw new Error(`firmware phase cannot advance: ${domain.phase}`);
    },

    cancel(state) {
      if (!available) throw new Error('硬件连接尚未开放，不能取消真实设备更新。');
      const { domain } = requireRunnable(state);
      const manifest = requireRelease(domain);
      return {
        ...state,
        domain: reduceFirmwareLifecycle(domain, {
          type: 'cancel',
          progressSequence: nextSequence(domain),
          releaseId: manifest.releaseId,
        }),
      };
    },

    present(state) {
      if (!available || !state.available || !state.domain || !state.profile || !state.manifest) {
        return {
          status: 'hardware_unavailable',
          phase: null,
          message: '硬件连接尚未开放，当前无法更新真实机器人。',
          currentVersion: null,
          targetVersion: null,
          eligibility: { checks: [], eligible: false },
          progress: { label: '硬件连接尚未开放', percent: null },
          diagnosticCode: null,
        };
      }

      const { domain, profile, manifest } = state;
      const status: FirmwareStatus = domain.phase === 'idle'
        ? 'ready'
        : domain.phase === 'succeeded'
          ? 'succeeded'
          : domain.phase === 'rolled_back'
            ? 'rolled_back'
            : domain.phase === 'recovery_required'
              ? 'recovery_required'
              : domain.phase === 'cancelled'
                ? 'cancelled'
                : domain.phase === 'failed'
                  ? 'failed'
                  : 'running';
      const percent = domain.phase === 'downloading'
        ? Math.round((domain.downloadOffset / manifest.sizeBytes) * 100)
        : null;
      const messages: Record<FirmwarePhase, string> = {
        idle: '开发演示已就绪；演示不会更新真实机器人。',
        scheduled: '演示更新已排队。',
        downloading: '正在下载演示更新包。',
        verifying: '正在校验演示更新包完整性。',
        installing: '正在演示写入备用固件分区。',
        rebooting: '正在演示机器人重启。',
        health_checking: '正在演示检查机器人运行状态。',
        succeeded: '演示更新成功；没有更新真实机器人。',
        failed: domain.failure?.safeMessage ?? '演示更新失败。',
        rollback_pending: '健康检查未通过，正在准备自动回滚。',
        rolling_back: '正在演示恢复上一个已验证固件。',
        rolled_back: `健康检查未通过，演示已自动回滚到 ${domain.installedVersion}。`,
        recovery_required: '演示恢复失败。请停止使用机器人并联系 DOSO 支持，提供下方诊断编号。',
        cancelled: '演示更新已取消。',
      };
      return {
        status,
        phase: domain.phase,
        message: messages[domain.phase],
        currentVersion: domain.phase === 'recovery_required'
          ? '未知（恢复失败）'
          : domain.phase === 'idle'
            ? domain.installedVersion
            : domain.slots[domain.lastKnownGoodSlot].version,
        targetVersion: manifest.version,
        eligibility: evaluateEligibility(profile, manifest),
        progress: {
          label: percent === null ? FIRMWARE_PHASE_LABELS[domain.phase] : `下载进度 ${percent}%`,
          percent,
        },
        diagnosticCode: domain.phase === 'recovery_required' ? 'DOSO-OTA-••••-7A2C' : null,
      };
    },
  };
}

export const simulatedFirmwareUpdateGateway = createGateway(true);
export const unavailableFirmwareUpdateGateway = createGateway(false);
