import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAndroidApkUpdate } from '../src/features/app-update/androidApkUpdater.ts';

test('checkAndroidApkUpdate parses signed APK release response', async () => {
  let calledUrl = '';
  const result = await checkAndroidApkUpdate({
    baseUrl: 'https://api-test.dosorobotics.com/ota/',
    channel: 'prod',
    currentVersionCode: 100,
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
          changelog: '支持机器狗运动策略 OTA 管理',
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
    'https://api-test.dosorobotics.com/ota/v1/apps/android/latest?channel=prod&version_code=100',
  );
  assert.ok(result);
  assert.equal(result.updateAvailable, true);
  assert.equal(result.forceUpdate, true);
  assert.equal(result.versionName, '1.2.0');
});

test('checkAndroidApkUpdate returns null on 404 (no published release)', async () => {
  const result = await checkAndroidApkUpdate({
    baseUrl: 'https://api-test.dosorobotics.com/ota',
    channel: 'beta',
    currentVersionCode: 100,
    fetchImpl: async () => new Response('{"error":{"code":"app_release_not_found"}}', { status: 404 }),
  });
  assert.equal(result, null);
});
