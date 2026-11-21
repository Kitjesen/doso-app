export type AppStage =
  | 'control'
  | 'joint-status'
  | 'main'
  | 'ble-discovery'
  | 'provisioning'
  | 'firmware-update';

export type RobotModel = {
  id: string;
  name: string;
  description: string;
  category: '四足' | '轮式';
  environment: '室内' | '室外';
  image: number;
};
