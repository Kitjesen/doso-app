export const DEFAULT_OTA_BASE_URL = 'https://api.dosorobotics.com/ota';
export const DEFAULT_OTA_CHANNEL = 'prod';

export interface AndroidApkReleaseInfo {
  channel: string;
  versionName: string;
  versionCode: number;
  minSupportedCode: number;
  mandatory: boolean;
  updateAvailable: boolean;
  forceUpdate: boolean;
  changelog: string;
  apkSha256: string;
  apkSizeBytes: number;
  downloadUrl: string;
  publishedAtMs: number;
}

export interface CheckAndroidApkOptions {
  /** Base URL of `doso-ota-release` (defaults to `https://api.dosorobotics.com/ota`). */
  baseUrl?: string;
  /** Release channel (`prod`, `beta`, `qa`). Defaults to `prod`. */
  channel?: string;
  /** Installed Android `versionCode` (integer). */
  currentVersionCode: number;
  /** Optional custom fetch implementation for unit tests. */
  fetchImpl?: typeof fetch;
}

export interface AppUpdateStatusPresentation {
  statusLabel: string;
  actionLabel: string | null;
  canDownload: boolean;
  isMandatory: boolean;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

function validateOtaHttpUrl(raw: string, allowQueryAndHash: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error('Invalid OTA URL');
  }
  const isLoopback = LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
    throw new Error('Unsupported OTA URL scheme');
  }
  if (parsed.username || parsed.password) {
    throw new Error('OTA URL must not include credentials');
  }
  if (!allowQueryAndHash && (parsed.search || parsed.hash)) {
    throw new Error('OTA base URL must not include query or fragment');
  }
  return parsed.toString();
}

export function resolveOtaBaseUrl(raw?: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return DEFAULT_OTA_BASE_URL;
  }
  return validateOtaHttpUrl(trimmed, false).replace(/\/+$/, '');
}

export function validateApkDownloadUrl(raw: string): string {
  return validateOtaHttpUrl(raw, true);
}

export function formatApkSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatAppUpdateStatus(info: AndroidApkReleaseInfo | null): AppUpdateStatusPresentation {
  if (!info || !info.updateAvailable) {
    return {
      statusLabel: '已是最新',
      actionLabel: null,
      canDownload: false,
      isMandatory: false,
    };
  }
  return {
    statusLabel: info.forceUpdate ? `需更新 v${info.versionName}` : `新版本 v${info.versionName}`,
    actionLabel: '下载更新',
    canDownload: true,
    isMandatory: Boolean(info.forceUpdate),
  };
}

export async function checkAndroidApkUpdate(
  options: CheckAndroidApkOptions,
): Promise<AndroidApkReleaseInfo | null> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const channel = encodeURIComponent(options.channel?.trim() || DEFAULT_OTA_CHANNEL);
  const code = Math.max(0, Math.floor(options.currentVersionCode));
  const base = resolveOtaBaseUrl(options.baseUrl);
  const url = `${base}/v1/apps/android/latest?channel=${channel}&version_code=${code}`;

  const response = await fetchFn(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`APK OTA check failed with HTTP ${response.status}`);
  }
  const data = (await response.json()) as AndroidApkReleaseInfo;
  if (
    typeof data.versionName !== 'string'
    || !Number.isInteger(data.versionCode)
    || data.versionCode <= 0
    || !Number.isFinite(data.apkSizeBytes)
    || data.apkSizeBytes <= 0
    || typeof data.downloadUrl !== 'string'
    || !/^[0-9a-f]{64}$/i.test(data.apkSha256)
  ) {
    throw new Error('Invalid Android APK OTA response payload');
  }
  return {
    ...data,
    downloadUrl: validateApkDownloadUrl(data.downloadUrl),
  };
}
