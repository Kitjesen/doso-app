import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cancelLingtuVoiceTurn,
  createLingtuVoiceConversation,
  decideLingtuVoiceApproval,
  detectSpeechInputMode,
  LingtuVoiceChatError,
  probeLingtuVoiceService,
  readLingtuVoiceConversation,
  readXiaosuanVoiceTranscript,
  resolveRobotVoiceOrigin,
  sendLingtuVoiceMessage,
  speakRobotVoiceReply,
  startSpeechInputCapture,
  stopRobotVoiceReply,
  type ActiveSpeechCapture,
  type VoiceChatApprovalItem,
  type VoiceChatMessageItem,
  type VoiceChatServiceMode,
  type VoiceChatTurnItem,
} from '../../services/lingtuVoiceChat';

export type RobotVoicePhase =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'listening'
  | 'thinking'
  | 'awaiting'
  | 'unavailable';

export type RobotVoiceController = Readonly<{
  open: boolean;
  setOpen: (next: boolean) => void;
  toggleOpen: () => void;
  phase: RobotVoicePhase;
  statusLabel: string;
  errorText: string | null;
  messages: readonly VoiceChatMessageItem[];
  pendingApprovals: readonly VoiceChatApprovalItem[];
  draft: string;
  setDraft: (value: string) => void;
  listening: boolean;
  speechSupported: boolean;
  busy: boolean;
  activeTurnId: string | null;
  approvalBusyId: string | null;
  voiceReplyEnabled: boolean;
  onToggleVoiceReply: () => void;
  onToggleListening: () => void;
  onSubmit: (overrideText?: string) => void;
  onCancelTurn: () => void;
  onDecideApproval: (approvalId: string, approved: boolean) => void;
  onResetConversation: () => void;
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
  const [sending, setSending] = useState(false);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [speechMode, setSpeechMode] = useState<'web' | 'native' | 'none'>('none');
  const [listening, setListening] = useState(false);

  const mountedRef = useRef(true);
  const speechCaptureRef = useRef<ActiveSpeechCapture | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const seededInitialHistoryRef = useRef(false);
  const submitRef = useRef<(overrideText?: string) => void>(() => {});

  const resolvedOrigin = useMemo(
    () => (connected ? resolveRobotVoiceOrigin({ endpoint, host, allowLocalHttp }) : null),
    [allowLocalHttp, connected, endpoint, host],
  );

  useEffect(() => {
    mountedRef.current = true;
    void detectSpeechInputMode().then(mode => {
      if (mountedRef.current) setSpeechMode(mode);
    });
    return () => {
      mountedRef.current = false;
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
    setServiceState('idle');
    setActiveServiceOrigin(null);
    setConversationId(null);
    setMessages([]);
    setTurns([]);
    setApprovals([]);
    setErrorText(null);
    spokenIdsRef.current.clear();
    seededInitialHistoryRef.current = false;
  }, [resolvedOrigin, stopListening]);

  const applySnapshot = useCallback(
    (snapshot: Awaited<ReturnType<typeof readLingtuVoiceConversation>>, allowAutoSpeak: boolean) => {
      setMessages(snapshot.messages);
      setTurns(snapshot.turns);
      setApprovals(snapshot.approvals);

      if (!seededInitialHistoryRef.current) {
        for (const msg of snapshot.messages) {
          if (msg.role === 'assistant') spokenIdsRef.current.add(msg.id);
        }
        seededInitialHistoryRef.current = true;
        return;
      }

      if (!allowAutoSpeak) return;
      const turnMap = new Map(snapshot.turns.map(t => [t.turnId, t]));
      for (const msg of snapshot.messages) {
        if (msg.role !== 'assistant' || !msg.text.trim() || spokenIdsRef.current.has(msg.id)) continue;
        const turn = turnMap.get(msg.turnId);
        if (!turn || turn.state === 'completed') {
          spokenIdsRef.current.add(msg.id);
          speakRobotVoiceReply(msg.text, volumePercent, voiceReplyEnabled);
        }
      }
    },
    [voiceReplyEnabled, volumePercent],
  );

  // Connect & create conversation when the HUD voice panel opens.
  useEffect(() => {
    if (!open || !appActive || !resolvedOrigin) return;
    if (serviceState === 'ready' && (serviceMode === 'instruction' || serviceMode === 'xiaosuan' || conversationId)) return;

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
          applySnapshot(snap, false);
        } else if (probe.mode === 'xiaosuan') {
          const snap = await readXiaosuanVoiceTranscript({
            origin: targetOrigin,
            viewerToken,
            allowLocalHttp,
            signal: controller.signal,
          }).catch(() => null);
          if (!mountedRef.current || controller.signal.aborted) return;
          if (snap) applySnapshot(snap, false);
          else seededInitialHistoryRef.current = true;
        } else {
          seededInitialHistoryRef.current = true;
        }
        setServiceState('ready');
      } catch (err) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setServiceState('unavailable');
        setErrorText(err instanceof LingtuVoiceChatError ? err.message : '服务未启动');
      }
    })();

    return () => controller.abort();
  }, [
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

  const activeTurn = useMemo(
    () => turns.find(t => t.state === 'running' || t.state === 'queued') ?? null,
    [turns],
  );
  const pendingApprovals = useMemo(
    () => approvals.filter(a => a.state === 'pending'),
    [approvals],
  );

  // Poll conversation snapshot while a turn is actively running or when synced to Xiaosuan board transcript.
  useEffect(() => {
    const targetOrigin = activeServiceOrigin ?? resolvedOrigin;
    const pollXiaosuan = serviceMode === 'xiaosuan' && serviceState === 'ready';
    const pollConversation =
      serviceMode === 'conversation'
      && Boolean(conversationId)
      && Boolean(activeTurn || pendingApprovals.length > 0 || sending);

    if (!open || !appActive || !targetOrigin || (!pollXiaosuan && !pollConversation)) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const intervalMs = pollXiaosuan ? 1_500 : 650;
    const timer = setInterval(() => {
      const readTask = pollXiaosuan
        ? readXiaosuanVoiceTranscript({ origin: targetOrigin, viewerToken, allowLocalHttp, signal: controller.signal })
        : readLingtuVoiceConversation(
            { origin: targetOrigin, viewerToken, allowLocalHttp, signal: controller.signal },
            conversationId!,
          );
      void readTask
        .then(snap => {
          if (!cancelled && mountedRef.current) {
            // In xiaosuan mode the physical ESP32-S3 speaker already plays TTS; avoid double-speaking on phone.
            applySnapshot(snap, !pollXiaosuan);
          }
        })
        .catch(() => {
          /* Transient poll drop; next tick retries while turn is active. */
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

  const submitMessage = useCallback(
    (overrideText?: string) => {
      const text = (overrideText ?? draft).trim();
      if (!text || sending) return;
      if (!resolvedOrigin) {
        setErrorText('未连接');
        return;
      }
      stopListening(true);
      stopRobotVoiceReply();
      setErrorText(null);
      if (overrideText === undefined) setDraft('');
      else setDraft('');

      const messageId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const optimisticSeq = (messages[messages.length - 1]?.seq ?? 0) + 1;
      setMessages(prev => [
        ...prev,
        {
          id: messageId,
          seq: optimisticSeq,
          role: 'user',
          text,
          turnId: `pending_${messageId}`,
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
                applySnapshot(snap, false);
                return;
              }
            }
            const replyId = `inst_${messageId}`;
            spokenIdsRef.current.add(replyId);
            setMessages(prev => [
              ...prev,
              {
                id: replyId,
                seq: optimisticSeq + 1,
                role: 'assistant',
                text: result.replyText,
                turnId: `turn_${messageId}`,
              },
            ]);
            if (!result.boardSpoke) {
              speakRobotVoiceReply(result.replyText, volumePercent, voiceReplyEnabled);
            }
          } else if (activeConvId) {
            setTurns(prev => [
              ...prev.filter(t => t.turnId !== result.turnId),
              { turnId: result.turnId, state: result.state, messageId },
            ]);
            const snap = await readLingtuVoiceConversation(
              { origin: targetOrigin, viewerToken, allowLocalHttp },
              activeConvId,
            );
            if (mountedRef.current) applySnapshot(snap, true);
          }
        } catch (err) {
          if (!mountedRef.current) return;
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
      conversationId,
      defaultModel,
      draft,
      messages,
      resolvedOrigin,
      sending,
      serviceMode,
      serviceState,
      stopListening,
      viewerToken,
      voiceReplyEnabled,
      volumePercent,
    ],
  );

  submitRef.current = submitMessage;

  const onToggleListening = useCallback(() => {
    if (listening) {
      stopListening(false);
      return;
    }
    if (speechMode === 'none') {
      setErrorText('语音输入不可用');
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
    if (!resolvedOrigin || !conversationId || !activeTurn) return;
    void cancelLingtuVoiceTurn(
      { origin: resolvedOrigin, viewerToken, allowLocalHttp },
      conversationId,
      activeTurn.turnId,
    )
      .then(() => readLingtuVoiceConversation({ origin: resolvedOrigin, viewerToken, allowLocalHttp }, conversationId))
      .then(snap => {
        if (mountedRef.current) applySnapshot(snap, false);
      })
      .catch(() => {
        if (mountedRef.current) setErrorText('取消未确认');
      });
  }, [activeTurn, allowLocalHttp, applySnapshot, conversationId, resolvedOrigin, viewerToken]);

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
          if (mountedRef.current) applySnapshot(snap, true);
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
    spokenIdsRef.current.clear();
    seededInitialHistoryRef.current = true;
    if (!resolvedOrigin || serviceMode !== 'conversation') return;
    setServiceState('connecting');
    void createLingtuVoiceConversation(
      { origin: resolvedOrigin, viewerToken, allowLocalHttp },
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
        setErrorText(err instanceof LingtuVoiceChatError ? err.message : '服务未启动');
      });
  }, [allowLocalHttp, resolvedOrigin, serviceMode, stopListening, viewerToken]);

  const setOpen = useCallback((next: boolean) => {
    if (!next) {
      stopListening(true);
    }
    setOpenState(next);
  }, [stopListening]);

  const toggleOpen = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const phase: RobotVoicePhase = !resolvedOrigin
    ? 'disconnected'
    : listening
      ? 'listening'
      : pendingApprovals.length > 0
        ? 'awaiting'
        : sending || Boolean(activeTurn)
          ? 'thinking'
          : serviceState === 'connecting'
            ? 'connecting'
            : serviceState === 'unavailable'
              ? 'unavailable'
              : 'ready';

  const statusLabel: Record<RobotVoicePhase, string> = {
    disconnected: '未连接',
    connecting: '连接中',
    ready: '就绪',
    listening: '聆听中',
    thinking: '思考中',
    awaiting: '待确认',
    unavailable: '服务未启动',
  };

  return {
    open,
    setOpen,
    toggleOpen,
    phase,
    statusLabel: statusLabel[phase],
    errorText,
    messages,
    pendingApprovals,
    draft,
    setDraft,
    listening,
    speechSupported: speechMode !== 'none',
    busy: sending || Boolean(activeTurn),
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
    onDecideApproval,
    onResetConversation,
  };
}
