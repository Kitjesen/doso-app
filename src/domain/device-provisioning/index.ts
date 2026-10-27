export type ProvisioningPhase =
  | "authenticating"
  | "secure_channel_ready"
  | "connecting"
  | "awaiting_confirmation"
  | "succeeded"
  | "cancelled"
  | "expired"
  | "invalidated"
  | "failed";

export type ProvisioningFailureCode = "wifi_authentication_failed" | "device_rejected";
export interface ProvisioningFailure {
  code: ProvisioningFailureCode;
  safe_message: string;
}

export interface ProvisioningState {
  provisioning_id: string;
  challenge_id: string;
  nonce_b64url: string;
  device_id: string;
  owner_account_id: string;
  terminal_id: string;
  auth_session_id: string;
  authorization_epoch: number;
  factory_reset_counter: number;
  issued_at_ms: number;
  expires_at_ms: number;
  phase: ProvisioningPhase;
  credentials_written: boolean;
  device_event_sequence: number;
  failure: ProvisioningFailure | null;
}

export type InitialProvisioningStateInput = Omit<
  ProvisioningState,
  "phase" | "credentials_written" | "device_event_sequence" | "failure"
>;

export interface OnlineConfirmation {
  provisioning_id: string;
  challenge_id: string;
  nonce_b64url: string;
  device_id: string;
  auth_session_id: string;
  authorization_epoch: number;
  factory_reset_counter: number;
  confirmed_at_ms: number;
}

export interface DeviceSessionProof {
  provisioning_id: string;
  challenge_id: string;
  nonce_b64url: string;
  device_id: string;
  auth_session_id: string;
  authorization_epoch: number;
  factory_reset_counter: number;
  proved_at_ms: number;
}

export interface SignedDeviceSessionProof {
  proof: DeviceSessionProof;
  signature_b64url: string;
}

export interface SignedOnlineConfirmation {
  confirmation: OnlineConfirmation;
  signature_b64url: string;
}

export type DeviceProvisioningReportType = "network_connected" | "network_disconnected" | "failure_reported";

export interface DeviceProvisioningReport {
  provisioning_id: string;
  challenge_id: string;
  nonce_b64url: string;
  device_id: string;
  auth_session_id: string;
  authorization_epoch: number;
  factory_reset_counter: number;
  device_event_sequence: number;
  event_type: DeviceProvisioningReportType;
  failure_code: ProvisioningFailureCode | null;
  reported_at_ms: number;
}

export interface SignedDeviceProvisioningReport {
  report: DeviceProvisioningReport;
  signature_b64url: string;
}

export type ProvisioningEvent =
  | { type: "device_authenticated"; proof: DeviceSessionProof; signature_verified: boolean }
  | { type: "device_authentication_failed" }
  | { type: "credentials_authenticated"; authenticated: boolean; account_id: string; terminal_id: string; session_id: string }
  | { type: "device_report"; report: DeviceProvisioningReport; signature_verified: boolean }
  | { type: "online_confirmation"; confirmation: OnlineConfirmation; signature_verified: boolean; ownership_verified: boolean }
  | { type: "cancel" }
  | { type: "expire" }
  | { type: "invalidate" };

export type ProvisioningEffect = { type: "write_credentials_once" };
export interface ProvisioningTransition { state: ProvisioningState; effects: ProvisioningEffect[] }

const terminal = (phase: ProvisioningPhase): boolean => phase === "succeeded" || phase === "cancelled" || phase === "expired" || phase === "invalidated" || phase === "failed";
const FAILURE_MESSAGES: Record<ProvisioningFailureCode, string> = {
  wifi_authentication_failed: "The device could not authenticate to the Wi-Fi network.",
  device_rejected: "The device rejected the provisioning request.",
};

function sameSessionBinding(state: ProvisioningState, value: Omit<DeviceSessionProof, "proved_at_ms"> | Omit<OnlineConfirmation, "confirmed_at_ms">): boolean {
  return value.provisioning_id === state.provisioning_id
    && value.challenge_id === state.challenge_id
    && value.nonce_b64url === state.nonce_b64url
    && value.device_id === state.device_id
    && value.auth_session_id === state.auth_session_id
    && value.authorization_epoch === state.authorization_epoch
    && value.factory_reset_counter === state.factory_reset_counter;
}

function sameConfirmation(state: ProvisioningState, value: OnlineConfirmation): boolean {
  return sameSessionBinding(state, value);
}

export function createInitialProvisioningState(input: InitialProvisioningStateInput): ProvisioningState {
  const identifiers = [
    input.provisioning_id,
    input.challenge_id,
    input.nonce_b64url,
    input.device_id,
    input.owner_account_id,
    input.terminal_id,
    input.auth_session_id,
  ];
  if (identifiers.some((value) => !value.trim())) throw new Error("provisioning identifiers are required");
  if (!Number.isSafeInteger(input.authorization_epoch) || input.authorization_epoch < 0) {
    throw new Error("provisioning authorization epoch invalid");
  }
  if (!Number.isSafeInteger(input.factory_reset_counter) || input.factory_reset_counter < 0) {
    throw new Error("provisioning factory reset counter invalid");
  }
  if (!Number.isSafeInteger(input.issued_at_ms)
    || !Number.isSafeInteger(input.expires_at_ms)
    || input.issued_at_ms < 0
    || input.expires_at_ms <= input.issued_at_ms) {
    throw new Error("provisioning lifetime invalid");
  }
  return {
    ...input,
    phase: "authenticating",
    credentials_written: false,
    device_event_sequence: 0,
    failure: null,
  };
}

