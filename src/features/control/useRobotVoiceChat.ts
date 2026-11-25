import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addVoiceMemory,
  addVoiceReminder,
  cancelLingtuVoiceTurn,
  cancelTimer,
  clearVoiceSessionMemory,
  createLingtuVoiceConversation,
  decideLingtuVoiceApproval,
  DEFAULT_LEGACY_CAPABILITIES,
  DEFAULT_XIAOSUAN_ROLES,
  DEFAULT_XIAOSUAN_STATUS,
  DEFAULT_XIAOSUAN_VOICES,
  deleteVoiceMemory,
  deleteVoiceReminder,
  detectSpeechInputMode,
  EMPTY_VOICE_MEMORY_ROOM_COUNTS,
  fetchVoiceMemories,
  fetchVoiceReminders,
  fetchXiaosuanPersona,
  fetchXiaosuanStatus,
  formatTimerCountdown,
  formatXiaosuanEmotionLabel,
  formatXiaosuanLiveStateLabel,
  formatXiaosuanRoleShortName,
  formatXiaosuanVoiceShortName,
  getTimers,
  LingtuVoiceChatError,
  pauseTimer,
  probeLingtuVoiceService,
  readLingtuVoiceConversation,
  readXiaosuanCapabilities,
  readXiaosuanVoiceTranscript,
  resolveRobotVoiceOrigin,
  resumeTimer,
  runBriefing,
  sendBroadcast,
  sendLingtuVoiceMessage,
  setXiaosuanQuietMode,
  setXiaosuanVolume,
  snoozeVoiceReminder,
  speakRobotVoiceReply,
  startSpeechInputCapture,
  startTimer,
  stopRobotVoiceReply,
  stopXiaosuanVoice,
  triggerXiaosuanEstop,
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
  type XiaosuanActiveMoveSnapshot,
  type XiaosuanEmotion,
  type XiaosuanLiveState,
  type XiaosuanPersonaOption,
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

