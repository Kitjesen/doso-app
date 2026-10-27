export type FirmwarePhase =
  | "idle"
  | "scheduled"
  | "downloading"
  | "verifying"
  | "installing"
  | "rebooting"
  | "health_checking"
  | "succeeded"
  | "failed"
  | "rollback_pending"
  | "rolling_back"
  | "rolled_back"
  | "recovery_required"
  | "cancelled";

export type FirmwareSlotName = "A" | "B";

export interface FirmwareSlot {
  version: string | null;
  verified: boolean;
}

export interface DownloadJournalEntry {
  offset: number;
  length: number;
}

export interface RollbackPolicy {
  mode: "automatic" | "manual";
  healthTimeoutMs: number;
}

export type FirmwareFailureCode = "artifact_hash_mismatch" | "artifact_size_mismatch";

export interface FirmwareFailure {
  code: FirmwareFailureCode;
  safeMessage: string;
}

export interface FirmwareManifest {
  manifestVersion: number;
  releaseId: string;
  version: string;
  sequence: number;
  issuedAtMs: number;
  expiresAtMs: number;
  models: string[];
  hardwareRevisions: string[];
  minimumBootloaderVersion: string;
  minimumBatteryPercent: number;
  sha256: string;
  sizeBytes: number;
  rollbackPolicy: RollbackPolicy;
}

export interface SignedFirmwareManifest {
  manifest: FirmwareManifest;
  signatureB64url: string;
}

export interface FirmwareDeviceProfile {
  deviceId: string;
  model: string;
  hardwareRevision: string;
  bootloaderVersion: string;
  batteryPercent: number;
  online: boolean;
  taskRunning: boolean;
}

export interface FirmwareHealthProof {
  deviceId: string;
  releaseId: string;
  jobKey: string;
  progressSequence: number;
  bootId: string;
  activeSlot: FirmwareSlotName;
  version: string;
  checkedAtMs: number;
  healthy: boolean;
}

export interface RollbackProof {
  deviceId: string;
  releaseId: string;
  jobKey: string;
  progressSequence: number;
  targetSlot: FirmwareSlotName;
  targetVersion: string;
  bootId: string;
  rolledBackAtMs: number;
  outcome: "rolled_back" | "recovery_required";
}

export interface SignedRollbackProof {
  proof: RollbackProof;
  signatureB64url: string;
}

export interface FirmwareLifecycleState {
  deviceId: string;
  jobKey: string | null;
  phase: FirmwarePhase;
  installedVersion: string;
  manifest: FirmwareManifest | null;
  lastReleaseSequence: number;
  progressSequence: number;
  downloadOffset: number;
  downloadJournal: DownloadJournalEntry[];
  artifactVerified: boolean;
  activeSlot: FirmwareSlotName;
  targetSlot: FirmwareSlotName | null;
  lastKnownGoodSlot: FirmwareSlotName;
  slots: Record<FirmwareSlotName, FirmwareSlot>;
  installCount: number;
  bootIdBeforeInstall: string | null;
  activeBootId: string | null;
  healthStartedAtMs: number | null;
  healthDeadlineMs: number | null;
  failure: FirmwareFailure | null;
}

export type FirmwareEvent =
  | { type: "schedule"; progressSequence: number; manifest: FirmwareManifest; signatureVerified: boolean; nowMs: number; profile: FirmwareDeviceProfile }
  | { type: "download_chunk"; progressSequence: number; releaseId: string; offset: number; length: number }
  | { type: "start_verification"; progressSequence: number; releaseId: string }
  | { type: "finish_verification"; progressSequence: number; releaseId: string; sha256: string; sizeBytes: number }
  | { type: "install"; progressSequence: number; releaseId: string; currentBootId: string }
  | { type: "reboot"; progressSequence: number; releaseId: string; newBootId: string }
  | { type: "start_health_check"; progressSequence: number; releaseId: string; startedAtMs: number }
  | { type: "finish_health_check"; progressSequence: number; releaseId: string; proof: FirmwareHealthProof; signatureVerified: boolean; receivedAtMs: number }
  | { type: "health_timeout"; progressSequence: number; releaseId: string; nowMs: number }
  | { type: "stage_failure"; progressSequence: number; releaseId: string }
  | { type: "begin_rollback"; progressSequence: number; releaseId: string }
  | { type: "finish_rollback"; progressSequence: number; releaseId: string; proof: RollbackProof; signatureVerified: boolean }
  | { type: "cancel"; progressSequence: number; releaseId: string };

const HASH = /^[a-f0-9]{64}$/;
const SEMANTIC_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TERMINAL = new Set<FirmwarePhase>(["succeeded", "failed", "rolled_back", "recovery_required", "cancelled"]);
const RESTARTABLE = new Set<FirmwarePhase>(["succeeded", "failed", "rolled_back", "cancelled"]);

