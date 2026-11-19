import { Feather } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, useWindowDimensions, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../components/HomeText';
import { productType } from '../../fonts/home';
import { ProductHeader } from '../../components/ProductHeader';
import { ControlVideoSurface } from '../../components/ControlVideoSurface';
import { useControlVideoReceiver } from './useControlVideoReceiver';

type Device = Readonly<{ id: string; label: string }>;
type Props = Readonly<{ expectedUserId: string; devices: Device[]; initialDeviceId: string; onBack: () => void }>;
const origin = process.env.EXPO_PUBLIC_VIDEO_GATEWAY_URL?.trim();

function VideoFrame({ device, compact, selected, onSelect, full, onExitFull, children }: {
  device: Device; compact: boolean; selected: boolean; onSelect: () => void; full: boolean; onExitFull: () => void; children: ReactNode;
}) {
  return <View style={[styles.tileGroup, compact && styles.compact]}>
    <Pressable testID={`cloud-video-${device.id}`} accessibilityRole="button" accessibilityLabel={`选择${device.label}画面`} accessibilityState={{ selected }} onPress={onSelect} style={[styles.tile, selected && styles.selectedTile]}>
      {!full ? children : null}
    </Pressable>
    <Modal visible={full} onRequestClose={onExitFull} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']}>
      <SafeAreaView style={styles.fullscreen}>{full ? children : null}<Pressable accessibilityRole="button" accessibilityLabel="退出视频全屏" onPress={onExitFull} style={styles.fullClose}><Feather name="minimize" size={22} color="#E8E8E6" /><Text style={styles.action}>退出全屏</Text></Pressable></SafeAreaView>
    </Modal>
  </View>;
}

function VideoControls({ device, onFull, onClose }: { device?: Device; onFull: () => void; onClose: () => void }) {
  if (!device) return null;
  return <View style={styles.tileControls} testID="video-controls">
    <Text style={styles.action}>{device.label} · 主摄像头</Text>
    <View style={styles.controlActions}>
      <Pressable testID={`video-fullscreen-${device.id}`} accessibilityRole="button" accessibilityLabel={`全屏${device.label}画面`} onPress={onFull} style={styles.control}><Feather name="maximize" size={17} color="#E8E8E6" /><Text style={styles.action}>全屏</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={'关闭' + device.label + '画面'} onPress={onClose} style={styles.control}><Feather name="power" size={17} color="#E8E8E6" /><Text style={styles.action}>关闭此路</Text></Pressable>
    </View>
  </View>;
}

function GalleryHeader({ count, robotName, onBack }: { count: number; robotName?: string; onBack: () => void }) {
  return <><ProductHeader robotName={robotName} />
    <View style={styles.header}><Text style={styles.title}>远程视频</Text><Text style={[styles.hint, { marginLeft: 'auto' }]}>{count} / 4 路</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭远程视频" onPress={onBack} style={styles.button}><Feather name="x" size={22} color="#E8E8E6" /></Pressable></View></>;
}

function VideoTile({ expectedUserId, device, compact, selected, onSelect, full, onExitFull }: {
  expectedUserId: string; device: Device; compact: boolean; selected: boolean; onSelect: () => void; full: boolean; onExitFull: () => void;
}) {
  const video = useControlVideoReceiver(origin ? { expectedUserId, deviceId: device.id, gatewayUrl: origin } : null, true);
  const message = !origin ? '远程视频服务尚未配置' : video.error === 'configuration' ? '视频服务配置不可用'
    : video.error === 'authorization' ? '视频授权已失效，请确认账号和设备权限'
    : video.error === 'warming' ? '正在连接视频，等待画面…'
    : video.error === 'unavailable' && video.presentation.phase === 'connecting' ? '画面暂不可用，正在重试'
    : video.error === 'unavailable' && video.presentation.phase === 'stalled' ? '视频已中断，正在重试'
    : video.error === 'unavailable' ? '视频服务暂不可用，请重新连接' : null;
  const stage = <View style={styles.stage}>
    {!message ? <ControlVideoSurface presentation={video.presentation} surface={video.surface} active onInterrupted={() => {}} statusTop={60} statusColor="#A0A09B" /> : null}
    <View style={styles.tileHeader}><View style={styles.tileIdentity}><View style={[styles.dot, video.presentation.phase === 'receiving' && styles.liveDot]} /><Text style={styles.name}>{device.label}</Text></View></View>
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {video.presentation.phase === 'error' || video.presentation.phase === 'stalled' ? <Pressable accessibilityRole="button" accessibilityLabel={`重新连接${device.label}视频`} onPress={video.reconnect} style={styles.retry}><Text style={styles.action}>重新连接</Text></Pressable> : null}
  </View>;
  return <VideoFrame device={device} compact={compact} selected={selected} onSelect={onSelect} full={full} onExitFull={onExitFull}>{stage}</VideoFrame>;
}

