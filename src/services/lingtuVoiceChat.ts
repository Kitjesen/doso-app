import { Platform } from 'react-native';
import {
  isNativeVoiceInputAvailable,
  recognizeNativeVoiceOnce,
  speakNativeVoiceText,
  stopNativeVoiceSpeech,
} from './brainstemGrpc';
import { resolveWebDevBridgeOrigin } from './brainstemWebDevBridge';
import { validateLingtuOrigin } from './lingtuReadOnly';

export type VoiceChatServiceMode = 'conversation' | 'instruction' | 'xiaosuan';

export type XiaosuanLiveState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type XiaosuanEmotion =
  | 'neutral'
  | 'happy'
  | 'wink'
  | 'surprised'
  | 'sad'
  | 'thinking'
  | 'sleepy';

export type VoiceChatMessageSource =
  | 'voice'
  | 'app'
  | 'reminder'
  | 'web'
  | 'fast_cmd'
  | 'broadcast'
  | 'system';

export type XiaosuanTimerKind = 'pomodoro' | 'countdown';

export type XiaosuanTimerState = 'running' | 'paused' | 'completed' | 'cancelled';

export type XiaosuanTimerSnapshot = Readonly<{
  id: string;
  kind: XiaosuanTimerKind;
  label: string;
  durationSec: number;
  remainingSec: number;
  state: XiaosuanTimerState;
  autoQuiet: boolean;
}>;

export type XiaosuanActiveMoveSnapshot = Readonly<{
  active: boolean;
  direction: string;
  directionLabel: string;
  isTurn: boolean;
  current: number;
  target: number;
  unit: 'm' | 'deg';
  progress: number;
  closedLoop: boolean;
  source: string;
}>;

export type DutyProfileId = 'assistant' | 'host' | 'companion';

export type CapabilityModuleId =
  | 'robot_control'
  | 'voice_walk'
  | 'memory'
  | 'info_reminders'
  | 'vision_nav';

export type DutyProfileOption = Readonly<{
  id: DutyProfileId;
  name: string;
}>;

export type CapabilityModuleMap = Readonly<Record<CapabilityModuleId, boolean>>;

export type CapabilityHardwareStatus = Readonly<{
  camera: boolean;
  navigation: boolean;
  brainstem: boolean;
}>;

export type CapabilityModuleInfo = Readonly<{
  id: CapabilityModuleId;
  name: string;
  enabled: boolean;
  available: boolean;
  statusLabel: string;
  safetyLock?: boolean;
}>;

export type CapabilityMemoryAcl = Readonly<{
  readRooms: readonly VoiceMemoryRoom[];
  writeRooms: readonly VoiceMemoryRoom[];
  allowVoiceWrite: boolean;
}>;

export type RobotCapabilitiesSnapshot = Readonly<{
  profile: DutyProfileId;
  profileName: string;
  profiles: readonly DutyProfileOption[];
  modules: CapabilityModuleMap;
  hardware: CapabilityHardwareStatus;
  moduleList: readonly CapabilityModuleInfo[];
  memoryAcl: CapabilityMemoryAcl;
  overrides: Readonly<Partial<Record<CapabilityModuleId, boolean>>>;
  hasOverrides: boolean;
}>;

export type XiaosuanStatusSnapshot = Readonly<{
  ok: boolean;
  liveState: XiaosuanLiveState;
  emotion: XiaosuanEmotion;
  quietMode: boolean;
  volume: number | null;
  role: string;
  roleName: string;
  voice: string;
  voiceName: string;
  pendingReminders: number;
  activeTimer: XiaosuanTimerSnapshot | null;
  activeMove: XiaosuanActiveMoveSnapshot | null;
  profile: DutyProfileId;
  profileName: string;
  capabilities: RobotCapabilitiesSnapshot | null;
}>;

export type RobotVoiceStatus = XiaosuanStatusSnapshot;

export type XiaosuanPersonaOption = Readonly<{
  id: string;
  name: string;
  shortName: string;
}>;

export type XiaosuanPersonaSnapshot = Readonly<{
  roleId: string;
  roleName: string;
  voiceId: string;
  voiceName: string;
  roles: readonly XiaosuanPersonaOption[];
  voices: readonly XiaosuanPersonaOption[];
}>;

export type VoiceReminderRepeat = '' | 'daily' | 'weekdays' | 'weekly';

export type VoiceReminderItem = Readonly<{
  id: string;
  content: string;
  timeExpr: string;
  triggerAt: number | null;
  triggerAtLocal: string;
  status: string;
  repeat: VoiceReminderRepeat;
}>;

export type VoiceChatMessageItem = Readonly<{
  id: string;
  seq: number;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  turnId: string;
  kind?: string;
  toolLabel?: string;
  choices?: readonly string[];
  source?: VoiceChatMessageSource;
  speakerId?: string;
  emotion?: XiaosuanEmotion;
  tools?: readonly string[];
  ts?: number;
}>;

export type VoiceChatTurnItem = Readonly<{
  turnId: string;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  messageId?: string;
  failureReason?: string;
}>;

export type VoiceChatApprovalItem = Readonly<{
  approvalId: string;
  turnId: string;
  toolName: string;
  actionLabel: string;
  summaryText: string;
  state: 'pending' | 'approved' | 'denied' | 'cancelled';
}>;

export type VoiceConversationSnapshot = Readonly<{
  conversationId: string;
  messages: readonly VoiceChatMessageItem[];
  turns: readonly VoiceChatTurnItem[];
  approvals: readonly VoiceChatApprovalItem[];
  status?: XiaosuanStatusSnapshot;
  statusPatch?: Partial<XiaosuanStatusSnapshot>;
}>;

export type VoiceMemoryRoom =
  | 'user_long_term'
  | 'customer_knowledge'
  | 'episodic_events'
  | 'robot_behavior';

export type VoiceMemoryRoomCounts = Readonly<Record<VoiceMemoryRoom, number>>;

export type VoiceMemoryItem = Readonly<{
  id: string;
  text: string;
  room: VoiceMemoryRoom;
  pinned: boolean;
  updatedAt: string;
}>;

export type VoiceMemoryPalaceSnapshot = Readonly<{
  roomCounts: VoiceMemoryRoomCounts;
  rollingSummary: string;
  workingTurnCount: number;
  memories: readonly VoiceMemoryItem[];
}>;

export type VoiceMemoryMutationResult = Readonly<{
  ok: boolean;
  message: string;
}>;

export const ALL_VOICE_MEMORY_ROOMS: readonly VoiceMemoryRoom[] = Object.freeze([
  'user_long_term',
  'customer_knowledge',
  'episodic_events',
  'robot_behavior',
]);

export const VOICE_MEMORY_ROOM_LABELS: Readonly<Record<VoiceMemoryRoom, string>> = Object.freeze({
  user_long_term: '人物画像',
  customer_knowledge: '业务知识',
  episodic_events: '过往记录',
  robot_behavior: '交互规范',
});

export const DUTY_PROFILE_ORDER: readonly DutyProfileId[] = Object.freeze([
  'assistant',
  'host',
  'companion',
]);

export const DUTY_PROFILE_LABELS: Readonly<Record<DutyProfileId, string>> = Object.freeze({
  assistant: '日常助手',
  host: '展厅迎宾',
  companion: '家庭陪伴',
});

const DUTY_PROFILE_SHORT_NOTICES: Readonly<Record<DutyProfileId, string>> = Object.freeze({
  assistant: '已切助手',
  host: '已切迎宾',
  companion: '已切陪伴',
});

export const DEFAULT_DUTY_PROFILES: readonly DutyProfileOption[] = Object.freeze([
  Object.freeze({ id: 'assistant', name: '日常助手' }),
  Object.freeze({ id: 'host', name: '展厅迎宾' }),
  Object.freeze({ id: 'companion', name: '家庭陪伴' }),
]);

export const CAPABILITY_MODULE_ORDER: readonly CapabilityModuleId[] = Object.freeze([
  'robot_control',
  'voice_walk',
  'memory',
  'info_reminders',
  'vision_nav',
]);

export const CAPABILITY_MODULE_LABELS: Readonly<Record<CapabilityModuleId, string>> = Object.freeze({
  robot_control: '语音控狗',
  voice_walk: '语音走动',
  memory: '长期记忆',
  info_reminders: '联网与提醒',
  vision_nav: '视觉与导航',
});

const PROFILE_DEFAULT_MODULES: Readonly<Record<DutyProfileId, CapabilityModuleMap>> = Object.freeze({
  assistant: Object.freeze({
    robot_control: true,
    voice_walk: false,
    memory: true,
    info_reminders: true,
    vision_nav: false,
  }),
  host: Object.freeze({
    robot_control: true,
    voice_walk: false,
    memory: true,
    info_reminders: false,
    vision_nav: false,
  }),
  companion: Object.freeze({
    robot_control: true,
    voice_walk: false,
    memory: true,
    info_reminders: true,
    vision_nav: false,
  }),
});

const HOST_MEMORY_ROOMS: readonly VoiceMemoryRoom[] = Object.freeze([
  'customer_knowledge',
  'robot_behavior',
]);

export const DEFAULT_LEGACY_CAPABILITIES: RobotCapabilitiesSnapshot = Object.freeze({
  profile: 'assistant',
  profileName: '日常助手',
  profiles: DEFAULT_DUTY_PROFILES,
  modules: Object.freeze({
    robot_control: true,
    voice_walk: false,
    memory: true,
    info_reminders: true,
    vision_nav: true,
  }),
  hardware: Object.freeze({
    camera: true,
    navigation: true,
    brainstem: true,
  }),
  moduleList: Object.freeze([
    Object.freeze({ id: 'robot_control', name: '语音控狗', enabled: true, available: true, statusLabel: '已开' }),
    Object.freeze({ id: 'voice_walk', name: '语音走动', enabled: false, available: true, statusLabel: '已锁定', safetyLock: true }),
    Object.freeze({ id: 'memory', name: '长期记忆', enabled: true, available: true, statusLabel: '已开' }),
    Object.freeze({ id: 'info_reminders', name: '联网与提醒', enabled: true, available: true, statusLabel: '已开' }),
    Object.freeze({ id: 'vision_nav', name: '视觉与导航', enabled: true, available: true, statusLabel: '已开' }),
  ]),
  memoryAcl: Object.freeze({
    readRooms: ALL_VOICE_MEMORY_ROOMS,
    writeRooms: ALL_VOICE_MEMORY_ROOMS,
    allowVoiceWrite: true,
  }),
  overrides: Object.freeze({}),
  hasOverrides: false,
});

export const DEFAULT_XIAOSUAN_ROLES: readonly XiaosuanPersonaOption[] = Object.freeze([
  Object.freeze({ id: 'xiaosuan', name: '伙伴', shortName: '伙伴' }),
  Object.freeze({ id: 'guide', name: '导览', shortName: '导览' }),
  Object.freeze({ id: 'companion', name: '陪伴', shortName: '陪伴' }),
  Object.freeze({ id: 'english', name: '英语', shortName: '英语' }),
  Object.freeze({ id: 'concise', name: '极简', shortName: '极简' }),
]);

export const DEFAULT_XIAOSUAN_VOICES: readonly XiaosuanPersonaOption[] = Object.freeze([
  Object.freeze({ id: 'xiaosuan', name: '小何', shortName: '小何' }),
  Object.freeze({ id: 'gentle', name: '思思', shortName: '思思' }),
  Object.freeze({ id: 'male', name: '青年', shortName: '青年' }),
  Object.freeze({ id: 'guide', name: '女孩', shortName: '女孩' }),
]);

