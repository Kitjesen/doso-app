import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text, TextInput } from './AppText';
import type { RobotVoiceController } from '../features/control/useRobotVoiceChat';

const QUICK_PROMPTS = ['查看状态', '观察周围', '你能做什么'] as const;

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

  const statusDotColor =
    controller.phase === 'listening'
      ? '#22C55E'
      : controller.phase === 'thinking' || controller.phase === 'connecting'
        ? '#60A5FA'
        : controller.phase === 'awaiting'
          ? '#F59E0B'
          : controller.phase === 'ready'
            ? '#22C55E'
            : '#94A3B8';

  const canSend = Boolean(controller.draft.trim()) && !controller.busy && controller.phase !== 'disconnected';

  return (
    <View
      style={[
        styles.card,
        light ? styles.cardLight : styles.cardDark,
      ]}
      testID="control-hud-voice-panel"
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons color={light ? '#1D4ED8' : '#93C5FD'} name="chatbubble-ellipses-outline" size={16} />
          <Text style={[styles.title, light && styles.titleLight]}>语音对话</Text>
          <View style={[styles.statusBadge, light && styles.statusBadgeLight]}>
            <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
            <Text style={[styles.statusText, light && styles.statusTextLight]} testID="control-voice-status">
              {controller.statusLabel}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel={controller.voiceReplyEnabled ? '关闭语音播报' : '开启语音播报'}
            accessibilityRole="button"
            accessibilityState={{ selected: controller.voiceReplyEnabled }}
            onPress={controller.onToggleVoiceReply}
            style={({ pressed }) => [
              styles.iconBtn,
              light && styles.iconBtnLight,
              controller.voiceReplyEnabled && styles.iconBtnActive,
              pressed && styles.pressed,
            ]}
            testID="control-voice-tts-toggle"
          >
            <Ionicons
              color={controller.voiceReplyEnabled ? '#93C5FD' : (light ? '#64748B' : '#94A3B8')}
              name={controller.voiceReplyEnabled ? 'volume-high-outline' : 'volume-mute-outline'}
              size={15}
            />
          </Pressable>

          <Pressable
            accessibilityLabel="新对话"
            accessibilityRole="button"
            disabled={controller.busy || controller.phase === 'disconnected'}
            onPress={controller.onResetConversation}
            style={({ pressed }) => [
              styles.iconBtn,
              light && styles.iconBtnLight,
              (controller.busy || controller.phase === 'disconnected') && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="control-voice-reset"
          >
            <Ionicons color={light ? '#334155' : '#CBD5E1'} name="refresh-outline" size={15} />
          </Pressable>

          <Pressable
            accessibilityLabel="关闭语音对话"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.iconBtn, light && styles.iconBtnLight, pressed && styles.pressed]}
            testID="control-voice-close"
          >
            <Ionicons color={light ? '#334155' : '#CBD5E1'} name="close" size={16} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={node => { scrollNode = node; }}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => { scrollNode?.scrollToEnd({ animated: true }); }}
        showsVerticalScrollIndicator={false}
        style={[styles.messageScroll, { maxHeight }]}
        testID="control-voice-messages"
      >
        {controller.messages.length === 0 && controller.pendingApprovals.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyHint, light && styles.emptyHintLight]}>
              {controller.phase === 'disconnected'
                ? '请先连接机器狗'
                : controller.phase === 'unavailable'
                  ? '对话服务未就绪'
                  : controller.speechSupported
                    ? '点击麦克风说话，或直接输入指令'
                    : '输入指令与机器狗对话'}
            </Text>
            {controller.phase !== 'disconnected' ? (
              <View style={styles.quickRow}>
                {QUICK_PROMPTS.map(prompt => (
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
              </View>
            ) : null}
          </View>
        ) : null}

        {controller.messages.map(message => {
          if (message.role === 'tool') {
            return (
              <View key={message.id} style={styles.toolRow}>
                <Ionicons color="#60A5FA" name="flash-outline" size={12} />
                <Text numberOfLines={1} style={[styles.toolText, light && styles.toolTextLight]}>
                  {message.toolLabel ?? '执行操作'}
                </Text>
              </View>
            );
          }

          const isUser = message.role === 'user';
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
                  accessibilityLabel="拒绝执行"
                  accessibilityRole="button"
                  disabled={deciding}
                  onPress={() => controller.onDecideApproval(approval.approvalId, false)}
                  style={({ pressed }) => [styles.rejectBtn, deciding && styles.disabled, pressed && styles.pressed]}
                  testID={`control-voice-reject-${approval.approvalId}`}
                >
                  <Text style={styles.rejectBtnText}>拒绝</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="允许执行"
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

      <View style={styles.composerRow}>
        {controller.speechSupported ? (
          <Pressable
            accessibilityLabel={controller.listening ? '结束说话并发送' : '点击说话'}
            accessibilityRole="button"
            accessibilityState={{
              disabled: controller.phase === 'disconnected' || controller.busy,
              selected: controller.listening,
            }}
            disabled={controller.phase === 'disconnected' || controller.busy}
            onPress={controller.onToggleListening}
            style={({ pressed }) => [
              styles.micBtn,
              controller.listening && styles.micBtnListening,
              (controller.phase === 'disconnected' || controller.busy) && styles.disabled,
              pressed && styles.pressed,
            ]}
            testID="control-voice-mic-btn"
          >
            <Ionicons
              color="#FFFFFF"
              name={controller.listening ? 'radio-button-on' : 'mic'}
              size={17}
            />
            <Text style={styles.micBtnText}>{controller.listening ? '完成' : '说话'}</Text>
          </Pressable>
        ) : null}

        <TextInput
          accessibilityLabel="输入对话内容"
          editable={controller.phase !== 'disconnected' && !controller.busy}
          maxLength={1000}
          onChangeText={controller.setDraft}
          onSubmitEditing={() => {
            if (canSend) controller.onSubmit();
          }}
          placeholder={controller.listening ? '正在聆听…' : '输入指令…'}
          placeholderTextColor={light ? '#94A3B8' : '#64748B'}
          returnKeyType="send"
          style={[styles.input, light && styles.inputLight]}
          testID="control-voice-input"
          value={controller.draft}
        />

        {controller.busy && controller.activeTurnId ? (
          <Pressable
            accessibilityLabel="停止当前对话"
            accessibilityRole="button"
            onPress={controller.onCancelTurn}
            style={({ pressed }) => [styles.stopTurnBtn, pressed && styles.pressed]}
            testID="control-voice-cancel-turn"
          >
            <Ionicons color="#FFFFFF" name="stop" size={15} />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="发送消息"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            disabled={!canSend}
            onPress={() => controller.onSubmit()}
            style={({ pressed }) => [
              styles.sendBtn,
              !canSend && styles.sendBtnDisabled,
              pressed && canSend && styles.pressed,
            ]}
            testID="control-voice-send-btn"
          >
            <Ionicons color="#FFFFFF" name="arrow-up" size={16} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  cardDark: {
    backgroundColor: 'rgba(15, 20, 26, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  cardLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  title: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '600',
    color: '#F1F5F9',
  },
  titleLight: {
    color: '#0F172A',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusBadgeLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 15,
    color: '#CBD5E1',
    fontWeight: '500',
  },
  statusTextLight: {
    color: '#475569',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconBtnLight: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  iconBtnActive: {
    backgroundColor: 'rgba(59, 110, 246, 0.24)',
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.4)',
  },
  messageScroll: {
    minHeight: 72,
  },
  messageContent: {
    gap: 6,
    paddingVertical: 2,
  },
  emptyWrap: {
    paddingVertical: 8,
    gap: 8,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 17,
    color: '#94A3B8',
  },
  emptyHintLight: {
    color: '#64748B',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(59, 110, 246, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(147, 197, 253, 0.28)',
  },
  quickChipLight: {
    backgroundColor: 'rgba(59, 110, 246, 0.10)',
    borderColor: 'rgba(59, 110, 246, 0.25)',
  },
  quickChipText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#BFDBFE',
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
    color: '#93C5FD',
  },
  toolTextLight: {
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
    gap: 6,
  },
  bubbleUser: {
    backgroundColor: '#3B6EF6',
  },
  bubbleAssistantDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
  },
  bubbleAssistantLight: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleText: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  bubbleTextUser: {
    color: '#FFFFFF',
  },
  bubbleTextDark: {
    color: '#F1F5F9',
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
    backgroundColor: 'rgba(59, 110, 246, 0.25)',
  },
  choiceBtnText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#DBEAFE',
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
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  rejectBtnText: {
    fontSize: 11.5,
    lineHeight: 15,
    color: '#E2E8F0',
    fontWeight: '500',
  },
  approveBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#3B6EF6',
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
    gap: 6,
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: '#3B6EF6',
  },
  micBtnListening: {
    backgroundColor: '#DC2626',
  },
  micBtnText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 0,
    fontSize: 12.5,
    color: '#F8FAFC',
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
  },
  inputLight: {
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B6EF6',
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
  },
  stopTurnBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
});
