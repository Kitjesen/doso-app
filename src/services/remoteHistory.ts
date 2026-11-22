import { readRemoteHistoryPage, RemoteStateError, type RemoteLocation } from './remoteState';

export type HistoryPoint = { reportTs: number; breakBefore: boolean; location: RemoteLocation | null };
export type RemoteHistory = {
  deviceId: string; simulated: boolean; historyId: string | null; startTs: number; endTs: number;
  points: HistoryPoint[]; partial: boolean;
  enabled: boolean; availability: 'preparing' | 'ready'; syncState: 'current' | 'pending' | 'incomplete';
};
type Page = Omit<RemoteHistory, 'partial'> & { nextTs: number | null };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown, minimum = 0): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const invalid = (): never => { throw new RemoteStateError('invalid_response'); };

function parsePage(value: unknown, deviceId: string, startTs: number, endTs: number, after?: number): Page {
  if (!record(value) || value.deviceId !== deviceId || value.startTs !== startTs || value.endTs !== endTs
    || typeof value.simulated !== 'boolean' || (value.historyId !== null && !uuid(value.historyId))
    || typeof value.enabled !== 'boolean' || typeof value.availability !== 'string' || !['preparing', 'ready'].includes(value.availability)
    || typeof value.syncState !== 'string' || !['current', 'pending', 'incomplete'].includes(value.syncState)
    || (value.availability === 'ready' && value.historyId === null)
    || !Array.isArray(value.points) || value.points.length > 500) return invalid();
  let previous = after ?? startTs - 1;
  const points = value.points.map((point: unknown): HistoryPoint => {
    if (!record(point) || !count(point.reportTs) || point.reportTs < startTs || point.reportTs >= endTs
      || point.reportTs <= previous || typeof point.breakBefore !== 'boolean') return invalid();
    previous = point.reportTs;
    const location = point.location;
    if (location !== null && (!record(location) || typeof location.lat !== 'number' || !Number.isFinite(location.lat) || Math.abs(location.lat) > 90
      || typeof location.lon !== 'number' || !Number.isFinite(location.lon) || Math.abs(location.lon) > 180
      || !count(location.fixType, 1) || location.fixType > 8 || !timestamp(location.observedAt)
      || (location.accuracyM !== null && (typeof location.accuracyM !== 'number' || !Number.isFinite(location.accuracyM)
        || location.accuracyM < 0 || location.accuracyM > 100000)))) return invalid();
    return { reportTs: point.reportTs, breakBefore: point.breakBefore, location: location as RemoteLocation | null };
  });
  if (value.nextTs !== null && (!count(value.nextTs) || points.length !== 500 || value.nextTs !== previous || value.nextTs >= endTs)) return invalid();
  if (value.availability !== 'ready' && (points.length || value.nextTs !== null)) return invalid();
  return { deviceId, simulated: value.simulated, historyId: value.historyId as string | null, startTs, endTs, points,
    nextTs: value.nextTs as number | null, enabled: value.enabled,
    availability: value.availability as RemoteHistory['availability'], syncState: value.syncState as RemoteHistory['syncState'] };
}

export async function getRemoteHistory(expectedUserId: string, deviceId: string, startTs: number, endTs: number,
  { signal }: { signal?: AbortSignal } = {}): Promise<RemoteHistory> {
  if (!count(startTs) || !count(endTs) || endTs <= startTs || endTs - startTs > 86400000) throw new RemoteStateError('invalid_request');
  const points: HistoryPoint[] = [];
  let after: number | undefined, result: Page | undefined;
  do {
    if (signal?.aborted) throw new RemoteStateError('cancelled');
    const query = `deviceId=${encodeURIComponent(deviceId)}&startTs=${startTs}&endTs=${endTs}${after === undefined ? '' : `&after=${after}`}`;
    const page = await readRemoteHistoryPage(expectedUserId, deviceId, query, value => parsePage(value, deviceId, startTs, endTs, after), signal);
    if (result && (page.historyId !== result.historyId || page.simulated !== result.simulated)) throw new RemoteStateError('unauthorized');
    result = page;
    points.push(...page.points);
    after = page.nextTs ?? undefined;
  } while (after !== undefined && points.length < 2000);
  return { ...result!, points, partial: after !== undefined };
}
