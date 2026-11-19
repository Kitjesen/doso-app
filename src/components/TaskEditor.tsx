import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { productType } from '../fonts/home';
import { Text, TextInput } from './HomeText';
import { ControlPanelMotion } from './ControlPanelMotion';
import { useProductAppearance } from '../appearance';

import { draftError, type TaskDraft } from '../features/tasks/draft';
export { makeTaskDraft, draftError, type TaskDraft } from '../features/tasks/draft';

export type TaskRoute = { name: string; checkpointCount: number };

type Props = {
  routes?: readonly TaskRoute[];
  initial: TaskDraft; onClose: () => void; onSaveDraft: (draft: TaskDraft) => void | Promise<void>;
  persistent?: boolean;
  onPublish?: (draft: TaskDraft) => Promise<void>;
  onBackRequestChange?: (handler: (() => void) | null) => void;
};

export function TaskEditor({ initial, onClose, onSaveDraft, onPublish, onBackRequestChange, persistent = false, routes = initial.route ? [{ name: initial.route, checkpointCount: initial.checkpointCount }] : [] }: Props) {
  const { isDark } = useProductAppearance();
  const styles = makeStyles(isDark);
  const ink = isDark ? '#E8E8E6' : '#181B20';
  const [draft, setDraft] = useState(initial);
  const [step, setStep] = useState<number | null>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const update = (patch: Partial<TaskDraft>) => { setDraft(current => ({ ...current, ...patch })); setError(null); };
  const requestClose = useCallback(() => {
    if (saving.current) return;
    if (dirty) setDiscard(true); else onClose();
  }, [busy, dirty, onClose]);
  useEffect(() => { onBackRequestChange?.(requestClose); return () => onBackRequestChange?.(null); }, [onBackRequestChange, requestClose]);
  const save = async (publish: boolean) => {
    if (saving.current) return;
    const issue = draftError(draft);
    if (issue) { setError(issue); return; }
    const value = { ...draft, name: draft.name.trim(), route: draft.route.trim() };
    if (publish && !onPublish) return;
    saving.current = true;
    setBusy(true);
    try { if (publish) await onPublish!(value); else await onSaveDraft(value); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '保存失败，请重试'); }
    finally { saving.current = false; setBusy(false); }
  };
  const input = (label: string, value: string, onChangeText: (value: string) => void, numeric = false) => <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!busy} keyboardType={numeric ? 'number-pad' : 'default'} autoCorrect={false} style={styles.input} />;
  const steps = [
    { title: '选择路线', summary: draft.route ? `${draft.route} · ${draft.checkpointCount} 个检查点` : '选择路线' },
    { title: '检查点动作', summary: `检查点 ${String(draft.checkpoint).padStart(2, '0')} · ${[draft.photo && '拍照', draft.pause && '停留'].filter(Boolean).join('、') || '无附加动作'}` },
    { title: '执行时间', summary: `${draft.date} ${draft.time} · 单次` },
    { title: '完成后', summary: draft.finish === 'wait' ? '原地等待' : '返回起点' },
  ];
  return <View style={styles.root} testID="task-editor">
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="返回任务日程" onPress={requestClose} disabled={busy} style={styles.touch}><Feather name="arrow-left" size={22} color={ink} /></Pressable><Text style={styles.title}>编辑任务</Text><Text style={styles.badge}>草稿</Text></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.caption}>任务名称</Text>{input('任务名称', draft.name, value => update({ name: value }))}
      <View style={styles.steps}>{steps.map((item, index) => <View key={item.title} style={styles.stepRow}>
        <View style={styles.gutter}><Text style={[styles.number, step === index && styles.numberActive]}>{index + 1}</Text>{index < 3 ? <View style={styles.connector} /> : null}</View>
        <View style={[styles.step, step === index && styles.stepActive]}>
          <Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ expanded: step === index }} onPress={() => setStep(step === index ? null : index)} style={styles.stepHeading}><Text style={styles.heading}>{item.title}</Text><Feather name={step === index ? 'chevron-up' : 'chevron-down'} size={18} color={ink} /></Pressable>
          {step !== index ? <Text style={styles.caption}>{item.summary}</Text> : <ControlPanelMotion key={index} style={styles.fields}>
            {index === 0 ? routes.length ? routes.map(route => <Pressable key={route.name} accessibilityRole="radio" accessibilityLabel={route.name} accessibilityState={{ checked: draft.route === route.name }} disabled={busy} onPress={() => { update({ route: route.name, checkpointCount: route.checkpointCount, checkpoint: 1 }); setCheckpointOpen(false); }} style={styles.option}><View style={{ flex: 1 }}><Text style={styles.body}>{route.name}</Text><Text style={styles.caption}>{route.checkpointCount} 个检查点</Text></View>{draft.route === route.name ? <Feather name="check" size={17} color="#7795AA" /> : null}</Pressable>) : <Text style={styles.caption}>暂无可用路线</Text> : null}
            {index === 1 ? <><View style={styles.fieldRow}><Text style={styles.caption}>检查点</Text><Pressable accessibilityRole="button" accessibilityLabel="选择检查点" accessibilityState={{ expanded: checkpointOpen }} disabled={busy} onPress={() => setCheckpointOpen(value => !value)} style={styles.selector}><Text style={styles.body}>检查点 {String(draft.checkpoint).padStart(2, '0')}</Text><Feather name="chevron-down" size={17} color={ink} /></Pressable></View>{checkpointOpen ? <ScrollView style={styles.options} nestedScrollEnabled>{Array.from({ length: Math.min(1000, Math.max(0, Math.floor(draft.checkpointCount) || 0)) }, (_, index) => index + 1).map(number => <Pressable key={number} accessibilityRole="radio" accessibilityLabel={'检查点 ' + number} accessibilityState={{ checked: draft.checkpoint === number }} disabled={busy} onPress={() => { update({ checkpoint: number }); setCheckpointOpen(false); }} style={styles.option}><Text style={styles.body}>检查点 {String(number).padStart(2, '0')}</Text>{draft.checkpoint === number ? <Feather name="check" size={16} color="#7795AA" /> : null}</Pressable>)}</ScrollView> : null}<View style={styles.fieldRow}><Text style={styles.caption}>执行动作</Text><View style={styles.chips}>{([{ key: 'photo', label: '拍照', icon: 'camera' }, { key: 'pause', label: '停留', icon: 'clock' }] as const).map(action => <Pressable key={action.key} accessibilityRole="checkbox" accessibilityLabel={action.label} accessibilityState={{ checked: draft[action.key], disabled: busy }} disabled={busy} onPress={() => update({ [action.key]: !draft[action.key] })} style={[styles.chip, draft[action.key] && styles.chipActive]}><Feather name={draft[action.key] ? 'check-square' : 'square'} size={17} color={ink} /><Text style={styles.body}>{action.label}</Text></Pressable>)}</View></View>{draft.pause ? <><View style={styles.fieldRow}><Text style={styles.caption}>停留时间</Text><View style={styles.stepper}><Pressable accessibilityRole="button" accessibilityLabel="减少停留时间" disabled={busy || draft.dwellSeconds <= 0} onPress={() => update({ dwellSeconds: Math.max(0, draft.dwellSeconds - 1) })} style={styles.touch}><Feather name="minus" size={18} color={ink} /></Pressable><View style={styles.grow}><TextInput accessibilityLabel="停留时间" value={String(draft.dwellSeconds)} onChangeText={value => update({ dwellSeconds: Number(value) })} editable={!busy} keyboardType="number-pad" style={[styles.input, { borderBottomWidth: 0, textAlign: 'center', paddingHorizontal: 0 }]} /></View><Pressable accessibilityRole="button" accessibilityLabel="增加停留时间" disabled={busy || draft.dwellSeconds >= 3600} onPress={() => update({ dwellSeconds: Math.min(3600, draft.dwellSeconds + 1) })} style={styles.touch}><Feather name="plus" size={18} color={ink} /></Pressable></View><Text style={styles.caption}>秒</Text></View></> : null}</> : null}
            {index === 2 ? <><Text style={styles.caption}>日期（年-月-日）</Text>{input('执行日期', draft.date, date => update({ date }))}<Text style={styles.caption}>时间（时:分）</Text>{input('执行时间', draft.time, time => update({ time }))}</> : null}
            {index === 3 ? <View style={styles.chips}>{([{ value: 'wait', label: '原地等待' }, { value: 'return', label: '返回起点' }] as const).map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ selected: draft.finish === option.value, disabled: busy }} disabled={busy} onPress={() => update({ finish: option.value })} style={[styles.chip, draft.finish === option.value && styles.chipActive]}><Text style={styles.body}>{option.label}</Text></Pressable>)}</View> : null}
          </ControlPanelMotion>}
        </View>
      </View>)}</View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      {discard ? <View style={styles.discard}><Text style={styles.body}>放弃未保存的修改？</Text><View style={styles.chips}><Pressable accessibilityRole="button" onPress={() => setDiscard(false)} style={styles.secondary}><Text style={styles.body}>继续编辑</Text></Pressable><Pressable accessibilityRole="button" onPress={onClose} style={styles.secondary}><Text style={styles.error}>放弃修改</Text></Pressable></View></View> : null}
    </ScrollView>
    <View style={styles.footer}><Text style={styles.caption}>{onPublish ? '保存后等待下发' : persistent ? '草稿保存在本机' : '临时草稿'}</Text><View style={styles.chips}><Pressable testID="task-save-draft" accessibilityRole="button" disabled={busy} onPress={() => save(false)} style={styles.secondary}><Text style={styles.body}>保存草稿</Text></Pressable><Pressable testID="task-publish" accessibilityRole="button" accessibilityHint={onPublish ? '保存任务安排' : '任务保存服务尚未连接'} accessibilityState={{ disabled: busy || !onPublish }} disabled={busy || !onPublish} onPress={() => save(true)} style={[styles.primary, (busy || !onPublish) && styles.disabled]}><Text style={styles.primaryText}>{busy ? '保存中…' : '保存任务'}</Text></Pressable></View></View>
  </View>;
}

