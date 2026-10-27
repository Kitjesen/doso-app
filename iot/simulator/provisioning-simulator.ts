import { generateKeyPairSync, randomBytes, sign, verify, type KeyObject } from "node:crypto";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { reduceProvisioning, type DeviceProvisioningReport, type DeviceProvisioningReportType, type DeviceSessionProof, type OnlineConfirmation, type ProvisioningFailureCode, type ProvisioningState, type SignedDeviceProvisioningReport, type SignedDeviceSessionProof, type SignedOnlineConfirmation } from "../../src/domain/device-provisioning/index.ts";
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { SimulatedDeviceIdentity } from "./robot-protocol-simulator.ts";

interface Clock { now(): number }
type ManufacturingIdentityStatus = "active" | "revoked" | "compromised" | "retired";
export interface ProvisioningActor {
  authenticated: boolean;
  user_id: string;
  account_id: string;
  terminal_id: string;
  session_id: string;
  capabilities: string[];
}
export interface WifiCredentials { ssid: string; password: string }
export interface CredentialWriteAuthorization {
  authorization_id: string;
  secure_session_handle: string;
  provisioning_id: string;
  challenge_id: string;
  device_id: string;
  auth_session_id: string;
  authorization_epoch: number;
  factory_reset_counter: number;
  issued_at_ms: number;
  expires_at_ms: number;
}
export interface AuthenticatedCredentialEnvelope extends CredentialWriteAuthorization {
  signature_b64url: string;
}
interface OwnedDevice {
  publicKeyPem: string;
  identityStatus: ManufacturingIdentityStatus;
  ownerAccountId: string;
  terminalId: string;
  authorizationEpoch: number;
  factoryResetCounter: number;
}
interface AuthenticatedSession {
  userId: string;
  accountId: string;
  terminalId: string;
  capabilities: Set<string>;
  active: boolean;
}
const TERMINAL_PHASES = new Set<ProvisioningState["phase"]>(["succeeded", "cancelled", "expired", "invalidated", "failed"]);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
const bytes = (value: unknown): Uint8Array => new TextEncoder().encode(canonical(value));
const clone = <T>(value: T): T => structuredClone(value);
function decode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export class SimulatedProvisioningDevice {
  readonly deviceId: string;
  readonly publicKeyPem: string;
  readonly credentialAuthorityPublicKeyPem: string | null;
  private readonly identity: SimulatedDeviceIdentity;
  private readonly appliedCredentialDeliveries = new Set<string>();
  private readonly revokedCredentialAuthorizationIds = new Set<string>();
  private activeSecureSession: AuthenticatedCredentialEnvelope | null = null;
  private writes = 0;

  constructor(identity: SimulatedDeviceIdentity, credentialAuthorityPublicKeyPem: string | null = null) {
    this.identity = identity;
    this.deviceId = identity.deviceId;
    this.publicKeyPem = identity.publicKeyPem;
    this.credentialAuthorityPublicKeyPem = credentialAuthorityPublicKeyPem;
  }

  get credentialWriteCount(): number { return this.writes; }

  applyCredentials(envelope: AuthenticatedCredentialEnvelope, credentials: WifiCredentials, nowMs: number): void {
    this.requireActiveSecureSession(envelope, nowMs);
    if (!credentials.ssid.trim() || !credentials.password) throw new Error("Wi-Fi credentials are incomplete");
    if (this.appliedCredentialDeliveries.has(envelope.provisioning_id)) return;
    this.appliedCredentialDeliveries.add(envelope.provisioning_id);
    this.writes += 1;
  }

  credentialEnvelope(state: ProvisioningState, nowMs: number): AuthenticatedCredentialEnvelope {
    const active = this.activeSecureSession;
    if (!active || !this.matchesState(active, state)) throw new Error("authenticated secure session unavailable");
    this.requireActiveSecureSession(active, nowMs);
    return clone(active);
  }

  acceptCredentialAuthorization(envelope: AuthenticatedCredentialEnvelope, nowMs: number): void {
    const { signature_b64url, ...authorization } = envelope;
    if (this.revokedCredentialAuthorizationIds.has(authorization.authorization_id)) {
      throw new Error("credential-write authorization replay or revocation rejected");
    }
    if (!this.credentialAuthorityPublicKeyPem
      || !verify(null, bytes(authorization), this.credentialAuthorityPublicKeyPem, decode(signature_b64url))) {
      throw new Error("credential-write authorization signature rejected");
    }
    if (authorization.device_id !== this.deviceId
      || !Number.isSafeInteger(authorization.issued_at_ms)
      || !Number.isSafeInteger(authorization.expires_at_ms)
      || authorization.issued_at_ms > nowMs
      || nowMs > authorization.expires_at_ms
      || authorization.expires_at_ms <= authorization.issued_at_ms) {
      throw new Error("credential-write authorization binding or time rejected");
    }
    if (this.activeSecureSession && this.activeSecureSession.authorization_id !== authorization.authorization_id) {
      throw new Error("existing credential-write authorization must be fenced first");
    }
    this.activeSecureSession = clone(envelope);
  }

  revokeCredentialAuthorization(state: ProvisioningState): void {
    if (this.activeSecureSession && this.matchesState(this.activeSecureSession, state)) {
      this.revokedCredentialAuthorizationIds.add(this.activeSecureSession.authorization_id);
      this.activeSecureSession = null;
    }
  }

  signSessionProof(state: ProvisioningState, provedAtMs = state.issued_at_ms): SignedDeviceSessionProof {
    const proof: DeviceSessionProof = {
      provisioning_id: state.provisioning_id,
      challenge_id: state.challenge_id,
      nonce_b64url: state.nonce_b64url,
      device_id: state.device_id,
      auth_session_id: state.auth_session_id,
      authorization_epoch: state.authorization_epoch,
      factory_reset_counter: state.factory_reset_counter,
      proved_at_ms: provedAtMs,
    };
    return { proof, signature_b64url: this.identity.sign(proof) };
  }

  signOnlineConfirmation(state: ProvisioningState, confirmedAtMs = state.issued_at_ms): SignedOnlineConfirmation {
    const confirmation: OnlineConfirmation = {
      provisioning_id: state.provisioning_id,
      challenge_id: state.challenge_id,
      nonce_b64url: state.nonce_b64url,
      device_id: state.device_id,
      auth_session_id: state.auth_session_id,
      authorization_epoch: state.authorization_epoch,
      factory_reset_counter: state.factory_reset_counter,
      confirmed_at_ms: confirmedAtMs,
    };
    return { confirmation, signature_b64url: this.identity.sign(confirmation) };
  }

  signProvisioningReport(
    state: ProvisioningState,
    eventType: DeviceProvisioningReportType,
    failureCode: ProvisioningFailureCode | null = null,
    reportedAtMs = state.issued_at_ms,
  ): SignedDeviceProvisioningReport {
    const report: DeviceProvisioningReport = {
      provisioning_id: state.provisioning_id,
      challenge_id: state.challenge_id,
      nonce_b64url: state.nonce_b64url,
      device_id: state.device_id,
      auth_session_id: state.auth_session_id,
      authorization_epoch: state.authorization_epoch,
      factory_reset_counter: state.factory_reset_counter,
      device_event_sequence: state.device_event_sequence + 1,
      event_type: eventType,
      failure_code: failureCode,
      reported_at_ms: reportedAtMs,
    };
    return { report, signature_b64url: this.identity.sign(report) };
  }

  private matchesState(envelope: AuthenticatedCredentialEnvelope, state: ProvisioningState): boolean {
    return envelope.provisioning_id === state.provisioning_id
      && envelope.challenge_id === state.challenge_id
      && envelope.device_id === state.device_id
      && envelope.auth_session_id === state.auth_session_id
      && envelope.authorization_epoch === state.authorization_epoch
      && envelope.factory_reset_counter === state.factory_reset_counter
      && envelope.expires_at_ms === state.expires_at_ms;
  }

  private requireActiveSecureSession(envelope: AuthenticatedCredentialEnvelope, nowMs: number): void {
    const active = this.activeSecureSession;
    if (!active
      || envelope.secure_session_handle !== active.secure_session_handle
      || envelope.provisioning_id !== active.provisioning_id
      || envelope.challenge_id !== active.challenge_id
      || envelope.device_id !== active.device_id
      || envelope.auth_session_id !== active.auth_session_id
      || envelope.authorization_epoch !== active.authorization_epoch
      || envelope.factory_reset_counter !== active.factory_reset_counter
      || envelope.authorization_id !== active.authorization_id
      || envelope.issued_at_ms !== active.issued_at_ms
      || envelope.expires_at_ms !== active.expires_at_ms) {
      throw new Error("authenticated secure-session envelope rejected");
    }
    const { signature_b64url, ...authorization } = envelope;
    if (!this.credentialAuthorityPublicKeyPem
      || !verify(null, bytes(authorization), this.credentialAuthorityPublicKeyPem, decode(signature_b64url))) {
      throw new Error("credential-write authorization signature rejected");
    }
    if (!Number.isSafeInteger(nowMs) || nowMs < active.issued_at_ms || nowMs > active.expires_at_ms) {
      throw new Error("authenticated secure-session envelope expired or has invalid time");
    }
  }
}

