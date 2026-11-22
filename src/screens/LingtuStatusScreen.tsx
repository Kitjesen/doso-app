import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cardLayout, getProductAppearance } from '../appearance';
import { Text, TextInput } from '../components/AppText';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import {
  isLingtuStatusFresh, LingtuReadOnlyError, readCameraDiagnostics, readLingtuStatus,
  type CameraDiagnosticsSnapshot, type LingtuReadOnlySnapshot,
} from '../services/lingtuReadOnly';

const elapsedNow = () => {
  try { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : NaN; }
  catch { return NaN; }
};
const features = [['mapping', '地图'], ['navigation', '导航'], ['inspection', '巡检'], ['whep', '视频'], ['cloud', '点云']] as const;
const products: Readonly<Record<string, string>> = {
  map: '建图', nav: '导航', explore: '探索', inspection: '巡检', teleop: '手动', teleop_avoid: '辅助遥控', tracking: '跟随',
};
const locations: Readonly<Record<string, string>> = {
  ready: '已定位', tracking: '跟踪中', initializing: '初始化中', relocalizing: '重新定位',
  lost: '定位丢失', no_odometry: '无里程计', degraded: '定位降级',
};
const authorities: Readonly<Record<string, string>> = { AUTONOMY: '自主导航', OPERATOR: '人工接管', NONE: '无控制源', UNKNOWN: '未知' };
const reasons: Readonly<Record<string, string>> = {
  'localization:no_odometry': '无定位里程计', odometry_missing: '无定位里程计',
  localization_not_ready: '定位未就绪', navigation_not_ready: '导航未就绪',
  product_not_started: '服务尚未启动', session_missing: '运行会话未同步',
};
const readinessLabel = (value: boolean | null) => value === null ? '未知' : value ? '就绪' : '未就绪';
const fpsLabel = (value: number | null) => value !== null ? `${value.toFixed(1)} FPS` : '未知';
const labelFor = (labels: Readonly<Record<string, string>>, value: string | null, fallback: string) =>
  value !== null && Object.hasOwn(labels, value) ? labels[value] : fallback;
function localizationLabel(snapshot: LingtuReadOnlySnapshot): string {
  const state = snapshot.localizationState;
  if (state === 'ready' || state === 'tracking') {
    if (snapshot.localizationPoseFresh === false) return '定位数据已过期';
    if (snapshot.localizationReady === false) return '定位未就绪';
    if (snapshot.localizationReady !== true || snapshot.localizationPoseFresh !== true) return '定位待核验';
  }
  return labelFor(locations, state, '未知');
}

