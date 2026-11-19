import { useTaskDraft } from '../features/tasks/useTaskDraft';
import { ControlPanelMotion } from './ControlPanelMotion';
import { productType } from '../fonts/home';
import { RoutePreviewMap } from './RoutePreviewMap';
import { ProductHeader } from './ProductHeader';
import type { PreviewRoute } from '../features/routes/routePreview';
import { Feather } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './HomeText';
import { useProductAppearance } from '../appearance';
import { makeTaskDraft, TaskEditor, type TaskDraft, type TaskRoute } from './TaskEditor';

export type AgendaItem = {
  id: string; title: string; date: string; time: string; location: string;
  status: 'running' | 'pending' | 'completed' | 'interrupted';
  progress?: { done: number; total: number }; duration?: string; result?: string;
  routePreview?: PreviewRoute;
  checkpoint?: { number: number; label: string; action?: string };
  events?: readonly { id: string; time: string; title: string }[];
};

const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const labels = { running: '进行中', pending: '待执行', completed: '已完成', interrupted: '已中断' };
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function agendaItems(items: readonly AgendaItem[], date: string, history: boolean) {
  return items.filter(item => item.date === date && (!history || item.status === 'completed' || item.status === 'interrupted'))
    .slice().sort((a, b) => a.time.localeCompare(b.time));
}

type Props = { draftScope?: string; routes?: readonly TaskRoute[]; robotName: string; items?: readonly AgendaItem[]; referenceDate?: Date; onSelectDevice?: () => void; onPublishDraft?: (draft: TaskDraft) => Promise<void> };