function makeStyles(dark: boolean) {
  const ink = dark ? '#E8E8E6' : '#181B20', muted = dark ? '#92928F' : '#6D727B', rule = dark ? '#393938' : '#DDE1E6';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: dark ? '#1C1C1B' : '#F5F6F9' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 60, gap: 8 }, title: { flex: 1, color: ink, ...productType.title }, badge: { color: muted, backgroundColor: dark ? '#30302F' : '#E5E8ED', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, fontSize: 12 }, touch: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 22, paddingTop: 10, gap: 9 }, caption: { color: muted, ...productType.caption }, body: { color: ink, ...productType.body }, input: { color: ink, fontSize: 16, minHeight: 44, borderBottomWidth: 1, borderColor: rule, paddingHorizontal: 8, paddingVertical: 8 },
    steps: { gap: 12, marginTop: 22 }, stepRow: { flexDirection: 'row', gap: 10 }, gutter: { width: 30, alignItems: 'center', paddingTop: 12 }, number: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: rule, color: ink, textAlign: 'center', lineHeight: 26, fontSize: 14 }, numberActive: { color: '#A0B8C8', borderColor: '#7795AA' }, connector: { width: 1, backgroundColor: rule, position: 'absolute', top: 43, bottom: -25 },
    step: { flex: 1, minWidth: 0, padding: 14, borderLeftWidth: 2, borderColor: 'transparent', borderRadius: 8, gap: 4 }, stepActive: { backgroundColor: dark ? '#242423' : '#FFFFFF', borderLeftColor: '#7795AA' }, stepHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }, heading: { flex: 1, color: ink, fontSize: 18, lineHeight: 26, fontWeight: '500' }, fields: { gap: 14, paddingTop: 16 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 36, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: rule }, chipActive: { backgroundColor: dark ? '#353533' : '#E5EBF2', borderColor: '#7795AA' }, fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }, selector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, minWidth: 130, paddingHorizontal: 10, borderWidth: 1, borderColor: rule, borderRadius: 6 }, options: { maxHeight: 180, borderWidth: 1, borderColor: rule, borderRadius: 6 }, option: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: rule, borderRadius: 6 }, grow: { width: 44 },
    error: { color: dark ? '#E3A29D' : '#AC3434', fontSize: 13, lineHeight: 20 }, discard: { borderWidth: 1, borderColor: rule, padding: 12, gap: 12, borderRadius: 8 }, footer: { padding: 20, gap: 12, borderTopWidth: 1, borderColor: rule }, secondary: { flex: 1, minWidth: 110, minHeight: 46, borderRadius: 6, borderWidth: 1, borderColor: rule, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, primary: { flex: 1, minWidth: 110, minHeight: 46, borderRadius: 8, backgroundColor: dark ? '#E8E8E6' : '#181B20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, primaryText: { color: dark ? '#1C1C1B' : '#FFFFFF', ...productType.button }, disabled: { opacity: .4 },
  });
}
