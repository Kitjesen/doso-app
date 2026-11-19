import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cardLayout, getProductAppearance } from '../appearance';
import { Text } from '../components/AppText';
import { CloudMapsError, readCloudMaps, type CloudMapVersion } from '../services/cloudMaps';
import { AuthSessionOperationBusyError } from '../services/authSessionOperation';
import { useAppTheme } from '../theme';
import { typography } from '../typography';

const statusLabels: Record<CloudMapVersion['status'], string> = {
  uploading: '上传中', verifying: '校验中', ready: '云端已保存', failed: '上传失败', cancelled: '已取消',
};
const sizeLabel = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
type Reading = { owner: object; versions: CloudMapVersion[] | null; busy: boolean; message: string };

export function CloudMapsScreen({ expectedUserId, onBack }: { expectedUserId: string; onBack: () => void }) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const owner = useRef({ expectedUserId });
  if (owner.current.expectedUserId !== expectedUserId) owner.current = { expectedUserId };
  const captured = owner.current;
  const mounted = useRef(true), active = useRef(AppState.currentState === 'active');
  const generation = useRef(0), pending = useRef<AbortController | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const stop = () => { generation.current++; pending.current?.abort(); pending.current = null; };
  const current = (id: number) => mounted.current && active.current && owner.current === captured && generation.current === id;
  const refresh = async () => {
    if (!mounted.current || !active.current || owner.current !== captured || pending.current) return;
    stop();
    const id = generation.current, controller = new AbortController();
    pending.current = controller;
    setReading({ owner: captured, versions: null, busy: true, message: '正在读取云端地图目录…' });
    try {
      const versions = await readCloudMaps(captured.expectedUserId, { signal: controller.signal });
      if (current(id) && !controller.signal.aborted) setReading({ owner: captured, versions, busy: false, message: '云端地图目录已更新。' });
    } catch (error) {
      if (current(id) && !controller.signal.aborted) setReading({ owner: captured, versions: null, busy: false,
        message: error instanceof CloudMapsError || error instanceof AuthSessionOperationBusyError ? error.message : '云端地图目录读取失败，请重试。' });
    } finally { if (current(id)) pending.current = null; }
  };
  useEffect(() => {
    mounted.current = true;
    active.current = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', state => {
      active.current = state === 'active';
      if (active.current) return;
      stop();
      setReading({ owner: captured, versions: null, busy: false, message: '读取已暂停，请刷新。' });
    });
    void refresh();
    return () => { mounted.current = false; stop(); subscription.remove(); };
  }, [captured]);
  const view = reading?.owner === captured ? reading : null;
  const leave = () => {
    if (!mounted.current || owner.current !== captured) return;
    mounted.current = false; stop(); onBack();
  };
  return <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} testID="cloud-maps-screen">
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={leave} style={styles.action} testID="cloud-maps-back">
        <Text style={[typography.label, { color: appearance.blueInk }]}>返回</Text>
      </Pressable>
      <Text accessibilityRole="header" style={[typography.compactTitle, { color: appearance.ink }]}>云端地图库</Text>
      <Text style={[typography.supporting, { color: appearance.secondary }]}>仅显示你主动上传的地图。当前支持查看云端地图目录。</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="刷新云端地图目录" accessibilityState={{ disabled: !!view?.busy }} disabled={!!view?.busy}
        onPress={() => void refresh()} style={[styles.action, styles.refresh, { backgroundColor: appearance.blueSoft }]} testID="cloud-maps-refresh">
        <Text style={[typography.label, { color: appearance.blueInk }]}>{view?.busy ? '读取中…' : '刷新目录'}</Text>
      </Pressable>
      {view?.busy ? <Pressable accessibilityRole="button" onPress={() => {
        if (owner.current !== captured || !mounted.current) return;
        stop(); setReading({ owner: captured, versions: null, busy: false, message: '地图目录读取已取消。' });
      }} style={styles.action} testID="cloud-maps-cancel"><Text style={[typography.label, { color: appearance.blueInk }]}>取消读取</Text></Pressable> : null}
      <Text selectable accessibilityLiveRegion="polite" style={[typography.supporting, { color: appearance.secondary }]} testID="cloud-maps-message">{view?.message ?? '等待读取云端地图目录。'}</Text>
      {view?.versions?.length === 0 ? <Text style={[typography.supporting, { color: appearance.secondary }]} testID="cloud-maps-empty">暂无云端地图</Text> : null}
      {view?.versions?.length === 100 ? <Text style={[typography.supporting, { color: appearance.secondary }]}>显示最近 100 个版本</Text> : null}
      {view?.versions?.map((version, index) => <View key={version.id} style={[styles.card, { backgroundColor: appearance.surface }]} testID={`cloud-map-${index}`}>
        <Text selectable style={[typography.label, { color: appearance.ink }]}>{version.name}</Text>
        <Text style={[typography.supporting, { color: appearance.blueInk }]}>{statusLabels[version.status]}</Text>
        <Text style={[typography.supporting, { color: appearance.secondary }]}>{sizeLabel(version.size_bytes)} · {new Date(version.created_at).toLocaleString()}</Text>
        <Text selectable style={[typography.supporting, { color: appearance.secondary }]}>来源地图 {version.source_map_id} · 内容版本 {version.source_content_epoch}</Text>
        <Text selectable style={[typography.supporting, { color: appearance.secondary }]}>坐标系 {version.frame_id ?? '未知'}</Text>
      </View>)}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  page: { padding: 20, gap: cardLayout.gap, maxWidth: 760, alignSelf: 'center', width: '100%' },
  action: { minHeight: 44, justifyContent: 'center' },
  refresh: { paddingHorizontal: 16, borderRadius: 12, alignItems: 'center' },
  card: { padding: cardLayout.inset, gap: 8, borderRadius: cardLayout.radius },
});
