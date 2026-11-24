import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addVoiceMemory,
  addVoiceReminder,
  cancelLingtuVoiceTurn,
  cancelTimer,
  capturePhoto,
  clearVoiceSessionMemory,
  createLingtuVoiceConversation,
  decideLingtuVoiceApproval,
  DEFAULT_LEGACY_CAPABILITIES,
  DEFAULT_XIAOSUAN_AMBIENT,
  DEFAULT_XIAOSUAN_COMBOS,
  DEFAULT_XIAOSUAN_ROLES,
  DEFAULT_XIAOSUAN_SCENES,
  DEFAULT_XIAOSUAN_STATUS,
  DEFAULT_XIAOSUAN_VOICES,
  deletePhoto,
  deleteSpeaker,
  deleteVoiceMemory,
  deleteVoiceReminder,
  detectSpeechInputMode,
  EMPTY_VOICE_MEMORY_ROOM_COUNTS,
  enrollSpeaker,
  fetchVoiceMemories,
  fetchVoiceReminders,
  fetchXiaosuanPersona,
  fetchXiaosuanStatus,
  formatAmbientSoundLabel,
  formatTimerCountdown,
  formatXiaosuanEmotionLabel,
  formatXiaosuanLiveStateLabel,
  formatXiaosuanRoleShortName,
  formatXiaosuanVoiceShortName,
  generateDiary,
  getAmbient,
  getTimers,
  LingtuVoiceChatError,
  listCombos,
  listDiaries,
  listPhotos,
  listScenes,
  listSpeakers,
  pauseTimer,
  playCombo,
  probeLingtuVoiceService,
  readDiary,
  readLingtuVoiceConversation,
  readXiaosuanCapabilities,
  readXiaosuanVoiceTranscript,
  resolveRobotVoiceOrigin,
  resumeTimer,
  runBriefing,
  runScene,
  sendBroadcast,
  sendLingtuVoiceMessage,
  setAmbient,
  setIdleLife,
  setXiaosuanQuietMode,
  setXiaosuanVolume,
  snoozeVoiceReminder,
  speakRobotVoiceReply,
  startSpeechInputCapture,
  startTimer,
  stopCombo,
  stopRobotVoiceReply,
  stopXiaosuanVoice,
  updateVoiceMemory,
  updateXiaosuanCapabilities,
  updateXiaosuanPersona,
  wakeXiaosuanVoice,
  type ActiveSpeechCapture,
  type CapabilityHardwareStatus,
  type CapabilityMemoryAcl,
  type CapabilityModuleId,
  type CapabilityModuleInfo,
  type CapabilityModuleMap,
  type DutyProfileId,
  type DutyProfileOption,
  type RobotCapabilitiesSnapshot,
  type VoiceChatApprovalItem,
  type VoiceChatMessageItem,
  type VoiceChatMessageSource,
  type VoiceChatServiceMode,
  type VoiceChatTurnItem,
  type VoiceMemoryItem,
  type VoiceMemoryRoom,
  type VoiceMemoryRoomCounts,
  type VoiceReminderItem,
  type VoiceReminderRepeat,
  type XiaosuanAmbientSoundId,
  type XiaosuanAmbientStatus,
  type XiaosuanComboOption,
  type XiaosuanCompanionSnapshot,
  type XiaosuanDiaryItem,
  type XiaosuanEmotion,
  type XiaosuanLiveState,
  type XiaosuanPersonaOption,
  type XiaosuanPhotoItem,
  type XiaosuanSceneOption,
  type XiaosuanSpeakerItem,
  type XiaosuanStatusSnapshot,
  type XiaosuanTimerKind,
  type XiaosuanTimerSnapshot,
} from '../../services/lingtuVoiceChat';

export type RobotVoicePhase =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'awaiting'
  | 'unavailable';

export type RobotVoiceTab = 'chat' | 'memory' | 'reminders' | 'moments';
export type VoiceDrawerTab = 'style' | 'capabilities';
export type VoiceMemoryFilter = 'all' | VoiceMemoryRoom;
export type VoiceQuickGroup = 'default' | 'scenes' | 'combos';
export type {
  CapabilityHardwareStatus,
  CapabilityMemoryAcl,
  CapabilityModuleId,
  CapabilityModuleInfo,
  CapabilityModuleMap,
  DutyProfileId,
  DutyProfileOption,
  RobotCapabilitiesSnapshot,
  VoiceMemoryItem,
  VoiceMemoryRoom,
  VoiceMemoryRoomCounts,
  VoiceReminderItem,
  VoiceReminderRepeat,
  XiaosuanAmbientSoundId,
  XiaosuanAmbientStatus,
  XiaosuanComboOption,
  XiaosuanCompanionSnapshot,
  XiaosuanDiaryItem,
  XiaosuanEmotion,
  XiaosuanLiveState,
  XiaosuanPersonaOption,
  XiaosuanPhotoItem,
  XiaosuanSceneOption,
  XiaosuanSpeakerItem,
  XiaosuanStatusSnapshot,
  XiaosuanTimerKind,
  XiaosuanTimerSnapshot,
};

function mergeCapabilitiesSnapshot(
  prev: RobotCapabilitiesSnapshot | null,
  incoming: RobotCapabilitiesSnapshot,
): RobotCapabilitiesSnapshot {
  if (!prev) return incoming;
  const keepOverrides =
    incoming.hasOverrides
    && Object.keys(incoming.overrides).length === 0
    && prev.profile === incoming.profile
    && Object.keys(prev.overrides).length > 0;
  let mergedOverrides = incoming.overrides;
  if (keepOverrides) {
    if (!incoming.modules.voice_walk && 'voice_walk' in prev.overrides) {
      const { voice_walk: _dropped, ...rest } = prev.overrides;
      mergedOverrides = rest;
    } else {
      mergedOverrides = prev.overrides;
    }
  }
  return {
    ...incoming,
    profiles: incoming.profiles.length > 0 ? incoming.profiles : prev.profiles,
    overrides: mergedOverrides,
  };
}

type PendingOptimisticMessage = Readonly<{
  id: string;
  text: string;
  createdAt: number;
  baseSeq: number;
  source?: VoiceChatMessageSource;
}>;

export type RobotVoiceController = Readonly<{
  open: boolean;
  setOpen: (next: boolean) => void;
  toggleOpen: () => void;
  activeTab: RobotVoiceTab;
  setActiveTab: (tab: RobotVoiceTab) => void;
  serviceMode: VoiceChatServiceMode;
  isXiaosuanMode: boolean;
  phase: RobotVoicePhase;
  statusLabel: string;
  liveState: XiaosuanLiveState;
  emotion: XiaosuanEmotion;
  emotionLabel: string | null;
  quietMode: boolean;
  dogVolume: number | null;
  pendingRemindersCount: number;
  hardwareBusy: boolean;
  styleDrawerOpen: boolean;
  setStyleDrawerOpen: (next: boolean) => void;
  onToggleStyleDrawer: () => void;
  drawerTab: VoiceDrawerTab;
  setDrawerTab: (tab: VoiceDrawerTab) => void;
  capabilities: RobotCapabilitiesSnapshot;
  capabilitiesSupported: boolean;
  capabilitiesBusy: boolean;
  dutyProfile: DutyProfileId;
  dutyProfileName: string;
  setDutyProfile: (profileId: DutyProfileId) => void;
  setCapabilityEnabled: (moduleId: CapabilityModuleId, enabled: boolean) => void;
  resetCapabilities: () => void;
  activeRoleId: string;
  activeRoleName: string;
  activeVoiceId: string;
  activeVoiceName: string;
  roleOptions: readonly XiaosuanPersonaOption[];
  voiceOptions: readonly XiaosuanPersonaOption[];
  personaBusy: boolean;
  noticeText: string | null;
  errorText: string | null;
  messages: readonly VoiceChatMessageItem[];
  pendingApprovals: readonly VoiceChatApprovalItem[];
  draft: string;
  setDraft: (value: string) => void;
  listening: boolean;
  speechSupported: boolean;
  busy: boolean;
  canStop: boolean;
  activeTurnId: string | null;
  approvalBusyId: string | null;
  voiceReplyEnabled: boolean;
  onToggleVoiceReply: () => void;
  onToggleListening: () => void;
  onSubmit: (overrideText?: string) => void;
  onCancelTurn: () => void;
  onWakeDog: () => void;
  onToggleQuietMode: () => void;
  onSetDogVolume: (volume: number) => void;
  onSelectRole: (roleId: string) => void;
  onSelectVoice: (voiceId: string) => void;
  onDecideApproval: (approvalId: string, approved: boolean) => void;
  onResetConversation: () => void;
  memoryPanelOpen: boolean;
  onToggleMemoryPanel: () => void;
  memoryFilter: VoiceMemoryFilter;
  setMemoryFilter: (next: VoiceMemoryFilter) => void;
  memoryQuery: string;
  setMemoryQuery: (value: string) => void;
  memoryDraft: string;
  setMemoryDraft: (value: string) => void;
  memoryRoomDraft: VoiceMemoryRoom;
  setMemoryRoomDraft: (room: VoiceMemoryRoom) => void;
  memoryPinOnAdd: boolean;
  onToggleMemoryPinOnAdd: () => void;
  editingMemoryId: string | null;
  editingMemoryText: string;
  setEditingMemoryText: (value: string) => void;
  editingMemoryRoom: VoiceMemoryRoom;
  setEditingMemoryRoom: (room: VoiceMemoryRoom) => void;
  onStartEditMemory: (item: VoiceMemoryItem) => void;
  onCancelEditMemory: () => void;
  onSaveEditMemory: () => void;
  memoryItems: readonly VoiceMemoryItem[];
  memoryRoomCounts: VoiceMemoryRoomCounts;
  memorySummary: string;
  memoryHasSessionContext: boolean;
  memoryLoading: boolean;
  memoryBusyId: string | null;
  memoryActionBusy: boolean;
  memoryError: string | null;
  onRefreshMemories: () => void;
  onAddMemory: (text: string, room?: VoiceMemoryRoom, pinned?: boolean) => void;
  onEditMemory: (id: string, text: string, room?: VoiceMemoryRoom) => void;
  onTogglePinMemory: (id: string, pinned: boolean) => void;
  onDeleteMemory: (id: string) => void;
  onClearMemorySession: () => void;
  reminders: readonly VoiceReminderItem[];
  reminderContentDraft: string;
  setReminderContentDraft: (value: string) => void;
  reminderTimeDraft: string;
  setReminderTimeDraft: (value: string) => void;
  reminderRepeatDraft: VoiceReminderRepeat;
  setReminderRepeatDraft: (value: VoiceReminderRepeat) => void;
  remindersLoading: boolean;
  remindersBusyId: string | null;
  remindersActionBusy: boolean;
  remindersError: string | null;
  onRefreshReminders: () => void;
  onAddReminder: (content: string, timeExpr: string, repeat?: VoiceReminderRepeat) => void;
  onSnoozeReminder: (id: string, minutes?: number) => void;
  onDeleteReminder: (id: string) => void;
  // Wave 2: Broadcast, Quick Actions (Scenes/Combos/Briefing), Ambient, Idle Life, Voiceprints, Timers, Moments (Photos/Diaries/Companion)
  broadcastMode: boolean;
  onToggleBroadcastMode: () => void;
  onSendBroadcast: (overrideText?: string) => void;
  quickGroup: VoiceQuickGroup;
  setQuickGroup: (group: VoiceQuickGroup) => void;
  sceneOptions: readonly XiaosuanSceneOption[];
  comboOptions: readonly XiaosuanComboOption[];
  activeComboId: string | null;
  actionRailBusy: boolean;
  onRunScene: (id: string, durationMin?: number) => void;
  onPlayCombo: (id: string) => void;
  onStopCombo: () => void;
  onRunBriefing: () => void;
  ambient: XiaosuanAmbientStatus;
  ambientDurationMin: number | null;
  setAmbientDurationMin: (min: number | null) => void;
  ambientBusy: boolean;
  onSelectAmbient: (sound: XiaosuanAmbientSoundId) => void;
  idleLifeEnabled: boolean;
  idleLifeBusy: boolean;
  onToggleIdleLife: () => void;
  speakersAvailable: boolean;
  speakers: readonly XiaosuanSpeakerItem[];
  speakersBusy: boolean;
  speakerNameDraft: string;
  setSpeakerNameDraft: (value: string) => void;
  onEnrollSpeaker: (name?: string) => void;
  onDeleteSpeaker: (name: string) => void;
  activeTimer: XiaosuanTimerSnapshot | null;
  timerRemainingSec: number | null;
  timerDisplayLabel: string | null;
  timerBusy: boolean;
  onStartTimer: (opts: { kind?: XiaosuanTimerKind; durationSec: number; label?: string; autoQuiet?: boolean }) => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  onCancelTimer: () => void;
  companion: XiaosuanCompanionSnapshot | null;
  photosCount: number;
  photos: readonly XiaosuanPhotoItem[];
  photosLoading: boolean;
  photoCapturing: boolean;
  photoBusyId: string | null;
  photosError: string | null;
  selectedPhotoId: string | null;
  setSelectedPhotoId: (id: string | null) => void;
  onCapturePhoto: () => void;
  onDeletePhoto: (id: string) => void;
  diaries: readonly XiaosuanDiaryItem[];
  diariesLoading: boolean;
  diaryGenerating: boolean;
  diaryReadingDate: string | null;
  diariesError: string | null;
  onGenerateDiary: (force?: boolean) => void;
  onReadDiary: (date?: string) => void;
  onRefreshMoments: () => void;
}>;

