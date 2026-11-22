export type PreviewPoint = { x: number; y: number };
export type PreviewRoute = {
  id: string; name: string; mapName: string; distanceM: number;
  favorite: boolean; recent: boolean; points: PreviewPoint[];
  estimatedMinutes?: number; updatedLabel?: string; positionIndex?: number;
};
export type RouteFilter = '全部' | '最近' | '收藏';

// Presentation fixtures only. These records have no executable route ID or geometry attestation.
export const previewRoutes: PreviewRoute[] = [
  { id: 'a', name: '东侧巡检路线', mapName: '园区一层', distanceM: 420, estimatedMinutes: 18, updatedLabel: '11 月 11 日 10:20', positionIndex: 2, favorite: true, recent: true,
    points: [{ x: .177, y: .718 }, { x: .335, y: .718 }, { x: .524, y: .718 }, { x: .712, y: .718 }, { x: .712, y: .448 }, { x: .75, y: .256 }] },
  { id: 'b', name: '仓库环线', mapName: '仓库地图', distanceM: 280, favorite: false, recent: true,
    points: [{ x: .14, y: .7 }, { x: .55, y: .59 }, { x: .62, y: .85 }, { x: .16, y: .86 }] },
  { id: 'c', name: '充电区路线', mapName: '园区地图', distanceM: 160, favorite: true, recent: false,
    points: [{ x: .45, y: .83 }, { x: .71, y: .68 }, { x: .91, y: .8 }] },
];

export const filterRoutes = (routes: PreviewRoute[], filter: RouteFilter) => routes.filter(route =>
  filter === '全部' || (filter === '最近' ? route.recent : route.favorite));

export function selectedRoute(routes: PreviewRoute[], filter: RouteFilter, id: string) {
  const visible = filterRoutes(routes, filter);
  return visible.find(route => route.id === id) ?? visible[0];
}
