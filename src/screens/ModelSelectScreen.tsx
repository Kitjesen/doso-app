import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Image, type LayoutChangeEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text, TextInput } from '../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';

import { robotModels } from '../models';
import { radii, type ThemeColors, useAppTheme } from '../theme';
import type { RobotModel } from '../types';
import { findVisibleSelectedModel, getModelSelectLayoutMetrics } from './modelSelectLayout';
import type { ModelSelectLayoutMetrics } from './modelSelectLayout';

type ModelSelectScreenProps = {
  busy?: boolean;
  onContinue: (model: RobotModel) => void;
  onBack: () => void;
  onSkip: () => void;
  onOpenRobotConnection?: () => void;
};

type FilterId = '全部' | '四足' | '轮式' | '室内';

const filters: FilterId[] = ['全部', '四足', '轮式', '室内'];

export function ModelSelectScreen({ busy = false, onContinue, onBack, onSkip, onOpenRobotConnection }: ModelSelectScreenProps) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { fontScale, height, width } = useWindowDimensions();
  const isLandscape = width > height;
  const largeText = fontScale >= 1.5;
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeFilter, setActiveFilter] = useState<FilterId>('全部');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(robotModels[0].id);
  const layout = useMemo(
    () => getModelSelectLayoutMetrics({ containerWidth, isLandscape, largeText }),
    [containerWidth, isLandscape, largeText],
  );
  const styles = useMemo(() => createStyles(colors, isDark, layout), [colors, isDark, layout]);

  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();

    return robotModels.filter((model) => {
      const matchesFilter = activeFilter === '全部'
        || model.category === activeFilter
        || model.environment === activeFilter;
      const matchesQuery = normalizedQuery.length === 0
        || model.name.toLocaleLowerCase().includes(normalizedQuery)
        || model.description.toLocaleLowerCase().includes(normalizedQuery);

      return matchesFilter && matchesQuery;
    });
  }, [activeFilter, query]);

  const visibleSelectedModel = findVisibleSelectedModel(filteredModels, selectedId);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const continueDisabled = busy || visibleSelectedModel === null;
  const continueLabel = busy ? '正在进入…' : '继续';
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.max(0, Math.floor(event.nativeEvent.layout.width));
    setContainerWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
  }, []);

  const header = (
    <View style={styles.topBar}>
      <Pressable
        accessibilityLabel="返回"
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onBack}
        testID="model-back"
        style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
      >
        <Ionicons color={colors.inkSoft} name="chevron-back" size={23} />
      </Pressable>

      <View accessibilityLabel="第 1 步，共 4 步" accessibilityRole="progressbar" style={styles.progress}>
        {[0, 1, 2, 3].map((step) => (
          <View key={step} style={[styles.progressSegment, step === 0 && styles.progressActive]} />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onSkip}
        testID="model-skip"
        style={({ pressed }) => [styles.skipButton, pressed && styles.pressed]}
      >
        <Text style={styles.skipText}>跳过</Text>
      </Pressable>
    </View>
  );

  const intro = (
    <View style={styles.intro}>
      <Text style={styles.title}>选择机型</Text>
      <Text style={styles.subtitle}>按名称或类别查找机型</Text>
      {onOpenRobotConnection ? <Pressable
        accessibilityRole="button" accessibilityLabel="连接真实机器狗，输入 IP"
        accessibilityState={{ disabled: busy }} disabled={busy}
        onPress={() => { if (!busyRef.current) onOpenRobotConnection(); }}
        style={({ pressed }) => [{ minHeight: 48, justifyContent: 'center', paddingVertical: 8 }, pressed && styles.pressed]}
        testID="model-connect-robot"
      ><Text style={[typography.label, { color: p.blueInk }]}>已有机器狗？输入 IP 连接</Text></Pressable> : null}
    </View>
  );

  const search = (
    <View style={styles.searchField}>
      <Ionicons color={colors.muted} name="search-outline" size={20} />
      <TextInput
        accessibilityLabel="搜索机器人型号"
        autoCapitalize="characters"
        editable={!busy}
        onChangeText={setQuery}
        placeholder="搜索机器人型号"
        placeholderTextColor={colors.inkSoft}
        returnKeyType="search"
        style={styles.searchInput}
        testID="model-search-input"
        value={query}
      />
      {query.length > 0 ? (
        <Pressable
          accessibilityLabel="清除搜索"
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => setQuery('')}
          testID="model-search-clear"
          style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
        >
          <Ionicons color={colors.muted} name="close-circle" size={19} />
        </Pressable>
      ) : null}
    </View>
  );

  const filterBar = (
    <ScrollView
      contentContainerStyle={styles.filters}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filterScroller}
    >
      {filters.map((filter) => {
        const active = filter === activeFilter;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, selected: active }}
            disabled={busy}
            key={filter}
            onPress={() => setActiveFilter(filter)}
            testID={`model-filter-${filter}`}
            style={({ pressed }) => [styles.filterHitBox, pressed && styles.pressed]}
          >
            <View style={[styles.filterChip, active && styles.filterChipActive]}>
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{filter}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  const availability = (
    <View style={styles.availabilityRow}>
      <Text style={styles.availabilityText}>可选 {filteredModels.length} 款机型</Text>
      <Text style={styles.filterSummaryText}>按当前筛选</Text>
    </View>
  );

  const modelGrid = filteredModels.length > 0 ? (
    <View accessibilityLabel={`当前显示 ${filteredModels.length} 款真实机型`} style={styles.grid}>
      {filteredModels.map((model) => {
        const selected = selectedId === model.id;
        return (
          <Pressable
            accessibilityLabel={`${model.name}，${model.description}，${model.category}，${model.environment}${selected ? '，已选择' : ''}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, selected }}
            disabled={busy}
            key={model.id}
            onPress={() => setSelectedId(model.id)}
            testID={`model-card-${model.id}`}
            style={({ pressed }) => [
              styles.card,
              selected && styles.cardSelected,
              pressed && styles.cardPressed,
            ]}
          >
            <Text
              numberOfLines={2}
              style={[styles.modelName, selected && styles.selectedText]}
            >
              {model.name}
            </Text>
            <Text numberOfLines={layout.largeText ? undefined : 2} style={[styles.modelDescription, selected && styles.selectedText]}>{model.description}</Text>
            <View style={styles.imageWrap}>
              <Image resizeMode="contain" source={model.image} style={styles.robotImage} />
              {model.id === 'thunder-pro' ? (
                <View style={[styles.bakedBadgeMask, selected && styles.bakedBadgeMaskSelected]} />
              ) : null}
            </View>
            {selected ? (
              <View style={styles.selectedBadge}>
                <Ionicons color={p.actionInk} name="checkmark" size={layout.usesColumns ? 15 : 18} />
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <View style={styles.metaPill}><Text style={[styles.metaText, selected && styles.selectedText]}>{model.category}</Text></View>
              <View style={styles.metaPill}><Text style={[styles.metaText, selected && styles.selectedText]}>{model.environment}</Text></View>
            </View>
          </Pressable>
        );
      })}
    </View>
  ) : (
    <View accessibilityLiveRegion="polite" style={styles.emptyState}>
      <Ionicons color={colors.muted} name="search" size={28} />
      <Text style={styles.emptyTitle}>没有找到匹配机型</Text>
      <Text style={styles.emptyText}>试试其他名称或分类</Text>
    </View>
  );

  const continueButton = (
    <Pressable
      accessibilityHint={visibleSelectedModel
        ? '仅选择机型，不会绑定或配置机器人'
        : '请先选择当前可见机型'}
      accessibilityRole="button"
      accessibilityState={{ disabled: continueDisabled }}
      disabled={continueDisabled}
      onPress={() => {
        if (!busyRef.current && visibleSelectedModel) {
          onContinue(visibleSelectedModel);
        }
      }}
      style={({ pressed }) => [styles.continuePressable, pressed && styles.continuePressed]}
      testID="model-continue"
    >
      <View style={[styles.continueButton, continueDisabled && styles.continueButtonDisabled]}>
        <Text style={[styles.continueLabel, continueDisabled && styles.continueLabelBusy]}>
          {visibleSelectedModel ? continueLabel : '请选择机型'}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View onLayout={handleLayout} style={styles.screen}>
        {layout.usesColumns ? (
          <View style={styles.landscapeGrid}>
            <View style={styles.leftColumn}>
              {header}
              {intro}
              {search}
              {filterBar}
              {availability}
              <View style={styles.landscapeButton}>{continueButton}</View>
              <Text style={styles.previewNotice}>仅选择机型，不会绑定或配置机器人</Text>
            </View>
            <ScrollView
              contentContainerStyle={styles.landscapeModelContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.rightColumn}
            >
              {modelGrid}
            </ScrollView>
          </View>
        ) : (
          <>
            <View style={styles.portraitHeader}>{header}</View>
            <ScrollView
              contentContainerStyle={styles.portraitContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.portraitScroll}
            >
              {intro}
              {search}
              {filterBar}
              {availability}
              {modelGrid}
              <Text style={styles.previewNotice}>仅选择机型，不会绑定或配置机器人</Text>
            </ScrollView>
            <View style={styles.footer}>{continueButton}</View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean, layout: ModelSelectLayoutMetrics) {
  const {
    cardGap,
    cardHeight,
    cardWidth,
    cardsPerRow,
    controlWidth,
    gridGap,
    headerProgressWidth,
    largeText,
    leftColumnWidth,
    rightColumnWidth,
    usesColumns,
  } = layout;
  const p = getProductAppearance(isDark);
  const cardSurface = p.surface;
  const selectedCardSurface = p.action;
  const fieldSurface = p.surface;
  const inactiveChipSurface = 'transparent';
  const selectedBadgeSurface = p.action;

  return StyleSheet.create({
    safeArea: { backgroundColor: colors.background, flex: 1 },
    screen: { flex: 1 },
    portraitHeader: { paddingHorizontal: 22 },
    topBar: { alignItems: 'center', flexDirection: 'row', height: usesColumns ? 54 : 64, justifyContent: 'space-between' },
    roundButton: {
      alignItems: 'center',
      backgroundColor: fieldSurface,
      borderRadius: radii.pill,
      height: 48,
      justifyContent: 'center',
      width: 48,
    },
    progress: { flexDirection: 'row', gap: 5, width: headerProgressWidth },
    progressSegment: { backgroundColor: p.surface, borderRadius: radii.pill, flex: 1, height: 4 },
    progressActive: { backgroundColor: p.action },
    skipButton: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 48, minWidth: 48 },
    skipText: { ...typography.label, color: p.ink },
    intro: { alignItems: 'center', marginTop: usesColumns ? 0 : 1 },
    title: { ...typography.compactTitle, color: p.ink },
    subtitle: { ...typography.supporting, color: p.secondary, marginTop: usesColumns ? 1 : 2 },
    searchField: {
      alignItems: 'center',
      backgroundColor: fieldSurface,
      borderRadius: radii.pill,
      flexDirection: 'row',
      minHeight: 48,
      marginTop: usesColumns ? 12 : 14,
      paddingLeft: 14,
      width: controlWidth,
    },
    searchInput: { ...typography.label, color: p.ink, flex: 1, marginLeft: 8, paddingVertical: 11 },
    clearButton: { alignItems: 'center', height: 48, justifyContent: 'center', width: 48 },
    filterScroller: {
      alignSelf: usesColumns ? 'center' : undefined,
      flexGrow: 0,
      flexShrink: 0,
      height: 48,
      marginTop: 5,
      width: usesColumns && typeof controlWidth === 'number' ? Math.min(312, controlWidth) : undefined,
    },
    filters: { gap: usesColumns ? 8 : 9 },
    filterHitBox: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    filterChip: {
      alignItems: 'center',
      backgroundColor: inactiveChipSurface,
      borderRadius: radii.pill,
      height: 30,
      justifyContent: 'center',
      minWidth: usesColumns ? 72 : 64,
      paddingHorizontal: 13,
    },
    filterChipActive: { backgroundColor: p.action },
    filterText: { ...typography.supporting, color: p.secondary },
    filterTextActive: { color: p.actionInk, fontWeight: '500' },
    availabilityRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: usesColumns ? 2 : 1,
      width: controlWidth,
    },
    availabilityText: { ...typography.supporting, color: p.ink },
    filterSummaryText: { ...typography.supporting, color: p.secondary },
    portraitScroll: { flex: 1 },
    portraitContent: { paddingBottom: 15, paddingHorizontal: 22 },
    grid: {
      alignSelf: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      columnGap: cardGap,
      justifyContent: 'flex-start',
      marginTop: usesColumns ? 0 : 25,
      rowGap: usesColumns ? 12 : 12,
      width: usesColumns ? rightColumnWidth : cardWidth * cardsPerRow + cardGap * (cardsPerRow - 1),
    },
    card: {
      backgroundColor: cardSurface,
      borderRadius: cardLayout.radius,
      minHeight: cardHeight,
      overflow: 'hidden',
      padding: cardLayout.inset,
      position: 'relative',
      width: cardWidth,
    },
    cardSelected: { backgroundColor: selectedCardSurface },
    cardPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
    modelName: { ...typography.label, color: p.ink, minHeight: 44, paddingRight: usesColumns ? 20 : 24 },
    modelDescription: {
      ...typography.supporting,
      color: p.secondary,
      marginTop: 2,
      minHeight: 40,
      paddingRight: 0,
    },
    selectedText: { color: p.actionInk },
    imageWrap: {
      alignItems: 'center',
      height: usesColumns ? 50 : largeText ? 120 : 105,
      justifyContent: 'center',
      marginHorizontal: -5,
      marginTop: usesColumns ? 1 : 5,
      overflow: 'hidden',
      position: 'relative',
    },
    robotImage: { height: usesColumns ? 50 : largeText ? 120 : 105, width: usesColumns ? Math.min(156, cardWidth - 20) : largeText ? Math.min(220, cardWidth - 28) : 150 },
    bakedBadgeMask: {
      backgroundColor: cardSurface,
      borderRadius: radii.pill,
      height: usesColumns ? 45 : 50,
      position: 'absolute',
      right: 0,
      top: 0,
      width: usesColumns ? 50 : 55,
    },
    bakedBadgeMaskSelected: { backgroundColor: selectedCardSurface },
    selectedBadge: {
      alignItems: 'center',
      backgroundColor: selectedBadgeSurface,
      borderRadius: radii.pill,
      height: usesColumns ? 28 : 34,
      justifyContent: 'center',
      position: 'absolute',
      right: usesColumns ? 0 : -1,
      top: usesColumns ? 0 : -1,
      width: usesColumns ? 28 : 34,
    },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, minHeight: largeText ? 32 : 20 },
    metaPill: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: radii.pill,
      flex: 1,
      justifyContent: 'center',
    },
    metaText: { ...typography.supporting, color: p.secondary },
    emptyState: {
      alignItems: 'center',
      alignSelf: 'stretch',
      justifyContent: 'center',
      minHeight: usesColumns ? 250 : 330,
      width: usesColumns ? rightColumnWidth : '100%',
    },
    emptyTitle: { ...typography.label, color: p.ink, marginTop: 12 },
    emptyText: { ...typography.supporting, color: p.secondary, marginTop: 4 },
    footer: {
      backgroundColor: colors.background,
      paddingBottom: 12,
      paddingHorizontal: 22,
      paddingTop: 7,
    },
    continuePressable: { width: '100%' },
    continuePressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
    continueButton: { alignItems: 'center', backgroundColor: p.action, borderRadius: radii.pill, height: 52, justifyContent: 'center' },
    continueButtonDisabled: { backgroundColor: p.surface },
    continueLabel: { ...typography.label, color: p.actionInk },
    continueLabelBusy: { color: p.secondary },
    previewNotice: {
      ...typography.supporting,
      color: p.secondary,
      bottom: usesColumns ? 0 : undefined,
      left: usesColumns ? 0 : undefined,
      marginTop: usesColumns ? 0 : 9,
      position: usesColumns ? 'absolute' : 'relative',
      textAlign: 'center',
      width: controlWidth,
    },
    landscapeGrid: {
      alignSelf: 'center',
      flexDirection: 'row',
      gap: gridGap,
      height: '100%',
      paddingHorizontal: 20,
      paddingTop: 24,
      width: layout.availableContentWidth + 40,
    },
    leftColumn: { height: '100%', position: 'relative', width: leftColumnWidth },
    rightColumn: { flexGrow: 0, width: rightColumnWidth },
    landscapeModelContent: { paddingBottom: 10, paddingTop: 10 },
    landscapeButton: { alignSelf: 'center', marginTop: 22, width: controlWidth },
    pressed: { opacity: 0.62, transform: [{ scale: 0.98 }] },
  });
}
