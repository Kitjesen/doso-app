import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, ImageSourcePropType, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';

import { images } from '../assets';
import {
  attemptRouteStart,
  deriveRouteStartReadiness,
  RouteStartCandidate,
} from '../features/routes/routeStartPolicy';
import { ThemeColors, useAppTheme } from '../theme';
import { typography } from '../typography';
import { cardLayout, getProductAppearance } from '../appearance';
import { getAdaptivePageLayout } from '../layout/adaptiveLayout';

type Props = {
  blockedReason?: string;
  controlAvailable: boolean;
  executorAvailable: boolean;
  onStartRoute: (trustedRouteId: string) => void;
  robotName: string;
  showExamples?: boolean;
};
type Filter = '全部路线' | '最近' | '收藏';
type RouteLibrary = '示例路线' | '我的路线';

type RouteTemplate = {
  code: string;
  favorite: boolean;
  geometryValidation: RouteStartCandidate['geometryValidation'];
  id: string;
  image: ImageSourcePropType;
  name: string;
  recent: boolean;
  routeId: string | null;
  source: RouteStartCandidate['source'];
};

const routes: RouteTemplate[] = [
  { id: 'a', name: 'A 区巡航模板', code: '路线界面预览', image: images.routeMapLarge, recent: true, favorite: true, geometryValidation: 'unknown', routeId: null, source: 'template' },
  { id: 'b', name: '仓库环线模板', code: '路线界面预览', image: images.routeMapCompact, recent: true, favorite: false, geometryValidation: 'unknown', routeId: null, source: 'template' },
  { id: 'c', name: '充电座外围模板', code: '路线界面预览', image: images.routeMapLarge, recent: false, favorite: true, geometryValidation: 'unknown', routeId: null, source: 'template' },
];

type Styles = ReturnType<typeof createStyles>;