// Visual QA supplies static artwork here; this component never creates a media receiver.
export function CloudVideoPreview({ frames, onBack }: { frames: readonly { id: string; label: string; content: ReactNode }[]; onBack: () => void }) {
  const { width } = useWindowDimensions();
  const [hidden, setHidden] = useState<string[]>([]);
  const [focused, setFocused] = useState(frames[0]?.id);
  const [fullId, setFullId] = useState<string | null>(null);
  const watching = frames.filter(frame => !hidden.includes(frame.id)).slice(0, 4);
  const activeId = watching.some(frame => frame.id === focused) ? focused : watching[0]?.id;
  return <SafeAreaView style={styles.safe} testID="cloud-video-preview">
    <GalleryHeader count={watching.length} robotName={watching.find(frame => frame.id === activeId)?.label} onBack={onBack} />
    <ScrollView contentContainerStyle={styles.content}><View style={styles.grid}>
      {watching.map(frame => <VideoFrame key={frame.id} device={frame} compact={width >= 720 && watching.length > 1} selected={frame.id === activeId} onSelect={() => setFocused(frame.id)} full={frame.id === fullId} onExitFull={() => setFullId(null)}>
        <View style={styles.stage} accessibilityLabel={`${frame.label}静态设计画面`}>{frame.content}<View style={styles.previewLabel}><Text style={styles.name}>{frame.label}</Text></View></View>
      </VideoFrame>)}
    </View><VideoControls device={watching.find(frame => frame.id === activeId)} onFull={() => setFullId(activeId ?? null)} onClose={() => { if (activeId) setHidden(current => [...current, activeId]); }} />{!watching.length ? <View style={styles.empty}><Text style={styles.title}>暂无正在观看的画面</Text></View> : null}</ScrollView>
    <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel="添加视频设备" onPress={() => setHidden([])} style={styles.add}><Text style={styles.addText}>添加设备</Text></Pressable>
      {watching.length ? <Pressable accessibilityRole="button" accessibilityLabel="关闭全部画面" onPress={() => setHidden(frames.map(frame => frame.id))} style={styles.stopAll}><Text style={styles.hint}>关闭全部画面</Text></Pressable> : null}</View>
  </SafeAreaView>;
}

