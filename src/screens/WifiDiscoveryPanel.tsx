import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Linking, Pressable, StyleSheet, View } from 'react-native';
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
  LEGACY_ROBOT_HOTSPOT_SSID,
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

const FSD_RADAR = {
  sheet: '#1C1C1C',
  card: '#222222',
  cardSelected: '#2A2A2A',
  recessed: '#161616',
  activePill: '#303030',
  border: 'rgba(255, 255, 255, 0.08)',
  selectedEdge: 'rgba(255, 255, 255, 0.20)',
  ink: '#F2F2F2',
  muted: '#9A9A9A',
  cta: '#F2F2F2',
  ctaInk: '#141414',
  stopBg: '#303030',
  stopInk: '#F2F2F2',
  ghostBg: '#2A2A2A',
  badgeBg: '#303030',
  badgeInk: '#F2F2F2',
  channelBg: 'rgba(255, 255, 255, 0.08)',
  channelInk: '#B8B8B8',
  connectedBg: 'rgba(52, 211, 153, 0.16)',
  connectedInk: '#34D399',
  emerald: '#34D399',
  amber: '#F59E0B',
  radarWell: '#222222',
  radarPulse: 'rgba(255, 255, 255, 0.36)',
  radarCoreIdle: '#F2F2F2',
  radarCoreActive: '#34D399',
  barInactive: 'rgba(255, 255, 255, 0.16)',
} as const;

const SIGNAL_BAR_HEIGHTS = [4, 7, 10, 13] as const;

const AnimatedView = Animated?.View ?? View;
const HAS_RN_ANIMATED = typeof Animated?.Value === 'function'
  && typeof Animated?.loop === 'function'
  && typeof Animated?.timing === 'function'
  && typeof Animated?.sequence === 'function';

