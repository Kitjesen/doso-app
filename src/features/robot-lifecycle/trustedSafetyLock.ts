export type SafetyLockSource = Readonly<{
  safety_lock?: unknown;
}> | null | undefined;

/**
 * Preserves the difference between a trusted boolean and missing device data.
 * Command authorization must still fail closed separately when this returns null.
 */
export function readTrustedSafetyLock(source: SafetyLockSource): boolean | null {
  return typeof source?.safety_lock === 'boolean' ? source.safety_lock : null;
}
