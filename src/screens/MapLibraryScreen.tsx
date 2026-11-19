import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useProductAppearance } from '../appearance';
import { Text } from '../components/AppText';
import { typography } from '../typography';
import { CloudMapsScreen } from './CloudMapsScreen';

export function MapLibraryScreen({ expectedUserId, children }: {
  expectedUserId: string | null;
  children: ReactNode;
}) {
  const appearance = useProductAppearance();
  const [source, setSource] = useState<'local' | 'cloud'>('local');
  const cloud = source === 'cloud' && expectedUserId !== null;
  return <View style={styles.screen}>
    <View style={styles.tabs}>
      {(['local', 'cloud'] as const).map(value => {
        const selected = value === 'cloud' ? cloud : !cloud;
        const disabled = value === 'cloud' && !expectedUserId;
        return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected, disabled }}
          disabled={disabled} onPress={() => setSource(value)} testID={`map-library-${value}`}
          style={[styles.tab, { backgroundColor: selected ? appearance.selectionSurface : appearance.surface }]}>
          <Text style={[typography.label, { color: selected ? appearance.selectionInk : appearance.secondary }]}>
            {value === 'local' ? '本地地图' : '云端地图'}
          </Text>
        </Pressable>;
      })}
    </View>
    {cloud ? <CloudMapsScreen key={expectedUserId} expectedUserId={expectedUserId} onBack={() => setSource('local')} /> : children}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  tab: { flex: 1, minHeight: 44, padding: 12, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