export function CloudVideoScreen({ expectedUserId, devices, initialDeviceId, onBack }: Props) {
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<string[]>(() => devices.some(device => device.id === initialDeviceId) ? [initialDeviceId] : []);
  const [focused, setFocused] = useState(initialDeviceId);
  const [fullId, setFullId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const watching = devices.filter(device => selected.includes(device.id)).slice(0, 4);
  const activeId = watching.some(device => device.id === focused) ? focused : watching[0]?.id;
  const close = (id: string) => setSelected(current => current.filter(value => value !== id));
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack]);
  return <SafeAreaView style={styles.safe} testID="cloud-video-screen">
    <GalleryHeader count={watching.length} robotName={watching.find(device => device.id === activeId)?.label} onBack={onBack} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.grid}>{watching.map(device => <VideoTile key={`${expectedUserId}:${device.id}`} expectedUserId={expectedUserId} device={device} compact={width >= 720 && watching.length > 1} selected={device.id === activeId} onSelect={() => setFocused(device.id)} full={device.id === fullId} onExitFull={() => setFullId(null)} />)}</View>
      <VideoControls device={watching.find(device => device.id === activeId)} onFull={() => setFullId(activeId ?? null)} onClose={() => { if (activeId) close(activeId); }} />
      {watching.length === 0 ? <View style={styles.empty}><Feather name="video" size={34} color="#7795AA" /><Text style={styles.title}>暂无正在观看的画面</Text><Text style={styles.hint}>{devices.length ? '添加设备后开启视频' : '绑定设备后，可在这里开启视频'}</Text></View> : null}
    </ScrollView>
    <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel="添加视频设备" onPress={() => setPicker(true)} style={styles.add}><Feather name="plus" size={19} color="#202221" /><Text style={styles.addText}>添加设备</Text></Pressable>
      {watching.length > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="关闭全部画面" onPress={() => setSelected([])} style={styles.stopAll}><Text style={styles.hint}>关闭全部画面</Text></Pressable> : null}</View>
    <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
      <View style={styles.backdrop}><SafeAreaView edges={['bottom']} style={styles.picker}>
        <View style={styles.header}><Text style={styles.title}>选择设备</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭设备选择" onPress={() => setPicker(false)} style={styles.button}><Feather name="x" size={22} color="#E8E8E6" /></Pressable></View>
        <ScrollView contentContainerStyle={styles.deviceList}>{devices.map(device => {
          const checked = selected.includes(device.id), disabled = !checked && watching.length >= 4;
          return <Pressable key={device.id} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={device.label} disabled={disabled}
            style={[styles.device, checked && styles.selectedDevice, disabled && styles.disabled]}
            onPress={() => { setSelected(current => current.includes(device.id) ? current.filter(id => id !== device.id) : [...current, device.id].slice(0, 4)); if (!checked) setFocused(device.id); }}>
            <Feather name="cpu" size={19} color="#A0A09B" /><Text style={styles.deviceName}>{device.label}</Text><Feather name={checked ? 'check-circle' : 'circle'} size={19} color={checked ? '#7795AA' : '#747B7C'} />
          </Pressable>;
        })}{!devices.length ? <Text style={styles.hint}>暂无已绑定设备</Text> : null}</ScrollView>
        <Pressable accessibilityRole="button" accessibilityLabel="完成视频设备选择" onPress={() => setPicker(false)} style={styles.add}><Text style={styles.addText}>完成</Text></Pressable>
      </SafeAreaView></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1C1C1B' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, gap: 12 }, button: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, title: { color: '#E8E8E6', ...productType.title },
  content: { padding: 14, paddingTop: 7, gap: 14 }, hint: { color: '#A0A09B', ...productType.caption }, action: { color: '#E8E8E6', ...productType.body },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }, tileGroup: { width: '100%' }, compact: { width: '48%' }, tile: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#151615', borderRadius: 8, borderWidth: 1, borderColor: '#343634', overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,.16)' }, selectedTile: { borderColor: '#8FB8CD', borderWidth: 1.5 }, stage: { flex: 1, backgroundColor: '#151615' },
  tileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10 }, tileIdentity: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#1C1C1B99', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 }, dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#747B7C' }, liveDot: { backgroundColor: '#7795AA' }, name: { color: '#E8E8E6', ...productType.caption },
  message: { color: '#A0A09B', fontSize: 13, lineHeight: 21, textAlign: 'center', paddingHorizontal: 20, marginTop: 20 }, retry: { position: 'absolute', right: 8, bottom: 8, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', backgroundColor: '#292927', borderRadius: 6 },
  previewLabel: { position: 'absolute', top: 10, left: 10, padding: 6, borderRadius: 5, backgroundColor: '#1C1C1B99' },
  tileControls: { marginTop: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#343634', paddingVertical: 10, gap: 7 }, controlActions: { flexDirection: 'row', gap: 24, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#41413F', marginTop: 6, paddingTop: 6 }, control: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center' },
  footer: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 8, gap: 2 }, add: { minHeight: 46, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderRadius: 6, backgroundColor: '#E8E8E6' }, addText: { color: '#202221', ...productType.button }, stopAll: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: 14 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' }, picker: { maxHeight: '80%', padding: 20, paddingTop: 4, backgroundColor: '#242423', borderTopLeftRadius: 20, borderTopRightRadius: 20 }, deviceList: { gap: 8, paddingVertical: 14 }, device: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 8 }, selectedDevice: { backgroundColor: '#333733' }, disabled: { opacity: .45 }, deviceName: { flex: 1, color: '#E8E8E6', fontSize: 15 },
  fullscreen: { flex: 1, backgroundColor: '#111211' }, fullClose: { position: 'absolute', top: 20, right: 20, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: '#242423DD', borderRadius: 8 },
});