export class SimulatedProvisioningCloud {
  private readonly clock: Clock;
  private readonly challengeTtlMs: number;
  readonly credentialAuthorityPublicKeyPem: string;
  private readonly credentialAuthorityPrivateKey: KeyObject;
  private readonly ownedDevices = new Map<string, OwnedDevice>();
  private readonly provisioningDevices = new Map<string, SimulatedProvisioningDevice>();
  private readonly sessions = new Map<string, ProvisioningState>();
  private readonly activeSessionByDevice = new Map<string, string>();
  private readonly authenticatedSessions = new Map<string, AuthenticatedSession>();
  private readonly lastObservedTimes = new Map<string, number>();

  constructor(clock: Clock, options: Partial<{ challengeTtlMs: number }> = {}) {
    this.clock = clock;
    this.challengeTtlMs = options.challengeTtlMs ?? 30_000;
    if (!Number.isSafeInteger(this.challengeTtlMs) || this.challengeTtlMs <= 0) throw new Error("provisioning challenge TTL invalid");
    const authority = generateKeyPairSync("ed25519");
    this.credentialAuthorityPrivateKey = authority.privateKey;
    this.credentialAuthorityPublicKeyPem = authority.publicKey.export({ type: "spki", format: "pem" }).toString();
  }

  registerOwnedDevice(identity: SimulatedDeviceIdentity, ownerAccountId: string, terminalId: string, authorizationEpoch: number, factoryResetCounter: number): void {
    this.ownedDevices.set(identity.deviceId, {
      publicKeyPem: identity.publicKeyPem,
      identityStatus: "active",
      ownerAccountId,
      terminalId,
      authorizationEpoch,
      factoryResetCounter,
    });
  }

