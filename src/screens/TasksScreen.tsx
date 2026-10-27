import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';

import { cardLayout, useProductAppearance } from '../appearance';
import { typography } from '../typography';
import { getAdaptivePageLayout } from '../layout/adaptiveLayout';
import {
  createTaskStartHandler,
  deriveTaskStartReadiness,
  type TaskStartCandidate,
} from '../features/tasks/taskStartPolicy';

type Props = {
  blockedReason?: string;
  controlAvailable: boolean;
  executorAvailable: boolean;
  onStartTask: (trustedTaskId: string) => void;
  referenceDate?: Date;
  robotName: string;
};

type TaskTemplate = {
  description: string;
  icon: 'battery-charging-outline' | 'scan-outline' | 'shield-checkmark-outline';
  planValidation: TaskStartCandidate['planValidation'];
  source: TaskStartCandidate['source'];
  steps: readonly string[];
  taskId: string | null;
  title: string;
};

type Appearance = ReturnType<typeof useProductAppearance>;
type Styles = ReturnType<typeof createStyles>;

const weekLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function createWeekDates(reference: Date) {
  const weekStart = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate() - reference.getDay());
  return weekLabels.map((week, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { day: String(date.getDate()), key, week };
  });
}

// These are view-only templates, not trusted robot tasks or device telemetry.
const taskTemplates: TaskTemplate[] = [
  {
    title: '回充电座', description: '查看回充流程', icon: 'battery-charging-outline',
    planValidation: 'unknown', source: 'template', taskId: null,
    steps: ['确认充电站位置与返回路线', '检查设备连接、控制权限与任务计划', '可信任务同步后才能由设备执行'],
  },
  {
    title: '巡检', description: '查看巡检流程', icon: 'scan-outline',
    planValidation: 'unknown', source: 'template', taskId: null,
    steps: ['确认巡检路线与检查点', '检查设备连接、控制权限与任务计划', '可信任务同步后才能由设备执行'],
  },
  {
    title: '设备安全', description: '查看安全流程', icon: 'shield-checkmark-outline',
    planValidation: 'unknown', source: 'template', taskId: null,
    steps: ['确认设备状态与安全检查项', '检查设备连接、控制权限与任务计划', '可信任务同步后才能由设备执行'],
  },
];

