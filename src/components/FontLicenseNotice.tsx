import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './AppText';
import { fontCopyright, fontLicense } from '../fonts/font-license';
import { useAppTheme } from '../theme';

// MiSans requires in-software attribution and retention of its full license.
// The full notice is bundled as text, so it stays readable without a network.
export function FontLicenseNotice() {
  const [expanded, setExpanded] = useState(false);
  const { colors } = useAppTheme();
  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" accessibilityLabel="界面字体 MiSans，查看字体许可" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={styles.action} testID="font-license-toggle">
        <Text style={[styles.label, { color: colors.muted }]}>界面字体（MiSans）{expanded ? '−' : '+'}</Text>
      </Pressable>
      {expanded ? <View testID="font-license-details"><Text selectable style={[styles.copy, { color: colors.inkSoft }]}>{fontCopyright}{'\n\n'}{fontLicense}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  action: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  label: { fontSize: 12, lineHeight: 18 },
  copy: { fontSize: 14, lineHeight: 22, paddingVertical: 12 },
});