export function useRobotVoiceChat(options: {
  appActive: boolean;
  connected: boolean;
  endpoint?: string | null;
  host?: string | null;
  viewerToken?: string;
  allowLocalHttp?: boolean;
  volumePercent: number;
  voiceReplyEnabled: boolean;
  onToggleVoiceReply: () => void;
}): RobotVoiceController {
  const {
    appActive,
    connected,
    endpoint,
    host,
    viewerToken,
    allowLocalHttp = false,
    volumePercent,
    voiceReplyEnabled,
    onToggleVoiceReply,
  } = options;

  const [open, setOpenState] = useState(false);
  const [activeTab, setActiveTabState] = useState<RobotVoiceTab>('chat');
  const [styleDrawerOpen, setStyleDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTabState] = useState<VoiceDrawerTab>('style');
  const [capabilitiesState, setCapabilitiesState] = useState<RobotCapabilitiesSnapshot | null>(null);
  const [capabilitiesBusy, setCapabilitiesBusy] = useState(false);
  const [serviceState, setServiceState] = useState<'idle' | 'connecting' | 'ready' | 'unavailable'>('idle');
  const [serviceMode, setServiceMode] = useState<VoiceChatServiceMode>('conversation');
  const [activeServiceOrigin, setActiveServiceOrigin] = useState<string | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly VoiceChatMessageItem[]>([]);
  const [turns, setTurns] = useState<readonly VoiceChatTurnItem[]>([]);
  const [approvals, setApprovals] = useState<readonly VoiceChatApprovalItem[]>([]);
  const [draft, setDraft] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [hardwareBusy, setHardwareBusy] = useState(false);
  const [personaBusy, setPersonaBusy] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [speechMode, setSpeechMode] = useState<'web' | 'native' | 'none'>('none');
  const [listening, setListening] = useState(false);

  const [xiaosuanStatus, setXiaosuanStatus] = useState<XiaosuanStatusSnapshot>(DEFAULT_XIAOSUAN_STATUS);
  const [roleOptions, setRoleOptions] = useState<readonly XiaosuanPersonaOption[]>(DEFAULT_XIAOSUAN_ROLES);
  const [voiceOptions, setVoiceOptions] = useState<readonly XiaosuanPersonaOption[]>(DEFAULT_XIAOSUAN_VOICES);
  const [personaLoaded, setPersonaLoaded] = useState(false);

  const [memoryFilter, setMemoryFilterState] = useState<VoiceMemoryFilter>('all');
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryRoomDraft, setMemoryRoomDraft] = useState<VoiceMemoryRoom>('user_long_term');
  const [memoryPinOnAdd, setMemoryPinOnAdd] = useState(false);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');
  const [editingMemoryRoom, setEditingMemoryRoom] = useState<VoiceMemoryRoom>('user_long_term');
  const [memoryItems, setMemoryItems] = useState<readonly VoiceMemoryItem[]>([]);
  const [memoryRoomCounts, setMemoryRoomCounts] = useState<VoiceMemoryRoomCounts>(EMPTY_VOICE_MEMORY_ROOM_COUNTS);
  const [memorySummary, setMemorySummary] = useState('');
  const [memoryWorkingTurnCount, setMemoryWorkingTurnCount] = useState(0);
  const [memorySessionCleared, setMemorySessionCleared] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryBusyId, setMemoryBusyId] = useState<string | null>(null);
  const [memoryActionBusy, setMemoryActionBusy] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  const [reminders, setReminders] = useState<readonly VoiceReminderItem[]>([]);
  const [reminderContentDraft, setReminderContentDraft] = useState('');
  const [reminderTimeDraft, setReminderTimeDraft] = useState('10分钟后');
  const [reminderRepeatDraft, setReminderRepeatDraft] = useState<VoiceReminderRepeat>('');
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [remindersBusyId, setRemindersBusyId] = useState<string | null>(null);
  const [remindersActionBusy, setRemindersActionBusy] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);

  const [broadcastMode, setBroadcastMode] = useState(false);
  const [quickGroup, setQuickGroupState] = useState<VoiceQuickGroup>('default');
  const [sceneOptions, setSceneOptions] = useState<readonly XiaosuanSceneOption[]>(DEFAULT_XIAOSUAN_SCENES);
  const [comboOptions, setComboOptions] = useState<readonly XiaosuanComboOption[]>(DEFAULT_XIAOSUAN_COMBOS);
  const [activeComboId, setActiveComboId] = useState<string | null>(null);
  const [actionRailBusy, setActionRailBusy] = useState(false);

  const [ambientDurationMin, setAmbientDurationMinState] = useState<number | null>(30);
  const [ambientBusy, setAmbientBusy] = useState(false);
  const [idleLifeBusy, setIdleLifeBusy] = useState(false);
  const [speakersAvailableOverride, setSpeakersAvailableOverride] = useState<boolean | null>(null);
  const [speakers, setSpeakers] = useState<readonly XiaosuanSpeakerItem[]>([]);
  const [speakersBusy, setSpeakersBusy] = useState(false);
  const [speakerNameDraft, setSpeakerNameDraft] = useState('');

  const [activeTimer, setActiveTimer] = useState<XiaosuanTimerSnapshot | null>(null);
  const [timerDisplaySec, setTimerDisplaySec] = useState<number | null>(null);
  const [timerBusy, setTimerBusy] = useState(false);

  const [photos, setPhotos] = useState<readonly XiaosuanPhotoItem[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoCapturing, setPhotoCapturing] = useState(false);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  const [photosError, setPhotosError] = useState<string | null>(null);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);

  const [diaries, setDiaries] = useState<readonly XiaosuanDiaryItem[]>([]);
  const [diariesLoading, setDiariesLoading] = useState(false);
  const [diaryGenerating, setDiaryGenerating] = useState(false);
  const [diaryReadingDate, setDiaryReadingDate] = useState<string | null>(null);
  const [diariesError, setDiariesError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const speechCaptureRef = useRef<ActiveSpeechCapture | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const seededInitialHistoryRef = useRef(false);
  const optimisticPendingRef = useRef<PendingOptimisticMessage[]>([]);
  const memoryFetchSeqRef = useRef(0);
  const remindersFetchSeqRef = useRef(0);
  const momentsFetchSeqRef = useRef(0);
  const drawerExtrasLoadedRef = useRef(false);
  const capabilitiesLoadedRef = useRef(false);
  const capabilitiesUnsupportedRef = useRef(false);
  const capabilitiesSyncSeqRef = useRef(0);
  const scenesLoadedRef = useRef(false);
  const combosLoadedRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitRef = useRef<(overrideText?: string) => void>(() => {});
  const autoProbedOriginRef = useRef<string | null>(null);

  const resolvedOrigin = useMemo(
    () => (connected ? resolveRobotVoiceOrigin({ endpoint, host, allowLocalHttp }) : null),
    [allowLocalHttp, connected, endpoint, host],
  );

  const showNotice = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNoticeText(clean);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      if (mountedRef.current) setNoticeText(null);
    }, 2_200);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void detectSpeechInputMode().then(mode => {
      if (mountedRef.current) setSpeechMode(mode);
    });
    return () => {
      mountedRef.current = false;
      if (noticeTimerRef.current) {
        clearTimeout(noticeTimerRef.current);
        noticeTimerRef.current = null;
      }
      speechCaptureRef.current?.cancel();
      speechCaptureRef.current = null;
      stopRobotVoiceReply();
    };
  }, []);

  const stopListening = useCallback((cancelOnly = false) => {
    const active = speechCaptureRef.current;
    speechCaptureRef.current = null;
    if (active) {
      if (cancelOnly) active.cancel();
      else active.stop();
    }
    setListening(false);
  }, []);

  useEffect(() => {
    if (!appActive || !open) {
      stopListening(true);
      if (!appActive) stopRobotVoiceReply();
    }
  }, [appActive, open, stopListening]);

  // Reset session state whenever robot origin changes.
  useEffect(() => {
    stopListening(true);
    stopRobotVoiceReply();
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    autoProbedOriginRef.current = null;
    setServiceState('idle');
    setServiceMode('conversation');
    setActiveServiceOrigin(null);
    setConversationId(null);
    setMessages([]);
    setTurns([]);
    setApprovals([]);
    setErrorText(null);
    setNoticeText(null);
    setStyleDrawerOpen(false);
    setDrawerTabState('style');
    setCapabilitiesState(null);
    setCapabilitiesBusy(false);
    setActiveTabState('chat');
    setXiaosuanStatus(DEFAULT_XIAOSUAN_STATUS);
    setRoleOptions(DEFAULT_XIAOSUAN_ROLES);
    setVoiceOptions(DEFAULT_XIAOSUAN_VOICES);
    setPersonaLoaded(false);
    spokenIdsRef.current.clear();
    seededInitialHistoryRef.current = false;
    optimisticPendingRef.current = [];
    memoryFetchSeqRef.current += 1;
    remindersFetchSeqRef.current += 1;
    momentsFetchSeqRef.current += 1;
    drawerExtrasLoadedRef.current = false;
    capabilitiesLoadedRef.current = false;
    capabilitiesUnsupportedRef.current = false;
    capabilitiesSyncSeqRef.current += 1;
    scenesLoadedRef.current = false;
    combosLoadedRef.current = false;
    setMemoryFilterState('all');
    setMemoryQuery('');
    setMemoryDraft('');
    setMemoryRoomDraft('user_long_term');
    setMemoryPinOnAdd(false);
    setEditingMemoryId(null);
    setEditingMemoryText('');
    setEditingMemoryRoom('user_long_term');
    setMemoryItems([]);
    setMemoryRoomCounts(EMPTY_VOICE_MEMORY_ROOM_COUNTS);
    setMemorySummary('');
    setMemoryWorkingTurnCount(0);
    setMemorySessionCleared(false);
    setMemoryLoading(false);
    setMemoryBusyId(null);
    setMemoryActionBusy(false);
    setMemoryError(null);
    setReminders([]);
    setReminderContentDraft('');
    setReminderTimeDraft('10分钟后');
    setReminderRepeatDraft('');
    setRemindersLoading(false);
    setRemindersBusyId(null);
    setRemindersActionBusy(false);
    setRemindersError(null);
    setBroadcastMode(false);
    setQuickGroupState('default');
    setSceneOptions(DEFAULT_XIAOSUAN_SCENES);
    setComboOptions(DEFAULT_XIAOSUAN_COMBOS);
    setActiveComboId(null);
    setActionRailBusy(false);
    setAmbientDurationMinState(30);
    setAmbientBusy(false);
    setIdleLifeBusy(false);
    setSpeakersAvailableOverride(null);
    setSpeakers([]);
    setSpeakersBusy(false);
    setSpeakerNameDraft('');
    setActiveTimer(null);
    setTimerDisplaySec(null);
    setTimerBusy(false);
    setPhotos([]);
    setPhotosLoading(false);
    setPhotoCapturing(false);
    setPhotoBusyId(null);
    setPhotosError(null);
    setSelectedPhotoId(null);
    setDiaries([]);
    setDiariesLoading(false);
    setDiaryGenerating(false);
    setDiaryReadingDate(null);
    setDiariesError(null);
  }, [resolvedOrigin, stopListening]);

  const isXiaosuanMode = serviceMode === 'xiaosuan';
  const capabilitiesSupported = isXiaosuanMode && capabilitiesState !== null;
  const capabilities = capabilitiesState ?? DEFAULT_LEGACY_CAPABILITIES;
  const modRobotControl = !isXiaosuanMode || capabilities.modules.robot_control;
  const modMemory = !isXiaosuanMode || capabilities.modules.memory;
  const modInfoReminders = !isXiaosuanMode || capabilities.modules.info_reminders;
  const modVisionNav = !isXiaosuanMode || capabilities.modules.vision_nav;
  const modCompanion = !isXiaosuanMode || capabilities.modules.companion;

  const syncActiveTimer = useCallback((next: XiaosuanTimerSnapshot | null) => {
    setActiveTimer(next);
    setTimerDisplaySec(next ? Math.max(0, Math.floor(next.remainingSec)) : null);
  }, []);

  const applyXiaosuanStatusPatch = useCallback(
    (patch: Partial<XiaosuanStatusSnapshot>) => {
      setXiaosuanStatus(prev => ({ ...prev, ...patch }));
      if ('activeTimer' in patch) {
        syncActiveTimer(patch.activeTimer ?? null);
      }
      if (patch.capabilities) {
        setCapabilitiesState(prev => mergeCapabilitiesSnapshot(prev, patch.capabilities!));
      }
    },
    [syncActiveTimer],
  );

  const applyXiaosuanStatus = useCallback(
    (next: XiaosuanStatusSnapshot) => {
      setXiaosuanStatus(next);
      syncActiveTimer(next.activeTimer);
      if (next.capabilities) {
        setCapabilitiesState(prev => mergeCapabilitiesSnapshot(prev, next.capabilities!));
      }
    },
    [syncActiveTimer],
  );

  // Smooth 1-second local countdown ticker while an active timer is running (avoids hammering :8770).
  useEffect(() => {
    if (!appActive || !modInfoReminders || !activeTimer || activeTimer.state !== 'running') return;
    const ticker = setInterval(() => {
      setTimerDisplaySec(prev => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1_000);
    return () => clearInterval(ticker);
  }, [appActive, activeTimer?.id, activeTimer?.state, modInfoReminders]);

  const reconcileOptimisticMessages = useCallback(
    (incoming: readonly VoiceChatMessageItem[]): readonly VoiceChatMessageItem[] => {
      const pending = optimisticPendingRef.current;
      if (pending.length === 0) return incoming;
      const now = Date.now();
      const tailSlice = incoming.slice(-6);
      const stillPending: PendingOptimisticMessage[] = [];
      for (const item of pending) {
        if (now - item.createdAt > 15_000) continue;
        const matched = incoming.some(
          msg => msg.role === 'user' && msg.text.trim() === item.text && msg.seq > item.baseSeq,
        ) || tailSlice.some(
          msg => msg.role === 'user' && msg.text.trim() === item.text,
        );
        if (!matched) stillPending.push(item);
      }
      optimisticPendingRef.current = stillPending;
      if (stillPending.length === 0) return incoming;
      let nextSeq = incoming.reduce((acc, msg) => Math.max(acc, msg.seq), 0);
      const extras: VoiceChatMessageItem[] = stillPending.map(item => {
        nextSeq += 1;
        return {
          id: item.id,
          seq: nextSeq,
          role: 'user',
          text: item.text,
          turnId: `pending_${item.id}`,
          source: item.source ?? 'app',
        };
      });
      return [...incoming, ...extras];
    },
    [],
  );

  const applySnapshot = useCallback(
    (
      snapshot: Awaited<ReturnType<typeof readLingtuVoiceConversation>>,
      allowAutoSpeak: boolean,
      isXiaosuan = false,
    ) => {
      const mergedMessages = isXiaosuan
        ? reconcileOptimisticMessages(snapshot.messages)
        : snapshot.messages;
      setMessages(mergedMessages);
      setTurns(snapshot.turns);
      setApprovals(snapshot.approvals);
      if (snapshot.statusPatch) {
        applyXiaosuanStatusPatch(snapshot.statusPatch);
      } else if (snapshot.status) {
        applyXiaosuanStatus(snapshot.status);
      }

      if (!seededInitialHistoryRef.current) {
        for (const msg of mergedMessages) {
          if (msg.role === 'assistant') spokenIdsRef.current.add(msg.id);
        }
        seededInitialHistoryRef.current = true;
        return;
      }

      if (!allowAutoSpeak) return;
      const turnMap = new Map(snapshot.turns.map(t => [t.turnId, t]));
      for (const msg of mergedMessages) {
        if (msg.role !== 'assistant' || !msg.text.trim() || spokenIdsRef.current.has(msg.id)) continue;
        const turn = turnMap.get(msg.turnId);
        if (!turn || turn.state === 'completed') {
          spokenIdsRef.current.add(msg.id);
          speakRobotVoiceReply(msg.text, volumePercent, voiceReplyEnabled);
        }
      }
    },
    [applyXiaosuanStatus, applyXiaosuanStatusPatch, reconcileOptimisticMessages, voiceReplyEnabled, volumePercent],
  );

  // Silent presence discovery on connect so HUD dock pill reflects live Xiaosuan state immediately.
  useEffect(() => {
    if (!appActive || !resolvedOrigin || open) return;
    if (serviceState !== 'idle' || autoProbedOriginRef.current === resolvedOrigin) return;
    autoProbedOriginRef.current = resolvedOrigin;

    const controller = new AbortController();
    void (async () => {
      try {
        const probe = await probeLingtuVoiceService({
          origin: resolvedOrigin,
          viewerToken,
          allowLocalHttp,
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) return;
        const targetOrigin = probe.serviceOrigin || resolvedOrigin;
        setActiveServiceOrigin(targetOrigin);
        setServiceMode(probe.mode);
        setDefaultModel(probe.defaultModel);
        if (probe.mode === 'xiaosuan') {
          if (probe.initialStatus) applyXiaosuanStatus(probe.initialStatus);
          setServiceState('ready');
        }
      } catch {
        /* Stay idle until user opens the voice panel explicitly. */
      }
    })();
    return () => controller.abort();
  }, [allowLocalHttp, appActive, applyXiaosuanStatus, open, resolvedOrigin, serviceState, viewerToken]);

  // Connect & create conversation or load initial Xiaosuan transcript when the voice panel opens.
  useEffect(() => {
    if (!open || !appActive || !resolvedOrigin) return;
    if (serviceState === 'ready' && (serviceMode === 'instruction' || serviceMode === 'xiaosuan' || conversationId)) {
      if (serviceMode === 'xiaosuan' && !seededInitialHistoryRef.current) {
        const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
        const controller = new AbortController();
        void readXiaosuanVoiceTranscript({
          origin: targetOrigin,
          viewerToken,
          allowLocalHttp,
          signal: controller.signal,
        })
          .then(snap => {
            if (mountedRef.current && !controller.signal.aborted) {
              applySnapshot(snap, false, true);
            }
          })
          .catch(() => {
            seededInitialHistoryRef.current = true;
          });
        return () => controller.abort();
      }
      return;
    }

    const controller = new AbortController();
    setServiceState('connecting');
    setErrorText(null);

    void (async () => {
      try {
        const probe = await probeLingtuVoiceService({
          origin: resolvedOrigin,
          viewerToken,
          allowLocalHttp,
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) return;
        const targetOrigin = probe.serviceOrigin || resolvedOrigin;
        setActiveServiceOrigin(targetOrigin);
        setServiceMode(probe.mode);
        setDefaultModel(probe.defaultModel);

        if (probe.mode === 'conversation') {
          const id = await createLingtuVoiceConversation(
            { origin: targetOrigin, viewerToken, allowLocalHttp, signal: controller.signal },
            'lingtu-default',
          );
          if (!mountedRef.current || controller.signal.aborted) return;
          setConversationId(id);
          const snap = await readLingtuVoiceConversation(
            { origin: targetOrigin, viewerToken, allowLocalHttp, signal: controller.signal },
            id,
          );
          if (!mountedRef.current || controller.signal.aborted) return;
          applySnapshot(snap, false, false);
        } else if (probe.mode === 'xiaosuan') {
          if (probe.initialStatus) applyXiaosuanStatus(probe.initialStatus);
          const snap = await readXiaosuanVoiceTranscript({
            origin: targetOrigin,
            viewerToken,
            allowLocalHttp,
            signal: controller.signal,
          }).catch(() => null);
          if (!mountedRef.current || controller.signal.aborted) return;
          if (snap) applySnapshot(snap, false, true);
          else seededInitialHistoryRef.current = true;
        } else {
          seededInitialHistoryRef.current = true;
        }
        setServiceState('ready');
      } catch (err) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setServiceState('unavailable');
        setErrorText(err instanceof LingtuVoiceChatError ? err.message : '未就绪');
      }
    })();

    return () => controller.abort();
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    appActive,
    applySnapshot,
    conversationId,
    open,
    resolvedOrigin,
    serviceMode,
    serviceState,
    viewerToken,
  ]);

  // Load persona presets when entering Xiaosuan mode or opening style drawer.
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!appActive || !targetOrigin || serviceMode !== 'xiaosuan' || serviceState !== 'ready') return;
    if (personaLoaded || (!open && !styleDrawerOpen)) return;

    const controller = new AbortController();
    void fetchXiaosuanPersona({
      origin: targetOrigin,
      viewerToken,
      allowLocalHttp,
      signal: controller.signal,
    })
      .then(snap => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setRoleOptions(snap.roles);
        setVoiceOptions(snap.voices);
        setPersonaLoaded(true);
        setXiaosuanStatus(prev => ({
          ...prev,
          role: snap.roleId,
          roleName: snap.roleName,
          voice: snap.voiceId,
          voiceName: snap.voiceName,
        }));
      })
      .catch(() => {
        /* Degrade gracefully to built-in default presets. */
      });
    return () => controller.abort();
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    appActive,
    open,
    personaLoaded,
    resolvedOrigin,
    serviceMode,
    serviceState,
    styleDrawerOpen,
    viewerToken,
  ]);

  // Load full capability manifest once on Xiaosuan ready/open (degrades cleanly on older firmware).
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!appActive || !targetOrigin || serviceMode !== 'xiaosuan' || serviceState !== 'ready') return;
    if (!open) return;
    if (capabilitiesLoadedRef.current || capabilitiesUnsupportedRef.current) return;

    const controller = new AbortController();
    const syncSeq = capabilitiesSyncSeqRef.current;
    void readXiaosuanCapabilities({
      origin: targetOrigin,
      viewerToken,
      allowLocalHttp,
      signal: controller.signal,
    })
      .then(snap => {
        if (!mountedRef.current || controller.signal.aborted) return;
        capabilitiesLoadedRef.current = true;
        if (syncSeq !== capabilitiesSyncSeqRef.current) return;
        setCapabilitiesState(snap);
        setXiaosuanStatus(prev => ({
          ...prev,
          profile: snap.profile,
          profileName: snap.profileName,
          capabilities: snap,
        }));
      })
      .catch(() => {
        if (!mountedRef.current || controller.signal.aborted) return;
        capabilitiesUnsupportedRef.current = true;
      });
    return () => controller.abort();
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    appActive,
    open,
    resolvedOrigin,
    serviceMode,
    serviceState,
    viewerToken,
  ]);

  // Refresh capabilities when opening the capability drawer tab so server-side auto-disarm is reflected immediately.
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!appActive || !targetOrigin || serviceMode !== 'xiaosuan' || serviceState !== 'ready') return;
    if (!open || !styleDrawerOpen || drawerTab !== 'capabilities') return;
    if (!capabilitiesLoadedRef.current || capabilitiesUnsupportedRef.current) return;

    const controller = new AbortController();
    const syncSeq = capabilitiesSyncSeqRef.current;
    void readXiaosuanCapabilities({
      origin: targetOrigin,
      viewerToken,
      allowLocalHttp,
      signal: controller.signal,
    })
      .then(snap => {
        if (!mountedRef.current || controller.signal.aborted || syncSeq !== capabilitiesSyncSeqRef.current) return;
        setCapabilitiesState(snap);
        setXiaosuanStatus(prev => ({
          ...prev,
          profile: snap.profile,
          profileName: snap.profileName,
          capabilities: snap,
        }));
      })
      .catch(() => {
        /* Keep last known snapshot on transient poll failure. */
      });
    return () => controller.abort();
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    appActive,
    drawerTab,
    open,
    resolvedOrigin,
    serviceMode,
    serviceState,
    styleDrawerOpen,
    viewerToken,
  ]);

  // Auto-fallback active tab, quick sub-bars, and memory room filters when capability gates change.
  useEffect(() => {
    if (!isXiaosuanMode) return;
    if (activeTab === 'memory' && !modMemory) {
      setActiveTabState('chat');
    } else if (activeTab === 'reminders' && !modInfoReminders) {
      setActiveTabState('chat');
    } else if (activeTab === 'moments' && !modVisionNav && !modCompanion) {
      setActiveTabState('chat');
    }
  }, [activeTab, isXiaosuanMode, modCompanion, modInfoReminders, modMemory, modVisionNav]);

  useEffect(() => {
    if (!isXiaosuanMode) return;
    if (quickGroup === 'scenes' && !modCompanion) {
      setQuickGroupState('default');
    } else if (quickGroup === 'combos' && (!modRobotControl || !modCompanion)) {
      setQuickGroupState('default');
    }
    if ((!modRobotControl || !modCompanion) && activeComboId) {
      setActiveComboId(null);
    }
    if (!modVisionNav && selectedPhotoId) {
      setSelectedPhotoId(null);
    }
  }, [activeComboId, isXiaosuanMode, modCompanion, modRobotControl, modVisionNav, quickGroup, selectedPhotoId]);

  useEffect(() => {
    if (!capabilitiesSupported) return;
    const allowedRead = capabilities.memoryAcl.readRooms;
    if (allowedRead.length > 0 && memoryFilter !== 'all' && !allowedRead.includes(memoryFilter)) {
      setMemoryFilterState('all');
    }
    const allowedWrite = capabilities.memoryAcl.writeRooms;
    if (allowedWrite.length === 0) {
      if (editingMemoryId) {
        setEditingMemoryId(null);
        setEditingMemoryText('');
      }
      return;
    }
    if (!allowedWrite.includes(memoryRoomDraft)) {
      setMemoryRoomDraft(allowedWrite[0]);
    }
    if (!allowedWrite.includes(editingMemoryRoom)) {
      setEditingMemoryRoom(allowedWrite[0]);
    }
  }, [
    capabilities.memoryAcl.readRooms,
    capabilities.memoryAcl.writeRooms,
    capabilitiesSupported,
    editingMemoryId,
    editingMemoryRoom,
    memoryFilter,
    memoryRoomDraft,
  ]);

  // Load ambient & conditional voiceprint members when opening the style drawer (ONLY when companion is enabled).
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!appActive || !targetOrigin || serviceMode !== 'xiaosuan' || serviceState !== 'ready') return;
    if (!styleDrawerOpen || !modCompanion) return;
    const needsInitialLoad = !drawerExtrasLoadedRef.current;
    const speakerCountDrifted = xiaosuanStatus.speakersCount !== speakers.length;
    if (!needsInitialLoad && !speakerCountDrifted) return;
    drawerExtrasLoadedRef.current = true;

    const controller = new AbortController();
    const target = { origin: targetOrigin, viewerToken, allowLocalHttp, signal: controller.signal };
    if (needsInitialLoad) {
      void getAmbient(target)
        .then(ambient => {
          if (!mountedRef.current || controller.signal.aborted) return;
          setXiaosuanStatus(prev => ({ ...prev, ambient }));
        })
        .catch(() => {
          /* Legacy firmware without /api/ambient degrades cleanly. */
        });
    }
    void listSpeakers(target)
      .then(snap => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setSpeakersAvailableOverride(snap.available);
        setSpeakers(snap.speakers);
        setXiaosuanStatus(prev => ({
          ...prev,
          speakersAvailable: snap.available,
          speakersCount: snap.speakers.length,
        }));
      })
      .catch(() => {
        /* Legacy firmware without /api/speakers keeps voiceprint UI hidden. */
      });
    return () => controller.abort();
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    appActive,
    modCompanion,
    resolvedOrigin,
    serviceMode,
    serviceState,
    speakers.length,
    styleDrawerOpen,
    viewerToken,
    xiaosuanStatus.speakersCount,
  ]);

  const activeTurn = useMemo(
    () => turns.find(t => t.state === 'running' || t.state === 'queued') ?? null,
    [turns],
  );
  const pendingApprovals = useMemo(
    () => approvals.filter(a => a.state === 'pending'),
    [approvals],
  );

  // Poll conversation snapshot while open, or lightweight /api/status while collapsed in Xiaosuan mode.
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    const isXiaosuanReady = serviceMode === 'xiaosuan' && serviceState === 'ready';
    const pollXiaosuanTranscript = open && isXiaosuanReady;
    const pollXiaosuanPresenceOnly = !open && isXiaosuanReady;
    const pollConversation =
      open
      && serviceMode === 'conversation'
      && Boolean(conversationId)
      && Boolean(activeTurn || pendingApprovals.length > 0 || sending);

    if (
      !appActive
      || !targetOrigin
      || (!pollXiaosuanTranscript && !pollXiaosuanPresenceOnly && !pollConversation)
    ) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const intervalMs = pollXiaosuanPresenceOnly ? 2_500 : pollXiaosuanTranscript ? 1_200 : 650;
    const timer = setInterval(() => {
      if (pollXiaosuanPresenceOnly) {
        void fetchXiaosuanStatus({
          origin: targetOrigin,
          viewerToken,
          allowLocalHttp,
          signal: controller.signal,
        })
          .then(status => {
            if (!cancelled && mountedRef.current) {
              applyXiaosuanStatus(status);
            }
          })
          .catch(() => {
            /* Transient drop; next tick retries cleanly. */
          });
        return;
      }

      const readTask = pollXiaosuanTranscript
        ? readXiaosuanVoiceTranscript({ origin: targetOrigin, viewerToken, allowLocalHttp, signal: controller.signal })
        : readLingtuVoiceConversation(
            { origin: targetOrigin, viewerToken, allowLocalHttp, signal: controller.signal },
            conversationId!,
          );
      void readTask
        .then(snap => {
          if (!cancelled && mountedRef.current) {
            applySnapshot(snap, !pollXiaosuanTranscript, pollXiaosuanTranscript);
          }
        })
        .catch(() => {
          /* Transient poll drop; next tick retries. */
        });
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [
    activeServiceOrigin,
    activeTurn,
    allowLocalHttp,
    appActive,
    applySnapshot,
    conversationId,
    open,
    pendingApprovals.length,
    resolvedOrigin,
    sending,
    serviceMode,
    serviceState,
    viewerToken,
  ]);

  const sendBroadcastText = useCallback(
    (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();
      if (!text || sending) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setErrorText('未连接');
        return;
      }
      stopListening(true);
      stopRobotVoiceReply();
      setErrorText(null);
      setDraft('');

      const messageId = `bcast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const baseSeq = messages.reduce((acc, m) => Math.max(acc, m.seq), 0);
      const optimisticSeq = baseSeq + 1;
      optimisticPendingRef.current = [
        ...optimisticPendingRef.current,
        { id: messageId, text, createdAt: Date.now(), baseSeq, source: 'broadcast' },
      ];
      setMessages(prev => [
        ...prev,
        {
          id: messageId,
          seq: optimisticSeq,
          role: 'user',
          text,
          turnId: `pending_${messageId}`,
          source: 'broadcast',
        },
      ]);
      setSending(true);
      void sendBroadcast({ origin: targetOrigin, viewerToken, allowLocalHttp }, text)
        .then(async res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          const snap = await readXiaosuanVoiceTranscript({
            origin: targetOrigin,
            viewerToken,
            allowLocalHttp,
          }).catch(() => null);
          if (snap && mountedRef.current) {
            applySnapshot(snap, false, true);
          }
        })
        .catch(err => {
          if (!mountedRef.current) return;
          optimisticPendingRef.current = optimisticPendingRef.current.filter(p => p.id !== messageId);
          setMessages(prev => prev.filter(m => m.id !== messageId));
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '传话失败');
        })
        .finally(() => {
          if (mountedRef.current) setSending(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      applySnapshot,
      draft,
      messages,
      resolvedOrigin,
      sending,
      showNotice,
      stopListening,
      viewerToken,
    ],
  );

  const submitMessage = useCallback(
    (overrideText?: string) => {
      if (broadcastMode && serviceMode === 'xiaosuan' && overrideText === undefined) {
        sendBroadcastText();
        return;
      }
      const text = (overrideText ?? draft).trim();
      if (!text || sending) return;
      if (!resolvedOrigin) {
        setErrorText('未连接');
        return;
      }
      stopListening(true);
      stopRobotVoiceReply();
      setErrorText(null);
      setDraft('');

      const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const baseSeq = messages.reduce((acc, m) => Math.max(acc, m.seq), 0);
      const optimisticSeq = baseSeq + 1;
      setMemorySessionCleared(false);
      optimisticPendingRef.current = [
        ...optimisticPendingRef.current,
        { id: messageId, text, createdAt: Date.now(), baseSeq, source: 'app' },
      ];
      setMessages(prev => [
        ...prev,
        {
          id: messageId,
          seq: optimisticSeq,
          role: 'user',
          text,
          turnId: `pending_${messageId}`,
          source: 'app',
        },
      ]);
      setSending(true);

      void (async () => {
        try {
          let activeConvId = conversationId;
          let mode = serviceMode;
          let targetOrigin = activeServiceOrigin ?? resolvedOrigin;
          if (serviceState !== 'ready') {
            const probe = await probeLingtuVoiceService({
              origin: resolvedOrigin,
              viewerToken,
              allowLocalHttp,
            });
            mode = probe.mode;
            targetOrigin = probe.serviceOrigin || resolvedOrigin;
            setActiveServiceOrigin(targetOrigin);
            setServiceMode(probe.mode);
            setDefaultModel(probe.defaultModel);
            if (probe.initialStatus) applyXiaosuanStatus(probe.initialStatus);
            if (probe.mode === 'conversation' && !activeConvId) {
              activeConvId = await createLingtuVoiceConversation(
                { origin: targetOrigin, viewerToken, allowLocalHttp },
                'lingtu-default',
              );
              setConversationId(activeConvId);
              seededInitialHistoryRef.current = true;
            }
            setServiceState('ready');
          }

          const result = await sendLingtuVoiceMessage(
            { origin: targetOrigin, viewerToken, allowLocalHttp },
            {
              conversationId: activeConvId,
              messageId,
              text,
              mode,
              model: defaultModel,
            },
          );
          if (!mountedRef.current) return;

          if (result.kind === 'instruction') {
            if (mode === 'xiaosuan') {
              const snap = await readXiaosuanVoiceTranscript({
                origin: targetOrigin,
                viewerToken,
                allowLocalHttp,
              }).catch(() => null);
              if (snap && snap.messages.length > 0 && mountedRef.current) {
                const hasReply = snap.messages.some(
                  m => m.role === 'assistant'
                    && ((result.turnId && m.turnId === result.turnId) || m.seq > baseSeq),
                );
                if (hasReply) {
                  optimisticPendingRef.current = optimisticPendingRef.current.filter(p => p.id !== messageId);
                  applySnapshot(snap, false, true);
                  return;
                }
              }
            }
            optimisticPendingRef.current = optimisticPendingRef.current.filter(p => p.id !== messageId);
            const replyId = result.turnId ? `xs_assistant_${result.turnId}` : `inst_${messageId}`;
            spokenIdsRef.current.add(replyId);
            setMessages(prev => [
              ...prev,
              {
                id: replyId,
                seq: optimisticSeq + 1,
                role: 'assistant',
                text: result.replyText,
                turnId: result.turnId ?? `turn_${messageId}`,
                emotion: result.emotion,
                tools: result.tools,
              },
            ]);
            if (result.emotion) {
              setXiaosuanStatus(prev => ({ ...prev, emotion: result.emotion! }));
            }
            if (!result.boardSpoke) {
              speakRobotVoiceReply(result.replyText, volumePercent, voiceReplyEnabled);
            }
          } else if (activeConvId) {
            optimisticPendingRef.current = optimisticPendingRef.current.filter(p => p.id !== messageId);
            setTurns(prev => [
              ...prev.filter(t => t.turnId !== result.turnId),
              { turnId: result.turnId, state: result.state, messageId },
            ]);
            const snap = await readLingtuVoiceConversation(
              { origin: targetOrigin, viewerToken, allowLocalHttp },
              activeConvId,
            );
            if (mountedRef.current) applySnapshot(snap, true, false);
          }
        } catch (err) {
          if (!mountedRef.current) return;
          optimisticPendingRef.current = optimisticPendingRef.current.filter(p => p.id !== messageId);
          const msg = err instanceof LingtuVoiceChatError ? err.message : '发送失败';
          setErrorText(msg);
        } finally {
          if (mountedRef.current) setSending(false);
        }
      })();
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      applySnapshot,
      applyXiaosuanStatus,
      broadcastMode,
      conversationId,
      defaultModel,
      draft,
      messages,
      resolvedOrigin,
      sendBroadcastText,
      sending,
      serviceMode,
      serviceState,
      stopListening,
      viewerToken,
      voiceReplyEnabled,
      volumePercent,
    ],
  );

  submitRef.current = overrideText => {
    if (broadcastMode && serviceMode === 'xiaosuan') {
      sendBroadcastText(overrideText);
      return;
    }
    submitMessage(overrideText);
  };

  const onToggleListening = useCallback(() => {
    if (listening) {
      stopListening(false);
      return;
    }
    if (speechMode === 'none') {
      setErrorText('不支持语音');
      return;
    }
    stopRobotVoiceReply();
    setErrorText(null);
    setListening(true);
    const session = startSpeechInputCapture({
      mode: speechMode,
      onInterim: partial => {
        if (mountedRef.current) setDraft(partial);
      },
      onFinal: finalTranscript => {
        if (!mountedRef.current) return;
        const clean = finalTranscript.trim();
        if (clean) {
          submitRef.current(clean);
        }
      },
      onError: reason => {
        if (mountedRef.current) setErrorText(reason);
      },
      onEnd: () => {
        if (mountedRef.current) {
          speechCaptureRef.current = null;
          setListening(false);
        }
      },
    });
    speechCaptureRef.current = session;
  }, [listening, speechMode, stopListening]);

  const onCancelTurn = useCallback(() => {
    stopRobotVoiceReply();
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin) return;

    if (serviceMode === 'xiaosuan') {
      setHardwareBusy(true);
      setErrorText(null);
      setActiveComboId(null);
      setXiaosuanStatus(prev => ({ ...prev, liveState: 'idle' }));
      void stopXiaosuanVoice({ origin: targetOrigin, viewerToken, allowLocalHttp })
        .then(res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
        })
        .catch(err => {
          if (mountedRef.current) {
            setErrorText(err instanceof LingtuVoiceChatError ? err.message : '停止失败');
          }
        })
        .finally(() => {
          if (mountedRef.current) setHardwareBusy(false);
        });
      return;
    }

    if (!conversationId || !activeTurn) return;
    void cancelLingtuVoiceTurn(
      { origin: targetOrigin, viewerToken, allowLocalHttp },
      conversationId,
      activeTurn.turnId,
    )
      .then(() => readLingtuVoiceConversation({ origin: targetOrigin, viewerToken, allowLocalHttp }, conversationId))
      .then(snap => {
        if (mountedRef.current) applySnapshot(snap, false, false);
      })
      .catch(() => {
        if (mountedRef.current) setErrorText('停止失败');
      });
  }, [
    activeServiceOrigin,
    activeTurn,
    allowLocalHttp,
    applySnapshot,
    conversationId,
    resolvedOrigin,
    serviceMode,
    showNotice,
    viewerToken,
  ]);

  const onWakeDog = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || hardwareBusy) return;
    setHardwareBusy(true);
    setErrorText(null);
    setXiaosuanStatus(prev => ({ ...prev, liveState: 'listening' }));
    void wakeXiaosuanVoice({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(res => {
        if (!mountedRef.current) return;
        setXiaosuanStatus(prev => ({
          ...res.status,
          liveState: res.status.liveState === 'idle' ? 'listening' : res.status.liveState,
          quietMode: res.status.quietMode ?? prev.quietMode,
          profile: res.status.capabilities ? res.status.profile : prev.profile,
          profileName: res.status.capabilities ? res.status.profileName : prev.profileName,
          capabilities: res.status.capabilities ?? prev.capabilities,
        }));
        if (res.status.capabilities) {
          setCapabilitiesState(prev => mergeCapabilitiesSnapshot(prev, res.status.capabilities!));
        }
        showNotice(res.message);
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setXiaosuanStatus(prev => ({ ...prev, liveState: 'idle' }));
        setErrorText(err instanceof LingtuVoiceChatError ? err.message : '唤醒失败');
      })
      .finally(() => {
        if (mountedRef.current) setHardwareBusy(false);
      });
  }, [activeServiceOrigin, allowLocalHttp, hardwareBusy, resolvedOrigin, showNotice, viewerToken]);

  const onToggleQuietMode = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || hardwareBusy) return;
    const prevQuiet = xiaosuanStatus.quietMode;
    const nextQuiet = !prevQuiet;
    setHardwareBusy(true);
    setErrorText(null);
    setXiaosuanStatus(prev => ({ ...prev, quietMode: nextQuiet }));
    void setXiaosuanQuietMode({ origin: targetOrigin, viewerToken, allowLocalHttp }, nextQuiet)
      .then(res => {
        if (!mountedRef.current) return;
        setXiaosuanStatus(prev => ({
          ...prev,
          quietMode: res.enabled,
          volume: res.volume !== null ? res.volume : prev.volume,
        }));
        showNotice(res.message);
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setXiaosuanStatus(prev => ({ ...prev, quietMode: prevQuiet }));
        setErrorText(err instanceof LingtuVoiceChatError ? err.message : '设置失败');
      })
      .finally(() => {
        if (mountedRef.current) setHardwareBusy(false);
      });
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    hardwareBusy,
    resolvedOrigin,
    showNotice,
    viewerToken,
    xiaosuanStatus.quietMode,
  ]);

  const onSetDogVolume = useCallback(
    (volume: number) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || hardwareBusy) return;
      const clamped = Math.max(0, Math.min(100, Math.round(volume)));
      const prevVolume = xiaosuanStatus.volume;
      setHardwareBusy(true);
      setErrorText(null);
      setXiaosuanStatus(prev => ({ ...prev, volume: clamped }));
      void setXiaosuanVolume({ origin: targetOrigin, viewerToken, allowLocalHttp }, { volume: clamped })
        .then(res => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({
            ...prev,
            volume: res.volume !== null ? res.volume : clamped,
            quietMode: typeof res.quietMode === 'boolean' ? res.quietMode : prev.quietMode,
          }));
          showNotice(res.message);
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({ ...prev, volume: prevVolume }));
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '调节失败');
        })
        .finally(() => {
          if (mountedRef.current) setHardwareBusy(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      hardwareBusy,
      resolvedOrigin,
      showNotice,
      viewerToken,
      xiaosuanStatus.volume,
    ],
  );

  const onSelectRole = useCallback(
    (roleId: string) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || personaBusy) return;
      const prevRole = xiaosuanStatus.role;
      const prevRoleName = xiaosuanStatus.roleName;
      const nextShort = roleOptions.find(r => r.id === roleId)?.shortName ?? formatXiaosuanRoleShortName(roleId);
      setPersonaBusy(true);
      setErrorText(null);
      setXiaosuanStatus(prev => ({ ...prev, role: roleId, roleName: nextShort }));
      void updateXiaosuanPersona({ origin: targetOrigin, viewerToken, allowLocalHttp }, { role: roleId })
        .then(res => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({ ...prev, role: res.roleId, roleName: res.roleName }));
          showNotice(res.message);
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({ ...prev, role: prevRole, roleName: prevRoleName }));
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '切换失败');
        })
        .finally(() => {
          if (mountedRef.current) setPersonaBusy(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      personaBusy,
      resolvedOrigin,
      roleOptions,
      showNotice,
      viewerToken,
      xiaosuanStatus.role,
      xiaosuanStatus.roleName,
    ],
  );

  const onSelectVoice = useCallback(
    (voiceId: string) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || personaBusy) return;
      const prevVoice = xiaosuanStatus.voice;
      const prevVoiceName = xiaosuanStatus.voiceName;
      const nextShort = voiceOptions.find(v => v.id === voiceId)?.shortName ?? formatXiaosuanVoiceShortName(voiceId);
      setPersonaBusy(true);
      setErrorText(null);
      setXiaosuanStatus(prev => ({ ...prev, voice: voiceId, voiceName: nextShort }));
      void updateXiaosuanPersona({ origin: targetOrigin, viewerToken, allowLocalHttp }, { voice: voiceId })
        .then(res => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({ ...prev, voice: res.voiceId, voiceName: res.voiceName }));
          showNotice(res.message);
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({ ...prev, voice: prevVoice, voiceName: prevVoiceName }));
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '切换失败');
        })
        .finally(() => {
          if (mountedRef.current) setPersonaBusy(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      personaBusy,
      resolvedOrigin,
      showNotice,
      viewerToken,
      voiceOptions,
      xiaosuanStatus.voice,
      xiaosuanStatus.voiceName,
    ],
  );

  const onDecideApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      if (!resolvedOrigin || !conversationId || approvalBusyId) return;
      setApprovalBusyId(approvalId);
      setErrorText(null);
      void decideLingtuVoiceApproval(
        { origin: resolvedOrigin, viewerToken, allowLocalHttp },
        conversationId,
        approvalId,
        approved,
      )
        .then(() => readLingtuVoiceConversation({ origin: resolvedOrigin, viewerToken, allowLocalHttp }, conversationId))
        .then(snap => {
          if (mountedRef.current) applySnapshot(snap, true, false);
        })
        .catch(err => {
          if (mountedRef.current) setErrorText(err instanceof LingtuVoiceChatError ? err.message : '确认失败');
        })
        .finally(() => {
          if (mountedRef.current) setApprovalBusyId(null);
        });
    },
    [allowLocalHttp, applySnapshot, approvalBusyId, conversationId, resolvedOrigin, viewerToken],
  );

  const onResetConversation = useCallback(() => {
    stopListening(true);
    stopRobotVoiceReply();
    setErrorText(null);
    setMessages([]);
    setTurns([]);
    setApprovals([]);
    optimisticPendingRef.current = [];
    spokenIdsRef.current.clear();
    seededInitialHistoryRef.current = true;
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin) return;
    if (serviceMode === 'xiaosuan') {
      void clearVoiceSessionMemory({ origin: targetOrigin, viewerToken, allowLocalHttp })
        .then(() => {
          if (mountedRef.current) showNotice('已清空');
        })
        .catch(() => undefined);
      return;
    }
    if (serviceMode !== 'conversation') return;
    setServiceState('connecting');
    void createLingtuVoiceConversation(
      { origin: targetOrigin, viewerToken, allowLocalHttp },
      'lingtu-default',
    )
      .then(id => {
        if (!mountedRef.current) return;
        setConversationId(id);
        setServiceState('ready');
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setServiceState('unavailable');
        setErrorText(err instanceof LingtuVoiceChatError ? err.message : '未就绪');
      });
  }, [activeServiceOrigin, allowLocalHttp, resolvedOrigin, serviceMode, showNotice, stopListening, viewerToken]);

  const setActiveTab = useCallback(
    (tab: RobotVoiceTab) => {
      let resolvedTab = tab;
      if (isXiaosuanMode) {
        if (tab === 'memory' && !modMemory) resolvedTab = 'chat';
        else if (tab === 'reminders' && !modInfoReminders) resolvedTab = 'chat';
        else if (tab === 'moments' && !modVisionNav && !modCompanion) resolvedTab = 'chat';
      }
      if (resolvedTab !== 'chat') {
        stopListening(true);
      }
      if (resolvedTab === 'memory') setMemoryError(null);
      if (resolvedTab === 'reminders') setRemindersError(null);
      if (resolvedTab === 'moments') {
        setPhotosError(null);
        setDiariesError(null);
      }
      setActiveTabState(resolvedTab);
    },
    [isXiaosuanMode, modCompanion, modInfoReminders, modMemory, modVisionNav, stopListening],
  );

  const setMemoryFilter = useCallback((next: VoiceMemoryFilter) => {
    setMemoryFilterState(next);
    if (next !== 'all') {
      setMemoryRoomDraft(next);
    }
  }, []);

  const loadMemories = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (isXiaosuanMode && !modMemory) {
        setMemoryLoading(false);
        return;
      }
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setMemoryError('未连接');
        setMemoryLoading(false);
        return;
      }
      const seq = ++memoryFetchSeqRef.current;
      if (!opts?.silent) setMemoryLoading(true);
      setMemoryError(null);
      try {
        const snap = await fetchVoiceMemories({
          origin: targetOrigin,
          viewerToken,
          allowLocalHttp,
        });
        if (!mountedRef.current || seq !== memoryFetchSeqRef.current) return;
        setMemoryItems(snap.memories);
        setMemoryRoomCounts(snap.roomCounts);
        setMemorySummary(snap.rollingSummary);
        setMemoryWorkingTurnCount(snap.workingTurnCount);
        if (snap.rollingSummary || snap.workingTurnCount > 0) {
          setMemorySessionCleared(false);
        }
      } catch (err) {
        if (!mountedRef.current || seq !== memoryFetchSeqRef.current) return;
        setMemoryError(err instanceof LingtuVoiceChatError ? err.message : '读取失败');
      } finally {
        if (mountedRef.current && seq === memoryFetchSeqRef.current) {
          setMemoryLoading(false);
        }
      }
    },
    [activeServiceOrigin, allowLocalHttp, isXiaosuanMode, modMemory, resolvedOrigin, viewerToken],
  );

  const onRefreshMemories = useCallback(() => {
    void loadMemories({ silent: false });
  }, [loadMemories]);

  useEffect(() => {
    if (!open || !appActive || activeTab !== 'memory' || (isXiaosuanMode && !modMemory)) return;
    if (!activeServiceOrigin && !resolvedOrigin) {
      setMemoryError(null);
      return;
    }
    void loadMemories({ silent: false });
  }, [activeServiceOrigin, activeTab, appActive, capabilities.profile, isXiaosuanMode, loadMemories, modMemory, open, resolvedOrigin]);

  const loadReminders = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (isXiaosuanMode && !modInfoReminders) {
        setRemindersLoading(false);
        return;
      }
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setRemindersError('未连接');
        setRemindersLoading(false);
        return;
      }
      const seq = ++remindersFetchSeqRef.current;
      if (!opts?.silent) setRemindersLoading(true);
      setRemindersError(null);
      try {
        const [list, timerSnap] = await Promise.all([
          fetchVoiceReminders({
            origin: targetOrigin,
            viewerToken,
            allowLocalHttp,
          }),
          getTimers({
            origin: targetOrigin,
            viewerToken,
            allowLocalHttp,
          }).catch(() => undefined),
        ]);
        if (!mountedRef.current || seq !== remindersFetchSeqRef.current) return;
        setReminders(list);
        const pending = list.filter(item => item.status === 'pending').length;
        setXiaosuanStatus(prev => ({ ...prev, pendingReminders: pending }));
        if (timerSnap !== undefined) {
          syncActiveTimer(timerSnap);
        }
      } catch (err) {
        if (!mountedRef.current || seq !== remindersFetchSeqRef.current) return;
        setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '读取失败');
      } finally {
        if (mountedRef.current && seq === remindersFetchSeqRef.current) {
          setRemindersLoading(false);
        }
      }
    },
    [activeServiceOrigin, allowLocalHttp, isXiaosuanMode, modInfoReminders, resolvedOrigin, syncActiveTimer, viewerToken],
  );

  const onRefreshReminders = useCallback(() => {
    void loadReminders({ silent: false });
  }, [loadReminders]);

  useEffect(() => {
    if (!open || !appActive || activeTab !== 'reminders' || (isXiaosuanMode && !modInfoReminders)) return;
    if (!activeServiceOrigin && !resolvedOrigin) {
      setRemindersError(null);
      return;
    }
    void loadReminders({ silent: false });
  }, [activeServiceOrigin, activeTab, appActive, isXiaosuanMode, loadReminders, modInfoReminders, open, resolvedOrigin]);

  const loadMoments = useCallback(
    async (opts?: { silent?: boolean }) => {
      const fetchPhotos = !isXiaosuanMode || modVisionNav;
      const fetchDiaries = !isXiaosuanMode || modCompanion;
      if (!fetchPhotos && !fetchDiaries) {
        setPhotosLoading(false);
        setDiariesLoading(false);
        return;
      }
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        if (fetchPhotos) setPhotosError('未连接');
        if (fetchDiaries) setDiariesError('未连接');
        setPhotosLoading(false);
        setDiariesLoading(false);
        return;
      }
      const seq = ++momentsFetchSeqRef.current;
      if (!opts?.silent) {
        if (fetchPhotos) setPhotosLoading(true);
        if (fetchDiaries) setDiariesLoading(true);
      }
      setPhotosError(null);
      setDiariesError(null);
      const target = { origin: targetOrigin, viewerToken, allowLocalHttp };
      const [photosResult, diariesResult] = await Promise.allSettled([
        fetchPhotos ? listPhotos(target) : Promise.resolve<readonly XiaosuanPhotoItem[] | null>(null),
        fetchDiaries ? listDiaries(target) : Promise.resolve<readonly XiaosuanDiaryItem[] | null>(null),
      ]);
      if (!mountedRef.current || seq !== momentsFetchSeqRef.current) return;

      if (fetchPhotos) {
        if (photosResult.status === 'fulfilled' && photosResult.value !== null) {
          setPhotos(photosResult.value);
          setXiaosuanStatus(prev => ({ ...prev, photosCount: photosResult.value!.length }));
        } else if (photosResult.status === 'rejected') {
          const err = photosResult.reason;
          if (!(err instanceof LingtuVoiceChatError && err.httpStatus === 404)) {
            setPhotosError(err instanceof LingtuVoiceChatError ? err.message : '读取失败');
          }
        }
      }

      if (fetchDiaries) {
        if (diariesResult.status === 'fulfilled' && diariesResult.value !== null) {
          setDiaries(diariesResult.value);
        } else if (diariesResult.status === 'rejected') {
          const err = diariesResult.reason;
          if (!(err instanceof LingtuVoiceChatError && err.httpStatus === 404)) {
            setDiariesError(err instanceof LingtuVoiceChatError ? err.message : '读取失败');
          }
        }
      }

      setPhotosLoading(false);
      setDiariesLoading(false);
    },
    [activeServiceOrigin, allowLocalHttp, isXiaosuanMode, modCompanion, modVisionNav, resolvedOrigin, viewerToken],
  );

  const onRefreshMoments = useCallback(() => {
    void loadMoments({ silent: false });
  }, [loadMoments]);

  useEffect(() => {
    if (!open || !appActive || activeTab !== 'moments') return;
    if (isXiaosuanMode && !modVisionNav && !modCompanion) return;
    if (!activeServiceOrigin && !resolvedOrigin) {
      setPhotosError(null);
      setDiariesError(null);
      return;
    }
    void loadMoments({ silent: false });
  }, [activeServiceOrigin, activeTab, appActive, isXiaosuanMode, loadMoments, modCompanion, modVisionNav, open, resolvedOrigin]);

  const onToggleMemoryPanel = useCallback(() => {
    if (isXiaosuanMode && !modMemory) return;
    setActiveTabState(prev => {
      const next: RobotVoiceTab = prev === 'memory' ? 'chat' : 'memory';
      if (next === 'memory') {
        stopListening(true);
        setMemoryError(null);
      }
      return next;
    });
  }, [isXiaosuanMode, modMemory, stopListening]);

  const onToggleMemoryPinOnAdd = useCallback(() => {
    setMemoryPinOnAdd(prev => !prev);
  }, []);

  const onStartEditMemory = useCallback((item: VoiceMemoryItem) => {
    setEditingMemoryId(item.id);
    setEditingMemoryText(item.text);
    setEditingMemoryRoom(item.room);
    setMemoryError(null);
  }, []);

  const onCancelEditMemory = useCallback(() => {
    setEditingMemoryId(null);
    setEditingMemoryText('');
  }, []);

  const onSaveEditMemory = useCallback(() => {
    if (!editingMemoryId) return;
    const cleanText = editingMemoryText.trim();
    if (!cleanText || memoryBusyId) return;
    const targetId = editingMemoryId;
    const targetRoom = editingMemoryRoom;
    setEditingMemoryId(null);
    setEditingMemoryText('');
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin) {
      setMemoryError('未连接');
      return;
    }
    const prevItems = memoryItems;
    setMemoryBusyId(targetId);
    setMemoryError(null);
    setMemoryItems(prev => prev.map(item => (
      item.id === targetId ? { ...item, text: cleanText, room: targetRoom } : item
    )));
    void updateVoiceMemory(
      { origin: targetOrigin, viewerToken, allowLocalHttp },
      { id: targetId, text: cleanText, room: targetRoom },
    )
      .then(async res => {
        if (!mountedRef.current) return;
        showNotice(res.message);
        await loadMemories({ silent: true });
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setMemoryItems(prevItems);
        setMemoryError(err instanceof LingtuVoiceChatError ? err.message : '更新失败');
      })
      .finally(() => {
        if (mountedRef.current) setMemoryBusyId(null);
      });
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    editingMemoryId,
    editingMemoryRoom,
    editingMemoryText,
    loadMemories,
    memoryBusyId,
    memoryItems,
    resolvedOrigin,
    showNotice,
    viewerToken,
  ]);

  const onAddMemory = useCallback(
    (text: string, room?: VoiceMemoryRoom, pinned?: boolean) => {
      const clean = text.trim();
      if (!clean || memoryActionBusy) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setMemoryError('未连接');
        return;
      }
      const resolvedPinned = typeof pinned === 'boolean' ? pinned : memoryPinOnAdd;
      setMemoryActionBusy(true);
      setMemoryError(null);
      void addVoiceMemory(
        { origin: targetOrigin, viewerToken, allowLocalHttp },
        { text: clean, room: room ?? memoryRoomDraft, pinned: resolvedPinned },
      )
        .then(async res => {
          if (!mountedRef.current) return;
          setMemoryDraft('');
          setMemoryPinOnAdd(false);
          showNotice(res.message);
          await loadMemories({ silent: true });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setMemoryError(err instanceof LingtuVoiceChatError ? err.message : '写入失败');
        })
        .finally(() => {
          if (mountedRef.current) setMemoryActionBusy(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      loadMemories,
      memoryActionBusy,
      memoryPinOnAdd,
      memoryRoomDraft,
      resolvedOrigin,
      showNotice,
      viewerToken,
    ],
  );

  const onEditMemory = useCallback(
    (id: string, text: string, room?: VoiceMemoryRoom) => {
      const cleanId = id.trim();
      const cleanText = text.trim();
      if (!cleanId || !cleanText || memoryBusyId) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setMemoryError('未连接');
        return;
      }
      const prevItems = memoryItems;
      setMemoryBusyId(cleanId);
      setMemoryError(null);
      setMemoryItems(prev => prev.map(item => (
        item.id === cleanId ? { ...item, text: cleanText, room: room ?? item.room } : item
      )));
      void updateVoiceMemory(
        { origin: targetOrigin, viewerToken, allowLocalHttp },
        { id: cleanId, text: cleanText, room },
      )
        .then(async res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          await loadMemories({ silent: true });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setMemoryItems(prevItems);
          setMemoryError(err instanceof LingtuVoiceChatError ? err.message : '更新失败');
        })
        .finally(() => {
          if (mountedRef.current) setMemoryBusyId(null);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      loadMemories,
      memoryBusyId,
      memoryItems,
      resolvedOrigin,
      showNotice,
      viewerToken,
    ],
  );

  const onTogglePinMemory = useCallback(
    (id: string, pinned: boolean) => {
      if (!id.trim() || memoryBusyId) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setMemoryError('未连接');
        return;
      }
      const prevItems = memoryItems;
      setMemoryBusyId(id);
      setMemoryError(null);
      setMemoryItems(prev => prev.map(item => (item.id === id ? { ...item, pinned } : item)));
      void updateVoiceMemory(
        { origin: targetOrigin, viewerToken, allowLocalHttp },
        { id, pinned },
      )
        .then(async () => {
          if (!mountedRef.current) return;
          showNotice(pinned ? '已置顶' : '已取消置顶');
          await loadMemories({ silent: true });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setMemoryItems(prevItems);
          setMemoryError(err instanceof LingtuVoiceChatError ? err.message : '更新失败');
        })
        .finally(() => {
          if (mountedRef.current) setMemoryBusyId(null);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      loadMemories,
      memoryBusyId,
      memoryItems,
      resolvedOrigin,
      showNotice,
      viewerToken,
    ],
  );

  const onDeleteMemory = useCallback(
    (id: string) => {
      if (!id.trim() || memoryBusyId) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setMemoryError('未连接');
        return;
      }
      const prevItems = memoryItems;
      const prevCounts = memoryRoomCounts;
      const removed = prevItems.find(item => item.id === id);
      setMemoryBusyId(id);
      setMemoryError(null);
      setMemoryItems(prev => prev.filter(item => item.id !== id));
      if (removed) {
        setMemoryRoomCounts(prev => ({
          ...prev,
          [removed.room]: Math.max(0, prev[removed.room] - 1),
        }));
      }
      void deleteVoiceMemory(
        { origin: targetOrigin, viewerToken, allowLocalHttp },
        id,
      )
        .then(async res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          await loadMemories({ silent: true });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setMemoryItems(prevItems);
          setMemoryRoomCounts(prevCounts);
          setMemoryError(err instanceof LingtuVoiceChatError ? err.message : '删除失败');
        })
        .finally(() => {
          if (mountedRef.current) setMemoryBusyId(null);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      loadMemories,
      memoryBusyId,
      memoryItems,
      memoryRoomCounts,
      resolvedOrigin,
      showNotice,
      viewerToken,
    ],
  );

  const onClearMemorySession = useCallback(() => {
    if (memoryActionBusy) return;
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin) {
      setMemoryError('未连接');
      return;
    }
    setMemoryActionBusy(true);
    setMemoryError(null);
    void clearVoiceSessionMemory({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(async res => {
        if (!mountedRef.current) return;
        setMemorySummary('');
        setMemoryWorkingTurnCount(0);
        setMemorySessionCleared(true);
        showNotice(res.message);
        await loadMemories({ silent: true });
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setMemoryError(err instanceof LingtuVoiceChatError ? err.message : '清空失败');
      })
      .finally(() => {
        if (mountedRef.current) setMemoryActionBusy(false);
      });
  }, [activeServiceOrigin, allowLocalHttp, loadMemories, memoryActionBusy, resolvedOrigin, showNotice, viewerToken]);

  const onAddReminder = useCallback(
    (content: string, timeExpr: string, repeat?: VoiceReminderRepeat) => {
      const cleanContent = content.trim();
      const cleanTime = timeExpr.trim();
      if (!cleanContent || !cleanTime || remindersActionBusy) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setRemindersError('未连接');
        return;
      }
      const resolvedRepeat = repeat ?? reminderRepeatDraft;
      setRemindersActionBusy(true);
      setRemindersError(null);
      void addVoiceReminder(
        { origin: targetOrigin, viewerToken, allowLocalHttp },
        { content: cleanContent, timeExpr: cleanTime, repeat: resolvedRepeat },
      )
        .then(async res => {
          if (!mountedRef.current) return;
          setReminderContentDraft('');
          setReminderRepeatDraft('');
          showNotice(res.message);
          await loadReminders({ silent: true });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '添加失败');
        })
        .finally(() => {
          if (mountedRef.current) setRemindersActionBusy(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      loadReminders,
      reminderRepeatDraft,
      remindersActionBusy,
      resolvedOrigin,
      showNotice,
      viewerToken,
    ],
  );

  const onSnoozeReminder = useCallback(
    (id: string, minutes = 10) => {
      if (!id.trim() || remindersBusyId) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setRemindersError('未连接');
        return;
      }
      setRemindersBusyId(id);
      setRemindersError(null);
      void snoozeVoiceReminder(
        { origin: targetOrigin, viewerToken, allowLocalHttp },
        { id, minutes },
      )
        .then(async res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          await loadReminders({ silent: true });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '延后失败');
        })
        .finally(() => {
          if (mountedRef.current) setRemindersBusyId(null);
        });
    },
    [activeServiceOrigin, allowLocalHttp, loadReminders, remindersBusyId, resolvedOrigin, showNotice, viewerToken],
  );

  const onDeleteReminder = useCallback(
    (id: string) => {
      if (!id.trim() || remindersBusyId) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setRemindersError('未连接');
        return;
      }
      const prevList = reminders;
      setRemindersBusyId(id);
      setRemindersError(null);
      setReminders(prev => prev.filter(item => item.id !== id));
      setXiaosuanStatus(prev => ({
        ...prev,
        pendingReminders: Math.max(0, prev.pendingReminders - 1),
      }));
      void deleteVoiceReminder({ origin: targetOrigin, viewerToken, allowLocalHttp }, id)
        .then(async res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          await loadReminders({ silent: true });
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setReminders(prevList);
          setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '删除失败');
        })
        .finally(() => {
          if (mountedRef.current) setRemindersBusyId(null);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      loadReminders,
      reminders,
      remindersBusyId,
      resolvedOrigin,
      showNotice,
      viewerToken,
    ],
  );

  // Wave 2 interactive actions (Scenes, Combos, Briefing, Ambient, Idle Life, Speakers, Timers, Photos, Diaries)
  const onToggleBroadcastMode = useCallback(() => {
    setBroadcastMode(prev => !prev);
  }, []);

  const setQuickGroup = useCallback(
    (next: VoiceQuickGroup) => {
      if (next === 'scenes' && !modCompanion) {
        setQuickGroupState('default');
        return;
      }
      if (next === 'combos' && (!modRobotControl || !modCompanion)) {
        setQuickGroupState('default');
        return;
      }
      setQuickGroupState(next);
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || serviceMode !== 'xiaosuan') return;
      const target = { origin: targetOrigin, viewerToken, allowLocalHttp };
      if (next === 'scenes' && !scenesLoadedRef.current) {
        scenesLoadedRef.current = true;
        void listScenes(target)
          .then(list => {
            if (mountedRef.current && list.length > 0) setSceneOptions(list);
          })
          .catch(() => undefined);
      } else if (next === 'combos' && !combosLoadedRef.current) {
        combosLoadedRef.current = true;
        void listCombos(target)
          .then(list => {
            if (mountedRef.current && list.length > 0) setComboOptions(list);
          })
          .catch(() => undefined);
      }
    },
    [activeServiceOrigin, allowLocalHttp, modCompanion, modRobotControl, resolvedOrigin, serviceMode, viewerToken],
  );

  const onRunScene = useCallback(
    (id: string, durationMin?: number) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || actionRailBusy) return;
      setActionRailBusy(true);
      setErrorText(null);
      void runScene({ origin: targetOrigin, viewerToken, allowLocalHttp }, id, durationMin)
        .then(async res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          setQuickGroupState('default');
          const status = await fetchXiaosuanStatus({ origin: targetOrigin, viewerToken, allowLocalHttp }).catch(() => null);
          if (status && mountedRef.current) applyXiaosuanStatus(status);
        })
        .catch(err => {
          if (mountedRef.current) {
            setErrorText(err instanceof LingtuVoiceChatError ? err.message : '切换失败');
          }
        })
        .finally(() => {
          if (mountedRef.current) setActionRailBusy(false);
        });
    },
    [actionRailBusy, activeServiceOrigin, allowLocalHttp, applyXiaosuanStatus, resolvedOrigin, showNotice, viewerToken],
  );

  const onPlayCombo = useCallback(
    (id: string) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || actionRailBusy) return;
      setActionRailBusy(true);
      setErrorText(null);
      setActiveComboId(id);
      void playCombo({ origin: targetOrigin, viewerToken, allowLocalHttp }, id)
        .then(res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setActiveComboId(null);
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '表演失败');
        })
        .finally(() => {
          if (mountedRef.current) setActionRailBusy(false);
        });
    },
    [actionRailBusy, activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, viewerToken],
  );

  const onStopCombo = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin) return;
    setActiveComboId(null);
    setErrorText(null);
    void stopCombo({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(res => {
        if (mountedRef.current) showNotice(res.message);
      })
      .catch(err => {
        if (mountedRef.current) {
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '停止失败');
        }
      });
  }, [activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, viewerToken]);

  const onRunBriefing = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || actionRailBusy) return;
    setActionRailBusy(true);
    setErrorText(null);
    void runBriefing({ origin: targetOrigin, viewerToken, allowLocalHttp }, { speak: true })
      .then(res => {
        if (mountedRef.current) showNotice(res.message);
      })
      .catch(err => {
        if (mountedRef.current) {
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '早报失败');
        }
      })
      .finally(() => {
        if (mountedRef.current) setActionRailBusy(false);
      });
  }, [actionRailBusy, activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, viewerToken]);

  const onSelectAmbient = useCallback(
    (sound: XiaosuanAmbientSoundId) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || ambientBusy) return;
      const prevAmbient = xiaosuanStatus.ambient;
      const nextDuration = sound === 'off' ? null : ambientDurationMin;
      setAmbientBusy(true);
      setErrorText(null);
      setXiaosuanStatus(prev => ({
        ...prev,
        ambient: {
          ...prev.ambient,
          active: sound !== 'off',
          sound,
          soundLabel: formatAmbientSoundLabel(sound),
          remainingSec: sound !== 'off' && nextDuration ? nextDuration * 60 : null,
        },
      }));
      void setAmbient({ origin: targetOrigin, viewerToken, allowLocalHttp }, sound, nextDuration)
        .then(res => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({ ...prev, ambient: res.ambient }));
          showNotice(res.message);
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setXiaosuanStatus(prev => ({ ...prev, ambient: prevAmbient }));
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '设置失败');
        })
        .finally(() => {
          if (mountedRef.current) setAmbientBusy(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      ambientBusy,
      ambientDurationMin,
      resolvedOrigin,
      showNotice,
      viewerToken,
      xiaosuanStatus.ambient,
    ],
  );

  const setAmbientDurationMin = useCallback(
    (min: number | null) => {
      setAmbientDurationMinState(min);
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || ambientBusy) return;
      if (xiaosuanStatus.ambient.active && xiaosuanStatus.ambient.sound !== 'off') {
        setAmbientBusy(true);
        void setAmbient({ origin: targetOrigin, viewerToken, allowLocalHttp }, xiaosuanStatus.ambient.sound, min)
          .then(res => {
            if (!mountedRef.current) return;
            setXiaosuanStatus(prev => ({ ...prev, ambient: res.ambient }));
            showNotice(min ? `定时${min}分` : '已更新');
          })
          .catch(() => undefined)
          .finally(() => {
            if (mountedRef.current) setAmbientBusy(false);
          });
      }
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      ambientBusy,
      resolvedOrigin,
      showNotice,
      viewerToken,
      xiaosuanStatus.ambient.active,
      xiaosuanStatus.ambient.sound,
    ],
  );

  const onToggleIdleLife = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || idleLifeBusy) return;
    const prevEnabled = xiaosuanStatus.idleLifeEnabled;
    const nextEnabled = !prevEnabled;
    setIdleLifeBusy(true);
    setErrorText(null);
    setXiaosuanStatus(prev => ({ ...prev, idleLifeEnabled: nextEnabled }));
    void setIdleLife({ origin: targetOrigin, viewerToken, allowLocalHttp }, nextEnabled)
      .then(res => {
        if (!mountedRef.current) return;
        setXiaosuanStatus(prev => ({ ...prev, idleLifeEnabled: res.enabled }));
        showNotice(res.message);
      })
      .catch(err => {
        if (!mountedRef.current) return;
        setXiaosuanStatus(prev => ({ ...prev, idleLifeEnabled: prevEnabled }));
        setErrorText(err instanceof LingtuVoiceChatError ? err.message : '设置失败');
      })
      .finally(() => {
        if (mountedRef.current) setIdleLifeBusy(false);
      });
  }, [
    activeServiceOrigin,
    allowLocalHttp,
    idleLifeBusy,
    resolvedOrigin,
    showNotice,
    viewerToken,
    xiaosuanStatus.idleLifeEnabled,
  ]);

  const onEnrollSpeaker = useCallback(
    (name?: string) => {
      const cleanName = (name ?? speakerNameDraft).trim();
      if (!cleanName || speakersBusy) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) {
        setErrorText('未连接');
        return;
      }
      setSpeakersBusy(true);
      setErrorText(null);
      void enrollSpeaker({ origin: targetOrigin, viewerToken, allowLocalHttp }, cleanName)
        .then(async res => {
          if (!mountedRef.current) return;
          setSpeakerNameDraft('');
          showNotice(res.message);
          const refreshed = await listSpeakers({ origin: targetOrigin, viewerToken, allowLocalHttp }).catch(() => null);
          if (refreshed && mountedRef.current) {
            setSpeakersAvailableOverride(refreshed.available);
            setSpeakers(refreshed.speakers);
            setXiaosuanStatus(prev => ({
              ...prev,
              speakersAvailable: refreshed.available,
              speakersCount: refreshed.speakers.length,
            }));
          }
        })
        .catch(err => {
          if (mountedRef.current) {
            setErrorText(err instanceof LingtuVoiceChatError ? err.message : '录入失败');
          }
        })
        .finally(() => {
          if (mountedRef.current) setSpeakersBusy(false);
        });
    },
    [activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, speakerNameDraft, speakersBusy, viewerToken],
  );

  const onDeleteSpeaker = useCallback(
    (name: string) => {
      const cleanName = name.trim();
      if (!cleanName || speakersBusy) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) return;
      const prevSpeakers = speakers;
      setSpeakersBusy(true);
      setErrorText(null);
      setSpeakers(prev => prev.filter(s => s.name !== cleanName));
      void deleteSpeaker({ origin: targetOrigin, viewerToken, allowLocalHttp }, cleanName)
        .then(res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          setXiaosuanStatus(prev => ({
            ...prev,
            speakersCount: Math.max(0, prevSpeakers.length - 1),
          }));
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setSpeakers(prevSpeakers);
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '删除失败');
        })
        .finally(() => {
          if (mountedRef.current) setSpeakersBusy(false);
        });
    },
    [activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, speakers, speakersBusy, viewerToken],
  );

  const onStartTimer = useCallback(
    (opts: { kind?: XiaosuanTimerKind; durationSec: number; label?: string; autoQuiet?: boolean }) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || timerBusy) return;
      setTimerBusy(true);
      setRemindersError(null);
      void startTimer({ origin: targetOrigin, viewerToken, allowLocalHttp }, opts)
        .then(res => {
          if (!mountedRef.current) return;
          syncActiveTimer(res.timer);
          setXiaosuanStatus(prev => ({ ...prev, activeTimer: res.timer }));
          showNotice(res.message);
        })
        .catch(err => {
          if (mountedRef.current) {
            setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '启动失败');
          }
        })
        .finally(() => {
          if (mountedRef.current) setTimerBusy(false);
        });
    },
    [activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, syncActiveTimer, timerBusy, viewerToken],
  );

  const onPauseTimer = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || timerBusy || !activeTimer) return;
    setTimerBusy(true);
    setRemindersError(null);
    void pauseTimer({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(res => {
        if (!mountedRef.current) return;
        const nextTimer = res.timer ?? {
          ...activeTimer,
          remainingSec: timerDisplaySec ?? activeTimer.remainingSec,
          state: 'paused' as const,
        };
        syncActiveTimer(nextTimer);
        setXiaosuanStatus(prev => ({ ...prev, activeTimer: nextTimer }));
        showNotice(res.message);
      })
      .catch(err => {
        if (mountedRef.current) {
          setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '暂停失败');
        }
      })
      .finally(() => {
        if (mountedRef.current) setTimerBusy(false);
      });
  }, [
    activeServiceOrigin,
    activeTimer,
    allowLocalHttp,
    resolvedOrigin,
    showNotice,
    syncActiveTimer,
    timerBusy,
    timerDisplaySec,
    viewerToken,
  ]);

  const onResumeTimer = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || timerBusy || !activeTimer) return;
    setTimerBusy(true);
    setRemindersError(null);
    void resumeTimer({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(res => {
        if (!mountedRef.current) return;
        const nextTimer = res.timer ?? {
          ...activeTimer,
          remainingSec: timerDisplaySec ?? activeTimer.remainingSec,
          state: 'running' as const,
        };
        syncActiveTimer(nextTimer);
        setXiaosuanStatus(prev => ({ ...prev, activeTimer: nextTimer }));
        showNotice(res.message);
      })
      .catch(err => {
        if (mountedRef.current) {
          setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '恢复失败');
        }
      })
      .finally(() => {
        if (mountedRef.current) setTimerBusy(false);
      });
  }, [
    activeServiceOrigin,
    activeTimer,
    allowLocalHttp,
    resolvedOrigin,
    showNotice,
    syncActiveTimer,
    timerBusy,
    timerDisplaySec,
    viewerToken,
  ]);

  const onCancelTimer = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || timerBusy) return;
    setTimerBusy(true);
    setRemindersError(null);
    void cancelTimer({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(res => {
        if (!mountedRef.current) return;
        syncActiveTimer(null);
        setXiaosuanStatus(prev => ({ ...prev, activeTimer: null }));
        showNotice(res.message);
      })
      .catch(err => {
        if (mountedRef.current) {
          setRemindersError(err instanceof LingtuVoiceChatError ? err.message : '结束失败');
        }
      })
      .finally(() => {
        if (mountedRef.current) setTimerBusy(false);
      });
  }, [activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, syncActiveTimer, timerBusy, viewerToken]);

  const onCapturePhoto = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || photoCapturing) return;
    setPhotoCapturing(true);
    setPhotosError(null);
    setErrorText(null);
    void capturePhoto({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(async res => {
        if (!mountedRef.current) return;
        showNotice(res.message);
        if (res.photo) {
          setPhotos(prev => [res.photo!, ...prev.filter(p => p.id !== res.photo!.id)]);
          setXiaosuanStatus(prev => ({ ...prev, photosCount: prev.photosCount + 1 }));
        } else if (activeTab === 'moments') {
          await loadMoments({ silent: true });
        }
      })
      .catch(err => {
        if (!mountedRef.current) return;
        const msg = err instanceof LingtuVoiceChatError ? err.message : '拍照失败';
        setPhotosError(msg);
        setErrorText(msg);
      })
      .finally(() => {
        if (mountedRef.current) setPhotoCapturing(false);
      });
  }, [activeServiceOrigin, activeTab, allowLocalHttp, loadMoments, photoCapturing, resolvedOrigin, showNotice, viewerToken]);

  const onDeletePhoto = useCallback(
    (id: string) => {
      if (!id.trim() || photoBusyId) return;
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin) return;
      const prevPhotos = photos;
      setPhotoBusyId(id);
      setPhotosError(null);
      setPhotos(prev => prev.filter(p => p.id !== id));
      if (selectedPhotoId === id) setSelectedPhotoId(null);
      void deletePhoto({ origin: targetOrigin, viewerToken, allowLocalHttp }, id)
        .then(res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          setXiaosuanStatus(prev => ({
            ...prev,
            photosCount: Math.max(0, prevPhotos.length - 1),
          }));
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setPhotos(prevPhotos);
          setPhotosError(err instanceof LingtuVoiceChatError ? err.message : '删除失败');
        })
        .finally(() => {
          if (mountedRef.current) setPhotoBusyId(null);
        });
    },
    [activeServiceOrigin, allowLocalHttp, photoBusyId, photos, resolvedOrigin, selectedPhotoId, showNotice, viewerToken],
  );

  const onGenerateDiary = useCallback(
    (force = true) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || diaryGenerating) return;
      setDiaryGenerating(true);
      setDiariesError(null);
      void generateDiary({ origin: targetOrigin, viewerToken, allowLocalHttp }, { force })
        .then(async res => {
          if (!mountedRef.current) return;
          showNotice(res.message);
          if (res.diary) {
            setDiaries(prev => [res.diary!, ...prev.filter(d => d.date !== res.diary!.date)]);
          } else {
            await loadMoments({ silent: true });
          }
        })
        .catch(err => {
          if (mountedRef.current) {
            setDiariesError(err instanceof LingtuVoiceChatError ? err.message : '生成失败');
          }
        })
        .finally(() => {
          if (mountedRef.current) setDiaryGenerating(false);
        });
    },
    [activeServiceOrigin, allowLocalHttp, diaryGenerating, loadMoments, resolvedOrigin, showNotice, viewerToken],
  );

  const onReadDiary = useCallback(
    (date?: string) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || diaryReadingDate) return;
      const marker = date ?? 'latest';
      setDiaryReadingDate(marker);
      setDiariesError(null);
      void readDiary({ origin: targetOrigin, viewerToken, allowLocalHttp }, date)
        .then(res => {
          if (mountedRef.current) showNotice(res.message);
        })
        .catch(err => {
          if (mountedRef.current) {
            setDiariesError(err instanceof LingtuVoiceChatError ? err.message : '朗读失败');
          }
        })
        .finally(() => {
          if (mountedRef.current) setDiaryReadingDate(null);
        });
    },
    [activeServiceOrigin, allowLocalHttp, diaryReadingDate, resolvedOrigin, showNotice, viewerToken],
  );

  const applyCapabilitiesMutation = useCallback(
    (next: RobotCapabilitiesSnapshot, noticeMessage: string) => {
      setCapabilitiesState(next);
      setXiaosuanStatus(prev => ({
        ...prev,
        profile: next.profile,
        profileName: next.profileName,
        capabilities: next,
        ...(next.modules.info_reminders ? {} : { activeTimer: null }),
      }));
      if (!next.modules.info_reminders) {
        syncActiveTimer(null);
      }
      if (!next.modules.companion || !next.modules.robot_control) {
        setActiveComboId(null);
      }
      if (!next.modules.vision_nav) {
        setSelectedPhotoId(null);
      }
      showNotice(noticeMessage);
    },
    [showNotice, syncActiveTimer],
  );

  const setDutyProfile = useCallback(
    (profileId: DutyProfileId) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || capabilitiesBusy) return;
      capabilitiesSyncSeqRef.current += 1;
      setCapabilitiesBusy(true);
      setErrorText(null);
      void updateXiaosuanCapabilities({ origin: targetOrigin, viewerToken, allowLocalHttp }, { profile: profileId })
        .then(res => {
          if (!mountedRef.current) return;
          applyCapabilitiesMutation(res.capabilities, res.message);
        })
        .catch(err => {
          if (mountedRef.current) {
            setErrorText(err instanceof LingtuVoiceChatError ? err.message : '切换失败');
          }
        })
        .finally(() => {
          if (mountedRef.current) setCapabilitiesBusy(false);
        });
    },
    [activeServiceOrigin, allowLocalHttp, applyCapabilitiesMutation, capabilitiesBusy, resolvedOrigin, viewerToken],
  );

  const setCapabilityEnabled = useCallback(
    (moduleId: CapabilityModuleId, enabled: boolean) => {
      const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
      if (!targetOrigin || capabilitiesBusy) return;
      const targetMod = capabilities.moduleList.find(m => m.id === moduleId);
      if (targetMod && !targetMod.available) return;
      if (moduleId === 'voice_walk' && enabled && !capabilities.modules.robot_control) return;
      const prevCaps = capabilitiesState;
      capabilitiesSyncSeqRef.current += 1;
      setCapabilitiesBusy(true);
      setErrorText(null);
      if (prevCaps) {
        const disarmingWalk = moduleId === 'robot_control' && !enabled;
        const nextModules: CapabilityModuleMap = {
          ...prevCaps.modules,
          [moduleId]: enabled,
          ...(disarmingWalk ? { voice_walk: false } : {}),
        };
        const nextModuleList = prevCaps.moduleList.map(m => {
          if (m.id === moduleId) {
            const isLock = m.safetyLock === true || m.id === 'voice_walk';
            return {
              ...m,
              enabled,
              statusLabel: isLock ? (enabled ? '已解锁' : '已锁定') : (enabled ? '已开' : '已关'),
            };
          }
          if (moduleId === 'robot_control' && m.id === 'voice_walk') {
            return {
              ...m,
              available: enabled,
              enabled: enabled ? m.enabled : false,
              statusLabel: enabled ? (m.enabled ? '已解锁' : '已锁定') : '需开控狗',
            };
          }
          return m;
        });
        const nextOverrides: Partial<Record<CapabilityModuleId, boolean>> = { ...prevCaps.overrides };
        if (moduleId === 'voice_walk') {
          if (enabled) nextOverrides.voice_walk = true;
          else delete nextOverrides.voice_walk;
        } else {
          nextOverrides[moduleId] = enabled;
          if (disarmingWalk) delete nextOverrides.voice_walk;
        }
        setCapabilitiesState({
          ...prevCaps,
          modules: nextModules,
          moduleList: nextModuleList,
          overrides: nextOverrides,
          hasOverrides: moduleId === 'voice_walk'
            ? (prevCaps.hasOverrides || Object.keys(nextOverrides).length > 0)
            : true,
        });
      }
      void updateXiaosuanCapabilities(
        { origin: targetOrigin, viewerToken, allowLocalHttp },
        { overrides: { [moduleId]: enabled } },
      )
        .then(res => {
          if (!mountedRef.current) return;
          applyCapabilitiesMutation(res.capabilities, res.message);
        })
        .catch(err => {
          if (!mountedRef.current) return;
          setCapabilitiesState(prevCaps);
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '设置失败');
        })
        .finally(() => {
          if (mountedRef.current) setCapabilitiesBusy(false);
        });
    },
    [
      activeServiceOrigin,
      allowLocalHttp,
      applyCapabilitiesMutation,
      capabilities.moduleList,
      capabilities.modules.robot_control,
      capabilitiesBusy,
      capabilitiesState,
      resolvedOrigin,
      viewerToken,
    ],
  );

  const resetCapabilities = useCallback(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin || capabilitiesBusy) return;
    capabilitiesSyncSeqRef.current += 1;
    setCapabilitiesBusy(true);
    setErrorText(null);
    void updateXiaosuanCapabilities({ origin: targetOrigin, viewerToken, allowLocalHttp }, { reset: true })
      .then(res => {
        if (!mountedRef.current) return;
        applyCapabilitiesMutation(res.capabilities, res.message);
      })
      .catch(err => {
        if (mountedRef.current) {
          setErrorText(err instanceof LingtuVoiceChatError ? err.message : '恢复失败');
        }
      })
      .finally(() => {
        if (mountedRef.current) setCapabilitiesBusy(false);
      });
  }, [activeServiceOrigin, allowLocalHttp, applyCapabilitiesMutation, capabilitiesBusy, resolvedOrigin, viewerToken]);

  const setOpen = useCallback((next: boolean) => {
    if (!next) {
      stopListening(true);
      setStyleDrawerOpen(false);
      setDrawerTabState('style');
      setQuickGroupState('default');
      setSelectedPhotoId(null);
      setBroadcastMode(false);
      setActiveTabState('chat');
    }
    setOpenState(next);
  }, [stopListening]);

  const toggleOpen = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const onToggleStyleDrawer = useCallback(() => {
    setStyleDrawerOpen(prev => !prev);
  }, []);

  const setDrawerTab = useCallback((tab: VoiceDrawerTab) => {
    setDrawerTabState(tab);
  }, []);

  const phase: RobotVoicePhase = !resolvedOrigin
    ? 'disconnected'
    : listening
      ? 'listening'
      : pendingApprovals.length > 0
        ? 'awaiting'
        : sending || Boolean(activeTurn)
          ? 'thinking'
          : isXiaosuanMode && serviceState === 'ready'
            ? xiaosuanStatus.liveState === 'listening'
              ? 'listening'
              : xiaosuanStatus.liveState === 'thinking'
                ? 'thinking'
                : xiaosuanStatus.liveState === 'speaking'
                  ? 'speaking'
                  : 'ready'
            : serviceState === 'connecting'
              ? 'connecting'
              : serviceState === 'unavailable'
                ? 'unavailable'
                : 'ready';

  const resolvedStatusLabel = (() => {
    if (isXiaosuanMode && serviceState === 'ready' && resolvedOrigin) {
      if (listening) return '聆听中';
      if (sending) return '思考中';
      return formatXiaosuanLiveStateLabel(xiaosuanStatus.liveState);
    }
    const labels: Record<RobotVoicePhase, string> = {
      disconnected: '未连接',
      connecting: '连接中',
      ready: '就绪',
      listening: '聆听中',
      thinking: '思考中',
      speaking: '播报中',
      awaiting: '待确认',
      unavailable: '未就绪',
    };
    return labels[phase];
  })();

  const emotionLabel = isXiaosuanMode && serviceState === 'ready'
    ? formatXiaosuanEmotionLabel(xiaosuanStatus.emotion)
    : null;

  const canStop = isXiaosuanMode
    ? (xiaosuanStatus.liveState === 'speaking' || xiaosuanStatus.liveState === 'thinking' || sending)
    : Boolean(activeTurn);

  const memoryHasSessionContext =
    Boolean(memorySummary.trim())
    || memoryWorkingTurnCount > 0
    || (!memorySessionCleared && messages.length > 0);

  const speakersAvailable = speakersAvailableOverride !== null
    ? speakersAvailableOverride
    : xiaosuanStatus.speakersAvailable;
  const exposedPendingRemindersCount = isXiaosuanMode && !modInfoReminders
    ? 0
    : xiaosuanStatus.pendingReminders;
  const photosCount = isXiaosuanMode && !modVisionNav
    ? 0
    : Math.max(xiaosuanStatus.photosCount, photos.length);
  const exposedActiveTimer = isXiaosuanMode && !modInfoReminders ? null : activeTimer;
  const timerRemainingSec = exposedActiveTimer
    ? (timerDisplaySec !== null ? timerDisplaySec : exposedActiveTimer.remainingSec)
    : null;
  const timerDisplayLabel = exposedActiveTimer && timerRemainingSec !== null
    ? `${exposedActiveTimer.label} ${formatTimerCountdown(timerRemainingSec)}`
    : null;

  return {
    open,
    setOpen,
    toggleOpen,
    activeTab,
    setActiveTab,
    serviceMode,
    isXiaosuanMode,
    phase,
    statusLabel: resolvedStatusLabel,
    liveState: xiaosuanStatus.liveState,
    emotion: xiaosuanStatus.emotion,
    emotionLabel,
    quietMode: xiaosuanStatus.quietMode,
    dogVolume: xiaosuanStatus.volume,
    pendingRemindersCount: exposedPendingRemindersCount,
    hardwareBusy,
    styleDrawerOpen,
    setStyleDrawerOpen,
    onToggleStyleDrawer,
    drawerTab,
    setDrawerTab,
    capabilities,
    capabilitiesSupported,
    capabilitiesBusy,
    dutyProfile: capabilities.profile,
    dutyProfileName: capabilities.profileName,
    setDutyProfile,
    setCapabilityEnabled,
    resetCapabilities,
    activeRoleId: xiaosuanStatus.role,
    activeRoleName: xiaosuanStatus.roleName,
    activeVoiceId: xiaosuanStatus.voice,
    activeVoiceName: xiaosuanStatus.voiceName,
    roleOptions,
    voiceOptions,
    personaBusy,
    noticeText,
    errorText,
    messages,
    pendingApprovals,
    draft,
    setDraft,
    listening,
    speechSupported: speechMode !== 'none',
    busy: sending || Boolean(activeTurn),
    canStop,
    activeTurnId: activeTurn?.turnId ?? null,
    approvalBusyId,
    voiceReplyEnabled,
    onToggleVoiceReply: () => {
      if (voiceReplyEnabled) stopRobotVoiceReply();
      onToggleVoiceReply();
    },
    onToggleListening,
    onSubmit: submitMessage,
    onCancelTurn,
    onWakeDog,
    onToggleQuietMode,
    onSetDogVolume,
    onSelectRole,
    onSelectVoice,
    onDecideApproval,
    onResetConversation,
    memoryPanelOpen: activeTab === 'memory',
    onToggleMemoryPanel,
    memoryFilter,
    setMemoryFilter,
    memoryQuery,
    setMemoryQuery,
    memoryDraft,
    setMemoryDraft,
    memoryRoomDraft,
    setMemoryRoomDraft,
    memoryPinOnAdd,
    onToggleMemoryPinOnAdd,
    editingMemoryId,
    editingMemoryText,
    setEditingMemoryText,
    editingMemoryRoom,
    setEditingMemoryRoom,
    onStartEditMemory,
    onCancelEditMemory,
    onSaveEditMemory,
    memoryItems,
    memoryRoomCounts,
    memorySummary,
    memoryHasSessionContext,
    memoryLoading,
    memoryBusyId,
    memoryActionBusy,
    memoryError,
    onRefreshMemories,
    onAddMemory,
    onEditMemory,
    onTogglePinMemory,
    onDeleteMemory,
    onClearMemorySession,
    reminders,
    reminderContentDraft,
    setReminderContentDraft,
    reminderTimeDraft,
    setReminderTimeDraft,
    reminderRepeatDraft,
    setReminderRepeatDraft,
    remindersLoading,
    remindersBusyId,
    remindersActionBusy,
    remindersError,
    onRefreshReminders,
    onAddReminder,
    onSnoozeReminder,
    onDeleteReminder,
    broadcastMode,
    onToggleBroadcastMode,
    onSendBroadcast: sendBroadcastText,
    quickGroup,
    setQuickGroup,
    sceneOptions,
    comboOptions,
    activeComboId,
    actionRailBusy,
    onRunScene,
    onPlayCombo,
    onStopCombo,
    onRunBriefing,
    ambient: xiaosuanStatus.ambient ?? DEFAULT_XIAOSUAN_AMBIENT,
    ambientDurationMin,
    setAmbientDurationMin,
    ambientBusy,
    onSelectAmbient,
    idleLifeEnabled: xiaosuanStatus.idleLifeEnabled,
    idleLifeBusy,
    onToggleIdleLife,
    speakersAvailable,
    speakers,
    speakersBusy,
    speakerNameDraft,
    setSpeakerNameDraft,
    onEnrollSpeaker,
    onDeleteSpeaker,
    activeTimer: exposedActiveTimer,
    timerRemainingSec,
    timerDisplayLabel,
    timerBusy,
    onStartTimer,
    onPauseTimer,
    onResumeTimer,
    onCancelTimer,
    companion: xiaosuanStatus.companion,
    photosCount,
    photos,
    photosLoading,
    photoCapturing,
    photoBusyId,
    photosError,
    selectedPhotoId,
    setSelectedPhotoId,
    onCapturePhoto,
    onDeletePhoto,
    diaries,
    diariesLoading,
    diaryGenerating,
    diaryReadingDate,
    diariesError,
    onGenerateDiary,
    onReadDiary,
    onRefreshMoments,
  };
}
