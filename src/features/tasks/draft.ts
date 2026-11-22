export type TaskDraft = {
  name: string; route: string; checkpointCount: number; checkpoint: number;
  photo: boolean; pause: boolean; dwellSeconds: number; date: string; time: string;
  finish: 'wait' | 'return';
};

export function makeTaskDraft(date: string): TaskDraft {
  return { name: '', route: '', checkpointCount: 1, checkpoint: 1, photo: false, pause: true, dwellSeconds: 10, date, time: '14:00', finish: 'wait' };
}

export function draftError(draft: TaskDraft): string | null {
  if (!draft.name.trim() || draft.name.trim().length > 50) return '任务名称需为 1–50 个字符';
  if (!draft.route.trim() || draft.route.trim().length > 80) return '请填写 1–80 个字符的路线名称';
  if (!Number.isInteger(draft.checkpointCount) || draft.checkpointCount < 1 || draft.checkpointCount > 1000) return '检查点数量需为 1–1000';
  if (!Number.isInteger(draft.checkpoint) || draft.checkpoint < 1 || draft.checkpoint > draft.checkpointCount) return '检查点编号超出路线范围';
  if (!Number.isInteger(draft.dwellSeconds) || draft.dwellSeconds < 0 || draft.dwellSeconds > 3600) return '停留时间需为 0–3600 秒';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return '请输入有效日期';
  const date = new Date(draft.date + 'T12:00:00');
  if (!Number.isFinite(date.getTime()) || `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` !== draft.date) return '请输入有效日期';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return '请输入 24 小时制时间，例如 14:00';
  return null;
}

