export type G20Axis = 'leftX' | 'leftY' | 'rightX' | 'rightY';
export type G20ButtonAction = 'stand' | 'sit' | 'stop' | 'enableMotor' | 'disableMotor' | 'switchPolicy';
export type G20ChannelSetting = Readonly<{
  channelIndex: number; index: number; mapping: number;
  min: number; middle: number; max: number; reverse: boolean;
}>;
export type G20Sample = Readonly<{
  requestId: string; generation: number; sequence: number; receivedAtMonotonicMs: number; requestStartedAtMonotonicMs: number;
  channels: readonly number[]; channelSettings: readonly G20ChannelSetting[] | null;
  controlMode: string | null; configurationReady: boolean;
}>;
export type G20AxisMapping = Readonly<{ channel: number; sign: 1 | -1; center: number; min: number; max: number }>;
export type G20ButtonMapping = Readonly<{ channel: number; rest: number; pressed: number; tolerance: number }>;
export type G20Calibration = Readonly<{
  generation: number; requestId: string; configuration: string; baseline: readonly number[];
  axes: Readonly<Partial<Record<G20Axis, G20AxisMapping>>>;
  buttons: Readonly<Partial<Record<G20ButtonAction, G20ButtonMapping>>>;
}>;
export type G20Vector = Readonly<Record<G20Axis, number>>;
export const G20_AXES: readonly G20Axis[] = ['leftX', 'leftY', 'rightX', 'rightY'];
export const G20_BUTTON_ACTIONS: readonly G20ButtonAction[] = ['stand', 'sit', 'stop', 'enableMotor', 'disableMotor', 'switchPolicy'];
export const G20_INPUT_MAX_AGE_MS = 150;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
const integer = (value: unknown): value is number => Number.isSafeInteger(value);
const bounded = (value: unknown): value is number => integer(value) && value >= 0 && value <= 65535;

/** Reject malformed bridge messages; an invalid configuration may never authorize input. */
export function parseG20Sample(value: unknown): G20Sample | null {
  if (!record(value) || typeof value.requestId !== 'string' || value.requestId.length < 1 || value.requestId.length > 128
    || !integer(value.generation) || value.generation < 1 || !integer(value.sequence) || value.sequence < 1
    || typeof value.receivedAtMonotonicMs !== 'number' || !Number.isFinite(value.receivedAtMonotonicMs) || value.receivedAtMonotonicMs < 0
    || !integer(value.requestStartedAtMonotonicMs) || value.requestStartedAtMonotonicMs < 0 || value.requestStartedAtMonotonicMs > value.receivedAtMonotonicMs
    || !Array.isArray(value.channels) || value.channels.length !== 16 || !value.channels.every(bounded)
    || typeof value.configurationReady !== 'boolean'
    || !(value.controlMode === null || typeof value.controlMode === 'string' && value.controlMode.length <= 64)) return null;
  let settings: G20ChannelSetting[] | null = null;
  if (value.channelSettings !== null) {
    if (!Array.isArray(value.channelSettings) || value.channelSettings.length !== 16) return null;
    const seen = new Set<number>();
    settings = [];
    for (const item of value.channelSettings) {
      if (!record(item) || !integer(item.channelIndex) || item.channelIndex < 0 || item.channelIndex > 15 || seen.has(item.channelIndex)
        || !integer(item.index) || !integer(item.mapping) || !bounded(item.min) || !bounded(item.middle) || !bounded(item.max)
        || !(item.min < item.middle && item.middle < item.max) || typeof item.reverse !== 'boolean') return null;
      seen.add(item.channelIndex);
      settings.push({ channelIndex: item.channelIndex, index: item.index, mapping: item.mapping,
        min: item.min, middle: item.middle, max: item.max, reverse: item.reverse });
    }
  }
  if (value.configurationReady && (!settings || !value.controlMode)) return null;
  return { requestId: value.requestId, generation: value.generation, sequence: value.sequence,
    receivedAtMonotonicMs: value.receivedAtMonotonicMs, requestStartedAtMonotonicMs: value.requestStartedAtMonotonicMs,
    channels: [...value.channels], channelSettings: settings,
    controlMode: value.controlMode, configurationReady: value.configurationReady };
}

