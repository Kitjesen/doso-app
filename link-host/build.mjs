import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const AUTH_LINK_ORIGIN = 'https://links.dosorobotics.com';
export const IOS_BUNDLE_ID = 'com.doso.robot';
export const ANDROID_PACKAGE_NAME = 'com.doso.robot';
export const AUTH_CALLBACK_PATHS = Object.freeze(['/auth/callback', '/auth/reset-password']);
export const SCRUB_SCRIPT = `'use strict';
const callbackPath = document.documentElement.dataset.callbackPath;
if (callbackPath === '/auth/callback' || callbackPath === '/auth/reset-password') {
  window.history.replaceState(null, document.title, callbackPath);
}
`;
export const SCRUB_SCRIPT_SHA256 = createHash('sha256').update(SCRUB_SCRIPT).digest('base64');
export const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': `default-src 'none'; script-src 'sha256-${SCRUB_SCRIPT_SHA256}'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'accelerometer=(), bluetooth=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const KNOWN_NON_PRODUCTION_ANDROID_FINGERPRINTS = new Set([
  'FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C',
]);
const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const ANDROID_FINGERPRINT_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function parseAppleTeamId(value) {
  const teamId = value?.trim() ?? '';
  if (!TEAM_ID_PATTERN.test(teamId)) throw new Error('DOSO_APPLE_TEAM_ID must be the 10-character uppercase Apple Team ID.');
  return teamId;
}

export function parseAndroidFingerprints(value) {
  const candidates = (value ?? '').split(/[\n,;]/).map((entry) => entry.trim().toUpperCase()).filter(Boolean);
  if (candidates.length === 0) throw new Error('DOSO_ANDROID_APP_LINK_FINGERPRINTS must include at least one production SHA-256 certificate fingerprint.');
  for (const fingerprint of candidates) {
    if (!ANDROID_FINGERPRINT_PATTERN.test(fingerprint)) throw new Error(`Invalid Android SHA-256 certificate fingerprint: ${fingerprint || '(empty)'}`);
    if (KNOWN_NON_PRODUCTION_ANDROID_FINGERPRINTS.has(fingerprint)) throw new Error('DOSO_ANDROID_APP_LINK_FINGERPRINTS must not contain the repository QA/debug signing certificate.');
  }
  return [...new Set(candidates)].sort();
}

export function createAssociationDocuments({ appleTeamId, androidFingerprints }) {
  const teamId = parseAppleTeamId(appleTeamId);
  const fingerprints = parseAndroidFingerprints(androidFingerprints);
  return {
    apple: { applinks: { details: [{
      appIDs: [`${teamId}.${IOS_BUNDLE_ID}`],
      components: AUTH_CALLBACK_PATHS.map((callbackPath) => ({ '/': callbackPath })),
    }] } },
    android: [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: ANDROID_PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
    }],
  };
}

export function buildFallbackHtml(callbackPath) {
  if (!AUTH_CALLBACK_PATHS.includes(callbackPath)) throw new Error(`Unsupported auth callback path: ${callbackPath}`);
  const title = callbackPath === '/auth/reset-password' ? '继续重置密码' : '继续登录';
  return `<!doctype html>
<html lang="zh-CN" data-callback-path="${callbackPath}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Cache-Control" content="no-store">
  <title>DOSO · ${title}</title>
  <script>${SCRUB_SCRIPT}</script>
  <link rel="stylesheet" href="/auth-link.css">
</head>
<body>
  <main aria-labelledby="page-title">
    <p class="brand" aria-hidden="true">DOSO</p>
    <h1 id="page-title">${title}</h1>
    <p>此链接应直接在 DOSO App 中打开。请重新打开官方 App，并从刚才的操作重新尝试。</p>
    <p class="privacy">为保护账号信息，此页面不会显示、保存或转发回调内容。</p>
  </main>
</body>
</html>
`;
}

const stylesheet = `:root {
  color-scheme: light;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f5f5f3;
  color: #171714;
}
body { min-height: 100vh; margin: 0; display: grid; place-items: center; }
main { width: min(32rem, calc(100% - 3rem)); }
.brand { font-size: .75rem; font-weight: 700; letter-spacing: .22em; }
h1 { margin: 1.5rem 0 .75rem; font-size: clamp(2rem, 9vw, 3.5rem); line-height: 1; }
p { line-height: 1.65; }
.privacy { margin-top: 1.5rem; color: #62625c; font-size: .875rem; }
`;

async function pathExists(candidate) {
  try {
    await access(candidate, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function buildAuthLinkSite({ outputDir, appleTeamId, androidFingerprints, writeFileImpl = writeFile, renameImpl = rename }) {
  if (!outputDir) throw new Error('outputDir is required.');
  const documents = createAssociationDocuments({ appleTeamId, androidFingerprints });
  const resolvedOutput = path.resolve(outputDir);
  const parentDir = path.dirname(resolvedOutput);
  const baseName = path.basename(resolvedOutput);
  await mkdir(parentDir, { recursive: true });
  const stagingDir = await mkdtemp(path.join(parentDir, `.${baseName}.staging-`));
  const backupDir = path.join(parentDir, `.${baseName}.backup-${randomUUID()}`);
  let oldOutputMoved = false;
  try {
    const wellKnownDir = path.join(stagingDir, '.well-known');
    const authDir = path.join(stagingDir, 'auth');
    await mkdir(wellKnownDir, { recursive: true });
    await mkdir(authDir, { recursive: true });
    const writeResults = await Promise.allSettled([
      writeFileImpl(path.join(wellKnownDir, 'apple-app-site-association'), `${JSON.stringify(documents.apple)}\n`, 'utf8'),
      writeFileImpl(path.join(wellKnownDir, 'assetlinks.json'), `${JSON.stringify(documents.android)}\n`, 'utf8'),
      writeFileImpl(path.join(authDir, 'callback.html'), buildFallbackHtml('/auth/callback'), 'utf8'),
      writeFileImpl(path.join(authDir, 'reset-password.html'), buildFallbackHtml('/auth/reset-password'), 'utf8'),
      writeFileImpl(path.join(stagingDir, 'auth-link.css'), stylesheet, 'utf8'),
    ]);
    const writeFailure = writeResults.find((result) => result.status === 'rejected');
    if (writeFailure) throw writeFailure.reason;
    if (await pathExists(resolvedOutput)) {
      await renameImpl(resolvedOutput, backupDir);
      oldOutputMoved = true;
    }
    try {
      await renameImpl(stagingDir, resolvedOutput);
    } catch (error) {
      if (oldOutputMoved) await renameImpl(backupDir, resolvedOutput);
      oldOutputMoved = false;
      throw error;
    }
    if (oldOutputMoved) await rm(backupDir, { recursive: true, force: true });
    return documents;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export async function runBuildFromEnvironment(environment = process.env) {
  const linkHostRoot = fileURLToPath(new URL('.', import.meta.url));
  await buildAuthLinkSite({
    outputDir: path.join(linkHostRoot, 'dist'),
    appleTeamId: environment.DOSO_APPLE_TEAM_ID,
    androidFingerprints: environment.DOSO_ANDROID_APP_LINK_FINGERPRINTS,
  });
  console.log(`DOSO auth link site built for ${AUTH_LINK_ORIGIN}`);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) await runBuildFromEnvironment();
