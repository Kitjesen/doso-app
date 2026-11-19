import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { images } from '../assets';
import { Text } from '../components/AppText';
import { ControlPanelMotion } from '../components/ControlPanelMotion';
import { useAppTheme } from '../theme';

type Variant = 'A' | 'B' | 'C';
type CardId = 'battery' | 'link' | 'updated';

const cards: Array<{ id: CardId; label: string; value: string; detail: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: 'battery', label: '电量', value: '86%', detail: '电池健康 · 预计可运行 42 分钟', icon: 'battery-half-outline' },
  { id: 'link', label: '连接', value: '5G', detail: '广电 5G · 信号稳定 · 延迟 42 ms', icon: 'cellular-outline' },
  { id: 'updated', label: '更新时间', value: '14:32', detail: '最近一次状态采集 · 12 秒前', icon: 'time-outline' },
];

export function HomeInteractionPrototype() {
  const { colors, isDark } = useAppTheme();
  const [variant, setVariant] = useState<Variant>(readVariant);
  const [activeCard, setActiveCard] = useState<CardId | null>('battery');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setVariant(value => cycle(value, event.key === 'ArrowRight' ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const surface = isDark ? '#242423' : '#FFFFFF';
  const line = isDark ? '#383836' : '#E1E5EA';
  const ink = isDark ? '#F2F2EF' : '#20242A';
  const muted = isDark ? '#A7A7A1' : '#69717C';
  const accent = isDark ? '#9BBBD8' : '#477AA6';
  const root = { backgroundColor: isDark ? '#1C1C1B' : '#F5F6F9' };
  const shared = { surface, line, ink, muted, accent, online };

  return <View style={[styles.root, root]} testID="home-interaction-prototype">
    <View style={[styles.header, { borderColor: line }]}>
      <Text style={[styles.brand, { color: ink }]}>DOSO robotics</Text>
      <View style={styles.headerRight}><StatusPulse active={online} /><Text style={[styles.headerText, { color: muted }]}>{online ? '实时状态' : '状态已过期'}</Text></View>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <ControlPanelMotion key={variant} style={styles.variantBody}>
        {variant === 'A' ? <VariantA {...shared} activeCard={activeCard} onSelect={setActiveCard} /> : null}
        {variant === 'B' ? <VariantB {...shared} activeCard={activeCard} onSelect={setActiveCard} /> : null}
        {variant === 'C' ? <VariantC {...shared} activeCard={activeCard} onSelect={setActiveCard} /> : null}
      </ControlPanelMotion>
      <Pressable accessibilityRole="button" onPress={() => setOnline(value => !value)} style={({ pressed }) => [styles.connection, { backgroundColor: surface, borderColor: line }, pressed && styles.pressed]}>
        <Ionicons name={online ? 'radio-outline' : 'cloud-offline-outline'} size={20} color={online ? accent : muted} />
        <Text style={[styles.connectionText, { color: ink }]}>{online ? '点击模拟断网' : '点击模拟恢复连接'}</Text>
        <Text style={[styles.connectionHint, { color: muted }]}>{online ? '卡片显示实时状态' : '状态卡片转为过期状态'}</Text>
      </Pressable>
    </ScrollView>
    <View style={[styles.switcher, { backgroundColor: surface, borderColor: line }]}>
      <Pressable accessibilityLabel="上一个交互示例" onPress={() => setVariant(value => cycle(value, -1))} style={styles.switchButton}><Ionicons name="chevron-back" size={18} color={ink} /></Pressable>
      <Text style={[styles.switchLabel, { color: ink }]}>{variant} · {variantName(variant)}</Text>
      <Pressable accessibilityLabel="下一个交互示例" onPress={() => setVariant(value => cycle(value, 1))} style={styles.switchButton}><Ionicons name="chevron-forward" size={18} color={ink} /></Pressable>
    </View>
  </View>;
}

function VariantA({ surface, line, ink, muted, accent, online, activeCard, onSelect }: SharedProps & { activeCard: CardId | null; onSelect: (id: CardId | null) => void }) {
  return <>
    <TitleBlock title="状态卡片" copy="点击卡片查看对应详情" ink={ink} muted={muted} />
    <View style={styles.cardRow}>{cards.map(card => <MotionCard key={card.id} accessibilityState={{ selected: activeCard === card.id }} onPress={() => onSelect(activeCard === card.id ? null : card.id)} style={[styles.statusCard, { backgroundColor: surface, borderColor: activeCard === card.id ? accent : line }]}>
      <Ionicons name={card.icon} size={19} color={activeCard === card.id ? accent : muted} />
      <Text style={[styles.cardLabel, { color: muted }]}>{card.label}</Text>
      <Text style={[styles.cardValue, { color: ink }]}>{online || card.id === 'updated' ? card.value : '—'}</Text>
      {activeCard === card.id ? <ControlPanelMotion key={`${card.id}-${online}`}><Text style={[styles.cardHint, { color: muted }]}>{online ? card.detail : '网络中断，等待恢复'}</Text></ControlPanelMotion> : null}
    </MotionCard>)}</View>
    <TaskCard surface={surface} line={line} ink={ink} muted={muted} accent={accent} />
  </>;
}

function MotionCard({ children, onPress, style, accessibilityState }: { children: ReactNode; onPress: () => void; style: object; accessibilityState?: { selected?: boolean } }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue: number) => Animated.spring(scale, { toValue, friction: 8, tension: 180, useNativeDriver: Platform.OS !== 'web' }).start();
  return <Animated.View style={[style, { transform: [{ scale }] }]}>
    <Pressable accessibilityRole="button" accessibilityState={accessibilityState} onPress={onPress} onPressIn={() => animate(.98)} onPressOut={() => animate(1)} style={styles.cardPressable}>
      {children}
    </Pressable>
  </Animated.View>;
}

function StatusPulse({ active }: { active: boolean }) {
  const opacity = useRef(new Animated.Value(active ? 1 : .55)).current;
  useEffect(() => {
    let alive = true;
    let loop: Animated.CompositeAnimation | undefined;
    const stop = () => { loop?.stop(); loop = undefined; opacity.stopAnimation(); opacity.setValue(active ? 1 : .55); };
    const start = (reduced: boolean) => {
      if (!alive) return;
      stop();
      if (!active || reduced) return;
      loop = Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: .55, duration: 900, useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
        Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web', isInteraction: false }),
      ]));
      loop.start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(start, () => start(true));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', start);
    return () => { alive = false; loop?.stop(); subscription.remove(); };
  }, [active, opacity]);
  return <Animated.View style={[styles.dot, { backgroundColor: active ? '#79C59A' : '#A0A09B', opacity }]} />;
}

