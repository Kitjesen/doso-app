import * as nodeCrypto from "node:crypto";
import { generateKeyPairSync, sign, verify, type KeyObject } from "node:crypto";
// @ts-expect-error Node type stripping requires explicit TypeScript extensions.
import { beginNextFirmwareJob, initialFirmwareState, reduceFirmwareLifecycle, type FirmwareDeviceProfile, type FirmwareHealthProof, type FirmwareLifecycleState, type FirmwareManifest, type RollbackProof, type SignedFirmwareManifest } from "../../src/domain/firmware-lifecycle/index.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(canonical(value));
function decode(value: string): Uint8Array { const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="); return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)); }
const corruptSignature = (value: string): string => `${value[0] === "x" ? "y" : "x"}${value.slice(1)}`;
const createHash = (nodeCrypto as unknown as { createHash(name: "sha256"): { update(value: Uint8Array): { digest(encoding: "hex"): string } } }).createHash;

export interface FirmwareSimulatorOptions extends FirmwareDeviceProfile { installedVersion: string }
export interface FirmwareManifestInput { releaseId: string; version: string; sequence: number; payload: Uint8Array; models?: string[]; hardwareRevisions?: string[]; minimumBootloaderVersion?: string; minimumBatteryPercent?: number; issuedAtMs?: number; expiresAtMs?: number }
export interface FirmwareHealthCheckInput { healthy: boolean; proofOverrides?: Partial<FirmwareHealthProof>; tamperSignature?: boolean; rollbackSucceeds?: boolean; tamperRollbackProof?: boolean }
export interface FirmwareStageFailureInput { rollbackSucceeds?: boolean; tamperRollbackProof?: boolean }

export class FirmwareLifecycleSimulator {
  readonly publisherPublicKeyPem: string;
  private readonly publisherPrivateKey: KeyObject; private readonly devicePublicKeyPem: string; private readonly devicePrivateKey: KeyObject;
  private readonly profile: FirmwareDeviceProfile; private state: FirmwareLifecycleState; private downloaded = new Uint8Array(); private nowMs = 1_800_000_000_000; private bootCounter = 0;

  constructor(options: FirmwareSimulatorOptions) {
    const publisher = generateKeyPairSync("ed25519"); this.publisherPrivateKey = publisher.privateKey; this.publisherPublicKeyPem = publisher.publicKey.export({ type: "spki", format: "pem" }).toString();
    const device = generateKeyPairSync("ed25519"); this.devicePrivateKey = device.privateKey; this.devicePublicKeyPem = device.publicKey.export({ type: "spki", format: "pem" }).toString();
    const { installedVersion, ...profile } = options; this.profile = { ...profile }; this.state = initialFirmwareState(options.deviceId, installedVersion);
  }

  createSignedManifest(input: FirmwareManifestInput): SignedFirmwareManifest {
    const manifest: FirmwareManifest = { manifestVersion: 1, releaseId: input.releaseId, version: input.version, sequence: input.sequence, issuedAtMs: input.issuedAtMs ?? this.nowMs, expiresAtMs: input.expiresAtMs ?? this.nowMs + 60_000, models: input.models ?? [this.profile.model], hardwareRevisions: input.hardwareRevisions ?? [this.profile.hardwareRevision], minimumBootloaderVersion: input.minimumBootloaderVersion ?? this.profile.bootloaderVersion, minimumBatteryPercent: input.minimumBatteryPercent ?? 30, sha256: createHash("sha256").update(input.payload).digest("hex"), sizeBytes: input.payload.byteLength, rollbackPolicy: { mode: "automatic", healthTimeoutMs: 30_000 } };
    return this.signManifest(manifest);
  }
  signManifest(manifest: FirmwareManifest): SignedFirmwareManifest { return { manifest: structuredClone(manifest), signatureB64url: sign(null, bytes(manifest), this.publisherPrivateKey).toString("base64url") }; }
  schedule(signed: SignedFirmwareManifest): FirmwareLifecycleState {
    const signatureVerified = verify(null, bytes(signed.manifest), this.publisherPublicKeyPem, decode(signed.signatureB64url));
    const duplicate = this.state.jobKey === `${this.state.deviceId}\u0000${signed.manifest.releaseId}`;
    this.state = reduceFirmwareLifecycle(this.state, { type: "schedule", progressSequence: duplicate ? this.state.progressSequence : this.nextSequence(), manifest: signed.manifest, signatureVerified, nowMs: this.nowMs, profile: { ...this.profile } }); return this.snapshot();
  }
  setOnline(online: boolean): void { this.profile.online = online; }
  setNowMs(nowMs: number): void { this.nowMs = nowMs; }
  advanceTime(deltaMs: number, rollbackSucceeds = true, tamperRollbackProof = false): FirmwareLifecycleState {
    const nextNowMs = this.nowMs + deltaMs;
    if (!Number.isSafeInteger(deltaMs) || deltaMs < 0 || !Number.isSafeInteger(nextNowMs)) throw new Error("firmware simulator clock advance invalid");
    this.nowMs = nextNowMs;
    if (this.state.phase === "health_checking" && this.state.healthDeadlineMs !== null && this.nowMs >= this.state.healthDeadlineMs) {
      this.state = reduceFirmwareLifecycle(this.state, { type: "health_timeout", progressSequence: this.nextSequence(), releaseId: this.releaseId(), nowMs: this.nowMs });
      this.beginRollback();
      return this.finishRollback(rollbackSucceeds, tamperRollbackProof);
    }
    return this.snapshot();
  }
  downloadChunk(offset: number, chunk: Uint8Array): FirmwareLifecycleState {
    if (!this.profile.online) throw new Error("firmware download requires online device");
    this.state = reduceFirmwareLifecycle(this.state, { type: "download_chunk", progressSequence: this.nextSequence(), releaseId: this.releaseId(), offset, length: chunk.byteLength });
    const joined = new Uint8Array(this.downloaded.byteLength + chunk.byteLength); joined.set(this.downloaded); joined.set(chunk, this.downloaded.byteLength); this.downloaded = joined; return this.snapshot();
  }
  startVerification(): FirmwareLifecycleState { this.state = reduceFirmwareLifecycle(this.state, { type: "start_verification", progressSequence: this.nextSequence(), releaseId: this.releaseId() }); return this.snapshot(); }
  finishVerification(): FirmwareLifecycleState {
    const sha256 = createHash("sha256").update(this.downloaded).digest("hex"); this.state = reduceFirmwareLifecycle(this.state, { type: "finish_verification", progressSequence: this.nextSequence(), releaseId: this.releaseId(), sha256, sizeBytes: this.downloaded.byteLength }); return this.snapshot();
  }
  install(currentBootId = this.state.activeBootId ?? "boot-before"): FirmwareLifecycleState {
    const progressSequence = this.state.phase === "installing" ? this.state.progressSequence : this.nextSequence();
    this.state = reduceFirmwareLifecycle(this.state, { type: "install", progressSequence, releaseId: this.releaseId(), currentBootId }); return this.snapshot();
  }
  reboot(newBootId = this.nextBootId("boot")): FirmwareLifecycleState { this.state = reduceFirmwareLifecycle(this.state, { type: "reboot", progressSequence: this.nextSequence(), releaseId: this.releaseId(), newBootId }); return this.snapshot(); }
  startHealthCheck(): FirmwareLifecycleState { this.state = reduceFirmwareLifecycle(this.state, { type: "start_health_check", progressSequence: this.nextSequence(), releaseId: this.releaseId(), startedAtMs: this.nowMs }); return this.snapshot(); }
  finishHealthCheck(input: FirmwareHealthCheckInput): FirmwareLifecycleState {
    const progressSequence = this.nextSequence();
    if (!this.state.jobKey || !this.state.activeBootId || !this.state.manifest) throw new Error("firmware health proof context missing");
    const proof: FirmwareHealthProof = {
      deviceId: this.state.deviceId,
      releaseId: this.releaseId(),
      jobKey: this.state.jobKey,
      progressSequence,
      bootId: this.state.activeBootId,
      activeSlot: this.state.activeSlot,
      version: this.state.installedVersion,
      checkedAtMs: this.nowMs,
      healthy: input.healthy,
      ...input.proofOverrides,
    };
    let signature = sign(null, bytes(proof), this.devicePrivateKey).toString("base64url");
    if (input.tamperSignature) signature = corruptSignature(signature);
    const signatureVerified = verify(null, bytes(proof), this.devicePublicKeyPem, decode(signature));
    this.state = reduceFirmwareLifecycle(this.state, { type: "finish_health_check", progressSequence, releaseId: this.releaseId(), proof, signatureVerified, receivedAtMs: this.nowMs });
    if (this.state.phase === "rollback_pending") {
      this.beginRollback();
      return this.finishRollback(input.rollbackSucceeds ?? true, input.tamperRollbackProof ?? false);
    }
    return this.snapshot();
  }
  failInstall(input: FirmwareStageFailureInput = {}): FirmwareLifecycleState { return this.failStage(input); }
  failReboot(input: FirmwareStageFailureInput = {}): FirmwareLifecycleState { return this.failStage(input); }
  beginRollback(): FirmwareLifecycleState { this.state = reduceFirmwareLifecycle(this.state, { type: "begin_rollback", progressSequence: this.nextSequence(), releaseId: this.releaseId() }); return this.snapshot(); }
  finishRollback(succeeded: boolean, tamperProof = false): FirmwareLifecycleState {
    const progressSequence = this.nextSequence();
    const targetSlot = this.state.lastKnownGoodSlot;
    const targetVersion = this.state.slots[targetSlot].version;
    if (!this.state.jobKey || !targetVersion) throw new Error("firmware rollback proof context missing");
    const proof: RollbackProof = {
      deviceId: this.state.deviceId,
      releaseId: this.releaseId(),
      jobKey: this.state.jobKey,
      progressSequence,
      targetSlot,
      targetVersion,
      bootId: this.nextBootId("boot-rollback"),
      rolledBackAtMs: this.nowMs,
      outcome: succeeded ? "rolled_back" : "recovery_required",
    };
    let signature = sign(null, bytes(proof), this.devicePrivateKey).toString("base64url");
    if (tamperProof) signature = corruptSignature(signature);
    const signatureVerified = verify(null, bytes(proof), this.devicePublicKeyPem, decode(signature));
    this.state = reduceFirmwareLifecycle(this.state, { type: "finish_rollback", progressSequence, releaseId: this.releaseId(), proof, signatureVerified });
    return this.snapshot();
  }
  beginNextJob(): FirmwareLifecycleState { this.state = beginNextFirmwareJob(this.state); this.downloaded = new Uint8Array(); return this.snapshot(); }
  cancel(): FirmwareLifecycleState { this.state = reduceFirmwareLifecycle(this.state, { type: "cancel", progressSequence: this.nextSequence(), releaseId: this.releaseId() }); return this.snapshot(); }
  snapshot(): FirmwareLifecycleState { return structuredClone(this.state); }

  private failStage(input: FirmwareStageFailureInput): FirmwareLifecycleState {
    this.state = reduceFirmwareLifecycle(this.state, { type: "stage_failure", progressSequence: this.nextSequence(), releaseId: this.releaseId() });
    this.beginRollback();
    return this.finishRollback(input.rollbackSucceeds ?? true, input.tamperRollbackProof ?? false);
  }
  private releaseId(): string { if (!this.state.manifest) throw new Error("firmware release missing"); return this.state.manifest.releaseId; }
  private nextSequence(): number { return this.state.progressSequence + 1; }
  private nextBootId(prefix: string): string { this.bootCounter += 1; return `${prefix}-${this.bootCounter}`; }
}
