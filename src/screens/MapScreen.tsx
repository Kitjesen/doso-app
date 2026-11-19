import { Feather } from '@expo/vector-icons';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, TextInput } from '../components/HomeText';
import { TrackSheet } from '../components/TrackSheet';
import { RoutePreviewMap } from '../components/RoutePreviewMap';
import { useTaskDraft } from '../features/tasks/useTaskDraft';
import { TaskEditor, makeTaskDraft, type TaskDraft } from '../components/TaskEditor';
import { ProductHeader } from '../components/ProductHeader';
import { ControlPanelMotion } from '../components/ControlPanelMotion';
import { filterRoutes, previewRoutes, selectedRoute, type RouteFilter } from '../features/routes/routePreview';
import { getAdaptivePageLayout } from '../layout/adaptiveLayout';
import { homeFont, productType } from '../fonts/home';
import { useAppTheme } from '../theme';

type Props = {
  blockedReason?: string; controlAvailable: boolean; executorAvailable: boolean;
  onOpenNavigation?: () => void; onStartRoute: (trustedRouteId: string) => void;
  robotName: string; draftScope?: string; showExamples?: boolean; gpsContent?: ReactNode;
};

export function MapScreen({ onOpenNavigation, robotName, showExamples = false, gpsContent, draftScope }: Props) {
  const { isDark } = useAppTheme();
  const { width, height, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const layout = getAdaptivePageLayout({ containerWidth: viewport.width, windowHeight: viewport.height, isLandscape: width > height, fontScale, variant: 'map' });
  const styles = useMemo(() => createStyles(isDark), [isDark]);
  const [draftRoutes, setDraftRoutes] = useState(previewRoutes);
  const [filter, setFilter] = useState<RouteFilter>('全部');
  const [selectedId, setSelectedId] = useState('a');
  const [panel, setPanel] = useState<'map' | 'view' | 'edit' | 'new' | 'library' | 'task' | null>(null);
  const [name, setName] = useState('');
  const [tab, setTab] = useState<'map' | 'gps'>('map');
  const { draft: taskDraft, save: saveDraft, loading: draftLoading, error: draftError, retry: retryDraft } = useTaskDraft(draftScope);
  const taskClose = useRef<(() => void) | null>(null);
  const [error, setError] = useState('');
  const nextId = useRef(1);
  const routes = showExamples ? draftRoutes : [];
  const visible = filterRoutes(routes, filter);
  const selected = selectedRoute(routes, filter, selectedId);
  const choose = (id: string) => {
    setSelectedId(id);
    setDraftRoutes(current => current.map(route => route.id === id ? { ...route, recent: true } : route));
  };
  const edit = (create = false) => {
    if (!showExamples) { onOpenNavigation?.(); return; }
    setName(create ? '' : selected?.name ?? ''); setError(''); setPanel(create ? 'new' : 'edit');
  };
  const applyDraft = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 24) { setError('请输入 1–24 个字符的路线名称'); return; }
    if (!showExamples) return;
    // This preview editor only changes session-local template names; it never persists or executes a route.
    if (panel === 'new') {
      const id = 'draft-' + nextId.current++;
      setDraftRoutes(current => [...current, { ...previewRoutes[0], id, name: trimmed, favorite: false, recent: true }]);
      setFilter('全部'); setSelectedId(id);
    } else if (panel === 'edit' && selected) {
      setDraftRoutes(current => current.map(route => route.id === selected.id ? { ...route, name: trimmed } : route));
    }
    setPanel(null);
  };
  const toggleFavorite = () => {
    if (selected) setDraftRoutes(current => current.map(route => route.id === selected.id ? { ...route, favorite: !route.favorite } : route));
  };
  const activeMap = selected ? <ControlPanelMotion key={selected.id} style={{ flex: 1 }}>
    <RoutePreviewMap route={selected} full onExpand={() => setPanel('map')} />
  </ControlPanelMotion> : <View style={styles.emptyMap}><Feather name="map" size={30} color="#6D87A1" /><Text style={styles.secondary}>暂无地图</Text></View>;
  const routeSummary = <View>
    <View style={styles.mapFooter}>
      <Pressable testID="route-library" accessibilityRole="button" accessibilityLabel="展开我的路线" onPress={() => setPanel('library')} style={styles.grow}><Text style={styles.routeHeading}>{selected?.name ?? '我的地图'}</Text><Text style={styles.secondary}>{selected ? selected.points.length + ' 个检查点 · ' + (selected.estimatedMinutes ? '预计 ' + selected.estimatedMinutes + ' 分钟' : '约 ' + selected.distanceM + ' m') : robotName}</Text>{selected?.updatedLabel ? <Text style={styles.mapUpdated}>地图更新 {selected.updatedLabel}</Text> : null}</Pressable>

    </View>
    {draftError ? <Pressable accessibilityRole="button" accessibilityLabel="重新读取草稿" onPress={retryDraft} style={styles.iconButton}><Text style={styles.error}>{draftError}</Text></Pressable> : null}
    <View style={styles.mapActions}>
      <Pressable testID="route-sheet-edit" hitSlop={{ top: 2, bottom: 2 }} accessibilityRole="button" onPress={() => edit()} style={styles.sheetAction}><Text style={styles.link}>编辑路线</Text></Pressable>
      <Pressable testID="route-sheet-view" hitSlop={{ top: 2, bottom: 2 }} accessibilityRole="button" disabled={draftLoading || !!draftError} onPress={() => setPanel('task')} style={[styles.sheetAction, styles.sheetActionPrimary]}><Text style={styles.sheetActionPrimaryText}>用于任务</Text></Pressable>
    </View>