function signature(sample: G20Sample) {
  return JSON.stringify([sample.controlMode, [...(sample.channelSettings ?? [])].sort((a, b) => a.channelIndex - b.channelIndex)]);
}
function assertConfiguration(sample: G20Sample) {
  if (!sample.configurationReady || !sample.channelSettings) throw Error('通道配置未读取');
  for (const setting of sample.channelSettings) {
    const value = sample.channels[setting.channelIndex];
    if (value < setting.min || value > setting.max) throw Error('通道值超出配置范围');
  }
}
function assertSame(calibration: G20Calibration, sample: G20Sample) {
  assertConfiguration(sample);
  if (calibration.generation !== sample.generation || calibration.requestId !== sample.requestId
    || calibration.configuration !== signature(sample)) throw Error('遥控器配置已变化，请重新校验');
}
export function beginG20Calibration(sample: G20Sample): G20Calibration {
  assertConfiguration(sample);
  return { generation: sample.generation, requestId: sample.requestId, configuration: signature(sample),
    baseline: [...sample.channels], axes: {}, buttons: {} };
}

function changedChannel(calibration: G20Calibration, sample: G20Sample) {
  assertSame(calibration, sample);
  const changes = sample.channelSettings!.map(setting => ({ setting,
    change: Math.abs(sample.channels[setting.channelIndex] - calibration.baseline[setting.channelIndex]) / (setting.max - setting.min) }));
  const changed = changes.filter(item => item.change >= 0.22);
  if (changed.length !== 1 || changes.some(item => item !== changed[0] && item.change > 0.08)) throw Error('请只操作当前摇杆轴或按键');
  return changed[0].setting;
}
function channelUsed(calibration: G20Calibration, channel: number, except: G20Axis | G20ButtonAction) {
  return [...Object.entries(calibration.axes), ...Object.entries(calibration.buttons)]
    .some(([name, mapping]) => name !== except && mapping.channel === channel);
}
export function learnG20Axis(calibration: G20Calibration, axis: G20Axis, sample: G20Sample): G20Calibration {
  const setting = changedChannel(calibration, sample);
  const channel = setting.channelIndex;
  const center = calibration.baseline[channel];
  if (channelUsed(calibration, channel, axis)) throw Error('此通道已用于其他操作');
  if (Math.abs(center - setting.middle) > (setting.max - setting.min) * 0.1) throw Error('摇杆未回中，请重新开始校验');
  const direction = axis === 'leftY' || axis === 'rightY' ? -1 : 1;
  const sign = Math.sign(sample.channels[channel] - center) * direction as 1 | -1;
  return { ...calibration, axes: { ...calibration.axes, [axis]: { channel, center, sign, min: setting.min, max: setting.max } } };
}
export function learnG20Button(calibration: G20Calibration, action: G20ButtonAction, sample: G20Sample): G20Calibration {
  const setting = changedChannel(calibration, sample);
  const channel = setting.channelIndex;
  if (channelUsed(calibration, channel, action)) throw Error('此通道已用于其他操作');
  return { ...calibration, buttons: { ...calibration.buttons, [action]: {
    channel, rest: calibration.baseline[channel], pressed: sample.channels[channel], tolerance: (setting.max - setting.min) * 0.08,
  } } };
}
export function isG20Calibrated(calibration: G20Calibration | null): boolean {
  return !!calibration && G20_AXES.every(axis => !!calibration.axes[axis]);
}
export function projectG20Input(calibration: G20Calibration, sample: G20Sample) {
  assertSame(calibration, sample);
  if (!isG20Calibrated(calibration)) throw Error('摇杆尚未完成校验');
  const vector = {} as Record<G20Axis, number>;
  for (const axis of G20_AXES) {
    const mapping = calibration.axes[axis]!;
    const delta = sample.channels[mapping.channel] - mapping.center;
    const travel = delta >= 0 ? mapping.max - mapping.center : mapping.center - mapping.min;
    const raw = Math.max(-1, Math.min(1, delta / travel)) * mapping.sign;
    vector[axis] = Math.abs(raw) <= 0.1 ? 0 : Math.sign(raw) * (Math.abs(raw) - 0.1) / 0.9;
  }
  // Only the drive stick is two-dimensional. Right Y currently has no robot action.
  for (const [x, y] of [['leftX', 'leftY']] as const) {
    const magnitude = Math.hypot(vector[x], vector[y]);
    if (magnitude > 1) { vector[x] /= magnitude; vector[y] /= magnitude; }
  }
  const pressed: G20ButtonAction[] = [];
  for (const action of G20_BUTTON_ACTIONS) {
    const mapping = calibration.buttons[action];
    if (!mapping) continue;
    const raw = sample.channels[mapping.channel];
    if (Math.abs(raw - mapping.pressed) <= mapping.tolerance) pressed.push(action);
    else if (Math.abs(raw - mapping.rest) > mapping.tolerance) throw Error('按键状态不明确，请松开按键');
  }
  return { vector, pressed, neutral: Object.values(vector).every(value => value === 0) && pressed.length === 0 };
}