const ROLE_SHORT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  xiaosuan: '伙伴',
  guide: '导览',
  companion: '陪伴',
  english: '英语',
  concise: '极简',
});

const VOICE_SHORT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  xiaosuan: '小何',
  gentle: '思思',
  male: '青年',
  guide: '女孩',
});

export const VOICE_REMINDER_REPEAT_LABELS: Readonly<Record<VoiceReminderRepeat, string>> = Object.freeze({
  '': '单次',
  daily: '每天',
  weekdays: '工作日',
  weekly: '每周',
});

export const DEFAULT_XIAOSUAN_STATUS: XiaosuanStatusSnapshot = Object.freeze({
  ok: false,
  liveState: 'idle',
  emotion: 'neutral',
  quietMode: false,
  volume: null,
  role: 'xiaosuan',
  roleName: '伙伴',
  voice: 'xiaosuan',
  voiceName: '小何',
  pendingReminders: 0,
  activeTimer: null,
  activeMove: null,
  profile: 'assistant',
  profileName: '日常助手',
  capabilities: null,
});

export const EMPTY_VOICE_MEMORY_ROOM_COUNTS: VoiceMemoryRoomCounts = Object.freeze({
  user_long_term: 0,
  customer_knowledge: 0,
  episodic_events: 0,
  robot_behavior: 0,
});

const VALID_MEMORY_ROOMS: ReadonlySet<VoiceMemoryRoom> = new Set([
  'user_long_term',
  'customer_knowledge',
  'episodic_events',
  'robot_behavior',
]);

function normalizeVoiceMemoryRoom(value: unknown): VoiceMemoryRoom {
  if (typeof value === 'string' && VALID_MEMORY_ROOMS.has(value as VoiceMemoryRoom)) {
    return value as VoiceMemoryRoom;
  }
  return 'customer_knowledge';
}

function normalizeLiveState(value: unknown): XiaosuanLiveState {
  if (value === 'listening' || value === 'thinking' || value === 'speaking' || value === 'idle') {
    return value;
  }
  if (value === 'speaking_tts' || value === 'playing') return 'speaking';
  if (value === 'processing' || value === 'running') return 'thinking';
  if (value === 'awake' || value === 'recording') return 'listening';
  return 'idle';
}

function normalizeEmotion(value: unknown): XiaosuanEmotion {
  if (
    value === 'neutral'
    || value === 'happy'
    || value === 'wink'
    || value === 'surprised'
    || value === 'sad'
    || value === 'thinking'
    || value === 'sleepy'
  ) {
    return value;
  }
  if (value === 'laughing' || value === 'excited' || value === 'loving') return 'happy';
  if (value === 'confused' || value === 'curious') return 'thinking';
  if (value === 'crying' || value === 'embarrassed') return 'sad';
  return 'neutral';
}

function normalizeVolume(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSource(value: unknown): VoiceChatMessageSource | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  if (key === 'reminder') return 'reminder';
  if (key === 'broadcast' || key === 'intercom') return 'broadcast';
  if (key === 'voice' || key === 'mic' || key === 'board' || key === 'stt') return 'voice';
  if (key === 'app') return 'app';
  if (key === 'web' || key === 'text') return 'web';
  if (key === 'fast_cmd' || key === 'command' || key === 'robot' || key === 'volume' || key === 'device') return 'fast_cmd';
  if (key === 'system') return 'system';
  return undefined;
}

function normalizeReminderRepeat(value: unknown): VoiceReminderRepeat {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  if (key === 'daily' || key === 'weekdays' || key === 'weekly') return key;
  return '';
}

export function formatReminderRepeatLabel(repeat: VoiceReminderRepeat | string | null | undefined): string | null {
  const normalized = normalizeReminderRepeat(repeat);
  if (!normalized) return null;
  return VOICE_REMINDER_REPEAT_LABELS[normalized];
}

export function formatTimerCountdown(remainingSec: number | null | undefined): string {
  const clamped = typeof remainingSec === 'number' && Number.isFinite(remainingSec)
    ? Math.max(0, Math.floor(remainingSec))
    : 0;
  const hours = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

export function formatXiaosuanLiveStateLabel(state: XiaosuanLiveState): string {
  switch (state) {
    case 'listening':
      return '聆听中';
    case 'thinking':
      return '思考中';
    case 'speaking':
      return '播报中';
    default:
      return '待机';
  }
}

export function formatXiaosuanEmotionLabel(emotion: XiaosuanEmotion | string | null | undefined): string | null {
  if (!emotion) return null;
  switch (normalizeEmotion(emotion)) {
    case 'happy':
      return '开心';
    case 'wink':
      return '俏皮';
    case 'thinking':
      return '思考';
    case 'sad':
      return '关心';
    case 'surprised':
      return '惊喜';
    case 'sleepy':
      return '困倦';
    default:
      return null;
  }
}

export function formatTranscriptSourceBadge(source: VoiceChatMessageSource | string | null | undefined): string | null {
  if (!source) return null;
  const normalized = normalizeSource(source);
  if (normalized === 'voice') return '语音';
  if (normalized === 'reminder') return '提醒';
  if (normalized === 'broadcast') return '传话';
  return null;
}

export function formatXiaosuanRoleShortName(idOrName: string | null | undefined): string {
  const clean = typeof idOrName === 'string' ? idOrName.trim() : '';
  if (!clean) return '伙伴';
  const mapped = ROLE_SHORT_NAMES[clean.toLowerCase()];
  if (mapped) return mapped;
  if (clean.includes('导览')) return '导览';
  if (clean.includes('陪伴')) return '陪伴';
  if (clean.includes('英语')) return '英语';
  if (clean.includes('极简')) return '极简';
  if (clean.includes('小算') || clean.includes('伙伴')) return '伙伴';
  return clean.slice(0, 4);
}

export function formatXiaosuanVoiceShortName(idOrName: string | null | undefined): string {
  const clean = typeof idOrName === 'string' ? idOrName.trim() : '';
  if (!clean) return '小何';
  const mapped = VOICE_SHORT_NAMES[clean.toLowerCase()];
  if (mapped) return mapped;
  if (clean.includes('小何')) return '小何';
  if (clean.includes('思思') || clean.includes('温柔')) return '思思';
  if (clean.includes('青年') || clean.includes('男')) return '青年';
  if (clean.includes('女孩') || clean.includes('导览') || clean.includes('活泼')) return '女孩';
  return clean.slice(0, 4);
}

export function formatReminderTriggerShort(
  item: Pick<VoiceReminderItem, 'triggerAtLocal' | 'triggerAt' | 'timeExpr'>,
): string {
  const rawLocal = (item.triggerAtLocal || '').trim();
  if (rawLocal) {
    const match = rawLocal.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    if (match) {
      const now = new Date();
      const sameDay =
        Number(match[1]) === now.getFullYear()
        && Number(match[2]) === now.getMonth() + 1
        && Number(match[3]) === now.getDate();
      return sameDay ? `今天 ${match[4]}` : `${match[2]}-${match[3]} ${match[4]}`;
    }
    return rawLocal.slice(0, 16);
  }
  if (typeof item.triggerAt === 'number' && Number.isFinite(item.triggerAt) && item.triggerAt > 0) {
    const dt = new Date(item.triggerAt * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const sameDay =
      dt.getFullYear() === now.getFullYear()
      && dt.getMonth() === now.getMonth()
      && dt.getDate() === now.getDate();
    const hm = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    return sameDay ? `今天 ${hm}` : `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${hm}`;
  }
  return item.timeExpr.trim() || '待触发';
}

function parseTimerPayload(raw: unknown): XiaosuanTimerSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const rawState = typeof rec.state === 'string' ? rec.state.trim().toLowerCase() : '';
  const state: XiaosuanTimerState | null =
    rawState === 'running' || rawState === 'paused' || rawState === 'completed' || rawState === 'cancelled'
      ? rawState
      : null;
  if (!state || state === 'completed' || state === 'cancelled') return null;
  const id = typeof rec.id === 'string' && rec.id.trim() ? rec.id.trim() : 'timer_active';
  const rawKind = typeof rec.kind === 'string' ? rec.kind.trim().toLowerCase() : '';
  const kind: XiaosuanTimerKind = rawKind === 'pomodoro' || rawKind === 'focus' ? 'pomodoro' : 'countdown';
  const durationRaw = rec.duration_sec ?? rec.durationSec;
  const remainingRaw = rec.remaining_sec ?? rec.remainingSec;
  const durationSec = typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0
    ? Math.floor(durationRaw)
    : 0;
  const remainingSec = typeof remainingRaw === 'number' && Number.isFinite(remainingRaw) && remainingRaw >= 0
    ? Math.floor(remainingRaw)
    : durationSec;
  const rawLabel = typeof rec.label === 'string' && rec.label.trim()
    ? rec.label.trim().slice(0, 12)
    : kind === 'pomodoro'
      ? '专注'
      : '倒计时';
  return {
    id,
    kind,
    label: rawLabel,
    durationSec: Math.max(durationSec, remainingSec),
    remainingSec,
    state,
    autoQuiet: rec.auto_quiet === true || rec.autoQuiet === true,
  };
}

function parseActiveMovePayload(raw: unknown): XiaosuanActiveMoveSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.active !== true) return null;
  const targetRaw = rec.target;
  const target = typeof targetRaw === 'number' && Number.isFinite(targetRaw) && targetRaw > 0 ? targetRaw : 0;
  if (target <= 0) return null;
  const currentRaw = rec.current;
  const current = typeof currentRaw === 'number' && Number.isFinite(currentRaw) && currentRaw >= 0 ? currentRaw : 0;
  const unitRaw = typeof rec.unit === 'string' ? rec.unit.trim().toLowerCase() : '';
  const isTurn = rec.is_turn === true || rec.isTurn === true || unitRaw === 'deg';
  const unit: 'm' | 'deg' = isTurn ? 'deg' : 'm';
  const progressRaw = rec.progress;
  const progress = typeof progressRaw === 'number' && Number.isFinite(progressRaw)
    ? Math.max(0, Math.min(1, progressRaw))
    : Math.max(0, Math.min(1, current / target));
  const direction = typeof rec.direction === 'string' && rec.direction.trim() ? rec.direction.trim() : 'forward';
  const rawLabel = typeof rec.direction_label === 'string' && rec.direction_label.trim()
    ? rec.direction_label.trim()
    : typeof rec.directionLabel === 'string' && rec.directionLabel.trim()
      ? rec.directionLabel.trim()
      : '移动';
  const source = typeof rec.source === 'string' && rec.source.trim() ? rec.source.trim() : 'open_loop';
  return {
    active: true,
    direction,
    directionLabel: rawLabel.slice(0, 8),
    isTurn,
    current: Number(current.toFixed(isTurn ? 1 : 2)),
    target: Number(target.toFixed(isTurn ? 1 : 2)),
    unit,
    progress,
    closedLoop: rec.closed_loop === true || rec.closedLoop === true,
    source,
  };
}

function normalizeDutyProfileId(value: unknown): DutyProfileId {
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (key === 'assistant' || key === 'host' || key === 'companion') return key;
  }
  return 'assistant';
}