  registerProvisioningDevice(device: SimulatedProvisioningDevice): void {
    const owned = this.ownedDevices.get(device.deviceId);
    if (!owned || owned.publicKeyPem !== device.publicKeyPem) throw new Error("provisioning device identity binding rejected");
    if (device.credentialAuthorityPublicKeyPem !== this.credentialAuthorityPublicKeyPem) throw new Error("provisioning device credential authority rejected");
    this.provisioningDevices.set(device.deviceId, device);
  }

  setManufacturingStatus(deviceId: string, status: ManufacturingIdentityStatus): void {
    const device = this.ownedDevices.get(deviceId);
    if (!device) throw new Error("manufacturing identity unavailable");
    device.identityStatus = status;
    if (status !== "active") this.invalidateSessions((state) => state.device_id === deviceId);
  }

  registerSession(actor: ProvisioningActor): void {
    if (!actor.authenticated || !actor.session_id) throw new Error("authenticated session required");
    this.authenticatedSessions.set(actor.session_id, {
      userId: actor.user_id,
      accountId: actor.account_id,
      terminalId: actor.terminal_id,
      capabilities: new Set(actor.capabilities),
      active: true,
    });
  }

  revokeSession(sessionId: string): void {
    const session = this.authenticatedSessions.get(sessionId);
    if (!session) throw new Error("authenticated session unavailable");
    session.active = false;
    this.invalidateSessions((state) => state.auth_session_id === sessionId);
  }