function compareVersions(left: string, right: string): number {
  if (!SEMANTIC_VERSION.test(left) || !SEMANTIC_VERSION.test(right)) throw new Error("invalid semantic version");
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  if ([...a, ...b].some((part) => !Number.isSafeInteger(part))) throw new Error("invalid semantic version");
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

const clone = <T>(value: T): T => structuredClone(value);
const inactiveSlot = (active: FirmwareSlotName): FirmwareSlotName => active === "A" ? "B" : "A";

export function initialFirmwareState(deviceId: string, installedVersion: string): FirmwareLifecycleState {
  if (!deviceId || !SEMANTIC_VERSION.test(installedVersion)) throw new Error("firmware device state invalid");
  return {
    deviceId,
    jobKey: null,
    phase: "idle",
    installedVersion,
    manifest: null,
    lastReleaseSequence: 0,
    progressSequence: 0,
    downloadOffset: 0,
    downloadJournal: [],
    artifactVerified: false,
    activeSlot: "A",
    targetSlot: null,
    lastKnownGoodSlot: "A",
    slots: {
      A: { version: installedVersion, verified: true },
      B: { version: null, verified: false },
    },
    installCount: 0,
    bootIdBeforeInstall: null,
    activeBootId: "boot-initial",
    healthStartedAtMs: null,
    healthDeadlineMs: null,
    failure: null,
  };
}

/**
 * Starts a new immutable OTA job while retaining durable release, boot and A/B
 * slot history. A recovery-required device must be serviced first.
 */
export function beginNextFirmwareJob(state: FirmwareLifecycleState): FirmwareLifecycleState {
  if (!RESTARTABLE.has(state.phase)) throw new Error("firmware job is not complete");
  return {
    ...clone(state),
    jobKey: null,
    phase: "idle",
    manifest: null,
    progressSequence: 0,
    downloadOffset: 0,
    downloadJournal: [],
    artifactVerified: false,
    targetSlot: null,
    installCount: 0,
    bootIdBeforeInstall: null,
    healthStartedAtMs: null,
    healthDeadlineMs: null,
    failure: null,
  };
}

export function reduceFirmwareLifecycle(state: FirmwareLifecycleState, event: FirmwareEvent): FirmwareLifecycleState {
  if (TERMINAL.has(state.phase)) throw new Error("firmware lifecycle terminal state is irreversible");

  if (event.type === "schedule") {
    if (!event.signatureVerified) throw new Error("firmware manifest signature rejected");
    const jobKey = `${state.deviceId}\u0000${event.manifest.releaseId}`;
    if (state.jobKey === jobKey) {
      if (JSON.stringify(state.manifest) !== JSON.stringify(event.manifest)) throw new Error("firmware idempotency conflict");
      return state;
    }
    if (state.phase !== "idle") throw new Error("concurrent firmware release rejected");
    requireNextSequence(state, event.progressSequence);
    validateManifest(state, event);
    return {
      ...state,
      jobKey,
      phase: "scheduled",
      manifest: clone(event.manifest),
      lastReleaseSequence: event.manifest.sequence,
      progressSequence: event.progressSequence,
    };
  }

  const manifest = state.manifest;
  if (!manifest || event.releaseId !== manifest.releaseId) throw new Error("firmware release binding rejected");

  if (event.type === "install" && state.phase === "installing") {
    if (event.progressSequence !== state.progressSequence || event.currentBootId !== state.bootIdBeforeInstall) {
      throw new Error("firmware install idempotency conflict");
    }
    return state;
  }

  requireNextSequence(state, event.progressSequence);

  if (event.type === "download_chunk") {
    if (state.phase !== "scheduled" && state.phase !== "downloading") throw new Error("firmware download phase rejected");
    if (!Number.isSafeInteger(event.offset)
      || event.offset !== state.downloadOffset
      || !Number.isSafeInteger(event.length)
      || event.length <= 0
      || event.offset + event.length > manifest.sizeBytes) {
      throw new Error("firmware download journal offset rejected");
    }
    return {
      ...state,
      phase: "downloading",
      progressSequence: event.progressSequence,
      downloadOffset: event.offset + event.length,
      downloadJournal: [...state.downloadJournal, { offset: event.offset, length: event.length }],
    };
  }

  if (event.type === "start_verification") {
    if (state.phase !== "downloading" || state.downloadOffset !== manifest.sizeBytes) throw new Error("firmware verification requires complete download");
    return { ...state, phase: "verifying", progressSequence: event.progressSequence };
  }

  if (event.type === "finish_verification") {
    if (state.phase !== "verifying") throw new Error("firmware verification phase rejected");
    if (event.sizeBytes !== manifest.sizeBytes) {
      return {
        ...state,
        phase: "failed",
        progressSequence: event.progressSequence,
        failure: { code: "artifact_size_mismatch", safeMessage: "The downloaded firmware size did not match its signed manifest." },
      };
    }
    if (event.sha256 !== manifest.sha256) {
      return {
        ...state,
        phase: "failed",
        progressSequence: event.progressSequence,
        failure: { code: "artifact_hash_mismatch", safeMessage: "The downloaded firmware failed integrity verification." },
      };
    }
    return { ...state, artifactVerified: true, progressSequence: event.progressSequence };
  }

  if (event.type === "install") {
    if (state.phase !== "verifying" || !state.artifactVerified) throw new Error("firmware install requires verified artifact");
    if (!event.currentBootId || event.currentBootId !== state.activeBootId) throw new Error("firmware install requires the current active boot identity");
    const targetSlot = inactiveSlot(state.activeSlot);
    const slots = clone(state.slots);
    slots[targetSlot] = { version: manifest.version, verified: true };
    return {
      ...state,
      phase: "installing",
      progressSequence: event.progressSequence,
      targetSlot,
      slots,
      installCount: state.installCount + 1,
      bootIdBeforeInstall: event.currentBootId,
    };
  }

  if (event.type === "reboot") {
    if (state.phase !== "installing" || !state.targetSlot || !state.slots[state.targetSlot].verified) throw new Error("firmware reboot requires verified installed slot");
    if (!event.newBootId || event.newBootId === state.activeBootId) throw new Error("firmware reboot identity must change");
    return {
      ...state,
      phase: "rebooting",
      progressSequence: event.progressSequence,
      activeSlot: state.targetSlot,
      activeBootId: event.newBootId,
      installedVersion: manifest.version,
    };
  }

  if (event.type === "start_health_check") {
    if (state.phase !== "rebooting") throw new Error("firmware health check requires reboot");
    if (!Number.isSafeInteger(event.startedAtMs) || event.startedAtMs < 0) throw new Error("firmware health-check clock invalid");
    const healthDeadlineMs = event.startedAtMs + manifest.rollbackPolicy.healthTimeoutMs;
    if (!Number.isSafeInteger(healthDeadlineMs)) throw new Error("firmware health-check deadline invalid");
    return { ...state, phase: "health_checking", progressSequence: event.progressSequence, healthStartedAtMs: event.startedAtMs, healthDeadlineMs };
  }

  if (event.type === "finish_health_check") {
    if (state.phase !== "health_checking" || state.healthStartedAtMs === null || state.healthDeadlineMs === null || !state.jobKey || !state.activeBootId) {
      throw new Error("firmware health check phase rejected");
    }
    if (!Number.isSafeInteger(event.receivedAtMs) || event.receivedAtMs < 0) throw new Error("firmware health-proof receive clock invalid");
    const proof = event.proof;
    const proofMatches = event.signatureVerified
      && proof.healthy
      && proof.deviceId === state.deviceId
      && proof.releaseId === manifest.releaseId
      && proof.jobKey === state.jobKey
      && proof.progressSequence === event.progressSequence
      && proof.bootId === state.activeBootId
      && proof.activeSlot === state.activeSlot
      && proof.version === state.installedVersion
      && proof.version === manifest.version
      && Number.isSafeInteger(proof.checkedAtMs)
      && proof.checkedAtMs >= state.healthStartedAtMs
      && proof.checkedAtMs <= event.receivedAtMs
      && event.receivedAtMs >= state.healthStartedAtMs
      && event.receivedAtMs < state.healthDeadlineMs;
    if (!proofMatches) {
      return { ...state, phase: "rollback_pending", progressSequence: event.progressSequence, healthStartedAtMs: null, healthDeadlineMs: null };
    }
    return {
      ...state,
      phase: "succeeded",
      progressSequence: event.progressSequence,
      lastKnownGoodSlot: state.activeSlot,
      healthStartedAtMs: null,
      healthDeadlineMs: null,
    };
  }

  if (event.type === "health_timeout") {
    if (state.phase !== "health_checking" || state.healthDeadlineMs === null) throw new Error("firmware health timeout phase rejected");
    if (!Number.isSafeInteger(event.nowMs) || event.nowMs < state.healthDeadlineMs) throw new Error("firmware health timeout not reached");
    return { ...state, phase: "rollback_pending", progressSequence: event.progressSequence, healthStartedAtMs: null, healthDeadlineMs: null };
  }

  if (event.type === "stage_failure") {
    if (state.phase !== "installing" && state.phase !== "rebooting" && state.phase !== "health_checking") throw new Error("firmware failure stage rejected");
    return { ...state, phase: "rollback_pending", progressSequence: event.progressSequence, healthStartedAtMs: null, healthDeadlineMs: null };
  }

  if (event.type === "begin_rollback") {
    if (state.phase !== "rollback_pending") throw new Error("firmware rollback requires pending state");
    if (!state.slots[state.lastKnownGoodSlot].verified) throw new Error("firmware last-known-good slot is not verified");
    return { ...state, phase: "rolling_back", progressSequence: event.progressSequence };
  }

  if (event.type === "finish_rollback") {
    if (state.phase !== "rolling_back") throw new Error("firmware rollback is not running");
    const slot = state.slots[state.lastKnownGoodSlot];
    const proof = event.proof;
    const proofMatches = event.signatureVerified
      && proof.outcome === "rolled_back"
      && proof.deviceId === state.deviceId
      && proof.releaseId === manifest.releaseId
      && proof.jobKey === state.jobKey
      && proof.progressSequence === event.progressSequence
      && proof.targetSlot === state.lastKnownGoodSlot
      && proof.targetVersion === slot.version
      && Boolean(proof.bootId)
      && proof.bootId !== state.activeBootId
      && Number.isSafeInteger(proof.rolledBackAtMs)
      && proof.rolledBackAtMs >= 0
      && slot.verified
      && Boolean(slot.version);
    if (!proofMatches) {
      return { ...state, phase: "recovery_required", progressSequence: event.progressSequence, healthStartedAtMs: null, healthDeadlineMs: null };
    }
    return {
      ...state,
      phase: "rolled_back",
      progressSequence: event.progressSequence,
      activeSlot: state.lastKnownGoodSlot,
      installedVersion: slot.version!,
      activeBootId: proof.bootId,
      healthStartedAtMs: null,
      healthDeadlineMs: null,
    };
  }

  if (state.phase !== "scheduled" && state.phase !== "downloading") throw new Error("firmware cancel allowed only scheduled or downloading");
  return { ...state, phase: "cancelled", progressSequence: event.progressSequence };
}

function requireNextSequence(state: FirmwareLifecycleState, sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence !== state.progressSequence + 1) throw new Error("firmware progress sequence must increase exactly once");
}

