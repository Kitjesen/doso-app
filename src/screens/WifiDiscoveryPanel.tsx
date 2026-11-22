import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../components/AppText';
import { getProductAppearance } from '../appearance';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import {
  initialWifiPanelState,
  reduceWifiPanel,
  wifiDiscoveryHint,
  wifiSettingsAction,
  wifiStatusText,
  type AppliedDiscoveryEndpoint,
  type WifiPanelState,
} from '../features/robot-lifecycle/wifiDiscoveryCopy';
import {
  autoApplyHotspot,
  matchRobotHotspot,
  normalizeSsid,
  ROBOT_HOTSPOT_HOST,
  ROBOT_HOTSPOT_RULES,
  sameHotspotEndpoint,
  type RobotHotspotRule,
} from '../features/robot-lifecycle/robotHotspotRules';
import { wifiDiscoveryAdapter } from '../features/robot-lifecycle/wifiDiscoveryAdapter';
import {
  DEFAULT_LAN_DISCOVERY_TIMEOUT_MS,
  interpretAndroidScan,
  interpretCurrentNetwork,
  reconcileDiscoveryResults,
  sameLanEndpoint,
  shouldInterruptWifiDiscoveryForAppState,
  wifiErrorFromUnknown,
  type DiscoveredLanRobot,
  type HotspotSighting,
  type LanDiscoveryPayload,
  type WifiDiscoveryAdapter,
} from '../features/robot-lifecycle/wifiDiscoverySession';

type Props = {
  testID?: string;
  disabled?: boolean;
  currentHost: string;
  currentPort: string;
  onApplyAddress: (host: string, port: number) => void;
  releaseRef?: { current: () => void };
  adapter?: WifiDiscoveryAdapter;
};

const EMPTY_SIGHTING: HotspotSighting = {
  matches: [],
  currentSsid: null,
  unrelatedCurrent: false,
  otherCount: 0,
  apply: null,
};