function isCapabilityModuleId(value: unknown): value is CapabilityModuleId {
  return (
    value === 'robot_control'
    || value === 'voice_walk'
    || value === 'memory'
    || value === 'info_reminders'
    || value === 'vision_nav'
  );
}

export function formatDutyProfileName(profile: DutyProfileId | string | null | undefined, explicitName?: string | null): string {
  const id = normalizeDutyProfileId(profile);
  const cleanExplicit = typeof explicitName === 'string' ? explicitName.trim() : '';
  if (cleanExplicit && /^[\u4e00-\u9fa5]{2,6}$/.test(cleanExplicit)) {
    return cleanExplicit;
  }
  return DUTY_PROFILE_LABELS[id];
}

function parseMemoryRoomList(raw: unknown, fallback: readonly VoiceMemoryRoom[]): readonly VoiceMemoryRoom[] {
  if (!Array.isArray(raw)) return fallback;
  const result: VoiceMemoryRoom[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && VALID_MEMORY_ROOMS.has(item as VoiceMemoryRoom)) {
      const room = item as VoiceMemoryRoom;
      if (!result.includes(room)) result.push(room);
    }
  }
  return result;
}

export function parseRobotCapabilitiesPayload(
  raw: unknown,
  fallbackProfile?: unknown,
  fallbackProfileName?: unknown,
): RobotCapabilitiesSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const hasAnyCapField =
    'modules' in rec
    || 'module_list' in rec
    || 'moduleList' in rec
    || 'memory_acl' in rec
    || 'memoryAcl' in rec
    || 'hardware' in rec
    || 'profile' in rec
    || 'profiles' in rec;
  if (!hasAnyCapField) return null;

  const profile = normalizeDutyProfileId(rec.profile ?? fallbackProfile);
  const profileName = formatDutyProfileName(
    profile,
    typeof rec.profile_name === 'string'
      ? rec.profile_name
      : typeof rec.profileName === 'string'
        ? rec.profileName
        : typeof fallbackProfileName === 'string'
          ? fallbackProfileName
          : null,
  );

  const rawProfiles = Array.isArray(rec.profiles) ? rec.profiles : [];
  const parsedProfiles: DutyProfileOption[] = [];
  for (const item of rawProfiles) {
    if (typeof item === 'string') {
      const pid = normalizeDutyProfileId(item);
      if (!parsedProfiles.some(p => p.id === pid)) {
        parsedProfiles.push({ id: pid, name: DUTY_PROFILE_LABELS[pid] });
      }
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    const rawId = obj.id ?? obj.key;
    if (rawId !== 'assistant' && rawId !== 'host' && rawId !== 'companion') continue;
    if (!parsedProfiles.some(p => p.id === rawId)) {
      parsedProfiles.push({
        id: rawId,
        name: formatDutyProfileName(rawId, typeof obj.name === 'string' ? obj.name : null),
      });
    }
  }
  const profiles = parsedProfiles.length > 0 ? parsedProfiles : DEFAULT_DUTY_PROFILES;

  const rawModulesObj = rec.modules && typeof rec.modules === 'object' && !Array.isArray(rec.modules)
    ? (rec.modules as Record<string, unknown>)
    : null;
  const rawModuleList = Array.isArray(rec.module_list)
    ? rec.module_list
    : Array.isArray(rec.moduleList)
      ? rec.moduleList
      : [];

  const listMap = new Map<CapabilityModuleId, Record<string, unknown>>();
  for (const item of rawModuleList) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const obj = item as Record<string, unknown>;
    if (isCapabilityModuleId(obj.id)) {
      listMap.set(obj.id, obj);
    }
  }

  const defaultMods = PROFILE_DEFAULT_MODULES[profile];
  const resolveModBool = (id: CapabilityModuleId): boolean => {
    if (rawModulesObj && typeof rawModulesObj[id] === 'boolean') return rawModulesObj[id] as boolean;
    const listEntry = listMap.get(id);
    if (listEntry && typeof listEntry.enabled === 'boolean') return listEntry.enabled;
    return defaultMods[id];
  };
  const robotControlOn = resolveModBool('robot_control');
  const modules: CapabilityModuleMap = {
    robot_control: robotControlOn,
    voice_walk: robotControlOn ? resolveModBool('voice_walk') : false,
    memory: resolveModBool('memory'),
    info_reminders: resolveModBool('info_reminders'),
    vision_nav: resolveModBool('vision_nav'),
  };

  const rawHw = rec.hardware && typeof rec.hardware === 'object' && !Array.isArray(rec.hardware)
    ? (rec.hardware as Record<string, unknown>)
    : null;
  const hasExplicitHw = rawHw !== null;
  const hardware: CapabilityHardwareStatus = {
    camera: hasExplicitHw ? rawHw.camera === true : modules.vision_nav,
    navigation: hasExplicitHw ? rawHw.navigation === true : modules.vision_nav,
    brainstem: hasExplicitHw ? rawHw.brainstem !== false : true,
  };

  const moduleList: CapabilityModuleInfo[] = CAPABILITY_MODULE_ORDER.map(id => {
    const entry = listMap.get(id);
    const available = id === 'voice_walk'
      ? (modules.robot_control && (entry && typeof entry.available === 'boolean' ? entry.available : true))
      : entry && typeof entry.available === 'boolean'
        ? entry.available
        : id === 'vision_nav'
          ? (hasExplicitHw ? (hardware.camera || hardware.navigation) : true)
          : true;
    const enabled = available ? modules[id] : false;
    const safetyLock = entry
      ? (typeof entry.safety_lock === 'boolean'
        ? entry.safety_lock
        : typeof entry.safetyLock === 'boolean'
          ? entry.safetyLock
          : id === 'voice_walk')
      : id === 'voice_walk';
    const rawName = entry && typeof entry.name === 'string' && /^[\u4e00-\u9fa5]{2,6}$/.test(entry.name.trim())
      ? entry.name.trim()
      : CAPABILITY_MODULE_LABELS[id];
    const rawStatus = entry
      ? (typeof entry.status_label === 'string' ? entry.status_label.trim() : typeof entry.statusLabel === 'string' ? entry.statusLabel.trim() : '')
      : '';
    const fallbackStatus = !available
      ? (id === 'voice_walk' && !modules.robot_control ? '需开控狗' : '未接硬件')
      : safetyLock
        ? (enabled ? '已解锁' : '已锁定')
        : (enabled ? '已开' : '已关');
    const statusLabel = rawStatus && /^[\u4e00-\u9fa5]{2,6}$/.test(rawStatus)
      ? rawStatus
      : fallbackStatus;
    return {
      id,
      name: rawName,
      enabled,
      available,
      statusLabel,
      ...(safetyLock ? { safetyLock: true } : {}),
    };
  });

  const rawAcl = (rec.memory_acl ?? rec.memoryAcl);
  const aclObj = rawAcl && typeof rawAcl === 'object' && !Array.isArray(rawAcl)
    ? (rawAcl as Record<string, unknown>)
    : null;
  const defaultReadRooms = profile === 'host' ? HOST_MEMORY_ROOMS : ALL_VOICE_MEMORY_ROOMS;
  const defaultWriteRooms = profile === 'host' ? [] : ALL_VOICE_MEMORY_ROOMS;
  const memoryAcl: CapabilityMemoryAcl = {
    readRooms: aclObj ? parseMemoryRoomList(aclObj.read_rooms ?? aclObj.readRooms, defaultReadRooms) : defaultReadRooms,
    writeRooms: aclObj ? parseMemoryRoomList(aclObj.write_rooms ?? aclObj.writeRooms, defaultWriteRooms) : defaultWriteRooms,
    allowVoiceWrite: aclObj
      ? (typeof aclObj.allow_voice_write === 'boolean'
        ? aclObj.allow_voice_write
        : typeof aclObj.allowVoiceWrite === 'boolean'
          ? aclObj.allowVoiceWrite
          : profile !== 'host')
      : profile !== 'host',
  };

  const rawOverrides = rec.overrides && typeof rec.overrides === 'object' && !Array.isArray(rec.overrides)
    ? (rec.overrides as Record<string, unknown>)
    : null;
  const overrides: Partial<Record<CapabilityModuleId, boolean>> = {};
  if (rawOverrides) {
    for (const [k, v] of Object.entries(rawOverrides)) {
      if (isCapabilityModuleId(k) && typeof v === 'boolean') {
        overrides[k] = v;
      }
    }
  }
  const hasOverrides = typeof rec.has_overrides === 'boolean'
    ? rec.has_overrides
    : typeof rec.hasOverrides === 'boolean'
      ? rec.hasOverrides
      : Object.keys(overrides).length > 0;

  return {
    profile,
    profileName,
    profiles,
    modules: {
      robot_control: moduleList[0].enabled,
      voice_walk: moduleList[1].enabled,
      memory: moduleList[2].enabled,
      info_reminders: moduleList[3].enabled,
      vision_nav: moduleList[4].enabled,
    },
    hardware,
    moduleList,
    memoryAcl,
    overrides,
    hasOverrides,
  };
}

export function parseXiaosuanStatusPayload(data: Record<string, unknown> | null): XiaosuanStatusSnapshot {
  if (!data) return DEFAULT_XIAOSUAN_STATUS;
  const rawRoleObj = data.role && typeof data.role === 'object' && !Array.isArray(data.role)
    ? (data.role as Record<string, unknown>)
    : null;
  const rawVoiceObj = data.voice && typeof data.voice === 'object' && !Array.isArray(data.voice)
    ? (data.voice as Record<string, unknown>)
    : null;

  const roleId = typeof data.role === 'string' && data.role.trim()
    ? data.role.trim()
    : typeof rawRoleObj?.key === 'string' && rawRoleObj.key.trim()
      ? rawRoleObj.key.trim()
      : typeof rawRoleObj?.role === 'string' && rawRoleObj.role.trim()
        ? rawRoleObj.role.trim()
        : DEFAULT_XIAOSUAN_STATUS.role;
  const roleNameRaw = typeof data.role_name === 'string' && data.role_name.trim()
    ? data.role_name.trim()
    : typeof rawRoleObj?.name === 'string' && rawRoleObj.name.trim()
      ? rawRoleObj.name.trim()
      : roleId;

  const voiceId = typeof data.voice === 'string' && data.voice.trim()
    ? data.voice.trim()
    : typeof rawVoiceObj?.key === 'string' && rawVoiceObj.key.trim()
      ? rawVoiceObj.key.trim()
      : DEFAULT_XIAOSUAN_STATUS.voice;
  const voiceNameRaw = typeof data.voice_name === 'string' && data.voice_name.trim()
    ? data.voice_name.trim()
    : typeof rawVoiceObj?.name === 'string' && rawVoiceObj.name.trim()
      ? rawVoiceObj.name.trim()
      : voiceId;

  const liveRaw = data.live_state ?? data.activity ?? (data.speaking === true ? 'speaking' : undefined);
  const quietRaw = data.quiet_mode ?? data.quiet;
  const pendingRaw = data.pending_reminders;
  const pendingReminders = typeof pendingRaw === 'number' && Number.isFinite(pendingRaw) && pendingRaw >= 0
    ? Math.floor(pendingRaw)
    : 0;

  const rawCaps = data.capabilities && typeof data.capabilities === 'object' && !Array.isArray(data.capabilities)
    ? data.capabilities
    : ('profile' in data ? { profile: data.profile, profile_name: data.profile_name } : null);
  const capabilities = rawCaps ? parseRobotCapabilitiesPayload(rawCaps, data.profile, data.profile_name) : null;
  const profile = capabilities ? capabilities.profile : normalizeDutyProfileId(data.profile);
  const profileName = capabilities
    ? capabilities.profileName
    : formatDutyProfileName(profile, typeof data.profile_name === 'string' ? data.profile_name : null);

  return {
    ok: data.ok === true,
    liveState: normalizeLiveState(liveRaw),
    emotion: normalizeEmotion(data.emotion),
    quietMode: quietRaw === true,
    volume: normalizeVolume(data.volume),
    role: roleId,
    roleName: formatXiaosuanRoleShortName(roleNameRaw),
    voice: voiceId,
    voiceName: formatXiaosuanVoiceShortName(voiceNameRaw),
    pendingReminders,
    activeTimer: parseTimerPayload(data.active_timer),
    activeMove: parseActiveMovePayload(data.active_move ?? data.activeMove),
    profile,
    profileName,
    capabilities,
  };
}

