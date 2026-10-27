import { images } from './assets';
import type { RobotModel } from './types';

export const robotModels: RobotModel[] = [
  {
    id: 'thunder-01',
    name: 'THUNDER 01',
    description: '全地形轮足巡检机器人',
    category: '四足',
    environment: '室外',
    image: images.thunderCard,
  },
  {
    id: 'thunder-mini',
    name: 'THUNDER MINI',
    description: '轻量灵活的室内机器人',
    category: '轮式',
    environment: '室内',
    image: images.thunderMini,
  },
  {
    id: 'thunder-pro',
    name: 'THUNDER PRO',
    description: '专业级复杂地形作业',
    category: '四足',
    environment: '室外',
    image: images.thunderPro,
  },
  {
    id: 'scout',
    name: 'SCOUT',
    description: '紧凑型智能侦察伙伴',
    category: '四足',
    environment: '室内',
    image: images.scout,
  },
];

export function getRobotModel(modelId?: string | null) {
  return robotModels.find((model) => model.id === modelId) ?? robotModels[0];
}
