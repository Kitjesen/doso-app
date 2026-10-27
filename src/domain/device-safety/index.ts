export const DEVICE_SAFETY_CONTRACT_ID = "stationary-health-check" as const;
export const DEVICE_SAFETY_CONTRACT_VERSION = 1 as const;
export const NON_MOTION_DIAGNOSTIC = "non_motion_diagnostic" as const;
export const SAFE_HEALTH_CHECK_KIND = "diagnostics.health_check" as const;

export interface DeviceSafetyContract {
  contract_id: typeof DEVICE_SAFETY_CONTRACT_ID;
  version: typeof DEVICE_SAFETY_CONTRACT_VERSION;
  allowed_command: {
    kind: typeof SAFE_HEALTH_CHECK_KIND;
    command_class: typeof NON_MOTION_DIAGNOSTIC;
    may_actuate: false;
  };
}

export const SIMULATED_STATIONARY_HEALTH_CHECK_CONTRACT: DeviceSafetyContract = Object.freeze({
  contract_id: DEVICE_SAFETY_CONTRACT_ID,
  version: DEVICE_SAFETY_CONTRACT_VERSION,
  allowed_command: Object.freeze({
    kind: SAFE_HEALTH_CHECK_KIND,
    command_class: NON_MOTION_DIAGNOSTIC,
    may_actuate: false,
  }),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function assertSimulatedDeviceSafetyCommand(value: unknown): asserts value is DeviceSafetyContract["allowed_command"] {
  if (!isRecord(value) || Object.keys(value).length !== 3) throw new Error("SIMULATED safety command shape rejected");
  if (
    value.kind !== SAFE_HEALTH_CHECK_KIND
    || value.command_class !== NON_MOTION_DIAGNOSTIC
    || value.may_actuate !== false
  ) throw new Error("SIMULATED safety contract rejected command");
}