function hasStatusFields(data: Record<string, unknown> | null): boolean {
  if (!data) return false;
  return (
    'live_state' in data
    || 'activity' in data
    || 'emotion' in data
    || 'quiet_mode' in data
    || 'quiet' in data
    || 'volume' in data
    || 'role' in data
    || 'voice' in data
    || 'pending_reminders' in data
    || 'active_timer' in data
    || 'active_move' in data
    || 'activeMove' in data
    || 'profile' in data
    || 'profile_name' in data
    || 'capabilities' in data
  );
}

export type VoiceTargetOptions = Readonly<{
  origin: string;
  viewerToken?: string;
  allowLocalHttp?: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}>;

export class LingtuVoiceChatError extends Error {
  constructor(
    readonly code: 'config' | 'unavailable' | 'timeout' | 'cancelled' | 'busy' | 'rejected',
    message: string,
    readonly httpStatus = 0,
  ) {
    super(message);
    this.name = 'LingtuVoiceChatError';
  }
}

const TOOL_LABELS: Readonly<Record<string, string>> = {
  get_robot_capabilities: '读取状态',
  read_robot_sensor: '读取状态',
  capture_camera: '拍摄画面',
  view_live_camera: '查看相机',
  inspect_lidar: '查看环境',
  inspect_navigation: '检查导航',
  navigate_to: '前往目标点',
  navigate_to_object: '前往目标物',
  navigate_to_deg: '转向目标',
  find_object: '查找目标',
  detect_object: '识别目标',
  list_saved_maps: '读取地图',
  inspect_saved_map: '检查地图',
  find_inspection_points: '查找巡检点',
  get_inspection_status: '巡检状态',
  follow_person: '跟随目标',
  cancel_agent_task: '取消任务',
  get_runtime_mode: '运行模式',
  switch_runtime_mode: '切换模式',
  preview_navigation: '预览路径',
  start_navigation: '发起导航',
  get_navigation_status: '导航状态',
  cancel_navigation: '取消导航',
  pause_navigation: '暂停导航',
  resume_navigation: '恢复导航',
  set_navigation_speed: '调整限速',
  list_inspection_routes: '巡检路线',
  start_inspection_route: '启动巡检',
  run_python: '执行分析',
  save_map_copy: '保存地图',
  web_search: '联网查询',
  get_lunar_calendar: '查询日历',
  look_around: '观察周围',
  navigate_to_place: '前往地点',
  remember_fact: '记录记忆',
  forget_memory: '遗忘记忆',
  set_reminder: '设置提醒',
  list_reminders: '查看提醒',
  cancel_reminder: '取消提醒',
  snooze_reminder: '延后提醒',
  change_role_or_voice: '切换风格',
  set_quiet_mode: '轻声模式',
  set_volume: '调节音量',
  set_speaker_volume: '调节音量',
  robot_posture: '切换姿态',
  play_robot_gesture: '动作控制',
  set_robot_height: '调节身高',
  control_robot_dog: '动作控制',
  robot_action: '动作控制',
  move_robot: '运动控制',
  get_robot_status: '读取状态',
  manage_timer: '定时专注',
  daily_briefing: '今日早报',
  broadcast: '传话播报',
};

export function formatVoiceToolLabel(name: string | null | undefined): string {
  if (!name) return '执行操作';
  const clean = name.trim();
  if (!clean) return '执行操作';
  if (TOOL_LABELS[clean]) return TOOL_LABELS[clean];
  // Preserve already-localized short Chinese labels.
  if (/^[\u4e00-\u9fa5]{2,8}$/.test(clean)) return clean;
  return '执行操作';
}

function summarizeApprovalArgs(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'start_navigation') {
    const x = typeof args.x === 'number' && Number.isFinite(args.x) ? args.x.toFixed(1) : null;
    const y = typeof args.y === 'number' && Number.isFinite(args.y) ? args.y.toFixed(1) : null;
    if (x !== null && y !== null) return `目标 ${x}, ${y} m`;
  }
  if (toolName === 'switch_runtime_mode' && typeof args.mode === 'string' && args.mode.trim()) {
    return `切换至 ${args.mode.trim()}`;
  }
  if (typeof args.target === 'string' && args.target.trim()) {
    return args.target.trim().slice(0, 48);
  }
  return formatVoiceToolLabel(toolName);
}

export function resolveRobotVoiceOrigin(options: {
  endpoint?: string | null;
  host?: string | null;
  allowLocalHttp?: boolean;
}): string | null {
  const allowLocal = options.allowLocalHttp === true;
  if (typeof options.endpoint === 'string' && options.endpoint.trim()) {
    try {
      return validateLingtuOrigin(options.endpoint.trim(), allowLocal);
    } catch {
      return null;
    }
  }
  if (typeof options.host === 'string' && options.host.trim()) {
    const cleanHost = options.host.trim().replace(/^\[|\]$/g, '');
    if (!cleanHost) return null;
    const authority = cleanHost.includes(':') ? `[${cleanHost}]` : cleanHost;
    try {
      return validateLingtuOrigin(`http://${authority}:5050`, allowLocal);
    } catch {
      return null;
    }
  }
  return null;
}

function shouldUseWebDevLanProxy(origin: string, customFetch?: typeof fetch): boolean {
  if (customFetch) return false;
  if (Platform.OS !== 'web') return false;
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;
  if (!isDev || !origin.startsWith('http://')) return false;
  if (typeof window !== 'undefined' && window.location?.origin === origin) return false;
  return true;
}

async function requestVoiceJson(
  target: VoiceTargetOptions,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  payload?: Record<string, unknown>,
  timeoutMs = 8_000,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const origin = validateLingtuOrigin(target.origin, target.allowLocalHttp === true);
  if (target.signal?.aborted) {
    throw new LingtuVoiceChatError('cancelled', '已取消');
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  target.signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (shouldUseWebDevLanProxy(origin, target.fetchImpl)) {
      const parsed = new URL(origin);
      const bridgeOrigin = resolveWebDevBridgeOrigin();
      const response = await globalThis.fetch(`${bridgeOrigin}/api/v1/dev-lan/lingtu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          host: parsed.hostname.replace(/^\[|\]$/g, ''),
          port: parsed.port ? Number(parsed.port) : 5050,
          method,
          path,
          ...(payload !== undefined ? { payload } : {}),
        }),
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
      const bridgeBody = await response.json().catch(() => null) as {
        ok?: unknown;
        code?: unknown;
        data?: { status?: unknown; payload?: unknown };
      } | null;
      if (!bridgeBody || bridgeBody.ok !== true || !bridgeBody.data) {
        const code = bridgeBody?.code === 'timeout' ? 'timeout' : 'unavailable';
        throw new LingtuVoiceChatError(code, code === 'timeout' ? '响应超时' : '未就绪', response.status);
      }
      const upstreamStatus = typeof bridgeBody.data.status === 'number' ? bridgeBody.data.status : 502;
      const upstreamPayload = bridgeBody.data.payload && typeof bridgeBody.data.payload === 'object' && !Array.isArray(bridgeBody.data.payload)
        ? (bridgeBody.data.payload as Record<string, unknown>)
        : null;
      return { status: upstreamStatus, data: upstreamPayload };
    }

    const fetchFn = target.fetchImpl ?? (typeof fetch === 'function' ? fetch : globalThis.fetch.bind(globalThis));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (target.viewerToken && origin.startsWith('https://')) {
      headers.Authorization = `Bearer ${target.viewerToken}`;
    }
    const response = await fetchFn(`${origin}${path}`, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      credentials: 'omit',
      redirect: 'error',
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    return {
      status: response.status,
      data: data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null,
    };
  } catch (error) {
    if (error instanceof LingtuVoiceChatError) throw error;
    if (target.signal?.aborted) throw new LingtuVoiceChatError('cancelled', '已取消');
    if (controller.signal.aborted) throw new LingtuVoiceChatError('timeout', '响应超时');
    throw new LingtuVoiceChatError('unavailable', '未就绪');
  } finally {
    clearTimeout(timer);
    target.signal?.removeEventListener('abort', onAbort);
  }
}

function extractErrorMessage(status: number, data: Record<string, unknown> | null): LingtuVoiceChatError {
  const detail = data?.detail && typeof data.detail === 'object' ? (data.detail as Record<string, unknown>) : null;
  const reason = String(detail?.reason ?? data?.reason ?? data?.error ?? '');
  if (reason === 'conversation_active' || reason === 'turn_active') {
    return new LingtuVoiceChatError('busy', '回复中', status);
  }
  if (status === 503 || reason === 'agent_unavailable') {
    return new LingtuVoiceChatError('unavailable', '未就绪', status);
  }
  if (status === 409) {
    return new LingtuVoiceChatError('busy', '操作冲突', status);
  }
  return new LingtuVoiceChatError('rejected', '请求失败', status);
}

function deriveXiaosuanVoiceOrigin(origin: string, allowLocalHttp = false): string | null {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.port === '8770') return origin;
    const host = parsed.hostname.includes(':') && !parsed.hostname.startsWith('[')
      ? `[${parsed.hostname}]`
      : parsed.hostname;
    const candidate = `${parsed.protocol}//${host}:8770`;
    return validateLingtuOrigin(candidate, allowLocalHttp);
  } catch {
    return null;
  }
}

export function resolveXiaosuanTarget(target: VoiceTargetOptions): VoiceTargetOptions {
  const origin = deriveXiaosuanVoiceOrigin(target.origin, target.allowLocalHttp === true);
  if (!origin) {
    throw new LingtuVoiceChatError('config', '地址无效');
  }
  return origin === target.origin ? target : { ...target, origin };
}

function parseMemoryRoomCounts(
  rawCounts: unknown,
  memories: readonly VoiceMemoryItem[],
): VoiceMemoryRoomCounts {
  const derived: Record<VoiceMemoryRoom, number> = {
    user_long_term: 0,
    customer_knowledge: 0,
    episodic_events: 0,
    robot_behavior: 0,
  };
  for (const item of memories) {
    derived[item.room] += 1;
  }
  if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) {
    return derived;
  }
  const obj = rawCounts as Record<string, unknown>;
  const pick = (room: VoiceMemoryRoom): number => {
    const val = obj[room];
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      return Math.floor(val);
    }
    return derived[room];
  };
  return {
    user_long_term: pick('user_long_term'),
    customer_knowledge: pick('customer_knowledge'),
    episodic_events: pick('episodic_events'),
    robot_behavior: pick('robot_behavior'),
  };
}