function VariantB({ surface, line, ink, muted, accent, online, activeCard, onSelect }: SharedProps & { activeCard: CardId | null; onSelect: (id: CardId | null) => void }) {
  return <>
    <TitleBlock title="主视觉 + 状态轨道" copy="机器狗状态集中在底部轨道" ink={ink} muted={muted} />
    <View style={[styles.hero, { backgroundColor: surface, borderColor: line }]}>
      <Image source={images.thunderHero} resizeMode="contain" style={styles.heroImage} />
      <View style={styles.heroBadge}><View style={[styles.dot, { backgroundColor: online ? '#79C59A' : '#A0A09B' }]} /><Text style={[styles.heroBadgeText, { color: ink }]}>{online ? 'THUNDER 01 在线' : 'THUNDER 01 离线'}</Text></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
      {cards.map(card => <Pressable key={card.id} onPress={() => onSelect(activeCard === card.id ? null : card.id)} style={({ pressed }) => [styles.railItem, { backgroundColor: activeCard === card.id ? accent : surface, borderColor: line }, pressed && styles.pressed]}>
        <Text style={[styles.railLabel, { color: activeCard === card.id ? '#101820' : muted }]}>{card.label}</Text>
        <Text style={[styles.railValue, { color: activeCard === card.id ? '#101820' : ink }]}>{online ? card.value : '—'}</Text>
      </Pressable>)}
    </ScrollView>
    {activeCard ? <View style={[styles.detailBar, { backgroundColor: surface, borderColor: line }]}><Text style={[styles.detailTitle, { color: ink }]}>{cards.find(card => card.id === activeCard)?.label}</Text><Text style={[styles.detailCopy, { color: muted }]}>{online ? cards.find(card => card.id === activeCard)?.detail : '状态已过期，恢复连接后继续更新'}</Text></View> : null}
  </>;
}

function VariantC({ surface, line, ink, muted, accent, online, activeCard, onSelect }: SharedProps & { activeCard: CardId | null; onSelect: (id: CardId | null) => void }) {
  return <>
    <TitleBlock title="状态时间线" copy="状态变化沿时间线展开" ink={ink} muted={muted} />
    <View style={[styles.timeline, { backgroundColor: surface, borderColor: line }]}>
      {cards.map((card, index) => <Pressable key={card.id} onPress={() => onSelect(activeCard === card.id ? null : card.id)} style={({ pressed }) => [styles.timelineRow, { borderColor: line }, pressed && styles.pressed]}>
        <View style={[styles.timelineDot, { backgroundColor: activeCard === card.id ? accent : index === 0 && online ? '#79C59A' : muted }]} />
        <View style={styles.timelineCopy}><Text style={[styles.timelineLabel, { color: ink }]}>{card.label}</Text><Text style={[styles.timelineValue, { color: muted }]}>{online ? card.value : '状态已过期'}</Text>{activeCard === card.id ? <Text style={[styles.timelineDetail, { color: muted }]}>{online ? card.detail : '恢复网络后重新采集'}</Text> : null}</View>
        <Ionicons name={activeCard === card.id ? 'chevron-up' : 'chevron-forward'} size={18} color={muted} />
      </Pressable>)}
    </View>
    <TaskCard surface={surface} line={line} ink={ink} muted={muted} accent={accent} compact />
  </>;
}

