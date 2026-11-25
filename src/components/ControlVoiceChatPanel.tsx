import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text, TextInput } from './AppText';
import type {
  RobotVoiceController,
  VoiceMemoryFilter,
  VoiceMemoryRoom,
  VoiceReminderItem,
  VoiceReminderRepeat,
  XiaosuanEmotion,
} from '../features/control/useRobotVoiceChat';

const DEFAULT_QUICK_PROMPTS = ['查看状态', '观察周围', '今天天气'] as const;

const VOLUME_PRESETS: readonly Readonly<{ value: number; label: string }>[] = [
  { value: 0, label: '静音' },
  { value: 25, label: '轻声' },
  { value: 65, label: '标准' },
  { value: 90, label: '大声' },
];

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

const WEB_GLASS_WING = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(26px) saturate(155%)', WebkitBackdropFilter: 'blur(26px) saturate(155%)' } as object)
  : null;

const WEB_GLASS_POPOVER = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(28px) saturate(145%)', WebkitBackdropFilter: 'blur(28px) saturate(145%)' } as object)
  : null;

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

function renderMiniBotHead(options: {
  offline: boolean;
  listening: boolean;
  thinking: boolean;
  speaking: boolean;
  emotion: XiaosuanEmotion;
  light: boolean;
}) {
  const { offline, listening, thinking, speaking, emotion, light } = options;
  const headBg = light
    ? (offline ? 'rgba(15, 23, 42, 0.25)' : '#1E293B')
    : (offline ? 'rgba(232, 233, 238, 0.36)' : '#E8E9EE');
  const eyeColor = light ? '#F8FAFC' : '#121318';
  const eyeHeight = offline ? 1.8 : listening ? 5.2 : speaking || emotion === 'happy' ? 2.4 : 4.2;
  const eyeWidth = offline ? 4.2 : speaking || emotion === 'happy' ? 4.2 : 2.6;
  const eyeRadius = offline ? 1 : 2;
  const leftEyeHeight = thinking ? 3.2 : eyeHeight;
  const rightEyeHeight = thinking ? 4.6 : emotion === 'wink' ? 1.8 : eyeHeight;

  return (
    <View style={[styles.miniBotHead, { backgroundColor: headBg }]}>
      <View style={styles.miniBotEyesRow}>
        <View
          style={{
            width: eyeWidth,
            height: leftEyeHeight,
            borderRadius: eyeRadius,
            backgroundColor: eyeColor,
          }}
        />
        <View
          style={{
            width: eyeWidth,
            height: rightEyeHeight,
            borderRadius: eyeRadius,
            backgroundColor: eyeColor,
          }}
        />
      </View>
    </View>
  );
}