export function TaskAgenda({ robotName, items = [], referenceDate, onSelectDevice, onPublishDraft, routes, draftScope }: Props) {
  const { isDark } = useProductAppearance();
  const styles = makeStyles(isDark);
  const [date, setDate] = useState(() => referenceDate ?? new Date());
  const [history, setHistory] = useState(false);
  const [panel, setPanel] = useState<'create' | AgendaItem | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const { draft, save: saveDraft, loading: draftLoading, error: draftError, retry: retryDraft } = useTaskDraft(draftScope);
  const editorClose = useRef<(() => void) | null>(null);
  const selected = dayKey(date);
  const visible = agendaItems(items, selected, history);
  const week = weekdays.map((label, index) => {
    const value = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay() + index);
    return { label, value, key: dayKey(value) };
  });
  const shiftWeek = (offset: number) => setDate(current => new Date(current.getFullYear(), current.getMonth(), current.getDate() + offset * 7));
  const ink = isDark ? '#E8E8E6' : '#181B20';
  return <View style={styles.root} testID="task-agenda">
    <ProductHeader robotName={robotName} onDevicePress={onSelectDevice} />
    <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      
      <View style={styles.row}>
        <Text style={styles.title}>任务</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="选择任务设备" disabled={!onSelectDevice} onPress={onSelectDevice} style={styles.device}>
          <Feather name="cpu" size={21} color={ink} /><Text numberOfLines={1} style={[styles.deviceText, { flexShrink: 1 }]}>{robotName}</Text>
          {onSelectDevice ? <Feather name="chevron-down" size={18} color={ink} /> : null}
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="上一周" onPress={() => shiftWeek(-1)} style={styles.touch}><Feather name="chevron-left" size={21} color={ink} /></Pressable>
        <Text style={styles.month}>{date.getFullYear()} 年 {date.getMonth() + 1} 月</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="下一周" onPress={() => shiftWeek(1)} style={styles.touch}><Feather name="chevron-right" size={21} color={ink} /></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.week}>
        {week.map(day => <Pressable key={day.key} accessibilityRole="button" accessibilityLabel={`${day.key} ${day.label}`} accessibilityState={{ selected: selected === day.key }} onPress={() => setDate(day.value)} style={[styles.day, selected === day.key && styles.selectedDay]}>
          <Text style={[styles.caption, selected === day.key && styles.selectedDateText]}>{day.label}</Text><Text style={[styles.dayNumber, selected === day.key && styles.selectedDateText]}>{day.value.getDate()}</Text>
        </Pressable>)}
      </ScrollView>
      <View style={styles.tabs}>{['日程', '记录'].map((label, index) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: history === Boolean(index) }} onPress={() => setHistory(Boolean(index))} style={[styles.tab, history === Boolean(index) && styles.activeTab]}><Text style={[styles.month, history !== Boolean(index) && styles.muted]}>{label}</Text></Pressable>)}</View>
      <View style={styles.row}><Text style={styles.heading}>{history ? '任务记录' : selected === dayKey(referenceDate ?? new Date()) ? '今日安排' : `${date.getMonth() + 1} 月 ${date.getDate()} 日安排`}</Text>{visible.length ? <Text style={styles.caption}>{visible.length} 项</Text> : null}</View>
      {visible.length ? <View style={styles.timeline}>{visible.map((item, index) => <View key={item.id} style={styles.timelineRow}>
        <View style={styles.timeColumn}><Text style={styles.time}>{item.time}</Text><View style={[styles.dot, item.status === 'pending' && styles.hollow]} />{index < visible.length - 1 ? <View style={styles.line} /> : null}</View>
        <Pressable testID={`agenda-${item.id}`} accessibilityRole="button" accessibilityLabel={`查看${item.title}详情`} onPress={() => setPanel(item)} style={({ pressed }) => [styles.card, item.status === 'running' && styles.runningCard, pressed && styles.pressed]}>
          <View style={styles.row}><Text style={styles.cardTitle}>{item.title}</Text><Text style={[styles.badge, item.status === 'pending' && styles.waiting]}>{labels[item.status]}</Text></View>
          <Text style={styles.caption}>{item.location}{item.status === 'completed' ? ' · 已完成' : ''}</Text>
          {item.status === 'running' && item.progress && item.progress.total > 0 ? <View style={styles.progressRow}><View style={styles.track}><View style={[styles.progress, { width: `${Math.min(100, Math.max(0, item.progress.done / item.progress.total * 100))}%` }]} /></View><Text style={styles.caption}>{item.progress.done} / {item.progress.total} 检查点</Text></View> : null}
          {item.status === 'running' ? <View style={styles.row}><Text style={styles.caption}>{item.duration ?? item.time}</Text><Text style={styles.link}>查看进度 ›</Text></View> : null}
        </Pressable>
      </View>)}</View> : <View style={styles.empty} testID="agenda-empty">
        <View style={styles.calendarArt}><Feather name={history ? 'check-square' : 'calendar'} size={78} color="#879BAA" /><View style={styles.routeArt}><Feather name="git-commit" size={48} color="#536F82" /></View></View>
        <Text style={styles.heading}>{history ? '还没有任务记录' : '这一天还没有安排'}</Text><Text style={styles.caption}>{history ? '完成的任务将在这里展示' : '从一次巡检开始'}</Text>
      </View>}
      {draft && !history ? <ControlPanelMotion><Pressable testID="agenda-draft" accessibilityRole="button" accessibilityLabel={`编辑草稿${draft.name}`} onPress={() => setPanel('create')} style={styles.draftCard}><View style={styles.row}><Text style={styles.cardTitle}>{draft.name}</Text><Text style={styles.badge}>{draftScope ? '本机草稿' : '临时草稿'}</Text></View><Text style={styles.caption}>{draft.route} · {draft.date} {draft.time}</Text><Text style={styles.caption}>尚未下发</Text></Pressable></ControlPanelMotion> : null}
    </ScrollView>
    <View style={styles.footer}>{draftError ? <Pressable accessibilityRole="button" accessibilityLabel="重新读取草稿" onPress={retryDraft} style={styles.touch}><Text style={styles.caption}>{draftError}</Text></Pressable> : null}{!history ? <Pressable testID="agenda-create" accessibilityRole="button" disabled={draftLoading || !!draftError} onPress={() => setPanel('create')} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}><Feather name="plus" size={20} color={isDark ? '#181B20' : '#FFFFFF'} /><Text style={styles.primaryText}>{draftLoading ? '正在读取草稿…' : '新建任务'}</Text></Pressable> : null}</View>
    <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => panel === 'create' ? editorClose.current?.() : setPanel(null)}>
      <View style={styles.backdrop}><SafeAreaView style={[styles.sheet, { height: '100%', borderRadius: 0 }]} edges={['bottom']}>
        {panel !== 'create' ? <ProductHeader robotName={robotName} /> : null}
        {panel === 'create' ? <TaskEditor persistent={!!draftScope} routes={routes} initial={draft ?? makeTaskDraft(selected)} onSaveDraft={saveDraft} onPublish={onPublishDraft} onClose={() => setPanel(null)} onBackRequestChange={handler => { editorClose.current = handler; }} /> : <View style={styles.sheetHeader}><Pressable accessibilityRole="button" accessibilityLabel="关闭任务详情" onPress={() => setPanel(null)} style={styles.touch}><Feather name="arrow-left" size={22} color={ink} /></Pressable><Text style={[styles.heading, { flex: 1 }]}>{panel?.title}</Text>{panel ? <Text style={styles.badge}>{labels[panel.status]}</Text> : null}</View>}
        {panel && panel !== 'create' ? <ScrollView contentContainerStyle={styles.details}>

          {panel.progress && panel.progress.total > 0 ? <View style={styles.detailProgress}>
            <View style={styles.row}><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}><Text style={styles.progressValue}>{panel.progress.done} / {panel.progress.total}</Text><Text style={styles.caption}>检查点</Text></View><Text style={styles.cardTitle}>{Math.round(panel.progress.done / panel.progress.total * 100)}%</Text></View>
            <View style={styles.track}><View style={[styles.progress, { width: `${Math.min(100, Math.max(0, panel.progress.done / panel.progress.total * 100))}%` }]} /></View>
          </View> : null}

          <View style={{ flexDirection: 'row', gap: 24, paddingVertical: 14 }}>
          {panel.duration ? <View style={styles.detailRow}><Text style={styles.statValue}>{panel.duration}</Text><Text style={styles.caption}>已运行</Text></View> : null}
          <View style={styles.detailRow}><Text style={styles.statValue}>{panel.time}</Text><Text style={styles.caption}>开始时间</Text></View>
          </View>
          {panel.checkpoint ? <><Text style={styles.heading}>当前检查点</Text><View style={styles.checkpointCard}><Text style={styles.cardTitle}>{String(panel.checkpoint.number).padStart(2, '0')} · {panel.checkpoint.label}</Text>{panel.checkpoint.action ? <Text style={styles.caption}>{panel.checkpoint.action}</Text> : null}</View></> : null}
          {panel.routePreview ? <RoutePreviewMap route={panel.routePreview} compact /> : null}
          {panel.events?.length ? <><View style={styles.row}><Text style={styles.heading}>执行记录</Text>{panel.routePreview ? <Pressable accessibilityRole="button" accessibilityLabel="查看任务地图" onPress={() => setMapOpen(true)} style={styles.touch}><Text style={[styles.link, { fontSize: 14 }]}>查看地图 ›</Text></Pressable> : null}</View>{panel.events.map((event, index) => <View key={event.id} style={styles.eventRow}>{index < panel.events!.length - 1 ? <View style={styles.eventLine} /> : null}<View style={styles.eventDot} /><Text style={styles.time}>{event.time}</Text><Text style={[styles.caption, { flex: 1, fontSize: 14, lineHeight: 22 }]}>{event.title}</Text></View>)}</> : null}
          {panel.result ? <><Text style={styles.heading}>执行结果</Text><Text style={styles.caption}>{panel.result}</Text></> : null}
        </ScrollView> : null}
        {panel && panel !== 'create' && panel.status === 'running' ? <View style={styles.footer}>
          <Text style={styles.caption}>任务操作服务尚未连接</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {['暂停任务', '取消任务'].map(label => <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: true }} disabled style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#41413F', borderRadius: 8 }}><Text style={styles.caption}>{label}</Text></Pressable>)}
          </View>
        </View> : null}
      </SafeAreaView></View>
    </Modal>
    <Modal visible={mapOpen && panel !== null && panel !== 'create'} animationType="slide" onRequestClose={() => setMapOpen(false)}>
      <SafeAreaView style={styles.root}><View style={styles.sheetHeader}><Text style={styles.heading}>任务地图</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭任务地图" onPress={() => setMapOpen(false)} style={styles.touch}><Feather name="x" size={22} color={ink} /></Pressable></View>{panel && panel !== 'create' && panel.routePreview ? <RoutePreviewMap route={panel.routePreview} full /> : null}</SafeAreaView>
    </Modal>
  </View>;
}

