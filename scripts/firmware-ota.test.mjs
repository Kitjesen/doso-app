import assert from 'node:assert/strict';
import test from 'node:test';
import {
  callFirmwareOtaEndpoint,
  canCancelOtaPhase,
  describeReleaseTitle,
  formatFirmwareBytes,
  formatFirmwarePhase,
  isDeviceOnlineFromStatus,
  isTerminalOtaPhase,
  partitionFirmwareReleases,
} from '../src/services/firmwareOtaCore.ts';

test('partitionFirmwareReleases prioritizes release_bundle and isolates adminOnly hardware firmware', () => {
  const releases = [
    {
      releaseId: 'rel-policy',
      version: '1.0.4',
      sequence: 202,
      channel: 'qa',
      model: 'THUNDER 01',
      hardwareRevision: 'rdk-s100p',
      artifactSizeBytes: 724464,
      artifactSha256: 'a'.repeat(64),
      artifactType: 'policy_package',
      policySlot: 'flat',
      adminOnly: false,
    },
    {
      releaseId: 'rel-bundle',
      version: '1.1.0',
      sequence: 200,
      channel: 'stable',
      model: 'THUNDER 01',
      hardwareRevision: 'rdk-s100p',
      artifactSizeBytes: 12_000_000,
      artifactSha256: 'b'.repeat(64),
      artifactType: 'release_bundle',
      adminOnly: false,
    },
    {
      releaseId: 'rel-esp32',
      version: '2026.11.27',
      sequence: 205,
      channel: 'stable',
      model: 'THUNDER 01',
      hardwareRevision: 'rdk-s100p',
      artifactSizeBytes: 512_000,
      artifactSha256: 'c'.repeat(64),
      artifactType: 'component_release',
      component: 'fw-esp32',
      adminOnly: true,
    },
  ];
  const { primaryRelease, userReleases, adminHardwareReleases } = partitionFirmwareReleases(releases);
  assert.equal(primaryRelease?.releaseId, 'rel-bundle');
  assert.deepEqual(userReleases.map((r) => r.releaseId), ['rel-policy', 'rel-bundle']);
  assert.deepEqual(adminHardwareReleases.map((r) => r.releaseId), ['rel-esp32']);
  assert.equal(describeReleaseTitle(releases[1]), '整机系统更新');
  assert.equal(describeReleaseTitle(releases[2]), '外设板固件');
});

test('phase, byte, and online helpers format cleanly', () => {
  assert.equal(formatFirmwarePhase('downloading'), '下载中');
  assert.equal(formatFirmwarePhase('waiting_safe_window'), '待安全条件');
  assert.equal(formatFirmwarePhase('succeeded'), '更新完成');
  assert.equal(isTerminalOtaPhase('succeeded'), true);
  assert.equal(isTerminalOtaPhase('downloading'), false);
  assert.equal(canCancelOtaPhase('downloading'), true);
  assert.equal(canCancelOtaPhase('waiting_safe_window'), true);
  assert.equal(canCancelOtaPhase('installing'), false);
  assert.equal(formatFirmwareBytes(724464), '707 KB');
  assert.equal(formatFirmwareBytes(2 * 1024 * 1024), '2.0 MB');
  assert.equal(isDeviceOnlineFromStatus({ deviceId: '1', lastSeenAgeMs: 2154 }), true);
  assert.equal(isDeviceOnlineFromStatus({ deviceId: '1', lastSeenAgeMs: 120_000 }), false);
});

test('callFirmwareOtaEndpoint handles 403 firmware_admin_only and 200 responses', async () => {
  const ok = await callFirmwareOtaEndpoint(
    { action: 'devices' },
    {
      accessToken: 'tok-123',
      baseUrl: 'https://api-test.dosorobotics.com',
      publishableKey: 'anon',
      fetchImpl: async () =>
        new Response(JSON.stringify({ isAdmin: true, devices: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    },
  );
  assert.deepEqual(ok, { isAdmin: true, devices: [] });

  await assert.rejects(
    () =>
      callFirmwareOtaEndpoint(
        { action: 'start', deviceId: '13131313-1313-4131-8131-131313131313', releaseId: 'rel-bms', idempotencyKey: 'k1' },
        {
          accessToken: 'tok-123',
          baseUrl: 'https://api-test.dosorobotics.com',
          fetchImpl: async () =>
            new Response(JSON.stringify({ error: { code: 'firmware_admin_only', message: 'Admin required' } }), {
              status: 403,
              headers: { 'content-type': 'application/json' },
            }),
        },
      ),
    /仅管理员可升级底层固件/,
  );
});
