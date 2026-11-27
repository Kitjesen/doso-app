import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  checkAndroidApkUpdate,
  DEFAULT_OTA_BASE_URL,
  formatApkSize,
  formatAppUpdateStatus,
  resolveOtaBaseUrl,
  validateApkDownloadUrl,
} from '../src/features/app-update/androidApkUpdater.ts';
import {
  formatInstalledAppVersionLabel,
  INSTALLED_APP_VERSION_CODE,
  INSTALLED_APP_VERSION_NAME,
} from '../src/features/app-update/appVersion.ts';

test('appVersion matches expo version and android versionCode in app.json', async () => {
  const raw = await readFile(new URL('../app.json', import.meta.url), 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(INSTALLED_APP_VERSION_NAME, parsed.expo.version);
  assert.equal(INSTALLED_APP_VERSION_CODE, parsed.expo.android.versionCode);
  assert.equal(
    formatInstalledAppVersionLabel(),
    `${parsed.expo.version} (${parsed.expo.android.versionCode})`,
  );
});

test('DEFAULT_OTA_BASE_URL uses formal production domain and resolveOtaBaseUrl validates schemes', () => {
  assert.equal(DEFAULT_OTA_BASE_URL, 'https://api.dosorobotics.com/ota');
  assert.equal(resolveOtaBaseUrl(undefined), 'https://api.dosorobotics.com/ota');
  assert.equal(resolveOtaBaseUrl('  '), 'https://api.dosorobotics.com/ota');
  assert.equal(resolveOtaBaseUrl('https://api.dosorobotics.com/ota///'), 'https://api.dosorobotics.com/ota');
  assert.equal(resolveOtaBaseUrl('http://127.0.0.1:8140/'), 'http://127.0.0.1:8140');
  assert.throws(() => resolveOtaBaseUrl('http://api.dosorobotics.com/ota'), /Unsupported OTA URL scheme/);
  assert.throws(() => resolveOtaBaseUrl('https://user:pass@api.dosorobotics.com/ota'), /credentials/);
  assert.throws(() => resolveOtaBaseUrl('https://api.dosorobotics.com/ota?foo=bar'), /query/);
});

test('validateApkDownloadUrl allows signed HTTPS OSS URLs and rejects insecure URLs', () => {
  const ossUrl = 'https://doso-ota-prod-shanghai.oss-cn-shanghai.aliyuncs.com/apps/android/prod/doso.apk?Expires=1800000000&Signature=abc';
  assert.equal(validateApkDownloadUrl(ossUrl), ossUrl);
  assert.throws(() => validateApkDownloadUrl('http://example.com/app.apk'), /Unsupported OTA URL scheme/);
  assert.throws(() => validateApkDownloadUrl('file:///tmp/app.apk'), /Unsupported OTA URL scheme/);
});

test('checkAndroidApkUpdate uses formal domain by default and parses signed APK response', async () => {
  let calledUrl = '';
  const result = await checkAndroidApkUpdate({
    channel: 'prod',
    currentVersionCode: INSTALLED_APP_VERSION_CODE,
    fetchImpl: async (input) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify({
          channel: 'prod',
          versionName: '1.2.0',
          versionCode: 120,
          minSupportedCode: 110,
          mandatory: false,
          updateAvailable: true,
          forceUpdate: true,
          changelog: '支持机器狗 OTA 管理与远程运动扩展',
          apkSha256: 'a'.repeat(64),
          apkSizeBytes: 42_000_000,
          downloadUrl: 'https://doso-ota-prod-shanghai.oss-cn-shanghai.aliyuncs.com/apps/android/prod/doso-1.2.0.apk?Expires=1800000000',
          publishedAtMs: 1_760_000_000_000,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  assert.equal(
    calledUrl,
    `https://api.dosorobotics.com/ota/v1/apps/android/latest?channel=prod&version_code=${INSTALLED_APP_VERSION_CODE}`,
  );
  assert.ok(result);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.forceUpdate, true);
  assert.equal(result.versionName, '1.2.0');
  assert.equal(formatApkSize(result.apkSizeBytes), '40.1 MB');
  assert.deepEqual(formatAppUpdateStatus(result), {
    statusLabel: '需更新 v1.2.0',
    actionLabel: '下载更新',
    canDownload: true,
    isMandatory: true,
  });
});

test('checkAndroidApkUpdate returns null on 404 and formats up-to-date status', async () => {
  const result = await checkAndroidApkUpdate({
    baseUrl: 'https://api.dosorobotics.com/ota',
    channel: 'beta',
    currentVersionCode: 100,
    fetchImpl: async () => new Response('{"error":{"code":"app_release_not_found"}}', { status: 404 }),
  });
  assert.equal(result, null);
  assert.deepEqual(formatAppUpdateStatus(result), {
    statusLabel: '已是最新',
    actionLabel: null,
    canDownload: false,
    isMandatory: false,
  });
});
