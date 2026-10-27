export const ANALYSIS_PREVIEW = {
  status: '正常',
  distance: '12.8 公里',
  metrics: [
    { icon: 'checkmark', label: '任务', value: '8 / 10' },
    { icon: 'time-outline', label: '运行时长', value: '6.4 小时' },
    { icon: 'thermometer-outline', label: '平均温度', value: '32°C' },
  ],
  month: '四月',
  dates: [
    { day: '周日', date: '01', selected: false },
    { day: '周一', date: '02', selected: false },
    { day: '周二', date: '03', selected: true },
    { day: '周三', date: '04', selected: false },
    { day: '周四', date: '03', selected: false },
  ],
  trend: '+12%',
} as const;