function RouteList({ onSelect, routes: visibleRoutes, selectedId, styles }: {
  onSelect: (id: string) => void;
  routes: RouteTemplate[];
  selectedId: string;
  styles: Styles;
}) {
  return (
    <View style={styles.routesCard}>
      {visibleRoutes.length === 0 ? (
        <View style={styles.emptyRoutes}>
          <Ionicons color="#7B7B7B" name="map-outline" size={24} />
          <Text style={styles.emptyRoutesText}>暂无符合条件的路线模板</Text>
        </View>
      ) : null}

      {visibleRoutes.map((route, index) => {
        const active = route.id === selectedId;
        return (
          <Pressable
            accessibilityLabel={`${route.name}，${route.code}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={route.id}
            testID={`route-template-${route.id}`}
            onPress={() => onSelect(route.id)}
            style={({ pressed }) => [
              styles.route,
              index > 0 && styles.routeCompact,
              active && styles.routeActive,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.mapPreview}>
              <Image accessibilityIgnoresInvertColors resizeMode="cover" source={route.image} style={styles.mapImage} />
              {active ? (
                <View style={styles.check}>
                  <Ionicons color={styles.checkIcon.color} name="checkmark" size={19} />
                </View>
              ) : null}
            </View>

            <View style={styles.routeCopy}>
              <Text style={[styles.routeName, active && styles.routeNameActive]} testID={`route-title-${route.id}`}>{route.name}</Text>
            </View>

            {!active ? <View style={styles.radio} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function MapScreen({ blockedReason, controlAvailable, executorAvailable, onStartRoute, robotName, showExamples = false }: Props) {
  const { colors, isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const { fontScale, height, width } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const isLandscape = width > height;
  const layout = getAdaptivePageLayout({
    containerWidth: viewport.width,
    windowHeight: viewport.height,
    isLandscape,
    fontScale,
    variant: 'map',
  });
  const styles = useMemo(
    () => createStyles(colors, isDark, layout.useColumns),
    [colors, isDark, layout.useColumns],
  );
  const measureViewport = ({ nativeEvent: { layout: measured } }: LayoutChangeEvent) => {
    const next = { width: Math.max(0, Math.floor(measured.width)), height: Math.max(0, Math.floor(measured.height)) };
    setViewport(current => current.width === next.width && current.height === next.height ? current : next);
  };
  const [filter, setFilter] = useState<Filter>('全部路线');
  const [library, setLibrary] = useState<RouteLibrary>('示例路线');
  const examplesSelected = showExamples && library === '示例路线';
  const [selectedId, setSelectedId] = useState('a');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const selected = useMemo(() => routes.find((route) => route.id === selectedId), [selectedId]);
  const visibleRoutes = useMemo(
    () => routes.filter((route) => filter === '全部路线' || (filter === '最近' ? route.recent : route.favorite)),
    [filter],
  );
  const routeCandidate = useMemo<RouteStartCandidate | null>(() => {
    if (!selected) return null;
    return {
      displayName: selected.name,
      geometryValidation: selected.geometryValidation,
      routeId: selected.routeId,
      source: selected.source,
    };
  }, [selected]);
  const routeStartInput = useMemo(
    () => ({
      candidate: routeCandidate,
      control: { available: controlAvailable },
      executor: { available: executorAvailable },
    }),
    [controlAvailable, executorAvailable, routeCandidate],
  );
  const routeStartReadiness = useMemo(() => deriveRouteStartReadiness(routeStartInput), [routeStartInput]);
  const routeCanStart = routeStartReadiness.enabled;
  const unavailableReason = routeStartReadiness.enabled
    ? undefined
    : ((routeStartReadiness.code === 'control-unavailable' || routeStartReadiness.code === 'executor-unavailable') && blockedReason)
      ? blockedReason
      : routeStartReadiness.reason;

  const changeFilter = (nextFilter: Filter) => {
    const nextRoutes = routes.filter((route) => nextFilter === '全部路线' || (nextFilter === '最近' ? route.recent : route.favorite));
    setFilter(nextFilter);
    setDetailsExpanded(false);
    setSelectedId((currentId) => nextRoutes.some((route) => route.id === currentId) ? currentId : nextRoutes[0]?.id ?? '');
  };

  const intro = (
    <>
      <Text accessibilityRole="header" style={styles.title}>巡航路线</Text>
      <Text style={styles.subtitle}>从设备地图开始规划巡航路线</Text>
    </>
  );

  const libraries = showExamples ? (
    <View accessibilityLabel="路线分类" accessibilityRole="tablist" style={styles.libraries}>
      {(['我的路线', '示例路线'] as RouteLibrary[]).map((item) => {
        const active = library === item;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            key={item}
            onPress={() => { setLibrary(item); setDetailsExpanded(false); }}
            style={({ pressed }) => [styles.libraryButton, active && styles.libraryButtonActive, pressed && styles.pressed]}
            testID={`route-library-${item}`}
          >
            <Text style={[styles.libraryText, active && styles.libraryTextActive]}>{item}</Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const filters = (
    <View style={styles.filters}>
      <View pointerEvents="none" style={styles.filterRail} />
      {(['全部路线', '最近', '收藏'] as Filter[]).map((item) => {
        const active = filter === item;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            key={item}
            testID={`route-filter-${item}`}
            onPress={() => changeFilter(item)}
            style={styles.filterPressable}
          >
            {active ? (
              <View style={styles.activeFilter}>
                <Text style={styles.activeFilterText}>{item}</Text>
              </View>
            ) : <Text style={styles.filterText}>{item}</Text>}
          </Pressable>
        );
      })}
    </View>
  );

  const actions = (
    <View style={styles.actionSection}>
      <View style={styles.actions}>
      <Pressable
        accessibilityLabel="示例路线不可执行"
        accessibilityHint={!routeCanStart ? unavailableReason : undefined}
        accessibilityRole="button"
        accessibilityState={{ disabled: !routeCanStart }}
        disabled={!routeCanStart}
        testID="route-start"
        onPress={() => { attemptRouteStart(routeStartInput, onStartRoute); }}
        style={({ pressed }) => [styles.startPressable, styles.startButton, !routeCanStart && styles.startDisabled, pressed && routeCanStart && styles.pressed]}
      >
        <Ionicons color={routeCanStart ? colors.authPrimaryInk : colors.muted} name={routeCanStart ? 'play' : 'lock-closed-outline'} size={17} />
        <Text style={[styles.startText, !routeCanStart && styles.startTextDisabled]}>示例不可执行</Text>
      </Pressable>

      <Pressable
        accessibilityLabel="路线说明"
        accessibilityHint={detailsExpanded ? '收起当前示例路线的说明' : '查看示例用途与真实路线的创建前提'}
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsExpanded }}
        testID="route-details-toggle"
        onPress={() => setDetailsExpanded((value) => !value)}
        style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
      >
        <Text style={styles.detailsButtonText}>路线说明</Text>
        <Ionicons color={appearance.blueInk} name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
      </Pressable>
      </View>
      {!routeCanStart ? <Text accessibilityLiveRegion="polite" testID="route-blocked-reason" style={styles.blockedReason}>{unavailableReason}</Text> : null}
      {detailsExpanded && selected ? (
        <View style={styles.detailsCard} testID="route-details">
          <Text accessibilityRole="header" style={styles.detailsTitle}>{selected.name}</Text>
          <Text style={styles.detailsCopy}>这是界面示例，不是设备地图或已保存路线，切换选项不会发送控制指令。</Text>
          <Text style={styles.detailsCopy}>创建真实路线前，需要先连接 {robotName}，同步设备地图及版本信息。</Text>
          <Text style={styles.detailsCopy}>地图接入后，可编辑航点并保存到“我的路线”；执行前仍需通过设备校验和控制权限检查。</Text>
          <Text style={styles.detailsNote}>设备地图与路线编辑器尚在接入中。</Text>
        </View>
      ) : null}
    </View>
  );

  const routeList = <RouteList onSelect={(id) => { setSelectedId(id); setDetailsExpanded(false); }} routes={visibleRoutes} selectedId={selectedId} styles={styles} />;
  const listHeading = <>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{filter === '全部路线' ? '示例路线' : `${filter}示例`}</Text>
    <Text style={styles.previewNotice} testID="route-preview-notice">以下是界面示例，不是设备地图或已保存路线。</Text>
  </>;

  const myRoutes = (
    <View style={styles.ownedEmpty} testID="route-owned-empty">
      <View style={styles.ownedEmptyIcon}><Ionicons color={appearance.blueInk} name="map-outline" size={26} /></View>
      <Text accessibilityRole="header" style={styles.ownedEmptyTitle}>尚无已保存路线</Text>
      <Text style={styles.ownedEmptyCopy}>连接 {robotName} 并同步设备地图后，才能创建和保存真实路线。</Text>
      <View style={styles.routeFlow}>
        {['同步设备地图', '编辑航点并保存', '设备校验后执行'].map((item, index) => (
          <View key={item} style={styles.routeFlowRow}>
            <View style={styles.routeFlowIndex}><Text style={styles.routeFlowIndexText}>{index + 1}</Text></View>
            <Text style={styles.routeFlowText}>{item}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.integrationNote}>设备地图与路线编辑器尚在接入中。</Text>
    </View>
  );

  const libraryContent = examplesSelected ? <>{filters}{listHeading}{routeList}{actions}</> : myRoutes;

  return (
    <View onLayout={measureViewport} style={styles.viewport} testID="map-viewport">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: layout.padding },
          layout.useColumns && examplesSelected && [styles.landscapeContent, { gap: layout.gap }],
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        {layout.useColumns && examplesSelected ? <>
        <View style={[styles.landscapeIntroColumn, { width: layout.primaryWidth }]}>
          {intro}
          {libraries}
          {filters}
          {actions}
        </View>
        <View style={[styles.landscapeRoutesColumn, { width: layout.secondaryWidth }]}>{listHeading}{routeList}</View>
        </> : <>
          {intro}
          {libraries}
          {libraryContent}
        </>}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean, useColumns: boolean) {
  const p = getProductAppearance(isDark);
  const cardSurface = p.surface;
  const selectedSurface = p.action;
  const filterSurface = 'transparent';

  return StyleSheet.create({
    viewport: { flex: 1, minHeight: 0, minWidth: 0 },
    scroll: { flex: 1 },
    content: { paddingBottom: 24, paddingTop: 8 },
    landscapeContent: { alignItems: 'flex-start', flexDirection: 'row' },
    landscapeIntroColumn: { minWidth: 0 },
    landscapeRoutesColumn: { minWidth: 0 },
    title: { ...typography.compactTitle, color: colors.ink },
    subtitle: { ...typography.secondary, color: colors.muted, marginTop: 4 },
    libraries: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 24, marginTop: 18 },
    libraryButton: { borderBottomColor: 'transparent', borderBottomWidth: 2, justifyContent: 'center', minHeight: 48, paddingHorizontal: 2, paddingVertical: 8 },
    libraryButtonActive: { borderBottomColor: p.blueInk },
    libraryText: { ...typography.label, color: colors.muted },
    libraryTextActive: { color: colors.ink, fontWeight: '600' },
    filters: { flexDirection: 'row', minHeight: 48, marginTop: 16, paddingHorizontal: 3 },
    filterRail: { backgroundColor: filterSurface, borderRadius: 22, bottom: 4, left: 0, position: 'absolute', right: 0, top: 4 },
    filterPressable: { alignItems: 'center', borderRadius: 18, flex: 1, justifyContent: 'center', minHeight: 48, paddingVertical: 4 },
    activeFilter: { alignItems: 'center', backgroundColor: p.action, borderRadius: 18, minHeight: 40, justifyContent: 'center', paddingVertical: 8, width: '100%' },
    activeFilterText: { ...typography.secondary, color: p.actionInk, fontWeight: '600' },
    filterText: { ...typography.secondary, color: colors.muted },
    sectionTitle: { ...typography.label, color: colors.ink, marginTop: useColumns ? 0 : 16 },
    previewNotice: { ...typography.secondary, color: colors.muted, marginBottom: 12, marginTop: 4 },
    routesCard: { backgroundColor: cardSurface, borderRadius: cardLayout.radius, padding: cardLayout.gap, width: '100%' },
    emptyRoutes: { alignItems: 'center', minHeight: 160, justifyContent: 'center' },
    emptyRoutesText: { ...typography.secondary, color: colors.muted, marginTop: 8 },
    route: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', minHeight: 104, padding: 10 },
    routeCompact: { marginTop: 4 },
    routeActive: { backgroundColor: selectedSurface },
    mapPreview: { borderRadius: 14, height: 80, overflow: 'hidden', width: 76 },
    mapImage: { height: '100%', opacity: isDark ? 0.9 : 1, width: '100%' },
    check: { alignItems: 'center', backgroundColor: p.action, borderRadius: 14, height: 28, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 28 },
    checkIcon: { color: p.actionInk },
    routeCopy: { flex: 1, justifyContent: 'center', minWidth: 0, paddingLeft: 13 },
    routeName: { ...typography.label, color: colors.ink },
    routeNameActive: { color: p.actionInk },
    radio: { borderColor: colors.line, borderRadius: 14, borderWidth: 1.5, height: 24, marginRight: 2, width: 24 },
    actionSection: { marginTop: 18 },
    actions: { flexDirection: 'row', gap: 10 },
    startPressable: { flex: 1, minWidth: 0 },
    startDisabled: { backgroundColor: filterSurface },
    startButton: { alignItems: 'center', backgroundColor: p.action, borderRadius: 24, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 52, paddingHorizontal: 12, paddingVertical: 10 },
    startText: { ...typography.label, color: p.actionInk, flexShrink: 1 },
    startTextDisabled: { color: colors.muted },
    blockedReason: { ...typography.secondary, color: colors.muted, marginTop: 10 },
    detailsButton: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: 24, flexDirection: 'row', flexShrink: 1, gap: 5, justifyContent: 'center', minHeight: 52, minWidth: 0, paddingHorizontal: 14 },
    detailsButtonText: { ...typography.label, color: p.blueInk, flexShrink: 1 },
    detailsCard: { backgroundColor: colors.surface, borderRadius: cardLayout.radius, gap: 8, marginTop: 14, padding: cardLayout.inset },
    detailsTitle: { ...typography.label, color: colors.ink },
    detailsCopy: { ...typography.secondary, color: colors.inkSoft },
    detailsNote: { ...typography.secondary, color: colors.muted },
    ownedEmpty: { alignItems: 'flex-start', backgroundColor: cardSurface, borderRadius: cardLayout.radius, marginTop: 18, padding: cardLayout.inset, width: '100%' },
    ownedEmptyIcon: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
    ownedEmptyTitle: { ...typography.label, color: colors.ink, marginTop: 16 },
    ownedEmptyCopy: { ...typography.secondary, color: colors.muted, marginTop: 6 },
    routeFlow: { gap: 12, marginTop: 20, width: '100%' },
    routeFlowRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
    routeFlowIndex: { alignItems: 'center', borderRadius: 13, height: 26, justifyContent: 'center', width: 26 },
    routeFlowIndexText: { ...typography.supporting, color: p.blueInk },
    routeFlowText: { ...typography.secondary, color: colors.ink, flex: 1 },
    integrationNote: { ...typography.supporting, color: colors.muted, marginTop: 20 },
    pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  });
}