export function WifiDiscoveryPanel({
  testID = 'connection-wifi-discovery',
  disabled = false,
  currentHost,
  currentPort,
  onApplyAddress,
  releaseRef,
  adapter = wifiDiscoveryAdapter,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const [state, setState] = useState<WifiPanelState>(initialWifiPanelState);
  const stateRef = useRef(state);
  const requestRef = useRef(0);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const hostRef = useRef(currentHost);
  const portRef = useRef(currentPort);
  stateRef.current = state;
  hostRef.current = currentHost;
  portRef.current = currentPort;

  const dispatch = (event: Parameters<typeof reduceWifiPanel>[1]) => {
    setState(current => reduceWifiPanel(current, event));
  };
  const currentRequest = (id: number) => mountedRef.current && requestRef.current === id;

  const stopLanScan = () => {
    if (typeof adapter.stopLanDiscovery === 'function') {
      void adapter.stopLanDiscovery().catch(() => {});
    }
  };

  const releaseNetwork = () => {
    const holding = stateRef.current.holding || (stateRef.current.phase === 'loading' && stateRef.current.action === 'join');
    if (!holding) return;
    if (mountedRef.current) setState(current => reduceWifiPanel(current, { type: 'release' }));
    void adapter.releaseJoinedNetwork();
  };
  const releaseNetworkRef = useRef(releaseNetwork);
  releaseNetworkRef.current = releaseNetwork;

  useEffect(() => {
    mountedRef.current = true;
    if (releaseRef) releaseRef.current = () => releaseNetworkRef.current();
    const subscription = AppState.addEventListener('change', next => {
      if (stateRef.current.phase !== 'loading') return;
      // Android reports the system hotspot join dialog as background.
      // Keep the join until that native call settles; stop searches on background.
      if (stateRef.current.action === 'join') return;
      if (!shouldInterruptWifiDiscoveryForAppState(next)) return;
      requestRef.current += 1;
      pendingRef.current = false;
      stopLanScan();
      setState(current => reduceWifiPanel(current, { type: 'interrupt' }));
    });
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
      pendingRef.current = false;
      stopLanScan();
      subscription.remove();
      if (releaseRef) releaseRef.current = () => {};
    };
  }, [adapter, releaseRef]);

  const applyHotspot = (rule: RobotHotspotRule, manual: boolean) => {
    onApplyAddress(rule.host, rule.port);
    if (manual) dispatch({ type: 'fill-hotspot', rule });
  };

  const selectLanRobot = (robot: DiscoveredLanRobot) => {
    if (stateRef.current.holding && robot.host !== ROBOT_HOTSPOT_HOST) {
      releaseNetworkRef.current();
    }
    onApplyAddress(robot.host, robot.port);
    dispatch({ type: 'select-lan', robot });
  };

  const publishSearch = (
    sighting: HotspotSighting,
    lanRobots: readonly DiscoveredLanRobot[],
    throttled = false,
  ) => {
    const reconciled = reconcileDiscoveryResults(sighting, lanRobots, hostRef.current, portRef.current);
    const applyCandidate = reconciled.lanRobots.length === 0 ? reconciled.sighting.apply : null;
    const autoApplied = autoApplyHotspot(hostRef.current, portRef.current, applyCandidate);
    if (autoApplied) applyHotspot(autoApplied, false);
    const appliedEndpoint: AppliedDiscoveryEndpoint | null = autoApplied
      ? { host: autoApplied.host, port: autoApplied.port }
      : null;
    dispatch({
      type: 'search',
      sighting: reconciled.sighting,
      lanRobots: reconciled.lanRobots,
      hotspotMetadata: reconciled.hotspotMetadata,
      throttled,
      appliedEndpoint,
    });
  };

  const run = async (action: 'search' | 'join', work: (id: number) => Promise<void>) => {
    if (disabled || pendingRef.current || AppState.currentState !== 'active') return;
    const id = ++requestRef.current;
    pendingRef.current = true;
    dispatch({ type: 'start', action });
    try {
      await work(id);
    } catch (error) {
      if (currentRequest(id)) dispatch({ type: 'error', code: wifiErrorFromUnknown(error).code });
    } finally {
      if (id === requestRef.current) pendingRef.current = false;
    }
  };

  const runLanDiscovery = (): Promise<LanDiscoveryPayload> => {
    if (adapter.canDiscoverLan === false || typeof adapter.discoverLanRobots !== 'function') {
      return Promise.resolve({ robots: [], timedOut: false });
    }
    return adapter.discoverLanRobots(DEFAULT_LAN_DISCOVERY_TIMEOUT_MS);
  };

  const search = () => run('search', async id => {
    if (adapter.platform === 'android-scan') {
      const [wifiOutcome, lanOutcome] = await Promise.allSettled([
        Promise.all([
          adapter.scan(),
          adapter.currentSsid().catch(() => null),
        ]),
        runLanDiscovery(),
      ]);
      if (!currentRequest(id)) return;
      const lanRobots = lanOutcome.status === 'fulfilled' ? lanOutcome.value.robots : [];
      if (wifiOutcome.status === 'fulfilled') {
        const [payload, currentSsid] = wifiOutcome.value;
        publishSearch(interpretAndroidScan(payload.ssids, currentSsid), lanRobots, payload.throttled);
        return;
      }
      if (lanRobots.length > 0) {
        publishSearch(EMPTY_SIGHTING, lanRobots, false);
        return;
      }
      throw wifiOutcome.reason;
    }

    if (adapter.platform === 'ios-current') {
      const [currentOutcome, lanOutcome] = await Promise.allSettled([
        adapter.currentSsid(),
        runLanDiscovery(),
      ]);
      if (!currentRequest(id)) return;
      const lanRobots = lanOutcome.status === 'fulfilled' ? lanOutcome.value.robots : [];
      if (currentOutcome.status === 'fulfilled') {
        publishSearch(interpretCurrentNetwork(currentOutcome.value), lanRobots, false);
        return;
      }
      if (lanRobots.length > 0) {
        publishSearch(EMPTY_SIGHTING, lanRobots, false);
        return;
      }
      throw currentOutcome.reason;
    }

    throw wifiErrorFromUnknown(null, 'unsupported');
  });

  const join = (rule: RobotHotspotRule) => run('join', async id => {
    const result = await adapter.joinKnownHotspot(rule.ssid);
    if (!currentRequest(id)) return;
    if (result !== 'cancelled') applyHotspot(rule, false);
    dispatch({ type: 'join', result, rule });
  });

  const stop = () => {
    if (state.phase !== 'loading' || state.action === 'join') return;
    requestRef.current += 1;
    pendingRef.current = false;
    stopLanScan();
    dispatch({ type: 'stop' });
  };

  const loading = state.phase === 'loading';
  const searching = loading && state.action === 'search';
  const status = wifiStatusText(state);
  const hint = wifiDiscoveryHint(adapter.platform);
  const lanRobots = state.lanRobots;
  const discoveredHotspots = state.sighting?.matches ?? [];
  const hasLanApEndpoint = lanRobots.some(robot => robot.host === ROBOT_HOTSPOT_HOST);
  const hotspots = adapter.platform === 'ios-current' && discoveredHotspots.length === 0 && !hasLanApEndpoint
    ? ROBOT_HOTSPOT_RULES
    : discoveredHotspots;

  const panelSurface = appearance.surface ?? colors.surface ?? colors.background;
  const cardSurface = colors.background;
  const borderColor = appearance.border ?? colors.line ?? '#343432';
  const primaryBg = appearance.action ?? appearance.blue ?? '#98D1FF';
  const primaryInk = appearance.actionInk ?? appearance.blueInk ?? appearance.ink;
  const badgeBg = appearance.blueSoft ?? panelSurface;
  const badgeInk = appearance.blueInk ?? appearance.ink;

  const actionButton = (label: string, id: string, press: () => void, blocked = false, primary = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked || disabled, busy: loading }}
      disabled={blocked || disabled}
      onPress={press}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? primaryBg : cardSurface,
          borderColor,
          borderWidth: primary ? 0 : 1,
        },
        pressed && styles.pressed,
        (blocked || disabled) && styles.disabled,
      ]}
      testID={id}
    >
      <Text style={[typography.label, { color: primary ? primaryInk : appearance.ink }]}>{label}</Text>
    </Pressable>
  );

  const badge = (label: string, id: string) => (
    <View style={[styles.badge, { backgroundColor: badgeBg }]} testID={id}>
      <Text style={[typography.supporting, { color: badgeInk }]}>{label}</Text>
    </View>
  );

  const lanCard = (robot: DiscoveredLanRobot) => {
    const key = `${robot.host}:${robot.port}`;
    const selected = sameLanEndpoint(currentHost, currentPort, robot);
    const showRobotId = Boolean(robot.robotId && robot.robotId !== robot.displayName);
    return (
      <View
        key={key}
        style={[styles.card, { backgroundColor: cardSurface, borderColor }]}
        testID={`wifi-discovery-lan-${key}`}
      >
        <View style={styles.cardHeader}>
          <Text style={[typography.label, { color: appearance.ink, flex: 1 }]} testID={`wifi-discovery-lan-title-${key}`}>
            {robot.displayName}
          </Text>
          {selected ? badge('已选', `wifi-discovery-lan-selected-${key}`) : null}
        </View>
        {showRobotId ? (
          <Text style={[typography.supporting, { color: appearance.secondary }]} testID={`wifi-discovery-lan-id-${key}`}>
            {robot.robotId}
          </Text>
        ) : null}
        <Text style={[typography.supporting, styles.endpoint, { color: appearance.ink }]} testID={`wifi-discovery-lan-address-${key}`}>
          {robot.host}:{robot.port}
        </Text>
        {!selected ? actionButton('选用此设备', `wifi-discovery-lan-use-${key}`, () => selectLanRobot(robot)) : null}
      </View>
    );
  };

  const activeHotspotSsid = state.holding
    ? state.joinedSsid
    : matchRobotHotspot(state.sighting?.currentSsid)?.ssid ?? null;

  const hotspotCard = (rule: RobotHotspotRule) => {
    const onNetwork = normalizeSsid(state.sighting?.currentSsid) === rule.ssid
      || (state.holding && state.joinedSsid === rule.ssid);
    const discovered = discoveredHotspots.some(match => match.ssid === rule.ssid);
    const preset = adapter.platform === 'ios-current' && !discovered;
    const selected = sameHotspotEndpoint(currentHost, currentPort, rule);
    const showSelectedBadge = selected && (!activeHotspotSsid || activeHotspotSsid === rule.ssid);
    const mergedLan = state.hotspotMetadata[rule.ssid];
    const title = mergedLan?.displayName ?? rule.label;
    const subtitle = mergedLan?.robotId && mergedLan.robotId !== title
      ? `${rule.ssid} · ${mergedLan.robotId}`
      : rule.ssid;
    return (
      <View
        key={rule.ssid}
        style={[styles.card, { backgroundColor: cardSurface, borderColor }]}
        testID={`wifi-discovery-match-${rule.ssid}`}
      >
        <View style={styles.cardHeader}>
          <Text style={[typography.label, { color: appearance.ink, flex: 1 }]} testID={`wifi-discovery-title-${rule.ssid}`}>
            {title}
          </Text>
          <View style={styles.badges}>
            {preset ? badge('默认热点', `wifi-discovery-preset-${rule.ssid}`) : null}
            {onNetwork ? badge('已连接', `wifi-discovery-connected-${rule.ssid}`) : null}
            {showSelectedBadge ? badge('已选', `wifi-discovery-selected-${rule.ssid}`) : null}
          </View>
        </View>
        <Text style={[typography.supporting, { color: appearance.secondary }]} testID={`wifi-discovery-ssid-${rule.ssid}`}>
          {subtitle}
        </Text>
        <Text style={[typography.supporting, styles.endpoint, { color: appearance.ink }]} testID={`wifi-discovery-address-${rule.ssid}`}>
          {rule.host}:{rule.port}
        </Text>
        <View style={styles.actions}>
          {adapter.canJoinKnownHotspot && !onNetwork
            ? actionButton('加入此热点', `wifi-discovery-join-${rule.ssid}`, () => join(rule), loading)
            : null}
          {!selected
            ? actionButton('使用此地址', `wifi-discovery-fill-${rule.ssid}`, () => applyHotspot(rule, true))
            : null}
        </View>
      </View>
    );
  };

  return (
    <View accessibilityState={{ busy: loading }} style={[styles.block, { backgroundColor: panelSurface }]} testID={testID}>
      <Text style={[typography.label, { color: appearance.ink }]}>附近机器狗</Text>
      {hint ? (
        <Text style={[typography.supporting, { color: appearance.secondary }]} testID="wifi-discovery-hint">
          {hint}
        </Text>
      ) : null}
      {adapter.platform !== 'unsupported'
        ? actionButton(
            searching ? '停止搜索' : '搜索机器狗',
            'wifi-discovery-search',
            searching ? stop : search,
            loading && !searching,
            !searching,
          )
        : null}
      {status ? (
        <Text accessibilityLiveRegion="polite" style={[typography.supporting, { color: appearance.secondary }]} testID="wifi-discovery-status">
          {status}
        </Text>
      ) : null}
      {wifiSettingsAction(state.error)
        ? actionButton('打开设置', 'wifi-discovery-settings', () => { void Linking.openSettings(); })
        : null}
      {lanRobots.length > 0 ? (
        <View style={styles.section} testID="wifi-discovery-lan-section">
          <Text style={[typography.supporting, { color: appearance.secondary }]}>局域网设备</Text>
          {lanRobots.map(lanCard)}
        </View>
      ) : null}
      {hotspots.length > 0 ? (
        <View style={styles.section} testID="wifi-discovery-hotspot-section">
          <Text style={[typography.supporting, { color: appearance.secondary }]}>机器狗热点</Text>
          {hotspots.map(hotspotCard)}
        </View>
      ) : null}
      {state.holding
        ? actionButton('恢复原网络', 'wifi-discovery-release', () => releaseNetworkRef.current())
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: 20, gap: 12, padding: 16 },
  section: { gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  badges: { flexDirection: 'row', gap: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  endpoint: { fontVariant: ['tabular-nums'] },
  actions: { gap: 8 },
  button: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.5 },
});