</View>;
  const library = !routes.length ? <View style={styles.emptyLibrary} testID="route-owned-empty"><View style={styles.sectionHeading}><Text style={styles.sectionTitle}>我的路线</Text><Text style={styles.secondary}>0 条</Text></View><Text style={styles.emptyDescription}>地图准备好后，在这里添加路线</Text></View> : <View style={styles.library}>
    <View style={styles.sectionHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>我的路线</Text>
      {selected ? <Pressable testID="route-favorite" accessibilityRole="button" accessibilityLabel={selected.favorite ? '取消收藏' : '收藏路线'} accessibilityState={{ selected: selected.favorite }} onPress={toggleFavorite} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><Feather name="star" size={20} color={selected.favorite ? '#586F92' : '#7B8A9E'} /></Pressable> : null}<Pressable testID="route-new" accessibilityRole="button" accessibilityLabel="新建路线" disabled={!showExamples && !onOpenNavigation} onPress={() => edit(true)} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}><Feather name="plus" size={18} color="#465366" /><Text style={styles.link}>新建</Text></Pressable></View>
    <View style={styles.filters} accessibilityRole="tablist" accessibilityLabel="路线筛选">
      {(['全部', '最近', '收藏'] as RouteFilter[]).map(item => <Pressable key={item} testID={'route-filter-' + item} accessibilityRole="tab" accessibilityState={{ selected: filter === item }} onPress={() => setFilter(item)} style={({ pressed }) => [styles.filter, filter === item && styles.filterActive, pressed && styles.pressed]}><Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item}</Text></Pressable>)}
    </View>
    <ControlPanelMotion key={filter} style={styles.routeList}>
      {visible.map(route => <Pressable key={route.id} testID={'route-template-' + route.id} accessibilityLabel={route.name} accessibilityRole="button" accessibilityState={{ selected: selected?.id === route.id }} onPress={() => choose(route.id)} style={({ pressed }) => [styles.routeCard, selected?.id === route.id && styles.routeActive, pressed && styles.pressed]}>
        <Image accessible={false} resizeMode="cover" source={require('../../assets/scene/route-campus.png')} style={styles.thumbnail} />
        <View style={styles.grow}><Text testID={'route-title-' + route.id} style={styles.routeName}>{route.name}</Text><Text style={styles.secondary}>{route.mapName} · {route.points.length} 个途经点</Text></View>
        <View style={styles.routeEnd}><Text style={styles.distance}>{route.distanceM} m</Text>{selected?.id === route.id ? <View style={styles.check}><Feather name="check" size={13} color="#FFFFFF" /></View> : null}</View>
      </Pressable>)}
      {!visible.length ? <View style={styles.empty} testID="route-owned-empty"><Text style={styles.secondary}>{filter === '收藏' ? '暂无收藏路线' : filter === '最近' ? '暂无最近路线' : '暂无路线'}</Text>{!showExamples && onOpenNavigation ? <Pressable accessibilityRole="button" testID="map-open-navigation" onPress={onOpenNavigation} style={styles.textButton}><Text style={styles.link}>连接设备</Text><Feather name="chevron-right" size={16} color="#465366" /></Pressable> : null}</View> : null}
    </ControlPanelMotion>
    {selected ? <View style={styles.actions}><Pressable accessibilityRole="button" testID="route-view" onPress={() => setPanel('view')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Text style={styles.primaryText}>查看路线</Text></Pressable><Pressable accessibilityRole="button" testID="route-edit" onPress={() => edit()} style={({ pressed }) => [styles.edit, pressed && styles.pressed]}><Text style={styles.link}>编辑</Text></Pressable></View> : null}
  </View>;
  const mapCard = !routes.length ? <ControlPanelMotion style={styles.onboarding} testID="map-first-use">
    <View style={styles.emptyDrawing} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><View style={styles.paperBack} /><View style={styles.paperFront}><Feather name="map" size={50} color="#8D9BAF" /><View style={styles.addBadge}><Feather name="plus" size={17} color="#44556E" /></View></View></View>
    <Text accessibilityRole="header" style={styles.emptyTitle}>添加第一张点云地图</Text>
    <Text style={styles.emptyDescription}>连接机器狗，创建或导入地图</Text>
    {onOpenNavigation ? <Pressable testID="map-open-navigation" accessibilityRole="button" onPress={onOpenNavigation} style={({ pressed }) => [styles.connectButton, pressed && styles.pressed]}><Text style={styles.primaryText}>连接设备</Text><Feather name="arrow-right" size={18} color="#FFFFFF" /></Pressable> : <Text style={styles.secondary}>等待设备连接</Text>}
  </ControlPanelMotion> : <TrackSheet label="路线详情" map={activeMap} summary={routeSummary}>{library}</TrackSheet>;
  return <View style={styles.root} testID="map-viewport" onLayout={({ nativeEvent: { layout: next } }) => {
    if (!Number.isFinite(next.width) || !Number.isFinite(next.height) || next.width <= 0 || next.height <= 0) return;
    setViewport(current => current.width === next.width && current.height === next.height ? current : { width: next.width, height: next.height });
  }}>
    <ProductHeader robotName={robotName} />
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>地图与路线</Text></View><View style={styles.sourceTabs} accessibilityRole="tablist">{(['map', 'gps'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={value === 'map' ? '设备地图' : 'GPS 轨迹'} accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.sourceTab, tab === value && styles.mapTab]}><Text style={styles.deviceText}>{value === 'map' ? '设备地图' : 'GPS 轨迹'}</Text></Pressable>)}</View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingHorizontal: layout.useColumns ? layout.padding : 12 }, layout.useColumns && { flexDirection: 'row', gap: layout.gap }]}>
      {tab === 'gps' ? <View style={{ flex: 1 }}>{gpsContent ?? <View style={styles.emptyMap}><Feather name="map-pin" size={28} color="#7795AA" /><Text style={styles.secondary}>暂无定位记录</Text></View>}</View> : <View style={layout.useColumns ? { width: routes.length ? layout.contentWidth : layout.primaryWidth } : undefined}>{mapCard}</View>}
      {tab === 'map' && !routes.length ? <View style={layout.useColumns ? { width: layout.secondaryWidth } : undefined}>{library}</View> : null}
    </ScrollView>
    <Modal visible={showExamples && panel !== null} transparent animationType="slide" onRequestClose={() => panel === 'task' ? taskClose.current?.() : setPanel(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.overlay, panel === 'task' && { padding: 0 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭路线面板" style={StyleSheet.absoluteFill} onPress={() => panel === 'task' ? taskClose.current?.() : setPanel(null)} />
        <ControlPanelMotion style={[styles.sheet, (panel === 'map' || panel === 'task') && styles.fullSheet, panel === 'task' && { height: '100%', maxHeight: '100%', padding: 0, borderRadius: 0 }]}>
          <SafeAreaView style={panel === 'map' || panel === 'task' ? styles.fullContent : undefined} edges={['bottom', 'left', 'right']}>
            {panel === 'task' && selected ? <TaskEditor persistent={!!draftScope} routes={routes.map(route => ({ name: route.name, checkpointCount: route.points.length }))} initial={taskDraft?.route === selected.name ? taskDraft : { ...makeTaskDraft(new Date().toLocaleDateString('en-CA')), name: selected.name, route: selected.name, checkpointCount: selected.points.length }} onSaveDraft={saveDraft} onClose={() => setPanel(null)} onBackRequestChange={handler => { taskClose.current = handler; }} /> : <><View style={styles.sheetHeader}><Text style={styles.sectionTitle}>{panel === 'library' ? '我的路线' : panel === 'new' ? '新建路线' : panel === 'edit' ? '编辑路线' : selected?.name ?? '路线'}</Text><Pressable testID="route-close" accessibilityRole="button" accessibilityLabel="关闭" onPress={() => setPanel(null)} style={styles.iconButton}><Feather name="x" size={22} color={isDark ? '#FFFFFF' : '#303D50'} /></Pressable></View>
            {panel === 'library' ? <ScrollView showsVerticalScrollIndicator={false}>{library}</ScrollView> : panel === 'edit' || panel === 'new' ? <View style={styles.editor}><Text style={styles.secondary}>路线名称</Text><TextInput testID="route-name-input" accessibilityLabel="路线名称" value={name} onChangeText={setName} maxLength={24} autoFocus returnKeyType="done" onSubmitEditing={applyDraft} style={styles.input} />{error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}<Pressable testID="route-save" accessibilityRole="button" onPress={applyDraft} style={styles.primary}><Text style={styles.primaryText}>完成</Text></Pressable></View> : selected ? <View style={panel === 'map' ? styles.fullContent : styles.detail}><RoutePreviewMap key={selected.id} route={selected} full={panel === 'map'} /><Text style={styles.detailCopy}>{selected.mapName} · {selected.points.length} 个途经点 · {selected.distanceM} m</Text></View> : null}
          </>}
          </SafeAreaView>
        </ControlPanelMotion>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

function createStyles(dark: boolean) {
  const ink = dark ? '#E8E8E6' : '#202A39', secondary = dark ? '#A0A09B' : '#657187', surface = dark ? '#242423' : '#FFFFFF';
  return StyleSheet.create({
    root: { flex: 1, minHeight: 0, backgroundColor: dark ? '#1C1C1B' : '#F5F6F8' },
    sourceTabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 11, padding: 3, borderRadius: 7, backgroundColor: surface }, sourceTab: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center' }, sheetHandle: { height: 22, backgroundColor: surface, marginTop: 12, borderTopLeftRadius: 12, borderTopRightRadius: 12, justifyContent: 'center', alignItems: 'center' }, mapTab: { backgroundColor: dark ? '#343634' : '#E6EAED', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 7 },
    header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
    title: { ...homeFont, ...productType.title, color: ink },
    device: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    deviceText: { ...homeFont, ...productType.button, color: ink },
    content: { paddingTop: 4, paddingBottom: 20, gap: 14, flexDirection: 'column' },
    mapCard: { backgroundColor: 'transparent' },
    mapFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 0, paddingHorizontal: 16, backgroundColor: 'transparent' },
    mapActions: { flexDirection: 'row', gap: 12, padding: 16, paddingTop: 20, paddingBottom: 16, backgroundColor: 'transparent' }, sheetAction: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', minHeight: 40, borderRadius: 6, borderWidth: 1, borderColor: dark ? '#626662' : '#B7C1C8' }, sheetActionPrimary: { backgroundColor: '#E8E8E6', borderColor: '#E8E8E6' }, sheetActionPrimaryText: { ...homeFont, color: '#202322', ...productType.button },
    libraryToggle: { minHeight: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: 'transparent', paddingTop: 6 }, handle: { position: 'absolute', top: 2, alignSelf: 'center', width: 30, height: 3, borderRadius: 2, backgroundColor: dark ? '#646A65' : '#A5AFB6' },
    grow: { flex: 1, minWidth: 0 }, routeHeading: { ...homeFont, ...productType.section, fontWeight: '600', color: ink }, mapUpdated: { ...homeFont, ...productType.caption, color: secondary },
    secondary: { ...homeFont, ...productType.caption, color: secondary },
    library: { gap: 10 }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { ...homeFont, fontSize: 19, lineHeight: 28, fontWeight: '600', color: ink },
    textButton: { minHeight: 44, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', gap: 5 },
    link: { ...homeFont, ...productType.button, color: ink },
    filters: { flexDirection: 'row', gap: 12 }, filter: { minHeight: 40, flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 20 },
    filterActive: { backgroundColor: dark ? '#30302E' : '#E7EBF1' }, filterText: { ...homeFont, fontSize: 14, lineHeight: 22, color: secondary }, filterTextActive: { color: dark ? '#E8E8E6' : '#344256', fontWeight: '600' },
    routeList: { gap: 9 }, routeCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 15, borderWidth: 1, borderColor: 'transparent', padding: 10, backgroundColor: surface }, routeActive: { borderColor: dark ? '#555754' : '#A4B1C7', backgroundColor: dark ? '#2B2B29' : '#FEFEFF' },
    thumbnail: { width: 48, height: 48, borderRadius: 10 }, routeName: { ...homeFont, fontSize: 16, lineHeight: 23, fontWeight: '600', color: ink },
    routeEnd: { flexDirection: 'row', alignItems: 'center', gap: 7 }, distance: { ...homeFont, fontSize: 12, lineHeight: 19, fontWeight: '500', color: secondary },
    check: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#7488A8', alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', gap: 12, marginTop: 4 }, primary: { flex: 1, minHeight: 46, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#303C4D' }, primaryText: { ...homeFont, color: '#FFFFFF', fontSize: 16, lineHeight: 24, fontWeight: '600' }, edit: { minWidth: 80, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
    onboarding: { backgroundColor: surface, borderRadius: 24, minHeight: 360, paddingHorizontal: 24, paddingVertical: 32, alignItems: 'center', justifyContent: 'center', gap: 12 },
    emptyDrawing: { width: 150, height: 132, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    paperBack: { position: 'absolute', width: 100, height: 100, borderRadius: 22, backgroundColor: dark ? '#2B3748' : '#EDF0F5', transform: [{ rotate: '-12deg' }, { translateX: -12 }] },
    paperFront: { width: 100, height: 100, borderRadius: 22, backgroundColor: dark ? '#354257' : '#FAFBFD', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: dark ? '#4A586D' : '#E0E6EE', transform: [{ rotate: '7deg' }] },
    addBadge: { position: 'absolute', bottom: -6, right: -6, width: 30, height: 30, borderRadius: 15, backgroundColor: '#E7EDF5', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: surface },
    emptyTitle: { ...homeFont, color: ink, fontSize: 21, lineHeight: 30, fontWeight: '600', textAlign: 'center' },
    emptyDescription: { ...homeFont, color: secondary, fontSize: 14, lineHeight: 22 },
    connectButton: { minHeight: 48, width: '100%', marginTop: 12, borderRadius: 16, backgroundColor: '#303C4D', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
    emptyLibrary: { backgroundColor: surface, borderRadius: 20, padding: 20, gap: 12 },
    emptyMap: { height: 220, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: dark ? '#222221' : '#E8F1FB' }, empty: { minHeight: 130, justifyContent: 'center', alignItems: 'center', borderRadius: 18, backgroundColor: surface },
    iconButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }, pressed: { opacity: .75, transform: [{ scale: .98 }] },
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#14243A55' }, sheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, backgroundColor: surface }, fullSheet: { height: '90%' }, fullContent: { flex: 1, minHeight: 0 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }, editor: { gap: 12, paddingBottom: 20 },
    input: { ...homeFont, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: ink, backgroundColor: dark ? '#181817' : '#EFF5FC', borderWidth: 1, borderColor: dark ? '#3A3A37' : '#D7E4F4' }, error: { fontSize: 13, lineHeight: 20, color: dark ? '#FFB2B2' : '#AC3434' },
    detail: { gap: 10 }, detailCopy: { ...homeFont, color: secondary, fontSize: 14, lineHeight: 22, paddingVertical: 12 },
  });
}
