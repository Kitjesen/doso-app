import type { HistoryPoint } from '../../services/remoteHistory';
import type { RemoteLocation } from '../../services/remoteState';

export type TrackPoint = { lat: number; lon: number; observedAt: string; breakBefore: boolean };
const distance = (a: RemoteLocation, b: RemoteLocation) => {
  const radians = Math.PI / 180;
  const lat = (b.lat - a.lat) * radians, lon = (b.lon - a.lon) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};

export function buildTrack(points: HistoryPoint[]) {
  const trail: TrackPoint[] = [], seen = new Set<string>();
  let previous: RemoteLocation | null = null, anchor: RemoteLocation | null = null;
  let distanceM = 0, durationMs = 0, gaps = 0, unknownAccuracy = false;
  let latestFixAt = -Infinity;
  let firstFix: string | null = null, lastFix: string | null = null;
  for (const point of points) {
    if (point.breakBefore || point.location === null) {
      if (previous) gaps++;
      previous = null; anchor = null;
    }
    const location = point.location;
    if (!location) continue;
    if (seen.has(location.observedAt)) continue;
    seen.add(location.observedAt);
    const at = Date.parse(location.observedAt);
    if (at < latestFixAt) {
      if (previous) gaps++;
      previous = null; anchor = null;
      continue;
    }
    latestFixAt = at;
    const interval = previous ? at - Date.parse(previous.observedAt) : 0;
    const broken = !!previous && (interval <= 0 || interval > 15000 || distance(previous, location) / (interval / 1000) > 15);
    if (broken) { gaps++; previous = null; anchor = null; }
    if (previous) durationMs += interval;
    if (anchor) {
      const moved = distance(anchor, location);
      if (moved >= Math.max(3, anchor.accuracyM ?? 0, location.accuracyM ?? 0)) { distanceM += moved; anchor = location; }
    } else anchor = location;
    trail.push({ lat: location.lat, lon: location.lon, observedAt: location.observedAt, breakBefore: previous === null });
    if (firstFix === null || at < Date.parse(firstFix)) firstFix = location.observedAt;
    if (lastFix === null || at > Date.parse(lastFix)) lastFix = location.observedAt;
    unknownAccuracy ||= location.accuracyM === null;
    previous = location;
  }
  return { trail, distanceM: trail.length ? distanceM : null, durationMs: trail.length ? durationMs : null,
    firstFix, lastFix, gaps, unknownAccuracy };
}
