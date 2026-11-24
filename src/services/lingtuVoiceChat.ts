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

export type XiaosuanAmbientSoundId = 'off' | 'rain' | 'ocean' | 'pink' | 'fire' | 'night';

export type XiaosuanAmbientOption = Readonly<{
  id: XiaosuanAmbientSoundId;
  label: string;
}>;

export type XiaosuanAmbientStatus = Readonly<{
  active: boolean;
  sound: XiaosuanAmbientSoundId;
  soundLabel: string;
  remainingSec: number | null;
  sounds: readonly XiaosuanAmbientOption[];
}>;

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

export type XiaosuanCompanionSnapshot = Readonly<{
  daysTogether: number;
  streakDays: number;
  mood: string;
  moodLabel: string;
  speakerTier: string;
}>;

export type DutyProfileId = 'assistant' | 'host' | 'companion';

export type CapabilityModuleId =
  | 'robot_control'
  | 'voice_walk'
  | 'memory'
  | 'info_reminders'
  | 'vision_nav'
  | 'companion';

export type DutyProfileOption = Readonly<{
  id: DutyProfileId;
  name: string;
}>;

export type CapabilityModuleMap = Readonly<Record<CapabilityModuleId, boolean>>;

export type CapabilityHardwareStatus = Readonly<{
  camera: boolean;
  navigation: boolean;
  voiceprint: boolean;
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
  ambient: XiaosuanAmbientStatus;
  activeTimer: XiaosuanTimerSnapshot | null;
  companion: XiaosuanCompanionSnapshot | null;
  idleLifeEnabled: boolean;
  speakersAvailable: boolean;
  speakersCount: number;
  photosCount: number;
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

export type XiaosuanPhotoItem = Readonly<{
  id: string;
  url: string;
  caption: string;
  emotion: XiaosuanEmotion;
  speakerId: string;
  createdAt: string;
  ts: number | null;
}>;

export type XiaosuanSpeakerItem = Readonly<{
  name: string;
  samples: number;
}>;

export type XiaosuanSpeakersSnapshot = Readonly<{
  available: boolean;
  speakers: readonly XiaosuanSpeakerItem[];
}>;

export type XiaosuanSceneOption = Readonly<{
  id: string;
  label: string;
}>;

export type XiaosuanComboOption = Readonly<{
  id: string;
  label: string;
}>;

export type XiaosuanDiaryItem = Readonly<{
  date: string;
  text: string;
  mood: string;
  moodLabel: string;
  photoIds: readonly string[];
  createdAt: string;
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
  'companion',
]);

export const CAPABILITY_MODULE_LABELS: Readonly<Record<CapabilityModuleId, string>> = Object.freeze({
  robot_control: '语音控狗',
  voice_walk: '语音走动',
  memory: '长期记忆',
  info_reminders: '联网与提醒',
  vision_nav: '视觉与导航',
  companion: '陪伴与娱乐',
});