function TaskCard({ surface, line, ink, muted, accent, compact = false }: SharedProps & { compact?: boolean }) {
  return <View style={[styles.task, compact && styles.taskCompact, { backgroundColor: surface, borderColor: line }]}><View style={styles.taskHeading}><Text style={[styles.taskTitle, { color: ink }]}>园区巡检</Text><Text style={[styles.taskStatus, { color: accent }]}>进行中</Text></View><Text style={[styles.taskCopy, { color: muted }]}>园区东侧步道 · 3/6 检查点</Text><View style={[styles.track, { backgroundColor: line }]}><View style={[styles.progress, { backgroundColor: accent }]} /></View><Text style={[styles.taskCopy, { color: muted }]}>已运行 12 分钟</Text></View>;
}

function TitleBlock({ title, copy, ink, muted }: { title: string; copy: string; ink: string; muted: string }) {
  return <View style={styles.titleBlock}><Text style={[styles.title, { color: ink }]}>{title}</Text><Text style={[styles.copy, { color: muted }]}>{copy}</Text></View>;
}

type SharedProps = { surface: string; line: string; ink: string; muted: string; accent: string; online?: boolean };

function readVariant(): Variant {
  if (typeof window === 'undefined') return 'A';
  const value = new URLSearchParams(window.location.search).get('qa-variant');
  return value === 'B' || value === 'C' ? value : 'A';
}

function cycle(value: Variant, delta: number): Variant {
  const values: Variant[] = ['A', 'B', 'C'];
  return values[(values.indexOf(value) + delta + values.length) % values.length];
}

function variantName(value: Variant) {
  return value === 'A' ? '状态卡片' : value === 'B' ? '状态轨道' : '状态时间线';
}

const styles = StyleSheet.create({
  root: { flex: 1 }, header: { minHeight: 48, paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { fontSize: 17, fontWeight: '600' }, headerRight: { flexDirection: 'row', alignItems: 'center', gap: 7 }, headerText: { fontSize: 13 }, dot: { width: 7, height: 7, borderRadius: 4 }, variantBody: { gap: 16 }, content: { padding: 20, paddingBottom: 110, gap: 16 }, titleBlock: { gap: 3 }, title: { fontSize: 22, lineHeight: 30, fontWeight: '600' }, copy: { fontSize: 14, lineHeight: 20 }, cardRow: { flexDirection: 'row', gap: 8 }, statusCard: { flex: 1, minHeight: 124, padding: 12, borderWidth: 1, borderRadius: 16, gap: 5 }, cardPressable: { flex: 1, gap: 5 }, cardLabel: { fontSize: 13 }, cardValue: { fontSize: 26, lineHeight: 32, fontWeight: '600', fontVariant: ['tabular-nums'] }, cardHint: { fontSize: 12, lineHeight: 18 }, hero: { minHeight: 260, borderWidth: 1, borderRadius: 20, overflow: 'hidden', position: 'relative', alignItems: 'center', justifyContent: 'center' }, heroImage: { width: '90%', height: 220 }, heroBadge: { position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 7 }, heroBadgeText: { fontSize: 14, fontWeight: '600' }, rail: { gap: 8 }, railItem: { minWidth: 110, padding: 12, borderRadius: 14, borderWidth: 1, gap: 4 }, railLabel: { fontSize: 12 }, railValue: { fontSize: 22, fontWeight: '600' }, detailBar: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4 }, detailTitle: { fontSize: 15, fontWeight: '600' }, detailCopy: { fontSize: 13, lineHeight: 20 }, timeline: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14 }, timelineRow: { minHeight: 76, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 }, timelineDot: { width: 10, height: 10, borderRadius: 5 }, timelineCopy: { flex: 1, gap: 2 }, timelineLabel: { fontSize: 15, fontWeight: '600' }, timelineValue: { fontSize: 14 }, timelineDetail: { fontSize: 12 }, task: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 8 }, taskCompact: { borderRadius: 14 }, taskHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, taskTitle: { fontSize: 16, fontWeight: '600' }, taskStatus: { fontSize: 13, fontWeight: '600' }, taskCopy: { fontSize: 13, lineHeight: 19 }, track: { height: 7, borderRadius: 4, overflow: 'hidden' }, progress: { width: '50%', height: '100%', borderRadius: 4 }, connection: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 4, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }, connectionText: { fontSize: 14, fontWeight: '600' }, connectionHint: { width: '100%', marginLeft: 26, fontSize: 12 }, switcher: { position: 'absolute', left: '50%', bottom: 22, transform: [{ translateX: -128 }], width: 256, minHeight: 46, borderWidth: 1, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, shadowColor: '#000', shadowOpacity: .2, shadowRadius: 12, elevation: 4 }, switchButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, switchLabel: { fontSize: 13, fontWeight: '600' }, pressed: { opacity: .65, transform: [{ scale: .98 }] },
});