function WeekStrip({ appearance, referenceDate, selectedDate, setSelectedDate, styles }: {
  appearance: Appearance;
  referenceDate: Date;
  selectedDate: string;
  setSelectedDate: (key: string) => void;
  styles: Styles;
}) {
  const dates = useMemo(() => createWeekDates(referenceDate), [referenceDate]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow} style={styles.calendar}>
      {dates.map((date) => {
        const selected = selectedDate === date.key;
        return (
          <Pressable
            accessibilityLabel={`${date.week}${date.day}日`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={date.key}
            onPress={() => setSelectedDate(date.key)}
            style={({ pressed }) => [styles.dateItem, selected && styles.dateItemSelected, pressed && styles.pressed]}
          >
            <Text style={[styles.weekText, selected && { color: appearance.actionInk }]}>{date.week}</Text>
            <View style={styles.dayCircle}>
              <Text style={[styles.dayText, selected && { color: appearance.actionInk }]}>{date.day}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function TemplateSummary({ appearance, styles }: { appearance: Appearance; styles: Styles }) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons accessible={false} color={appearance.secondary} name="reader-outline" size={24} />
      <View style={styles.summaryCopy}>
        <Text style={styles.summaryTitle}>尚未同步可信任务</Text>
        <Text style={styles.summarySubtitle}>当前可查看通用模板</Text>
      </View>
      <Text style={styles.summarySubtitle}>只读</Text>
    </View>
  );
}

function TaskCard({ active, appearance, index, onSelect, styles, task }: {
  active: boolean;
  appearance: Appearance;
  index: number;
  onSelect: () => void;
  styles: Styles;
  task: TaskTemplate;
}) {
  return (
    <Pressable
      accessibilityHint="仅查看模板说明，不会发送机器人指令"
      accessibilityLabel={`查看${task.title}任务模板`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onSelect}
      style={({ pressed }) => [styles.taskCard, active && styles.taskCardActive, pressed && styles.pressed]}
      testID={`task-template-${index}`}
    >
      <View style={styles.taskIcon}>
        <Ionicons color={active ? appearance.selectionInk : appearance.secondary} name={task.icon} size={24} />
      </View>
      <View style={styles.taskCopy}>
        <Text style={[styles.taskTitle, active && styles.taskTitleActive]}>{task.title}</Text>
        <Text style={[styles.taskDescription, active && styles.taskDescriptionActive]}>{task.description}</Text>
      </View>
      <View style={styles.selectionMark}>
        <Ionicons color={active ? appearance.selectionInk : appearance.secondary} name={active ? 'radio-button-on' : 'radio-button-off'} size={20} />
      </View>
    </Pressable>
  );
}

export function TasksScreen({ blockedReason, controlAvailable, executorAvailable, onStartTask, referenceDate: referenceDateProp, robotName }: Props) {
  const appearance = useProductAppearance();
  const { fontScale, height, width } = useWindowDimensions();
  const isLandscape = width > height;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const layout = getAdaptivePageLayout({
    containerWidth: viewport.width,
    windowHeight: viewport.height,
    isLandscape,
    fontScale,
    variant: 'tasks',
  });
  const compactLandscape = isLandscape && viewport.width > 0 && viewport.height > 0 && layout.isCompactHeight;
  const actionWidth = layout.isCompactColumns ? layout.secondaryWidth : layout.contentWidth;
  const stackActions = fontScale > 1.3 || (actionWidth > 0 && actionWidth < (layout.isCompactColumns ? 280 : 350));
  const styles = useMemo(() => createStyles(appearance, layout.padding, layout.gap, stackActions, layout.isCompactColumns), [appearance, layout.padding, layout.gap, stackActions, layout.isCompactColumns]);
  const referenceDate = useMemo(() => referenceDateProp ?? new Date(), [referenceDateProp]);
  const dates = useMemo(() => createWeekDates(referenceDate), [referenceDate]);
  const referenceDateKey = dates[referenceDate.getDay()]?.key ?? dates[0].key;
  const [selectedDate, setSelectedDate] = useState(referenceDateKey);
  const [selectedTask, setSelectedTask] = useState(1);
  const [previewExpanded, setPreviewExpanded] = useState<boolean | null>(null);
  const previewVisible = previewExpanded ?? layout.useColumns;
  const [taskFeedback, setTaskFeedback] = useState<string | null>(null);
  const task = taskTemplates[selectedTask];
  const taskStartInput = useMemo(() => ({
    candidate: {
      displayName: task.title,
      planValidation: task.planValidation,
      source: task.source,
      taskId: task.taskId,
    } satisfies TaskStartCandidate,
    control: { available: controlAvailable },
    executor: { available: executorAvailable },
  }), [controlAvailable, executorAvailable, task]);
  const taskStartReadiness = useMemo(() => deriveTaskStartReadiness(taskStartInput), [taskStartInput]);
  const taskStartHandler = useMemo(() => createTaskStartHandler(taskStartInput, onStartTask), [onStartTask, taskStartInput]);
  const taskCanStart = taskStartReadiness.enabled;
  const unavailableReason = taskStartReadiness.enabled
    ? undefined
    : ((taskStartReadiness.code === 'control-unavailable' || taskStartReadiness.code === 'executor-unavailable') && blockedReason)
      ? blockedReason
      : taskStartReadiness.reason;

  const openTaskTemplate = (index: number) => {
    const nextTask = taskTemplates[index];
    if (!nextTask) return;
    setSelectedTask(index);
    setPreviewExpanded(null);
    setTaskFeedback(`已选择${nextTask.title}模板。仅供查看，不会发送控制指令。`);
  };

  const selectDate = (key: string) => {
    setSelectedDate(key);
    const day = dates.find((date) => date.key === key);
    if (day) setTaskFeedback(`${day.week}${day.day}日尚未同步可信任务。当前展示通用模板，不会发送控制指令。`);
  };

  const calendar = <WeekStrip appearance={appearance} referenceDate={referenceDate} selectedDate={selectedDate} setSelectedDate={selectDate} styles={styles} />;
  const summary = <TemplateSummary appearance={appearance} styles={styles} />;
  const heading = (
    <View style={styles.headingBlock}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>任务模板</Text>
        <Text style={styles.subheading}>{compactLandscape ? '只读，' : ''}{taskTemplates.length} 个模板</Text>
      </View>
      {taskFeedback ? (
        <View style={styles.taskFeedback} testID="task-feedback">
          <Ionicons color={appearance.secondary} name="information-circle-outline" size={17} />
          <Text accessibilityLiveRegion="polite" style={styles.taskFeedbackText}>{taskFeedback}</Text>
        </View>
      ) : null}
      {!taskFeedback || compactLandscape ? <Text style={styles.subheading}>{robotName} 尚未同步可信任务</Text> : null}
    </View>
  );
  const templateList = (
    <View style={styles.taskRow} testID="task-template-list">
        {taskTemplates.map((template, index) => (
          <TaskCard
            active={selectedTask === index}
            appearance={appearance}
            index={index}
            key={template.title}
            onSelect={() => openTaskTemplate(index)}
            styles={styles}
            task={template}
          />
        ))}
    </View>
  );
  const taskDetail = (
      <View style={styles.detailCard} testID="task-detail-card">
        <View style={styles.detailHeader}>
          <View style={styles.detailCopy}>
            <Text style={styles.detailTitle}>{task.title}，流程说明</Text>
            <Text style={styles.detailDescription}>通用模板，不是已同步的任务计划</Text>
          </View>
          <Text style={styles.detailDescription}>只读</Text>
        </View>
        {previewVisible ? (
          <View style={styles.steps} testID="task-preview-steps">
            {task.steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={styles.detailSummary}>可查看流程，不会发送指令</Text>}
        <View style={styles.executionRow}>
          <Ionicons color={appearance.secondary} name="information-circle-outline" size={17} />
          <Text accessibilityLiveRegion="polite" style={styles.blockedReason}>
            {unavailableReason ?? '可信任务已就绪。'}
          </Text>
        </View>
        {!taskCanStart ? <Text style={styles.detailDescription}>仅可查看流程，开始保持锁定</Text> : null}
        <View style={styles.detailSection}>
          <View style={styles.actionRow}>
            <Pressable
              accessibilityLabel={previewVisible ? '收起模板说明' : '查看模板说明'}
              accessibilityRole="button"
              accessibilityState={{ expanded: previewVisible }}
              onPress={() => setPreviewExpanded(!previewVisible)}
              style={({ pressed }) => [styles.previewButton, pressed && styles.pressed]}
              testID="task-preview-toggle"
            >
              <Text style={styles.previewButtonText}>{previewVisible ? '收起流程' : '查看流程'}</Text>
              <Ionicons color={appearance.actionInk} name={previewVisible ? 'chevron-up' : 'chevron-down'} size={18} />
            </Pressable>
            <Pressable
              accessibilityHint={unavailableReason}
              accessibilityLabel={`开始${task.title}任务`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !taskCanStart }}
              disabled={!taskCanStart}
              onPress={taskStartHandler}
              style={({ pressed }) => [styles.startButton, !taskCanStart && styles.commandDisabled, pressed && taskCanStart && styles.pressed]}
              testID="task-start"
            >
              <Ionicons color={taskCanStart ? appearance.actionInk : appearance.secondary} name={taskCanStart ? 'play' : 'lock-closed-outline'} size={17} />
              <Text style={[styles.startButtonText, !taskCanStart && styles.startButtonTextDisabled]}>开始</Text>
            </Pressable>
          </View>
        </View>
      </View>
  );
  const primaryColumn = <View style={[styles.primaryColumn, layout.useColumns && { width: layout.primaryWidth }]} testID="tasks-primary-column">
    {calendar}{!layout.useColumns && !compactLandscape ? summary : null}{heading}{templateList}
  </View>;
  const secondaryColumn = <View style={[styles.secondaryColumn, layout.useColumns && { width: layout.secondaryWidth }]} testID="tasks-detail-column">
    {taskDetail}
  </View>;
  return (
    <View onLayout={({ nativeEvent: { layout: measured } }) => {
      if (!Number.isFinite(measured.width) || measured.width <= 0 || !Number.isFinite(measured.height) || measured.height <= 0) return;
      const next = { width: Math.floor(measured.width), height: Math.floor(measured.height) };
      setViewport(current => current.width === next.width && current.height === next.height ? current : next);
    }} style={styles.root} testID="tasks-screen">
      {layout.isCompactColumns ? <View style={[styles.controllerColumns, { paddingHorizontal: layout.padding, gap: layout.gap }]} testID="tasks-controller-layout">
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.controllerContent} showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layout.primaryWidth }]} testID="tasks-controller-primary">{primaryColumn}</ScrollView>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.controllerContent} showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layout.secondaryWidth }]} testID="tasks-controller-secondary">{secondaryColumn}</ScrollView>
      </View> : <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.pageContent, layout.useColumns && styles.pageColumns]} showsVerticalScrollIndicator={false} testID="tasks-page-content">
        {primaryColumn}{secondaryColumn}
      </ScrollView>}
    </View>
  );
}

