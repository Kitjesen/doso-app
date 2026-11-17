import { ROBOT_HOTSPOT_RULES, type RobotHotspotRule } from './robotHotspotRules';
import type { HotspotSighting, WifiDiscoveryErrorCode, WifiPlatformKind } from './wifiDiscoverySession';

function joinedSighting(rule: RobotHotspotRule, previous: HotspotSighting | null): HotspotSighting {
  return {
    matches: [rule],
    currentSsid: rule.ssid,
    unrelatedCurrent: false,
    otherCount: previous?.otherCount ?? 0,
    apply: rule,
  };
}

export function hotspotRuleSummary(rules: readonly RobotHotspotRule[] = ROBOT_HOTSPOT_RULES): string {
  return rules.map(rule => `${rule.ssid}（${rule.host}:${rule.port}）`).join('、');
}

export function wifiDiscoveryHint(platform: WifiPlatformKind, rules: readonly RobotHotspotRule[] = ROBOT_HOTSPOT_RULES): string {
  if (platform === 'unsupported') return '当前环境不能搜索 Wi-Fi，请在上方手动输入地址。';
  const summary = `只会把 ${hotspotRuleSummary(rules)} 识别为机器狗热点并填入地址。其他 Wi-Fi 请在上方手动输入地址。蓝牙配网尚未接入，账号设备在高级设置里。`;
  if (platform === 'ios-current') return `${summary} iPhone 不能列出附近的全部 Wi-Fi，只能检查当前网络，或加入已知热点。`;
  return summary;
}

const ERROR_COPY: Record<WifiDiscoveryErrorCode, string> = {
  unsupported: '当前环境不能搜索 Wi-Fi，请手动输入地址。',
  unavailable: '此安装包还不能搜索 Wi-Fi。请升级安装包，或手动输入地址。',
  permission_denied: '请允许附近 Wi-Fi 或定位权限后再搜索。系统把扫描 Wi-Fi 当作位置相关能力。你仍可以手动输入地址。',
  permission_blocked: '搜索 Wi-Fi 的权限已关闭。请到系统设置中允许后再试。你仍可以手动输入地址。',
  location_off: '请先打开系统定位服务。Android 12 及以下要靠它返回 Wi-Fi 扫描结果。你仍可以手动输入地址。',
  wifi_off: '请先打开 Wi-Fi，再搜索机器狗热点。',
  scan_failed: 'Wi-Fi 搜索没有完成。请稍后重试，或手动输入地址。',
  join_failed: '没能加入机器狗热点。可以在系统设置中手动加入。若热点有密码，请在系统设置里填写。本页不保存 Wi-Fi 密码。',
};

export function wifiErrorCopy(code: WifiDiscoveryErrorCode, platform: WifiPlatformKind): string {
  if (platform === 'ios-current' && code === 'permission_denied') {
    return '请允许定位权限后再读取当前 Wi-Fi 名称。这不会记录位置，也不能列出附近的全部网络。你仍可以手动输入地址。';
  }
  if (platform === 'ios-current' && code === 'permission_blocked') {
    return '读取当前 Wi-Fi 名称的权限已关闭。请到系统设置中允许定位后再试。iPhone 也不能列出附近的全部网络。你仍可以手动输入地址。';
  }
  return ERROR_COPY[code];
}

export function wifiSettingsAction(code: WifiDiscoveryErrorCode | null): boolean {
  return code === 'permission_blocked' || code === 'location_off';
}

export type WifiPanelState = Readonly<{
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'interrupted';
  action: 'scan' | 'current' | 'join' | null;
  error: WifiDiscoveryErrorCode | null;
  sighting: HotspotSighting | null;
  holding: boolean;
  joinResult: 'joined' | 'already' | 'cancelled' | null;
  throttled: boolean;
  applied: boolean;
  needsConfirm: boolean;
  stopped: boolean;
  restored: boolean;
}>;

export const initialWifiPanelState: WifiPanelState = {
  phase: 'idle', action: null, error: null, sighting: null, holding: false, joinResult: null,
  throttled: false, applied: false, needsConfirm: false, stopped: false, restored: false,
};

export type WifiPanelEvent =
  | { type: 'start'; action: 'scan' | 'current' | 'join' }
  | { type: 'stop' }
  | { type: 'interrupt' }
  | { type: 'scan'; sighting: HotspotSighting; throttled: boolean; applied: boolean; needsConfirm: boolean }
  | { type: 'current'; sighting: HotspotSighting; applied: boolean; needsConfirm: boolean }
  | { type: 'join'; result: 'joined' | 'already' | 'cancelled'; rule: RobotHotspotRule }
  | { type: 'fill'; rule: RobotHotspotRule }
  | { type: 'release' }
  | { type: 'error'; code: WifiDiscoveryErrorCode };

