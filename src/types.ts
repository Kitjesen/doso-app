export type MainTab = 'home' | 'map' | 'tasks' | 'analysis' | 'profile';

export type AppStage =
  | 'login'
  | 'register'
  | 'verify-email'
  | 'forgot-password'
  | 'verify-recovery'
  | 'reset-password'
  | 'account-security'
  | 'edit-profile'
  | 'mfa-setup'
  | 'username-onboarding'
  | 'display-name-confirmation'
  | 'bind-device'
  | 'device-enrollment'
  | 'ble-discovery'
  | 'provisioning'
  | 'firmware-update'
  | 'device-error'
  | 'models'
  | 'joint-status'
  | 'main'
  | 'control';

export type RobotModel = {
  id: string;
  name: string;
  description: string;
  category: '四足' | '轮式';
  environment: '室内' | '室外';
  image: number;
};
