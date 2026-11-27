import type { ImageSourcePropType } from 'react-native';

import type { StandbySceneId } from '../features/control/controlPreferences';

export type { StandbySceneId } from '../features/control/controlPreferences';

export type StandbySceneSpec = Readonly<{
  id: StandbySceneId;
  label: string;
  shortLabel: string;
  source: ImageSourcePropType;
}>;

export const DEFAULT_STANDBY_SCENE: StandbySceneId = 'forest';

const FOREST_ASSET = require('../../assets/scene/cockpit-standby-forest.jpg') as ImageSourcePropType;
const CHARCOAL_ASSET = require('../../assets/scene/cockpit-standby-charcoal.jpg') as ImageSourcePropType;
const GALLERY_ASSET = require('../../assets/scene/cockpit-standby-gallery.jpg') as ImageSourcePropType;
const HANGAR_ASSET = require('../../assets/scene/cockpit-standby-hangar.jpg') as ImageSourcePropType;

export const STANDBY_SCENES: readonly StandbySceneSpec[] = Object.freeze([
  Object.freeze({
    id: 'forest',
    label: '迷雾森林',
    shortLabel: '森林',
    source: FOREST_ASSET,
  }),
  Object.freeze({
    id: 'charcoal',
    label: '炭灰影棚',
    shortLabel: '影棚',
    source: CHARCOAL_ASSET,
  }),
  Object.freeze({
    id: 'gallery',
    label: '建筑展厅',
    shortLabel: '展厅',
    source: GALLERY_ASSET,
  }),
  Object.freeze({
    id: 'hangar',
    label: '星际舱室',
    shortLabel: '舱室',
    source: HANGAR_ASSET,
  }),
]);

export function normalizeStandbyScene(value: unknown): StandbySceneId {
  if (value === 'forest' || value === 'gallery' || value === 'hangar' || value === 'charcoal') {
    return value;
  }
  return DEFAULT_STANDBY_SCENE;
}

export function getStandbySceneSpec(id?: StandbySceneId | null): StandbySceneSpec {
  const normalized = normalizeStandbyScene(id);
  return STANDBY_SCENES.find(scene => scene.id === normalized) ?? STANDBY_SCENES[0];
}

export function getStandbySceneAsset(id?: StandbySceneId | null): ImageSourcePropType {
  return getStandbySceneSpec(id).source;
}