  revokeCapability(sessionId: string, capability: string): void {
    const session = this.authenticatedSessions.get(sessionId);
    if (!session) throw new Error("authenticated session unavailable");
    session.capabilities.delete(capability);
    if (capability === "device:pair") this.invalidateSessions((state) => state.auth_session_id === sessionId);
  }

  updateOwnership(deviceId: string, ownerAccountId: string, terminalId: string, authorizationEpoch: number, factoryResetCounter: number): void {
    const device = this.ownedDevices.get(deviceId);
    if (!device) throw new Error("device ownership unavailable");
    Object.assign(device, { ownerAccountId, terminalId, authorizationEpoch, factoryResetCounter });
    this.invalidateSessions((state) => state.device_id === deviceId);
  }

  begin(actor: ProvisioningActor, deviceId: string): ProvisioningState {
    const device = this.ownedDevices.get(deviceId);
    this.requireActor(actor);
    if (!device || device.identityStatus !== "active") throw new Error("manufacturing identity is not active");
    if (!this.provisioningDevices.has(deviceId)) throw new Error("provisioning device transport unavailable");
    if (device.ownerAccountId !== actor.account_id || device.terminalId !== actor.terminal_id) throw new Error("cloud ownership rejected");
    const now = this.clock.now();
    const expiresAtMs = now + this.challengeTtlMs;
    if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(expiresAtMs)) throw new Error("provisioning authoritative clock invalid");
    const existingId = this.activeSessionByDevice.get(deviceId);
    const existing = existingId ? this.sessions.get(existingId) : undefined;
    if (existing && !TERMINAL_PHASES.has(existing.phase)) {
      if (now > existing.expires_at_ms) {
        this.expireSession(existing);
      } else {
        const sameAuthority = existing.owner_account_id === actor.account_id
          && existing.terminal_id === actor.terminal_id
          && existing.auth_session_id === actor.session_id
          && existing.authorization_epoch === device.authorizationEpoch
          && existing.factory_reset_counter === device.factoryResetCounter;
        if (sameAuthority) return clone(existing);
        this.invalidateSession(existing);
      }
    }
    const state: ProvisioningState = {
      provisioning_id: `provision-${randomBytes(12).toString("hex")}`,
      challenge_id: `provision-challenge-${randomBytes(12).toString("hex")}`,
      nonce_b64url: randomBytes(32).toString("base64url"),
      device_id: deviceId,
      owner_account_id: actor.account_id,
      terminal_id: actor.terminal_id,
      auth_session_id: actor.session_id,
      authorization_epoch: device.authorizationEpoch,
      factory_reset_counter: device.factoryResetCounter,
      issued_at_ms: now,
      expires_at_ms: expiresAtMs,
      phase: "authenticating",
      credentials_written: false,
      device_event_sequence: 0,
      failure: null,
    };
    this.sessions.set(state.provisioning_id, state);
    this.activeSessionByDevice.set(deviceId, state.provisioning_id);
    this.lastObservedTimes.set(state.provisioning_id, now);
    return clone(state);
  }

  session(provisioningId: string): ProvisioningState {
    const state = this.requireSession(provisioningId);
    return clone(state);
  }

  submitCredentials(
    actor: ProvisioningActor,
    provisioningId: string,
    device: SimulatedProvisioningDevice,
    credentials: WifiCredentials,
    failureInjection: Partial<{ crashAfterDeviceWrite: boolean }> = {},
  ): ProvisioningState {
    this.requireActor(actor);
    const current = this.requireLiveSession(provisioningId);
    if (device.deviceId !== current.device_id || device.publicKeyPem !== this.ownedDevices.get(current.device_id)?.publicKeyPem) throw new Error("cross-device credential delivery rejected");
    const transition = reduceProvisioning(current, {
      type: "credentials_authenticated",
      authenticated: actor.authenticated,
      account_id: actor.account_id,
      terminal_id: actor.terminal_id,
      session_id: actor.session_id,
    });
    const envelope = device.credentialEnvelope(current, this.clock.now());
    device.applyCredentials(envelope, credentials, this.clock.now());
    if (failureInjection.crashAfterDeviceWrite) throw new Error("simulated cloud crash after device credential write");
    this.sessions.set(provisioningId, transition.state);
    device.revokeCredentialAuthorization(transition.state);
    return clone(transition.state);
  }

  acceptDeviceProof(signed: SignedDeviceSessionProof): ProvisioningState {
    const current = this.requireLiveSession(signed.proof.provisioning_id);
    const device = this.ownedDevices.get(current.device_id);
    const signatureVerified = Boolean(device) && verify(null, bytes(signed.proof), device!.publicKeyPem, decode(signed.signature_b64url));
    if (!signatureVerified) throw new Error("device session proof signature rejected");
    const transition = reduceProvisioning(current, { type: "device_authenticated", proof: signed.proof, signature_verified: true });
    const runtime = this.provisioningDevices.get(current.device_id);
    if (!runtime) throw new Error("provisioning device transport unavailable");
    runtime.acceptCredentialAuthorization(this.createCredentialAuthorization(transition.state), this.clock.now());
    this.sessions.set(current.provisioning_id, transition.state);
    return clone(transition.state);
  }

  acceptDeviceReport(signed: SignedDeviceProvisioningReport): ProvisioningState {
    const current = this.requireLiveSession(signed.report.provisioning_id);
    const device = this.ownedDevices.get(current.device_id);
    const signatureVerified = Boolean(device) && verify(null, bytes(signed.report), device!.publicKeyPem, decode(signed.signature_b64url));
    if (!signatureVerified) throw new Error("device provisioning report signature rejected");
    const transition = reduceProvisioning(current, { type: "device_report", report: signed.report, signature_verified: true });
    this.sessions.set(current.provisioning_id, transition.state);
    if (TERMINAL_PHASES.has(transition.state.phase)) this.fenceDeviceAuthorization(current);
    return clone(transition.state);
  }

  cancel(actor: ProvisioningActor, provisioningId: string): ProvisioningState {
    this.requireActor(actor);
    const current = this.requireLiveSession(provisioningId);
    this.requireSessionActor(actor, current);
    const transition = reduceProvisioning(current, { type: "cancel" });
    this.sessions.set(provisioningId, transition.state);
    this.fenceDeviceAuthorization(current);
    return clone(transition.state);
  }
  acceptOnlineConfirmation(signed: SignedOnlineConfirmation): ProvisioningState {
    const current = this.requireLiveSession(signed.confirmation.provisioning_id);
    const device = this.ownedDevices.get(current.device_id);
    const signatureVerified = Boolean(device) && verify(null, bytes(signed.confirmation), device!.publicKeyPem, decode(signed.signature_b64url));
    if (!signatureVerified) throw new Error("online confirmation signature rejected");
    const ownershipVerified = Boolean(device)
      && device!.ownerAccountId === current.owner_account_id
      && device!.terminalId === current.terminal_id
      && device!.authorizationEpoch === current.authorization_epoch
      && device!.factoryResetCounter === current.factory_reset_counter;
    const transition = reduceProvisioning(current, {
      type: "online_confirmation",
      confirmation: signed.confirmation,
      signature_verified: signatureVerified,
      ownership_verified: ownershipVerified,
    });
    this.sessions.set(current.provisioning_id, transition.state);
    if (TERMINAL_PHASES.has(transition.state.phase)) this.fenceDeviceAuthorization(current);
    return clone(transition.state);
  }

  private requireSession(provisioningId: string): ProvisioningState {
    const state = this.sessions.get(provisioningId);
    if (!state) throw new Error("provisioning session unavailable");
    return state;
  }

  private requireLiveSession(provisioningId: string): ProvisioningState {
    const state = this.requireSession(provisioningId);
    const now = this.clock.now();
    const lastObservedAtMs = this.lastObservedTimes.get(provisioningId) ?? state.issued_at_ms;
    if (!Number.isSafeInteger(now) || now < lastObservedAtMs) throw new Error("provisioning authoritative clock invalid or moved backwards");
    this.lastObservedTimes.set(provisioningId, now);
    if (now > state.expires_at_ms && !TERMINAL_PHASES.has(state.phase)) {
      this.expireSession(state);
      throw new Error("provisioning session expired");
    }
    const device = this.ownedDevices.get(state.device_id);
    const authenticatedSession = this.authenticatedSessions.get(state.auth_session_id);
    if (!device
      || device.identityStatus !== "active"
      || device.ownerAccountId !== state.owner_account_id
      || device.terminalId !== state.terminal_id
      || device.authorizationEpoch !== state.authorization_epoch
      || device.factoryResetCounter !== state.factory_reset_counter
      || !authenticatedSession?.active
      || authenticatedSession.accountId !== state.owner_account_id
      || authenticatedSession.terminalId !== state.terminal_id
      || !authenticatedSession.capabilities.has("device:pair")) {
      if (!TERMINAL_PHASES.has(state.phase)) this.invalidateSession(state);
      throw new Error("provisioning session invalidated by cloud ownership, authorization, or auth-session change");
    }
    return state;
  }

  private requireActor(actor: ProvisioningActor): void {
    const session = this.authenticatedSessions.get(actor.session_id);
    if (!actor.authenticated || !actor.user_id || !actor.account_id || !actor.terminal_id || !actor.session_id
      || !actor.capabilities.includes("device:pair")
      || !session?.active
      || session.userId !== actor.user_id
      || session.accountId !== actor.account_id
      || session.terminalId !== actor.terminal_id
      || !session.capabilities.has("device:pair")) throw new Error("authenticated provisioning session and capability required");
  }

  private requireSessionActor(actor: ProvisioningActor, state: ProvisioningState): void {
    if (actor.account_id !== state.owner_account_id
      || actor.terminal_id !== state.terminal_id
      || actor.session_id !== state.auth_session_id) throw new Error("provisioning actor is not bound to this session");
  }

  private createCredentialAuthorization(state: ProvisioningState): AuthenticatedCredentialEnvelope {
    const nowMs = this.clock.now();
    if (!Number.isSafeInteger(nowMs) || nowMs < state.issued_at_ms || nowMs >= state.expires_at_ms) {
      throw new Error("credential-write authorization clock invalid or expired");
    }
    const authorization: CredentialWriteAuthorization = {
      authorization_id: `credential-auth-${randomBytes(12).toString("hex")}`,
      secure_session_handle: randomBytes(32).toString("base64url"),
      provisioning_id: state.provisioning_id,
      challenge_id: state.challenge_id,
      device_id: state.device_id,
      auth_session_id: state.auth_session_id,
      authorization_epoch: state.authorization_epoch,
      factory_reset_counter: state.factory_reset_counter,
      issued_at_ms: nowMs,
      expires_at_ms: state.expires_at_ms,
    };
    return {
      ...authorization,
      signature_b64url: sign(null, bytes(authorization), this.credentialAuthorityPrivateKey).toString("base64url"),
    };
  }

  private fenceDeviceAuthorization(state: ProvisioningState): void {
    this.provisioningDevices.get(state.device_id)?.revokeCredentialAuthorization(state);
  }

  private invalidateSession(state: ProvisioningState): void {
    if (TERMINAL_PHASES.has(state.phase)) return;
    this.sessions.set(state.provisioning_id, reduceProvisioning(state, { type: "invalidate" }).state);
    this.fenceDeviceAuthorization(state);
  }

  private expireSession(state: ProvisioningState): void {
    if (TERMINAL_PHASES.has(state.phase)) return;
    this.sessions.set(state.provisioning_id, reduceProvisioning(state, { type: "expire" }).state);
    this.fenceDeviceAuthorization(state);
  }

  private invalidateSessions(matches: (state: ProvisioningState) => boolean): void {
    for (const state of this.sessions.values()) {
      if (matches(state)) this.invalidateSession(state);
    }
  }
}
