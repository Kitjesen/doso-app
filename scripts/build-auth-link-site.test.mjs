import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ANDROID_PACKAGE_NAME,
  AUTH_CALLBACK_PATHS,
  IOS_BUNDLE_ID,
  SCRUB_SCRIPT,
  SECURITY_HEADERS,
  buildAuthLinkSite,
  buildFallbackHtml,
  createAssociationDocuments,
  parseAndroidFingerprints,
  parseAppleTeamId,
} from './build-auth-link-site.mjs';
import { verifyDeployment } from '../link-host/verify-deployment.mjs';

const fingerprintA = '11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00';
const fingerprintB = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';

test('association documents use exact production identities and callback scopes', () => {
  const documents = createAssociationDocuments({
    appleTeamId: 'A1B2C3D4E5',
    androidFingerprints: `${fingerprintB}, ${fingerprintA};${fingerprintB.toLowerCase()}`,
  });

  assert.deepEqual(documents.apple, {
    applinks: {
      details: [{
        appIDs: [`A1B2C3D4E5.${IOS_BUNDLE_ID}`],
        components: AUTH_CALLBACK_PATHS.map((callbackPath) => ({ '/': callbackPath })),
      }],
    },
  });
  assert.deepEqual(documents.android, [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: ANDROID_PACKAGE_NAME,
      sha256_cert_fingerprints: [fingerprintA, fingerprintB],
    },
  }]);
  assert.equal(JSON.stringify(documents.apple), JSON.stringify(documents.apple));
});

test('identity inputs fail closed', () => {
  for (const value of [undefined, '', 'abc', 'a1b2c3d4e5', 'A1B2C3D4E!']) {
    assert.throws(() => parseAppleTeamId(value), /DOSO_APPLE_TEAM_ID/);
  }
  for (const value of [
    undefined,
    '',
    '11:22',
    'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
  ]) {
    assert.throws(() => parseAndroidFingerprints(value), /DOSO_ANDROID_APP_LINK_FINGERPRINTS|Invalid Android/);
  }
});