function extractMemoryError(status: number, data: Record<string, unknown> | null): LingtuVoiceChatError {
  if (status === 404 || status === 503) {
    return new LingtuVoiceChatError('unavailable', '未就绪', status);
  }
  return extractErrorMessage(status, data);
}

export async function fetchXiaosuanStatus(
  target: VoiceTargetOptions,
): Promise<XiaosuanStatusSnapshot> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/status', undefined, 3_500);
  if (res.status < 200 || res.status >= 300 || !res.data) {
    throw extractErrorMessage(res.status, res.data);
  }
  return parseXiaosuanStatusPayload(res.data);
}

export async function readXiaosuanCapabilities(
  target: VoiceTargetOptions,
): Promise<RobotCapabilitiesSnapshot> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/capabilities', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  const parsed = parseRobotCapabilitiesPayload(res.data);
  if (!parsed) {
    throw new LingtuVoiceChatError('rejected', '读取失败', res.status);
  }
  return parsed;
}

export async function updateXiaosuanCapabilities(
  target: VoiceTargetOptions,
  options: {
    profile?: DutyProfileId;
    overrides?: Partial<Record<CapabilityModuleId, boolean>>;
    reset?: boolean;
  },
): Promise<Readonly<{ ok: boolean; capabilities: RobotCapabilitiesSnapshot; message: string }>> {
  const payload: Record<string, unknown> = {};
  if (options.profile === 'assistant' || options.profile === 'host' || options.profile === 'companion') {
    payload.profile = options.profile;
  }
  const cleanOverrides: Partial<Record<CapabilityModuleId, boolean>> = {};
  if (options.overrides) {
    for (const [k, v] of Object.entries(options.overrides)) {
      if (isCapabilityModuleId(k) && typeof v === 'boolean') {
        cleanOverrides[k] = v;
      }
    }
  }
  const overrideEntries = Object.entries(cleanOverrides) as [CapabilityModuleId, boolean][];
  if (overrideEntries.length > 0) {
    payload.overrides = cleanOverrides;
  }
  if (options.reset === true) {
    payload.reset = true;
  }
  if (Object.keys(payload).length === 0) {
    throw new LingtuVoiceChatError('config', '参数无效');
  }

  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/capabilities', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  const capabilities = parseRobotCapabilitiesPayload(res.data);
  if (!capabilities) {
    throw new LingtuVoiceChatError('rejected', '设置失败', res.status);
  }

  let message = '已更新';
  if (options.reset === true) {
    message = '已恢复默认';
  } else if (options.profile) {
    message = DUTY_PROFILE_SHORT_NOTICES[capabilities.profile] ?? '已切换';
  } else if (overrideEntries.length === 1) {
    const [modId, enabled] = overrideEntries[0];
    if (modId === 'voice_walk') {
      message = capabilities.modules.voice_walk ? '走动已开启' : '走动已锁定';
    } else {
      message = `${CAPABILITY_MODULE_LABELS[modId]}${enabled ? '开' : '关'}`;
    }
  }

  return {
    ok: true,
    capabilities,
    message,
  };
}

export async function stopXiaosuanVoice(
  target: VoiceTargetOptions,
): Promise<VoiceMemoryMutationResult> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/stop', {}, 4_500);
  if (res.status < 200 || res.status >= 300) {
    throw extractErrorMessage(res.status, res.data);
  }
  return { ok: true, message: '已停止' };
}

export async function triggerXiaosuanEstop(
  target: VoiceTargetOptions,
): Promise<Readonly<{ ok: boolean; message: string; capabilities: RobotCapabilitiesSnapshot | null }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/estop', {}, 3_500);
  if (res.status < 200 || res.status >= 300) {
    throw extractErrorMessage(res.status, res.data);
  }
  const capabilities = res.data?.capabilities
    ? parseRobotCapabilitiesPayload(res.data.capabilities)
    : null;
  return { ok: true, message: '已急停', capabilities };
}

export async function wakeXiaosuanVoice(
  target: VoiceTargetOptions,
): Promise<Readonly<{ ok: boolean; message: string; status: XiaosuanStatusSnapshot }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/wake', {}, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  return {
    ok: true,
    message: '已唤醒',
    status: parseXiaosuanStatusPayload(res.data),
  };
}

export async function fetchXiaosuanQuietMode(
  target: VoiceTargetOptions,
): Promise<Readonly<{ ok: boolean; enabled: boolean; volume: number | null }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/quiet_mode', undefined, 3_500);
  if (res.status < 200 || res.status >= 300 || !res.data) {
    throw extractErrorMessage(res.status, res.data);
  }
  return {
    ok: res.data.ok !== false,
    enabled: res.data.enabled === true || res.data.quiet_mode === true,
    volume: normalizeVolume(res.data.volume),
  };
}

export async function setXiaosuanQuietMode(
  target: VoiceTargetOptions,
  enabled: boolean,
): Promise<Readonly<{ ok: boolean; enabled: boolean; volume: number | null; message: string }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/quiet_mode', { enabled }, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const resolved = typeof res.data.enabled === 'boolean'
    ? res.data.enabled
    : typeof res.data.quiet_mode === 'boolean'
      ? res.data.quiet_mode
      : enabled;
  return {
    ok: true,
    enabled: resolved,
    volume: normalizeVolume(res.data.volume),
    message: resolved ? '轻声已开' : '轻声已关',
  };
}

export async function setXiaosuanVolume(
  target: VoiceTargetOptions,
  options: { volume?: number; delta?: number },
): Promise<Readonly<{ ok: boolean; volume: number | null; quietMode?: boolean; message: string }>> {
  const payload: Record<string, unknown> = {};
  if (typeof options.volume === 'number' && Number.isFinite(options.volume)) {
    payload.volume = Math.max(0, Math.min(100, Math.round(options.volume)));
  }
  if (typeof options.delta === 'number' && Number.isFinite(options.delta)) {
    payload.delta = Math.round(options.delta);
  }
  if (Object.keys(payload).length === 0) {
    throw new LingtuVoiceChatError('config', '参数无效');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/volume', payload, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const vol = normalizeVolume(res.data.volume) ?? (typeof payload.volume === 'number' ? payload.volume : null);
  const quietMode = typeof res.data.quiet_mode === 'boolean' ? res.data.quiet_mode : undefined;
  return {
    ok: true,
    volume: vol,
    quietMode,
    message: vol === 0 ? '已静音' : '已调音量',
  };
}

function parsePersonaOption(
  raw: unknown,
  formatter: (idOrName: string) => string,
): XiaosuanPersonaOption | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = String(rec.key ?? rec.id ?? rec.role ?? '').trim();
  if (!id) return null;
  const name = typeof rec.name === 'string' && rec.name.trim() ? rec.name.trim() : id;
  return {
    id,
    name,
    shortName: formatter(id) || formatter(name),
  };
}

export async function fetchXiaosuanPersona(
  target: VoiceTargetOptions,
): Promise<XiaosuanPersonaSnapshot> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/persona', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const rawRoles = Array.isArray(res.data.roles) ? res.data.roles : [];
  const rawVoices = Array.isArray(res.data.voices) ? res.data.voices : [];
  const parsedRoles = rawRoles
    .map(item => parsePersonaOption(item, formatXiaosuanRoleShortName))
    .filter((item): item is XiaosuanPersonaOption => item !== null);
  const parsedVoices = rawVoices
    .map(item => parsePersonaOption(item, formatXiaosuanVoiceShortName))
    .filter((item): item is XiaosuanPersonaOption => item !== null);

  const roles = parsedRoles.length > 0 ? parsedRoles : DEFAULT_XIAOSUAN_ROLES;
  const voices = parsedVoices.length > 0 ? parsedVoices : DEFAULT_XIAOSUAN_VOICES;

  const activeRoleRec = res.data.role && typeof res.data.role === 'object' && !Array.isArray(res.data.role)
    ? (res.data.role as Record<string, unknown>)
    : null;
  const roleId = typeof res.data.role === 'string' && res.data.role.trim()
    ? res.data.role.trim()
    : String(activeRoleRec?.key ?? activeRoleRec?.id ?? activeRoleRec?.role ?? roles[0]?.id ?? 'xiaosuan').trim();
  const roleName = formatXiaosuanRoleShortName(
    typeof activeRoleRec?.name === 'string' && activeRoleRec.name.trim() ? activeRoleRec.name : roleId,
  );

  const activeVoiceRec = res.data.voice && typeof res.data.voice === 'object' && !Array.isArray(res.data.voice)
    ? (res.data.voice as Record<string, unknown>)
    : null;
  const voiceId = typeof res.data.voice === 'string' && res.data.voice.trim()
    ? res.data.voice.trim()
    : String(activeVoiceRec?.key ?? activeVoiceRec?.id ?? voices[0]?.id ?? 'xiaosuan').trim();
  const voiceName = formatXiaosuanVoiceShortName(
    typeof activeVoiceRec?.name === 'string' && activeVoiceRec.name.trim() ? activeVoiceRec.name : voiceId,
  );

  return {
    roleId,
    roleName,
    voiceId,
    voiceName,
    roles,
    voices,
  };
}

export async function updateXiaosuanPersona(
  target: VoiceTargetOptions,
  options: { role?: string; voice?: string },
): Promise<Readonly<{ ok: boolean; roleId: string; roleName: string; voiceId: string; voiceName: string; message: string }>> {
  const payload: Record<string, unknown> = {};
  if (typeof options.role === 'string' && options.role.trim()) payload.role = options.role.trim();
  if (typeof options.voice === 'string' && options.voice.trim()) payload.voice = options.voice.trim();
  if (Object.keys(payload).length === 0) {
    throw new LingtuVoiceChatError('config', '参数无效');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/persona', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const roleObj = res.data.role && typeof res.data.role === 'object' && !Array.isArray(res.data.role)
    ? (res.data.role as Record<string, unknown>)
    : null;
  const voiceObj = res.data.voice && typeof res.data.voice === 'object' && !Array.isArray(res.data.voice)
    ? (res.data.voice as Record<string, unknown>)
    : null;
  const roleId = typeof res.data.role === 'string' && res.data.role.trim()
    ? res.data.role.trim()
    : String(roleObj?.key ?? roleObj?.role ?? options.role ?? 'xiaosuan').trim();
  const roleName = formatXiaosuanRoleShortName(
    typeof roleObj?.name === 'string' && roleObj.name.trim() ? roleObj.name : roleId,
  );
  const voiceId = typeof res.data.voice === 'string' && res.data.voice.trim()
    ? res.data.voice.trim()
    : String(voiceObj?.key ?? voiceObj?.id ?? options.voice ?? 'xiaosuan').trim();
  const voiceName = formatXiaosuanVoiceShortName(
    typeof voiceObj?.name === 'string' && voiceObj.name.trim() ? voiceObj.name : voiceId,
  );
  const shortMsg = options.role
    ? `已切${roleName}`
    : options.voice
      ? `已切${voiceName}`
      : '已切换';
  return {
    ok: true,
    roleId,
    roleName,
    voiceId,
    voiceName,
    message: shortMsg,
  };
}

function parseReminderItem(raw: unknown): VoiceReminderItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const content = typeof rec.content === 'string' ? rec.content.trim() : '';
  if (!id || !content) return null;
  const triggerAt = typeof rec.trigger_at === 'number' && Number.isFinite(rec.trigger_at)
    ? rec.trigger_at
    : typeof rec.triggerAt === 'number' && Number.isFinite(rec.triggerAt)
      ? rec.triggerAt
      : null;
  const triggerAtLocal = typeof rec.trigger_at_local === 'string'
    ? rec.trigger_at_local.trim()
    : typeof rec.triggerAtLocal === 'string'
      ? rec.triggerAtLocal.trim()
      : '';
  const timeExpr = typeof rec.time_expr === 'string'
    ? rec.time_expr.trim()
    : typeof rec.timeExpr === 'string'
      ? rec.timeExpr.trim()
      : '';
  const status = typeof rec.status === 'string' && rec.status.trim() ? rec.status.trim() : 'pending';
  const repeat = normalizeReminderRepeat(rec.repeat);
  return {
    id,
    content,
    timeExpr,
    triggerAt,
    triggerAtLocal,
    status,
    repeat,
  };
}