function createStyles(appearance: Appearance, padding: number, gap: number, stackActions: boolean, compact: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: appearance.canvas },
    pageContent: { flexDirection: 'column', paddingHorizontal: padding, paddingTop: 4, paddingBottom: 24, gap },
    pageColumns: { flexDirection: 'row', alignItems: 'flex-start' },
    controllerColumns: { flex: 1, minHeight: 0, flexDirection: 'row', paddingTop: 4 },
    controllerPane: { flexGrow: 0, flexShrink: 1, minHeight: 0, minWidth: 0 },
    controllerContent: { paddingBottom: 24 },
    primaryColumn: { minWidth: 0, gap: compact ? 10 : 16 },
    secondaryColumn: { minWidth: 0 },
    calendar: { flexGrow: 0 },
    dateRow: { flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 2 },
    dateItem: { alignItems: 'center', flex: 1, borderRadius: 24, minHeight: compact ? 52 : 68, minWidth: 48, paddingHorizontal: 2, paddingVertical: compact ? 4 : 6 },
    dateItemSelected: { backgroundColor: appearance.action },
    weekText: { ...typography.supporting, color: appearance.secondary },
    dayCircle: { alignItems: 'center', justifyContent: 'center', minHeight: compact ? 24 : 36, minWidth: 36, borderRadius: 18, marginTop: compact ? 0 : 3 },
    dayText: { ...typography.label, color: appearance.ink },
    summaryCard: { alignItems: 'center', backgroundColor: appearance.surface, borderRadius: 16, flexDirection: 'row', minHeight: 76, padding: cardLayout.inset, gap: cardLayout.gap },
    summaryCopy: { flex: 1, justifyContent: 'center', minWidth: 0, gap: 2 },
    summaryTitle: { ...typography.label, fontSize: 16, lineHeight: 24, color: appearance.ink },
    summarySubtitle: { ...typography.secondary, color: appearance.secondary },
    headingBlock: { paddingTop: compact ? 0 : 4, gap: compact ? 2 : 6 },
    headingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
    heading: { ...typography.compactTitle, fontWeight: '500', color: appearance.ink },
    subheading: { ...typography.secondary, color: appearance.secondary },
    taskRow: { flexDirection: 'column', alignItems: 'stretch', gap: compact ? 8 : 12 },
    taskCard: { flexDirection: 'row', alignItems: 'center', minWidth: 0, minHeight: compact ? 64 : 78, borderRadius: 16, backgroundColor: appearance.surface, paddingHorizontal: compact ? 12 : 16, paddingVertical: compact ? 6 : 12, gap: compact ? 8 : 12 },
    taskCardActive: { backgroundColor: appearance.selectionSurface },
    taskIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    taskCopy: { flex: 1, minWidth: 0, gap: compact ? 2 : 4 },
    taskTitle: { ...typography.label, fontSize: 18, lineHeight: 26, color: appearance.ink },
    taskTitleActive: { color: appearance.selectionInk },
    taskDescription: { ...typography.secondary, color: appearance.secondary },
    taskDescriptionActive: { color: appearance.selectionInk },
    selectionMark: { alignItems: 'center', justifyContent: 'center', minHeight: 28, minWidth: 28, borderRadius: 14 },
    detailCard: { backgroundColor: appearance.surface, borderRadius: 20, padding: 20, gap: 12 },
    detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    detailCopy: { flex: 1, minWidth: 0, gap: 4 },
    detailTitle: { ...typography.compactTitle, fontWeight: '500', color: appearance.ink },
    detailDescription: { ...typography.secondary, color: appearance.secondary },
    detailSummary: { ...typography.body, color: appearance.ink },
    detailSection: { gap: 10 },
    actionRow: { flexDirection: stackActions ? 'column' : 'row', gap: 12 },
    previewButton: { flex: stackActions ? undefined : 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: appearance.action, gap: 12 },
    previewButtonText: { ...typography.label, fontSize: 16, lineHeight: 24, flexShrink: 1, color: appearance.actionInk },
    steps: { backgroundColor: 'transparent', gap: 12, paddingVertical: 4 },
    stepRow: { flexDirection: 'row', gap: 12, minHeight: 32 },
    stepNumber: { ...typography.body, color: appearance.secondary, fontVariant: ['tabular-nums'], textAlign: 'center', width: 28 },
    stepText: { ...typography.body, flex: 1, color: appearance.ink },
    executionRow: { alignItems: 'flex-start', backgroundColor: 'transparent', flexDirection: 'row', gap: 8, paddingVertical: 4 },
    blockedReason: { ...typography.secondary, flex: 1, color: appearance.secondary },
    startButton: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, minWidth: 88, minHeight: 48, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: appearance.action },
    startButtonText: { ...typography.label, fontSize: 16, lineHeight: 24, color: appearance.actionInk },
    commandDisabled: { backgroundColor: 'transparent' },
    startButtonTextDisabled: { color: appearance.secondary },
    taskFeedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, paddingHorizontal: 2, paddingBottom: 2 },
    taskFeedbackText: { ...typography.secondary, flex: 1, color: appearance.secondary },
    pressed: { opacity: 0.7 },
  });
}
