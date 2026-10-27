import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { SECURITY_HEADERS } from '../link-host/build.mjs';

const require = createRequire(import.meta.url);

async function readOptional(url) {
  try {
    return await readFile(url, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

const [
  webService,
  nativeService,
  appleCore,
  authingBrokerCore,
  packageManifest,
  appSource,
  buttons,
  nativeButtons,
  webButtons,
  register,
  appConfig,
  appleArtwork,
  authService,
  androidManifest,
  androidBuild,
  supabaseConfig,
  envExample,
  androidConfigPlugin,
  authRedirectSource,
  easConfig,
  authLinkBuilder,
  authLinkVercelConfig,
  figmaSocialSpec,
] = await Promise.all([
  readFile(new URL('../src/services/socialAuthService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/socialAuthService.native.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/appleAuthCore.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/authingBrokerCore.ts', import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/SocialLoginButtons.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/SocialLoginButtons.native.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/SocialLoginButtons.web.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/RegisterScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../app.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../src/components/appleSignInArtwork.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/authService.ts', import.meta.url), 'utf8'),
  readOptional(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url)),
  readOptional(new URL('../android/app/build.gradle', import.meta.url)),
  readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../plugins/withLocalSupabaseCleartext.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/authRedirect.ts', import.meta.url), 'utf8'),
  readFile(new URL('../eas.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../link-host/build.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../link-host/vercel.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('./figma-social-auth-ux-scripter.js', import.meta.url), 'utf8'),
]);

const service = `${webService}\n${nativeService}\n${appleCore}\n${authingBrokerCore}`;
const buttonSources = `${buttons}\n${nativeButtons}\n${webButtons}`;

// These assertions deliberately inspect wiring contracts only. They do not prove provider
// credentials, hosted configuration, OAuth security, or successful device behavior.
assert.match(service, /EXPO_PUBLIC_APPLE_AUTH_ENABLED/, 'Apple login is controlled by an explicit public feature flag');
assert.match(service, /EXPO_PUBLIC_WECHAT_AUTH_ENABLED/, 'WeChat login is controlled by an explicit public feature flag');
assert.match(service, /EXPO_PUBLIC_QQ_AUTH_ENABLED/, 'QQ login is controlled by an explicit public feature flag');
assert.match(nativeService, /signInWithIdToken\(credentials\)/, 'native Apple identity tokens are exchanged through Supabase');
assert.match(appleCore, /authorizationCode[\s\S]*access_token/, 'iOS Apple authorization code follows the Supabase ID-token exchange contract');
assert.match(appleCore, /nonce:\s*secrets\.rawNonce/, 'Supabase receives the raw nonce while Apple receives its hash');
assert.match(nativeService, /getCredentialStateAsync[\s\S]*AUTHORIZED/, 'iOS Apple login rejects credentials that are no longer authorized');
assert.match(nativeService, /addRevokeListener/, 'native Apple auth uses the Expo revoke listener');
assert.match(webService, /buildAppleOAuthArguments/, 'web Apple login routes through the exact Supabase Apple OAuth contract');
assert.match(nativeService, /Platform\.OS !== ['"]ios['"][\s\S]*signInWithOAuthProvider\(['"]apple['"][\s\S]*signInWithNativeAppleIdToken/, 'native Apple routing uses Expo on iOS and Supabase OAuth on Android');
assert.match(nativeService, /SecureStore\.setItemAsync[\s\S]*exchangeIdToken/, 'first-login Apple name attempts durable staging before the Supabase exchange');
assert.match(appleCore, /stageDisplayMetadata[\s\S]*catch[\s\S]*exchangeIdToken/, 'staging failure cannot prevent the Supabase exchange');
assert.match(appleCore, /needs-confirmation[\s\S]*suggestedDisplayName/, 'double metadata failure produces a presentation-only recovery outcome');
assert.match(nativeService, /SecureStore\.deleteItemAsync/, 'staged Apple name is cleared only after metadata sync or invalid staging cleanup');
assert.match(service, /signInWithOAuth/, 'brokered social providers use the Supabase OAuth flow');
assert.match(authingBrokerCore, /provider-id-missing-or-invalid/, 'missing custom provider identifiers are treated as a local readiness blocker');
assert.doesNotMatch(service, /value\?\.trim\(\) \|\| ['"]custom:/, 'custom provider identifiers never silently fall back when configuration is missing');
assert.match(service, /custom_provider_not_found/, 'missing Supabase custom OIDC providers produce an actionable error');
assert.match(service, /Authing OIDC broker/, 'WeChat and QQ readiness errors name the required OIDC broker');
assert.match(service, /以 custom: 开头/, 'invalid custom provider identifiers explain the accepted format');
assert.match(service, /EXPO_PUBLIC_WECHAT_SUPABASE_PROVIDER/, 'the WeChat broker provider identifier is configurable');
assert.match(service, /EXPO_PUBLIC_QQ_SUPABASE_PROVIDER/, 'the QQ broker provider identifier is configurable');
assert.match(webService, /from ['"]\.\/authingBrokerCore['"]/, 'web broker routing uses the shared pure core');
assert.match(nativeService, /from ['"]\.\/authingBrokerCore['"]/, 'native broker routing uses the shared pure core');
assert.match(authingBrokerCore, /provider-route-collision/, 'shared-provider collisions are a stable readiness blocker');
assert.match(authingBrokerCore, /provider-route-mismatch/, 'database canonical-key mismatches are a stable readiness blocker');
assert.match(authingBrokerCore, /interpretSocialBrowserResult/, 'all browser social login results use the exact callback classifier');
assert.match(authingBrokerCore, /callback\.pathname === expected\.pathname/, 'social callbacks require the exact canonical callback path');
assert.match(webService, /interpretSocialBrowserResult\(result, redirectTo\)/, 'web browser social login rejects password-reset and unknown callback paths');
assert.match(nativeService, /interpretSocialBrowserResult\(result, redirectTo\)/, 'native browser social login rejects password-reset and unknown callback paths');
assert.match(nativeService, /AppleAuthenticationScope\.FULL_NAME[\s\S]*AppleAuthenticationScope\.EMAIL/, 'iOS requests first-login full name and email');
assert.match(appleCore, /display_name/, 'Apple name is profile presentation metadata');
assert.doesNotMatch(service, /auth\.updateUser\(\{ data: metadata \}\)/, 'Apple name recovery never uses an unscoped auth metadata write');
assert.doesNotMatch(nativeService, /\.from\(['"]profiles['"]\)[\s\S]*\.update\(/, 'native Apple sign-in never writes profiles before terminal preparation');
assert.match(nativeService, /getPendingAppleDisplayName[\s\S]*SecureStore\.getItemAsync/, 'native Apple staging can be restored after terminal preparation');
assert.doesNotMatch(appleCore, /username\s*:/, 'Apple name is never assigned as the DOSO username');
assert.doesNotMatch(service, /console\.(?:log|debug|info|warn|error)/, 'social-auth services never log tokens, codes, nonces, or provider responses');

for (const [platform, source] of [['native', nativeService], ['web/fallback', webService]]) {
  assert.match(source, /export type SocialLoginReadiness\s*=\s*\{/, `${platform} exports a structured readiness diagnostic`);
  assert.match(source, /enabled:\s*boolean/, `${platform} readiness reports the feature flag`);
  assert.match(source, /platformSupported:\s*boolean/, `${platform} readiness reports platform capability`);
  assert.match(source, /providerIdPresent:\s*boolean/, `${platform} readiness reports provider identifier presence`);
  assert.match(source, /serviceIdPresent:\s*boolean\s*\|\s*null/, `${platform} readiness reports service identifier presence when applicable`);
  assert.match(source, /redirectUriPresent:\s*boolean\s*\|\s*null/, `${platform} readiness reports redirect URI presence when applicable`);
  assert.match(source, /blockerCodes:\s*readonly SocialLoginReadinessBlocker\[\]/, `${platform} readiness returns stable blocker codes`);
  assert.match(source, /ready:\s*blockerCodes\.length\s*===\s*0/, `${platform} readiness is false whenever a blocker exists`);
  assert.match(source, /getSocialLoginReadiness\(provider\)/, `${platform} sign-in checks the same readiness contract used by the UI`);
}
assert.match(webService, /provider === ['"]apple['"][\s\S]*getAuthingBrokerReadiness/, 'web provider routing recognizes Apple and validated custom broker IDs');
assert.equal(packageManifest.dependencies['expo-apple-authentication'], '~57.0.1', 'Expo Apple auth is SDK 57 compatible');
assert.equal(packageManifest.dependencies['expo-crypto'], '~57.0.2', 'Expo Crypto is SDK 57 compatible');
for (const dependency of ['@invertase/react-native-apple-authentication', 'uuid', 'react-native-get-random-values']) {
  assert.equal(packageManifest.dependencies[dependency], undefined, `${dependency} is absent from direct dependencies`);
}

assert.match(buttons, /apple/, 'the social-login component includes Apple');
assert.match(buttons, /weixin/, 'the social-login component includes WeChat');
assert.match(buttons, /qq/, 'the social-login component includes QQ');
assert.equal(nativeButtons, buttons, 'native social-login UX stays byte-for-byte aligned with the shared implementation');
assert.equal(webButtons, buttons, 'web social-login UX stays byte-for-byte aligned with the shared implementation');
assert.doesNotMatch(buttons, /<Text|待配置/, 'social-login buttons do not render visible labels or setup text');
assert.match(buttons, /buttonRow:\s*\{\s*alignItems:\s*['"]center['"][\s\S]*?flexDirection:\s*['"]row['"][\s\S]*?\}/, 'all social-login icons share one centered horizontal row');
assert.match(buttons, /brandMark:[\s\S]*?height:\s*44[\s\S]*?width:\s*44/, 'Apple, WeChat, and QQ share one optical artwork canvas');
assert.match(buttons, /brandMarkPlate:[\s\S]*?backgroundColor:\s*['"]#FFFFFF['"][\s\S]*?borderRadius:\s*12/, 'font glyph brands use the same visible plate geometry as the official Apple artwork');
assert.match(buttons, /button:[\s\S]*?borderRadius:\s*18[\s\S]*?borderWidth:\s*2[\s\S]*?height:\s*56[\s\S]*?width:\s*56/, 'each icon keeps an equal touch target and persistent selection ring');
assert.match(buttons, /appleButtonArtworkDisabled:[\s\S]*?opacity:\s*0\.28/, 'unconfigured Apple login keeps the official artwork while matching the disabled gray tone');
assert.match(buttons, /brandMarkDisabled:[\s\S]*?opacity:\s*0\.28/, 'unconfigured WeChat and QQ plates use the same disabled compositing as Apple');
assert.match(buttons, /buttonDisabled:[\s\S]*?opacity:\s*1/, 'disabled social-login icons remain legible instead of stacking color and opacity reductions');
assert.match(buttons, /hitSlop=\{10\}/, 'pure icon actions keep a forgiving invisible hit area');
assert.match(buttons, /accessibilityLabel=/, 'icon-only social-login buttons retain accessible labels');
assert.match(buttons, /accessibilityHint=/, 'icon-only social-login buttons explain their action and setup state');
assert.match(buttons, /activeProvider\?:\s*SocialLoginProvider\s*\|\s*null/, 'social-login selection is controlled by the parent flow');
assert.match(buttons, /const selected = busy && readiness\.ready && activeProvider === provider\.id/, 'selection exists only for a ready provider during an active authorization operation');
assert.match(buttons, /accessibilityState=\{\{\s*disabled,\s*busy:\s*selected,\s*selected\s*\}\}/, 'assistive technology receives the same disabled state enforced by the press target');
assert.match(buttons, /const accessibilityStatus = unavailable[\s\S]*?selected[\s\S]*?busy[\s\S]*?['"]可用['"]/, 'assistive technology distinguishes unavailable, selected, and temporarily locked providers');
assert.match(buttons, /accessibilityValue=\{\{ text: accessibilityStatus \}\}/, 'the computed social-login status is exposed consistently');
assert.match(buttons, /accessibilityHint=\{unavailable[\s\S]*?: selected\s*\? '正在打开授权'[\s\S]*?: busy\s*\? '正在处理其他登录方式'/, 'the selected provider hint describes its own authorization instead of another provider');
assert.match(buttons, /selected\s*\?\s*<ActivityIndicator/, 'the selected provider keeps a visible authorization-in-progress indicator');
assert.match(buttons, /buttonSelected:[\s\S]*?elevation:\s*3[\s\S]*?scale:\s*1\.03/, 'the selected provider keeps a persistent ring, lift, and scale treatment');
assert.match(buttons, /disabled\s*&&\s*!selected\s*&&\s*styles\.buttonDisabled/, 'the active provider remains visually emphasized while the other providers dim');
assert.match(buttons, /selectedBorderDark/, 'dark mode uses an explicit provider-aware selection border');
assert.match(buttons, /color=\{disabledVisual\s*\?\s*['"]#111111['"]\s*:\s*provider\.color\}/, 'disabled marks share a neutral treatment while ready and selected marks keep official brand colors');
assert.match(appSource, /if \(accountBusy \|\| socialLoginInFlightRef\.current\) return;/, 'the social-login handler rejects rapid duplicate and cross-flow invocations');
assert.match(appSource, /socialLoginInFlightRef\.current = true;[\s\S]*setActiveSocialProvider\(provider\);[\s\S]*await socialAuthService\.signIn\(provider\)/, 'the selected provider and in-flight guard are established before authorization starts');
assert.match(appSource, /finally \{[\s\S]*socialLoginInFlightRef\.current = false;[\s\S]*setActiveSocialProvider\(null\);[\s\S]*setAccountBusy\(false\);[\s\S]*\}/, 'success, callback, cancellation, and error paths clear the social selection and busy state');
assert.match(buttonSources, /getSocialLoginReadiness\(provider\.id\)/, 'icon availability is driven by structured readiness diagnostics');
assert.match(buttonSources, /readiness\.blockerMessage/, 'disabled icon accessibility hints expose a concise readiness blocker');
for (const [platform, source] of [['native', nativeButtons], ['web', webButtons], ['fallback', buttons]]) {
  assert.match(source, /icon:\s*null/, `${platform} never substitutes a font glyph for the official Apple artwork`);
  assert.match(source, /<Image[\s\S]*APPLE_LOGO_ONLY_DATA_URI/, `${platform} renders the bundled official Apple logo-only artwork as an image`);
  assert.match(source, /activeProvider:\s*parentActiveProvider\s*=\s*null/, `${platform} supports the controlled provider selection state`);
  assert.match(source, /<ActivityIndicator/, `${platform} renders provider-specific pending feedback`);
  assert.doesNotMatch(source, /<Text|待配置/, `${platform} social-login row contains icons only`);
}
assert.match(appleArtwork, /https:\/\/appleid\.cdn-apple\.com\/appleid\/button\/logo\?size=44/, 'the bundled artwork records its official Apple Button API source');
assert.match(appleArtwork, /data:image\/png;base64,/, 'the official Apple artwork is bundled instead of fetched at runtime');
assert.doesNotMatch(buttonSources, /https:\/\/appleid\.cdn-apple\.com/, 'social-login rendering has no runtime Apple CDN dependency');
assert.match(figmaSocialSpec, /DOSO · Auth Social UX · Source Sync/, 'the prepared Figma source-sync script uses a stable idempotent section name');
assert.match(figmaSocialSpec, /Social Provider Row \/ gap 20/, 'the Figma social-state spec shares the 20 px row gap contract');
assert.match(figmaSocialSpec, /'NONE', 56, 56/, 'the Figma social-state spec shares the 56 px touch-target contract');
assert.match(figmaSocialSpec, /Brand Mark \/ 44/, 'the Figma social-state spec shares the 44 px optical-canvas contract');
assert.match(figmaSocialSpec, /selected=true · busy=true · disabled=true/, 'the Figma selected-busy state matches the disabled production press target');
assert.match(figmaSocialSpec, /existing\.children\.every/, 'the generated social section is ownership-checked before an in-place update');
assert.match(figmaSocialSpec, /\[\.\.\.section\.children\]\.forEach\(\(child\) => child\.remove\(\)\)/, 'stale generated social states are replaced instead of silently skipped');
for (const stateName of [
  'Production Default · Light',
  'WeChat Selected Busy · Light',
  'QQ Selected Busy · Dark',
  'Apple Selected Busy · Landscape',
]) {
  assert.match(figmaSocialSpec, new RegExp(stateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `the Figma social-state spec includes ${stateName}`);
}
assert.match(figmaSocialSpec, /当前均未配置/, 'the Figma production specimen preserves the current unavailable provider truth');
assert.match(figmaSocialSpec, /静态状态稿不代表 Apple 登录已在当前环境开放/, 'the Figma selected-state specimen does not misrepresent live provider availability');
assert.match(webService, /maybeCompleteAuthSession\(\)/, 'web OAuth callbacks complete and close the auth session');

assert.match(register, /label="用户名"/, 'registration labels the account name as 用户名');
assert.match(
  register,
  /hint="3–24 位"[\s\S]*placeholder="字母、数字或下划线"/,
  'registration keeps explicit username guidance in both compact landscape and portrait layouts',
);
assert.doesNotMatch(register, /label="姓名"|placeholder="请输入姓名"/, 'registration no longer calls the username 姓名');
assert.match(register, /getSocialLoginReadiness\(provider\)\.ready/, 'redesigned registration retains the production readiness guard at the action boundary');
assert.match(register, /onSocialLogin\(provider\)/, 'redesigned registration retains the existing production callback');

assert.equal(appConfig.expo?.ios?.usesAppleSignIn, true, 'Expo iOS configuration enables Sign in with Apple');
assert.ok(appConfig.expo?.plugins?.includes('expo-apple-authentication'), 'Expo config installs the Apple authentication plugin');
assert.ok(appConfig.expo?.plugins?.includes('expo-web-browser'), 'Expo config includes the web-browser plugin for OAuth callbacks');

const productionLinkOrigin = 'https://links.dosorobotics.com';
const expectedCallbackPaths = ['/auth/callback', '/auth/reset-password'];
assert.deepEqual(
  appConfig.expo?.ios?.associatedDomains,
  ['applinks:links.dosorobotics.com'],
  'Expo iOS claims only the canonical production Universal Link host',
);
const appLinkFilter = appConfig.expo?.android?.intentFilters?.find((filter) => filter.autoVerify === true);
assert.ok(appLinkFilter, 'Expo Android declares an auto-verified App Link filter');
assert.equal(appLinkFilter.action, 'VIEW', 'the Android App Link filter handles VIEW actions');
assert.deepEqual(
  new Set(appLinkFilter.category),
  new Set(['BROWSABLE', 'DEFAULT']),
  'the Android App Link filter has the required categories',
);
assert.deepEqual(
  appLinkFilter.data,
  expectedCallbackPaths.map((path) => ({ scheme: 'https', host: 'links.dosorobotics.com', path })),
  'Expo Android claims only the two exact production callback paths',
);

for (const path of expectedCallbackPaths) {
  assert.match(supabaseConfig, new RegExp(`"${productionLinkOrigin}${path}"`), `local Supabase allows exact redirect ${path}`);
}

assert.match(authLinkBuilder, /DOSO_APPLE_TEAM_ID/, 'verified-link build requires a real Apple Team ID');
assert.match(authLinkBuilder, /DOSO_ANDROID_APP_LINK_FINGERPRINTS/, 'verified-link build requires production Android signing fingerprints');
assert.match(authLinkBuilder, /KNOWN_NON_PRODUCTION_ANDROID_FINGERPRINTS/, 'verified-link build rejects known QA/debug signing identity');
assert.doesNotMatch(authLinkBuilder, /doso:\/\//, 'browser fallback generation cannot invoke the private development scheme');
assert.equal(authLinkVercelConfig.buildCommand, 'node build.mjs', 'the Vercel deployment root uses its self-contained builder');
assert.deepEqual(
  authLinkVercelConfig.rewrites,
  expectedCallbackPaths.map((path) => ({ source: path, destination: `${path}.html` })),
  'the static link host exposes the two exact browser fallback routes',
);
const authLinkGlobalHeaders = Object.fromEntries(
  authLinkVercelConfig.headers
    .find(({ source }) => source === '/(.*)')
    .headers.map(({ key, value }) => [key.toLowerCase(), value]),
);
assert.deepEqual(
  authLinkGlobalHeaders,
  Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([key, value]) => [key.toLowerCase(), value])),
  'the Vercel deployment must exactly match the canonical complete security-header contract',
);

assert.match(envExample, /^# Production CI\/EAS must inject: EXPO_PUBLIC_AUTH_LINK_ORIGIN=https:\/\/links\.dosorobotics\.com$/m, 'local environment template documents but does not activate the canonical production Link origin');
assert.doesNotMatch(envExample, /^EXPO_PUBLIC_AUTH_LINK_ORIGIN=/m, 'local native development keeps the production Link origin unset');
for (const providerFlag of [
  'EXPO_PUBLIC_APPLE_AUTH_ENABLED',
  'EXPO_PUBLIC_WECHAT_AUTH_ENABLED',
  'EXPO_PUBLIC_QQ_AUTH_ENABLED',
]) {
  assert.match(envExample, new RegExp(`^${providerFlag}=false$`, 'm'), `${providerFlag} remains disabled in the tracked template`);
}
assert.doesNotMatch(envExample, /EXPO_PUBLIC_APPLE_AUTH_(?:SERVICE_ID|REDIRECT_URI)/, 'Apple Services ID and callback remain server/dashboard configuration');
assert.match(authService, /process\.env\.EXPO_PUBLIC_AUTH_LINK_ORIGIN/, 'auth redirect generation reads the configured Link origin');
assert.match(authService, /buildAuthRedirectUrl/, 'auth redirect generation delegates to the tested pure redirect module');
assert.match(authService, /parseAuthCallbackKind/, 'auth callback parsing delegates to the tested pure redirect module');

const transpiledAuthRedirect = ts.transpileModule(authRedirectSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(
  transpiledAuthRedirect.diagnostics?.length ?? 0,
  0,
  'pure auth redirect module transpiles without diagnostics',
);
const authRedirect = await import(
  `data:text/javascript;base64,${Buffer.from(transpiledAuthRedirect.outputText).toString('base64')}`
);
const productionEnvironment = { configuredOrigin: productionLinkOrigin };
assert.equal(authRedirect.buildAuthRedirectUrl('callback', productionEnvironment), `${productionLinkOrigin}/auth/callback`);
assert.equal(authRedirect.buildAuthRedirectUrl('reset-password', productionEnvironment), `${productionLinkOrigin}/auth/reset-password`);
assert.equal(authRedirect.buildAuthRedirectUrl('callback'), 'doso://auth/callback');
assert.equal(authRedirect.buildAuthRedirectUrl('callback', { webOrigin: 'http://localhost:8081' }), 'http://localhost:8081/auth/callback');
for (const [url, kind] of [
  [`${productionLinkOrigin}/auth/callback?code=one`, 'callback'],
  [`${productionLinkOrigin}/auth/reset-password?code=two`, 'reset-password'],
  ['doso://auth/callback?code=three', 'callback'],
  ['doso://auth/reset-password?code=four', 'reset-password'],
  ['http://localhost:8081/auth/callback?code=five', 'callback'],
]) {
  const environment = url.startsWith('http://localhost') ? { webOrigin: 'http://localhost:8081' } : productionEnvironment;
  assert.equal(authRedirect.parseAuthCallbackKind(url, environment), kind, `accepts exact callback ${url}`);
}
for (const url of [
  'https://evil.example/auth/callback?code=x',
  'http://links.dosorobotics.com/auth/callback?code=x',
  'https://links.dosorobotics.com:444/auth/callback?code=x',
  'https://links.dosorobotics.com/auth/callback/extra?code=x',
  'https://links.dosorobotics.com/auth/callback-evil?code=x',
  'https://user:pass@links.dosorobotics.com/auth/callback?code=x',
  'doso://auth:444/callback?code=x',
  'doso://evil/callback?code=x',
  'not a url',
]) {
  assert.equal(authRedirect.parseAuthCallbackKind(url, productionEnvironment), null, `rejects callback ${url}`);
}
for (const invalidOrigin of [
  'http://links.dosorobotics.com',
  'https://evil.example',
  'https://links.dosorobotics.com:444',
  'https://links.dosorobotics.com/path',
  'https://links.dosorobotics.com?query=1',
  'https://links.dosorobotics.com#fragment',
  'https://user:pass@links.dosorobotics.com',
  'not an origin',
]) {
  assert.throws(() => authRedirect.parseConfiguredAuthLinkOrigin(invalidOrigin), /EXPO_PUBLIC_AUTH_LINK_ORIGIN/);
}

const productionBuildGuard = require('../plugins/withLocalSupabaseCleartext.js');
assert.equal(
  productionBuildGuard.DOSO_PRODUCTION_AUTH_LINK_ORIGIN,
  productionLinkOrigin,
  'native build guard and runtime callback module share the canonical production origin',
);
assert.doesNotThrow(
  () => productionBuildGuard.assertProductionAuthLinkOrigin(false, undefined),
  'local and QA builds may omit the production origin',
);
assert.doesNotThrow(
  () => productionBuildGuard.assertProductionAuthLinkOrigin(true, productionLinkOrigin),
  'production builds accept the exact canonical origin',
);
for (const invalidProductionOrigin of [undefined, '', 'http://links.dosorobotics.com', 'https://evil.example']) {
  assert.throws(
    () => productionBuildGuard.assertProductionAuthLinkOrigin(true, invalidProductionOrigin),
    /DOSO production builds require EXPO_PUBLIC_AUTH_LINK_ORIGIN=/,
    `production build rejects origin ${String(invalidProductionOrigin)}`,
  );
}
assert.ok(easConfig.build?.production, 'EAS has an explicit production build profile');
assert.equal(easConfig.build?.qa?.distribution, 'internal', 'EAS QA profile is internal-only');
assert.equal(
  easConfig.build?.qa?.android?.gradleCommand,
  ':app:assembleQa',
  'EAS Android QA builds the isolated standalone QA variant instead of the production release variant',
);

assert.equal(Boolean(androidManifest), Boolean(androidBuild), 'generated Android manifest and Gradle files are either both present after prebuild or both absent in a clean checkout');
if (androidManifest && androidBuild) {
  assert.match(androidManifest, /<intent-filter>[\s\S]*?<data android:scheme="doso"\/>[\s\S]*?<\/intent-filter>/, 'generated Android manifest retains the private development scheme');
  const verifiedManifestFilter = androidManifest.match(/<intent-filter[^>]*android:autoVerify="true"[^>]*>([\s\S]*?)<\/intent-filter>/)?.[1] ?? '';
  assert.ok(verifiedManifestFilter, 'generated Android manifest contains a separate verified HTTPS filter');
  assert.match(verifiedManifestFilter, /android:scheme="https"/, 'verified Android filter requires HTTPS');
  assert.match(verifiedManifestFilter, /android:host="links\.dosorobotics\.com"/, 'verified Android filter uses the canonical host');
  for (const path of expectedCallbackPaths) {
    assert.match(verifiedManifestFilter, new RegExp(`android:path="${path}"`), `verified Android filter declares exact path ${path}`);
  }

  const generatedGroundwork = androidBuild.match(/\/\/ DOSO_ANDROID_RELEASE_GROUNDWORK_START([\s\S]*?)\/\/ DOSO_ANDROID_RELEASE_GROUNDWORK_END/)?.[1] ?? '';
  assert.ok(generatedGroundwork, 'generated Android Gradle contains the durable release groundwork block');
  assert.equal((androidBuild.match(/DOSO_ANDROID_RELEASE_GROUNDWORK_START/g) ?? []).length, 1, 'generated Android Gradle contains exactly one release groundwork block');
  assert.match(generatedGroundwork, /release\s*\{[\s\S]*signingConfig dosoMissingProductionSigningEnv\.isEmpty\(\) \? signingConfigs\.production : null/, 'the final generated release rule overrides and clears Expo debug signing');
  assert.match(generatedGroundwork, /gradle\.taskGraph\.whenReady[\s\S]*hasReleaseTask[\s\S]*throw new GradleException/, 'release tasks fail explicitly when production signing is missing');
  assert.match(generatedGroundwork, /hasReleaseTask[\s\S]*dosoProductionAuthLinkOrigin != dosoRequiredProductionAuthLinkOrigin[\s\S]*throw new GradleException/, 'release tasks fail explicitly when the production HTTPS origin is missing or wrong');
  assert.match(generatedGroundwork, /qa\s*\{[\s\S]*initWith release[\s\S]*signingConfig signingConfigs\.debug[\s\S]*matchingFallbacks = \["release"\]/, 'QA builds bundle release behavior while remaining locally installable with the debug key');
}
assert.match(androidConfigPlugin, /withAppBuildGradle/, 'tracked Expo config plugin owns durable Android Gradle generation');
assert.match(androidConfigPlugin, /DOSO_ANDROID_RELEASE_GROUNDWORK_START/, 'tracked Android Gradle injection is idempotently marked');
assert.match(androidConfigPlugin, /signingConfig dosoMissingProductionSigningEnv\.isEmpty\(\) \? signingConfigs\.production : null/, 'generated releases explicitly clear the debug signing fallback');
assert.match(androidConfigPlugin, /qa \{[\s\S]*initWith release[\s\S]*applicationIdSuffix "\.qa"[\s\S]*matchingFallbacks = \["release"\]/, 'tracked plugin durably generates a standalone release-like QA build type');
assert.doesNotMatch(androidConfigPlugin, /debuggableVariants[\s\S]*qa/, 'QA builds embed their JavaScript bundle instead of requiring a Metro server');
assert.doesNotMatch(androidConfigPlugin, /CMAKE_OBJECT_PATH_MAX/, 'tracked app configuration does not carry a machine-specific Windows path workaround');
assert.match(androidConfigPlugin, /EAS_BUILD_PROFILE[\s\S]*production[\s\S]*EXPO_PUBLIC_AUTH_LINK_ORIGIN/, 'EAS production prebuild enforces the canonical HTTPS origin on iOS and Android');
for (const variable of [
  'DOSO_ANDROID_KEYSTORE_PATH',
  'DOSO_ANDROID_KEYSTORE_PASSWORD',
  'DOSO_ANDROID_KEY_ALIAS',
  'DOSO_ANDROID_KEY_PASSWORD',
]) {
  assert.match(androidConfigPlugin, new RegExp(`System\\.getenv\\('${variable}'\\)`), `tracked Android signing reads ${variable} only from the environment`);
}

console.log('DOSO social-auth wiring and callback behavior guard PASS (provider E2E/security review still required)');
