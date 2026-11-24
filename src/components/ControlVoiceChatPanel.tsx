import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text, TextInput } from './AppText';
import type {
  RobotVoiceController,
  RobotVoiceTab,
  VoiceMemoryFilter,
  VoiceMemoryRoom,
  VoiceReminderItem,
  VoiceReminderRepeat,
  XiaosuanAmbientSoundId,
  XiaosuanPhotoItem,
} from '../features/control/useRobotVoiceChat';

const DEFAULT_QUICK_PROMPTS = ['查看状态', '观察周围', '今天天气'] as const;

const VOLUME_PRESETS: readonly Readonly<{ value: number; label: string }>[] = [
  { value: 0, label: '静音' },
  { value: 25, label: '轻声' },
  { value: 65, label: '标准' },
  { value: 90, label: '大声' },
];

const AMBIENT_DURATION_PRESETS: readonly number[] = [15, 30, 60];

const REMINDER_QUICK_CHIPS: readonly Readonly<{ label: string; expr: string }>[] = [
  { label: '+10分钟', expr: '10分钟后' },
  { label: '+30分钟', expr: '30分钟后' },
  { label: '+1小时', expr: '1小时后' },
  { label: '今晚8点', expr: '今晚8点' },
];

const REMINDER_REPEAT_OPTIONS: readonly Readonly<{ key: VoiceReminderRepeat; label: string }>[] = [
  { key: '', label: '单次' },
  { key: 'daily', label: '每天' },
  { key: 'weekdays', label: '工作日' },
  { key: 'weekly', label: '每周' },
];

const REMINDER_REPEAT_LABELS: Readonly<Record<VoiceReminderRepeat, string>> = {
  '': '',
  daily: '每天',
  weekdays: '工作日',
  weekly: '每周',
};

const MEMORY_ROOM_ORDER: readonly VoiceMemoryRoom[] = [
  'user_long_term',
  'customer_knowledge',
  'episodic_events',
  'robot_behavior',
];

const UNIFIED_MEMORY_ROOM_LABELS: Readonly<Record<VoiceMemoryRoom, string>> = {
  user_long_term: '人物画像',
  customer_knowledge: '业务知识',
  episodic_events: '过往记录',
  robot_behavior: '交互规范',
};

const LEGACY_MEMORY_ROOM_LABELS: Readonly<Record<VoiceMemoryRoom, string>> = {
  user_long_term: '长期记忆',
  customer_knowledge: '习惯偏好',
  episodic_events: '日常记录',
  robot_behavior: '性格设定',
};

const WORKSPACE_TABS: readonly Readonly<{ key: RobotVoiceTab; label: string }>[] = [
  { key: 'chat', label: '对话' },
  { key: 'memory', label: '记忆' },
  { key: 'reminders', label: '提醒' },
  { key: 'moments', label: '时光' },
];

function getNextMemoryRoom(
  current: VoiceMemoryRoom,
  rooms: readonly VoiceMemoryRoom[] = MEMORY_ROOM_ORDER,
): VoiceMemoryRoom {
  const list = rooms.length > 0 ? rooms : MEMORY_ROOM_ORDER;
  const index = list.indexOf(current);
  return list[(index + 1) % list.length];
}

function getSourceBadgeLabel(source: string | undefined): string | null {
  if (source === 'voice') return '语音';
  if (source === 'reminder') return '提醒';
  if (source === 'broadcast') return '传话';
  return null;
}

function formatPhotoTimeLabel(photo: XiaosuanPhotoItem): string {
  const raw = (photo.createdAt || '').trim();
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (raw && !hasExplicitZone) {
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    if (match) {
      return `${match[2]}-${match[3]} ${match[4]}`;
    }
  }
  const epochMs = typeof photo.ts === 'number' && Number.isFinite(photo.ts) && photo.ts > 0
    ? photo.ts * 1000
    : hasExplicitZone
      ? Date.parse(raw)
      : Number.NaN;
  if (Number.isFinite(epochMs)) {
    const dt = new Date(epochMs);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }
  return raw.slice(0, 16);
}

function formatReminderTimeLabel(item: VoiceReminderItem): string {
  const raw = (item.triggerAtLocal || '').trim();
  if (raw) {
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    if (match) {
      const now = new Date();
      const sameDay =
        Number(match[1]) === now.getFullYear()
        && Number(match[2]) === now.getMonth() + 1
        && Number(match[3]) === now.getDate();
      return sameDay ? `今天 ${match[4]}` : `${match[2]}-${match[3]} ${match[4]}`;
    }
    return raw.slice(0, 16);
  }
  return item.timeExpr.trim() || '待触发';
}