export async function fetchVoiceReminders(
  target: VoiceTargetOptions,
  includeDone = false,
): Promise<readonly VoiceReminderItem[]> {
  const xsTarget = resolveXiaosuanTarget(target);
  const path = includeDone ? '/api/reminders?include_done=1' : '/api/reminders';
  const res = await requestVoiceJson(xsTarget, 'GET', path, undefined, 5_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  const rawList = Array.isArray(res.data.reminders) ? res.data.reminders : [];
  return rawList
    .map(parseReminderItem)
    .filter((item): item is VoiceReminderItem => item !== null);
}

export async function addVoiceReminder(
  target: VoiceTargetOptions,
  options: { content: string; timeExpr?: string; triggerAt?: number; repeat?: VoiceReminderRepeat },
): Promise<Readonly<{ ok: boolean; message: string; reminder?: VoiceReminderItem }>> {
  const cleanContent = options.content.trim();
  const cleanExpr = (options.timeExpr ?? '').trim();
  if (!cleanContent) {
    throw new LingtuVoiceChatError('config', '内容为空');
  }
  if (!cleanExpr && typeof options.triggerAt !== 'number') {
    throw new LingtuVoiceChatError('config', '时间无效');
  }
  const payload: Record<string, unknown> = { content: cleanContent.slice(0, 120) };
  if (cleanExpr) payload.time_expr = cleanExpr;
  if (typeof options.triggerAt === 'number' && Number.isFinite(options.triggerAt)) {
    payload.trigger_at = options.triggerAt;
  }
  const repeat = normalizeReminderRepeat(options.repeat);
  if (repeat) payload.repeat = repeat;
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/reminders/add', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractMemoryError(res.status, res.data);
  }
  const reminder = parseReminderItem(res.data.reminder) ?? undefined;
  return { ok: true, message: '已设提醒', reminder };
}

export async function deleteVoiceReminder(
  target: VoiceTargetOptions,
  idOrQuery: string,
): Promise<VoiceMemoryMutationResult> {
  const clean = idOrQuery.trim();
  if (!clean) {
    throw new LingtuVoiceChatError('config', '记录无效');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/reminders/delete', { id: clean }, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractMemoryError(res.status, res.data);
  }
  return { ok: true, message: '已删除' };
}

export async function snoozeVoiceReminder(
  target: VoiceTargetOptions,
  options?: { id?: string; minutes?: number },
): Promise<VoiceMemoryMutationResult> {
  const payload: Record<string, unknown> = {};
  if (typeof options?.id === 'string' && options.id.trim()) {
    payload.id = options.id.trim();
  }
  const mins = typeof options?.minutes === 'number' && Number.isFinite(options.minutes) && options.minutes > 0
    ? Math.round(options.minutes)
    : 10;
  payload.minutes = mins;
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/reminders/snooze', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractMemoryError(res.status, res.data);
  }
  return { ok: true, message: `已延后${mins}分钟` };
}

export async function fetchVoiceMemories(
  target: VoiceTargetOptions,
): Promise<VoiceMemoryPalaceSnapshot> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/memory/palace', undefined, 5_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  const rawMemories = Array.isArray(res.data.memories) ? res.data.memories : [];
  const memories: VoiceMemoryItem[] = [];
  for (const raw of rawMemories) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const text = typeof rec.text === 'string' ? rec.text.trim() : '';
    if (!id || !text) continue;
    const updatedAt = typeof rec.updated_at === 'string'
      ? rec.updated_at
      : typeof rec.updatedAt === 'string'
        ? rec.updatedAt
        : '';
    memories.push({
      id,
      text,
      room: normalizeVoiceMemoryRoom(rec.room),
      pinned: Boolean(rec.pinned),
      updatedAt,
    });
  }
  const rollingSummary = typeof res.data.rolling_summary === 'string'
    ? res.data.rolling_summary.trim()
    : '';
  const workingTurnCount = Array.isArray(res.data.working_turns)
    ? res.data.working_turns.length
    : typeof res.data.working_turns === 'number' && Number.isFinite(res.data.working_turns)
      ? Math.max(0, Math.floor(res.data.working_turns))
      : 0;
  return {
    roomCounts: parseMemoryRoomCounts(res.data.room_counts, memories),
    rollingSummary,
    workingTurnCount,
    memories,
  };
}

export async function addVoiceMemory(
  target: VoiceTargetOptions,
  options: {
    text: string;
    room?: VoiceMemoryRoom;
    pinned?: boolean;
  },
): Promise<VoiceMemoryMutationResult> {
  const cleanText = options.text.trim();
  if (!cleanText) {
    throw new LingtuVoiceChatError('config', '内容为空');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const payload: Record<string, unknown> = {
    text: cleanText.slice(0, 400),
  };
  if (options.room) payload.room = normalizeVoiceMemoryRoom(options.room);
  if (typeof options.pinned === 'boolean') payload.pinned = options.pinned;

  const res = await requestVoiceJson(xsTarget, 'POST', '/api/memory/add', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractMemoryError(res.status, res.data);
  }
  return { ok: true, message: '已记住' };
}

export async function updateVoiceMemory(
  target: VoiceTargetOptions,
  options: {
    id: string;
    text?: string;
    room?: VoiceMemoryRoom;
    pinned?: boolean;
  },
): Promise<VoiceMemoryMutationResult> {
  const cleanId = options.id.trim();
  if (!cleanId) {
    throw new LingtuVoiceChatError('config', '记录无效');
  }
  const payload: Record<string, unknown> = { id: cleanId };
  if (typeof options.text === 'string') {
    const cleanText = options.text.trim();
    if (!cleanText) {
      throw new LingtuVoiceChatError('config', '内容为空');
    }
    payload.text = cleanText.slice(0, 400);
  }
  if (options.room) payload.room = normalizeVoiceMemoryRoom(options.room);
  if (typeof options.pinned === 'boolean') payload.pinned = options.pinned;

  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/memory/update', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractMemoryError(res.status, res.data);
  }
  return { ok: true, message: '已更新' };
}

export async function deleteVoiceMemory(
  target: VoiceTargetOptions,
  id: string,
): Promise<VoiceMemoryMutationResult> {
  const cleanId = id.trim();
  if (!cleanId) {
    throw new LingtuVoiceChatError('config', '记录无效');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/memory/delete', { id: cleanId }, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractMemoryError(res.status, res.data);
  }
  return { ok: true, message: '已删除' };
}

export async function clearVoiceSessionMemory(
  target: VoiceTargetOptions,
): Promise<VoiceMemoryMutationResult> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/memory/clear-session', {}, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractMemoryError(res.status, res.data);
  }
  return { ok: true, message: '已清空' };
}

// ---------------------------------------------------------------------------
// Timers, Daily Briefing & Broadcast (:8770)
// ---------------------------------------------------------------------------

export async function runBriefing(
  target: VoiceTargetOptions,
  opts?: { city?: string; speak?: boolean },
): Promise<Readonly<{ ok: boolean; text: string; message: string }>> {
  const payload: Record<string, unknown> = {};
  if (typeof opts?.city === 'string' && opts.city.trim()) {
    payload.city = opts.city.trim().slice(0, 32);
  }
  if (typeof opts?.speak === 'boolean') {
    payload.speak = opts.speak;
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/briefing', payload, 12_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const text = typeof res.data.script === 'string' && res.data.script.trim()
    ? res.data.script.trim()
    : typeof res.data.text === 'string' && res.data.text.trim()
      ? res.data.text.trim()
      : typeof res.data.briefing === 'string' && res.data.briefing.trim()
        ? res.data.briefing.trim()
        : '';
  return { ok: true, text, message: '已播早报' };
}

export async function getTimers(
  target: VoiceTargetOptions,
): Promise<XiaosuanTimerSnapshot | null> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/timers', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  return parseTimerPayload(res.data.active_timer ?? res.data.timer ?? res.data);
}

export async function startTimer(
  target: VoiceTargetOptions,
  opts: {
    kind?: XiaosuanTimerKind;
    durationSec: number;
    label?: string;
    autoQuiet?: boolean;
  },
): Promise<Readonly<{ ok: boolean; timer: XiaosuanTimerSnapshot | null; message: string }>> {
  if (typeof opts.durationSec !== 'number' || !Number.isFinite(opts.durationSec) || opts.durationSec <= 0) {
    throw new LingtuVoiceChatError('config', '时间无效');
  }
  const kind: XiaosuanTimerKind = opts.kind === 'pomodoro' ? 'pomodoro' : 'countdown';
  const durationSec = Math.max(10, Math.round(opts.durationSec));
  const payload: Record<string, unknown> = {
    kind,
    duration_sec: durationSec,
  };
  if (typeof opts.label === 'string' && opts.label.trim()) {
    payload.label = opts.label.trim().slice(0, 24);
  }
  if (typeof opts.autoQuiet === 'boolean') {
    payload.auto_quiet = opts.autoQuiet;
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/timers/start', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const timer = parseTimerPayload(res.data.active_timer ?? res.data.timer ?? res.data) ?? {
    id: `timer_${Date.now().toString(36)}`,
    kind,
    label: (opts.label ?? (kind === 'pomodoro' ? '专注' : '倒计时')).trim(),
    durationSec,
    remainingSec: durationSec,
    state: 'running',
    autoQuiet: opts.autoQuiet === true,
  };
  return {
    ok: true,
    timer,
    message: kind === 'pomodoro' ? '开始专注' : '开始计时',
  };
}

export async function pauseTimer(
  target: VoiceTargetOptions,
): Promise<Readonly<{ ok: boolean; timer: XiaosuanTimerSnapshot | null; message: string }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/timers/pause', {}, 5_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  return {
    ok: true,
    timer: parseTimerPayload(res.data.active_timer ?? res.data.timer ?? res.data),
    message: '已暂停',
  };
}

export async function resumeTimer(
  target: VoiceTargetOptions,
): Promise<Readonly<{ ok: boolean; timer: XiaosuanTimerSnapshot | null; message: string }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/timers/resume', {}, 5_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  return {
    ok: true,
    timer: parseTimerPayload(res.data.active_timer ?? res.data.timer ?? res.data),
    message: '已继续',
  };
}

export async function cancelTimer(
  target: VoiceTargetOptions,
): Promise<VoiceMemoryMutationResult> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/timers/cancel', {}, 5_000);
  if (res.status < 200 || res.status >= 300 || (res.data && res.data.ok === false)) {
    throw extractErrorMessage(res.status, res.data);
  }
  return { ok: true, message: '已结束' };
}