function makeStyles(dark: boolean) {
  const ink = dark ? '#E8E8E6' : '#181B20', muted = dark ? '#92928F' : '#6D727B', surface = dark ? '#242423' : '#FFFFFF';
  return StyleSheet.create({
    footer: { paddingHorizontal: 18, paddingBottom: 12 },
    root: { flex: 1, backgroundColor: dark ? '#1C1C1B' : '#F5F6F9' }, page: { padding: 20, paddingBottom: 22, gap: 14 },
    brandRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 12 }, brandClip: { width: 84, height: 26, justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }, brand: { width: 162, height: 18, tintColor: ink }, divider: { width: 1, height: 18, backgroundColor: dark ? '#555B64' : '#B6BBC2' }, brandLabel: { color: ink, fontSize: 17, lineHeight: 24 }, title: { color: ink, fontSize: 24, lineHeight: 32, fontWeight: '500' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    device: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '72%', minHeight: 44, borderWidth: dark ? 0 : 1, borderColor: '#DADDE0', borderRadius: 10, paddingHorizontal: 10 }, deviceText: { color: muted, fontSize: 14 },
    touch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, month: { color: ink, fontSize: 16, fontWeight: '500' },
    week: { flexGrow: 1, justifyContent: 'space-between', gap: 2 }, day: { minWidth: 44, minHeight: 58, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10 }, selectedDay: { backgroundColor: dark ? '#30302F' : '#E5EBF2' }, dayNumber: { color: ink, fontSize: 17 }, selectedDateText: { color: ink, fontWeight: '600' },
    tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#393938' : '#DCDEE1' }, tab: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderColor: 'transparent' }, activeTab: { borderColor: '#7795AA' }, muted: { color: muted },
    heading: { ...productType.section, color: ink }, caption: { ...productType.caption, color: muted },
    draftCard: { gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: dark ? '#393938' : '#DDE1E6' }, checkpointCard: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: surface }, eventRow: { flexDirection: 'row', gap: 12, alignItems: 'center' }, eventLine: { position: 'absolute', left: 4, top: 14, bottom: -22, width: 1, backgroundColor: '#61615E' }, eventDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#8FB8CD' },
    timeline: { gap: 14 }, timelineRow: { flexDirection: 'row', gap: 10 }, timeColumn: { width: 56, paddingTop: 16 }, time: { color: muted, ...productType.caption }, dot: { position: 'absolute', right: 0, top: 20, width: 7, height: 7, borderRadius: 4, backgroundColor: '#7795AA', borderWidth: 1, borderColor: '#7795AA' }, hollow: { backgroundColor: surface }, line: { position: 'absolute', right: 3, top: 31, bottom: -28, borderLeftWidth: 1, borderColor: dark ? '#4A4A48' : '#C4CBD0' },
    card: { flex: 1, minWidth: 0, padding: 14, borderRadius: 10, gap: 9, backgroundColor: dark ? 'transparent' : surface }, runningCard: { backgroundColor: surface }, cardTitle: { flexShrink: 1, color: ink, fontSize: 16, lineHeight: 24, fontWeight: '500' }, badge: { color: dark ? '#A0B8C8' : '#738AAB', backgroundColor: 'transparent', ...productType.caption, paddingVertical: 3 }, waiting: { color: muted }, link: { color: dark ? '#A0B8C8' : ink, fontSize: 12 },
    progressRow: { flexDirection: 'row', gap: 8, alignItems: 'center' }, track: { flex: 1, minHeight: 6, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: dark ? '#41413F' : '#E3E5E7' }, progress: { height: 6, backgroundColor: '#7795AA', borderRadius: 3 },
    empty: { alignItems: 'center', paddingVertical: 30, gap: 12 }, calendarArt: { width: 170, height: 140, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#242423' : '#ECEEF0' }, routeArt: { position: 'absolute', right: 10, bottom: 0 },
    primary: { minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? '#E8E8E6' : '#101113', borderRadius: 10, marginTop: 6 }, primaryText: { fontSize: 16, fontWeight: '600', color: dark ? '#1C1C1B' : '#FFFFFF' }, pressed: { opacity: .78, transform: [{ scale: .98 }] },
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000077' }, sheet: { height: '85%', backgroundColor: dark ? '#1C1C1B' : surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#393938' : '#E1E4EB' }, details: { padding: 20, gap: 16 }, detailProgress: { gap: 10 }, progressValue: { fontSize: 32, lineHeight: 40, fontWeight: '600', color: ink }, statValue: { fontSize: 22, lineHeight: 30, color: ink }, detailRow: { flex: 1, gap: 4, paddingBottom: 8 },
  });
}
