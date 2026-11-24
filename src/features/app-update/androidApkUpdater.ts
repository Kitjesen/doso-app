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
  /** Base URL of `doso-ota-release` (e.g. `https://api-test.dosorobotics.com/ota`). */
  baseUrl: string;
  /** Release channel (`prod`, `beta`, `qa`). Defaults to `prod`. */
  channel?: string;
  /** Installed Android `versionCode` (integer). */
  currentVersionCode: number;
  /** Optional custom fetch implementation for unit tests. */
  fetchImpl?: typeof fetch;
}

export async function checkAndroidApkUpdate(
  options: CheckAndroidApkOptions,
): Promise<AndroidApkReleaseInfo | null> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const channel = encodeURIComponent(options.channel ?? 'prod');
  const code = Math.max(0, Math.floor(options.currentVersionCode));
  const base = options.baseUrl.replace(/\/+$/, '');
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
    || typeof data.versionCode !== 'number'
    || typeof data.downloadUrl !== 'string'
    || !/^[0-9a-f]{64}$/i.test(data.apkSha256)
  ) {
    throw new Error('Invalid Android APK OTA response payload');
  }
  return data;
}