test('fallback pages scrub the browser URL without private-scheme or callback-data handling', () => {
  for (const callbackPath of AUTH_CALLBACK_PATHS) {
    const html = buildFallbackHtml(callbackPath);
    assert.match(html, new RegExp(`data-callback-path="${callbackPath}"`));
    assert.doesNotMatch(html, /doso:\/\//);
    assert.doesNotMatch(html, /location\.(?:search|hash)|URLSearchParams|access_token|refresh_token|[?&]code=/i);
  }
  assert.throws(() => buildFallbackHtml('/auth/callback/extra'), /Unsupported auth callback path/);
});

test('build emits canonical JSON and contains no fixture secrets or callback values', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'doso-auth-links-'));
  try {
    await buildAuthLinkSite({
      outputDir,
      appleTeamId: 'A1B2C3D4E5',
      androidFingerprints: `${fingerprintB}\n${fingerprintA}`,
    });

    const files = {
      apple: await readFile(path.join(outputDir, '.well-known', 'apple-app-site-association'), 'utf8'),
      android: await readFile(path.join(outputDir, '.well-known', 'assetlinks.json'), 'utf8'),
      callback: await readFile(path.join(outputDir, 'auth', 'callback.html'), 'utf8'),
      reset: await readFile(path.join(outputDir, 'auth', 'reset-password.html'), 'utf8'),
    };

    assert.equal(files.apple, `${JSON.stringify(JSON.parse(files.apple))}\n`);
    assert.equal(files.android, `${JSON.stringify(JSON.parse(files.android))}\n`);
    assert.match(files.callback, new RegExp(SCRUB_SCRIPT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(SCRUB_SCRIPT, /location\.(?:search|hash)|URLSearchParams|doso:\/\//);
    assert.match(files.callback, /data-callback-path="\/auth\/callback"/);
    assert.match(files.reset, /data-callback-path="\/auth\/reset-password"/);

    const publicOutput = Object.values(files).join('\n');
    for (const forbidden of [
      'client_secret',
      'service_role',
      'authorization_code',
      'access_token',
      'refresh_token',
      'code=fixture',
    ]) {
      assert.doesNotMatch(publicOutput, new RegExp(forbidden, 'i'));
    }
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('Vercel deployment is exact-path, no-store, no-referrer, and locked down', async () => {
  const config = JSON.parse(await readFile(new URL('../link-host/vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.buildCommand, 'node build.mjs');
  assert.deepEqual(config.rewrites, [
    { source: '/auth/callback', destination: '/auth/callback.html' },
    { source: '/auth/reset-password', destination: '/auth/reset-password.html' },
  ]);

  const globalHeaders = Object.fromEntries(
    config.headers.find(({ source }) => source === '/(.*)').headers.map(({ key, value }) => [key, value]),
  );
  assert.deepEqual(globalHeaders, SECURITY_HEADERS);

  for (const source of [
    '/.well-known/apple-app-site-association',
    '/.well-known/assetlinks.json',
  ]) {
    const contentType = config.headers
      .find((entry) => entry.source === source)
      .headers.find(({ key }) => key === 'Content-Type').value;
    assert.match(contentType, /^application\/json\b/);
  }
});

test('link-host builder runs when copied without any parent project files', async () => {
  const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), 'doso-link-host-isolated-'));
  try {
    await copyFile(new URL('../link-host/build.mjs', import.meta.url), path.join(isolatedRoot, 'build.mjs'));
    const result = spawnSync(process.execPath, ['build.mjs'], {
      cwd: isolatedRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DOSO_APPLE_TEAM_ID: 'A1B2C3D4E5',
        DOSO_ANDROID_APP_LINK_FINGERPRINTS: fingerprintA,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(isolatedRoot, 'dist', '.well-known', 'assetlinks.json'), 'utf8')),
      createAssociationDocuments({ appleTeamId: 'A1B2C3D4E5', androidFingerprints: fingerprintA }).android,
    );
    const source = await readFile(path.join(isolatedRoot, 'build.mjs'), 'utf8');
    assert.doesNotMatch(source, /from ['"]\.\.\//);
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test('failed staged write and failed publish swap both preserve existing output', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'doso-auth-links-atomic-'));
  const outputDir = path.join(root, 'dist');
  const sentinelPath = path.join(outputDir, 'existing.txt');
  try {
    await mkdir(outputDir);
    await writeFile(sentinelPath, 'old-output', 'utf8');
    await assert.rejects(() => buildAuthLinkSite({
      outputDir,
      appleTeamId: 'A1B2C3D4E5',
      androidFingerprints: fingerprintA,
      writeFileImpl: async (filename, ...args) => {
        if (filename.endsWith('callback.html')) throw new Error('injected write failure');
        return writeFile(filename, ...args);
      },
    }), /injected write failure/);
    assert.equal(await readFile(sentinelPath, 'utf8'), 'old-output');

    let renameCount = 0;
    await assert.rejects(() => buildAuthLinkSite({
      outputDir,
      appleTeamId: 'A1B2C3D4E5',
      androidFingerprints: fingerprintA,
      renameImpl: async (...args) => {
        renameCount += 1;
        if (renameCount === 2) throw new Error('injected swap failure');
        return rename(...args);
      },
    }), /injected swap failure/);
    assert.equal(await readFile(sentinelPath, 'utf8'), 'old-output');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('deployment verifier rejects wrong identities and probes exact route behavior', async () => {
  const deployedDocuments = createAssociationDocuments({
    appleTeamId: 'A1B2C3D4E5',
    androidFingerprints: `${fingerprintA},${fingerprintB}`,
  });
  const config = JSON.parse(await readFile(new URL('../link-host/vercel.json', import.meta.url), 'utf8'));
  const globalHeaders = Object.fromEntries(
    config.headers.find(({ source }) => source === '/(.*)').headers.map(({ key, value }) => [key, value]),
  );
  const requestedUrls = [];
  const fetchImpl = async (input) => {
    const requested = new URL(input);
    requestedUrls.push(requested);
    const headers = new Headers(globalHeaders);
    if (requested.pathname === '/.well-known/apple-app-site-association') {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(deployedDocuments.apple), { status: 200, headers });
    }
    if (requested.pathname === '/.well-known/assetlinks.json') {
      headers.set('Content-Type', 'application/json; charset=utf-8');
      return new Response(JSON.stringify(deployedDocuments.android), { status: 200, headers });
    }
    if (AUTH_CALLBACK_PATHS.includes(requested.pathname)) {
      headers.set('Content-Type', 'text/html; charset=utf-8');
      return new Response(buildFallbackHtml(requested.pathname), { status: 200, headers });
    }
    return new Response('not found', { status: 404, headers });
  };

  await verifyDeployment({
    origin: 'https://links.dosorobotics.com',
    appleTeamId: 'A1B2C3D4E5',
    androidFingerprints: `${fingerprintA},${fingerprintB}`,
    fetchImpl,
  });
  assert.ok(requestedUrls.some((url) => url.pathname === '/auth/callback' && url.searchParams.has('code')));
  assert.ok(requestedUrls.some((url) => url.pathname === '/auth/callback/'));
  assert.ok(requestedUrls.some((url) => url.pathname.includes('DOSO_QUERY_SENTINEL')));

  await assert.rejects(() => verifyDeployment({
    origin: 'https://links.dosorobotics.com',
    appleTeamId: 'Z9Y8X7W6V5',
    androidFingerprints: `${fingerprintA},${fingerprintB}`,
    fetchImpl,
  }), /match the supplied production identity exactly/);
  await assert.rejects(() => verifyDeployment({
    origin: 'https://links.dosorobotics.com',
    appleTeamId: 'A1B2C3D4E5',
    androidFingerprints: fingerprintA,
    fetchImpl,
  }), /match the supplied production identity exactly/);
});

test('deployment verifier rejects any additional CSP directive', async () => {
  const headers = new Headers({
    ...SECURITY_HEADERS,
    'Content-Security-Policy': `${SECURITY_HEADERS['Content-Security-Policy']}; connect-src https://evil.example`,
    'Content-Type': 'application/json; charset=utf-8',
  });
  await assert.rejects(() => verifyDeployment({
    origin: 'https://links.dosorobotics.com',
    appleTeamId: 'A1B2C3D4E5',
    androidFingerprints: fingerprintA,
    fetchImpl: async () => new Response('{}', { status: 200, headers }),
  }), /CSP must match the complete reviewed directive set/);
});
