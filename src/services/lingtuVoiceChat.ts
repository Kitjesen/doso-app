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

export type VoiceChatMessageItem = Readonly<{
  id: string;
  seq: number;
  role: 'user' | 'assistant' | 'tool';
  text: string;
  turnId: string;
  kind?: string;
  toolLabel?: string;
  choices?: readonly string[];
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
}>;

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
  read_robot_sensor: '读取传感器',
  capture_camera: '拍摄画面',
  view_live_camera: '查看相机',
  inspect_lidar: '查看雷达',
  inspect_navigation: '检查导航',
  navigate_to: '前往目标点',
  navigate_to_object: '前往目标物',
  navigate_to_deg: '转向目标角度',
  find_object: '查找目标',
  detect_object: '识别目标',
  list_saved_maps: '读取地图库',
  inspect_saved_map: '检查地图',
  find_inspection_points: '查找巡检点',
  get_inspection_status: '读取巡检状态',
  follow_person: '跟随目标',
  cancel_agent_task: '取消任务',
  get_runtime_mode: '读取运行模式',
  switch_runtime_mode: '切换运行模式',
  preview_navigation: '预览路径',
  start_navigation: '发起导航',
  get_navigation_status: '查询导航状态',
  cancel_navigation: '取消导航',
  pause_navigation: '暂停导航',
  resume_navigation: '恢复导航',
  set_navigation_speed: '调整限速',
  list_inspection_routes: '查询巡检路线',
  start_inspection_route: '启动巡检路线',
  run_python: '执行分析',
  save_map_copy: '保存地图',
};

export function formatVoiceToolLabel(name: string | null | undefined): string {
  if (!name) return '执行操作';
  return TOOL_LABELS[name] ?? '执行操作';
}

function summarizeApprovalArgs(toolName: string, args: Record<string, unknown>): string {
  if (toolName === 'start_navigation') {
    const x = typeof args.x === 'number' && Number.isFinite(args.x) ? args.x.toFixed(1) : null;
    const y = typeof args.y === 'number' && Number.isFinite(args.y) ? args.y.toFixed(1) : null;
    if (x !== null && y !== null) return `目标 (${x}, ${y}) m`;
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
        throw new LingtuVoiceChatError(code, code === 'timeout' ? '响应超时' : '服务未启动', response.status);
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
    throw new LingtuVoiceChatError('unavailable', '服务未启动');
  } finally {
    clearTimeout(timer);
    target.signal?.removeEventListener('abort', onAbort);
  }
}

function extractErrorMessage(status: number, data: Record<string, unknown> | null): LingtuVoiceChatError {
  const detail = data?.detail && typeof data.detail === 'object' ? (data.detail as Record<string, unknown>) : null;
  const reason = String(detail?.reason ?? data?.reason ?? data?.error ?? '');
  if (reason === 'conversation_active' || reason === 'turn_active') {
    return new LingtuVoiceChatError('busy', '上一轮处理中', status);
  }
  if (status === 503 || reason === 'agent_unavailable') {
    return new LingtuVoiceChatError('unavailable', '对话未启用', status);
  }
  if (status === 409) {
    return new LingtuVoiceChatError('busy', '操作冲突', status);
  }
  return new LingtuVoiceChatError('rejected', '请求未完成', status);
}

function deriveXiaosuanVoiceOrigin(origin: string, allowLocalHttp = false): string | null {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.port === '8770') return origin;
    const candidate = `${parsed.protocol}//${parsed.hostname}:8770`;
    return validateLingtuOrigin(candidate, allowLocalHttp);
  } catch {
    return null;
  }
}

export async function probeLingtuVoiceService(target: VoiceTargetOptions): Promise<Readonly<{
  mode: VoiceChatServiceMode;
  defaultModel: string | null;
  serviceOrigin: string;
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
        return { mode: 'xiaosuan', defaultModel: null, serviceOrigin: xiaosuanOrigin };
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
  throw new LingtuVoiceChatError('unavailable', '服务未启动');
}

export async function readXiaosuanVoiceTranscript(
  target: VoiceTargetOptions,
): Promise<VoiceConversationSnapshot> {
  const res = await requestVoiceJson(target, 'GET', '/api/transcript', undefined, 4_500);
  if (res.status < 200 || res.status >= 300 || !res.data) {
    throw extractErrorMessage(res.status, res.data);
  }
  const rawEvents = Array.isArray(res.data.events) ? res.data.events : [];
  const messages: VoiceChatMessageItem[] = [];
  for (const item of rawEvents) {
    if (!item || typeof item !== 'object') continue;
    const ev = item as Record<string, unknown>;
    const seq = typeof ev.seq === 'number' && Number.isFinite(ev.seq) ? ev.seq : messages.length + 1;
    const role: 'user' | 'assistant' = ev.role === 'user' || ev.event === 'stt' ? 'user' : 'assistant';
    const text = typeof ev.text === 'string' ? ev.text.trim() : '';
    if (!text) continue;
    messages.push({
      id: `xs_${seq}`,
      seq,
      role,
      text,
      turnId: `xs_turn_${seq}`,
    });
  }
  return {
    conversationId: 'xiaosuan-live',
    messages,
    turns: [],
    approvals: [],
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
  | Readonly<{ kind: 'instruction'; accepted: boolean; replyText: string; boardSpoke?: boolean }>
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
        ? xsRes.data.message.replace(/^AskMe\s*回答[：:]\s*/, '').trim()
        : '已播报';
    return {
      kind: 'instruction' as const,
      accepted: xsRes.data.ok === true,
      replyText: rawAnswer,
      boardSpoke: true,
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
      : accepted ? '已受理指令' : '指令未通过';
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
        callbacks.onError('语音未识别');
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
    callbacks.onError('当前浏览器不支持语音输入');
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
    callbacks.onError(code === 'not-allowed' ? '麦克风未授权' : '语音识别失败');
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
    callbacks.onError('麦克风占用中');
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