export type RobotVoiceTab = 'chat' | 'memory' | 'reminders' | 'config';
export type VoiceDrawerTab = 'style' | 'capabilities';
export type VoicePanelPopover = 'none' | 'role' | 'more' | 'walk' | 'quick';
export type VoiceMemoryFilter = 'all' | VoiceMemoryRoom;
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
  XiaosuanActiveMoveSnapshot,
  XiaosuanEmotion,
  XiaosuanLiveState,
  XiaosuanPersonaOption,
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
  openPopover: VoicePanelPopover;
  setOpenPopover: (next: VoicePanelPopover) => void;
  togglePopover: (kind: Exclude<VoicePanelPopover, 'none'>) => void;
  activeMove: XiaosuanActiveMoveSnapshot | null;
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
  onStartHoldVoice: () => void;
  onFinishHoldVoice: (cancelled?: boolean) => void;
  onSubmit: (overrideText?: string) => void;
  onCancelTurn: () => void;
  onBrakeMove: () => void;
  onEstopVoice: () => void;
  onRetryConnect: () => void;
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
  broadcastMode: boolean;
  onToggleBroadcastMode: () => void;
  onSendBroadcast: (overrideText?: string) => void;
  actionRailBusy: boolean;
  onRunBriefing: () => void;
  activeTimer: XiaosuanTimerSnapshot | null;
  timerRemainingSec: number | null;
  timerDisplayLabel: string | null;
  timerBusy: boolean;
  onStartTimer: (opts: { kind?: XiaosuanTimerKind; durationSec: number; label?: string; autoQuiet?: boolean }) => void;
  onPauseTimer: () => void;
  onResumeTimer: () => void;
  onCancelTimer: () => void;
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
  onOpenConnection?: () => void;
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
    onOpenConnection,
  } = options;

  const [open, setOpenState] = useState(false);
  const [activeTab, setActiveTabState] = useState<RobotVoiceTab>('chat');
  const [styleDrawerOpen, setStyleDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTabState] = useState<VoiceDrawerTab>('style');
  const [openPopover, setOpenPopoverState] = useState<VoicePanelPopover>('none');
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
  const [actionRailBusy, setActionRailBusy] = useState(false);

  const [activeTimer, setActiveTimer] = useState<XiaosuanTimerSnapshot | null>(null);
  const [timerDisplaySec, setTimerDisplaySec] = useState<number | null>(null);
  const [timerBusy, setTimerBusy] = useState(false);

  const mountedRef = useRef(true);
  const speechCaptureRef = useRef<ActiveSpeechCapture | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const seededInitialHistoryRef = useRef(false);
  const optimisticPendingRef = useRef<PendingOptimisticMessage[]>([]);
  const memoryFetchSeqRef = useRef(0);
  const remindersFetchSeqRef = useRef(0);
  const capabilitiesLoadedRef = useRef(false);
  const capabilitiesUnsupportedRef = useRef(false);
  const capabilitiesSyncSeqRef = useRef(0);
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
    if (!appActive) {
      stopListening(true);
      stopRobotVoiceReply();
    }
  }, [appActive, stopListening]);

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
    setOpenPopoverState('none');
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
    capabilitiesLoadedRef.current = false;
    capabilitiesUnsupportedRef.current = false;
    capabilitiesSyncSeqRef.current += 1;
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
    setActionRailBusy(false);
    setActiveTimer(null);
    setTimerDisplaySec(null);
    setTimerBusy(false);
  }, [resolvedOrigin, stopListening]);

  const isXiaosuanMode = serviceMode === 'xiaosuan';
  const capabilitiesSupported = isXiaosuanMode && capabilitiesState !== null;
  const capabilities = capabilitiesState ?? DEFAULT_LEGACY_CAPABILITIES;
  const modMemory = !isXiaosuanMode || capabilities.modules.memory;
  const modInfoReminders = !isXiaosuanMode || capabilities.modules.info_reminders;

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

  // Refresh capabilities when opening the capability view so server-side auto-disarm is reflected immediately.
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!appActive || !targetOrigin || serviceMode !== 'xiaosuan' || serviceState !== 'ready') return;
    if (!open || (activeTab !== 'config' && (!styleDrawerOpen || drawerTab !== 'capabilities'))) return;
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
    activeTab,
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

  // Auto-fallback active tab and memory room filters when capability gates change.
  useEffect(() => {
    if (!isXiaosuanMode) return;
    if (activeTab === 'memory' && !modMemory) {
      setActiveTabState('chat');
    } else if (activeTab === 'reminders' && !modInfoReminders) {
      setActiveTabState('chat');
    }
  }, [activeTab, isXiaosuanMode, modInfoReminders, modMemory]);

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
    applyXiaosuanStatus,
    conversationId,
    open,
    pendingApprovals.length,
    resolvedOrigin,
    sending,
    serviceMode,
    serviceState,
    viewerToken,
  ]);

  // High-frequency progress polling strictly while a voice locomotion move is active or a chat command is running.
  const activeMoveLive = Boolean(xiaosuanStatus.activeMove?.active);
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!appActive || !targetOrigin || serviceMode !== 'xiaosuan' || serviceState !== 'ready') return;
    if (!activeMoveLive && !sending) return;

    let cancelled = false;
    const controller = new AbortController();
    const timer = setInterval(() => {
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
    }, 350);

    return () => {
      cancelled = true;
      clearInterval(timer);
      controller.abort();
    };
  }, [
    activeMoveLive,
    activeServiceOrigin,
    allowLocalHttp,
    appActive,
    applyXiaosuanStatus,
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

  const onStartHoldVoice = useCallback(() => {
    if (listening) return;
    if (speechMode === 'none') {
      if (isXiaosuanMode) {
        onWakeDog();
      } else {
        setErrorText('不支持语音');
      }
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
  }, [isXiaosuanMode, listening, onWakeDog, speechMode]);

  const onFinishHoldVoice = useCallback(
    (cancelled = false) => {
      if (listening) {
        stopListening(Boolean(cancelled));
      }
    },
    [listening, stopListening],
  );

  const onToggleListening = useCallback(() => {
    if (listening) {
      stopListening(false);
      return;
    }
    onStartHoldVoice();
  }, [listening, onStartHoldVoice, stopListening]);

  const onCancelTurn = useCallback(() => {
    stopRobotVoiceReply();
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin) return;

    if (serviceMode === 'xiaosuan') {
      setHardwareBusy(true);
      setErrorText(null);
      setXiaosuanStatus(prev => ({ ...prev, liveState: 'idle', activeMove: null }));
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

  const onBrakeMove = useCallback(() => {
    stopRobotVoiceReply();
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    setXiaosuanStatus(prev => ({ ...prev, liveState: 'idle', activeMove: null }));
    if (!targetOrigin) return;
    setHardwareBusy(true);
    void stopXiaosuanVoice({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(() => {
        if (mountedRef.current) showNotice('已刹停');
      })
      .catch(() => undefined)
      .finally(() => {
        if (mountedRef.current) setHardwareBusy(false);
      });
  }, [activeServiceOrigin, allowLocalHttp, resolvedOrigin, showNotice, viewerToken]);

  const onEstopVoice = useCallback(() => {
    stopListening(true);
    stopRobotVoiceReply();
    setOpenPopoverState('none');
    setXiaosuanStatus(prev => ({ ...prev, liveState: 'idle', activeMove: null }));
    setCapabilitiesState(prev => {
      if (!prev) return prev;
      const { voice_walk: _dropped, ...restOverrides } = prev.overrides;
      return {
        ...prev,
        modules: { ...prev.modules, voice_walk: false },
        moduleList: prev.moduleList.map(m => (
          m.id === 'voice_walk'
            ? { ...m, enabled: false, statusLabel: prev.modules.robot_control ? '已锁定' : '需开控狗' }
            : m
        )),
        overrides: restOverrides,
      };
    });
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    if (!targetOrigin) return;
    void triggerXiaosuanEstop({ origin: targetOrigin, viewerToken, allowLocalHttp })
      .then(res => {
        if (!mountedRef.current) return;
        if (res.capabilities) {
          setCapabilitiesState(prev => mergeCapabilitiesSnapshot(prev, res.capabilities!));
          setXiaosuanStatus(prev => ({ ...prev, capabilities: res.capabilities, activeMove: null, liveState: 'idle' }));
        }
      })
      .catch(() => {
        /* Brainstem primary E-Stop already executed; tolerate offline voice service silently. */
      });
  }, [activeServiceOrigin, allowLocalHttp, resolvedOrigin, stopListening, viewerToken]);

  const onRetryConnect = useCallback(() => {
    if (!resolvedOrigin) {
      onOpenConnection?.();
      return;
    }
    setErrorText(null);
    autoProbedOriginRef.current = null;
    setServiceState('idle');
  }, [onOpenConnection, resolvedOrigin]);

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
      }
      if (resolvedTab !== 'chat') {
        stopListening(true);
      }
      setOpenPopoverState('none');
      if (resolvedTab === 'memory') setMemoryError(null);
      if (resolvedTab === 'reminders') setRemindersError(null);
      setActiveTabState(resolvedTab);
    },
    [isXiaosuanMode, modInfoReminders, modMemory, stopListening],
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

  // Broadcast, Briefing, and Timers
  const onToggleBroadcastMode = useCallback(() => {
    setBroadcastMode(prev => !prev);
  }, []);

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
      setOpenPopoverState('none');
      setBroadcastMode(false);
      setActiveTabState('chat');
    }
    setOpenState(next);
  }, [stopListening]);

  const toggleOpen = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const setOpenPopover = useCallback((next: VoicePanelPopover) => {
    setOpenPopoverState(next);
  }, []);

  const togglePopover = useCallback((kind: Exclude<VoicePanelPopover, 'none'>) => {
    setOpenPopoverState(prev => (prev === kind ? 'none' : kind));
  }, []);

  const onToggleStyleDrawer = useCallback(() => {
    setStyleDrawerOpen(prev => {
      const next = !prev;
      if (next) setOpenPopoverState('none');
      return next;
    });
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
    ? (xiaosuanStatus.liveState === 'speaking' || xiaosuanStatus.liveState === 'thinking' || sending || Boolean(xiaosuanStatus.activeMove?.active))
    : Boolean(activeTurn);

  const memoryHasSessionContext =
    Boolean(memorySummary.trim())
    || memoryWorkingTurnCount > 0
    || (!memorySessionCleared && messages.length > 0);

  const exposedPendingRemindersCount = isXiaosuanMode && !modInfoReminders
    ? 0
    : xiaosuanStatus.pendingReminders;
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
    openPopover,
    setOpenPopover,
    togglePopover,
    activeMove: xiaosuanStatus.activeMove,
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
    onStartHoldVoice,
    onFinishHoldVoice,
    onSubmit: submitMessage,
    onCancelTurn,
    onBrakeMove,
    onEstopVoice,
    onRetryConnect,
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
    actionRailBusy,
    onRunBriefing,
    activeTimer: exposedActiveTimer,
    timerRemainingSec,
    timerDisplayLabel,
    timerBusy,
    onStartTimer,
    onPauseTimer,
    onResumeTimer,
    onCancelTimer,
  };
}