const PROFILE_DEFAULT_MODULES: Readonly<Record<DutyProfileId, CapabilityModuleMap>> = Object.freeze({
  assistant: Object.freeze({
    robot_control: true,
    voice_walk: false,
    memory: true,
    info_reminders: true,
    vision_nav: false,
    companion: false,
  }),
  host: Object.freeze({
    robot_control: true,
    voice_walk: false,
    memory: true,
    info_reminders: false,
    vision_nav: false,
    companion: false,
  }),
  companion: Object.freeze({
    robot_control: true,
    voice_walk: false,
    memory: true,
    info_reminders: true,
    vision_nav: false,
    companion: true,
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
    companion: true,
  }),
  hardware: Object.freeze({
    camera: true,
    navigation: true,
    voiceprint: true,
    brainstem: true,
  }),
  moduleList: Object.freeze([
    Object.freeze({ id: 'robot_control', name: '语音控狗', enabled: true, available: true, statusLabel: '已开' }),
    Object.freeze({ id: 'voice_walk', name: '语音走动', enabled: false, available: true, statusLabel: '已锁定', safetyLock: true }),
    Object.freeze({ id: 'memory', name: '长期记忆', enabled: true, available: true, statusLabel: '已开' }),
    Object.freeze({ id: 'info_reminders', name: '联网与提醒', enabled: true, available: true, statusLabel: '已开' }),
    Object.freeze({ id: 'vision_nav', name: '视觉与导航', enabled: true, available: true, statusLabel: '已开' }),
    Object.freeze({ id: 'companion', name: '陪伴与娱乐', enabled: true, available: true, statusLabel: '已开' }),
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

export const DEFAULT_AMBIENT_SOUNDS: readonly XiaosuanAmbientOption[] = Object.freeze([
  Object.freeze({ id: 'rain', label: '雨声' }),
  Object.freeze({ id: 'ocean', label: '海浪' }),
  Object.freeze({ id: 'pink', label: '暖噪' }),
  Object.freeze({ id: 'fire', label: '篝火' }),
  Object.freeze({ id: 'night', label: '静夜' }),
]);

export const DEFAULT_XIAOSUAN_AMBIENT: XiaosuanAmbientStatus = Object.freeze({
  active: false,
  sound: 'off',
  soundLabel: '关闭',
  remainingSec: null,
  sounds: DEFAULT_AMBIENT_SOUNDS,
});

export const DEFAULT_XIAOSUAN_SCENES: readonly XiaosuanSceneOption[] = Object.freeze([
  Object.freeze({ id: 'morning', label: '早安' }),
  Object.freeze({ id: 'focus', label: '专注' }),
  Object.freeze({ id: 'bedtime', label: '睡前' }),
  Object.freeze({ id: 'welcome', label: '迎宾' }),
]);

export const DEFAULT_XIAOSUAN_COMBOS: readonly XiaosuanComboOption[] = Object.freeze([
  Object.freeze({ id: 'new_year', label: '拜年' }),
  Object.freeze({ id: 'welcome', label: '迎宾' }),
  Object.freeze({ id: 'cute', label: '卖萌' }),
  Object.freeze({ id: 'warmup', label: '热身' }),
]);

export const AMBIENT_SOUND_LABELS: Readonly<Record<XiaosuanAmbientSoundId, string>> = Object.freeze({
  off: '关闭',
  rain: '雨声',
  ocean: '海浪',
  pink: '暖噪',
  fire: '篝火',
  night: '静夜',
});

export const VOICE_REMINDER_REPEAT_LABELS: Readonly<Record<VoiceReminderRepeat, string>> = Object.freeze({
  '': '单次',
  daily: '每天',
  weekdays: '工作日',
  weekly: '每周',
});

export const SAFE_PHOTO_ID_RE = /^pho_[0-9a-f]{12}$/;

export function isValidPhotoId(id: string | null | undefined): boolean {
  return typeof id === 'string' && SAFE_PHOTO_ID_RE.test(id.trim());
}

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
  ambient: DEFAULT_XIAOSUAN_AMBIENT,
  activeTimer: null,
  companion: null,
  idleLifeEnabled: false,
  speakersAvailable: false,
  speakersCount: 0,
  photosCount: 0,
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

function normalizeAmbientSoundId(value: unknown): XiaosuanAmbientSoundId {
  if (typeof value !== 'string') return 'off';
  const key = value.trim().toLowerCase();
  if (key === 'rain' || key === 'ocean' || key === 'pink' || key === 'fire' || key === 'night') {
    return key;
  }
  return 'off';
}

function normalizeReminderRepeat(value: unknown): VoiceReminderRepeat {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  if (key === 'daily' || key === 'weekdays' || key === 'weekly') return key;
  return '';
}

export function formatAmbientSoundLabel(sound: XiaosuanAmbientSoundId | string | null | undefined): string {
  return AMBIENT_SOUND_LABELS[normalizeAmbientSoundId(sound)];
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

export function formatCompanionMoodLabel(mood: string | null | undefined, explicitLabel?: string | null): string {
  const cleanExplicit = typeof explicitLabel === 'string' ? explicitLabel.trim() : '';
  if (cleanExplicit && /^[\u4e00-\u9fa5]{1,6}$/.test(cleanExplicit)) {
    return cleanExplicit;
  }
  const key = typeof mood === 'string' ? mood.trim().toLowerCase() : '';
  if (key === 'happy' || key === 'excited' || key === 'joy') return '开心';
  if (key === 'playful' || key === 'wink' || key === 'cozy') return '撒娇';
  if (key === 'sleepy' || key === 'tired' || key === 'drowsy') return '困倦';
  if (key === 'sad' || key === 'care' || key === 'concerned') return '关心';
  if (key === 'focused' || key === 'thinking') return '专注';
  return '安心';
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

function parseAmbientPayload(raw: unknown): XiaosuanAmbientStatus {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_XIAOSUAN_AMBIENT;
  }
  const rec = raw as Record<string, unknown>;
  const sound = normalizeAmbientSoundId(rec.sound);
  const active = rec.active === true && sound !== 'off';
  const resolvedSound: XiaosuanAmbientSoundId = active ? sound : 'off';
  const rawLabel = typeof rec.sound_label === 'string' && rec.sound_label.trim()
    ? rec.sound_label.trim().slice(0, 6)
    : typeof rec.soundLabel === 'string' && rec.soundLabel.trim()
      ? rec.soundLabel.trim().slice(0, 6)
      : formatAmbientSoundLabel(resolvedSound);
  const remRaw = rec.remaining_sec ?? rec.remainingSec;
  const remainingSec = typeof remRaw === 'number' && Number.isFinite(remRaw) && remRaw >= 0
    ? Math.floor(remRaw)
    : null;
  const rawSounds = Array.isArray(rec.sounds) ? rec.sounds : [];
  const parsedSounds: XiaosuanAmbientOption[] = [];
  for (const item of rawSounds) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const opt = item as Record<string, unknown>;
    const optId = normalizeAmbientSoundId(opt.id ?? opt.key);
    if (optId === 'off') continue;
    const label = typeof opt.label === 'string' && opt.label.trim()
      ? opt.label.trim().slice(0, 6)
      : formatAmbientSoundLabel(optId);
    if (!parsedSounds.some(existing => existing.id === optId)) {
      parsedSounds.push({ id: optId, label });
    }
  }
  return {
    active,
    sound: resolvedSound,
    soundLabel: active ? rawLabel : '关闭',
    remainingSec: active ? remainingSec : null,
    sounds: parsedSounds.length > 0 ? parsedSounds : DEFAULT_AMBIENT_SOUNDS,
  };
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

function parseCompanionPayload(raw: unknown): XiaosuanCompanionSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const daysRaw = rec.days_together ?? rec.daysTogether;
  const streakRaw = rec.streak_days ?? rec.streakDays;
  const daysTogether = typeof daysRaw === 'number' && Number.isFinite(daysRaw) && daysRaw >= 1
    ? Math.floor(daysRaw)
    : 1;
  const streakDays = typeof streakRaw === 'number' && Number.isFinite(streakRaw) && streakRaw >= 0
    ? Math.floor(streakRaw)
    : daysTogether;
  const mood = typeof rec.mood === 'string' && rec.mood.trim() ? rec.mood.trim() : 'calm';
  const explicitLabel = typeof rec.mood_label === 'string'
    ? rec.mood_label
    : typeof rec.moodLabel === 'string'
      ? rec.moodLabel
      : null;
  const speakerTier = typeof rec.speaker_tier === 'string'
    ? rec.speaker_tier.trim().slice(0, 6)
    : typeof rec.speakerTier === 'string'
      ? rec.speakerTier.trim().slice(0, 6)
      : '';
  return {
    daysTogether,
    streakDays,
    mood,
    moodLabel: formatCompanionMoodLabel(mood, explicitLabel),
    speakerTier,
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
    || value === 'companion'
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
    companion: resolveModBool('companion'),
  };

  const rawHw = rec.hardware && typeof rec.hardware === 'object' && !Array.isArray(rec.hardware)
    ? (rec.hardware as Record<string, unknown>)
    : null;
  const hasExplicitHw = rawHw !== null;
  const hardware: CapabilityHardwareStatus = {
    camera: hasExplicitHw ? rawHw.camera === true : modules.vision_nav,
    navigation: hasExplicitHw ? rawHw.navigation === true : modules.vision_nav,
    voiceprint: hasExplicitHw ? rawHw.voiceprint === true : modules.companion,
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
      companion: moduleList[5].enabled,
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
  const speakersCountRaw = data.speakers_count;
  const speakersCount = typeof speakersCountRaw === 'number' && Number.isFinite(speakersCountRaw) && speakersCountRaw >= 0
    ? Math.floor(speakersCountRaw)
    : 0;
  const photosCountRaw = data.photos_count;
  const photosCount = typeof photosCountRaw === 'number' && Number.isFinite(photosCountRaw) && photosCountRaw >= 0
    ? Math.floor(photosCountRaw)
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
    ambient: parseAmbientPayload(data.ambient),
    activeTimer: parseTimerPayload(data.active_timer),
    companion: parseCompanionPayload(data.companion),
    idleLifeEnabled: data.idle_life_enabled === true,
    speakersAvailable: data.speakers_available === true,
    speakersCount,
    photosCount,
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
    || 'ambient' in data
    || 'active_timer' in data
    || 'companion' in data
    || 'idle_life_enabled' in data
    || 'speakers_available' in data
    || 'speakers_count' in data
    || 'photos_count' in data
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
  control_robot_dog: '动作控制',
  robot_action: '动作控制',
  move_robot: '运动控制',
  get_robot_status: '读取状态',
  take_photo: '拍照留念',
  play_combo: '才艺表演',
  control_ambient: '白噪音',
  run_scene: '切换情景',
  manage_timer: '定时专注',
  daily_briefing: '今日早报',
  read_diary: '读取日记',
  write_diary: '写日记',
  enroll_speaker: '录入声纹',
  who_am_i: '识别声纹',
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
// Wave 2 Companion & Embodied Skills (:8770)
// ---------------------------------------------------------------------------

export function getPhotoUrl(target: VoiceTargetOptions | string, id: string): string {
  const cleanId = typeof id === 'string' ? id.trim() : '';
  if (!SAFE_PHOTO_ID_RE.test(cleanId)) return '';
  try {
    const origin = typeof target === 'string'
      ? deriveXiaosuanVoiceOrigin(target, true)
      : resolveXiaosuanTarget(target).origin;
    if (!origin) return '';
    return `${origin}/api/photos/${encodeURIComponent(cleanId)}.jpg`;
  } catch {
    return '';
  }
}

function parsePhotoItem(xsTarget: VoiceTargetOptions, raw: unknown): XiaosuanPhotoItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  if (!SAFE_PHOTO_ID_RE.test(id)) return null;
  const caption = typeof rec.caption === 'string'
    ? rec.caption.trim()
    : typeof rec.summary === 'string'
      ? rec.summary.trim()
      : '';
  const speakerId = typeof rec.speaker_id === 'string'
    ? rec.speaker_id.trim()
    : typeof rec.speakerId === 'string'
      ? rec.speakerId.trim()
      : '';
  const createdAt = typeof rec.local_time === 'string' && rec.local_time.trim()
    ? rec.local_time.trim()
    : typeof rec.localTime === 'string' && rec.localTime.trim()
      ? rec.localTime.trim()
      : typeof rec.created_at_local === 'string' && rec.created_at_local.trim()
        ? rec.created_at_local.trim()
        : typeof rec.createdAtLocal === 'string' && rec.createdAtLocal.trim()
          ? rec.createdAtLocal.trim()
          : typeof rec.created_at === 'string'
            ? rec.created_at.trim()
            : typeof rec.createdAt === 'string'
              ? rec.createdAt.trim()
              : '';
  const tsRaw = rec.created_ts ?? rec.createdTs ?? rec.ts ?? rec.timestamp;
  const ts = typeof tsRaw === 'number' && Number.isFinite(tsRaw) ? tsRaw : null;
  return {
    id,
    url: getPhotoUrl(xsTarget, id),
    caption,
    emotion: normalizeEmotion(rec.emotion),
    speakerId,
    createdAt,
    ts,
  };
}

export async function listPhotos(
  target: VoiceTargetOptions,
  limit?: number,
): Promise<readonly XiaosuanPhotoItem[]> {
  const xsTarget = resolveXiaosuanTarget(target);
  const path = typeof limit === 'number' && Number.isFinite(limit) && limit > 0
    ? `/api/photos?limit=${Math.min(100, Math.round(limit))}`
    : '/api/photos';
  const res = await requestVoiceJson(xsTarget, 'GET', path, undefined, 5_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  const rawList = Array.isArray(res.data.photos)
    ? res.data.photos
    : Array.isArray(res.data.items)
      ? res.data.items
      : [];
  return rawList
    .map(item => parsePhotoItem(xsTarget, item))
    .filter((item): item is XiaosuanPhotoItem => item !== null);
}

export async function capturePhoto(
  target: VoiceTargetOptions,
  options?: { question?: string },
): Promise<Readonly<{ ok: boolean; photo?: XiaosuanPhotoItem; message: string }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const payload: Record<string, unknown> = {};
  if (typeof options?.question === 'string' && options.question.trim()) {
    payload.question = options.question.trim().slice(0, 120);
  }
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/photos/capture', payload, 12_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const photo = parsePhotoItem(xsTarget, res.data.photo ?? res.data) ?? undefined;
  return { ok: true, photo, message: '已拍照' };
}

export async function deletePhoto(
  target: VoiceTargetOptions,
  id: string,
): Promise<VoiceMemoryMutationResult> {
  const cleanId = id.trim();
  if (!SAFE_PHOTO_ID_RE.test(cleanId)) {
    throw new LingtuVoiceChatError('config', '记录无效');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/photos/delete', { id: cleanId }, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  return { ok: true, message: '已删除' };
}

export async function listSpeakers(
  target: VoiceTargetOptions,
): Promise<XiaosuanSpeakersSnapshot> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/speakers', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  const rawList = Array.isArray(res.data.speakers) ? res.data.speakers : [];
  const speakers: XiaosuanSpeakerItem[] = [];
  for (const item of rawList) {
    if (typeof item === 'string' && item.trim()) {
      speakers.push({ name: item.trim().slice(0, 24), samples: 1 });
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!name) continue;
    const samples = typeof rec.samples === 'number' && Number.isFinite(rec.samples) && rec.samples >= 0
      ? Math.floor(rec.samples)
      : 1;
    speakers.push({ name: name.slice(0, 24), samples });
  }
  return {
    available: res.data.available === true,
    speakers,
  };
}

export async function enrollSpeaker(
  target: VoiceTargetOptions,
  name: string,
): Promise<Readonly<{ ok: boolean; name: string; samples?: number; message: string }>> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new LingtuVoiceChatError('config', '称呼为空');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(
    xsTarget,
    'POST',
    '/api/speakers/enroll',
    { name: cleanName.slice(0, 24) },
    8_000,
  );
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok !== true) {
    throw extractErrorMessage(res.status, res.data);
  }
  const samples = typeof res.data.samples === 'number' && Number.isFinite(res.data.samples)
    ? Math.floor(res.data.samples)
    : undefined;
  return {
    ok: true,
    name: typeof res.data.name === 'string' && res.data.name.trim() ? res.data.name.trim() : cleanName,
    samples,
    message: '已录声纹',
  };
}

export async function deleteSpeaker(
  target: VoiceTargetOptions,
  name: string,
): Promise<VoiceMemoryMutationResult> {
  const cleanName = name.trim();
  if (!cleanName) {
    throw new LingtuVoiceChatError('config', '称呼为空');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(
    xsTarget,
    'POST',
    '/api/speakers/delete',
    { name: cleanName.slice(0, 24) },
    6_000,
  );
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  return { ok: true, message: '已删除' };
}

export async function getAmbient(
  target: VoiceTargetOptions,
): Promise<XiaosuanAmbientStatus> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/ambient', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  return parseAmbientPayload(res.data.ambient ?? res.data);
}

export async function setAmbient(
  target: VoiceTargetOptions,
  sound: XiaosuanAmbientSoundId,
  durationMin?: number | null,
): Promise<Readonly<{ ok: boolean; ambient: XiaosuanAmbientStatus; message: string }>> {
  const normalized = normalizeAmbientSoundId(sound);
  const payload: Record<string, unknown> = { sound: normalized };
  if (normalized !== 'off' && typeof durationMin === 'number' && Number.isFinite(durationMin) && durationMin > 0) {
    payload.duration_min = Math.round(durationMin);
  } else if (durationMin === null) {
    payload.duration_min = null;
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/ambient', payload, 6_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const parsed = parseAmbientPayload(res.data.ambient ?? res.data);
  const ambient: XiaosuanAmbientStatus = normalized === 'off'
    ? { ...parsed, active: false, sound: 'off', soundLabel: '关闭', remainingSec: null }
    : parsed.sound === 'off'
      ? {
        ...parsed,
        active: true,
        sound: normalized,
        soundLabel: formatAmbientSoundLabel(normalized),
        remainingSec: typeof payload.duration_min === 'number' ? payload.duration_min * 60 : null,
      }
      : parsed;
  return {
    ok: true,
    ambient,
    message: ambient.active ? `已播${ambient.soundLabel}` : '已关白噪音',
  };
}

export async function listScenes(
  target: VoiceTargetOptions,
): Promise<readonly XiaosuanSceneOption[]> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/scenes', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const rawList = Array.isArray(res.data.scenes) ? res.data.scenes : [];
  const parsed: XiaosuanSceneOption[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id = String(rec.id ?? rec.key ?? '').trim();
    if (!id) continue;
    const label = typeof rec.label === 'string' && rec.label.trim()
      ? rec.label.trim().slice(0, 6)
      : typeof rec.name === 'string' && rec.name.trim()
        ? rec.name.trim().slice(0, 6)
        : id;
    parsed.push({ id, label });
  }
  return parsed.length > 0 ? parsed : DEFAULT_XIAOSUAN_SCENES;
}

export async function runScene(
  target: VoiceTargetOptions,
  id: string,
  durationMin?: number,
): Promise<Readonly<{ ok: boolean; id: string; message: string }>> {
  const cleanId = id.trim();
  if (!cleanId) {
    throw new LingtuVoiceChatError('config', '参数无效');
  }
  const payload: Record<string, unknown> = { id: cleanId };
  if (typeof durationMin === 'number' && Number.isFinite(durationMin) && durationMin > 0) {
    payload.duration_min = Math.round(durationMin);
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/scenes/run', payload, 12_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const known = DEFAULT_XIAOSUAN_SCENES.find(s => s.id === cleanId);
  return {
    ok: true,
    id: cleanId,
    message: known ? `已切${known.label}` : '已切情景',
  };
}

export async function listCombos(
  target: VoiceTargetOptions,
): Promise<readonly XiaosuanComboOption[]> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'GET', '/api/combos', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const rawList = Array.isArray(res.data.combos) ? res.data.combos : [];
  const parsed: XiaosuanComboOption[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id = String(rec.id ?? rec.key ?? '').trim();
    if (!id) continue;
    const label = typeof rec.label === 'string' && rec.label.trim()
      ? rec.label.trim().slice(0, 6)
      : typeof rec.name === 'string' && rec.name.trim()
        ? rec.name.trim().slice(0, 6)
        : id;
    parsed.push({ id, label });
  }
  return parsed.length > 0 ? parsed : DEFAULT_XIAOSUAN_COMBOS;
}

export async function playCombo(
  target: VoiceTargetOptions,
  id: string,
): Promise<Readonly<{ ok: boolean; id: string; message: string }>> {
  const cleanId = id.trim();
  if (!cleanId) {
    throw new LingtuVoiceChatError('config', '参数无效');
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/combos/play', { id: cleanId }, 8_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const known = DEFAULT_XIAOSUAN_COMBOS.find(c => c.id === cleanId);
  return {
    ok: true,
    id: cleanId,
    message: known ? `表演${known.label}` : '开始表演',
  };
}

export async function stopCombo(
  target: VoiceTargetOptions,
): Promise<VoiceMemoryMutationResult> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/combos/stop', {}, 5_000);
  if (res.status < 200 || res.status >= 300 || (res.data && res.data.ok === false)) {
    throw extractErrorMessage(res.status, res.data);
  }
  return { ok: true, message: '已停表演' };
}

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

function parseDiaryItem(raw: unknown): XiaosuanDiaryItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const date = typeof rec.date === 'string' ? rec.date.trim() : '';
  const text = typeof rec.text === 'string'
    ? rec.text.trim()
    : typeof rec.content === 'string'
      ? rec.content.trim()
      : typeof rec.body === 'string'
        ? rec.body.trim()
        : '';
  if (!date || !text) return null;
  const mood = typeof rec.mood === 'string' && rec.mood.trim() ? rec.mood.trim() : 'calm';
  const explicitMood = typeof rec.mood_label === 'string'
    ? rec.mood_label
    : typeof rec.moodLabel === 'string'
      ? rec.moodLabel
      : null;
  const rawPhotoIds = Array.isArray(rec.photo_ids)
    ? rec.photo_ids
    : Array.isArray(rec.photoIds)
      ? rec.photoIds
      : [];
  const photoIds = rawPhotoIds
    .filter((pid): pid is string => typeof pid === 'string' && SAFE_PHOTO_ID_RE.test(pid.trim()))
    .map(pid => pid.trim());
  const createdAt = typeof rec.created_at === 'string'
    ? rec.created_at.trim()
    : typeof rec.createdAt === 'string'
      ? rec.createdAt.trim()
      : '';
  return {
    date,
    text,
    mood,
    moodLabel: formatCompanionMoodLabel(mood, explicitMood),
    photoIds,
    createdAt,
  };
}

export async function listDiaries(
  target: VoiceTargetOptions,
  limit?: number,
): Promise<readonly XiaosuanDiaryItem[]> {
  const xsTarget = resolveXiaosuanTarget(target);
  const path = typeof limit === 'number' && Number.isFinite(limit) && limit > 0
    ? `/api/diary?limit=${Math.min(90, Math.round(limit))}`
    : '/api/diary';
  const res = await requestVoiceJson(xsTarget, 'GET', path, undefined, 5_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractMemoryError(res.status, res.data);
  }
  const rawList = Array.isArray(res.data.diaries)
    ? res.data.diaries
    : Array.isArray(res.data.items)
      ? res.data.items
      : res.data.diary
        ? [res.data.diary]
        : [];
  return rawList
    .map(parseDiaryItem)
    .filter((item): item is XiaosuanDiaryItem => item !== null);
}

export async function generateDiary(
  target: VoiceTargetOptions,
  opts?: { date?: string; force?: boolean },
): Promise<Readonly<{ ok: boolean; diary?: XiaosuanDiaryItem; message: string }>> {
  const payload: Record<string, unknown> = {};
  if (typeof opts?.date === 'string' && opts.date.trim()) {
    payload.date = opts.date.trim();
  }
  if (typeof opts?.force === 'boolean') {
    payload.force = opts.force;
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/diary/generate', payload, 15_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const diary = parseDiaryItem(res.data.diary ?? res.data) ?? undefined;
  return { ok: true, diary, message: '已写日记' };
}

export async function readDiary(
  target: VoiceTargetOptions,
  date?: string,
): Promise<Readonly<{ ok: boolean; diary?: XiaosuanDiaryItem; message: string }>> {
  const payload: Record<string, unknown> = {};
  if (typeof date === 'string' && date.trim()) {
    payload.date = date.trim();
  }
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/diary/read', payload, 10_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const diary = parseDiaryItem(res.data.diary ?? res.data) ?? undefined;
  return { ok: true, diary, message: '朗读中' };
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

export async function setIdleLife(
  target: VoiceTargetOptions,
  enabled: boolean,
): Promise<Readonly<{ ok: boolean; enabled: boolean; message: string }>> {
  const xsTarget = resolveXiaosuanTarget(target);
  const res = await requestVoiceJson(xsTarget, 'POST', '/api/idle_life', { enabled }, 5_000);
  if (res.status < 200 || res.status >= 300 || !res.data || res.data.ok === false) {
    throw extractErrorMessage(res.status, res.data);
  }
  const resolved = typeof res.data.enabled === 'boolean'
    ? res.data.enabled
    : typeof res.data.idle_life_enabled === 'boolean'
      ? res.data.idle_life_enabled
      : enabled;
  return {
    ok: true,
    enabled: resolved,
    message: resolved ? '待机微动开' : '待机微动关',
  };
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
    if ('ambient' in res.data) patch.ambient = parsedStatus.ambient;
    if ('active_timer' in res.data) patch.activeTimer = parsedStatus.activeTimer;
    if ('companion' in res.data) patch.companion = parsedStatus.companion;
    if ('idle_life_enabled' in res.data) patch.idleLifeEnabled = parsedStatus.idleLifeEnabled;
    if ('speakers_available' in res.data) patch.speakersAvailable = parsedStatus.speakersAvailable;
    if ('speakers_count' in res.data) patch.speakersCount = parsedStatus.speakersCount;
    if ('photos_count' in res.data) patch.photosCount = parsedStatus.photosCount;
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