export function ControlVoiceChatPanel({
  controller,
  onClose,
  maxHeight = 250,
  surfaceTone = 'dark',
}: {
  controller: RobotVoiceController;
  onClose: () => void;
  maxHeight?: number;
  surfaceTone?: 'dark' | 'light';
}) {
  let scrollNode: ScrollView | null = null;
  const light = surfaceTone === 'light';
  const activeTab = controller.activeTab;
  const isXiaosuan = controller.isXiaosuanMode;
  const disconnected = controller.phase === 'disconnected';

  const isLivePulse =
    controller.phase === 'listening'
    || controller.phase === 'thinking'
    || controller.phase === 'speaking';

  const statusDotColor =
    controller.phase === 'listening'
      ? '#22C55E'
      : controller.phase === 'speaking'
        ? '#38BDF8'
        : controller.phase === 'thinking' || controller.phase === 'connecting'
          ? '#60A5FA'
          : controller.phase === 'awaiting'
            ? '#F59E0B'
            : controller.phase === 'ready'
              ? (controller.quietMode ? '#F59E0B' : '#22C55E')
              : '#888888';

  const statusHaloColor =
    controller.phase === 'listening'
      ? 'rgba(34, 197, 94, 0.32)'
      : controller.phase === 'speaking'
        ? 'rgba(56, 189, 248, 0.34)'
        : 'rgba(96, 165, 250, 0.32)';

  const canSend = Boolean(controller.draft.trim()) && !controller.busy && !disconnected;
  const canAddMemory =
    Boolean(controller.memoryDraft.trim())
    && !controller.memoryActionBusy
    && !disconnected;
  const canAddReminder =
    Boolean(controller.reminderContentDraft.trim())
    && Boolean(controller.reminderTimeDraft.trim())
    && !controller.remindersActionBusy
    && !disconnected;

  const caps = controller.capabilities;
  const capsSupported = isXiaosuan && controller.capabilitiesSupported;
  const modRobotControl = !isXiaosuan || caps.modules.robot_control;
  const modVoiceWalk = capsSupported && caps.modules.robot_control && caps.modules.voice_walk;
  const modMemory = !isXiaosuan || caps.modules.memory;
  const modInfoReminders = !isXiaosuan || caps.modules.info_reminders;
  const modVisionNav = !isXiaosuan || caps.modules.vision_nav;
  const modCompanion = !isXiaosuan || caps.modules.companion;

  const memoryRoomLabels = capsSupported ? UNIFIED_MEMORY_ROOM_LABELS : LEGACY_MEMORY_ROOM_LABELS;
  const allowedReadRooms: readonly VoiceMemoryRoom[] = capsSupported
    ? MEMORY_ROOM_ORDER.filter(room => caps.memoryAcl.readRooms.includes(room))
    : MEMORY_ROOM_ORDER;
  const visibleMemoryRooms: readonly VoiceMemoryRoom[] =
    allowedReadRooms.length > 0 ? allowedReadRooms : MEMORY_ROOM_ORDER;
  const writableMemoryRooms: readonly VoiceMemoryRoom[] = capsSupported
    ? MEMORY_ROOM_ORDER.filter(room => caps.memoryAcl.writeRooms.includes(room))
    : MEMORY_ROOM_ORDER;
  const canWriteAnyMemory = writableMemoryRooms.length > 0;
  const visibleMemoryFilters: readonly Readonly<{ key: VoiceMemoryFilter; label: string }>[] = [
    { key: 'all', label: '全部' },
    ...visibleMemoryRooms.map(room => ({ key: room, label: memoryRoomLabels[room] })),
  ];
  const effectiveMemoryRoomDraft = writableMemoryRooms.includes(controller.memoryRoomDraft)
    ? controller.memoryRoomDraft
    : (writableMemoryRooms[0] ?? visibleMemoryRooms[0]);
  const effectiveEditingMemoryRoom = writableMemoryRooms.includes(controller.editingMemoryRoom)
    ? controller.editingMemoryRoom
    : (writableMemoryRooms[0] ?? visibleMemoryRooms[0]);

  const totalMemoryCount = visibleMemoryRooms.reduce(
    (sum, room) => sum + controller.memoryRoomCounts[room],
    0,
  );

  const normalizedQuery = controller.memoryQuery.trim().toLowerCase();
  const filteredMemories = controller.memoryItems
    .filter(item => {
      if (!visibleMemoryRooms.includes(item.room)) return false;
      if (controller.memoryFilter !== 'all' && item.room !== controller.memoryFilter) return false;
      if (!normalizedQuery) return true;
      const roomLabel = memoryRoomLabels[item.room].toLowerCase();
      return item.text.toLowerCase().includes(normalizedQuery) || roomLabel.includes(normalizedQuery);
    })
    .slice()
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const getRoomCount = (filterKey: VoiceMemoryFilter): number => {
    if (filterKey === 'all') return totalMemoryCount;
    return controller.memoryRoomCounts[filterKey];
  };

  const visibleTabs = WORKSPACE_TABS.filter(tab => {
    if (tab.key === 'chat') return true;
    if (tab.key === 'memory') return modMemory;
    if (tab.key === 'reminders') return modInfoReminders;
    if (tab.key === 'moments') return modVisionNav || modCompanion;
    return true;
  });

  const showQuickScenes = isXiaosuan && modCompanion;
  const showQuickBriefing = isXiaosuan && modInfoReminders;
  const showQuickPhoto = isXiaosuan && modVisionNav;
  const showQuickCombos = isXiaosuan && modRobotControl && modCompanion;
  const quickPrompts: readonly string[] = isXiaosuan
    ? [
        ...(modVisionNav ? ['看看前面'] : []),
        ...(modRobotControl ? ['查看状态', '打招呼', '坐下'] : []),
        ...(modInfoReminders ? ['今天天气'] : []),
      ]
    : DEFAULT_QUICK_PROMPTS;
  const hasQuickRail =
    showQuickScenes || showQuickBriefing || showQuickPhoto || showQuickCombos || quickPrompts.length > 0;

  const listMaxHeight = Math.max(88, maxHeight - 44);
  const currentDogVolume = controller.dogVolume ?? 65;
  const showVoiceprints = modCompanion && (controller.speakersAvailable || controller.speakers.length > 0);
  const canEnrollSpeaker =
    controller.speakersAvailable
    && Boolean(controller.speakerNameDraft.trim())
    && !controller.speakersBusy
    && !disconnected;
  const selectedPhoto = modVisionNav && controller.selectedPhotoId
    ? controller.photos.find(item => item.id === controller.selectedPhotoId) ?? null
    : null;
  const ambientChips: readonly Readonly<{ id: XiaosuanAmbientSoundId; label: string }>[] = [
    ...controller.ambient.sounds,
    { id: 'off', label: '关闭' },
  ];

  return (
    <View
      style={[
        styles.card,
        light ? styles.cardLight : styles.cardDark,
      ]}
      testID="control-hud-voice-panel"
    >
      {/* Top Header: Identity + Live Presence/Emotion Pill + Real Hardware Controls */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons
            color={light ? '#1D4ED8' : '#F2F2F2'}
            name={isXiaosuan ? 'sparkles-outline' : 'chatbubble-ellipses-outline'}
            size={15}
          />
          <Text style={[styles.title, light && styles.titleLight]}>
            {isXiaosuan ? '小算' : '对话'}
          </Text>

          <View
            style={[
              styles.statusBadge,
              light && styles.statusBadgeLight,
              isLivePulse && (light ? styles.statusBadgeLiveLight : styles.statusBadgeLive),
            ]}
            testID="control-voice-presence-pill"
          >
            <View
              style={[
                styles.statusDotHalo,
                isLivePulse && { backgroundColor: statusHaloColor },
              ]}
              testID="control-voice-presence-dot"
            >
              <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
            </View>
            <Text style={[styles.statusText, light && styles.statusTextLight]} testID="control-voice-status">
              {controller.statusLabel}
            </Text>
            {controller.emotionLabel ? (
              <Text
                style={[styles.emotionTag, light && styles.emotionTagLight]}
                testID="control-voice-emotion"
              >
                {controller.emotionLabel}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.headerActions}>
          {isXiaosuan ? (
            <>
              {controller.canStop ? (
                <Pressable
                  accessibilityLabel="停止播报"
                  accessibilityRole="button"
                  disabled={controller.hardwareBusy}
                  onPress={controller.onCancelTurn}
                  style={({ pressed }) => [
                    styles.stopPillBtn,
                    controller.hardwareBusy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-stop-btn"
                >
                  <Ionicons color="#FFFFFF" name="stop" size={11} />
                  <Text style={styles.stopPillText}>停止</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel="唤醒小算"
                  accessibilityRole="button"
                  disabled={disconnected || controller.hardwareBusy}
                  onPress={controller.onWakeDog}
                  style={({ pressed }) => [
                    styles.actionPillBtn,
                    light && styles.iconBtnLight,
                    (disconnected || controller.hardwareBusy) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-wake-btn"
                >
                  <Ionicons color={light ? '#1D4ED8' : '#F2F2F2'} name="radio-outline" size={12} />
                  <Text style={[styles.actionPillText, light && styles.actionPillTextLight]}>唤醒</Text>
                </Pressable>
              )}

              <Pressable
                accessibilityLabel={controller.quietMode ? '关闭轻声模式' : '开启轻声模式'}
                accessibilityRole="switch"
                accessibilityState={{ checked: controller.quietMode, disabled: disconnected || controller.hardwareBusy }}
                disabled={disconnected || controller.hardwareBusy}
                onPress={controller.onToggleQuietMode}
                style={({ pressed }) => [
                  styles.actionPillBtn,
                  light && styles.iconBtnLight,
                  controller.quietMode && (light ? styles.quietPillActiveLight : styles.quietPillActive),
                  (disconnected || controller.hardwareBusy) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-quiet-toggle"
              >
                <Ionicons
                  color={controller.quietMode ? '#F59E0B' : (light ? '#475569' : '#C8C8C8')}
                  name={controller.quietMode ? 'moon' : 'moon-outline'}
                  size={12}
                />
                <Text
                  style={[
                    styles.actionPillText,
                    light && styles.actionPillTextLight,
                    controller.quietMode && styles.quietPillTextActive,
                  ]}
                >
                  轻声
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel={capsSupported ? '角色与能力' : '角色音色音量'}
                accessibilityRole="button"
                accessibilityState={{ expanded: controller.styleDrawerOpen }}
                disabled={disconnected}
                onPress={controller.onToggleStyleDrawer}
                style={({ pressed }) => [
                  styles.actionPillBtn,
                  light && styles.iconBtnLight,
                  controller.styleDrawerOpen && (light ? styles.iconBtnActiveLight : styles.iconBtnActive),
                  disconnected && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-style-toggle"
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.actionPillText,
                    light && styles.actionPillTextLight,
                    controller.styleDrawerOpen && (light ? styles.tabTextActiveLight : styles.tabTextActive),
                  ]}
                  testID="control-voice-role-pill-label"
                >
                  {capsSupported
                    ? controller.dutyProfileName
                    : `${controller.activeRoleName}·${controller.activeVoiceName}`}
                </Text>
                {modVoiceWalk ? (
                  <Ionicons
                    color={light ? '#D97706' : '#FBBF24'}
                    name="lock-open"
                    size={10}
                    testID="control-voice-walk-unlocked-indicator"
                  />
                ) : null}
                {capsSupported && caps.hasOverrides ? (
                  <View style={styles.overrideDot} testID="control-voice-override-dot" />
                ) : null}
                <Ionicons
                  color={controller.styleDrawerOpen ? (light ? '#1D4ED8' : '#F2F2F2') : (light ? '#64748B' : '#A0A0A0')}
                  name={controller.styleDrawerOpen ? 'chevron-up' : 'chevron-down'}
                  size={11}
                />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                accessibilityLabel={controller.voiceReplyEnabled ? '关闭播报' : '开启播报'}
                accessibilityRole="button"
                accessibilityState={{ selected: controller.voiceReplyEnabled }}
                onPress={controller.onToggleVoiceReply}
                style={({ pressed }) => [
                  styles.iconBtn,
                  light && styles.iconBtnLight,
                  controller.voiceReplyEnabled && (light ? styles.iconBtnActiveLight : styles.iconBtnActive),
                  pressed && styles.pressed,
                ]}
                testID="control-voice-tts-toggle"
              >
                <Ionicons
                  color={
                    controller.voiceReplyEnabled
                      ? (light ? '#1D4ED8' : '#F2F2F2')
                      : (light ? '#64748B' : '#A0A0A0')
                  }
                  name={controller.voiceReplyEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
                  size={15}
                />
              </Pressable>

              <Pressable
                accessibilityLabel="新对话"
                accessibilityRole="button"
                disabled={controller.busy || disconnected}
                onPress={controller.onResetConversation}
                style={({ pressed }) => [
                  styles.iconBtn,
                  light && styles.iconBtnLight,
                  (controller.busy || disconnected) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-reset"
              >
                <Ionicons color={light ? '#334155' : '#C8C8C8'} name="refresh-outline" size={15} />
              </Pressable>
            </>
          )}

          <Pressable
            accessibilityLabel="关闭"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.iconBtn, light && styles.iconBtnLight, pressed && styles.pressed]}
            testID="control-voice-close"
          >
            <Ionicons color={light ? '#334155' : '#C8C8C8'} name="close" size={16} />
          </Pressable>
        </View>
      </View>

      {/* Inline Style & Capability Drawer */}
      {controller.styleDrawerOpen && isXiaosuan ? (
        <View
          style={[styles.styleDrawer, light ? styles.styleDrawerLight : styles.styleDrawerDark]}
          testID="control-voice-style-drawer"
        >
          {capsSupported ? (
            <View
              style={[styles.drawerTabTrack, light && styles.segmentedTrackLight]}
              testID="control-voice-drawer-tabs"
            >
              <Pressable
                accessibilityLabel="样式"
                accessibilityRole="tab"
                accessibilityState={{ selected: controller.drawerTab === 'style' }}
                onPress={() => controller.setDrawerTab('style')}
                style={({ pressed }) => [
                  styles.drawerTabBtn,
                  controller.drawerTab === 'style' && (light ? styles.tabBtnActiveLight : styles.tabBtnActive),
                  pressed && styles.pressed,
                ]}
                testID="control-voice-drawer-tab-style"
              >
                <Text
                  style={[
                    styles.tabText,
                    light && styles.tabTextLight,
                    controller.drawerTab === 'style' && (light ? styles.tabTextActiveLight : styles.tabTextActive),
                  ]}
                >
                  样式
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel="能力"
                accessibilityRole="tab"
                accessibilityState={{ selected: controller.drawerTab === 'capabilities' }}
                onPress={() => controller.setDrawerTab('capabilities')}
                style={({ pressed }) => [
                  styles.drawerTabBtn,
                  controller.drawerTab === 'capabilities' && (light ? styles.tabBtnActiveLight : styles.tabBtnActive),
                  pressed && styles.pressed,
                ]}
                testID="control-voice-drawer-tab-capabilities"
              >
                <Text
                  style={[
                    styles.tabText,
                    light && styles.tabTextLight,
                    controller.drawerTab === 'capabilities' && (light ? styles.tabTextActiveLight : styles.tabTextActive),
                  ]}
                >
                  能力
                </Text>
                {caps.hasOverrides ? (
                  <View style={styles.overrideDot} testID="control-voice-drawer-cap-dot" />
                ) : null}
              </Pressable>
            </View>
          ) : null}

          {capsSupported && controller.drawerTab === 'capabilities' ? (
            <View style={styles.capList} testID="control-voice-drawer-capabilities-view">
              {caps.moduleList.map(mod => {
                if (mod.id === 'voice_walk' && !caps.modules.robot_control) return null;
                const isSafetyLock = mod.safetyLock === true || mod.id === 'voice_walk';
                const toggleLabel = isSafetyLock
                  ? (mod.enabled ? '已解锁' : '已锁定')
                  : (mod.enabled ? '已开' : '已关');
                return (
                  <View
                    key={mod.id}
                    style={[styles.capRow, isSafetyLock && styles.capSubRow]}
                    testID={`control-voice-cap-row-${mod.id}`}
                  >
                    <View style={styles.capNameWrap}>
                      {isSafetyLock ? (
                        <Ionicons
                          color={
                            mod.enabled
                              ? (light ? '#D97706' : '#FBBF24')
                              : (light ? '#64748B' : '#A0A0A0')
                          }
                          name={mod.enabled ? 'lock-open-outline' : 'lock-closed-outline'}
                          size={12}
                        />
                      ) : null}
                      <Text style={[styles.capName, light && styles.titleLight]}>{mod.name}</Text>
                    </View>
                    {mod.available ? (
                      <Pressable
                        accessibilityLabel={`${mod.name} ${toggleLabel}`}
                        accessibilityRole="switch"
                        accessibilityState={{
                          checked: mod.enabled,
                          disabled: controller.capabilitiesBusy || disconnected,
                        }}
                        disabled={controller.capabilitiesBusy || disconnected}
                        onPress={() => controller.setCapabilityEnabled(mod.id, !mod.enabled)}
                        style={({ pressed }) => [
                          styles.capSwitchBtn,
                          light && styles.filterChipLight,
                          mod.enabled && (
                            isSafetyLock
                              ? (light ? styles.capSafetyBtnActiveLight : styles.capSafetyBtnActive)
                              : (light ? styles.filterChipActiveLight : styles.filterChipActive)
                          ),
                          (controller.capabilitiesBusy || disconnected) && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                        testID={`control-voice-cap-toggle-${mod.id}`}
                      >
                        <Text
                          style={[
                            styles.styleChipText,
                            light && styles.filterChipTextLight,
                            mod.enabled && (
                              isSafetyLock
                                ? (light ? styles.capSafetyTextActiveLight : styles.capSafetyTextActive)
                                : (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive)
                            ),
                          ]}
                        >
                          {toggleLabel}
                        </Text>
                      </Pressable>
                    ) : (
                      <View
                        style={[styles.capStatusBadge, light && styles.capStatusBadgeLight]}
                        testID={`control-voice-cap-status-${mod.id}`}
                      >
                        <Text style={[styles.capStatusText, light && styles.capStatusTextLight]}>
                          {mod.statusLabel || (mod.id === 'voice_walk' ? '需开控狗' : '未接硬件')}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}

              {caps.hasOverrides ? (
                <View style={styles.capFooterRow}>
                  <Pressable
                    accessibilityLabel="恢复默认"
                    accessibilityRole="button"
                    disabled={controller.capabilitiesBusy || disconnected}
                    onPress={controller.resetCapabilities}
                    style={({ pressed }) => [
                      styles.clearSessionBtn,
                      light && styles.clearSessionBtnLight,
                      (controller.capabilitiesBusy || disconnected) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-voice-cap-reset"
                  >
                    <Text style={[styles.clearSessionText, light && styles.clearSessionTextLight]}>
                      恢复默认
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.styleDrawerSection} testID="control-voice-drawer-style-view">
              <View style={styles.styleRow}>
                <Text style={[styles.styleLabel, light && styles.styleLabelLight]}>角色</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleChipsRow}>
                  {capsSupported
                    ? caps.profiles.map(prof => {
                        const selected = controller.dutyProfile === prof.id;
                        return (
                          <Pressable
                            key={prof.id}
                            accessibilityLabel={`角色 ${prof.name}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: controller.capabilitiesBusy || disconnected }}
                            disabled={controller.capabilitiesBusy || disconnected}
                            onPress={() => controller.setDutyProfile(prof.id)}
                            style={({ pressed }) => [
                              styles.styleChip,
                              light && styles.filterChipLight,
                              selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                              pressed && styles.pressed,
                            ]}
                            testID={`control-voice-profile-${prof.id}`}
                          >
                            <Text
                              style={[
                                styles.styleChipText,
                                light && styles.filterChipTextLight,
                                selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                              ]}
                            >
                              {prof.name}
                            </Text>
                          </Pressable>
                        );
                      })
                    : controller.roleOptions.map(opt => {
                        const selected = controller.activeRoleId === opt.id;
                        return (
                          <Pressable
                            key={opt.id}
                            accessibilityLabel={`角色 ${opt.shortName}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: controller.personaBusy || disconnected }}
                            disabled={controller.personaBusy || disconnected}
                            onPress={() => controller.onSelectRole(opt.id)}
                            style={({ pressed }) => [
                              styles.styleChip,
                              light && styles.filterChipLight,
                              selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                              pressed && styles.pressed,
                            ]}
                            testID={`control-voice-role-${opt.id}`}
                          >
                            <Text
                              style={[
                                styles.styleChipText,
                                light && styles.filterChipTextLight,
                                selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                              ]}
                            >
                              {opt.shortName}
                            </Text>
                          </Pressable>
                        );
                      })}
                </ScrollView>
              </View>

              <View style={styles.styleRow}>
                <Text style={[styles.styleLabel, light && styles.styleLabelLight]}>音色</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleChipsRow}>
                  {controller.voiceOptions.map(opt => {
                    const selected = controller.activeVoiceId === opt.id;
                    return (
                      <Pressable
                        key={opt.id}
                        accessibilityLabel={`音色 ${opt.shortName}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: controller.personaBusy || disconnected }}
                        disabled={controller.personaBusy || disconnected}
                        onPress={() => controller.onSelectVoice(opt.id)}
                        style={({ pressed }) => [
                          styles.styleChip,
                          light && styles.filterChipLight,
                          selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                          pressed && styles.pressed,
                        ]}
                        testID={`control-voice-voice-${opt.id}`}
                      >
                        <Text
                          style={[
                            styles.styleChipText,
                            light && styles.filterChipTextLight,
                            selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                          ]}
                        >
                          {opt.shortName}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              <View style={styles.styleRow}>
                <Text style={[styles.styleLabel, light && styles.styleLabelLight]}>音量</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleChipsRow}>
                  {VOLUME_PRESETS.map(preset => {
                    const selected = Math.abs(currentDogVolume - preset.value) <= 8;
                    return (
                      <Pressable
                        key={preset.value}
                        accessibilityLabel={`音量 ${preset.label}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: controller.hardwareBusy || disconnected }}
                        disabled={controller.hardwareBusy || disconnected}
                        onPress={() => controller.onSetDogVolume(preset.value)}
                        style={({ pressed }) => [
                          styles.styleChip,
                          light && styles.filterChipLight,
                          selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                          pressed && styles.pressed,
                        ]}
                        testID={`control-voice-volume-${preset.value}`}
                      >
                        <Text
                          style={[
                            styles.styleChipText,
                            light && styles.filterChipTextLight,
                            selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                          ]}
                        >
                          {preset.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    accessibilityLabel="轻声模式"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: controller.quietMode, disabled: controller.hardwareBusy || disconnected }}
                    disabled={controller.hardwareBusy || disconnected}
                    onPress={controller.onToggleQuietMode}
                    style={({ pressed }) => [
                      styles.styleChip,
                      light && styles.filterChipLight,
                      controller.quietMode && (light ? styles.quietPillActiveLight : styles.quietPillActive),
                      pressed && styles.pressed,
                    ]}
                    testID="control-voice-style-quiet"
                  >
                    <Text
                      style={[
                        styles.styleChipText,
                        light && styles.filterChipTextLight,
                        controller.quietMode && styles.quietPillTextActive,
                      ]}
                    >
                      {controller.quietMode ? '轻声开' : '轻声关'}
                    </Text>
                  </Pressable>
                </ScrollView>
              </View>

              {modCompanion ? (
                <>
                  <View style={styles.styleRow} testID="control-voice-ambient-row">
                    <Text style={[styles.styleLabelWide, light && styles.styleLabelLight]}>白噪音</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleChipsRow}>
                      {ambientChips.map(opt => {
                        const selected = opt.id === 'off'
                          ? !controller.ambient.active
                          : controller.ambient.active && controller.ambient.sound === opt.id;
                        return (
                          <Pressable
                            key={opt.id}
                            accessibilityLabel={`白噪音 ${opt.label}`}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: controller.ambientBusy || disconnected }}
                            disabled={controller.ambientBusy || disconnected}
                            onPress={() => controller.onSelectAmbient(opt.id)}
                            style={({ pressed }) => [
                              styles.styleChip,
                              light && styles.filterChipLight,
                              selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                              pressed && styles.pressed,
                            ]}
                            testID={`control-voice-ambient-${opt.id}`}
                          >
                            <Text
                              style={[
                                styles.styleChipText,
                                light && styles.filterChipTextLight,
                                selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                              ]}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {AMBIENT_DURATION_PRESETS.map(mins => {
                        const selected = controller.ambientDurationMin === mins;
                        return (
                          <Pressable
                            key={mins}
                            accessibilityLabel={`定时 ${mins}分`}
                            accessibilityRole="button"
                            accessibilityState={{ selected, disabled: controller.ambientBusy || disconnected }}
                            disabled={controller.ambientBusy || disconnected}
                            onPress={() => controller.setAmbientDurationMin(mins)}
                            style={({ pressed }) => [
                              styles.styleChip,
                              light && styles.filterChipLight,
                              selected && (light ? styles.quietPillActiveLight : styles.quietPillActive),
                              pressed && styles.pressed,
                            ]}
                            testID={`control-voice-ambient-dur-${mins}`}
                          >
                            <Text
                              style={[
                                styles.styleChipText,
                                light && styles.filterChipTextLight,
                                selected && styles.quietPillTextActive,
                              ]}
                            >
                              {`${mins}分`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>

                  <View style={styles.styleRow} testID="control-voice-idle-life-row">
                    <Text style={[styles.styleLabelWide, light && styles.styleLabelLight]}>待机微动</Text>
                    <Pressable
                      accessibilityLabel="待机微动"
                      accessibilityRole="switch"
                      accessibilityState={{
                        checked: controller.idleLifeEnabled,
                        disabled: controller.idleLifeBusy || disconnected,
                      }}
                      disabled={controller.idleLifeBusy || disconnected}
                      onPress={controller.onToggleIdleLife}
                      style={({ pressed }) => [
                        styles.styleChip,
                        light && styles.filterChipLight,
                        controller.idleLifeEnabled && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                        (controller.idleLifeBusy || disconnected) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      testID="control-voice-idle-life-toggle"
                    >
                      <Text
                        style={[
                          styles.styleChipText,
                          light && styles.filterChipTextLight,
                          controller.idleLifeEnabled && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                        ]}
                      >
                        {controller.idleLifeEnabled ? '已开' : '已关'}
                      </Text>
                    </Pressable>
                  </View>

                  {showVoiceprints ? (
                    <View style={styles.speakerSection} testID="control-voice-speakers-section">
                      <View style={styles.styleRow}>
                        <Text style={[styles.styleLabelWide, light && styles.styleLabelLight]}>声纹</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.styleChipsRow}>
                          {controller.speakers.length === 0 ? (
                            <Text style={[styles.emptyMiniHint, light && styles.emptyHintLight]}>暂无成员</Text>
                          ) : (
                            controller.speakers.map(item => (
                              <View
                                key={item.name}
                                style={[styles.speakerChip, light && styles.filterChipLight]}
                                testID={`control-voice-speaker-item-${item.name}`}
                              >
                                <Text style={[styles.styleChipText, light && styles.filterChipTextLight]}>
                                  {item.name}
                                </Text>
                                <Pressable
                                  accessibilityLabel={`删除 ${item.name}`}
                                  accessibilityRole="button"
                                  disabled={controller.speakersBusy || disconnected}
                                  onPress={() => controller.onDeleteSpeaker(item.name)}
                                  style={({ pressed }) => [styles.speakerDelBtn, pressed && styles.pressed]}
                                  testID={`control-voice-speaker-delete-${item.name}`}
                                >
                                  <Ionicons color={light ? '#DC2626' : '#F87171'} name="close" size={11} />
                                </Pressable>
                              </View>
                            ))
                          )}
                        </ScrollView>
                      </View>
                      {controller.speakersAvailable ? (
                        <View style={styles.speakerEnrollRow}>
                          <TextInput
                            accessibilityLabel="声纹称呼"
                            editable={!disconnected && !controller.speakersBusy}
                            maxLength={24}
                            onChangeText={controller.setSpeakerNameDraft}
                            onSubmitEditing={() => {
                              if (canEnrollSpeaker) controller.onEnrollSpeaker();
                            }}
                            placeholder="称呼…"
                            placeholderTextColor={light ? '#94A3B8' : '#707070'}
                            returnKeyType="done"
                            style={[styles.speakerInput, light && styles.inputLight]}
                            testID="control-voice-speaker-input"
                            value={controller.speakerNameDraft}
                          />
                          <Pressable
                            accessibilityLabel="录入声纹"
                            accessibilityRole="button"
                            accessibilityState={{ disabled: !canEnrollSpeaker }}
                            disabled={!canEnrollSpeaker}
                            onPress={() => controller.onEnrollSpeaker()}
                            style={({ pressed }) => [
                              styles.speakerEnrollBtn,
                              !canEnrollSpeaker && styles.sendBtnDisabled,
                              pressed && canEnrollSpeaker && styles.pressed,
                            ]}
                            testID="control-voice-speaker-enroll"
                          >
                            <Text style={styles.speakerEnrollText}>录入</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          )}
        </View>
      ) : null}

      {/* Dynamic Workspace Segmented Bar: 对话 | 记忆 | 提醒 | 时光 */}
      {visibleTabs.length > 1 || isXiaosuan ? (
        <View
          style={[styles.tabBarRow, visibleTabs.length <= 1 && styles.tabBarRowEnd]}
          testID="control-voice-tabs"
        >
          {visibleTabs.length > 1 ? (
            <View style={[styles.segmentedTrack, light && styles.segmentedTrackLight]}>
              {visibleTabs.map(tab => {
                const selected = activeTab === tab.key;
                const badge =
                  tab.key === 'reminders' && controller.pendingRemindersCount > 0
                    ? controller.pendingRemindersCount
                    : tab.key === 'memory' && totalMemoryCount > 0
                      ? totalMemoryCount
                      : tab.key === 'moments' && modVisionNav && controller.photosCount > 0
                        ? controller.photosCount
                        : 0;
                return (
                  <Pressable
                    key={tab.key}
                    accessibilityLabel={tab.label}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => controller.setActiveTab(tab.key)}
                    style={({ pressed }) => [
                      styles.tabBtn,
                      selected && (light ? styles.tabBtnActiveLight : styles.tabBtnActive),
                      pressed && styles.pressed,
                    ]}
                    testID={`control-voice-tab-${tab.key}`}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        light && styles.tabTextLight,
                        selected && (light ? styles.tabTextActiveLight : styles.tabTextActive),
                      ]}
                    >
                      {tab.label}
                    </Text>
                    {badge > 0 ? (
                      <View
                        style={[
                          styles.tabBadge,
                          tab.key === 'reminders' && styles.tabBadgeAccent,
                        ]}
                        testID={
                          tab.key === 'reminders'
                            ? 'control-voice-reminders-badge'
                            : tab.key === 'moments'
                              ? 'control-voice-moments-count'
                              : 'control-voice-memory-count'
                        }
                      >
                        <Text style={styles.tabBadgeText}>{String(badge)}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

        {activeTab === 'memory' ? (
          <Pressable
            accessibilityLabel="刷新记忆"
            accessibilityRole="button"
            disabled={controller.memoryLoading || disconnected}
            onPress={controller.onRefreshMemories}
            style={({ pressed }) => [
              styles.iconBtn,
              light && styles.iconBtnLight,
              (controller.memoryLoading || disconnected) && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="control-voice-memory-refresh"
          >
            <Ionicons color={light ? '#334155' : '#C8C8C8'} name="refresh-outline" size={14} />
          </Pressable>
        ) : activeTab === 'reminders' ? (
          <Pressable
            accessibilityLabel="刷新提醒"
            accessibilityRole="button"
            disabled={controller.remindersLoading || disconnected}
            onPress={controller.onRefreshReminders}
            style={({ pressed }) => [
              styles.iconBtn,
              light && styles.iconBtnLight,
              (controller.remindersLoading || disconnected) && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="control-voice-reminders-refresh"
          >
            <Ionicons color={light ? '#334155' : '#C8C8C8'} name="refresh-outline" size={14} />
          </Pressable>
        ) : activeTab === 'moments' ? (
          <Pressable
            accessibilityLabel="刷新时光"
            accessibilityRole="button"
            disabled={(controller.photosLoading && controller.diariesLoading) || disconnected}
            onPress={controller.onRefreshMoments}
            style={({ pressed }) => [
              styles.iconBtn,
              light && styles.iconBtnLight,
              ((controller.photosLoading && controller.diariesLoading) || disconnected) && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="control-voice-moments-refresh"
          >
            <Ionicons color={light ? '#334155' : '#C8C8C8'} name="refresh-outline" size={14} />
          </Pressable>
        ) : isXiaosuan ? (
          <Pressable
            accessibilityLabel="清空对话"
            accessibilityRole="button"
            disabled={controller.busy || disconnected}
            onPress={controller.onResetConversation}
            style={({ pressed }) => [
              styles.iconBtn,
              light && styles.iconBtnLight,
              (controller.busy || disconnected) && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="control-voice-reset"
          >
            <Ionicons color={light ? '#334155' : '#C8C8C8'} name="trash-outline" size={14} />
          </Pressable>
        ) : null}
        </View>
      ) : null}

      {controller.noticeText ? (
        <View style={[styles.noticePill, light && styles.noticePillLight]} testID="control-voice-notice">
          <Text numberOfLines={1} style={[styles.noticeText, light && styles.noticeTextLight]}>
            {controller.noticeText}
          </Text>
        </View>
      ) : null}

      {/* TAB 2: 记忆 */}
      {activeTab === 'memory' && modMemory ? (
        <View style={styles.sectionWrap} testID="control-voice-memory-view">
          <View style={[styles.searchRow, light && styles.searchRowLight]} testID="control-voice-memory-search-row">
            <Ionicons color={light ? '#64748B' : '#A0A0A0'} name="search-outline" size={13} />
            <TextInput
              accessibilityLabel="搜索记忆"
              onChangeText={controller.setMemoryQuery}
              placeholder="搜记忆…"
              placeholderTextColor={light ? '#94A3B8' : '#707070'}
              style={[styles.searchInput, light && styles.searchInputLight]}
              testID="control-voice-memory-search"
              value={controller.memoryQuery}
            />
            {controller.memoryQuery ? (
              <Pressable
                accessibilityLabel="清除搜索"
                accessibilityRole="button"
                onPress={() => controller.setMemoryQuery('')}
                style={({ pressed }) => [styles.clearSearchBtn, pressed && styles.pressed]}
                testID="control-voice-memory-search-clear"
              >
                <Ionicons color={light ? '#64748B' : '#A0A0A0'} name="close-circle" size={14} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={styles.filterRow}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            testID="control-voice-memory-filters"
          >
            {visibleMemoryFilters.map(chip => {
              const selected = controller.memoryFilter === chip.key;
              const count = getRoomCount(chip.key);
              return (
                <Pressable
                  key={chip.key}
                  accessibilityLabel={chip.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => controller.setMemoryFilter(chip.key)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    light && styles.filterChipLight,
                    selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-memory-filter-${chip.key}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      light && styles.filterChipTextLight,
                      selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                    ]}
                  >
                    {count > 0 ? `${chip.label} ${count}` : chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            contentContainerStyle={[
              styles.listContent,
              (disconnected || filteredMemories.length === 0) && styles.messageContentEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={[styles.listScroll, { maxHeight: listMaxHeight }]}
            testID="control-voice-memory-list"
          >
            {disconnected ? (
              <View style={styles.emptyWrap}>
                <Ionicons color={light ? '#737373' : '#6B6B6B'} name="cloud-offline-outline" size={18} />
                <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>未连接</Text>
              </View>
            ) : controller.memoryLoading && filteredMemories.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>加载中…</Text>
              </View>
            ) : filteredMemories.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons color={light ? '#737373' : '#6B6B6B'} name="bookmark-outline" size={18} />
                <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>
                  {normalizedQuery ? '无匹配项' : '暂无记忆'}
                </Text>
              </View>
            ) : (
              filteredMemories.map(item => {
                const itemBusy = controller.memoryBusyId === item.id;
                const canWriteItem = writableMemoryRooms.includes(item.room);
                const isEditing = canWriteItem && controller.editingMemoryId === item.id;
                const roomTagStyle =
                  item.room === 'user_long_term'
                    ? (light ? styles.roomTagUserLight : styles.roomTagUser)
                    : item.room === 'customer_knowledge'
                      ? (light ? styles.roomTagKnowledgeLight : styles.roomTagKnowledge)
                      : item.room === 'episodic_events'
                        ? (light ? styles.roomTagEpisodicLight : styles.roomTagEpisodic)
                        : (light ? styles.roomTagBehaviorLight : styles.roomTagBehavior);
                const roomTagTextStyle =
                  item.room === 'user_long_term'
                    ? (light ? styles.roomTagTextUserLight : styles.roomTagTextUser)
                    : item.room === 'customer_knowledge'
                      ? (light ? styles.roomTagTextKnowledgeLight : styles.roomTagTextKnowledge)
                      : item.room === 'episodic_events'
                        ? (light ? styles.roomTagTextEpisodicLight : styles.roomTagTextEpisodic)
                        : (light ? styles.roomTagTextBehaviorLight : styles.roomTagTextBehavior);

                if (isEditing) {
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.memoryCardEdit,
                        light ? styles.memoryCardLight : styles.memoryCardDark,
                      ]}
                      testID={`control-voice-memory-editing-${item.id}`}
                    >
                      <View style={styles.editTopRow}>
                        <Pressable
                          accessibilityLabel={`分类 ${memoryRoomLabels[effectiveEditingMemoryRoom]}`}
                          accessibilityRole="button"
                          onPress={() => controller.setEditingMemoryRoom(getNextMemoryRoom(effectiveEditingMemoryRoom, writableMemoryRooms))}
                          style={({ pressed }) => [
                            styles.roomSelectMini,
                            light && styles.roomSelectBtnLight,
                            pressed && styles.pressed,
                          ]}
                          testID="control-voice-memory-edit-room"
                        >
                          <Text style={[styles.roomSelectText, light && styles.roomSelectTextLight]}>
                            {memoryRoomLabels[effectiveEditingMemoryRoom]}
                          </Text>
                        </Pressable>
                        <TextInput
                          accessibilityLabel="编辑记忆内容"
                          maxLength={400}
                          onChangeText={controller.setEditingMemoryText}
                          onSubmitEditing={controller.onSaveEditMemory}
                          style={[styles.editInput, light && styles.inputLight]}
                          testID="control-voice-memory-edit-input"
                          value={controller.editingMemoryText}
                        />
                      </View>
                      <View style={styles.editBtnRow}>
                        <Pressable
                          accessibilityLabel="取消编辑"
                          accessibilityRole="button"
                          onPress={controller.onCancelEditMemory}
                          style={({ pressed }) => [styles.rejectBtn, pressed && styles.pressed]}
                          testID="control-voice-memory-edit-cancel"
                        >
                          <Text style={styles.rejectBtnText}>取消</Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel="保存记忆"
                          accessibilityRole="button"
                          disabled={!controller.editingMemoryText.trim()}
                          onPress={controller.onSaveEditMemory}
                          style={({ pressed }) => [
                            styles.approveBtn,
                            !controller.editingMemoryText.trim() && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                          testID="control-voice-memory-edit-save"
                        >
                          <Text style={styles.approveBtnText}>保存</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.memoryCard,
                      light ? styles.memoryCardLight : styles.memoryCardDark,
                    ]}
                    testID={`control-voice-memory-item-${item.id}`}
                  >
                    <View style={styles.memoryCardBody}>
                      <View style={[styles.roomTag, roomTagStyle]}>
                        <Text style={[styles.roomTagText, roomTagTextStyle]}>
                          {memoryRoomLabels[item.room]}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.memoryCardText,
                          light ? styles.bubbleTextLight : styles.bubbleTextDark,
                        ]}
                      >
                        {item.text}
                      </Text>
                    </View>
                    {canWriteItem ? (
                      <View style={styles.memoryCardActions}>
                        <Pressable
                          accessibilityLabel={item.pinned ? '取消置顶' : '置顶'}
                          accessibilityRole="button"
                          accessibilityState={{ selected: item.pinned, disabled: itemBusy }}
                          disabled={itemBusy}
                          onPress={() => controller.onTogglePinMemory(item.id, !item.pinned)}
                          style={({ pressed }) => [
                            styles.cardActionBtn,
                            itemBusy && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                          testID={`control-voice-memory-pin-${item.id}`}
                        >
                          <Ionicons
                            color={item.pinned ? '#F59E0B' : (light ? '#94A3B8' : '#707070')}
                            name={item.pinned ? 'star' : 'star-outline'}
                            size={14}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="编辑"
                          accessibilityRole="button"
                          accessibilityState={{ disabled: itemBusy }}
                          disabled={itemBusy}
                          onPress={() => controller.onStartEditMemory(item)}
                          style={({ pressed }) => [
                            styles.cardActionBtn,
                            itemBusy && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                          testID={`control-voice-memory-edit-${item.id}`}
                        >
                          <Ionicons
                            color={light ? '#475569' : '#A0A0A0'}
                            name="create-outline"
                            size={14}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="删除"
                          accessibilityRole="button"
                          accessibilityState={{ disabled: itemBusy }}
                          disabled={itemBusy}
                          onPress={() => controller.onDeleteMemory(item.id)}
                          style={({ pressed }) => [
                            styles.cardActionBtn,
                            itemBusy && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                          testID={`control-voice-memory-delete-${item.id}`}
                        >
                          <Ionicons
                            color={light ? '#DC2626' : '#F87171'}
                            name="trash-outline"
                            size={14}
                          />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>

          {controller.memoryError ? (
            <Text numberOfLines={1} style={styles.errorText} testID="control-voice-memory-error">
              {controller.memoryError}
            </Text>
          ) : null}

          {canWriteAnyMemory ? (
            <View style={styles.composerRow} testID="control-voice-memory-add-bar">
              <Pressable
                accessibilityLabel={`分类 ${memoryRoomLabels[effectiveMemoryRoomDraft]}`}
                accessibilityRole="button"
                disabled={controller.memoryActionBusy || disconnected}
                onPress={() => controller.setMemoryRoomDraft(getNextMemoryRoom(effectiveMemoryRoomDraft, writableMemoryRooms))}
                style={({ pressed }) => [
                  styles.roomSelectBtn,
                  light && styles.roomSelectBtnLight,
                  (controller.memoryActionBusy || disconnected) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-memory-room-select"
              >
                <Text style={[styles.roomSelectText, light && styles.roomSelectTextLight]}>
                  {memoryRoomLabels[effectiveMemoryRoomDraft]}
                </Text>
                <Ionicons color={light ? '#475569' : '#A0A0A0'} name="chevron-down" size={11} />
              </Pressable>

              <Pressable
                accessibilityLabel={controller.memoryPinOnAdd ? '取消默认置顶' : '添加并置顶'}
                accessibilityRole="switch"
                accessibilityState={{ checked: controller.memoryPinOnAdd, disabled: controller.memoryActionBusy || disconnected }}
                disabled={controller.memoryActionBusy || disconnected}
                onPress={controller.onToggleMemoryPinOnAdd}
                style={({ pressed }) => [
                  styles.pinAddBtn,
                  light && styles.roomSelectBtnLight,
                  controller.memoryPinOnAdd && styles.pinAddBtnActive,
                  (controller.memoryActionBusy || disconnected) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-memory-add-pin"
              >
                <Ionicons
                  color={controller.memoryPinOnAdd ? '#F59E0B' : (light ? '#64748B' : '#A0A0A0')}
                  name={controller.memoryPinOnAdd ? 'star' : 'star-outline'}
                  size={14}
                />
              </Pressable>

              <TextInput
                accessibilityLabel="添加记忆"
                editable={!disconnected && !controller.memoryActionBusy}
                maxLength={400}
                onChangeText={controller.setMemoryDraft}
                onSubmitEditing={() => {
                  if (canAddMemory) {
                    controller.onAddMemory(controller.memoryDraft, effectiveMemoryRoomDraft, controller.memoryPinOnAdd);
                  }
                }}
                placeholder="添加记忆…"
                placeholderTextColor={light ? '#94A3B8' : '#707070'}
                returnKeyType="done"
                style={[styles.input, light && styles.inputLight]}
                testID="control-voice-memory-input"
                value={controller.memoryDraft}
              />

              <Pressable
                accessibilityLabel="记住"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddMemory }}
                disabled={!canAddMemory}
                onPress={() => controller.onAddMemory(controller.memoryDraft, effectiveMemoryRoomDraft, controller.memoryPinOnAdd)}
                style={({ pressed }) => [
                  styles.rememberBtn,
                  !canAddMemory && styles.sendBtnDisabled,
                  pressed && canAddMemory && styles.pressed,
                ]}
                testID="control-voice-memory-add"
              >
                <Text style={styles.rememberBtnText}>记住</Text>
              </Pressable>
            </View>
          ) : null}

          {controller.memoryHasSessionContext ? (
            <View
              style={[
                styles.memoryFooter,
                !controller.memorySummary && styles.memoryFooterEnd,
                light && styles.memoryFooterLight,
              ]}
            >
              {controller.memorySummary ? (
                <Text
                  numberOfLines={1}
                  style={[styles.summaryText, light && styles.summaryTextLight]}
                  testID="control-voice-memory-summary"
                >
                  {controller.memorySummary}
                </Text>
              ) : null}
              <Pressable
                accessibilityLabel="清空对话"
                accessibilityRole="button"
                disabled={controller.memoryActionBusy || disconnected}
                onPress={controller.onClearMemorySession}
                style={({ pressed }) => [
                  styles.clearSessionBtn,
                  light && styles.clearSessionBtnLight,
                  (controller.memoryActionBusy || disconnected) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-memory-clear-session"
              >
                <Text style={[styles.clearSessionText, light && styles.clearSessionTextLight]}>
                  清空对话
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : activeTab === 'reminders' && modInfoReminders ? (
        /* TAB 3: 提醒 */
        <View style={styles.sectionWrap} testID="control-voice-reminders-view">
          {isXiaosuan ? (
            <View
              style={[styles.timerBar, light ? styles.memoryCardLight : styles.memoryCardDark]}
              testID="control-voice-timer-bar"
            >
              {controller.activeTimer && controller.timerDisplayLabel ? (
                <>
                  <View style={styles.timerReadoutWrap}>
                    <Ionicons
                      color={controller.activeTimer.state === 'running' ? '#38BDF8' : '#F59E0B'}
                      name="timer-outline"
                      size={14}
                    />
                    <Text
                      style={[styles.timerReadoutText, light && styles.titleLight]}
                      testID="control-voice-timer-readout"
                    >
                      {controller.timerDisplayLabel}
                    </Text>
                  </View>
                  <View style={styles.timerActions}>
                    {controller.activeTimer.state === 'running' ? (
                      <Pressable
                        accessibilityLabel="暂停计时"
                        accessibilityRole="button"
                        disabled={controller.timerBusy || disconnected}
                        onPress={controller.onPauseTimer}
                        style={({ pressed }) => [
                          styles.reminderActionPill,
                          light && styles.clearSessionBtnLight,
                          (controller.timerBusy || disconnected) && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                        testID="control-voice-timer-pause"
                      >
                        <Text style={[styles.reminderActionText, light && styles.clearSessionTextLight]}>暂停</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityLabel="继续计时"
                        accessibilityRole="button"
                        disabled={controller.timerBusy || disconnected}
                        onPress={controller.onResumeTimer}
                        style={({ pressed }) => [
                          styles.timerPrimaryPill,
                          (controller.timerBusy || disconnected) && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                        testID="control-voice-timer-resume"
                      >
                        <Text style={styles.timerPrimaryText}>继续</Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityLabel="结束计时"
                      accessibilityRole="button"
                      disabled={controller.timerBusy || disconnected}
                      onPress={controller.onCancelTimer}
                      style={({ pressed }) => [
                        styles.reminderActionPill,
                        light && styles.clearSessionBtnLight,
                        (controller.timerBusy || disconnected) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      testID="control-voice-timer-cancel"
                    >
                      <Text style={[styles.reminderActionText, light && styles.clearSessionTextLight]}>结束</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.timerReadoutWrap}>
                    <Ionicons color={light ? '#2563EB' : '#D4D4D4'} name="timer-outline" size={14} />
                    <Text style={[styles.timerTitle, light && styles.titleLight]}>番茄钟</Text>
                  </View>
                  <View style={styles.timerActions}>
                    <Pressable
                      accessibilityLabel="25分钟专注"
                      accessibilityRole="button"
                      disabled={controller.timerBusy || disconnected}
                      onPress={() => controller.onStartTimer({ kind: 'pomodoro', durationSec: 1500, label: '专注', autoQuiet: true })}
                      style={({ pressed }) => [
                        styles.timerPrimaryPill,
                        (controller.timerBusy || disconnected) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      testID="control-voice-timer-start-pomodoro"
                    >
                      <Text style={styles.timerPrimaryText}>25分钟专注</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="5分钟倒计时"
                      accessibilityRole="button"
                      disabled={controller.timerBusy || disconnected}
                      onPress={() => controller.onStartTimer({ kind: 'countdown', durationSec: 300, label: '倒计时' })}
                      style={({ pressed }) => [
                        styles.reminderActionPill,
                        light && styles.clearSessionBtnLight,
                        (controller.timerBusy || disconnected) && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      testID="control-voice-timer-start-5m"
                    >
                      <Text style={[styles.reminderActionText, light && styles.clearSessionTextLight]}>5分钟</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.filterRow}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            testID="control-voice-reminder-chips"
          >
            {REMINDER_QUICK_CHIPS.map(chip => {
              const selected = controller.reminderTimeDraft.trim() === chip.expr;
              return (
                <Pressable
                  key={chip.expr}
                  accessibilityLabel={chip.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => controller.setReminderTimeDraft(chip.expr)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    light && styles.filterChipLight,
                    selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-reminder-chip-${chip.expr}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      light && styles.filterChipTextLight,
                      selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                    ]}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            contentContainerStyle={styles.filterRow}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            testID="control-voice-reminder-repeat-row"
          >
            {REMINDER_REPEAT_OPTIONS.map(opt => {
              const selected = controller.reminderRepeatDraft === opt.key;
              return (
                <Pressable
                  key={opt.key || 'once'}
                  accessibilityLabel={opt.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => controller.setReminderRepeatDraft(opt.key)}
                  style={({ pressed }) => [
                    styles.filterChip,
                    light && styles.filterChipLight,
                    selected && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-reminder-repeat-${opt.key || 'once'}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      light && styles.filterChipTextLight,
                      selected && (light ? styles.filterChipTextActiveLight : styles.filterChipTextActive),
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            contentContainerStyle={[
              styles.listContent,
              (disconnected || controller.reminders.length === 0) && styles.messageContentEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={[styles.listScroll, { maxHeight: listMaxHeight }]}
            testID="control-voice-reminders-list"
          >
            {disconnected ? (
              <View style={styles.emptyWrap}>
                <Ionicons color={light ? '#737373' : '#6B6B6B'} name="cloud-offline-outline" size={18} />
                <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>未连接</Text>
              </View>
            ) : controller.remindersLoading && controller.reminders.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>加载中…</Text>
              </View>
            ) : controller.reminders.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons color={light ? '#737373' : '#6B6B6B'} name="notifications-outline" size={18} />
                <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>暂无提醒</Text>
              </View>
            ) : (
              controller.reminders.map(item => {
                const itemBusy = controller.remindersBusyId === item.id;
                const repeatLabel = item.repeat ? REMINDER_REPEAT_LABELS[item.repeat] : '';
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.memoryCard,
                      light ? styles.memoryCardLight : styles.memoryCardDark,
                    ]}
                    testID={`control-voice-reminder-item-${item.id}`}
                  >
                    <View style={styles.memoryCardBody}>
                      <View style={[styles.roomTag, light ? styles.reminderTimeTagLight : styles.reminderTimeTag]}>
                        <Text style={[styles.roomTagText, light ? styles.reminderTimeTextLight : styles.reminderTimeText]}>
                          {formatReminderTimeLabel(item)}
                        </Text>
                      </View>
                      {repeatLabel ? (
                        <View
                          style={[styles.roomTag, light ? styles.roomTagEpisodicLight : styles.roomTagEpisodic]}
                          testID={`control-voice-reminder-repeat-badge-${item.id}`}
                        >
                          <Text style={[styles.roomTagText, light ? styles.roomTagTextEpisodicLight : styles.roomTagTextEpisodic]}>
                            {repeatLabel}
                          </Text>
                        </View>
                      ) : null}
                      <Text
                        style={[
                          styles.memoryCardText,
                          light ? styles.bubbleTextLight : styles.bubbleTextDark,
                        ]}
                      >
                        {item.content}
                      </Text>
                    </View>
                    <View style={styles.memoryCardActions}>
                      <Pressable
                        accessibilityLabel="延后10分钟"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: itemBusy }}
                        disabled={itemBusy}
                        onPress={() => controller.onSnoozeReminder(item.id, 10)}
                        style={({ pressed }) => [
                          styles.reminderActionPill,
                          light && styles.clearSessionBtnLight,
                          itemBusy && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                        testID={`control-voice-reminder-snooze-${item.id}`}
                      >
                        <Text style={[styles.reminderActionText, light && styles.clearSessionTextLight]}>延后</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="删除提醒"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: itemBusy }}
                        disabled={itemBusy}
                        onPress={() => controller.onDeleteReminder(item.id)}
                        style={({ pressed }) => [
                          styles.cardActionBtn,
                          itemBusy && styles.disabled,
                          pressed && styles.pressed,
                        ]}
                        testID={`control-voice-reminder-delete-${item.id}`}
                      >
                        <Ionicons color={light ? '#DC2626' : '#F87171'} name="trash-outline" size={14} />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {controller.remindersError ? (
            <Text numberOfLines={1} style={styles.errorText} testID="control-voice-reminders-error">
              {controller.remindersError}
            </Text>
          ) : null}

          <View style={styles.composerRow} testID="control-voice-reminder-add-bar">
            <TextInput
              accessibilityLabel="提醒时间"
              editable={!disconnected && !controller.remindersActionBusy}
              maxLength={32}
              onChangeText={controller.setReminderTimeDraft}
              placeholder="时间"
              placeholderTextColor={light ? '#94A3B8' : '#707070'}
              style={[styles.reminderTimeInput, light && styles.inputLight]}
              testID="control-voice-reminder-time-input"
              value={controller.reminderTimeDraft}
            />
            <TextInput
              accessibilityLabel="提醒事项"
              editable={!disconnected && !controller.remindersActionBusy}
              maxLength={120}
              onChangeText={controller.setReminderContentDraft}
              onSubmitEditing={() => {
                if (canAddReminder) {
                  controller.onAddReminder(
                    controller.reminderContentDraft,
                    controller.reminderTimeDraft,
                    controller.reminderRepeatDraft,
                  );
                }
              }}
              placeholder="提醒事项…"
              placeholderTextColor={light ? '#94A3B8' : '#707070'}
              returnKeyType="done"
              style={[styles.input, light && styles.inputLight]}
              testID="control-voice-reminder-content-input"
              value={controller.reminderContentDraft}
            />
            <Pressable
              accessibilityLabel="添加提醒"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAddReminder }}
              disabled={!canAddReminder}
              onPress={() => controller.onAddReminder(
                controller.reminderContentDraft,
                controller.reminderTimeDraft,
                controller.reminderRepeatDraft,
              )}
              style={({ pressed }) => [
                styles.rememberBtn,
                !canAddReminder && styles.sendBtnDisabled,
                pressed && canAddReminder && styles.pressed,
              ]}
              testID="control-voice-reminder-add"
            >
              <Text style={styles.rememberBtnText}>添加</Text>
            </Pressable>
          </View>
        </View>
      ) : activeTab === 'moments' && (modVisionNav || modCompanion) ? (
        /* TAB 4: 时光 (陪伴 · 相册 · 日记) */
        <View style={styles.sectionWrap} testID="control-voice-moments-view">
          {modCompanion ? (
            <View
              style={[styles.companionStrip, light ? styles.memoryCardLight : styles.memoryCardDark]}
              testID="control-voice-companion-strip"
            >
              <View style={styles.companionLeft}>
                <Ionicons color={light ? '#E11D48' : '#FB7185'} name="heart" size={13} />
                <Text
                  style={[styles.companionDaysText, light && styles.titleLight]}
                  testID="control-voice-companion-days"
                >
                  {`陪伴第${controller.companion?.daysTogether ?? 1}天`}
                </Text>
                {controller.companion?.speakerTier ? (
                  <View
                    style={[styles.roomTag, light ? styles.roomTagUserLight : styles.roomTagUser]}
                    testID="control-voice-companion-tier"
                  >
                    <Text style={[styles.roomTagText, light ? styles.roomTagTextUserLight : styles.roomTagTextUser]}>
                      {controller.companion.speakerTier}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View
                style={[styles.roomTag, light ? styles.roomTagKnowledgeLight : styles.roomTagKnowledge]}
                testID="control-voice-companion-mood"
              >
                <Text style={[styles.roomTagText, light ? styles.roomTagTextKnowledgeLight : styles.roomTagTextKnowledge]}>
                  {controller.companion?.moodLabel ?? '安心'}
                </Text>
              </View>
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.momentsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={[styles.listScroll, { maxHeight: listMaxHeight + 36 }]}
            testID="control-voice-moments-scroll"
          >
            {modVisionNav && selectedPhoto ? (
              <View
                style={[styles.photoPreviewModal, light ? styles.memoryCardLight : styles.photoPreviewDark]}
                testID="control-voice-photo-preview"
              >
                <Image
                  resizeMode="cover"
                  source={{ uri: selectedPhoto.url }}
                  style={styles.photoPreviewImage}
                  testID="control-voice-photo-preview-image"
                />
                {selectedPhoto.caption ? (
                  <Text style={[styles.photoPreviewCaption, light ? styles.bubbleTextLight : styles.bubbleTextDark]}>
                    {selectedPhoto.caption}
                  </Text>
                ) : null}
                <View style={styles.photoPreviewMetaRow}>
                  <View style={styles.photoPreviewTags}>
                    {formatPhotoTimeLabel(selectedPhoto) ? (
                      <Text style={[styles.emptyMiniHint, light && styles.emptyHintLight]}>
                        {formatPhotoTimeLabel(selectedPhoto)}
                      </Text>
                    ) : null}
                    {selectedPhoto.speakerId ? (
                      <View style={[styles.roomTag, light ? styles.roomTagUserLight : styles.roomTagUser]}>
                        <Text style={[styles.roomTagText, light ? styles.roomTagTextUserLight : styles.roomTagTextUser]}>
                          {selectedPhoto.speakerId}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.photoPreviewActions}>
                    <Pressable
                      accessibilityLabel="删除照片"
                      accessibilityRole="button"
                      disabled={controller.photoBusyId === selectedPhoto.id || disconnected}
                      onPress={() => controller.onDeletePhoto(selectedPhoto.id)}
                      style={({ pressed }) => [styles.photoDeletePill, pressed && styles.pressed]}
                      testID="control-voice-photo-preview-delete"
                    >
                      <Text style={styles.photoDeleteText}>删除</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="关闭预览"
                      accessibilityRole="button"
                      onPress={() => controller.setSelectedPhotoId(null)}
                      style={({ pressed }) => [
                        styles.reminderActionPill,
                        light && styles.clearSessionBtnLight,
                        pressed && styles.pressed,
                      ]}
                      testID="control-voice-photo-preview-close"
                    >
                      <Text style={[styles.reminderActionText, light && styles.clearSessionTextLight]}>关闭</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}

            {/* 相册 */}
            {modVisionNav ? (
              <View style={styles.momentsSection} testID="control-voice-photos-section">
                <View style={styles.momentsHeaderRow}>
                  <Text style={[styles.momentsSectionTitle, light && styles.titleLight]}>相册</Text>
                  <Pressable
                    accessibilityLabel="拍照"
                    accessibilityRole="button"
                    disabled={disconnected || controller.photoCapturing}
                    onPress={controller.onCapturePhoto}
                    style={({ pressed }) => [
                      styles.timerPrimaryPill,
                      (disconnected || controller.photoCapturing) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-voice-moments-capture"
                  >
                    <Ionicons color="#FFFFFF" name="camera-outline" size={12} />
                    <Text style={styles.timerPrimaryText}>{controller.photoCapturing ? '拍照中…' : '拍照'}</Text>
                  </Pressable>
                </View>

                {controller.photosError ? (
                  <Text numberOfLines={1} style={styles.errorText} testID="control-voice-photos-error">
                    {controller.photosError}
                  </Text>
                ) : null}

                {disconnected ? (
                  <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>未连接</Text>
                ) : controller.photosLoading && controller.photos.length === 0 ? (
                  <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>加载中…</Text>
                ) : controller.photos.length === 0 ? (
                  <Text style={[styles.emptyHint, light && styles.emptyHintLight]} testID="control-voice-photos-empty">
                    暂无照片
                  </Text>
                ) : (
                  <View style={styles.photoGrid} testID="control-voice-photo-grid">
                    {controller.photos.map(photo => (
                      <Pressable
                        key={photo.id}
                        accessibilityLabel={photo.caption || '查看照片'}
                        accessibilityRole="button"
                        onPress={() => controller.setSelectedPhotoId(photo.id)}
                        style={({ pressed }) => [
                          styles.photoTile,
                          light ? styles.memoryCardLight : styles.memoryCardDark,
                          pressed && styles.pressed,
                        ]}
                        testID={`control-voice-photo-item-${photo.id}`}
                      >
                        <Image
                          resizeMode="cover"
                          source={{ uri: photo.url }}
                          style={styles.photoThumb}
                        />
                        <Text
                          numberOfLines={1}
                          style={[styles.photoTileCaption, light ? styles.bubbleTextLight : styles.bubbleTextDark]}
                        >
                          {photo.caption || formatPhotoTimeLabel(photo) || '照片'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : null}

            {/* 日记 */}
            {modCompanion ? (
              <View style={styles.momentsSection} testID="control-voice-diaries-section">
                <View style={styles.momentsHeaderRow}>
                  <Text style={[styles.momentsSectionTitle, light && styles.titleLight]}>日记</Text>
                  <Pressable
                    accessibilityLabel="写日记"
                    accessibilityRole="button"
                    disabled={disconnected || controller.diaryGenerating}
                    onPress={() => controller.onGenerateDiary(true)}
                    style={({ pressed }) => [
                      styles.reminderActionPill,
                      light && styles.clearSessionBtnLight,
                      (disconnected || controller.diaryGenerating) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-voice-diary-generate"
                  >
                    <Text style={[styles.reminderActionText, light && styles.clearSessionTextLight]}>
                      {controller.diaryGenerating ? '生成中…' : '写日记'}
                    </Text>
                  </Pressable>
                </View>

                {controller.diariesError ? (
                  <Text numberOfLines={1} style={styles.errorText} testID="control-voice-diaries-error">
                    {controller.diariesError}
                  </Text>
                ) : null}

                {disconnected ? (
                  <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>未连接</Text>
                ) : controller.diariesLoading && controller.diaries.length === 0 ? (
                  <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>加载中…</Text>
                ) : controller.diaries.length === 0 ? (
                  <Text style={[styles.emptyHint, light && styles.emptyHintLight]} testID="control-voice-diaries-empty">
                    暂无日记
                  </Text>
                ) : (
                  <View style={styles.listContent}>
                    {controller.diaries.map(diary => {
                      const reading = controller.diaryReadingDate === diary.date;
                      return (
                        <View
                          key={diary.date}
                          style={[styles.diaryCard, light ? styles.memoryCardLight : styles.memoryCardDark]}
                          testID={`control-voice-diary-item-${diary.date}`}
                        >
                          <View style={styles.diaryCardHeader}>
                            <View style={styles.diaryCardMeta}>
                              <Text style={[styles.diaryDateText, light && styles.titleLight]}>{diary.date}</Text>
                              <View style={[styles.roomTag, light ? styles.roomTagKnowledgeLight : styles.roomTagKnowledge]}>
                                <Text style={[styles.roomTagText, light ? styles.roomTagTextKnowledgeLight : styles.roomTagTextKnowledge]}>
                                  {diary.moodLabel}
                                </Text>
                              </View>
                            </View>
                            <Pressable
                              accessibilityLabel="朗读日记"
                              accessibilityRole="button"
                              disabled={disconnected || Boolean(controller.diaryReadingDate)}
                              onPress={() => controller.onReadDiary(diary.date)}
                              style={({ pressed }) => [
                                styles.reminderActionPill,
                                light && styles.clearSessionBtnLight,
                                (disconnected || Boolean(controller.diaryReadingDate)) && styles.disabled,
                                pressed && styles.pressed,
                              ]}
                              testID={`control-voice-diary-read-${diary.date}`}
                            >
                              <Text style={[styles.reminderActionText, light && styles.clearSessionTextLight]}>
                                {reading ? '朗读中' : '朗读'}
                              </Text>
                            </Pressable>
                          </View>
                          <Text style={[styles.diaryBodyText, light ? styles.bubbleTextLight : styles.bubbleTextDark]}>
                            {diary.text}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : (
        /* TAB 1: 对话 */
        <>
          <ScrollView
            ref={node => { scrollNode = node; }}
            contentContainerStyle={[
              styles.messageContent,
              controller.messages.length === 0 && controller.pendingApprovals.length === 0 && styles.messageContentEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => { scrollNode?.scrollToEnd({ animated: true }); }}
            showsVerticalScrollIndicator={false}
            style={[styles.messageScroll, { maxHeight }]}
            testID="control-voice-messages"
          >
            {controller.messages.length === 0 && controller.pendingApprovals.length === 0 ? (
              <View style={styles.emptyWrap} testID="control-voice-empty-state">
                <Ionicons
                  color={light ? '#737373' : '#6B6B6B'}
                  name={
                    disconnected || controller.phase === 'unavailable'
                      ? 'cloud-offline-outline'
                      : 'chatbubble-ellipses-outline'
                  }
                  size={18}
                />
                <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>
                  {disconnected
                    ? '未连接'
                    : controller.phase === 'unavailable'
                      ? '未就绪'
                      : controller.speechSupported
                        ? '说点什么'
                        : '输入消息'}
                </Text>
              </View>
            ) : null}

            {controller.messages.map(message => {
              if (message.role === 'tool') {
                return (
                  <View key={message.id} style={styles.toolRow}>
                    <Ionicons color={light ? '#2563EB' : '#C8C8C8'} name="flash-outline" size={12} />
                    <Text numberOfLines={1} style={[styles.toolText, light && styles.toolTextLight]}>
                      {message.toolLabel ?? '执行操作'}
                    </Text>
                  </View>
                );
              }

              const isUser = message.role === 'user';
              const sourceBadge = getSourceBadgeLabel(message.source);
              return (
                <View
                  key={message.id}
                  style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}
                >
                  <View
                    style={[
                      styles.bubble,
                      isUser
                        ? styles.bubbleUser
                        : light
                          ? styles.bubbleAssistantLight
                          : styles.bubbleAssistantDark,
                    ]}
                  >
                    {!isUser && message.tools && message.tools.length > 0 ? (
                      <View style={styles.inlineToolRow}>
                        {message.tools.map((toolLabel, idx) => (
                          <View
                            key={`${message.id}-tool-${idx}`}
                            style={[styles.inlineToolChip, light && styles.inlineToolChipLight]}
                            testID={`control-voice-tool-chip-${message.id}-${idx}`}
                          >
                            <Ionicons color={light ? '#2563EB' : '#C8C8C8'} name="flash-outline" size={10} />
                            <Text style={[styles.inlineToolText, light && styles.inlineToolTextLight]}>
                              {toolLabel}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.bubbleBodyLine}>
                      {sourceBadge ? (
                        <View
                          style={[
                            styles.sourceBadge,
                            message.source === 'broadcast'
                              ? styles.sourceBadgeBroadcast
                              : isUser
                                ? styles.sourceBadgeUser
                                : message.source === 'reminder'
                                  ? styles.sourceBadgeReminder
                                  : (light ? styles.sourceBadgeAssistantLight : styles.sourceBadgeAssistant),
                          ]}
                          testID={`control-voice-source-${message.id}`}
                        >
                          <Text
                            style={[
                              styles.sourceBadgeText,
                              message.source === 'broadcast'
                                ? styles.sourceBadgeTextBroadcast
                                : isUser
                                  ? styles.sourceBadgeTextUser
                                  : message.source === 'reminder'
                                    ? styles.sourceBadgeTextReminder
                                    : (light ? styles.sourceBadgeTextLight : styles.sourceBadgeTextDark),
                            ]}
                          >
                            {sourceBadge}
                          </Text>
                        </View>
                      ) : null}
                      {message.speakerId ? (
                        <View
                          style={[
                            styles.sourceBadge,
                            isUser ? styles.sourceBadgeUser : (light ? styles.roomTagUserLight : styles.roomTagUser),
                          ]}
                          testID={`control-voice-speaker-${message.id}`}
                        >
                          <Text
                            style={[
                              styles.sourceBadgeText,
                              isUser ? styles.sourceBadgeTextUser : (light ? styles.roomTagTextUserLight : styles.roomTagTextUser),
                            ]}
                          >
                            {message.speakerId}
                          </Text>
                        </View>
                      ) : null}
                      <Text
                        style={[
                          styles.bubbleText,
                          isUser
                            ? styles.bubbleTextUser
                            : light
                              ? styles.bubbleTextLight
                              : styles.bubbleTextDark,
                        ]}
                      >
                        {message.text}
                      </Text>
                    </View>

                    {!isUser && message.choices && message.choices.length > 0 ? (
                      <View style={styles.choiceRow}>
                        {message.choices.map(choice => (
                          <Pressable
                            key={choice}
                            accessibilityRole="button"
                            disabled={controller.busy}
                            onPress={() => controller.onSubmit(choice)}
                            style={({ pressed }) => [styles.choiceBtn, pressed && styles.pressed]}
                          >
                            <Text style={styles.choiceBtnText}>{choice}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}

            {controller.pendingApprovals.map(approval => {
              const deciding = controller.approvalBusyId === approval.approvalId;
              return (
                <View
                  key={approval.approvalId}
                  style={[styles.approvalCard, light && styles.approvalCardLight]}
                  testID={`control-voice-approval-${approval.approvalId}`}
                >
                  <View style={styles.approvalInfo}>
                    <Ionicons color="#F59E0B" name="shield-checkmark-outline" size={15} />
                    <Text numberOfLines={1} style={[styles.approvalTitle, light && styles.titleLight]}>
                      {approval.summaryText}
                    </Text>
                  </View>
                  <View style={styles.approvalBtns}>
                    <Pressable
                      accessibilityLabel="拒绝"
                      accessibilityRole="button"
                      disabled={deciding}
                      onPress={() => controller.onDecideApproval(approval.approvalId, false)}
                      style={({ pressed }) => [styles.rejectBtn, deciding && styles.disabled, pressed && styles.pressed]}
                      testID={`control-voice-reject-${approval.approvalId}`}
                    >
                      <Text style={styles.rejectBtnText}>拒绝</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="允许"
                      accessibilityRole="button"
                      disabled={deciding}
                      onPress={() => controller.onDecideApproval(approval.approvalId, true)}
                      style={({ pressed }) => [styles.approveBtn, deciding && styles.disabled, pressed && styles.pressed]}
                      testID={`control-voice-approve-${approval.approvalId}`}
                    >
                      <Text style={styles.approveBtnText}>允许</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {controller.errorText ? (
            <Text numberOfLines={1} style={styles.errorText} testID="control-voice-error">
              {controller.errorText}
            </Text>
          ) : null}

          {/* Expandable Scene / Combo Sub-Bar */}
          {!disconnected && showQuickScenes && controller.quickGroup === 'scenes' ? (
            <ScrollView
              contentContainerStyle={styles.quickRailContent}
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.quickRail}
              testID="control-voice-scene-bar"
            >
              {controller.sceneOptions.map(scene => (
                <Pressable
                  key={scene.id}
                  accessibilityLabel={`情景 ${scene.label}`}
                  accessibilityRole="button"
                  disabled={controller.actionRailBusy}
                  onPress={() => controller.onRunScene(scene.id)}
                  style={({ pressed }) => [
                    styles.quickActionChip,
                    light && styles.filterChipActiveLight,
                    controller.actionRailBusy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-scene-${scene.id}`}
                >
                  <Text style={[styles.quickChipText, light && styles.quickChipTextLight]}>{scene.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {!disconnected && showQuickCombos && controller.quickGroup === 'combos' ? (
            <ScrollView
              contentContainerStyle={styles.quickRailContent}
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.quickRail}
              testID="control-voice-combo-bar"
            >
              {controller.comboOptions.map(combo => {
                const playing = controller.activeComboId === combo.id;
                return (
                  <Pressable
                    key={combo.id}
                    accessibilityLabel={`才艺 ${combo.label}`}
                    accessibilityRole="button"
                    disabled={controller.actionRailBusy}
                    onPress={() => controller.onPlayCombo(combo.id)}
                    style={({ pressed }) => [
                      styles.quickActionChip,
                      light && styles.filterChipActiveLight,
                      playing && (light ? styles.quietPillActiveLight : styles.quietPillActive),
                      controller.actionRailBusy && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID={`control-voice-combo-${combo.id}`}
                  >
                    <Text
                      style={[
                        styles.quickChipText,
                        light && styles.quickChipTextLight,
                        playing && styles.quietPillTextActive,
                      ]}
                    >
                      {combo.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityLabel="停止表演"
                accessibilityRole="button"
                onPress={controller.onStopCombo}
                style={({ pressed }) => [styles.comboStopChip, pressed && styles.pressed]}
                testID="control-voice-combo-stop"
              >
                <Text style={styles.comboStopText}>停止</Text>
              </Pressable>
            </ScrollView>
          ) : null}

          {/* Persistent Compact Quick-Action Rail (dynamically shows only enabled actions) */}
          {!disconnected && hasQuickRail ? (
            <ScrollView
              contentContainerStyle={styles.quickRailContent}
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.quickRail}
              testID="control-voice-quick-rail"
            >
              {showQuickScenes ? (
                <Pressable
                  accessibilityLabel="情景"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: controller.quickGroup === 'scenes' }}
                  onPress={() => controller.setQuickGroup(controller.quickGroup === 'scenes' ? 'default' : 'scenes')}
                  style={({ pressed }) => [
                    styles.quickChip,
                    light && styles.quickChipLight,
                    controller.quickGroup === 'scenes' && (light ? styles.filterChipActiveLight : styles.filterChipActive),
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-quick-scenes"
                >
                  <Text style={[styles.quickChipText, light && styles.quickChipTextLight]}>情景</Text>
                </Pressable>
              ) : null}
              {showQuickBriefing ? (
                <Pressable
                  accessibilityLabel="早报"
                  accessibilityRole="button"
                  disabled={controller.actionRailBusy}
                  onPress={controller.onRunBriefing}
                  style={({ pressed }) => [
                    styles.quickChip,
                    light && styles.quickChipLight,
                    controller.actionRailBusy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-quick-briefing"
                >
                  <Text style={[styles.quickChipText, light && styles.quickChipTextLight]}>早报</Text>
                </Pressable>
              ) : null}
              {showQuickPhoto ? (
                <Pressable
                  accessibilityLabel="拍照"
                  accessibilityRole="button"
                  disabled={controller.photoCapturing}
                  onPress={controller.onCapturePhoto}
                  style={({ pressed }) => [
                    styles.quickChip,
                    light && styles.quickChipLight,
                    controller.photoCapturing && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-quick-photo"
                >
                  <Text style={[styles.quickChipText, light && styles.quickChipTextLight]}>拍照</Text>
                </Pressable>
              ) : null}
              {showQuickCombos ? (
                <Pressable
                  accessibilityLabel="才艺"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: controller.quickGroup === 'combos' }}
                  onPress={() => controller.setQuickGroup(controller.quickGroup === 'combos' ? 'default' : 'combos')}
                  style={({ pressed }) => [
                    styles.quickChip,
                    light && styles.quickChipLight,
                    (controller.quickGroup === 'combos' || Boolean(controller.activeComboId))
                      && (light ? styles.quietPillActiveLight : styles.quietPillActive),
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-quick-combos"
                >
                  <Text
                    style={[
                      styles.quickChipText,
                      light && styles.quickChipTextLight,
                      Boolean(controller.activeComboId) && styles.quietPillTextActive,
                    ]}
                  >
                    才艺
                  </Text>
                </Pressable>
              ) : null}

              {quickPrompts.map(prompt => (
                <Pressable
                  key={prompt}
                  accessibilityLabel={prompt}
                  accessibilityRole="button"
                  disabled={controller.busy}
                  onPress={() => controller.onSubmit(prompt)}
                  style={({ pressed }) => [
                    styles.quickChip,
                    light && styles.quickChipLight,
                    controller.busy && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-quick-${prompt}`}
                >
                  <Text style={[styles.quickChipText, light && styles.quickChipTextLight]}>{prompt}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.composerRow}>
            {isXiaosuan ? (
              <Pressable
                accessibilityLabel={controller.broadcastMode ? '切换对话' : '切换传话'}
                accessibilityRole="switch"
                accessibilityState={{ checked: controller.broadcastMode, disabled: disconnected || controller.busy }}
                disabled={disconnected || controller.busy}
                onPress={controller.onToggleBroadcastMode}
                style={({ pressed }) => [
                  styles.broadcastToggleBtn,
                  light && styles.roomSelectBtnLight,
                  controller.broadcastMode && styles.broadcastToggleActive,
                  (disconnected || controller.busy) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-broadcast-toggle"
              >
                <Text
                  style={[
                    styles.broadcastToggleText,
                    light && styles.roomSelectTextLight,
                    controller.broadcastMode && styles.broadcastToggleTextActive,
                  ]}
                >
                  传话
                </Text>
              </Pressable>
            ) : null}

            {controller.speechSupported ? (
              <Pressable
                accessibilityLabel={controller.listening ? '结束说话' : '点击说话'}
                accessibilityRole="button"
                accessibilityState={{
                  disabled: disconnected || controller.busy,
                  selected: controller.listening,
                }}
                disabled={disconnected || controller.busy}
                onPress={controller.onToggleListening}
                style={({ pressed }) => [
                  styles.micBtn,
                  light && styles.micBtnLight,
                  controller.listening && styles.micBtnListening,
                  (disconnected || controller.busy) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-mic-btn"
              >
                <Ionicons
                  color={controller.listening ? '#FFFFFF' : (light ? '#FFFFFF' : '#F2F2F2')}
                  name={controller.listening ? 'radio-button-on' : 'mic'}
                  size={16}
                />
                <Text style={[styles.micBtnText, !controller.listening && !light && styles.micBtnTextDark]}>
                  {controller.listening ? '完成' : '说话'}
                </Text>
              </Pressable>
            ) : null}

            <TextInput
              accessibilityLabel={controller.broadcastMode ? '输入传话' : '输入消息'}
              editable={!disconnected && !controller.busy}
              maxLength={1000}
              onChangeText={controller.setDraft}
              onSubmitEditing={() => {
                if (canSend) controller.onSubmit();
              }}
              placeholder={controller.listening ? '聆听中…' : controller.broadcastMode ? '输入传话…' : '输入消息…'}
              placeholderTextColor={light ? '#94A3B8' : '#707070'}
              returnKeyType="send"
              style={[styles.input, light && styles.inputLight]}
              testID="control-voice-input"
              value={controller.draft}
            />

            {controller.canStop ? (
              <Pressable
                accessibilityLabel="停止"
                accessibilityRole="button"
                onPress={controller.onCancelTurn}
                style={({ pressed }) => [styles.stopTurnBtn, pressed && styles.pressed]}
                testID="control-voice-cancel-turn"
              >
                <Ionicons color="#FFFFFF" name="stop" size={15} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel={controller.broadcastMode ? '传话' : '发送'}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => controller.onSubmit()}
                style={({ pressed }) => [
                  styles.sendBtn,
                  light && styles.sendBtnLight,
                  controller.broadcastMode && styles.broadcastSendBtn,
                  !canSend && (light ? styles.sendBtnDisabledLight : styles.sendBtnDisabled),
                  pressed && canSend && styles.pressed,
                ]}
                testID="control-voice-send-btn"
              >
                <Ionicons
                  color={controller.broadcastMode ? '#FFFFFF' : !canSend ? (light ? '#FFFFFF' : '#707070') : (light ? '#FFFFFF' : '#141414')}
                  name={controller.broadcastMode ? 'megaphone-outline' : 'arrow-up'}
                  size={15}
                />
              </Pressable>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 7,
  },
  cardDark: {
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  cardLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    color: '#F2F2F2',
  },
  titleLight: {
    color: '#0F172A',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: '#222222',
  },
  statusBadgeLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  statusBadgeLive: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.20)',
  },
  statusBadgeLiveLight: {
    backgroundColor: 'rgba(59, 110, 246, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(59, 110, 246, 0.25)',
  },
  statusDotHalo: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#C8C8C8',
    fontWeight: '500',
  },
  statusTextLight: {
    color: '#475569',
  },
  emotionTag: {
    fontSize: 10.5,
    lineHeight: 14,
    color: '#D4D4D4',
    fontWeight: '600',
    paddingLeft: 3,
  },
  emotionTagLight: {
    color: '#1D4ED8',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242424',
  },
  iconBtnLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  iconBtnActive: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  iconBtnActiveLight: {
    backgroundColor: 'rgba(59, 110, 246, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(59, 110, 246, 0.32)',
  },
  actionPillBtn: {
    height: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#242424',
  },
  actionPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '500',
    color: '#C8C8C8',
  },
  actionPillTextLight: {
    color: '#334155',
  },
  stopPillBtn: {
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#DC2626',
  },
  stopPillText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  quietPillActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  quietPillActiveLight: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  quietPillTextActive: {
    color: '#FBBF24',
    fontWeight: '600',
  },
  styleDrawer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 6,
  },
  styleDrawerDark: {
    backgroundColor: '#1A1A1A',
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  styleDrawerLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  styleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  styleLabel: {
    width: 26,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  styleLabelLight: {
    color: '#64748B',
  },
  styleChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  styleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  styleChipText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#C8C8C8',
    fontWeight: '500',
  },
  tabBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  segmentedTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  segmentedTrackLight: {
    backgroundColor: '#F1F5F9',
  },
  tabBtn: {
    flex: 1,
    height: 26,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabBtnActive: {
    backgroundColor: '#323232',
  },
  tabBtnActiveLight: {
    backgroundColor: '#FFFFFF',
  },
  tabText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: '#A0A0A0',
  },
  tabTextLight: {
    color: '#64748B',
  },
  tabTextActive: {
    color: '#F2F2F2',
    fontWeight: '600',
  },
  tabTextActiveLight: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  tabBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333333',
  },
  tabBadgeAccent: {
    backgroundColor: '#4A4A4A',
  },
  tabBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noticePill: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.35)',
  },
  noticePillLight: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: 'rgba(22, 163, 74, 0.3)',
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#86EFAC',
  },
  noticeTextLight: {
    color: '#15803D',
  },
  sectionWrap: {
    gap: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    borderRadius: 10,
    paddingHorizontal: 9,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  searchRowLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    color: '#F2F2F2',
    paddingVertical: 0,
  },
  searchInputLight: {
    color: '#0F172A',
  },
  clearSearchBtn: {
    padding: 2,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 1,
  },
  filterChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  filterChipLight: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#323232',
    borderColor: 'rgba(255, 255, 255, 0.24)',
  },
  filterChipActiveLight: {
    backgroundColor: 'rgba(59, 110, 246, 0.12)',
    borderColor: 'rgba(59, 110, 246, 0.35)',
  },
  filterChipText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#C8C8C8',
    fontWeight: '500',
  },
  filterChipTextLight: {
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#F2F2F2',
    fontWeight: '600',
  },
  filterChipTextActiveLight: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  listScroll: {
    minHeight: 64,
  },
  listContent: {
    gap: 6,
    paddingVertical: 2,
  },
  memoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1,
  },
  memoryCardEdit: {
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: 1,
  },
  memoryCardDark: {
    backgroundColor: '#1A1A1A',
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  memoryCardLight: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  memoryCardBody: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  memoryCardText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  memoryCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomSelectMini: {
    height: 28,
    paddingHorizontal: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  editInput: {
    flex: 1,
    minWidth: 0,
    height: 28,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 12,
    color: '#F2F2F2',
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  editBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  roomTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 1,
  },
  roomTagText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
  },
  roomTagUser: {
    backgroundColor: 'rgba(59, 130, 246, 0.22)',
  },
  roomTagUserLight: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
  },
  roomTagTextUser: {
    color: '#93C5FD',
  },
  roomTagTextUserLight: {
    color: '#1D4ED8',
  },
  roomTagKnowledge: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
  },
  roomTagKnowledgeLight: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  roomTagTextKnowledge: {
    color: '#6EE7B7',
  },
  roomTagTextKnowledgeLight: {
    color: '#047857',
  },
  roomTagEpisodic: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
  },
  roomTagEpisodicLight: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
  },
  roomTagTextEpisodic: {
    color: '#FCD34D',
  },
  roomTagTextEpisodicLight: {
    color: '#B45309',
  },
  roomTagBehavior: {
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
  },
  roomTagBehaviorLight: {
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
  },
  roomTagTextBehavior: {
    color: '#D8B4FE',
  },
  roomTagTextBehaviorLight: {
    color: '#7E22CE',
  },
  reminderTimeTag: {
    backgroundColor: '#2A2A2A',
  },
  reminderTimeTagLight: {
    backgroundColor: 'rgba(59, 110, 246, 0.12)',
  },
  reminderTimeText: {
    color: '#D4D4D4',
  },
  reminderTimeTextLight: {
    color: '#1D4ED8',
  },
  reminderActionPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: '#2A2A2A',
  },
  reminderActionText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    color: '#C8C8C8',
  },
  roomSelectBtn: {
    height: 32,
    paddingHorizontal: 7,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  roomSelectBtnLight: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  roomSelectText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#F2F2F2',
  },
  roomSelectTextLight: {
    color: '#334155',
  },
  pinAddBtn: {
    width: 30,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  pinAddBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  reminderTimeInput: {
    width: 78,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 9,
    paddingVertical: 0,
    fontSize: 11.5,
    color: '#F2F2F2',
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  rememberBtn: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#323232',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  rememberBtnText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.09)',
  },
  memoryFooterEnd: {
    justifyContent: 'flex-end',
  },
  memoryFooterLight: {
    borderTopColor: '#E2E8F0',
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 15,
    color: '#A0A0A0',
  },
  summaryTextLight: {
    color: '#64748B',
  },
  clearSessionBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
  },
  clearSessionBtnLight: {
    backgroundColor: '#F1F5F9',
  },
  clearSessionText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: '#C8C8C8',
  },
  clearSessionTextLight: {
    color: '#475569',
  },
  messageScroll: {
    minHeight: 64,
  },
  messageContent: {
    gap: 6,
    paddingVertical: 2,
  },
  messageContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyWrap: {
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 16,
    color: '#9A9A9A',
    fontWeight: '500',
  },
  emptyHintLight: {
    color: '#64748B',
  },
  quickRail: {
    flexGrow: 0,
  },
  quickRailContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 1,
  },
  quickChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  quickChipLight: {
    backgroundColor: 'rgba(59, 110, 246, 0.10)',
    borderColor: 'rgba(59, 110, 246, 0.25)',
  },
  quickChipText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#D4D4D4',
    fontWeight: '500',
  },
  quickChipTextLight: {
    color: '#1D4ED8',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  toolText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#C8C8C8',
  },
  toolTextLight: {
    color: '#2563EB',
  },
  inlineToolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  inlineToolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#2A2A2A',
  },
  inlineToolChipLight: {
    backgroundColor: 'rgba(59, 110, 246, 0.10)',
  },
  inlineToolText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600',
    color: '#D4D4D4',
  },
  inlineToolTextLight: {
    color: '#2563EB',
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  bubbleRowUser: {
    justifyContent: 'flex-end',
  },
  bubbleRowAssistant: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '86%',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  bubbleBodyLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
    flexWrap: 'wrap',
  },
  sourceBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    marginTop: 2,
  },
  sourceBadgeUser: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  sourceBadgeAssistant: {
    backgroundColor: '#333333',
  },
  sourceBadgeAssistantLight: {
    backgroundColor: '#E2E8F0',
  },
  sourceBadgeReminder: {
    backgroundColor: 'rgba(245, 158, 11, 0.26)',
  },
  sourceBadgeText: {
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: '600',
  },
  sourceBadgeTextUser: {
    color: '#FFFFFF',
  },
  sourceBadgeTextDark: {
    color: '#C8C8C8',
  },
  sourceBadgeTextLight: {
    color: '#475569',
  },
  sourceBadgeTextReminder: {
    color: '#FCD34D',
  },
  bubbleUser: {
    backgroundColor: '#323232',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  bubbleAssistantDark: {
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  bubbleAssistantLight: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleText: {
    fontSize: 12.5,
    lineHeight: 18,
    flexShrink: 1,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextDark: {
    color: '#F2F2F2',
  },
  bubbleTextLight: {
    color: '#0F172A',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  choiceBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  choiceBtnText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#F2F2F2',
    fontWeight: '500',
  },
  approvalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  approvalCardLight: {
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
  },
  approvalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  approvalTitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#FDE68A',
    fontWeight: '500',
    flexShrink: 1,
  },
  approvalBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rejectBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#333333',
  },
  rejectBtnText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#F2F2F2',
    fontWeight: '500',
  },
  approveBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#323232',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  approveBtnText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  errorText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#FCA5A5',
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  micBtnLight: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  micBtnListening: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  micBtnText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  micBtnTextDark: {
    color: '#F2F2F2',
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 0,
    fontSize: 12.5,
    color: '#F2F2F2',
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  inputLight: {
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F2F2',
  },
  sendBtnLight: {
    backgroundColor: '#2563EB',
  },
  sendBtnDisabled: {
    backgroundColor: '#2A2A2A',
  },
  sendBtnDisabledLight: {
    backgroundColor: '#CBD5E1',
  },
  stopTurnBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E53935',
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.72,
  },
  styleLabelWide: {
    width: 46,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    color: '#A0A0A0',
  },
  emptyMiniHint: {
    fontSize: 11,
    lineHeight: 15,
    color: '#A0A0A0',
  },
  speakerSection: {
    gap: 5,
    paddingTop: 2,
  },
  speakerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 5,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  speakerDelBtn: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerEnrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 52,
  },
  speakerInput: {
    flex: 1,
    minWidth: 0,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 0,
    fontSize: 11.5,
    color: '#F2F2F2',
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  speakerEnrollBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#323232',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  speakerEnrollText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1,
  },
  timerReadoutWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  timerTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#F2F2F2',
  },
  timerReadoutText: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '700',
    color: '#F2F2F2',
  },
  timerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timerPrimaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: '#323232',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  timerPrimaryText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  companionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 11,
    borderWidth: 1,
  },
  companionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  companionDaysText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#F2F2F2',
  },
  momentsContent: {
    gap: 10,
    paddingVertical: 2,
  },
  momentsSection: {
    gap: 6,
  },
  momentsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  momentsSectionTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#F2F2F2',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  photoTile: {
    width: '48.5%',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoThumb: {
    width: '100%',
    height: 76,
    backgroundColor: '#1A1A1A',
  },
  photoTileCaption: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  photoPreviewModal: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 8,
    gap: 6,
  },
  photoPreviewDark: {
    backgroundColor: 'rgba(20, 20, 20, 0.96)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  photoPreviewImage: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  photoPreviewCaption: {
    fontSize: 12,
    lineHeight: 17,
  },
  photoPreviewMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  photoPreviewTags: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  photoPreviewActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoDeletePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: 'rgba(220, 38, 38, 0.22)',
  },
  photoDeleteText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    color: '#FCA5A5',
  },
  diaryCard: {
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: 1,
    gap: 5,
  },
  diaryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  diaryCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  diaryDateText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '600',
    color: '#F2F2F2',
  },
  diaryBodyText: {
    fontSize: 12,
    lineHeight: 17,
  },
  sourceBadgeBroadcast: {
    backgroundColor: 'rgba(245, 158, 11, 0.28)',
  },
  sourceBadgeTextBroadcast: {
    color: '#FEF3C7',
  },
  quickActionChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.32)',
  },
  comboStopChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(220, 38, 38, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.4)',
  },
  comboStopText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '600',
    color: '#FCA5A5',
  },
  broadcastToggleBtn: {
    height: 32,
    paddingHorizontal: 9,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  broadcastToggleActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.26)',
    borderColor: 'rgba(251, 191, 36, 0.55)',
  },
  broadcastToggleText: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '600',
    color: '#C8C8C8',
  },
  broadcastToggleTextActive: {
    color: '#FDE68A',
  },
  broadcastSendBtn: {
    backgroundColor: '#D97706',
  },
  overrideDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#F2F2F2',
  },
  drawerTabTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  drawerTabBtn: {
    flex: 1,
    height: 24,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  styleDrawerSection: {
    gap: 6,
  },
  capList: {
    gap: 5,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 1,
  },
  capSubRow: {
    paddingLeft: 10,
  },
  capNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  capName: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '500',
    color: '#F2F2F2',
  },
  capSwitchBtn: {
    minWidth: 44,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222222',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
  },
  capSafetyBtnActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    borderColor: 'rgba(251, 191, 36, 0.50)',
  },
  capSafetyBtnActiveLight: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderColor: 'rgba(245, 158, 11, 0.38)',
  },
  capSafetyTextActive: {
    color: '#FCD34D',
    fontWeight: '600',
  },
  capSafetyTextActiveLight: {
    color: '#B45309',
    fontWeight: '600',
  },
  capStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#2A2A2A',
  },
  capStatusBadgeLight: {
    backgroundColor: '#E2E8F0',
  },
  capStatusText: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    color: '#A0A0A0',
  },
  capStatusTextLight: {
    color: '#64748B',
  },
  capFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 2,
  },
  tabBarRowEnd: {
    justifyContent: 'flex-end',
  },
});
