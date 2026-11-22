export type RobotModeCapability = Readonly<{
  id: string; kind: number; availability: number; profileId: string; unavailableReason: string;
}>;

export function parseRobotModeFields(value: Record<string, unknown>): {
  modeCapabilities?: readonly RobotModeCapability[]; activeModeId?: string;
} {
  const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !v.includes('\0');
  const result: { modeCapabilities?: readonly RobotModeCapability[]; activeModeId?: string } = {};
  if (value.activeModeId !== undefined) {
    if (!text(value.activeModeId, 128)) throw Error('Invalid active mode');
    result.activeModeId = value.activeModeId;
  }
  if (value.modeCapabilities !== undefined) {
    if (!Array.isArray(value.modeCapabilities) || value.modeCapabilities.length > 16) throw Error('Invalid mode catalog');
    const ids = new Set<string>();
    result.modeCapabilities = Object.freeze(value.modeCapabilities.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object') throw Error('Invalid mode');
      const v = raw as Record<string, unknown>;
      if (!text(v.id, 128) || !v.id || ids.has(v.id) || !text(v.profileId, 128) || !text(v.unavailableReason, 512)
        || !Number.isInteger(v.kind) || !Number.isInteger(v.availability) || Number(v.kind) < 0 || Number(v.availability) < 0) throw Error('Invalid mode');
      ids.add(v.id);
      return Object.freeze({ id: v.id, kind: Number(v.kind), availability: Number(v.availability), profileId: v.profileId, unavailableReason: v.unavailableReason });
    }));
  }
  return result;
}

export function recoveryModeFromProfile(profile: { modeCapabilities?: readonly { id: string; kind: number | string; availability?: number | string }[]; activeModeId?: string | null } | null | undefined) {
  const mode = profile?.modeCapabilities?.find(item => item.id === 'recovery' && (item.kind === 2 || item.kind === 'recovery-action'));
  return { status: !mode ? 'unknown' as const : mode.availability === 2 || mode.availability === 'available' ? 'available' as const : 'unavailable' as const,
    selected: profile?.activeModeId === 'recovery' };
}
