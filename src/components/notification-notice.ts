import type { ToastNotice } from './AppToast';

export const notificationUnavailableNotice: ToastNotice = {
  title: '通知服务尚未接入',
  message: '当前不能确认是否存在新的设备告警。',
  tone: 'info',
};
