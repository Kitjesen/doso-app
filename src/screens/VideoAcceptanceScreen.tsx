import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '../components/AppText';
import { ControlVideoSurface } from '../components/ControlVideoSurface';
import { useControlVideoReceiver } from '../features/video/useControlVideoReceiver';
import { type VideoConfiguration } from '../features/video/whepReceiver';
import { isLingtuStatusFresh, readLingtuStatus } from '../services/lingtuReadOnly';

/** Isolated native reception test: no account, control session or motion input. */
export function VideoAcceptanceScreen() {
  const [endpoint, setEndpoint] = useState('');
  const [config, setConfig] = useState<VideoConfiguration | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('未读取');
  const pending = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const video = useControlVideoReceiver(config, config !== null);
  const stop = () => {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setConfig(null);
  };
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { stop(); setMessage('测试已暂停'); }
    });
    return () => { generation.current++; pending.current?.abort(); subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(() => { stop(); setMessage('60 秒测试已结束'); }, 60000);
    return () => clearTimeout(timer);
  }, [config]);

  const start = async () => {
    stop();
    const current = generation.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setMessage('正在读取真实网关');
    try {
      const snapshot = await readLingtuStatus({ endpoint, allowLocalHttp: true, signal: controller.signal });
      if (generation.current !== current || controller.signal.aborted) return;
      if (!isLingtuStatusFresh(snapshot) || snapshot.features.whep !== true) {
        setMessage('网关未声明视频能力'); return;
      }
      setMessage(snapshot.readiness.ready ? '网关状态已读取' : '网关状态已读取 · 导航未就绪');
      setConfig({ deviceId: `video-test-${current}`, gatewayUrl: snapshot.endpoint, allowLocalHttp: true });
    } catch {
      if (generation.current === current && !controller.signal.aborted) setMessage('无法读取网关，请检查地址和网络');
    } finally {
      if (generation.current === current) { pending.current = null; setBusy(false); }
    }
  };

  return <SafeAreaView style={styles.safe} testID="native-video-acceptance">
    <View style={styles.header}>
      <Text style={styles.title}>DOSO 视频测试</Text>
      <Text style={styles.note}>仅接收画面 · 不控制机器人</Text>
    </View>
    <View style={styles.controls}>
      <TextInput accessibilityLabel="视频网关地址" testID="video-test-endpoint" value={endpoint}
        onChangeText={value => { stop(); setEndpoint(value); setMessage('未读取'); }}
        autoCapitalize="none" autoCorrect={false} keyboardType="url"
        placeholder="http://局域网IP:端口" style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel={busy ? '取消读取' : config ? '停止视频测试' : '读取并观看'}
        testID="video-test-action" style={styles.button} onPress={busy || config ? () => { stop(); setMessage('测试已停止'); } : () => void start()}>
        <Text>{busy ? '取消' : config ? '停止' : '读取并观看'}</Text>
      </Pressable>
    </View>
    <Text accessibilityLiveRegion="polite" testID="video-test-status" style={styles.note}>
      {message} · 视频：{video.presentation.phase}
    </Text>
    <View style={styles.video}>
      <ControlVideoSurface presentation={video.presentation} surface={video.surface} active={config !== null}
        onInterrupted={() => {}} statusTop={24} statusColor="#D5DCE5" />
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF', padding: 16, gap: 12 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16 },
  title: { fontSize: 22, fontWeight: '600', color: '#253441' },
  note: { fontSize: 14, color: '#586675' },
  controls: { flexDirection: 'row', gap: 12 },
  input: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#F4F7FA', color: '#253441' },
  button: { minHeight: 48, minWidth: 100, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center', backgroundColor: '#98D1FF' },
  video: { flex: 1, minHeight: 120, backgroundColor: '#000000', borderRadius: 12, overflow: 'hidden' },
});
