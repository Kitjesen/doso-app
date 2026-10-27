export type MapWaypoint = Readonly<{
  id: string;
  name: string;
  x: number;
  y: number;
  yaw: number;
}>;

export type MapEdge = Readonly<{
  from: string;
  to: string;
  lengthM: number;
}>;

export type MapSnapshot = Readonly<{
  mapId: string;
  mapVersion: string;
  coordinateFrame: string;
  units: 'meters';
  checksum: string;
  waypoints: readonly MapWaypoint[];
  edges: readonly MapEdge[];
}>;

type ValidationFailure = Readonly<{ valid: false; code: string; reason: string }>;

export type MapSnapshotValidation =
  | Readonly<{ valid: true }>
  | ValidationFailure;

export type RouteDraft = Readonly<{
  name: string;
  waypointIds: readonly string[];
}>;

export type RouteValidation =
  | Readonly<{ valid: true; geometryHash: string }>
  | ValidationFailure;

const invalid = (code: string, reason: string): ValidationFailure => ({ valid: false, code, reason });

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateMapSnapshot(value: unknown): MapSnapshotValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('snapshot-invalid', '地图快照不是对象。');
  }
  const snapshot = value as Partial<MapSnapshot>;
  if (!nonEmpty(snapshot.mapId) || !nonEmpty(snapshot.mapVersion)) {
    return invalid('version-missing', '地图必须包含稳定的 mapId 和 mapVersion。');
  }
  if (!nonEmpty(snapshot.coordinateFrame) || snapshot.units !== 'meters' || !nonEmpty(snapshot.checksum)) {
    return invalid('coordinate-contract-invalid', '地图坐标系、单位或校验摘要无效。');
  }
  if (!Array.isArray(snapshot.waypoints) || !Array.isArray(snapshot.edges) || snapshot.waypoints.length === 0) {
    return invalid('graph-empty', '地图必须包含至少一个 waypoint 和一组 edge。');
  }
  const waypointIds = new Set<string>();
  for (const waypoint of snapshot.waypoints) {
    if (!waypoint || !nonEmpty(waypoint.id) || waypointIds.has(waypoint.id)
      || !nonEmpty(waypoint.name) || !finite(waypoint.x) || !finite(waypoint.y) || !finite(waypoint.yaw)) {
      return invalid('waypoint-invalid', '地图包含无效或重复的 waypoint。');
    }
    waypointIds.add(waypoint.id);
  }
  for (const edge of snapshot.edges) {
    if (!edge || !nonEmpty(edge.from) || !nonEmpty(edge.to)
      || !waypointIds.has(edge.from) || !waypointIds.has(edge.to)
      || edge.from === edge.to || !finite(edge.lengthM) || edge.lengthM <= 0) {
      return invalid('edge-invalid', '地图包含无效的 edge 或不存在的 waypoint 引用。');
    }
  }
  return { valid: true };
}

export function validateRouteDraft(snapshot: MapSnapshot, draft: RouteDraft): RouteValidation {
  const snapshotResult = validateMapSnapshot(snapshot);
  if (!snapshotResult.valid) return snapshotResult;
  if (!nonEmpty(draft?.name) || !Array.isArray(draft.waypointIds) || draft.waypointIds.length < 2) {
    return invalid('route-empty', '路线至少需要两个 waypoint。');
  }
  const known = new Set(snapshot.waypoints.map(waypoint => waypoint.id));
  const edges = new Set(snapshot.edges.map(edge => `${edge.from}>${edge.to}`));
  for (let index = 0; index < draft.waypointIds.length; index += 1) {
    const waypointId = draft.waypointIds[index];
    if (!nonEmpty(waypointId) || !known.has(waypointId)) {
      return invalid('route-waypoint-unknown', '路线引用了不属于当前地图的 waypoint。');
    }
    if (index > 0 && !edges.has(`${draft.waypointIds[index - 1]}>${waypointId}`)) {
      return invalid('route-edge-missing', '路线中存在未验证的 waypoint 连接。');
    }
  }
  return { valid: true, geometryHash: draft.waypointIds.join('>') };
}