export async function sendBroadcast(
  target: VoiceTargetOptions,
  text: string,
): Promise<Readonly<{ ok: boolean; text: string; message: string }>> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new LingtuVoiceChatError('config', '内容为空');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(
    xsTarget,
    'POST',
    '/api/broadcast',
    { text: cleanText.slice(0, 300) },
    8_000,
  );
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  return { ok: true, text: cleanText, message: '已传话' };
}

export async function probeLingtuVoiceService(target: VoiceTargetOptions): Promise<Readonly<{
  mode: VoiceChatServiceMode;
  defaultModel: string | null;
  serviceOrigin: string;
  initialStatus?: XiaosuanStatusSnapshot;
}>> {
  let optionsRes: { status: number; data: Record<string, unknown> | null } | null = null;
  try {
    optionsRes = await requestVoiceJson(target, 'GET', '/api/v1/agent/options', undefined, 3_500);
    if (optionsRes.status >= 200 && optionsRes.status < 300 && optionsRes.data?.available === true) {
      const defaultModel = typeof optionsRes.data.default_model === 'string' && optionsRes.data.default_model.trim()
        ? optionsRes.data.default_model.trim()
        : null;
      return { mode: 'conversation', defaultModel, serviceOrigin: target.origin };
    }
  } catch (err) {
    if (err instanceof LingtuVoiceChatError && err.code === 'cancelled') throw err;
  }

  const xiaosuanOrigin = deriveXiaosuanVoiceOrigin(target.origin, target.allowLocalHttp === true);
  if (xiaosuanOrigin) {
    try {
      const xsRes = await requestVoiceJson(
        { ...target, origin: xiaosuanOrigin },
        'GET',
        '/api/status',
        undefined,
        2_500,
      );
      if (xsRes.status >= 200 && xsRes.status < 300 && typeof xsRes.data?.ok === 'boolean') {
        return {
          mode: 'xiaosuan',
          defaultModel: null,
          serviceOrigin: xiaosuanOrigin,
          initialStatus: parseXiaosuanStatusPayload(xsRes.data),
        };
      }
    } catch (err) {
      if (err instanceof LingtuVoiceChatError && err.code === 'cancelled') throw err;
    }
  }

  if (optionsRes && (optionsRes.status === 404 || optionsRes.status === 503)) {
    const healthRes = await requestVoiceJson(target, 'GET', '/api/v1/readiness', undefined, 3_500);
    if (healthRes.status >= 200 && healthRes.status < 300) {
      return { mode: 'instruction', defaultModel: null, serviceOrigin: target.origin };
    }
  }
  if (optionsRes) {
    throw extractErrorMessage(optionsRes.status, optionsRes.data);
  }
  throw new LingtuVoiceChatError('unavailable', '未就绪');
}

function parseEventTools(ev: Record<string, unknown>): readonly string[] | undefined {
  const labels: string[] = [];
  const pushName = (raw: unknown) => {
    if (typeof raw === 'string' && raw.trim()) {
      const label = formatVoiceToolLabel(raw);
      if (!labels.includes(label)) labels.push(label);
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const rec = raw as Record<string, unknown>;
      const name = typeof rec.tool === 'string' ? rec.tool : typeof rec.name === 'string' ? rec.name : '';
      if (name.trim()) {
        const label = formatVoiceToolLabel(name);
        if (!labels.includes(label)) labels.push(label);
      }
    }
  };
  if (Array.isArray(ev.tools)) {
    for (const entry of ev.tools) pushName(entry);
  }
  if (Array.isArray(ev.tool_labels)) {
    for (const entry of ev.tool_labels) pushName(entry);
  }
  if (Array.isArray(ev.tool_used)) {
    for (const entry of ev.tool_used) pushName(entry);
  } else if (ev.tool_used !== undefined) {
    pushName(ev.tool_used);
  }
  if (ev.tool !== undefined) {
    pushName(ev.tool);
  }
  return labels.length > 0 ? labels : undefined;
}

export async function readXiaosuanVoiceTranscript(
  target: VoiceTargetOptions,
): Promise<VoiceConversationSnapshot> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/transcript', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data) {
    throw extractErrorMessage(res.status, res.data);
  }
  const rawEvents = Array.isArray(res.data.events) ? res.data.events : [];
  const messages: VoiceChatMessageItem[] = [];
  for (const item of rawEvents) {
    if (!item || typeof item !== 'object') continue;
    const ev = item as Record<string, unknown>;
    const seq = typeof ev.seq === 'number' && Number.isFinite(ev.seq) ? ev.seq : messages.length + 1;
    const isTool = ev.role === 'tool' || ev.event === 'tool';
    const role: 'user' | 'assistant' | 'tool' = isTool
      ? 'tool'
      : ev.role === 'user' || ev.event === 'stt'
        ? 'user'
        : 'assistant';
    const text = typeof ev.text === 'string' ? ev.text.trim() : '';
    const tools = parseEventTools(ev);
    if (!text && !tools) continue;
    const rawTurnId = typeof ev.turn_id === 'string' && ev.turn_id.trim()
      ? ev.turn_id.trim()
      : '';
    const turnId = rawTurnId || `xs_turn_${seq}`;
    const source = normalizeSource(ev.source);
    const speakerId = typeof ev.speaker_id === 'string' && ev.speaker_id.trim()
      ? ev.speaker_id.trim().slice(0, 24)
      : typeof ev.speakerId === 'string' && ev.speakerId.trim()
        ? ev.speakerId.trim().slice(0, 24)
        : undefined;
    const emotion = typeof ev.emotion === 'string' && ev.emotion.trim()
      ? normalizeEmotion(ev.emotion)
      : undefined;
    const ts = typeof ev.ts === 'number' && Number.isFinite(ev.ts) ? ev.ts : undefined;

    // Aggregate consecutive assistant chunks that share an explicit turn_id into a single bubble.
    const prev = messages[messages.length - 1];
    if (
      role === 'assistant'
      && rawTurnId
      && prev
      && prev.role === 'assistant'
      && prev.turnId === rawTurnId
    ) {
      const mergedTools = [...(prev.tools ?? [])];
      for (const label of tools ?? []) {
        if (!mergedTools.includes(label)) mergedTools.push(label);
      }
      const nextText = !text
        ? prev.text
        : !prev.text
          ? text
          : prev.text.endsWith(text)
            ? prev.text
            : text.startsWith(prev.text)
              ? text
              : `${prev.text}${text}`;
      messages[messages.length - 1] = {
        ...prev,
        seq: Math.max(prev.seq, seq),
        text: nextText,
        source: source ?? prev.source,
        speakerId: speakerId ?? prev.speakerId,
        emotion: emotion ?? prev.emotion,
        tools: mergedTools.length > 0 ? mergedTools : undefined,
        ts: ts ?? prev.ts,
      };
      continue;
    }

    messages.push({
      id: rawTurnId ? `xs_${role}_${rawTurnId}` : `xs_${seq}`,
      seq,
      role,
      text: isTool ? (tools?.[0] ?? formatVoiceToolLabel(text)) : text,
      turnId,
      toolLabel: isTool ? (tools?.[0] ?? formatVoiceToolLabel(text)) : undefined,
      source,
      speakerId,
      emotion,
      tools: isTool ? undefined : tools,
      ts,
    });
  }

  const parsedStatus = hasStatusFields(res.data) ? parseXiaosuanStatusPayload(res.data) : undefined;
  let statusPatch: Partial<XiaosuanStatusSnapshot> | undefined;
  if (parsedStatus) {
    const patch: Record<string, unknown> = { ok: parsedStatus.ok };
    if ('live_state' in res.data || 'activity' in res.data || 'speaking' in res.data) patch.liveState = parsedStatus.liveState;
    if ('emotion' in res.data) patch.emotion = parsedStatus.emotion;
    if ('quiet_mode' in res.data || 'quiet' in res.data) patch.quietMode = parsedStatus.quietMode;
    if ('volume' in res.data) patch.volume = parsedStatus.volume;
    if ('role' in res.data || 'role_name' in res.data) {
      patch.role = parsedStatus.role;
      patch.roleName = parsedStatus.roleName;
    }
    if ('voice' in res.data || 'voice_name' in res.data) {
      patch.voice = parsedStatus.voice;
      patch.voiceName = parsedStatus.voiceName;
    }
    if ('pending_reminders' in res.data) patch.pendingReminders = parsedStatus.pendingReminders;
    if ('active_timer' in res.data) patch.activeTimer = parsedStatus.activeTimer;
    if ('active_move' in res.data || 'activeMove' in res.data) patch.activeMove = parsedStatus.activeMove;
    if ('profile' in res.data || 'profile_name' in res.data) {
      patch.profile = parsedStatus.profile;
      patch.profileName = parsedStatus.profileName;
    }
    if ('capabilities' in res.data && parsedStatus.capabilities) {
      patch.capabilities = parsedStatus.capabilities;
    }
    statusPatch = patch as Partial<XiaosuanStatusSnapshot>;
  }

  return {
    conversationId: 'xiaosuan-live',
    messages,
    turns: [],
    approvals: [],
    status: parsedStatus,
    statusPatch,
  };
}

export async function createLingtuVoiceConversation(
  target: VoiceTargetOptions,
  botId = 'lingtu-default',
): Promise<string> {
  const res = await requestVoiceJson(
    target,
    'POST',
    `/api/v1/agent/conversations?bot_id=${encodeURIComponent(botId)}`,
    {},
    6_000,
  );
  if (res.status < 200 || res.status >= 300 || typeof res.data?.conversation_id !== 'string' || !res.data.conversation_id.trim()) {
    throw extractErrorMessage(res.status, res.data);
  }
  return res.data.conversation_id.trim();
}

export async function readLingtuVoiceConversation(
  target: VoiceTargetOptions,
  conversationId: string,
): Promise<VoiceConversationSnapshot> {
  const res = await requestVoiceJson(
    target,
    'GET',
    `/api/v1/agent/conversations/${encodeURIComponent(conversationId)}`,
    undefined,
    6_000,
  );
  if (res.status < 200 || res.status >= 300 || !res.data) {
    throw extractErrorMessage(res.status, res.data);
  }
  const rawMessages = Array.isArray(res.data.messages) ? res.data.messages : [];
  const rawTurns = Array.isArray(res.data.turns) ? res.data.turns : [];
  const rawApprovals = Array.isArray(res.data.approvals) ? res.data.approvals : [];

  const messages: VoiceChatMessageItem[] = [];
  for (const item of rawMessages) {
    if (!item || typeof item !== 'object') continue;
    const m = item as Record<string, unknown>;
    const role = m.role === 'user' || m.role === 'assistant' || m.role === 'tool' ? m.role : null;
    if (!role || typeof m.id !== 'string' || typeof m.turn_id !== 'string') continue;
    const seq = typeof m.seq === 'number' && Number.isFinite(m.seq) ? m.seq : messages.length + 1;
    const text = typeof m.text === 'string' ? m.text : '';
    const meta = m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
      ? (m.metadata as Record<string, unknown>)
      : null;
    const displayName = typeof meta?.display_name === 'string' ? meta.display_name : undefined;
    const choices = Array.isArray(meta?.choices)
      ? meta.choices.filter((c): c is string => typeof c === 'string' && c.trim().length > 0).slice(0, 4)
      : undefined;
    messages.push({
      id: m.id,
      seq,
      role,
      text,
      turnId: m.turn_id,
      kind: typeof m.kind === 'string' ? m.kind : undefined,
      toolLabel: role === 'tool' ? formatVoiceToolLabel(displayName || text) : undefined,
      choices,
    });
  }
  messages.sort((a, b) => a.seq - b.seq);

  const turns: VoiceChatTurnItem[] = [];
  for (const item of rawTurns) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const state = t.state;
    if (
      typeof t.turn_id !== 'string'
      || (state !== 'queued' && state !== 'running' && state !== 'completed' && state !== 'failed' && state !== 'cancelled' && state !== 'interrupted')
    ) {
      continue;
    }
    turns.push({
      turnId: t.turn_id,
      state,
      messageId: typeof t.message_id === 'string' ? t.message_id : undefined,
      failureReason: typeof t.failure_reason === 'string' ? t.failure_reason : undefined,
    });
  }

  const approvals: VoiceChatApprovalItem[] = [];
  for (const item of rawApprovals) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const state = a.state;
    if (
      typeof a.approval_id !== 'string'
      || typeof a.turn_id !== 'string'
      || typeof a.tool_name !== 'string'
      || (state !== 'pending' && state !== 'approved' && state !== 'denied' && state !== 'cancelled')
    ) {
      continue;
    }
    const args = a.arguments && typeof a.arguments === 'object' && !Array.isArray(a.arguments)
      ? (a.arguments as Record<string, unknown>)
      : {};
    approvals.push({
      approvalId: a.approval_id,
      turnId: a.turn_id,
      toolName: a.tool_name,
      actionLabel: formatVoiceToolLabel(a.tool_name),
      summaryText: summarizeApprovalArgs(a.tool_name, args),
      state,
    });
  }

  return {
    conversationId,
    messages,
    turns,
    approvals,
  };
}