export function LingtuStatusScreen({ onBack, allowLocalHttp = false, onUseNavigation, onViewVideo, useNavigationLabel = '用于控制台视频', allowViewerToken = false }: {
  onBack: () => void; allowLocalHttp?: boolean; onUseNavigation?: (endpoint: string, viewerToken?: string) => boolean; onViewVideo?: (endpoint: string, viewerToken?: string) => boolean; useNavigationLabel?: string; allowViewerToken?: boolean;
}) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const [endpoint, setEndpoint] = useState('');
  const [viewerToken, setViewerToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<LingtuReadOnlySnapshot | null>(null);
  const [cameraDiagnostics, setCameraDiagnostics] = useState<CameraDiagnosticsSnapshot | null>(null);
  const [depthPreviewNonce, setDepthPreviewNonce] = useState(0);
  const [depthPreviewError, setDepthPreviewError] = useState(false);
  const [message, setMessage] = useState('未读取');
  const mounted = useRef(true);
  const active = useRef(AppState.currentState === 'active');
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const expiry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderedGeneration = generation.current;
  const clearExpiry = () => { if (expiry.current !== null) clearTimeout(expiry.current); expiry.current = null; };
  const stop = () => { generation.current++; pending.current?.abort(); pending.current = null; clearExpiry(); };
  const current = (id: number) => mounted.current && active.current && generation.current === id;
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) return;
      stop(); setBusy(false); setSnapshot(null); setCameraDiagnostics(null); setDepthPreviewError(false); setViewerToken(''); setMessage('读取已暂停');
    });
    return () => { mounted.current = false; stop(); subscription.remove(); };
  }, []);

  const changeEndpoint = (value: string) => {
    if (!current(renderedGeneration)) return;
    stop(); setEndpoint(value); setViewerToken(''); setBusy(false); setSnapshot(null); setCameraDiagnostics(null); setDepthPreviewError(false); setMessage('未读取');
  };
  const cancel = () => {
    if (!current(renderedGeneration)) return;
    stop(); setBusy(false); setSnapshot(null); setCameraDiagnostics(null); setDepthPreviewError(false); setMessage('本次读取已取消');
  };
  const back = () => {
    if (!current(renderedGeneration)) return;
    stop(); setBusy(false); setSnapshot(null); setCameraDiagnostics(null); setDepthPreviewError(false); mounted.current = false; onBack();
  };
  const read = async () => {
    if (!current(renderedGeneration) || pending.current) return;
    const id = ++generation.current, controller = new AbortController();
    pending.current = controller; clearExpiry(); setBusy(true); setSnapshot(null); setCameraDiagnostics(null); setDepthPreviewError(false); setMessage('读取中');
    try {
      const [result, media] = await Promise.all([
        readLingtuStatus({ endpoint, allowLocalHttp, signal: controller.signal }),
        readCameraDiagnostics({ endpoint, allowLocalHttp, signal: controller.signal }).catch(() => null),
      ]);
      if (!current(id) || controller.signal.aborted) return;
      if (!isLingtuStatusFresh(result)) { setMessage('状态已过期，请重新读取'); return; }
      setSnapshot(result); setCameraDiagnostics(media); setDepthPreviewNonce(Date.now()); setMessage('网关可达');
      // The batch keeps its original deadline; a slow response never receives a fresh display lifetime.
      expiry.current = setTimeout(() => {
        if (!current(id)) return;
        expiry.current = null; setSnapshot(null); setCameraDiagnostics(null); setDepthPreviewError(false); setMessage('状态已过期，请重新读取');
      }, Math.ceil(Math.max(0, result.observedAt + 15000 - elapsedNow())));
    } catch (error) {
      if (current(id) && !controller.signal.aborted) setMessage(error instanceof LingtuReadOnlyError
        ? error.message : '无法读取导航服务，请检查地址和网络。');
    } finally {
      if (current(id)) { pending.current = null; setBusy(false); }
    }
  };

  const row = (id: string, label: string, value: string) => <View style={styles.row} key={id} testID={`lingtu-${id}`}>
    <Text style={[typography.supporting, { color: appearance.secondary }]}>{label}</Text>
    <Text style={[typography.label, styles.value, { color: appearance.ink }]}>{value}</Text>
  </View>;
  const blocked = snapshot && !snapshot.readiness.ready
    ? [...new Set(snapshot.readiness.reasons.map(reason => labelFor(reasons, reason, '服务报告未就绪')))].slice(0, 4) : [];

  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} testID="lingtu-status-screen">
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回连接设置" onPress={back} style={styles.back} testID="lingtu-back">
        <Ionicons name="arrow-back" size={22} color={appearance.ink} />
      </Pressable>
      <Text accessibilityRole="header" style={[typography.compactTitle, { color: appearance.ink }]}>视频与诊断</Text>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={[styles.panel, { backgroundColor: appearance.surface }]}>
        <Text style={[typography.label, { color: appearance.ink }]}>服务地址</Text>
        <TextInput accessibilityLabel="导航服务地址" value={endpoint} onChangeText={changeEndpoint}
          autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder={allowLocalHttp ? 'http://局域网IP:端口' : 'https://主机:端口'}
          placeholderTextColor={appearance.secondary} style={[styles.input, { backgroundColor: colors.background, color: appearance.ink }]}
          testID="lingtu-endpoint" />
        {allowViewerToken ? <><Text style={[typography.label, { color: appearance.ink }]}>视频观看凭据（可选）</Text>
          <TextInput accessibilityLabel="视频观看凭据" value={viewerToken} onChangeText={setViewerToken} secureTextEntry
            autoCapitalize="none" autoCorrect={false} placeholder="受保护的视频服务需要凭据" placeholderTextColor={appearance.secondary}
            style={[styles.input, { backgroundColor: colors.background, color: appearance.ink }]} testID="lingtu-viewer-token" /></> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={busy ? '取消读取' : '读取状态'} accessibilityState={{ busy }}
          onPress={busy ? cancel : () => void read()} style={({ pressed }) => [styles.button, { backgroundColor: appearance.blue }, pressed && styles.pressed]}
          testID={busy ? 'lingtu-cancel' : 'lingtu-read'}>
          <Text style={[typography.label, { color: appearance.blueInk }]}>{busy ? '取消读取' : '读取状态'}</Text>
        </Pressable>
        <Text accessibilityLiveRegion="polite" style={[typography.supporting, { color: appearance.secondary }]} testID="lingtu-result">{message}</Text>
        <Text style={[typography.supporting, { color: appearance.secondary }]}>只读状态，不获取控制权</Text>
      </View>
      {snapshot ? <View style={[styles.panel, { backgroundColor: appearance.surface }]} testID="lingtu-observation">
        {row('environment', '运行环境', snapshot.environment === 'real' ? '实机' : snapshot.environment === 'sim' ? '仿真' : '未知')}
        {row('product', '运行模式', snapshot.product ? labelFor(products, snapshot.product, '未知模式') : '未知')}
        {row('robot-online', '本体在线', '未知')}
        {row('localization', '定位', localizationLabel(snapshot))}
        {row('data-ready', '数据就绪', readinessLabel(snapshot.readiness.dataReady))}
        {row('motion-ready', '导航运动就绪（服务报告）', readinessLabel(snapshot.readiness.motionReady))}
        {row('control-source', '控制来源', labelFor(authorities, snapshot.controlAuthority, '未知'))}
        {row('map', '当前地图', snapshot.mapName ?? '未知')}
        {snapshot.resumeRequired ? <Text style={[typography.supporting, { color: appearance.secondary }]} testID="lingtu-resume-required">需显式恢复</Text> : null}
        {blocked.map(reason => <Text key={reason} style={[typography.supporting, { color: appearance.secondary }]} testID="lingtu-blocked-reason">{reason}</Text>)}
      </View> : null}
      {snapshot ? <View style={[styles.panel, { backgroundColor: appearance.surface }]} testID="lingtu-capabilities">
        <Text style={[typography.label, { color: appearance.ink }]}>接口能力</Text>
        {features.map(([key, label]) => row(`feature-${key}`, label,
          snapshot.features[key] === true ? '已声明' : snapshot.features[key] === false ? '不支持' : '未声明'))}
        {onUseNavigation ? <Pressable accessibilityRole="button" testID="lingtu-use-navigation" style={[styles.button, { backgroundColor: appearance.blue }]}
          onPress={() => {
            if (!current(renderedGeneration) || pending.current || !snapshot || !isLingtuStatusFresh(snapshot)) return;
            if (viewerToken && !snapshot.endpoint.startsWith('https://')) { setMessage('视频观看凭据需要 HTTPS 连接。'); return; }
            if (onUseNavigation(snapshot.endpoint, viewerToken || undefined)) { stop(); setViewerToken(''); mounted.current = false; }
            else setMessage('当前会话不可使用此导航服务，请重新进入');
          }}>
          <Text style={[typography.label, { color: appearance.blueInk }]}>{useNavigationLabel}</Text>
        </Pressable> : null}
        {onViewVideo ? <Pressable accessibilityRole="button" testID="lingtu-view-video-only" style={[styles.button, { backgroundColor: appearance.blue }]}
          onPress={() => {
            if (!current(renderedGeneration) || pending.current || !snapshot || !isLingtuStatusFresh(snapshot)) return;
            if (viewerToken && !snapshot.endpoint.startsWith('https://')) { setMessage('视频观看凭据需要 HTTPS 连接。'); return; }
            if (onViewVideo(snapshot.endpoint, viewerToken || undefined)) { stop(); setViewerToken(''); mounted.current = false; }
            else setMessage('当前会话不可查看视频，请重新进入');
          }}><Text style={[typography.label, { color: appearance.blueInk }]}>仅查看视频（不控制）</Text></Pressable> : null}
      </View> : null}
      {snapshot && cameraDiagnostics ? <View style={[styles.panel, { backgroundColor: appearance.surface }]} testID="lingtu-camera-diagnostics">
        <Text style={[typography.label, { color: appearance.ink }]}>相机与视频链路</Text>
        {row('camera-status', '相机源', cameraDiagnostics.cameraStatus === 'streaming' ? '采集中' : cameraDiagnostics.cameraStatus ?? '未知')}
        {row('camera-color', '彩色帧', `${cameraDiagnostics.colorFrames ?? '未知'} · ${fpsLabel(cameraDiagnostics.colorFps)}`)}
        {row('camera-depth', '深度帧', `${cameraDiagnostics.depthFrames ?? '未知'} · ${fpsLabel(cameraDiagnostics.depthFps)} · 机器狗本机`)}
        {row('camera-pipeline', '视频管线', cameraDiagnostics.pipelineReady === true ? '已准备' : cameraDiagnostics.pipelineReady === false ? '未准备' : '未知')}
        {row('camera-whep', 'WHEP 推流', cameraDiagnostics.whepAvailable === true ? 'cam 可用' : cameraDiagnostics.whepAvailable === false ? '不可用' : '未知')}
        <Text style={[typography.supporting, { color: appearance.secondary }]}>深度帧表示机器狗本机采集状态，不代表已通过当前 WHEP 传到 G20。</Text>
        {cameraDiagnostics.depthFrames !== null ? <View style={styles.depthPreview} testID="lingtu-depth-preview">
          <Text style={[typography.label, { color: appearance.ink }]}>深度预览（JPEG）</Text>
          {depthPreviewError ? <Text style={[typography.supporting, { color: appearance.secondary }]}>深度预览接口暂不可用，原始深度矩阵仍未通过此页面传输。</Text> : <Image
            accessibilityLabel="机器狗深度预览"
            onError={() => setDepthPreviewError(true)}
            resizeMode="contain"
            source={{ uri: `${snapshot.endpoint}/api/v1/camera/depth/snapshot?ts=${depthPreviewNonce}` }}
            style={styles.depthImage}
          />}
          <Text style={[typography.supporting, { color: appearance.secondary }]}>这是机器狗生成的深度彩色预览，不是原始深度矩阵或独立 WebRTC 深度轨道。</Text>
        </View> : null}
      </View> : null}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 }, header: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 12, minHeight: 56 },
  back: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  content: { alignSelf: 'center', width: '100%', maxWidth: 880, gap: cardLayout.gap, padding: 12, paddingBottom: 24 },
  panel: { borderRadius: cardLayout.radius, gap: 12, padding: cardLayout.inset },
  input: { ...typography.label, borderRadius: 12, minHeight: 48, paddingHorizontal: 12 },
  button: { alignItems: 'center', borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, justifyContent: 'space-between', minHeight: 28 },
  value: { flexShrink: 1, textAlign: 'right' }, pressed: { opacity: 0.65 }, depthPreview: { gap: 8, marginTop: 4 }, depthImage: { width: '100%', aspectRatio: 4 / 3, maxHeight: 320, borderRadius: 12, backgroundColor: '#101214' },
});
