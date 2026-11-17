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
  wifiJoinOffer,
  wifiSettingsAction,
  wifiStatusText,
  type WifiPanelState,
} from '../features/robot-lifecycle/wifiDiscoveryCopy';
import { ROBOT_HOTSPOT_RULES, autoApplyHotspot, normalizeSsid, type RobotHotspotRule } from '../features/robot-lifecycle/robotHotspotRules';
import { wifiDiscoveryAdapter } from '../features/robot-lifecycle/wifiDiscoveryAdapter';
import {
  interpretAndroidScan,
  interpretCurrentNetwork,
  wifiErrorFromUnknown,
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
  const releaseNetwork = () => {
    const holding = stateRef.current.holding || stateRef.current.phase === 'loading' && stateRef.current.action === 'join';
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
      if (next === 'active' || stateRef.current.phase !== 'loading') return;
      const joining = stateRef.current.action === 'join';
      requestRef.current += 1;
      pendingRef.current = false;
      setState(current => reduceWifiPanel(current, { type: 'interrupt' }));
      if (joining) void adapter.releaseJoinedNetwork();
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
      if (releaseRef) releaseRef.current = () => {};
    };
  }, [adapter, releaseRef]);

  const applyRule = (rule: RobotHotspotRule, manual: boolean) => {
    onApplyAddress(rule.host, rule.port);
    if (manual) dispatch({ type: 'fill', rule });
  };

  const publishSighting = (kind: 'scan' | 'current', sighting: ReturnType<typeof interpretAndroidScan>, throttled = false) => {
    const next = autoApplyHotspot(hostRef.current, portRef.current, sighting.apply);
    const same = Boolean(sighting.apply) && !next && hostRef.current.trim().toLowerCase() === sighting.apply?.host && portRef.current.trim() === String(sighting.apply?.port);
    if (next) applyRule(next, false);
    const event = {
      sighting,
      applied: Boolean(next) || same,
      needsConfirm: Boolean(sighting.apply) && !next && !same,
    };
    dispatch(kind === 'scan' ? { type: 'scan', throttled, ...event } : { type: 'current', ...event });
  };

  const run = async (action: 'scan' | 'current' | 'join', work: (id: number) => Promise<void>) => {
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

  const search = () => run('scan', async id => {
    const [payload, currentSsid] = await Promise.all([
      adapter.scan(),
      adapter.currentSsid().catch(() => null),
    ]);
    if (!currentRequest(id)) return;
    publishSighting('scan', interpretAndroidScan(payload.ssids, currentSsid), payload.throttled);
  });

  const checkCurrent = () => run('current', async id => {
    const currentSsid = await adapter.currentSsid();
    if (!currentRequest(id)) return;
    publishSighting('current', interpretCurrentNetwork(currentSsid));
  });

  const join = (rule: RobotHotspotRule) => run('join', async id => {
    const result = await adapter.joinKnownHotspot(rule.ssid);
    if (!currentRequest(id)) return;
    if (result !== 'cancelled') applyRule(rule, false);
    dispatch({ type: 'join', result, rule });
  });

  const stop = () => {
    if (state.phase !== 'loading' || state.action === 'join') return;
    requestRef.current += 1;
    pendingRef.current = false;
    dispatch({ type: 'stop' });
  };

  const loading = state.phase === 'loading';
  const status = wifiStatusText(state, adapter.platform);
  const known = adapter.platform === 'ios-current' ? ROBOT_HOTSPOT_RULES : state.sighting?.matches ?? [];
  const button = (label: string, id: string, press: () => void, blocked = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked || disabled, busy: loading }}
      disabled={blocked || disabled}
      onPress={press}
      style={({ pressed }) => [styles.button, { backgroundColor: colors.background }, pressed && styles.pressed, (blocked || disabled) && styles.disabled]}
      testID={id}
    >
      <Text style={[typography.label, { color: appearance.ink }]}>{label}</Text>
    </Pressable>
  );

  const card = (rule: RobotHotspotRule) => {
    const onNetwork = normalizeSsid(state.sighting?.currentSsid) === rule.ssid || (state.holding && state.joinResult === 'joined');
    const discovered = state.sighting?.matches.some(match => match.ssid === rule.ssid) === true;
    const needsConfirm = discovered && currentHost.trim().length > 0 && currentHost.trim().toLowerCase() !== rule.host;
    return <View key={rule.ssid} style={[styles.match, { backgroundColor: colors.background }]} testID={`wifi-discovery-match-${rule.ssid}`}>
      <Text style={[typography.label, { color: appearance.ink }]}>{rule.label}</Text>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>{rule.ssid}</Text>
      <Text style={[typography.supporting, { color: appearance.ink }]} testID={`wifi-discovery-address-${rule.ssid}`}>{rule.host}:{rule.port}</Text>
      {onNetwork ? <Text style={[typography.supporting, { color: appearance.secondary }]}>手机已连上这个热点。</Text> : null}
      {discovered && !needsConfirm ? <Text style={[typography.supporting, { color: appearance.secondary }]}>已填入此地址。</Text> : null}
      {needsConfirm ? button('改用此地址', `wifi-discovery-fill-${rule.ssid}`, () => applyRule(rule, true)) : null}
      {!discovered ? button('填入此地址', `wifi-discovery-fill-${rule.ssid}`, () => applyRule(rule, true)) : null}
      {adapter.canJoinKnownHotspot && !onNetwork ? <>
        {button('加入此热点', `wifi-discovery-join-${rule.ssid}`, () => join(rule), loading)}
        <Text style={[typography.supporting, { color: appearance.secondary }]}>{wifiJoinOffer}</Text>
      </> : null}
    </View>;
  };

  return <View accessibilityState={{ busy: loading }} style={styles.block} testID={testID}>
    <Text style={[typography.label, { color: appearance.ink }]}>用 Wi-Fi 寻找</Text>
    <Text style={[typography.supporting, { color: appearance.secondary }]} testID="wifi-discovery-hint">{wifiDiscoveryHint(adapter.platform)}</Text>
    {adapter.platform === 'android-scan' ? button(loading && state.action === 'scan' ? '停止搜索' : '搜索附近热点', 'wifi-discovery-scan', loading && state.action === 'scan' ? stop : search, loading && state.action !== 'scan') : null}
    {adapter.platform === 'ios-current' ? button(loading && state.action === 'current' ? '停止检查' : '检查当前 Wi-Fi', 'wifi-discovery-current', loading && state.action === 'current' ? stop : checkCurrent, loading && state.action !== 'current') : null}
    {status ? <Text accessibilityLiveRegion="polite" style={[typography.supporting, { color: appearance.secondary }]} testID="wifi-discovery-status">{status}</Text> : null}
    {wifiSettingsAction(state.error) ? button('打开系统设置', 'wifi-discovery-settings', () => { void Linking.openSettings(); }) : null}
    {known.map(card)}
    {state.holding ? button('恢复原网络', 'wifi-discovery-release', () => releaseNetworkRef.current()) : null}
  </View>;
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  match: { borderRadius: 12, gap: 8, padding: 12 },
  button: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.5 },
});
