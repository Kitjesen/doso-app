import { sortRobotHotspots, type RobotHotspotRule } from './robotHotspotRules';
import type {
  DiscoveredLanRobot,
  HotspotSighting,
  WifiDiscoveryErrorCode,
  WifiPlatformKind,
} from './wifiDiscoverySession';

function upsertHotspotMatch(
  rule: RobotHotspotRule,
  previous: HotspotSighting | null,
  connected: boolean,
): HotspotSighting {
  const bySsid = new Map<string, RobotHotspotRule>();
  for (const item of previous?.matches ?? []) bySsid.set(item.ssid, item);
  bySsid.set(rule.ssid, rule);
  const currentSsid = connected ? rule.ssid : (previous?.currentSsid ?? null);
  return {
    matches: sortRobotHotspots([...bySsid.values()], currentSsid),
    currentSsid,
    unrelatedCurrent: connected ? false : (previous?.unrelatedCurrent ?? false),
    otherCount: previous?.otherCount ?? 0,
    apply: rule,
  };
}

export function wifiDiscoveryHint(platform: WifiPlatformKind): string | null {
  if (platform === 'unsupported') return '请手动输入地址';
  return null;
}

const ERROR_COPY: Record<WifiDiscoveryErrorCode, string> = {
  unsupported: '请手动输入地址',
  unavailable: '请升级安装包',
  permission_denied: '需要搜索权限',
  permission_blocked: '权限已关闭',
  location_off: '请开启定位',
  wifi_off: '请开启 Wi-Fi',
  scan_failed: '搜索失败',
  discovery_failed: '搜索失败',
  join_failed: '加入热点失败',
};

export function wifiErrorCopy(code: WifiDiscoveryErrorCode): string {
  return ERROR_COPY[code];
}

export function wifiSettingsAction(code: WifiDiscoveryErrorCode | null): boolean {
  return code === 'permission_blocked' || code === 'location_off';
}

export type AppliedDiscoveryEndpoint = Readonly<{
  host: string;
  port: number;
}>;

export type WifiPanelState = Readonly<{
  phase: 'idle' | 'loading' | 'ready' | 'error' | 'interrupted';
  action: 'search' | 'join' | null;
  error: WifiDiscoveryErrorCode | null;
  sighting: HotspotSighting | null;
  lanRobots: readonly DiscoveredLanRobot[];
  hotspotMetadata: Readonly<Record<string, DiscoveredLanRobot>>;
  holding: boolean;
  joinedSsid: string | null;
  joinResult: 'joined' | 'already' | 'cancelled' | null;
  throttled: boolean;
  appliedEndpoint: AppliedDiscoveryEndpoint | null;
  stopped: boolean;
  restored: boolean;
}>;

export const initialWifiPanelState: WifiPanelState = {
  phase: 'idle',
  action: null,
  error: null,
  sighting: null,
  lanRobots: [],
  hotspotMetadata: {},
  holding: false,
  joinedSsid: null,
  joinResult: null,
  throttled: false,
  appliedEndpoint: null,
  stopped: false,
  restored: false,
};

export type WifiPanelEvent =
  | { type: 'start'; action: 'search' | 'join' }
  | { type: 'stop' }
  | { type: 'interrupt' }
  | {
      type: 'search';
      sighting: HotspotSighting;
      lanRobots: readonly DiscoveredLanRobot[];
      hotspotMetadata: Readonly<Record<string, DiscoveredLanRobot>>;
      throttled: boolean;
      appliedEndpoint: AppliedDiscoveryEndpoint | null;
    }
  | { type: 'join'; result: 'joined' | 'already' | 'cancelled'; rule: RobotHotspotRule }
  | { type: 'fill-hotspot'; rule: RobotHotspotRule }
  | { type: 'select-lan'; robot: DiscoveredLanRobot }
  | { type: 'release' }
  | { type: 'error'; code: WifiDiscoveryErrorCode };

export function reduceWifiPanel(state: WifiPanelState, event: WifiPanelEvent): WifiPanelState {
  switch (event.type) {
    case 'start':
      return {
        ...state,
        phase: 'loading',
        action: event.action,
        error: null,
        stopped: false,
        restored: false,
        joinResult: event.action === 'join' ? null : state.joinResult,
      };
    case 'stop':
      return state.phase === 'loading'
        ? { ...state, phase: 'idle', action: null, stopped: true }
        : state;
    case 'interrupt':
      if (state.phase !== 'loading') return state;
      return {
        ...state,
        phase: 'interrupted',
        action: null,
        holding: state.action === 'join' ? false : state.holding,
        joinedSsid: state.action === 'join' ? null : state.joinedSsid,
      };
    case 'search':
      return {
        ...state,
        phase: 'ready',
        action: null,
        error: null,
        sighting: event.sighting,
        lanRobots: event.lanRobots,
        hotspotMetadata: event.hotspotMetadata,
        throttled: event.throttled,
        appliedEndpoint: event.appliedEndpoint,
        joinResult: null,
        stopped: false,
        restored: false,
      };
    case 'join':
      return {
        ...state,
        phase: 'ready',
        action: null,
        error: null,
        joinResult: event.result,
        holding: event.result === 'joined',
        joinedSsid: event.result === 'cancelled' ? state.joinedSsid : event.rule.ssid,
        appliedEndpoint: event.result === 'cancelled'
          ? state.appliedEndpoint
          : { host: event.rule.host, port: event.rule.port },
        stopped: false,
        restored: false,
        sighting: event.result === 'cancelled'
          ? state.sighting
          : upsertHotspotMatch(event.rule, state.sighting, true),
      };
    case 'fill-hotspot':
      return {
        ...state,
        appliedEndpoint: { host: event.rule.host, port: event.rule.port },
        joinResult: null,
        restored: false,
        phase: state.phase === 'loading' ? state.phase : 'ready',
        sighting: upsertHotspotMatch(event.rule, state.sighting, false),
      };
    case 'select-lan':
      return {
        ...state,
        appliedEndpoint: { host: event.robot.host, port: event.robot.port },
        joinResult: null,
        restored: false,
        phase: state.phase === 'loading' ? state.phase : 'ready',
      };
    case 'release':
      return { ...state, holding: false, joinedSsid: null, restored: true, joinResult: null };
    case 'error':
      return { ...state, phase: 'error', action: null, error: event.code, stopped: false };
    default:
      return state;
  }
}

export function wifiStatusText(state: WifiPanelState): string | null {
  if (state.phase === 'loading') {
    return state.action === 'join' ? '正在加入热点…' : '正在搜索…';
  }
  if (state.phase === 'interrupted') return '搜索已停止';
  if (state.phase === 'error' && state.error) return wifiErrorCopy(state.error);
  if (state.restored) return '已恢复原网络';
  if (state.joinResult === 'joined') return state.joinedSsid ? `已加入 ${state.joinedSsid}` : '已加入热点';
  if (state.joinResult === 'already') return state.joinedSsid ? `已连接 ${state.joinedSsid}` : '已连接热点';
  if (state.joinResult === 'cancelled') return '已取消加入';
  if (state.appliedEndpoint) return `已填入 ${state.appliedEndpoint.host}:${state.appliedEndpoint.port}`;
  if (state.phase === 'ready') {
    const count = state.lanRobots.length + (state.sighting?.matches.length ?? 0);
    if (count === 0) return '未发现机器狗';
    return `发现 ${count} 台设备`;
  }
  if (state.stopped) return '已停止搜索';
  return null;
}
