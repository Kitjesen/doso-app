import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import {
  officialDark, officialHotspotHost, officialHotspotPort, officialHotspotSsid, officialLabHost,
} from '../officialPalette';

type Phase = 'idle' | 'searching' | 'empty' | 'found';

export function RobotHotspotPanel({
  host,
  busy,
  readOnlyPreview = false,
  previewState,
  onUseHotspotAddress,
}: {
  host: string;
  busy?: boolean;
  readOnlyPreview?: boolean;
  previewState?: 'empty' | 'found';
  onUseHotspotAddress: () => void;
}) {
  const [phase, setPhase] = useState<Phase>(previewState ?? 'idle');
  useEffect(() => {
    if (previewState) setPhase(previewState);
  }, [previewState]);

  const search = () => {
    if (busy || readOnlyPreview) {
      if (readOnlyPreview && previewState) setPhase(previewState);
      return;
    }
    setPhase('searching');
    // This build has no phone Wi-Fi scan API. Do not invent a nearby network.
    // The dog itself is never switched onto DOSOrobotics from this panel.
    setTimeout(() => setPhase('empty'), 600);
  };

  const labInField = host.trim() === officialLabHost;

  return (
    <View style={styles.block} testID="connection-hotspot-panel">
      <Text style={styles.heading}>寻找机器狗热点</Text>
      {phase === 'idle' || phase === 'empty' ? (
        <>
          <Text style={styles.statusLine}>{phase === 'empty' ? '未发现机器狗热点' : '未连接'}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="搜索附近热点"
            accessibilityState={{ disabled: Boolean(busy) }}
            disabled={Boolean(busy)}
            onPress={search}
            style={({ pressed }) => [styles.search, pressed && styles.pressed, busy && styles.disabled]}
            testID="connection-scan-hotspot"
          >
            <Text style={styles.searchText}>搜索附近热点</Text>
          </Pressable>
          <Text style={styles.offer}>只会识别机器狗热点 {officialHotspotSsid}，并填入 {officialHotspotHost}:{officialHotspotPort}。其他网络请在上方手动输入。</Text>
        </>
      ) : null}
      {phase === 'searching' ? (
        <View style={styles.searching}>
          <ActivityIndicator color={officialDark.ink} />
          <Text style={styles.statusLine}>正在搜索附近热点…</Text>
        </View>
      ) : null}
      {phase === 'found' ? (
        <View style={styles.hotspot} testID="connection-hotspot-found">
          <Text style={styles.tag}>机器狗热点</Text>
          <Text style={styles.ssid}>{officialHotspotSsid}</Text>
          <Text style={styles.addr}>{officialHotspotHost}:{officialHotspotPort}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="改用此地"
            onPress={onUseHotspotAddress}
            style={({ pressed }) => [styles.use, pressed && styles.pressed]}
            testID="connection-use-hotspot-address"
          >
            <Text style={styles.useText}>改用此地</Text>
          </Pressable>
          <Text style={styles.offer}>
            {labInField
              ? '当前地址是实验室局域网。点「改用此地」才会改走机器狗热点；搜索结果不会自动覆盖实验室地址。加入热点后仍需点「连接机器狗」。'
              : '点「改用此地」会填入机器狗热点地址，仍需再点「连接机器狗」才会建立控制连接。'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: 14 },
  heading: { fontSize: 13, lineHeight: 20, fontWeight: '500', color: officialDark.muted, marginBottom: 8 },
  statusLine: { marginBottom: 10, fontSize: 13, lineHeight: 20, color: officialDark.muted },
  search: { minHeight: 48, borderRadius: 24, backgroundColor: officialDark.field, alignItems: 'center', justifyContent: 'center' },
  searchText: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: officialDark.ink },
  offer: { marginTop: 8, fontSize: 12, lineHeight: 18, color: officialDark.muted },
  searching: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  hotspot: { backgroundColor: officialDark.field, borderRadius: 16, padding: 12, paddingHorizontal: 14, marginTop: 4 },
  tag: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  ssid: { fontSize: 13, lineHeight: 18, color: officialDark.muted },
  addr: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: officialDark.ink, marginTop: 2, marginBottom: 10, fontVariant: ['tabular-nums'] },
  use: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  useText: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: officialDark.ink },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
