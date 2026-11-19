import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import { cardLayout, getProductAppearance } from '../appearance';
import { Text } from '../components/AppText';
import { PointCloudView, pointCloudEndpoint, type PointCloudStatus } from '../components/PointCloudView';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import {
  isLingtuStatusFresh, LingtuReadOnlyError, readLingtuMaps, validateLingtuOrigin, type LingtuMapLibrary,
} from '../services/lingtuReadOnly';

type Owner = Readonly<{ endpoint: string; allowLocalHttp: boolean }>;
type Reading = Readonly<{ owner: Owner; library: LingtuMapLibrary | null; busy: 'read' | 'open' | null; message: string }>;
type LiveCloud = Readonly<{ owner: Owner; endpoint: string; kind: 1 | 2 }>;
const now = () => {
  try { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : NaN; }
  catch { return NaN; }
};
const availability = (value: boolean | null) => value === true ? '已有' : value === false ? '未提供' : '未知';
const mapStates: Record<string, string> = { CREATED: '已创建', STALE: '已过期', READY: '就绪', ACTIVE: '使用中', RETIRED: '已停用', FAILED: '失败' };
const mapState = (value: string | null) => {
  const key = value?.toUpperCase();
  return key && Object.hasOwn(mapStates, key) ? mapStates[key] : '未知';
};
const coordinate = (value: number | null | undefined, unit: string) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} ${unit}` : '—';

export function LingtuMapsScreen({ endpoint, allowLocalHttp = false, onBack }: {
  endpoint: string; allowLocalHttp?: boolean; onBack?: () => void;
}) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const { width, height, fontScale } = useWindowDimensions();
  const [viewportWidth, setViewportWidth] = useState(0);
  const columns = width > height && viewportWidth >= 660 && fontScale <= 1.3;
  const owner = useRef<Owner>({ endpoint, allowLocalHttp });
  if (owner.current.endpoint !== endpoint || owner.current.allowLocalHttp !== allowLocalHttp) owner.current = { endpoint, allowLocalHttp };
  const captured = owner.current;
  const mounted = useRef(true), active = useRef(AppState.currentState === 'active');
  const operation = useRef(0), pending = useRef<AbortController | null>(null);
  const renderedOperation = operation.current;
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<LingtuMapLibrary | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [liveCloud, setLiveCloud] = useState<LiveCloud | null>(null);
  const [cloudStatus, setCloudStatus] = useState<Readonly<{ source: LiveCloud; value: PointCloudStatus }> | null>(null);
  const current = (id: number) => mounted.current && active.current && owner.current === captured && operation.current === id;
  const clearExpiry = () => { if (expiry.current !== null) clearTimeout(expiry.current); expiry.current = null; };
  const stop = () => { operation.current++; pending.current?.abort(); pending.current = null; clearExpiry(); latest.current = null; };
  const expire = () => {
    stop(); setSelectedName(null);
    setReading({ owner: captured, library: null, busy: null, message: '地图与定位状态已过期，请刷新' });
  };
  const refresh = async (initial = false) => {
    if (!mounted.current || !active.current || owner.current !== captured || pending.current || (!initial && operation.current !== renderedOperation)) return;
    stop(); const id = operation.current, controller = new AbortController(); pending.current = controller;
    setSelectedName(null); setReading({ owner: captured, library: null, busy: 'read', message: '读取中' });
    try {
      const result = await readLingtuMaps({ endpoint: captured.endpoint, allowLocalHttp: captured.allowLocalHttp, signal: controller.signal });
      if (!current(id) || controller.signal.aborted) return;
      if (!isLingtuStatusFresh(result)) { expire(); return; }
      latest.current = result;
      setSelectedName(result.maps.find(map => map.name === result.activeMapName)?.name ?? result.maps[0]?.name ?? null);
      setReading({ owner: captured, library: result, busy: null, message: '地图与定位状态已读取' });
      expiry.current = setTimeout(() => {
        if (mounted.current && active.current && owner.current === captured && latest.current === result) expire();
      }, Math.ceil(Math.max(0, result.observedAt + 15000 - now())));
    } catch (error) {
      if (current(id) && !controller.signal.aborted) setReading({ owner: captured, library: null, busy: null,
        message: error instanceof LingtuReadOnlyError ? error.message : '地图与定位读取失败，请检查服务后重试。' });
    } finally { if (current(id)) pending.current = null; }
  };
  useEffect(() => {
    mounted.current = true; active.current = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) return;
      stop(); setLiveCloud(null); setCloudStatus(null); setSelectedName(null); setReading({ owner: captured, library: null, busy: null, message: '读取已暂停，请重新打开点云或刷新地图' });
    });
    void refresh(true);
    return () => { mounted.current = false; stop(); subscription.remove(); };
  }, [captured]);

  const live = liveCloud?.owner === captured ? liveCloud : null;
  useEffect(() => {
    if (!live) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setLiveCloud(null); setCloudStatus(null); return true;
    });
    return () => subscription.remove();
  }, [live]);

  const view = reading?.owner === captured ? reading : null;
  const library = view?.library && isLingtuStatusFresh(view.library) ? view.library : null;
  const expired = !!view?.library && !library;
  const selected = library?.maps.find(map => map.name === selectedName) ?? null;
  const localization = library?.localization ?? null;
  const poseReady = localization?.ready === true && localization.poseFresh === true
    && [localization.x, localization.y, localization.yaw].every(value => typeof value === 'number' && Number.isFinite(value));
  const poseLabel = !localization ? '未知' : localization.poseFresh === false ? '定位数据已过期'
    : poseReady ? '定位已就绪' : localization.ready === false ? '定位未就绪' : '定位待核验';
  const cancel = () => {
    if (!mounted.current || owner.current !== captured || operation.current !== renderedOperation) return;
    stop(); setSelectedName(null); setReading({ owner: captured, library: null, busy: null, message: '本次操作已取消' });
  };
  const back = () => {
    if (!mounted.current || owner.current !== captured || operation.current !== renderedOperation || !onBack) return;
    stop(); setSelectedName(null); mounted.current = false; onBack();
  };
  const openLiveCloud = () => {
    if (!mounted.current || !active.current || owner.current !== captured || operation.current !== renderedOperation || pending.current) return;
    try {
      const endpoint = pointCloudEndpoint(captured.endpoint, captured.allowLocalHttp);
      stop(); setSelectedName(null); setCloudStatus(null);
      setReading({ owner: captured, library: null, busy: null, message: '已打开实时点云' });
      setLiveCloud({ owner: captured, endpoint, kind: 2 });
    } catch (error) {
      setReading({ owner: captured, library, busy: null, message: error instanceof LingtuReadOnlyError ? error.message : '点云服务地址无法使用。' });
    }
  };
  const openWorkbench = async () => {
    if (!mounted.current || !active.current || owner.current !== captured || operation.current !== renderedOperation || pending.current) return;
    if (!selected || !library || latest.current !== library) return;
    if (!isLingtuStatusFresh(library)) { expire(); return; }
    const title = '地图工作台', mapName = selected.name, openedLibrary = library;
    const id = ++operation.current, controller = new AbortController(); pending.current = controller;
    setReading({ owner: captured, library: openedLibrary, busy: 'open', message: `正在打开${title}` });
    let timedOut = false;
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = () => reject(new Error('aborted')); });
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
    try {
      const target = new URL('/', validateLingtuOrigin(captured.endpoint, captured.allowLocalHttp));
      target.searchParams.set('tab', 'map'); target.searchParams.set('observe', '1');
      if (mapName) target.searchParams.set('map', mapName);
      const request = fetch(target.toString(), { method: 'GET', headers: { Accept: 'text/html' },
        credentials: 'omit', redirect: 'error', signal: controller.signal }).then(response => {
        // Only headers are needed; release even a response arriving after cancellation.
        try { void response.body?.cancel().catch(() => {}); } catch {}
        return response;
      });
      const response = await Promise.race([request, aborted]);
      if (!current(id)) return;
      if (controller.signal.aborted) {
        setReading({ owner: captured, library: openedLibrary, busy: null, message: `${title}打开超时，请重试。` }); return;
      }
      if (response.redirected || (response.url && response.url !== target.toString())) {
        setReading({ owner: captured, library: openedLibrary, busy: null, message: `${title}响应无法识别。` }); return;
      }
      const message = response.status === 404 ? `${title}尚未部署。`
        : response.status === 401 || response.status === 403 ? `${title}拒绝访问，请检查授权。`
        : !response.ok ? `${title}暂不可用。`
        : !response.headers.get('content-type')?.toLowerCase().includes('text/html') ? `${title}响应无法识别。` : null;
      if (message) { setReading({ owner: captured, library: openedLibrary, busy: null, message }); return; }
      clearTimeout(timeout);
      if (openedLibrary && !isLingtuStatusFresh(openedLibrary)) { expire(); return; }
      const result = await WebBrowser.openBrowserAsync(target.toString(), { toolbarColor: appearance.canvas, controlsColor: appearance.blueInk });
      if (!current(id)) return;
      setReading({ owner: captured, library: openedLibrary, busy: null, message: result.type === 'opened' ? `已打开${title}`
        : result.type === 'cancel' || result.type === 'dismiss' ? '已返回地图列表' : `${title}未能打开。` });
    } catch (error) {
      if (current(id)) setReading({ owner: captured, library: openedLibrary, busy: null, message: timedOut ? `${title}打开超时，请重试。`
        : error instanceof LingtuReadOnlyError ? error.message : `无法打开${title}，请检查服务后重试。` });
    } finally {
      clearTimeout(timeout); controller.signal.removeEventListener('abort', rejectAbort); controller.abort();
      if (current(id)) pending.current = null;
    }
  };
  const row = (id: string, label: string, value: string) => <View key={id} style={styles.row} testID={`lingtu-maps-${id}`}>
    <Text style={[typography.supporting, { color: appearance.secondary }]}>{label}</Text>
    <Text style={[typography.label, styles.value, { color: appearance.ink }]}>{value}</Text>
  </View>;
  const list = <View style={[styles.panel, { backgroundColor: appearance.surface }]}>
    <Text accessibilityRole="header" style={[typography.label, { color: appearance.ink }]}>地图库{library ? `（${library.maps.length}）` : ''}</Text>
    {library?.maps.length === 0 ? <Text style={[typography.supporting, { color: appearance.secondary }]} testID="lingtu-maps-empty">暂无已保存地图</Text> : null}
    {!library ? <Text style={[typography.supporting, { color: appearance.secondary }]} testID="lingtu-maps-no-data">{expired || view?.message.includes('已过期') ? '地图库状态已过期' : '尚无有效地图数据'}</Text> : null}
    {library?.maps.map((map, index) => <Pressable key={map.name} accessibilityRole="button" accessibilityLabel={`选择地图 ${map.name}`}
      accessibilityState={{ selected: selectedName === map.name, disabled: !!view?.busy }} disabled={!!view?.busy}
      onPress={() => { if (mounted.current && active.current && owner.current === captured && operation.current === renderedOperation && !pending.current && latest.current === library && isLingtuStatusFresh(library)) setSelectedName(map.name); }}
      style={[styles.mapItem, { backgroundColor: selectedName === map.name ? appearance.blueSoft : colors.background }]}
      testID={`lingtu-map-item-${index}`}>
      <View style={styles.mapTitle}>
        <Text style={[typography.label, styles.mapName, { color: appearance.ink }]}>{map.name}</Text>
        {library.activeMapName === map.name ? <Text style={[typography.supporting, { color: appearance.blueInk }]} testID="lingtu-map-active">当前地图</Text> : null}
      </View>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>内容版本 {map.contentEpoch ?? '未知'}</Text>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>状态 {mapState(map.state)}</Text>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>点云 {availability(map.hasPointCloud)}，栅格 {availability(map.hasOccupancy)}</Text>
    </Pressable>)}
  </View>;
  const detail = <View style={styles.details}>
    <View style={[styles.panel, { backgroundColor: appearance.surface }]} testID="lingtu-maps-localization">
      <Text accessibilityRole="header" style={[typography.label, { color: appearance.ink }]}>定位</Text>
      {row('pose-map', '当前地图', library?.activeMapName ?? '未知')}
      {row('pose-status', '定位状态', poseLabel)}
      {row('frame', '坐标系', localization?.frameId ?? '未知')}
      {row('x', 'X', poseReady ? coordinate(localization?.x, 'm') : '—')}
      {row('y', 'Y', poseReady ? coordinate(localization?.y, 'm') : '—')}
      {row('z', 'Z', poseReady ? coordinate(localization?.z, 'm') : '—')}
      {row('yaw', '朝向', poseReady ? coordinate(localization?.yaw, 'rad') : '—')}
    </View>
    <View style={[styles.panel, { backgroundColor: appearance.surface }]}>
      {row('selected', '选中地图', selected?.name ?? '未选择')}
      <Pressable accessibilityRole="button" accessibilityLabel="打开地图工作台" accessibilityState={{ disabled: !selected || !!view?.busy }}
        disabled={!selected || !!view?.busy} onPress={() => void openWorkbench()}
        style={[styles.button, { backgroundColor: appearance.blue }, (!selected || !!view?.busy) && styles.disabled]} testID="lingtu-maps-open">
        <Text style={[typography.label, { color: appearance.blueInk }]}>打开地图工作台</Text>
      </Pressable>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>在浏览器中查看地图</Text>
    </View>
    <View style={[styles.panel, { backgroundColor: appearance.surface }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="查看实时点云" accessibilityState={{ disabled: !!view?.busy }}
        disabled={!!view?.busy} onPress={openLiveCloud}
        style={[styles.button, { backgroundColor: appearance.blue }, !!view?.busy && styles.disabled]} testID="lingtu-maps-live">
        <Text style={[typography.label, { color: appearance.blueInk }]}>查看实时点云</Text>
      </Pressable>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>在 App 中查看实时扫描与地图</Text>
    </View>
  </View>;
  if (live) {
    const status = cloudStatus?.source === live ? cloudStatus.value : null;
    const labels: Record<string, string> = { connecting: '正在连接', waiting: '等待点云帧', live: '正在接收点云',
      stale: '点云已停更', ended: '点云连接已结束', error: '点云接收失败', unavailable: '当前版本无法显示点云', paused: '点云已暂停' };
    const close = () => { setLiveCloud(null); setCloudStatus(null); };
    return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} testID="lingtu-cloud-screen">
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回地图与定位" onPress={close} style={styles.back} testID="lingtu-cloud-back">
          <Ionicons name="arrow-back" size={22} color={appearance.ink} />
        </Pressable>
        <Text accessibilityRole="header" style={[typography.compactTitle, styles.title, { color: appearance.ink }]}>实时点云</Text>
        {([2, 1] as const).map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: live.kind === kind }}
          accessibilityLabel={kind === 2 ? '显示扫描点云' : '显示地图点云'} testID={`lingtu-cloud-kind-${kind}`}
          onPress={() => { if (live.kind === kind) return; setCloudStatus(null); setLiveCloud({ ...live, kind }); }} style={styles.cloudKind}>
          <Text style={[typography.label, { color: live.kind === kind ? appearance.blueInk : appearance.secondary }]}>{kind === 2 ? '扫描' : '地图'}</Text>
        </Pressable>)}
      </View>
      <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.message, { color: appearance.secondary }]} testID="lingtu-cloud-status">
        {status && Object.hasOwn(labels, status.status) ? labels[status.status] : '正在连接'}{status?.status === 'live' ? `（${status.points} 点）` : ''}
        {status?.message ? ` · ${status.message}` : ''}
      </Text>
      <PointCloudView key={`${live.endpoint}:${live.kind}`} endpoint={live.endpoint} kind={live.kind} active={true}
        style={styles.cloudCanvas} testID="lingtu-cloud-view" onStatus={event => {
          if (!mounted.current || !active.current || owner.current !== captured) return;
          const value = event.nativeEvent;
          if (typeof value?.status !== 'string' || typeof value.message !== 'string' || !Number.isSafeInteger(value.points) || value.points < 0) return;
          setCloudStatus({ source: live, value: { status: value.status, message: value.message.slice(0, 256), points: value.points } });
        }} />
      <Text style={[typography.supporting, styles.message, { color: appearance.secondary }]}>拖动旋转，双指缩放</Text>
    </SafeAreaView>;
  }
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} testID="lingtu-maps-screen"
    onLayout={event => { const measured = event.nativeEvent.layout.width; if (Number.isFinite(measured) && measured > 0) setViewportWidth(measured); }}>
    <View style={styles.header}>
      {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="返回导航服务" onPress={back} style={styles.back} testID="lingtu-maps-back"><Ionicons name="arrow-back" size={22} color={appearance.ink} /></Pressable> : null}
      <Text accessibilityRole="header" style={[typography.compactTitle, styles.title, { color: appearance.ink }]}>地图与定位</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={view?.busy ? '取消操作' : '刷新地图与定位'}
        onPress={view?.busy ? cancel : () => void refresh()} style={styles.back} testID={view?.busy ? 'lingtu-maps-cancel' : 'lingtu-maps-refresh'}>
        <Ionicons name={view?.busy ? 'close' : 'refresh'} size={22} color={appearance.blueInk} />
      </Pressable>
    </View>
    <Text accessibilityLiveRegion="polite" style={[typography.supporting, styles.message, { color: appearance.secondary }]} testID="lingtu-maps-result">{expired ? '地图与定位状态已过期，请刷新' : view?.message ?? '未读取'}</Text>
    {columns ? <View style={styles.columns} testID="lingtu-maps-columns">
      <ScrollView contentContainerStyle={styles.paneContent} style={styles.pane}>{list}</ScrollView>
      <ScrollView contentContainerStyle={styles.paneContent} style={styles.pane}>{detail}</ScrollView>
    </View> : <ScrollView contentContainerStyle={styles.content} testID="lingtu-maps-scroll">{list}{detail}</ScrollView>}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, minHeight: 56 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, title: { flex: 1 },
  message: { paddingHorizontal: 20, paddingBottom: 8 }, content: { padding: 12, gap: 12, paddingBottom: 24 },
  columns: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 12 },
  pane: { flex: 1, minWidth: 0 }, paneContent: { paddingBottom: 24 }, details: { gap: 12 },
  panel: { borderRadius: cardLayout.radius, padding: cardLayout.inset, gap: 12 },
  mapItem: { borderRadius: 12, padding: 12, gap: 5 }, mapTitle: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, mapName: { flex: 1, minWidth: 0 },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, minHeight: 28 }, value: { flexShrink: 1, textAlign: 'right' },
  button: { alignItems: 'center', borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 }, disabled: { opacity: 0.55 },
  cloudCanvas: { flex: 1, minHeight: 180 }, cloudKind: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
});
