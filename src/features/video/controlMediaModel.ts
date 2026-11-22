export type MediaCameraId = 'front' | 'rear';
export type MediaRotationDegrees = 0 | 90 | 180 | 270;

export type SnapshotSaveResult = Readonly<{
  fileName: string;
  width: number;
  height: number;
  bytes: number | null;
  uri?: string;
  locationLabel: string;
}>;

export type RecordingSaveResult = Readonly<{
  fileName: string;
  durationMs: number;
  bytes: number | null;
  mimeType: string;
  uri?: string;
  locationLabel: string;
}>;

export type ActiveRecordingSession = Readonly<{
  fileName: string;
  mimeType: string;
  stop: () => Promise<RecordingSaveResult>;
  cancel: () => Promise<void>;
}>;

export type CaptureMediaInput = Readonly<{
  camera: MediaCameraId;
  stream: unknown;
  rotation?: number;
  now?: Date;
}>;

export type ControlMediaCaptureAdapter = Readonly<{
  supported: boolean;
  storageTargetLabel: string;
  capturePhoto: (input: CaptureMediaInput) => Promise<SnapshotSaveResult>;
  startRecording: (input: CaptureMediaInput) => Promise<ActiveRecordingSession>;
}>;

function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

export function formatMediaTimestamp(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  const hour = pad2(now.getHours());
  const minute = pad2(now.getMinutes());
  const second = pad2(now.getSeconds());
  return `${year}${month}${day}_${hour}${minute}${second}`;
}

export function buildSnapshotFileName(camera: MediaCameraId, now?: Date): string {
  return `DOSO_SNAP_${formatMediaTimestamp(now)}_${camera}.jpg`;
}

export function buildRecordingFileName(
  camera: MediaCameraId,
  extension: 'mp4' | 'webm',
  now?: Date,
): string {
  return `DOSO_REC_${formatMediaTimestamp(now)}_${camera}.${extension}`;
}

export function normalizeMediaRotation(degrees: number | undefined): MediaRotationDegrees {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return 0;
  const normalized = ((Math.round(degrees) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

export function formatMediaDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${pad2(mins)}:${pad2(secs)}`;
}