type Props = {
  testID?: string;
  disabled?: boolean;
  embedded?: boolean;
  surfaceTone?: 'auto' | 'dark';
  currentHost: string;
  currentPort: string;
  onApplyAddress: (host: string, port: number) => void;
  onQuickConnect?: (host: string, port: number) => void;
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

function SignalBars({
  level,
  activeColor,
  inactiveColor,
}: {
  level: 1 | 2 | 3 | 4;
  activeColor: string;
  inactiveColor: string;
}) {
  return (
    <View accessible={false} style={styles.signalBars}>
      {SIGNAL_BAR_HEIGHTS.map((barHeight, idx) => (
        <View
          key={barHeight}
          style={[
            styles.signalBar,
            {
              height: barHeight,
              backgroundColor: idx < level ? activeColor : inactiveColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function WifiDiscoveryPanel({
  testID = 'connection-wifi-discovery',
  disabled = false,
  embedded = false,
  surfaceTone = 'auto',
  currentHost,
  currentPort,
  onApplyAddress,
  onQuickConnect,
  releaseRef,
  adapter = wifiDiscoveryAdapter,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const useDark = surfaceTone === 'dark' || isDark;
  const appearance = getProductAppearance(useDark);
  const [state, setState] = useState<WifiPanelState>(initialWifiPanelState);
  const stateRef = useRef(state);
  const requestRef = useRef(0);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);
  const hostRef = useRef(currentHost);
  const portRef = useRef(currentPort);
  const pulseARef = useRef(HAS_RN_ANIMATED ? new Animated.Value(0) : null);
  const pulseBRef = useRef(HAS_RN_ANIMATED ? new Animated.Value(0) : null);
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

  const loading = state.phase === 'loading';
  const searching = loading && state.action === 'search';

  useEffect(() => {
    if (!HAS_RN_ANIMATED || !pulseARef.current || !pulseBRef.current) return undefined;
    const pulseA = pulseARef.current;
    const pulseB = pulseBRef.current;
    if (!searching) {
      pulseA.stopAnimation?.();
      pulseB.stopAnimation?.();
      pulseA.setValue(0);
      pulseB.setValue(0);
      return undefined;
    }
    const easeOut = typeof Easing?.out === 'function' && Easing.cubic ? Easing.out(Easing.cubic) : undefined;
    const makeWave = (value: Animated.Value, delayMs: number) => Animated.loop(
      Animated.sequence([
        ...(delayMs > 0 && typeof Animated.delay === 'function' ? [Animated.delay(delayMs)] : []),
        Animated.timing(value, {
          toValue: 1,
          duration: 1400,
          easing: easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    const loopA = makeWave(pulseA, 0);
    const loopB = makeWave(pulseB, 650);
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
      pulseA.setValue(0);
      pulseB.setValue(0);
    };
  }, [searching]);

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

  const status = wifiStatusText(state);
  const hint = wifiDiscoveryHint(adapter.platform);
  const lanRobots = state.lanRobots;
  const discoveredHotspots = state.sighting?.matches ?? [];
  const hasLanApEndpoint = lanRobots.some(robot => robot.host === ROBOT_HOTSPOT_HOST);
  const hotspots = adapter.platform === 'ios-current' && discoveredHotspots.length === 0 && !hasLanApEndpoint
    ? ROBOT_HOTSPOT_RULES
    : discoveredHotspots;

  const panelSurface = useDark ? FSD_RADAR.sheet : (appearance.surface ?? colors.surface ?? colors.background);
  const cardSurface = useDark ? FSD_RADAR.card : colors.background;
  const cardSelectedBg = useDark ? FSD_RADAR.cardSelected : cardSurface;
  const recessedSurface = useDark ? FSD_RADAR.recessed : 'rgba(0, 0, 0, 0.04)';
  const inkColor = useDark ? FSD_RADAR.ink : appearance.ink;
  const secondaryColor = useDark ? FSD_RADAR.muted : appearance.secondary;
  const primaryBg = useDark ? FSD_RADAR.cta : (appearance.action ?? '#141414');
  const primaryInk = useDark ? FSD_RADAR.ctaInk : (appearance.actionInk ?? '#FFFFFF');
  const ghostBg = useDark ? FSD_RADAR.ghostBg : 'rgba(0, 0, 0, 0.06)';
  const badgeBg = useDark ? FSD_RADAR.badgeBg : (appearance.blueSoft ?? panelSurface);
  const badgeInk = useDark ? FSD_RADAR.badgeInk : (appearance.blueInk ?? appearance.ink);
  const channelBg = useDark ? FSD_RADAR.channelBg : 'rgba(0, 0, 0, 0.06)';
  const channelInk = useDark ? FSD_RADAR.channelInk : secondaryColor;
  const inactiveBarColor = useDark ? FSD_RADAR.barInactive : 'rgba(0, 0, 0, 0.14)';

  const actionButton = (
    label: string,
    id: string,
    press: () => void,
    blocked = false,
    variant: 'primary' | 'secondary' | 'stop' = 'secondary',
    compact = false,
  ) => {
    const bg = variant === 'primary'
      ? primaryBg
      : variant === 'stop'
        ? (useDark ? FSD_RADAR.stopBg : ghostBg)
        : ghostBg;
    const fg = variant === 'primary'
      ? primaryInk
      : variant === 'stop'
        ? (useDark ? FSD_RADAR.stopInk : inkColor)
        : inkColor;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: blocked || disabled, busy: loading }}
        disabled={blocked || disabled}
        onPress={press}
        style={({ pressed }) => [
          styles.button,
          compact && styles.buttonCompact,
          { backgroundColor: bg },
          pressed && styles.pressed,
          (blocked || disabled) && styles.disabled,
        ]}
        testID={id}
      >
        <Text numberOfLines={1} style={[typography.label, styles.buttonText, { color: fg }]}>{label}</Text>
      </Pressable>
    );
  };

  const badge = (label: string, id: string, tone: 'default' | 'connected' | 'channel' = 'default') => (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: tone === 'connected'
            ? (useDark ? FSD_RADAR.connectedBg : badgeBg)
            : tone === 'channel'
              ? channelBg
              : badgeBg,
        },
      ]}
      testID={id}
    >
      <Text
        numberOfLines={1}
        style={[
          typography.supporting,
          styles.badgeText,
          {
            color: tone === 'connected'
              ? (useDark ? FSD_RADAR.connectedInk : badgeInk)
              : tone === 'channel'
                ? channelInk
                : badgeInk,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );

  const pulseStyle = (anim: Animated.Value | null) => {
    if (!anim || !HAS_RN_ANIMATED || typeof anim.interpolate !== 'function') return null;
    return {
      opacity: anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.6, 0] }),
      transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.65, 2.05] }) }],
    };
  };

  const lanCard = (robot: DiscoveredLanRobot) => {
    const key = `${robot.host}:${robot.port}`;
    const selected = sameLanEndpoint(currentHost, currentPort, robot);
    const showRobotId = Boolean(robot.robotId && robot.robotId !== robot.displayName);
    return (
      <View
        key={key}
        style={[
          styles.card,
          { backgroundColor: selected ? cardSelectedBg : cardSurface },
          selected && useDark && styles.cardSelectedRing,
        ]}
        testID={`wifi-discovery-lan-${key}`}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.itemDot, { backgroundColor: selected ? FSD_RADAR.emerald : FSD_RADAR.ink }]} />
          <Text numberOfLines={1} style={[typography.label, styles.cardTitle, { color: inkColor }]} testID={`wifi-discovery-lan-title-${key}`}>
            {robot.displayName}
          </Text>
          <View style={styles.cardHeaderRight}>
            <SignalBars
              level={4}
              activeColor={selected ? FSD_RADAR.emerald : inkColor}
              inactiveColor={inactiveBarColor}
            />
            {badge('局域网', `wifi-discovery-lan-channel-${key}`, 'channel')}
            {selected ? badge('已选', `wifi-discovery-lan-selected-${key}`) : null}
          </View>
        </View>
        <View style={styles.cardMetaRow}>
          {showRobotId ? (
            <Text numberOfLines={1} style={[typography.supporting, styles.metaText, { color: secondaryColor }]} testID={`wifi-discovery-lan-id-${key}`}>
              {robot.robotId}
            </Text>
          ) : null}
          <Text numberOfLines={1} style={[typography.supporting, styles.endpoint, { color: inkColor }]} testID={`wifi-discovery-lan-address-${key}`}>
            {robot.host}:{robot.port}
          </Text>
        </View>
        {!selected ? (
          actionButton(
            onQuickConnect ? '一键连接' : '选用此设备',
            `wifi-discovery-lan-use-${key}`,
            () => {
              selectLanRobot(robot);
              onQuickConnect?.(robot.host, robot.port);
            },
            false,
            onQuickConnect ? 'primary' : 'secondary',
            true,
          )
        ) : onQuickConnect ? (
          actionButton('一键连接', `wifi-discovery-lan-connect-${key}`, () => onQuickConnect(robot.host, robot.port), false, 'primary', true)
        ) : null}
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
    const channelLabel = rule.ssid === LEGACY_ROBOT_HOTSPOT_SSID ? '5GHz 热点' : '热点';
    const barLevel: 1 | 2 | 3 | 4 = onNetwork ? 4 : discovered ? 3 : 2;
    return (
      <View
        key={rule.ssid}
        style={[
          styles.card,
          { backgroundColor: selected || onNetwork ? cardSelectedBg : cardSurface },
          (selected || onNetwork) && useDark && styles.cardSelectedRing,
        ]}
        testID={`wifi-discovery-match-${rule.ssid}`}
      >
        <View style={styles.cardHeader}>
          <View style={[styles.itemDot, { backgroundColor: onNetwork ? FSD_RADAR.emerald : selected ? FSD_RADAR.ink : secondaryColor }]} />
          <Text numberOfLines={1} style={[typography.label, styles.cardTitle, { color: inkColor }]} testID={`wifi-discovery-title-${rule.ssid}`}>
            {title}
          </Text>
          <View style={styles.cardHeaderRight}>
            <SignalBars
              level={barLevel}
              activeColor={onNetwork ? FSD_RADAR.emerald : selected ? inkColor : secondaryColor}
              inactiveColor={inactiveBarColor}
            />
            {badge(channelLabel, `wifi-discovery-channel-${rule.ssid}`, 'channel')}
            {preset ? badge('默认热点', `wifi-discovery-preset-${rule.ssid}`) : null}
            {onNetwork ? badge('已连接', `wifi-discovery-connected-${rule.ssid}`, 'connected') : null}
            {showSelectedBadge ? badge('已选', `wifi-discovery-selected-${rule.ssid}`) : null}
          </View>
        </View>
        <View style={styles.cardMetaRow}>
          <Text numberOfLines={1} style={[typography.supporting, styles.metaText, { color: secondaryColor }]} testID={`wifi-discovery-ssid-${rule.ssid}`}>
            {subtitle}
          </Text>
          <Text numberOfLines={1} style={[typography.supporting, styles.endpoint, { color: inkColor }]} testID={`wifi-discovery-address-${rule.ssid}`}>
            {rule.host}:{rule.port}
          </Text>
        </View>
        {(adapter.canJoinKnownHotspot && !onNetwork) || !selected || onQuickConnect ? (
          <View style={styles.actionsRow}>
            {adapter.canJoinKnownHotspot && !onNetwork
              ? actionButton('加入此热点', `wifi-discovery-join-${rule.ssid}`, () => join(rule), loading, 'secondary', true)
              : null}
            {!selected
              ? actionButton(
                onQuickConnect ? '一键连接' : '使用此地址',
                `wifi-discovery-fill-${rule.ssid}`,
                () => {
                  applyHotspot(rule, true);
                  onQuickConnect?.(rule.host, rule.port);
                },
                false,
                onQuickConnect ? 'primary' : 'secondary',
                true,
              )
              : onQuickConnect
                ? actionButton('一键连接', `wifi-discovery-connect-${rule.ssid}`, () => onQuickConnect(rule.host, rule.port), false, 'primary', true)
                : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View
      accessibilityState={{ busy: loading }}
      style={[
        styles.block,
        embedded
          ? styles.blockEmbedded
          : { backgroundColor: panelSurface, borderColor: useDark ? FSD_RADAR.border : 'rgba(0, 0, 0, 0.08)' },
      ]}
      testID={testID}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.radarRing, { backgroundColor: useDark ? FSD_RADAR.radarWell : badgeBg }]}>
            {searching && HAS_RN_ANIMATED ? (
              <>
                <AnimatedView
                  pointerEvents="none"
                  style={[styles.radarPulseRing, { borderColor: FSD_RADAR.radarPulse }, pulseStyle(pulseARef.current)]}
                />
                <AnimatedView
                  pointerEvents="none"
                  style={[styles.radarPulseRing, { borderColor: FSD_RADAR.radarPulse }, pulseStyle(pulseBRef.current)]}
                />
              </>
            ) : null}
            <View style={[styles.radarCore, { backgroundColor: searching ? FSD_RADAR.radarCoreActive : (useDark ? FSD_RADAR.radarCoreIdle : badgeInk) }]} />
          </View>
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={[typography.label, styles.panelTitle, { color: inkColor }]}>
              {embedded ? '局域网与机器狗热点' : '热点扫描'}
            </Text>
            {hint ? (
              <Text numberOfLines={1} style={[typography.supporting, styles.subText, { color: secondaryColor }]} testID="wifi-discovery-hint">
                {hint}
              </Text>
            ) : null}
          </View>
        </View>
        {adapter.platform !== 'unsupported' ? (
          <View style={styles.headerAction}>
            {actionButton(
              searching ? '停止搜索' : '搜索机器狗',
              'wifi-discovery-search',
              searching ? stop : search,
              loading && !searching,
              searching ? 'stop' : 'primary',
            )}
          </View>
        ) : null}
      </View>

      {status ? (
        <View style={[styles.statusStrip, { backgroundColor: recessedSurface }]}>
          <View style={[styles.statusDot, { backgroundColor: searching ? FSD_RADAR.ink : state.error ? FSD_RADAR.amber : FSD_RADAR.emerald }]} />
          <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.statusText, { color: secondaryColor }]} testID="wifi-discovery-status">
            {status}
          </Text>
        </View>
      ) : null}

      {wifiSettingsAction(state.error)
        ? actionButton('打开设置', 'wifi-discovery-settings', () => { void Linking.openSettings(); })
        : null}

      {lanRobots.length > 0 ? (
        <View style={styles.section} testID="wifi-discovery-lan-section">
          <Text numberOfLines={1} style={[typography.supporting, styles.sectionTitle, { color: secondaryColor }]}>局域网</Text>
          {lanRobots.map(lanCard)}
        </View>
      ) : null}

      {hotspots.length > 0 ? (
        <View style={styles.section} testID="wifi-discovery-hotspot-section">
          <Text numberOfLines={1} style={[typography.supporting, styles.sectionTitle, { color: secondaryColor }]}>机器狗热点</Text>
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
  block: { borderRadius: 20, borderWidth: 1, gap: 12, padding: 16 },
  blockEmbedded: { backgroundColor: 'transparent', borderRadius: 0, borderWidth: 0, gap: 10, paddingHorizontal: 0, paddingVertical: 6 },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  headerLeft: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, minWidth: 0 },
  headerCopy: { flex: 1, gap: 2, minWidth: 0 },
  headerAction: { flexShrink: 0 },
  radarRing: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', overflow: 'visible', width: 32 },
  radarPulseRing: { borderRadius: 16, borderWidth: 1.5, height: 24, position: 'absolute', width: 24 },
  radarCore: { borderRadius: 4.5, height: 9, width: 9 },
  panelTitle: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  subText: { fontSize: 12, lineHeight: 16 },
  statusStrip: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 8, paddingHorizontal: 11, paddingVertical: 8 },
  statusDot: { borderRadius: 3.5, height: 7, width: 7 },
  statusText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.3, lineHeight: 15 },
  card: { borderRadius: 10, gap: 8, padding: 12 },
  cardSelectedRing: { borderColor: FSD_RADAR.selectedEdge, borderWidth: 1 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  cardHeaderRight: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 6 },
  itemDot: { borderRadius: 3.5, height: 7, width: 7 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  cardMetaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  metaText: { fontSize: 12, lineHeight: 16 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '600', lineHeight: 14 },
  signalBars: { alignItems: 'flex-end', flexDirection: 'row', gap: 2, height: 13 },
  signalBar: { borderRadius: 1.5, width: 3 },
  endpoint: { fontSize: 12.5, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 17 },
  actionsRow: { flexDirection: 'row', gap: 8 },
  button: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
  buttonCompact: { flex: 1, minHeight: 38, paddingHorizontal: 10, paddingVertical: 7 },
  buttonText: { fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.44 },
});
