import type { ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { controlHudColors, DosoWordmark } from './ControlReferenceUi';
import { ControlGlassTarget, useControlGlass } from './ControlGlass';
import { ControlVideoSurface, type ControlVideoPresentation } from './ControlVideoSurface';
import { ControlPanelMotion } from './ControlPanelMotion';
import { Text } from './AppText';

export const controlSetupAppearance = {
  canvas: '#141414', surface: controlHudColors.glass, raised: '#2C2C2C',
  ink: controlHudColors.ink, secondary: controlHudColors.muted, border: 'rgba(255, 255, 255, 0.09)',
  blue: '#EAEAEA', blueInk: '#F2F2F2', action: '#F2F2F2', actionInk: '#141414',
};
export const controlSetupColors = {
  background: controlSetupAppearance.canvas, surface: controlSetupAppearance.surface,
  ink: controlSetupAppearance.ink, muted: controlSetupAppearance.secondary, line: controlSetupAppearance.border,
  authPrimary: controlSetupAppearance.action, authPrimaryInk: controlSetupAppearance.actionInk, dangerText: '#FCA5A5',
};

export type ControlSetupMedia = Readonly<{
  presentation?: ControlVideoPresentation;
  surface?: ReactNode;
  active: boolean;
  onInterrupted: () => void;
}>;
const noMediaInterruption = () => {};

// Only a supplied receiver may provide imagery. Missing media stays explicitly unavailable.
export function ControlSetupBackground({ media }: { media?: ControlSetupMedia }) {
  const glass = useControlGlass(true, true);
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glass.canvas }]}>
    <ControlGlassTarget ref={glass.target} style={StyleSheet.absoluteFill}>
      <ControlVideoSurface presentation={media?.presentation} surface={media?.surface} active={media?.active ?? true}
        onInterrupted={media?.onInterrupted ?? noMediaInterruption} statusTop={100} statusColor={glass.muted} />
    </ControlGlassTarget>
    {glass.backdrop()}
    <LinearGradient colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0.52)']} style={StyleSheet.absoluteFill} />
    {!media?.surface || !media.active || media.presentation?.phase !== 'receiving' ? <Text style={styles.mediaStatus}>无实时画面</Text> : null}
  </View>;
}

export function ControlSetupPage({ title, onBack, backTestID, header, media, children }: {
  title: string; onBack: () => void; backTestID?: string; header?: ReactNode; media?: ControlSetupMedia; children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const titlePillWidth = Math.min(compact ? 170 : 220, Math.max(132, width - (compact ? 132 : 180)));
  return <View style={styles.page}>
    <ControlSetupBackground media={media} />
    {header ?? <View style={styles.header}>
      <DosoWordmark width={compact ? 64 : 96} />
      <View style={[styles.titlePill, { width: titlePillWidth, transform: [{ translateX: -titlePillWidth / 2 }] }]}><Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text></View>
    </View>}
    <ControlPanelMotion style={styles.content}>{children}</ControlPanelMotion>
    <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="返回" testID={backTestID} style={styles.back}>
      <Ionicons name="close" size={23} color={controlHudColors.ink} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, position: 'relative', backgroundColor: controlSetupAppearance.canvas },
  mediaStatus: { position: 'absolute', left: '4%', bottom: 12, color: controlHudColors.muted, fontSize: 12, lineHeight: 18 },
  header: { position: 'absolute', top: 12, left: '4%', right: '3%', height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 10, zIndex: 10 },
  titlePill: { position: 'absolute', left: '50%', width: 220, transform: [{ translateX: -110 }], alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 30, backgroundColor: 'rgba(24, 24, 24, 0.88)', borderWidth: .5, borderColor: 'rgba(255, 255, 255, 0.12)' },
  title: { color: controlHudColors.ink, fontSize: 18, lineHeight: 24, fontWeight: '500' },
  back: { position: 'absolute', right: '3%', bottom: 0, width: 44, height: 40, alignItems: 'center', justifyContent: 'center', elevation: 11, zIndex: 11 },
  content: { flex: 1, paddingTop: 80, paddingBottom: 40, paddingHorizontal: '3.6%' },
});
