export type AnalysisRange = '今日' | '7天' | '30天';

// Design-only fixtures. Production AnalysisScreen receives previewMode=false.
const activity = [
  [0, 0, 0, 0, 1, 1, 2, 3, 2, 1, 0, 0],
  [0, 0, 0, 0, 1, 2, 3, 2, 1, 1, 0, 0],
  [0, 0, 0, 1, 2, 2, 3, 3, 2, 1, 0, 0],
  [0, 0, 0, 0, 1, 2, 2, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 2, 3, 2, 2, 1, 0, 0],
  [0, 0, 0, 1, 1, 2, 3, 3, 2, 1, 1, 0],
  [0, 0, 0, 0, 1, 2, 2, 3, 2, 1, 0, 0],
] as const;
const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const ANALYSIS_PREVIEW = {
  ranges: {
    '今日': { label: '11月11日', bars: [{ label: '00–04', hours: 0 }, { label: '04–08', hours: .2 }, { label: '08–12', hours: 1.4 }, { label: '12–16', hours: 1.1 }, { label: '16–20', hours: .5 }, { label: '20–24', hours: 0 }], completed: 4, completion: '100%', distanceKm: .8, tasks: [{ name: '巡检', count: 2 }, { name: '定点检查', count: 1 }, { name: '设备检查', count: 1 }], activity: [activity[2]], activityLabels: ['今日'] },
    '7天': { label: '11月9日—15日', bars: [2, 2.6, 3.2, 1.8, 2.9, 3.5, 2.6].map((hours, index) => ({ label: ['一', '二', '三', '四', '五', '六', '日'][index], hours })), completed: 24, completion: '92%', distanceKm: 4.8, tasks: [{ name: '巡检', count: 14 }, { name: '定点检查', count: 6 }, { name: '设备检查', count: 4 }], activity, activityLabels: labels },
    '30天': { label: '10月17日—11月15日', bars: [{ label: '17–21', hours: 11.4 }, { label: '22–26', hours: 13.2 }, { label: '27–31', hours: 10.8 }, { label: '1–5', hours: 12.6 }, { label: '6–10', hours: 13.1 }, { label: '11–15', hours: 12.9 }], completed: 96, completion: '94%', distanceKm: 19.1, tasks: [{ name: '巡检', count: 60 }, { name: '定点检查', count: 22 }, { name: '设备检查', count: 14 }], activity: [] as readonly (readonly number[])[], activityLabels: [] as readonly string[] },
  },
};