export function ControlVoiceChatPanel({
  controller,
  onClose,
  maxHeight = 260,
  surfaceTone = 'dark',
  variant = 'wing',
}: {
  controller: RobotVoiceController;
  onClose: () => void;
  maxHeight?: number;
  surfaceTone?: 'dark' | 'light';
  variant?: 'wing' | 'card';
}) {
  let scrollNode: ScrollView | null = null;
  const light = surfaceTone === 'light';
  const isWing = variant === 'wing' && !light;
  const activeTab = controller.activeTab;
  const isXiaosuan = controller.isXiaosuanMode;
  const disconnected = controller.phase === 'disconnected';
  const unavailable = controller.phase === 'unavailable';
  const isOffline = disconnected || unavailable;

  const isLivePulse =
    controller.phase === 'listening'
    || controller.phase === 'thinking'
    || controller.phase === 'speaking'
    || Boolean(controller.activeMove?.active);

  const statusDotColor =
    controller.activeMove?.active
      ? '#E9B963'
      : controller.phase === 'listening'
        ? '#63C795'
        : controller.phase === 'speaking'
          ? '#63C795'
          : controller.phase === 'thinking' || controller.phase === 'connecting'
            ? '#E9B963'
            : controller.phase === 'awaiting'
              ? '#E9B963'
              : controller.phase === 'ready'
                ? (controller.quietMode ? '#E9B963' : '#63C795')
                : '#7A7D85';

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

  const showQuickBriefing = isXiaosuan && modInfoReminders;
  const quickPrompts: readonly string[] = isXiaosuan
    ? [
        ...(modVisionNav ? ['看看前面'] : []),
        ...(modRobotControl ? ['查看状态', '打招呼', '坐下'] : []),
        ...(modInfoReminders ? ['今天天气'] : []),
      ]
    : DEFAULT_QUICK_PROMPTS;
  const hasQuickActions = showQuickBriefing || quickPrompts.length > 0 || isXiaosuan;
  const currentDogVolume = controller.dogVolume ?? 65;

  const activeMove = controller.activeMove?.active ? controller.activeMove : null;
  const activeMoveReadout = activeMove
    ? (activeMove.isTurn
      ? `${activeMove.directionLabel} ${Math.round(activeMove.current)}° / ${Math.round(activeMove.target)}°`
      : `${activeMove.directionLabel} ${activeMove.current.toFixed(2)} / ${activeMove.target.toFixed(2)} m`)
    : null;

  const isSubview = activeTab !== 'chat';
  const subviewTitle =
    activeTab === 'memory'
      ? '长期记忆'
      : activeTab === 'reminders'
        ? '日程提醒'
        : '能力与声音';

  const roleHeaderLabel = capsSupported
    ? controller.dutyProfileName
    : `${controller.activeRoleName}·${controller.activeVoiceName}`;

  const showRolePopover = controller.openPopover === 'role' && activeTab === 'chat' && isXiaosuan;
  const showMorePopover = controller.openPopover === 'more';
  const showWalkPopover = controller.openPopover === 'walk' && activeTab === 'chat' && capsSupported && modRobotControl;
  const showQuickPopover = controller.openPopover === 'quick' && activeTab === 'chat' && !disconnected;
  const showInlineMic = controller.speechSupported || isXiaosuan;

  const listStyle = isWing ? styles.wingScroll : [styles.cardScroll, { maxHeight }];

  return (
    <View
      style={[
        styles.shell,
        isWing ? styles.shellWing : (light ? styles.shellCardLight : styles.shellCardDark),
        isWing && WEB_GLASS_WING,
      ]}
      testID="control-hud-voice-panel"
    >
      {/* Minimal Header: Left [Bot + Name + Role ▾] or [← Back + Title] | Right ONLY [···] [×] */}
      <View style={styles.header}>
        {isSubview ? (
          <View style={styles.subviewHeaderLeft}>
            <Pressable
              accessibilityLabel="返回对话"
              accessibilityRole="button"
              onPress={() => controller.setActiveTab('chat')}
              style={({ pressed }) => [styles.ghostBackBtn, light && styles.ghostBtnLight, pressed && styles.pressed]}
              testID="control-voice-subview-back"
            >
              <Ionicons color={light ? '#0F172A' : 'rgba(255,255,255,0.82)'} name="chevron-back" size={16} />
              <Text style={[styles.subviewTitle, light && styles.inkLight]}>{subviewTitle}</Text>
            </Pressable>
            {activeTab === 'memory' ? (
              <Pressable
                accessibilityLabel="刷新记忆"
                accessibilityRole="button"
                disabled={controller.memoryLoading || disconnected}
                onPress={controller.onRefreshMemories}
                style={({ pressed }) => [
                  styles.ghostIconBtn,
                  (controller.memoryLoading || disconnected) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-memory-refresh"
              >
                <Ionicons color={light ? '#475569' : 'rgba(255,255,255,0.58)'} name="refresh-outline" size={14} />
              </Pressable>
            ) : activeTab === 'reminders' ? (
              <Pressable
                accessibilityLabel="刷新提醒"
                accessibilityRole="button"
                disabled={controller.remindersLoading || disconnected}
                onPress={controller.onRefreshReminders}
                style={({ pressed }) => [
                  styles.ghostIconBtn,
                  (controller.remindersLoading || disconnected) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-reminders-refresh"
              >
                <Ionicons color={light ? '#475569' : 'rgba(255,255,255,0.58)'} name="refresh-outline" size={14} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.titleCluster}>
            <Pressable
              accessibilityLabel={isXiaosuan ? `小算 ${roleHeaderLabel}` : '对话'}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRolePopover }}
              disabled={!isXiaosuan || disconnected}
              onPress={() => {
                if (isXiaosuan) controller.togglePopover('role');
              }}
              style={({ pressed }) => [
                styles.roleTriggerBtn,
                showRolePopover && (light ? styles.ghostBtnActiveLight : styles.ghostBtnActive),
                pressed && isXiaosuan && !disconnected && styles.pressed,
              ]}
              testID="control-voice-style-toggle"
            >
              {renderMiniBotHead({
                offline: isOffline,
                listening: controller.phase === 'listening',
                thinking: controller.phase === 'thinking' || controller.phase === 'connecting',
                speaking: controller.phase === 'speaking',
                emotion: controller.emotion,
                light,
              })}
              <Text numberOfLines={1} style={[styles.brandName, light && styles.inkLight]}>
                {isXiaosuan ? '小算' : '对话'}
              </Text>
              {isXiaosuan ? (
                <>
                  <Text style={[styles.headerDividerDot, light && styles.mutedLight]}>·</Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.roleLabel, light && styles.mutedLight]}
                    testID="control-voice-role-pill-label"
                  >
                    {roleHeaderLabel}
                  </Text>
                  {modVoiceWalk ? (
                    <Ionicons
                      color="#E9B963"
                      name="lock-open"
                      size={10}
                      testID="control-voice-walk-unlocked-indicator"
                    />
                  ) : null}
                  {capsSupported && caps.hasOverrides ? (
                    <View style={styles.overrideDot} testID="control-voice-override-dot" />
                  ) : null}
                  <Ionicons
                    color={light ? '#64748B' : 'rgba(255,255,255,0.42)'}
                    name={showRolePopover ? 'chevron-up' : 'chevron-down'}
                    size={12}
                  />
                </>
              ) : null}
            </Pressable>

            {(!isXiaosuan || isLivePulse || isOffline) ? (
              <View style={styles.whisperStatusWrap} testID="control-voice-presence-pill">
                <View
                  style={[styles.statusDotCore, { backgroundColor: statusDotColor }]}
                  testID="control-voice-presence-dot"
                />
                <Text
                  numberOfLines={1}
                  style={[styles.whisperStatusText, light && styles.mutedLight]}
                  testID="control-voice-status"
                >
                  {controller.statusLabel}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.headerRightIcons}>
          <Pressable
            accessibilityLabel="更多选项"
            accessibilityRole="button"
            accessibilityState={{ expanded: showMorePopover }}
            onPress={() => controller.togglePopover('more')}
            style={({ pressed }) => [
              styles.ghostIconBtn,
              showMorePopover && (light ? styles.ghostBtnActiveLight : styles.ghostBtnActive),
              pressed && styles.pressed,
            ]}
            testID="control-voice-more-toggle"
          >
            <Ionicons
              color={showMorePopover ? (light ? '#0F172A' : '#FFFFFF') : (light ? '#475569' : 'rgba(255,255,255,0.62)')}
              name="ellipsis-horizontal"
              size={16}
            />
            {isXiaosuan && (controller.pendingRemindersCount > 0 || (capsSupported && caps.hasOverrides)) && !showMorePopover ? (
              <View style={styles.moreAlertDot} />
            ) : null}
          </Pressable>

          <Pressable
            accessibilityLabel="关闭"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.ghostIconBtn, pressed && styles.pressed]}
            testID="control-voice-close"
          >
            <Ionicons color={light ? '#475569' : 'rgba(255,255,255,0.62)'} name="close" size={16} />
          </Pressable>
        </View>
      </View>

      {/* Role Switcher Popover (Anchored beneath left header) */}
      {showRolePopover ? (
        <View
          style={[
            styles.popover,
            styles.rolePopoverPos,
            light ? styles.popoverLight : styles.popoverDark,
            !light && WEB_GLASS_POPOVER,
          ]}
          testID="control-voice-role-popover"
        >
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
                    onPress={() => {
                      controller.setDutyProfile(prof.id);
                      controller.setOpenPopover('none');
                    }}
                    style={({ pressed }) => [
                      styles.popoverRow,
                      selected && (light ? styles.popoverRowActiveLight : styles.popoverRowActive),
                      pressed && styles.pressed,
                    ]}
                    testID={`control-voice-profile-${prof.id}`}
                  >
                    <Text style={[styles.popoverRowText, light && styles.inkLight, selected && styles.popoverRowTextActive]}>
                      {prof.name}
                    </Text>
                    {selected ? (
                      <Ionicons color={light ? '#1D4ED8' : '#63C795'} name="checkmark" size={14} />
                    ) : null}
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
                    onPress={() => {
                      controller.onSelectRole(opt.id);
                      controller.setOpenPopover('none');
                    }}
                    style={({ pressed }) => [
                      styles.popoverRow,
                      selected && (light ? styles.popoverRowActiveLight : styles.popoverRowActive),
                      pressed && styles.pressed,
                    ]}
                    testID={`control-voice-role-${opt.id}`}
                  >
                    <Text style={[styles.popoverRowText, light && styles.inkLight, selected && styles.popoverRowTextActive]}>
                      {opt.shortName}
                    </Text>
                    {selected ? (
                      <Ionicons color={light ? '#1D4ED8' : '#63C795'} name="checkmark" size={14} />
                    ) : null}
                  </Pressable>
                );
              })}
        </View>
      ) : null}

      {/* More Menu Popover (··· -> 长期记忆 · 日程提醒 · 能力与声音 · 清空对话) */}
      {showMorePopover ? (
        <View
          style={[
            styles.popover,
            styles.morePopoverPos,
            light ? styles.popoverLight : styles.popoverDark,
            !light && WEB_GLASS_POPOVER,
          ]}
          testID="control-voice-more-popover"
        >
          {isXiaosuan && modMemory ? (
            <Pressable
              accessibilityLabel="长期记忆"
              accessibilityRole="button"
              onPress={() => controller.setActiveTab('memory')}
              style={({ pressed }) => [
                styles.popoverRow,
                activeTab === 'memory' && (light ? styles.popoverRowActiveLight : styles.popoverRowActive),
                pressed && styles.pressed,
              ]}
              testID="control-voice-tab-memory"
            >
              <View style={styles.popoverRowLeft}>
                <Ionicons color={light ? '#334155' : 'rgba(255,255,255,0.72)'} name="bookmark-outline" size={14} />
                <Text style={[styles.popoverRowText, light && styles.inkLight]}>长期记忆</Text>
              </View>
              {totalMemoryCount > 0 ? (
                <View style={styles.popoverCountPill} testID="control-voice-memory-count">
                  <Text style={styles.popoverCountText}>{String(totalMemoryCount)}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {isXiaosuan && modInfoReminders ? (
            <Pressable
              accessibilityLabel="日程提醒"
              accessibilityRole="button"
              onPress={() => controller.setActiveTab('reminders')}
              style={({ pressed }) => [
                styles.popoverRow,
                activeTab === 'reminders' && (light ? styles.popoverRowActiveLight : styles.popoverRowActive),
                pressed && styles.pressed,
              ]}
              testID="control-voice-tab-reminders"
            >
              <View style={styles.popoverRowLeft}>
                <Ionicons color={light ? '#334155' : 'rgba(255,255,255,0.72)'} name="alarm-outline" size={14} />
                <Text style={[styles.popoverRowText, light && styles.inkLight]}>日程提醒</Text>
              </View>
              {controller.pendingRemindersCount > 0 ? (
                <View style={[styles.popoverCountPill, styles.popoverCountAmber]} testID="control-voice-reminders-badge">
                  <Text style={styles.popoverCountAmberText}>{String(controller.pendingRemindersCount)}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}

          {isXiaosuan ? (
            <Pressable
              accessibilityLabel="能力与声音"
              accessibilityRole="button"
              onPress={() => controller.setActiveTab('config')}
              style={({ pressed }) => [
                styles.popoverRow,
                activeTab === 'config' && (light ? styles.popoverRowActiveLight : styles.popoverRowActive),
                pressed && styles.pressed,
              ]}
              testID="control-voice-menu-config"
            >
              <View style={styles.popoverRowLeft}>
                <Ionicons color={light ? '#334155' : 'rgba(255,255,255,0.72)'} name="options-outline" size={14} />
                <Text style={[styles.popoverRowText, light && styles.inkLight]}>能力与声音</Text>
              </View>
              {capsSupported && caps.hasOverrides ? (
                <View style={styles.overrideDot} />
              ) : null}
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={controller.voiceReplyEnabled ? '关闭播报' : '开启播报'}
              accessibilityRole="switch"
              accessibilityState={{ checked: controller.voiceReplyEnabled }}
              onPress={() => {
                controller.onToggleVoiceReply();
                controller.setOpenPopover('none');
              }}
              style={({ pressed }) => [styles.popoverRow, pressed && styles.pressed]}
              testID="control-voice-tts-toggle"
            >
              <View style={styles.popoverRowLeft}>
                <Ionicons
                  color={light ? '#334155' : 'rgba(255,255,255,0.72)'}
                  name={controller.voiceReplyEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
                  size={14}
                />
                <Text style={[styles.popoverRowText, light && styles.inkLight]}>
                  {controller.voiceReplyEnabled ? '关闭播报' : '开启播报'}
                </Text>
              </View>
            </Pressable>
          )}

          <View style={[styles.popoverSep, light && styles.popoverSepLight]} />

          <Pressable
            accessibilityLabel="清空对话"
            accessibilityRole="button"
            disabled={controller.busy || disconnected}
            onPress={() => {
              controller.onResetConversation();
              controller.setOpenPopover('none');
            }}
            style={({ pressed }) => [
              styles.popoverRow,
              (controller.busy || disconnected) && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="control-voice-reset"
          >
            <View style={styles.popoverRowLeft}>
              <Ionicons color={light ? '#64748B' : 'rgba(255,255,255,0.52)'} name="trash-outline" size={14} />
              <Text style={[styles.popoverRowText, light && styles.mutedLight]}>清空对话</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* Floating Subtle Notice Toast */}
      {controller.noticeText ? (
        <View style={[styles.noticePill, light && styles.noticePillLight]} testID="control-voice-notice">
          <Text numberOfLines={1} style={[styles.noticeText, light && styles.inkLight]}>
            {controller.noticeText}
          </Text>
        </View>
      ) : null}

      {/* SUBVIEW: 能力与声音 */}
      {activeTab === 'config' && isXiaosuan ? (
        <ScrollView
          contentContainerStyle={styles.subviewContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={listStyle}
          testID="control-voice-config-view"
        >
          {capsSupported ? (
            <View style={styles.configBlock} testID="control-voice-drawer-capabilities-view">
              <View style={styles.configSectionHead}>
                <Text style={[styles.configSectionTitle, light && styles.mutedLight]}>能力开关</Text>
                {caps.hasOverrides ? (
                  <Pressable
                    accessibilityLabel="恢复默认"
                    accessibilityRole="button"
                    disabled={controller.capabilitiesBusy || disconnected}
                    onPress={controller.resetCapabilities}
                    style={({ pressed }) => [
                      styles.softPillBtn,
                      light && styles.softPillBtnLight,
                      (controller.capabilitiesBusy || disconnected) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-voice-cap-reset"
                  >
                    <Text style={[styles.softPillText, light && styles.mutedLight]}>恢复默认</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.capList}>
                {caps.moduleList.map(mod => {
                  if (mod.id === 'voice_walk' && !caps.modules.robot_control) return null;
                  const isSafetyLock = mod.safetyLock === true || mod.id === 'voice_walk';
                  const toggleLabel = isSafetyLock
                    ? (mod.enabled ? '已解锁' : '已锁定')
                    : (mod.enabled ? '已开' : '已关');
                  return (
                    <View
                      key={mod.id}
                      style={[
                        styles.capRow,
                        light && styles.glassRowLight,
                        isSafetyLock && styles.capSubRow,
                      ]}
                      testID={`control-voice-cap-row-${mod.id}`}
                    >
                      <View style={styles.capNameWrap}>
                        {isSafetyLock ? (
                          <Ionicons
                            color={mod.enabled ? '#E9B963' : (light ? '#64748B' : 'rgba(255,255,255,0.48)')}
                            name={mod.enabled ? 'lock-open-outline' : 'lock-closed-outline'}
                            size={13}
                          />
                        ) : null}
                        <Text style={[styles.capName, light && styles.inkLight]}>{mod.name}</Text>
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
                            styles.capToggleChip,
                            light && styles.softChipLight,
                            mod.enabled && (isSafetyLock ? styles.capToggleAmber : styles.capToggleGreen),
                            (controller.capabilitiesBusy || disconnected) && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                          testID={`control-voice-cap-toggle-${mod.id}`}
                        >
                          <Text
                            style={[
                              styles.capToggleText,
                              light && styles.mutedLight,
                              mod.enabled && (isSafetyLock ? styles.capToggleAmberText : styles.capToggleGreenText),
                            ]}
                          >
                            {toggleLabel}
                          </Text>
                        </Pressable>
                      ) : (
                        <View
                          style={[styles.capStatusBadge, light && styles.softChipLight]}
                          testID={`control-voice-cap-status-${mod.id}`}
                        >
                          <Text style={[styles.capStatusText, light && styles.mutedLight]}>
                            {mod.statusLabel || (mod.id === 'voice_walk' ? '需开控狗' : '未接硬件')}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.configBlock} testID="control-voice-drawer-style-view">
            <Text style={[styles.configSectionTitle, light && styles.mutedLight]}>声音与风格</Text>

            <View style={[styles.styleCard, light && styles.glassRowLight]}>
              <Text style={[styles.styleRowLabel, light && styles.mutedLight]}>音色</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
                        styles.softChip,
                        light && styles.softChipLight,
                        selected && (light ? styles.softChipActiveLight : styles.softChipActive),
                        pressed && styles.pressed,
                      ]}
                      testID={`control-voice-voice-${opt.id}`}
                    >
                      <Text
                        style={[
                          styles.softChipText,
                          light && styles.mutedLight,
                          selected && (light ? styles.softChipActiveTextLight : styles.softChipActiveText),
                        ]}
                      >
                        {opt.shortName}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            <View style={[styles.styleCard, light && styles.glassRowLight]}>
              <Text style={[styles.styleRowLabel, light && styles.mutedLight]}>音量</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
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
                        styles.softChip,
                        light && styles.softChipLight,
                        selected && (light ? styles.softChipActiveLight : styles.softChipActive),
                        pressed && styles.pressed,
                      ]}
                      testID={`control-voice-volume-${preset.value}`}
                    >
                      <Text
                        style={[
                          styles.softChipText,
                          light && styles.mutedLight,
                          selected && (light ? styles.softChipActiveTextLight : styles.softChipActiveText),
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
                    styles.softChip,
                    light && styles.softChipLight,
                    controller.quietMode && styles.capToggleAmber,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-style-quiet"
                >
                  <Text
                    style={[
                      styles.softChipText,
                      light && styles.mutedLight,
                      controller.quietMode && styles.capToggleAmberText,
                    ]}
                  >
                    {controller.quietMode ? '轻声开' : '轻声关'}
                  </Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </ScrollView>
      ) : activeTab === 'memory' && modMemory ? (
        /* SUBVIEW: 长期记忆 */
        <View style={styles.sectionWrap} testID="control-voice-memory-view">
          <View style={[styles.recessedSearch, light && styles.recessedLight]} testID="control-voice-memory-search-row">
            <Ionicons color={light ? '#64748B' : 'rgba(255,255,255,0.44)'} name="search-outline" size={13} />
            <TextInput
              accessibilityLabel="搜索记忆"
              onChangeText={controller.setMemoryQuery}
              placeholder="搜记忆…"
              placeholderTextColor={light ? '#94A3B8' : 'rgba(255,255,255,0.36)'}
              style={[styles.searchInput, light && styles.inkLight]}
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
                <Ionicons color={light ? '#64748B' : 'rgba(255,255,255,0.52)'} name="close-circle" size={14} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            contentContainerStyle={styles.chipRow}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
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
                    styles.softChip,
                    light && styles.softChipLight,
                    selected && (light ? styles.softChipActiveLight : styles.softChipActive),
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-memory-filter-${chip.key}`}
                >
                  <Text
                    style={[
                      styles.softChipText,
                      light && styles.mutedLight,
                      selected && (light ? styles.softChipActiveTextLight : styles.softChipActiveText),
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
              (disconnected || filteredMemories.length === 0) && styles.emptyCenterContent,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={listStyle}
            testID="control-voice-memory-list"
          >
            {disconnected ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.mutedLight]}>未连接</Text>
              </View>
            ) : controller.memoryLoading && filteredMemories.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.mutedLight]}>加载中…</Text>
              </View>
            ) : filteredMemories.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.mutedLight]}>
                  {normalizedQuery ? '无匹配项' : '暂无记忆'}
                </Text>
              </View>
            ) : (
              filteredMemories.map(item => {
                const itemBusy = controller.memoryBusyId === item.id;
                const canWriteItem = writableMemoryRooms.includes(item.room);
                const isEditing = canWriteItem && controller.editingMemoryId === item.id;

                if (isEditing) {
                  return (
                    <View
                      key={item.id}
                      style={[styles.glassRowEdit, light && styles.glassRowLight]}
                      testID={`control-voice-memory-editing-${item.id}`}
                    >
                      <View style={styles.editTopRow}>
                        <Pressable
                          accessibilityLabel={`分类 ${memoryRoomLabels[effectiveEditingMemoryRoom]}`}
                          accessibilityRole="button"
                          onPress={() => controller.setEditingMemoryRoom(getNextMemoryRoom(effectiveEditingMemoryRoom, writableMemoryRooms))}
                          style={({ pressed }) => [styles.softChip, light && styles.softChipLight, pressed && styles.pressed]}
                          testID="control-voice-memory-edit-room"
                        >
                          <Text style={[styles.softChipText, light && styles.mutedLight]}>
                            {memoryRoomLabels[effectiveEditingMemoryRoom]}
                          </Text>
                        </Pressable>
                        <TextInput
                          accessibilityLabel="编辑记忆内容"
                          maxLength={400}
                          onChangeText={controller.setEditingMemoryText}
                          onSubmitEditing={controller.onSaveEditMemory}
                          style={[styles.editInput, light && styles.inkLight]}
                          testID="control-voice-memory-edit-input"
                          value={controller.editingMemoryText}
                        />
                      </View>
                      <View style={styles.editBtnRow}>
                        <Pressable
                          accessibilityLabel="取消编辑"
                          accessibilityRole="button"
                          onPress={controller.onCancelEditMemory}
                          style={({ pressed }) => [styles.softPillBtn, light && styles.softPillBtnLight, pressed && styles.pressed]}
                          testID="control-voice-memory-edit-cancel"
                        >
                          <Text style={[styles.softPillText, light && styles.mutedLight]}>取消</Text>
                        </Pressable>
                        <Pressable
                          accessibilityLabel="保存记忆"
                          accessibilityRole="button"
                          disabled={!controller.editingMemoryText.trim()}
                          onPress={controller.onSaveEditMemory}
                          style={({ pressed }) => [
                            styles.primaryPillBtn,
                            !controller.editingMemoryText.trim() && styles.disabled,
                            pressed && styles.pressed,
                          ]}
                          testID="control-voice-memory-edit-save"
                        >
                          <Text style={styles.primaryPillText}>保存</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }

                return (
                  <View
                    key={item.id}
                    style={[styles.glassRow, light && styles.glassRowLight]}
                    testID={`control-voice-memory-item-${item.id}`}
                  >
                    <View style={styles.rowBody}>
                      <View style={[styles.roomTag, light && styles.softChipLight]}>
                        <Text style={[styles.roomTagText, light && styles.mutedLight]}>
                          {memoryRoomLabels[item.room]}
                        </Text>
                      </View>
                      <Text style={[styles.rowText, light && styles.inkLight]}>{item.text}</Text>
                    </View>
                    {canWriteItem ? (
                      <View style={styles.rowActions}>
                        <Pressable
                          accessibilityLabel={item.pinned ? '取消置顶' : '置顶'}
                          accessibilityRole="button"
                          accessibilityState={{ selected: item.pinned, disabled: itemBusy }}
                          disabled={itemBusy}
                          onPress={() => controller.onTogglePinMemory(item.id, !item.pinned)}
                          style={({ pressed }) => [styles.miniActionBtn, itemBusy && styles.disabled, pressed && styles.pressed]}
                          testID={`control-voice-memory-pin-${item.id}`}
                        >
                          <Ionicons
                            color={item.pinned ? '#E9B963' : (light ? '#94A3B8' : 'rgba(255,255,255,0.36)')}
                            name={item.pinned ? 'star' : 'star-outline'}
                            size={13}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="编辑"
                          accessibilityRole="button"
                          accessibilityState={{ disabled: itemBusy }}
                          disabled={itemBusy}
                          onPress={() => controller.onStartEditMemory(item)}
                          style={({ pressed }) => [styles.miniActionBtn, itemBusy && styles.disabled, pressed && styles.pressed]}
                          testID={`control-voice-memory-edit-${item.id}`}
                        >
                          <Ionicons color={light ? '#64748B' : 'rgba(255,255,255,0.48)'} name="create-outline" size={13} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel="删除"
                          accessibilityRole="button"
                          accessibilityState={{ disabled: itemBusy }}
                          disabled={itemBusy}
                          onPress={() => controller.onDeleteMemory(item.id)}
                          style={({ pressed }) => [styles.miniActionBtn, itemBusy && styles.disabled, pressed && styles.pressed]}
                          testID={`control-voice-memory-delete-${item.id}`}
                        >
                          <Ionicons color="#EF6B6E" name="trash-outline" size={13} />
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
            <View style={[styles.pillComposer, light && styles.recessedLight]} testID="control-voice-memory-add-bar">
              <Pressable
                accessibilityLabel={`分类 ${memoryRoomLabels[effectiveMemoryRoomDraft]}`}
                accessibilityRole="button"
                disabled={controller.memoryActionBusy || disconnected}
                onPress={() => controller.setMemoryRoomDraft(getNextMemoryRoom(effectiveMemoryRoomDraft, writableMemoryRooms))}
                style={({ pressed }) => [
                  styles.inlineTagBtn,
                  (controller.memoryActionBusy || disconnected) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-memory-room-select"
              >
                <Text style={[styles.inlineTagText, light && styles.mutedLight]}>
                  {memoryRoomLabels[effectiveMemoryRoomDraft]}
                </Text>
              </Pressable>

              <Pressable
                accessibilityLabel={controller.memoryPinOnAdd ? '取消默认置顶' : '添加并置顶'}
                accessibilityRole="switch"
                accessibilityState={{ checked: controller.memoryPinOnAdd, disabled: controller.memoryActionBusy || disconnected }}
                disabled={controller.memoryActionBusy || disconnected}
                onPress={controller.onToggleMemoryPinOnAdd}
                style={({ pressed }) => [styles.miniActionBtn, (controller.memoryActionBusy || disconnected) && styles.disabled, pressed && styles.pressed]}
                testID="control-voice-memory-add-pin"
              >
                <Ionicons
                  color={controller.memoryPinOnAdd ? '#E9B963' : (light ? '#64748B' : 'rgba(255,255,255,0.44)')}
                  name={controller.memoryPinOnAdd ? 'star' : 'star-outline'}
                  size={13}
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
                placeholderTextColor={light ? '#94A3B8' : 'rgba(255,255,255,0.36)'}
                returnKeyType="done"
                style={[styles.pillInput, light && styles.inkLight]}
                testID="control-voice-memory-input"
                value={controller.memoryDraft}
              />

              <Pressable
                accessibilityLabel="记住"
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAddMemory }}
                disabled={!canAddMemory}
                onPress={() => controller.onAddMemory(controller.memoryDraft, effectiveMemoryRoomDraft, controller.memoryPinOnAdd)}
                style={({ pressed }) => [styles.primaryPillBtn, !canAddMemory && styles.disabled, pressed && canAddMemory && styles.pressed]}
                testID="control-voice-memory-add"
              >
                <Text style={styles.primaryPillText}>记住</Text>
              </Pressable>
            </View>
          ) : null}

          {controller.memoryHasSessionContext ? (
            <View style={styles.memoryFooter}>
              {controller.memorySummary ? (
                <Text numberOfLines={1} style={[styles.summaryText, light && styles.mutedLight]} testID="control-voice-memory-summary">
                  {controller.memorySummary}
                </Text>
              ) : null}
              <Pressable
                accessibilityLabel="清空对话"
                accessibilityRole="button"
                disabled={controller.memoryActionBusy || disconnected}
                onPress={controller.onClearMemorySession}
                style={({ pressed }) => [styles.softPillBtn, light && styles.softPillBtnLight, (controller.memoryActionBusy || disconnected) && styles.disabled, pressed && styles.pressed]}
                testID="control-voice-memory-clear-session"
              >
                <Text style={[styles.softPillText, light && styles.mutedLight]}>清空对话</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : activeTab === 'reminders' && modInfoReminders ? (
        /* SUBVIEW: 日程提醒 */
        <View style={styles.sectionWrap} testID="control-voice-reminders-view">
          {isXiaosuan ? (
            <View style={[styles.glassRow, light && styles.glassRowLight]} testID="control-voice-timer-bar">
              {controller.activeTimer && controller.timerDisplayLabel ? (
                <>
                  <View style={styles.timerReadoutWrap}>
                    <Ionicons
                      color={controller.activeTimer.state === 'running' ? '#63C795' : '#E9B963'}
                      name="timer-outline"
                      size={14}
                    />
                    <Text style={[styles.timerReadoutText, light && styles.inkLight]} testID="control-voice-timer-readout">
                      {controller.timerDisplayLabel}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    {controller.activeTimer.state === 'running' ? (
                      <Pressable
                        accessibilityLabel="暂停计时"
                        accessibilityRole="button"
                        disabled={controller.timerBusy || disconnected}
                        onPress={controller.onPauseTimer}
                        style={({ pressed }) => [styles.softPillBtn, light && styles.softPillBtnLight, (controller.timerBusy || disconnected) && styles.disabled, pressed && styles.pressed]}
                        testID="control-voice-timer-pause"
                      >
                        <Text style={[styles.softPillText, light && styles.mutedLight]}>暂停</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        accessibilityLabel="继续计时"
                        accessibilityRole="button"
                        disabled={controller.timerBusy || disconnected}
                        onPress={controller.onResumeTimer}
                        style={({ pressed }) => [styles.primaryPillBtn, (controller.timerBusy || disconnected) && styles.disabled, pressed && styles.pressed]}
                        testID="control-voice-timer-resume"
                      >
                        <Text style={styles.primaryPillText}>继续</Text>
                      </Pressable>
                    )}
                    <Pressable
                      accessibilityLabel="结束计时"
                      accessibilityRole="button"
                      disabled={controller.timerBusy || disconnected}
                      onPress={controller.onCancelTimer}
                      style={({ pressed }) => [styles.softPillBtn, light && styles.softPillBtnLight, (controller.timerBusy || disconnected) && styles.disabled, pressed && styles.pressed]}
                      testID="control-voice-timer-cancel"
                    >
                      <Text style={[styles.softPillText, light && styles.mutedLight]}>结束</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.timerReadoutWrap}>
                    <Ionicons color={light ? '#334155' : 'rgba(255,255,255,0.72)'} name="timer-outline" size={14} />
                    <Text style={[styles.timerTitle, light && styles.inkLight]}>番茄钟</Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable
                      accessibilityLabel="25分钟专注"
                      accessibilityRole="button"
                      disabled={controller.timerBusy || disconnected}
                      onPress={() => controller.onStartTimer({ kind: 'pomodoro', durationSec: 1500, label: '专注', autoQuiet: true })}
                      style={({ pressed }) => [styles.primaryPillBtn, (controller.timerBusy || disconnected) && styles.disabled, pressed && styles.pressed]}
                      testID="control-voice-timer-start-pomodoro"
                    >
                      <Text style={styles.primaryPillText}>25分钟专注</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="5分钟倒计时"
                      accessibilityRole="button"
                      disabled={controller.timerBusy || disconnected}
                      onPress={() => controller.onStartTimer({ kind: 'countdown', durationSec: 300, label: '倒计时' })}
                      style={({ pressed }) => [styles.softPillBtn, light && styles.softPillBtnLight, (controller.timerBusy || disconnected) && styles.disabled, pressed && styles.pressed]}
                      testID="control-voice-timer-start-5m"
                    >
                      <Text style={[styles.softPillText, light && styles.mutedLight]}>5分钟</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={styles.chipRow}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
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
                    styles.softChip,
                    light && styles.softChipLight,
                    selected && (light ? styles.softChipActiveLight : styles.softChipActive),
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-reminder-chip-${chip.expr}`}
                >
                  <Text
                    style={[
                      styles.softChipText,
                      light && styles.mutedLight,
                      selected && (light ? styles.softChipActiveTextLight : styles.softChipActiveText),
                    ]}
                  >
                    {chip.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView
            contentContainerStyle={styles.chipRow}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
            style={styles.filterScroll}
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
                    styles.softChip,
                    light && styles.softChipLight,
                    selected && (light ? styles.softChipActiveLight : styles.softChipActive),
                    pressed && styles.pressed,
                  ]}
                  testID={`control-voice-reminder-repeat-${opt.key || 'once'}`}
                >
                  <Text
                    style={[
                      styles.softChipText,
                      light && styles.mutedLight,
                      selected && (light ? styles.softChipActiveTextLight : styles.softChipActiveText),
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
              (disconnected || controller.reminders.length === 0) && styles.emptyCenterContent,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={listStyle}
            testID="control-voice-reminders-list"
          >
            {disconnected ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.mutedLight]}>未连接</Text>
              </View>
            ) : controller.remindersLoading && controller.reminders.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.mutedLight]}>加载中…</Text>
              </View>
            ) : controller.reminders.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={[styles.emptyHint, light && styles.mutedLight]}>暂无提醒</Text>
              </View>
            ) : (
              controller.reminders.map(item => {
                const itemBusy = controller.remindersBusyId === item.id;
                const repeatLabel = item.repeat ? REMINDER_REPEAT_LABELS[item.repeat] : '';
                return (
                  <View
                    key={item.id}
                    style={[styles.glassRow, light && styles.glassRowLight]}
                    testID={`control-voice-reminder-item-${item.id}`}
                  >
                    <View style={styles.rowBody}>
                      <View style={[styles.roomTag, styles.reminderTimeTag]}>
                        <Text style={styles.reminderTimeText}>{formatReminderTimeLabel(item)}</Text>
                      </View>
                      {repeatLabel ? (
                        <View
                          style={[styles.roomTag, light && styles.softChipLight]}
                          testID={`control-voice-reminder-repeat-badge-${item.id}`}
                        >
                          <Text style={[styles.roomTagText, light && styles.mutedLight]}>{repeatLabel}</Text>
                        </View>
                      ) : null}
                      <Text style={[styles.rowText, light && styles.inkLight]}>{item.content}</Text>
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable
                        accessibilityLabel="延后10分钟"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: itemBusy }}
                        disabled={itemBusy}
                        onPress={() => controller.onSnoozeReminder(item.id, 10)}
                        style={({ pressed }) => [styles.softPillBtn, light && styles.softPillBtnLight, itemBusy && styles.disabled, pressed && styles.pressed]}
                        testID={`control-voice-reminder-snooze-${item.id}`}
                      >
                        <Text style={[styles.softPillText, light && styles.mutedLight]}>延后</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="删除提醒"
                        accessibilityRole="button"
                        accessibilityState={{ disabled: itemBusy }}
                        disabled={itemBusy}
                        onPress={() => controller.onDeleteReminder(item.id)}
                        style={({ pressed }) => [styles.miniActionBtn, itemBusy && styles.disabled, pressed && styles.pressed]}
                        testID={`control-voice-reminder-delete-${item.id}`}
                      >
                        <Ionicons color="#EF6B6E" name="trash-outline" size={13} />
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

          <View style={[styles.pillComposer, light && styles.recessedLight]} testID="control-voice-reminder-add-bar">
            <TextInput
              accessibilityLabel="提醒时间"
              editable={!disconnected && !controller.remindersActionBusy}
              maxLength={32}
              onChangeText={controller.setReminderTimeDraft}
              placeholder="时间"
              placeholderTextColor={light ? '#94A3B8' : 'rgba(255,255,255,0.36)'}
              style={[styles.reminderTimeInput, light && styles.inkLight]}
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
              placeholderTextColor={light ? '#94A3B8' : 'rgba(255,255,255,0.36)'}
              returnKeyType="done"
              style={[styles.pillInput, light && styles.inkLight]}
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
              style={({ pressed }) => [styles.primaryPillBtn, !canAddReminder && styles.disabled, pressed && canAddReminder && styles.pressed]}
              testID="control-voice-reminder-add"
            >
              <Text style={styles.primaryPillText}>添加</Text>
            </Pressable>
          </View>
        </View>
      ) : isOffline && controller.messages.length === 0 ? (
        /* CLEAN OFFLINE STATE */
        <View style={styles.offlineCenter} testID="control-voice-empty-state">
          {renderMiniBotHead({
            offline: true,
            listening: false,
            thinking: false,
            speaking: false,
            emotion: 'sleepy',
            light,
          })}
          <Text style={[styles.offlineTitle, light && styles.inkLight]}>
            {disconnected ? '未连接' : '未就绪'}
          </Text>
          <Pressable
            accessibilityLabel="重试连接"
            accessibilityRole="button"
            onPress={controller.onRetryConnect}
            style={({ pressed }) => [styles.retryPillBtn, light && styles.softPillBtnLight, pressed && styles.pressed]}
            testID="control-voice-retry"
          >
            <Text style={[styles.retryPillText, light && styles.inkLight]}>重试</Text>
          </Pressable>
        </View>
      ) : (
        /* MAIN CHAT VIEW */
        <View style={styles.chatBodyWrap}>
          {/* Live Motion Progress Strip */}
          {activeMove && activeMoveReadout ? (
            <View style={styles.moveStrip} testID="control-voice-move-bar">
              <View style={styles.moveStripTop}>
                <View style={styles.moveStripLeft}>
                  <View style={styles.movePulseDot} />
                  <Text numberOfLines={1} style={styles.moveStripLabel} testID="control-voice-move-readout">
                    {activeMoveReadout}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="刹停"
                  accessibilityRole="button"
                  onPress={controller.onBrakeMove}
                  style={({ pressed }) => [styles.moveBrakeBtn, pressed && styles.pressed]}
                  testID="control-voice-move-brake"
                >
                  <Text style={styles.moveBrakeText}>刹停</Text>
                </Pressable>
              </View>
              <View style={styles.moveTrack}>
                <View style={[styles.moveFill, { width: `${Math.max(6, Math.round(activeMove.progress * 100))}%` }]} />
              </View>
            </View>
          ) : null}

          {/* Borderless Continuous Glass Message Stream */}
          <ScrollView
            ref={node => { scrollNode = node; }}
            contentContainerStyle={[
              styles.messageContent,
              controller.messages.length === 0 && controller.pendingApprovals.length === 0 && styles.emptyCenterContent,
            ]}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => { scrollNode?.scrollToEnd({ animated: true }); }}
            showsVerticalScrollIndicator={false}
            style={listStyle}
            testID="control-voice-messages"
          >
            {controller.messages.length === 0 && controller.pendingApprovals.length === 0 ? (
              <View style={styles.emptyWrap} testID="control-voice-empty-state">
                <Text style={[styles.emptyHint, light && styles.mutedLight]}>
                  {controller.speechSupported || isXiaosuan ? '按住左下角直接说，或在此输入' : '输入消息'}
                </Text>
              </View>
            ) : null}

            {controller.messages.map(message => {
              if (message.role === 'tool') {
                return (
                  <View key={message.id} style={styles.toolRow}>
                    <View style={styles.toolDot} />
                    <Text numberOfLines={1} style={[styles.toolText, light && styles.mutedLight]}>
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
                      isUser ? styles.bubbleUser : styles.bubbleAssistant,
                      isUser && light && styles.bubbleUserLight,
                    ]}
                  >
                    {!isUser && message.tools && message.tools.length > 0 ? (
                      <View style={styles.inlineToolRow}>
                        {message.tools.map((toolLabel, idx) => (
                          <View
                            key={`${message.id}-tool-${idx}`}
                            style={[styles.inlineToolChip, light && styles.softChipLight]}
                            testID={`control-voice-tool-chip-${message.id}-${idx}`}
                          >
                            <View style={styles.toolDot} />
                            <Text style={[styles.inlineToolText, light && styles.mutedLight]}>{toolLabel}</Text>
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
                              : message.source === 'reminder'
                                ? styles.sourceBadgeReminder
                                : styles.sourceBadgeSoft,
                          ]}
                          testID={`control-voice-source-${message.id}`}
                        >
                          <Text
                            style={[
                              styles.sourceBadgeText,
                              message.source === 'broadcast'
                                ? styles.sourceBadgeTextBroadcast
                                : message.source === 'reminder'
                                  ? styles.sourceBadgeTextReminder
                                  : styles.sourceBadgeTextSoft,
                            ]}
                          >
                            {sourceBadge}
                          </Text>
                        </View>
                      ) : null}
                      {message.speakerId ? (
                        <View style={[styles.sourceBadge, styles.sourceBadgeSoft]} testID={`control-voice-speaker-${message.id}`}>
                          <Text style={[styles.sourceBadgeText, styles.sourceBadgeTextSoft]}>
                            {message.speakerId}
                          </Text>
                        </View>
                      ) : null}
                      <Text
                        style={[
                          styles.bubbleText,
                          isUser
                            ? (light ? styles.inkLight : styles.bubbleTextUser)
                            : (light ? styles.inkLight : styles.bubbleTextAssistant),
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
                            style={({ pressed }) => [styles.softChip, light && styles.softChipLight, pressed && styles.pressed]}
                          >
                            <Text style={[styles.softChipText, light && styles.inkLight]}>{choice}</Text>
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
                  style={[styles.approvalCard, light && styles.glassRowLight]}
                  testID={`control-voice-approval-${approval.approvalId}`}
                >
                  <View style={styles.approvalInfo}>
                    <Ionicons color="#E9B963" name="shield-checkmark-outline" size={14} />
                    <Text numberOfLines={1} style={[styles.approvalTitle, light && styles.inkLight]}>
                      {approval.summaryText}
                    </Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable
                      accessibilityLabel="拒绝"
                      accessibilityRole="button"
                      disabled={deciding}
                      onPress={() => controller.onDecideApproval(approval.approvalId, false)}
                      style={({ pressed }) => [styles.softPillBtn, light && styles.softPillBtnLight, deciding && styles.disabled, pressed && styles.pressed]}
                      testID={`control-voice-reject-${approval.approvalId}`}
                    >
                      <Text style={[styles.softPillText, light && styles.mutedLight]}>拒绝</Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel="允许"
                      accessibilityRole="button"
                      disabled={deciding}
                      onPress={() => controller.onDecideApproval(approval.approvalId, true)}
                      style={({ pressed }) => [styles.primaryPillBtn, deciding && styles.disabled, pressed && styles.pressed]}
                      testID={`control-voice-approve-${approval.approvalId}`}
                    >
                      <Text style={styles.primaryPillText}>允许</Text>
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

          {/* Quick Actions Upward Popover (+ -> 传话 · 早报 · 动态快捷指令) */}
          {showQuickPopover && hasQuickActions ? (
            <View
              style={[
                styles.popover,
                styles.quickPopoverPos,
                light ? styles.popoverLight : styles.popoverDark,
                !light && WEB_GLASS_POPOVER,
              ]}
              testID="control-voice-quick-rail"
            >
              {isXiaosuan ? (
                <Pressable
                  accessibilityLabel={controller.broadcastMode ? '关闭传话模式' : '开启传话模式'}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: controller.broadcastMode, disabled: disconnected || controller.busy }}
                  disabled={disconnected || controller.busy}
                  onPress={() => {
                    controller.onToggleBroadcastMode();
                    controller.setOpenPopover('none');
                  }}
                  style={({ pressed }) => [
                    styles.popoverRow,
                    controller.broadcastMode && styles.popoverRowAmber,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-broadcast-toggle"
                >
                  <View style={styles.popoverRowLeft}>
                    <Ionicons
                      color={controller.broadcastMode ? '#E9B963' : (light ? '#475569' : 'rgba(255,255,255,0.68)')}
                      name="megaphone-outline"
                      size={14}
                    />
                    <Text style={[styles.popoverRowText, light && styles.inkLight, controller.broadcastMode && styles.capToggleAmberText]}>
                      {controller.broadcastMode ? '退出传话' : '传话播报'}
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              {showQuickBriefing ? (
                <Pressable
                  accessibilityLabel="早报"
                  accessibilityRole="button"
                  disabled={controller.actionRailBusy}
                  onPress={() => {
                    controller.onRunBriefing();
                    controller.setOpenPopover('none');
                  }}
                  style={({ pressed }) => [styles.popoverRow, controller.actionRailBusy && styles.disabled, pressed && styles.pressed]}
                  testID="control-voice-quick-briefing"
                >
                  <View style={styles.popoverRowLeft}>
                    <Ionicons color={light ? '#475569' : 'rgba(255,255,255,0.68)'} name="sunny-outline" size={14} />
                    <Text style={[styles.popoverRowText, light && styles.inkLight]}>今日早报</Text>
                  </View>
                </Pressable>
              ) : null}

              {quickPrompts.length > 0 ? (
                <View style={styles.quickPopoverChips}>
                  {quickPrompts.map(prompt => (
                    <Pressable
                      key={prompt}
                      accessibilityLabel={prompt}
                      accessibilityRole="button"
                      disabled={controller.busy}
                      onPress={() => {
                        controller.onSubmit(prompt);
                        controller.setOpenPopover('none');
                      }}
                      style={({ pressed }) => [
                        styles.softChip,
                        light && styles.softChipLight,
                        controller.busy && styles.disabled,
                        pressed && styles.pressed,
                      ]}
                      testID={`control-voice-quick-${prompt}`}
                    >
                      <Text style={[styles.softChipText, light && styles.inkLight]}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Walk Safety Lock Upward Popover */}
          {showWalkPopover ? (
            <View
              style={[
                styles.popover,
                styles.walkPopoverPos,
                light ? styles.popoverLight : styles.popoverDark,
                !light && WEB_GLASS_POPOVER,
              ]}
              testID="control-voice-walk-popover"
            >
              <Pressable
                accessibilityLabel={modVoiceWalk ? '锁定语音走动' : '解锁语音走动'}
                accessibilityRole="switch"
                accessibilityState={{ checked: modVoiceWalk, disabled: controller.capabilitiesBusy || disconnected }}
                disabled={controller.capabilitiesBusy || disconnected}
                onPress={() => {
                  controller.setCapabilityEnabled('voice_walk', !modVoiceWalk);
                  controller.setOpenPopover('none');
                }}
                style={({ pressed }) => [
                  styles.popoverRow,
                  modVoiceWalk && styles.popoverRowAmber,
                  pressed && styles.pressed,
                ]}
                testID="control-voice-walk-quick-toggle"
              >
                <View style={styles.popoverRowLeft}>
                  <Ionicons
                    color={modVoiceWalk ? '#E9B963' : '#63C795'}
                    name={modVoiceWalk ? 'lock-closed-outline' : 'lock-open-outline'}
                    size={14}
                  />
                  <Text style={[styles.popoverRowText, light && styles.inkLight]}>
                    {modVoiceWalk ? '立即锁定走动' : '临时允许走动'}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}

          {/* Floating Recessed Pill Composer + Quiet Micro-Row */}
          <View style={styles.composerWrap}>
            <View style={[styles.pillComposer, light && styles.recessedLight]}>
              {controller.broadcastMode && isXiaosuan ? (
                <Pressable
                  accessibilityLabel="退出传话"
                  accessibilityRole="button"
                  onPress={controller.onToggleBroadcastMode}
                  style={({ pressed }) => [styles.broadcastInlineTag, pressed && styles.pressed]}
                  testID="control-voice-broadcast-active-tag"
                >
                  <Text style={styles.broadcastInlineTagText}>传话</Text>
                </Pressable>
              ) : null}

              <TextInput
                accessibilityLabel={controller.broadcastMode ? '输入传话' : '与小算对话'}
                editable={!disconnected && !controller.busy}
                maxLength={1000}
                onChangeText={controller.setDraft}
                onSubmitEditing={() => {
                  if (canSend) controller.onSubmit();
                }}
                placeholder={
                  controller.listening
                    ? '聆听中…'
                    : controller.broadcastMode
                      ? '输入传话…'
                      : isXiaosuan
                        ? '与小算对话…'
                        : '输入消息…'
                }
                placeholderTextColor={light ? '#94A3B8' : 'rgba(255,255,255,0.38)'}
                returnKeyType="send"
                style={[styles.pillInput, light && styles.inkLight]}
                testID="control-voice-input"
                value={controller.draft}
              />

              {showInlineMic ? (
                <Pressable
                  accessibilityLabel={controller.listening ? '结束说话' : '语音输入'}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: disconnected || controller.busy, selected: controller.listening }}
                  disabled={disconnected || controller.busy}
                  onPress={controller.onToggleListening}
                  style={({ pressed }) => [
                    styles.inlineMicBtn,
                    controller.listening && styles.inlineMicBtnActive,
                    (disconnected || controller.busy) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-mic-btn"
                >
                  <Ionicons
                    color={controller.listening ? '#FFFFFF' : (light ? '#475569' : 'rgba(255,255,255,0.68)')}
                    name={controller.listening ? 'radio-button-on' : 'mic-outline'}
                    size={15}
                  />
                </Pressable>
              ) : null}

              {controller.canStop ? (
                <Pressable
                  accessibilityLabel="停止"
                  accessibilityRole="button"
                  onPress={controller.onCancelTurn}
                  style={({ pressed }) => [styles.stopCircleBtn, pressed && styles.pressed]}
                  testID="control-voice-stop-btn"
                >
                  <Ionicons color="#FFFFFF" name="stop" size={13} />
                </Pressable>
              ) : (
                <Pressable
                  accessibilityLabel={controller.broadcastMode ? '传话' : '发送'}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canSend }}
                  disabled={!canSend}
                  onPress={() => controller.onSubmit()}
                  style={({ pressed }) => [
                    styles.sendCircleBtn,
                    controller.broadcastMode && styles.sendCircleBroadcast,
                    !canSend && styles.sendCircleDisabled,
                    pressed && canSend && styles.pressed,
                  ]}
                  testID="control-voice-send-btn"
                >
                  <Ionicons
                    color={controller.broadcastMode ? '#FFFFFF' : !canSend ? 'rgba(255,255,255,0.35)' : '#121318'}
                    name={controller.broadcastMode ? 'megaphone-outline' : 'arrow-up'}
                    size={14}
                  />
                </Pressable>
              )}
            </View>

            {/* Quiet Micro-Row: [+] [🛡 走动已锁 ▾] ....... [🌙] */}
            <View style={styles.microBar}>
              <View style={styles.microLeft}>
                {hasQuickActions && !disconnected ? (
                  <Pressable
                    accessibilityLabel="快捷操作"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showQuickPopover }}
                    onPress={() => controller.togglePopover('quick')}
                    style={({ pressed }) => [
                      styles.microGhostBtn,
                      showQuickPopover && (light ? styles.ghostBtnActiveLight : styles.ghostBtnActive),
                      pressed && styles.pressed,
                    ]}
                    testID="control-voice-quick-toggle"
                  >
                    <Ionicons
                      color={showQuickPopover ? (light ? '#0F172A' : '#FFFFFF') : (light ? '#475569' : 'rgba(255,255,255,0.58)')}
                      name="add"
                      size={16}
                    />
                  </Pressable>
                ) : null}

                {capsSupported && modRobotControl ? (
                  <Pressable
                    accessibilityLabel={modVoiceWalk ? '走动已开' : '走动已锁'}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showWalkPopover }}
                    disabled={disconnected}
                    onPress={() => controller.togglePopover('walk')}
                    style={({ pressed }) => [
                      styles.walkShieldBtn,
                      modVoiceWalk && styles.walkShieldActive,
                      disconnected && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                    testID="control-voice-walk-shield"
                  >
                    <Ionicons
                      color={modVoiceWalk ? '#E9B963' : '#63C795'}
                      name={modVoiceWalk ? 'shield-outline' : 'shield-checkmark-outline'}
                      size={12}
                    />
                    <Text
                      style={[
                        styles.walkShieldText,
                        light && styles.mutedLight,
                        modVoiceWalk && styles.walkShieldTextActive,
                      ]}
                    >
                      {modVoiceWalk ? '走动已开' : '走动已锁'}
                    </Text>
                    <Ionicons
                      color={modVoiceWalk ? '#E9B963' : (light ? '#64748B' : 'rgba(255,255,255,0.40)')}
                      name="chevron-down"
                      size={11}
                    />
                  </Pressable>
                ) : null}
              </View>

              {isXiaosuan ? (
                <Pressable
                  accessibilityLabel={controller.quietMode ? '关闭轻声模式' : '开启轻声模式'}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: controller.quietMode, disabled: disconnected || controller.hardwareBusy }}
                  disabled={disconnected || controller.hardwareBusy}
                  onPress={controller.onToggleQuietMode}
                  style={({ pressed }) => [
                    styles.microGhostBtn,
                    controller.quietMode && styles.quietIconActive,
                    (disconnected || controller.hardwareBusy) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                  testID="control-voice-quiet-toggle"
                >
                  <Ionicons
                    color={controller.quietMode ? '#E9B963' : (light ? '#475569' : 'rgba(255,255,255,0.52)')}
                    name={controller.quietMode ? 'moon' : 'moon-outline'}
                    size={14}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    overflow: 'visible',
  },
  shellWing: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: 'rgba(14, 15, 18, 0.44)',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 0,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  shellCardDark: {
    borderRadius: 18,
    backgroundColor: 'rgba(16, 17, 21, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },
  shellCardLight: {
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 14,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingBottom: 6,
  },
  titleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  subviewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  ghostBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  subviewTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#F4F4F6',
  },
  roleTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingLeft: 2,
    paddingRight: 7,
    borderRadius: 999,
    flexShrink: 1,
    minWidth: 0,
  },
  miniBotHead: {
    width: 22,
    height: 20,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniBotEyesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
  },
  brandName: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flexShrink: 0,
  },
  headerDividerDot: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.28)',
  },
  roleLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.66)',
    fontWeight: '500',
    flexShrink: 1,
  },
  overrideDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E9B963',
  },
  whisperStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  statusDotCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  whisperStatusText: {
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255, 255, 255, 0.56)',
    fontWeight: '500',
  },
  headerRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  ghostIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ghostBtnActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  ghostBtnActiveLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  ghostBtnLight: {
    backgroundColor: 'transparent',
  },
  moreAlertDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E9B963',
  },

  /* Popovers */
  popover: {
    position: 'absolute',
    zIndex: 45,
    borderRadius: 14,
    padding: 5,
    gap: 2,
    minWidth: 152,
  },
  popoverDark: {
    backgroundColor: 'rgba(18, 19, 24, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  popoverLight: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
  },
  rolePopoverPos: {
    top: 42,
    left: 14,
    width: 162,
  },
  morePopoverPos: {
    top: 42,
    right: 14,
    width: 168,
  },
  quickPopoverPos: {
    bottom: 86,
    left: 0,
    right: 0,
  },
  walkPopoverPos: {
    bottom: 34,
    left: 28,
    width: 164,
  },
  popoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  popoverRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  popoverRowActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  popoverRowActiveLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  popoverRowAmber: {
    backgroundColor: 'rgba(233, 185, 99, 0.16)',
  },
  popoverRowText: {
    fontSize: 12.5,
    lineHeight: 16,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '500',
  },
  popoverRowTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  popoverCountPill: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popoverCountText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.86)',
  },
  popoverCountAmber: {
    backgroundColor: 'rgba(233, 185, 99, 0.22)',
  },
  popoverCountAmberText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#E9B963',
  },
  popoverSep: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginVertical: 2,
    marginHorizontal: 6,
  },
  popoverSepLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  quickPopoverChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 6,
    paddingTop: 4,
    paddingBottom: 4,
  },

  /* Notice & Offline */
  noticePill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 4,
  },
  noticePillLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.07)',
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#F4F4F6',
    fontWeight: '500',
  },
  offlineCenter: {
    flex: 1,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  offlineTitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.68)',
    fontWeight: '500',
  },
  retryPillBtn: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  retryPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  /* Chat Body & Active Move Strip */
  chatBodyWrap: {
    flex: 1,
    position: 'relative',
    justifyContent: 'space-between',
    gap: 6,
  },
  moveStrip: {
    borderRadius: 12,
    backgroundColor: 'rgba(233, 185, 99, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
  },
  moveStripTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  moveStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  movePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E9B963',
  },
  moveStripLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FDE68A',
    fontVariant: ['tabular-nums'],
  },
  moveBrakeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(239, 107, 110, 0.24)',
  },
  moveBrakeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FCA5A5',
  },
  moveTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    overflow: 'hidden',
  },
  moveFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#E9B963',
  },

  wingScroll: {
    flex: 1,
  },
  cardScroll: {
    flexGrow: 0,
  },
  messageContent: {
    gap: 10,
    paddingVertical: 4,
  },
  emptyCenterContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255, 255, 255, 0.42)',
    textAlign: 'center',
  },
  bubbleRow: {
    width: '100%',
  },
  bubbleRowUser: {
    alignItems: 'flex-end',
  },
  bubbleRowAssistant: {
    alignItems: 'flex-start',
  },
  bubbleUser: {
    maxWidth: '84%',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.13)',
  },
  bubbleUserLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  bubbleAssistant: {
    maxWidth: '94%',
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 5,
  },
  bubbleBodyLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 5,
  },
  bubbleText: {
    fontSize: 13,
    lineHeight: 19.5,
  },
  bubbleTextUser: {
    color: '#F8F8FA',
  },
  bubbleTextAssistant: {
    color: 'rgba(255, 255, 255, 0.94)',
  },
  inlineToolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  inlineToolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  inlineToolText: {
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255, 255, 255, 0.72)',
    fontWeight: '500',
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
  },
  toolDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#63C795',
  },
  toolText: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.62)',
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
  },
  sourceBadgeSoft: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  sourceBadgeBroadcast: {
    backgroundColor: 'rgba(233, 185, 99, 0.24)',
  },
  sourceBadgeReminder: {
    backgroundColor: 'rgba(99, 199, 149, 0.22)',
  },
  sourceBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sourceBadgeTextSoft: {
    color: 'rgba(255, 255, 255, 0.86)',
  },
  sourceBadgeTextBroadcast: {
    color: '#FDE68A',
  },
  sourceBadgeTextReminder: {
    color: '#A7F3D0',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  approvalCard: {
    borderRadius: 13,
    backgroundColor: 'rgba(233, 185, 99, 0.12)',
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 8,
  },
  approvalInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  approvalTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#FFFFFF',
    flexShrink: 1,
  },

  /* Composer & Micro Row */
  composerWrap: {
    gap: 6,
    paddingTop: 2,
  },
  pillComposer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.085)',
    paddingLeft: 12,
    paddingRight: 5,
    paddingVertical: 4,
    minHeight: 38,
  },
  recessedLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  pillInput: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    color: '#FFFFFF',
    paddingVertical: 4,
    minWidth: 40,
  },
  broadcastInlineTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(233, 185, 99, 0.24)',
  },
  broadcastInlineTagText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FDE68A',
  },
  inlineMicBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineMicBtnActive: {
    backgroundColor: '#63C795',
  },
  sendCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F6',
  },
  sendCircleBroadcast: {
    backgroundColor: '#D97706',
  },
  sendCircleDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  stopCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF6B6E',
  },
  microBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  microLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  microGhostBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quietIconActive: {
    backgroundColor: 'rgba(233, 185, 99, 0.16)',
  },
  walkShieldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  walkShieldActive: {
    backgroundColor: 'rgba(233, 185, 99, 0.16)',
  },
  walkShieldText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: 'rgba(255, 255, 255, 0.62)',
    fontWeight: '500',
  },
  walkShieldTextActive: {
    color: '#FDE68A',
    fontWeight: '600',
  },

  /* Subviews (Memory, Reminders, Config) */
  sectionWrap: {
    flex: 1,
    gap: 7,
  },
  subviewContent: {
    gap: 12,
    paddingBottom: 6,
  },
  configBlock: {
    gap: 7,
  },
  configSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  configSectionTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.50)',
    paddingHorizontal: 2,
  },
  capList: {
    gap: 6,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.065)',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  capSubRow: {
    marginLeft: 12,
  },
  capNameWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  capName: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#F4F4F6',
  },
  capToggleChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  capToggleGreen: {
    backgroundColor: 'rgba(99, 199, 149, 0.22)',
  },
  capToggleAmber: {
    backgroundColor: 'rgba(233, 185, 99, 0.22)',
  },
  capToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.68)',
  },
  capToggleGreenText: {
    color: '#A7F3D0',
  },
  capToggleAmberText: {
    color: '#FDE68A',
  },
  capStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  capStatusText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.45)',
    fontWeight: '500',
  },
  styleCard: {
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.065)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  styleRowLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.52)',
  },
  recessedSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingHorizontal: 10,
    height: 32,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#FFFFFF',
    paddingVertical: 2,
  },
  clearSearchBtn: {
    padding: 2,
  },
  filterScroll: {
    flexGrow: 0,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  softChip: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  softChipLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  softChipActive: {
    backgroundColor: '#F4F4F6',
  },
  softChipActiveLight: {
    backgroundColor: '#1E293B',
  },
  softChipText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: 'rgba(255, 255, 255, 0.78)',
    fontWeight: '500',
  },
  softChipActiveText: {
    color: '#121318',
    fontWeight: '600',
  },
  softChipActiveTextLight: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    gap: 6,
    paddingVertical: 2,
  },
  glassRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.065)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  glassRowLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  glassRowEdit: {
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    padding: 9,
    gap: 7,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  rowText: {
    fontSize: 12.5,
    lineHeight: 17.5,
    color: 'rgba(255, 255, 255, 0.90)',
    flexShrink: 1,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  miniActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  roomTagText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.72)',
  },
  reminderTimeTag: {
    backgroundColor: 'rgba(99, 199, 149, 0.18)',
  },
  reminderTimeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#A7F3D0',
  },
  editTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#FFFFFF',
    paddingVertical: 4,
  },
  editBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  inlineTagBtn: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  inlineTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.78)',
  },
  reminderTimeInput: {
    width: 68,
    fontSize: 12,
    color: '#FFFFFF',
    paddingVertical: 4,
  },
  softPillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
  },
  softPillBtnLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
  },
  softPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.78)',
  },
  primaryPillBtn: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F4F4F6',
  },
  primaryPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#121318',
  },
  memoryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 2,
  },
  summaryText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.50)',
  },
  timerReadoutWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerTitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#F4F4F6',
  },
  timerReadoutText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    fontSize: 11.5,
    color: '#FCA5A5',
    paddingHorizontal: 4,
  },
  inkLight: {
    color: '#0F172A',
  },
  mutedLight: {
    color: '#475569',
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.74,
  },
});