function validateManifest(state: FirmwareLifecycleState, event: Extract<FirmwareEvent, { type: "schedule" }>): void {
  const manifest = event.manifest;
  const profile = event.profile;
  if (!Number.isSafeInteger(event.nowMs) || event.nowMs < 0) throw new Error("firmware authoritative clock invalid");
  if (manifest.manifestVersion !== 1) throw new Error("unsupported firmware manifest version");
  if (!manifest.releaseId.trim()) throw new Error("firmware release identifier invalid");
  if (!Number.isSafeInteger(manifest.issuedAtMs) || manifest.issuedAtMs > event.nowMs) throw new Error("firmware manifest issued in future");
  if (!Number.isSafeInteger(manifest.expiresAtMs) || event.nowMs > manifest.expiresAtMs || manifest.expiresAtMs <= manifest.issuedAtMs) throw new Error("firmware manifest expired");
  if (manifest.rollbackPolicy.mode !== "automatic"
    || !Number.isSafeInteger(manifest.rollbackPolicy.healthTimeoutMs)
    || manifest.rollbackPolicy.healthTimeoutMs <= 0) {
    throw new Error("firmware rollback policy rejected");
  }
  if (profile.deviceId !== state.deviceId) throw new Error("firmware device binding rejected");
  if (!manifest.models.includes(profile.model)) throw new Error("firmware model incompatible");
  if (!manifest.hardwareRevisions.includes(profile.hardwareRevision)) throw new Error("firmware hardware incompatible");
  if (compareVersions(profile.bootloaderVersion, manifest.minimumBootloaderVersion) < 0) throw new Error("firmware bootloader incompatible");
  if (compareVersions(manifest.version, state.installedVersion) <= 0) throw new Error("firmware version must advance");
  if (!Number.isSafeInteger(manifest.sequence) || manifest.sequence <= state.lastReleaseSequence) throw new Error("firmware release sequence must increase");
  if (!HASH.test(manifest.sha256) || !Number.isSafeInteger(manifest.sizeBytes) || manifest.sizeBytes <= 0) throw new Error("firmware artifact metadata invalid");
  if (!profile.online) throw new Error("firmware update requires online device");
  if (!Number.isFinite(profile.batteryPercent)
    || profile.batteryPercent < 0
    || profile.batteryPercent > 100
    || !Number.isSafeInteger(manifest.minimumBatteryPercent)
    || manifest.minimumBatteryPercent < 0
    || manifest.minimumBatteryPercent > 100
    || profile.batteryPercent < manifest.minimumBatteryPercent) {
    throw new Error("firmware update battery invalid or too low");
  }
  if (profile.taskRunning) throw new Error("firmware update rejected while task is running");
}