export function reduceProvisioning(state: ProvisioningState, event: ProvisioningEvent): ProvisioningTransition {
  if (terminal(state.phase)) throw new Error(`provisioning terminal state is immutable: ${state.phase}`);

  if (event.type === "cancel") return { state: { ...state, phase: "cancelled" }, effects: [] };
  if (event.type === "expire") return { state: { ...state, phase: "expired" }, effects: [] };
  if (event.type === "invalidate") return { state: { ...state, phase: "invalidated" }, effects: [] };

  if (event.type === "device_authentication_failed") {
    if (state.phase !== "authenticating") throw new Error("device authentication failure is out of order");
    return {
      state: {
        ...state,
        phase: "failed",
        failure: { code: "device_rejected", safe_message: FAILURE_MESSAGES.device_rejected },
      },
      effects: [],
    };
  }

  if (event.type === "device_authenticated") {
    if (state.phase !== "authenticating") throw new Error("device proof replayed or out of order");
    if (!event.signature_verified) throw new Error("device session proof signature rejected");
    if (!sameSessionBinding(state, event.proof)) throw new Error("device session proof binding rejected");
    if (!Number.isSafeInteger(event.proof.proved_at_ms)
      || event.proof.proved_at_ms < state.issued_at_ms
      || event.proof.proved_at_ms > state.expires_at_ms) throw new Error("device session proof expired or has invalid time");
    return { state: { ...state, phase: "secure_channel_ready" }, effects: [] };
  }

  if (event.type === "credentials_authenticated") {
    if (state.phase !== "secure_channel_ready" || state.credentials_written) throw new Error("secure channel is not ready or credential submission replayed");
    if (!event.authenticated
      || event.account_id !== state.owner_account_id
      || event.terminal_id !== state.terminal_id
      || event.session_id !== state.auth_session_id) throw new Error("credential submission is not authenticated for this session");
    return { state: { ...state, phase: "connecting", credentials_written: true }, effects: [{ type: "write_credentials_once" }] };
  }

  if (event.type === "device_report") {
    const report = event.report;
    if (!event.signature_verified) throw new Error("device provisioning report signature rejected");
    if (!sameSessionBinding(state, report)) throw new Error("device provisioning report binding rejected");
    if (!Number.isSafeInteger(report.device_event_sequence)
      || report.device_event_sequence !== state.device_event_sequence + 1) throw new Error("device provisioning report sequence replayed or out of order");
    if (!Number.isSafeInteger(report.reported_at_ms) || report.reported_at_ms < state.issued_at_ms || report.reported_at_ms > state.expires_at_ms) {
      throw new Error("device provisioning report expired or has invalid time");
    }
    if (report.event_type === "network_disconnected") {
      if (report.failure_code !== null) throw new Error("disconnect report cannot contain a failure code");
      if (state.phase !== "connecting" && state.phase !== "awaiting_confirmation") throw new Error("disconnect is out of order");
      return { state: { ...state, phase: "connecting", device_event_sequence: report.device_event_sequence }, effects: [] };
    }
    if (report.event_type === "network_connected") {
      if (report.failure_code !== null) throw new Error("network confirmation cannot contain a failure code");
      if (state.phase !== "connecting" || !state.credentials_written) throw new Error("network confirmation is out of order");
      return { state: { ...state, phase: "awaiting_confirmation", device_event_sequence: report.device_event_sequence }, effects: [] };
    }
    if (!report.failure_code || !Object.prototype.hasOwnProperty.call(FAILURE_MESSAGES, report.failure_code)) throw new Error("failure report requires a recognized failure code");
    if ((state.phase !== "connecting" && state.phase !== "awaiting_confirmation") || !state.credentials_written) throw new Error("provisioning failure report is out of order");
    return {
      state: {
        ...state,
        phase: "failed",
        device_event_sequence: report.device_event_sequence,
        failure: { code: report.failure_code, safe_message: FAILURE_MESSAGES[report.failure_code] },
      },
      effects: [],
    };
  }

  if (state.phase !== "awaiting_confirmation") throw new Error("online confirmation is out of order");
  if (!event.signature_verified) throw new Error("online confirmation signature rejected");
  if (!event.ownership_verified) throw new Error("cloud ownership recheck rejected");
  if (!sameConfirmation(state, event.confirmation)) throw new Error("online confirmation binding rejected");
  if (!Number.isSafeInteger(event.confirmation.confirmed_at_ms)
    || event.confirmation.confirmed_at_ms < state.issued_at_ms
    || event.confirmation.confirmed_at_ms > state.expires_at_ms) throw new Error("online confirmation expired or has invalid time");
  return { state: { ...state, phase: "succeeded" }, effects: [] };
}