export type G20Frame = ReturnType<typeof projectG20Input>;

/** A new source/permission always needs a fresh neutral frame before any intent. */
export class G20IntentGate {
  private enabled = false;
  private neutralSeen = false;
  private previous = new Set<G20ButtonAction>();
  private sequence = 0;
  private generation = -1;
  private fenceAt: number | null = null;
  reset(enabled = false) {
    // Internal stale/replay resets keep the current authority's fence.
    if (!enabled || !this.enabled) this.fenceAt = null;
    this.enabled = enabled; this.neutralSeen = false; this.previous.clear(); this.sequence = 0; this.generation = -1;
  }
  setEnabled(enabled: boolean, captureFence?: () => number | null) {
    if (enabled === this.enabled) return;
    this.reset(enabled);
    if (enabled) {
      let at: number | null = null;
      try { at = captureFence?.() ?? null; } catch { /* No authoritative clock: stop only. */ }
      this.fenceAt = typeof at === 'number' && Number.isSafeInteger(at) && at >= 0 ? at : null;
    }
  }
  accept(sample: G20Sample, frame: G20Frame, nativeFresh: boolean): { send: boolean; action: G20ButtonAction | null } {
    if (!this.enabled || !nativeFresh) { this.reset(this.enabled); return { send: false, action: null }; }
    if (this.generation !== -1 && sample.generation !== this.generation || sample.sequence <= this.sequence) {
      this.reset(this.enabled); return { send: false, action: null };
    }
    this.generation = sample.generation; this.sequence = sample.sequence;
    // Revocation stays reachable while another control is held or neutral is pending.
    if (frame.pressed.includes('stop') && !this.previous.has('stop')) {
      this.previous = new Set(frame.pressed); this.neutralSeen = false;
      return { send: false, action: 'stop' };
    }
    // Both clocks are Android elapsedRealtime. A same-ms request is ambiguous,
    // so require a request started in a later tick before accepting a new neutral.
    if (this.fenceAt === null || !Number.isSafeInteger(sample.requestStartedAtMonotonicMs)
      || sample.requestStartedAtMonotonicMs <= this.fenceAt) {
      this.neutralSeen = false; this.previous = new Set(frame.pressed);
      return { send: false, action: null };
    }
    if (!this.neutralSeen) { this.neutralSeen = frame.neutral; this.previous = new Set(frame.pressed); return { send: false, action: null }; }
    const newlyPressed = frame.pressed.filter(action => !this.previous.has(action));
    this.previous = new Set(frame.pressed);
    // Stop wins. Multiple other commands are ambiguous and never dispatched together.
    const sticksNeutral = Object.values(frame.vector).every(value => value === 0);
    const action = newlyPressed.length === 1 && sticksNeutral ? newlyPressed[0] : null;
    if (frame.pressed.length) {
      // Releasing every control is required after an action; holding cannot repeat it.
      this.neutralSeen = false;
      return { send: false, action };
    }
    return { send: true, action: null };
  }
}