export async function sendLingtuVoiceMessage(
  target: VoiceTargetOptions,
  options: {
    conversationId: string | null;
    messageId: string;
    text: string;
    mode: VoiceChatServiceMode;
    model?: string | null;
  },
): Promise<
  | Readonly<{ kind: 'turn'; turnId: string; state: VoiceChatTurnItem['state'] }>
  | Readonly<{
    kind: 'instruction';
    accepted: boolean;
    replyText: string;
    boardSpoke?: boolean;
    turnId?: string;
    emotion?: XiaosuanEmotion;
    tools?: readonly string[];
  }>
> {
  const cleanText = options.text.trim();
  if (!cleanText) {
    throw new LingtuVoiceChatError('config', '内容为空');
  }

  if (options.mode === 'xiaosuan') {
    const xsRes = await requestVoiceJson(
      target,
      'POST',
      '/api/chat',
      {
        text: cleanText.slice(0, 400),
        source: 'app',
      },
      22_000,
    );
    if (xsRes.status < 200 || xsRes.status >= 300 || !xsRes.data) {
      throw extractErrorMessage(xsRes.status, xsRes.data);
    }
    const rawAnswer = typeof xsRes.data.answer === 'string' && xsRes.data.answer.trim()
      ? xsRes.data.answer.trim()
      : typeof xsRes.data.message === 'string' && xsRes.data.message.trim()
        ? xsRes.data.message.replace(/^[A-Za-z]+\s*回答[：:]\s*/, '').trim()
        : '已播报';
    const turnId = typeof xsRes.data.turn_id === 'string' && xsRes.data.turn_id.trim()
      ? xsRes.data.turn_id.trim()
      : undefined;
    const emotion = typeof xsRes.data.emotion === 'string' && xsRes.data.emotion.trim()
      ? normalizeEmotion(xsRes.data.emotion)
      : undefined;
    const tools = Array.isArray(xsRes.data.tool_calls)
      ? parseEventTools({ tools: xsRes.data.tool_calls })
      : parseEventTools(xsRes.data);
    return {
      kind: 'instruction' as const,
      accepted: xsRes.data.ok === true,
      replyText: rawAnswer,
      boardSpoke: true,
      turnId,
      emotion,
      tools,
    };
  }

  const submitAsInstruction = async () => {
    const instRes = await requestVoiceJson(
      target,
      'POST',
      '/api/v1/instruction',
      {
        text: cleanText.slice(0, 1024),
        request_id: options.messageId,
        client_id: 'doso-app',
      },
      8_000,
    );
    if (instRes.status < 200 || instRes.status >= 300 || !instRes.data) {
      throw extractErrorMessage(instRes.status, instRes.data);
    }
    const accepted = instRes.data.accepted === true;
    const message = typeof instRes.data.message === 'string' && instRes.data.message.trim()
      ? instRes.data.message.trim()
      : accepted ? '已受理' : '未通过';
    return { kind: 'instruction' as const, accepted, replyText: message };
  };

  if (options.mode === 'instruction' || !options.conversationId) {
    return submitAsInstruction();
  }

  const res = await requestVoiceJson(
    target,
    'POST',
    `/api/v1/agent/conversations/${encodeURIComponent(options.conversationId)}/messages`,
    {
      message_id: options.messageId,
      text: cleanText.slice(0, 4000),
      client_id: 'doso-app',
      permission_mode: 'default',
      ...(options.model ? { model: options.model } : {}),
    },
    8_000,
  );

  if (res.status === 503 || res.status === 404) {
    return submitAsInstruction();
  }
  if (res.status < 200 || res.status >= 300 || typeof res.data?.turn_id !== 'string') {
    throw extractErrorMessage(res.status, res.data);
  }
  const rawState = String(res.data.state ?? 'running');
  const state: VoiceChatTurnItem['state'] =
    rawState === 'queued' || rawState === 'running' || rawState === 'completed'
    || rawState === 'failed' || rawState === 'cancelled' || rawState === 'interrupted'
      ? rawState
      : 'running';
  return { kind: 'turn', turnId: res.data.turn_id, state };
}

export async function cancelLingtuVoiceTurn(
  target: VoiceTargetOptions,
  conversationId: string,
  turnId: string,
): Promise<void> {
  const res = await requestVoiceJson(
    target,
    'POST',
    `/api/v1/agent/conversations/${encodeURIComponent(conversationId)}/turns/${encodeURIComponent(turnId)}/cancel`,
    undefined,
    6_000,
  );
  if (res.status < 200 || res.status >= 300) {
    throw extractErrorMessage(res.status, res.data);
  }
}

export async function decideLingtuVoiceApproval(
  target: VoiceTargetOptions,
  conversationId: string,
  approvalId: string,
  approved: boolean,
): Promise<void> {
  const res = await requestVoiceJson(
    target,
    'POST',
    `/api/v1/agent/conversations/${encodeURIComponent(conversationId)}/approvals/${encodeURIComponent(approvalId)}`,
    { approved },
    6_000,
  );
  if (res.status < 200 || res.status >= 300) {
    throw extractErrorMessage(res.status, res.data);
  }
}

export function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>*-\s]+/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

export function speakRobotVoiceReply(
  rawText: string,
  volumePercent: number,
  enabled: boolean,
): void {
  if (!enabled) return;
  const vol = Math.max(0, Math.min(1, volumePercent / 100));
  if (vol <= 0) return;
  const clean = stripMarkdownForSpeech(rawText);
  if (!clean) return;

  if (Platform.OS === 'android') {
    void speakNativeVoiceText(clean, vol).catch(() => undefined);
    return;
  }

  try {
    const g = globalThis as {
      speechSynthesis?: { cancel?: () => void; speak?: (u: unknown) => void };
      SpeechSynthesisUtterance?: new (t: string) => { lang: string; rate: number; volume: number };
    };
    if (g.speechSynthesis && typeof g.speechSynthesis.speak === 'function' && typeof g.SpeechSynthesisUtterance === 'function') {
      const utter = new g.SpeechSynthesisUtterance(clean);
      utter.lang = 'zh-CN';
      utter.rate = 1.08;
      utter.volume = vol;
      g.speechSynthesis.cancel?.();
      g.speechSynthesis.speak(utter);
    }
  } catch {
    /* Speech synthesis unavailable on current runtime. */
  }
}

export function stopRobotVoiceReply(): void {
  if (Platform.OS === 'android') {
    stopNativeVoiceSpeech();
    return;
  }
  try {
    const g = globalThis as { speechSynthesis?: { cancel?: () => void } };
    g.speechSynthesis?.cancel?.();
  } catch {
    /* Ignore. */
  }
}

type WebSpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: {
    resultIndex?: number;
    results?: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

function getWebSpeechCtor(): (new () => WebSpeechRecognitionInstance) | null {
  if (Platform.OS !== 'web') return null;
  const g = globalThis as {
    SpeechRecognition?: new () => WebSpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => WebSpeechRecognitionInstance;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

export async function detectSpeechInputMode(): Promise<'web' | 'native' | 'none'> {
  if (getWebSpeechCtor() !== null) return 'web';
  if (Platform.OS === 'android') {
    const available = await isNativeVoiceInputAvailable();
    if (available) return 'native';
  }
  return 'none';
}

export type ActiveSpeechCapture = Readonly<{
  stop: () => void;
  cancel: () => void;
}>;

export function startSpeechInputCapture(callbacks: {
  mode: 'web' | 'native';
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (reason: string) => void;
  onEnd: () => void;
}): ActiveSpeechCapture | null {
  if (callbacks.mode === 'native') {
    let cancelled = false;
    void recognizeNativeVoiceOnce()
      .then(transcript => {
        if (cancelled) return;
        const clean = transcript.trim();
        if (clean) callbacks.onFinal(clean);
        callbacks.onEnd();
      })
      .catch(() => {
        if (cancelled) return;
        callbacks.onError('未识别');
        callbacks.onEnd();
      });
    return {
      stop() {
        /* System speech dialog finishes automatically when speaking stops. */
      },
      cancel() {
        cancelled = true;
        callbacks.onEnd();
      },
    };
  }

  const Ctor = getWebSpeechCtor();
  if (!Ctor) {
    callbacks.onError('不支持语音');
    callbacks.onEnd();
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = 'zh-CN';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finished = false;
  let latestFinal = '';
  let latestInterim = '';

  recognition.onresult = event => {
    if (finished || !event.results) return;
    let finalText = '';
    let interimText = '';
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      const chunk = result?.[0]?.transcript ?? '';
      if (result?.isFinal) finalText += chunk;
      else interimText += chunk;
    }
    if (finalText.trim()) {
      latestFinal = finalText.trim();
      callbacks.onInterim?.(latestFinal);
    } else if (interimText.trim()) {
      latestInterim = interimText.trim();
      callbacks.onInterim?.(latestInterim);
    }
  };

  recognition.onerror = event => {
    if (finished) return;
    finished = true;
    const code = event?.error ?? '';
    if (code === 'aborted' || code === 'no-speech') {
      callbacks.onEnd();
      return;
    }
    callbacks.onError(code === 'not-allowed' ? '未授麦克风' : '识别失败');
    callbacks.onEnd();
  };

  recognition.onend = () => {
    if (finished) return;
    finished = true;
    const resolved = (latestFinal || latestInterim).trim();
    if (resolved) callbacks.onFinal(resolved);
    callbacks.onEnd();
  };

  try {
    recognition.start();
  } catch {
    finished = true;
    callbacks.onError('麦克风占用');
    callbacks.onEnd();
    return null;
  }

  return {
    stop() {
      try { recognition.stop(); } catch { /* Ignore. */ }
    },
    cancel() {
      finished = true;
      try { recognition.abort?.(); recognition.stop(); } catch { /* Ignore. */ }
      callbacks.onEnd();
    },
  };
}