export function reduceWifiPanel(state: WifiPanelState, event: WifiPanelEvent): WifiPanelState {
  switch (event.type) {
    case 'start':
      return { ...state, phase: 'loading', action: event.action, error: null, stopped: false, restored: false, joinResult: event.action === 'join' ? null : state.joinResult };
    case 'stop':
      return state.phase === 'loading' ? { ...state, phase: 'idle', action: null, stopped: true } : state;
    case 'interrupt':
      if (state.phase !== 'loading') return state;
      return { ...state, phase: 'interrupted', action: null, holding: state.action === 'join' ? false : state.holding };
    case 'scan':
      return {
        ...state, phase: 'ready', action: null, error: null, sighting: event.sighting, throttled: event.throttled,
        applied: event.applied, needsConfirm: event.needsConfirm, joinResult: null, stopped: false, restored: false,
      };
    case 'current':
      return {
        ...state, phase: 'ready', action: null, error: null, sighting: event.sighting, throttled: false,
        applied: event.applied, needsConfirm: event.needsConfirm, joinResult: null, stopped: false, restored: false,
      };
    case 'join':
      return {
        ...state, phase: 'ready', action: null, error: null, joinResult: event.result,
        holding: event.result === 'joined', applied: event.result !== 'cancelled', needsConfirm: false,
        stopped: false, restored: false,
        sighting: event.result === 'cancelled' ? state.sighting : joinedSighting(event.rule, state.sighting),
      };
    case 'fill':
      return {
        ...state, applied: true, needsConfirm: false, joinResult: null, restored: false,
        phase: state.phase === 'loading' ? state.phase : 'ready',
        sighting: {
          matches: [event.rule],
          currentSsid: state.sighting?.currentSsid ?? null,
          unrelatedCurrent: state.sighting?.unrelatedCurrent ?? false,
          otherCount: state.sighting?.otherCount ?? 0,
          apply: event.rule,
        },
      };
    case 'release':
      return { ...state, holding: false, restored: true, joinResult: null };
    case 'error':
      return { ...state, phase: 'error', action: null, error: event.code, stopped: false };
    default:
      return state;
  }
}

function filled(rule: RobotHotspotRule): string {
  return `已填入 ${rule.host}:${rule.port}。请点「连接机器狗」。`;
}

export function wifiStatusText(state: WifiPanelState, platform: WifiPlatformKind): string | null {
  if (state.phase === 'loading') {
    if (state.action === 'join') return '正在请求加入机器狗热点…';
    if (state.action === 'current') return '正在读取当前 Wi-Fi…';
    return '正在搜索机器狗热点…';
  }
  if (state.phase === 'interrupted') return '应用进入后台，这次搜索已停止。';
  if (state.phase === 'error' && state.error) return wifiErrorCopy(state.error, platform);
  if (state.restored) return '已恢复手机原来的网络。机器狗热点地址可能暂时连不上。';
  if (state.joinResult === 'joined' && state.sighting?.apply) return `已加入 ${state.sighting.apply.ssid}，并填入 ${state.sighting.apply.host}:${state.sighting.apply.port}。请点「连接机器狗」。`;
  if (state.joinResult === 'joined') return '已加入机器狗热点。请点「连接机器狗」。';
  if (state.joinResult === 'already' && state.sighting?.apply) return `手机已连上 ${state.sighting.apply.ssid}，并填入 ${state.sighting.apply.host}:${state.sighting.apply.port}。请点「连接机器狗」。`;
  if (state.joinResult === 'already') return '手机已连上机器狗热点。请点「连接机器狗」。';
  if (state.joinResult === 'cancelled') return '未加入热点。地址保持不变，仍可手动输入。';
  if (state.needsConfirm && state.sighting?.apply) return `已发现机器狗热点 ${state.sighting.apply.ssid}。当前地址保持不变。`;
  if (state.applied && state.sighting?.apply) {
    const address = filled(state.sighting.apply);
    return state.throttled ? `系统限制了扫描频率，下面是最近一次结果。${address}` : address;
  }
  if (state.phase === 'ready' && state.sighting && state.sighting.matches.length === 0) {
    if (state.sighting.unrelatedCurrent && state.sighting.currentSsid) {
      return `当前 Wi-Fi 是「${state.sighting.currentSsid}」。请手动输入局域网里的机器狗地址。`;
    }
    if (!state.sighting.currentSsid && platform === 'ios-current') {
      return '系统没有返回当前 Wi-Fi 名称。请在系统设置中确认已加入机器狗热点，或直接输入地址。';
    }
    if (state.throttled) return '系统限制了扫描频率，最近一次结果里没有机器狗热点。请稍后重试，或手动输入地址。';
    return '没有发现机器狗热点。若手机和机器狗已经在同一局域网，请手动输入地址。';
  }
  if (state.stopped) return '已停止这次搜索。';
  return null;
}

export const wifiJoinOffer = '加入后，这个应用会改走机器狗热点，当前局域网里的地址会暂时连不上。可以随时恢复原网络。机器狗本身的网络不会被修改。';
