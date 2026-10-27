import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [source, liveVerifier, homeTruthSync] = await Promise.all([
  readFile(new URL('./figma-source-sync-scripter-min.js', import.meta.url), 'utf8'),
  readFile(new URL('./figma-source-sync-scripter-verify.js', import.meta.url), 'utf8'),
  readFile(new URL('./figma-home-truth-scripter.js', import.meta.url), 'utf8'),
]);

const expectedPageIds = [
  'auth-email-otp',
  'auth-forgot-password',
  'auth-reset-password',
  'auth-username',
  'auth-display-name',
  'auth-mfa',
  'device-bind',
  'device-ble-discovery',
  'device-provisioning',
  'device-firmware',
  'account-security',
];
const generatedPageIds = [...source.matchAll(/^\s{4}\['([^']+)',/gm)].map((match) => match[1]);
assert.deepEqual(generatedPageIds, expectedPageIds, 'the canonical generator owns exactly the 11 acceptance page IDs in order');
assert.match(source, /^\/\/[^\n]*\n(?:\/\/[^\n]*\n)*\s*await \(async \(\) => \{\s*async function main\(\)/, 'the generator uses an isolated async scope so Scripter can rerun it after earlier scripts');
assert.match(liveVerifier, /^\/\/[^\n]*\n(?:\/\/[^\n]*\n)*\s*await \(async \(\) => \{\s*const SECTION_NAME/, 'the live verifier uses an isolated async scope so it can run after the generator in one Scripter session');
assert.doesNotMatch(source, /setVariableCodeSyntax/, 'the generator avoids Scripter-incompatible code syntax expressions');
assert.match(homeTruthSync, /\['34%', '—'\]/, 'home truth sync removes the combined fake battery percentage');
assert.match(homeTruthSync, /const normalize = \(value\) => value\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)/, 'home truth sync handles wrapped Figma text');
assert.match(homeTruthSync, /statusCard\.x \+= 48/, 'home landscape models the measured Android left safe-area inset');
assert.match(homeTruthSync, /recallSurface\.resize\(321, recallSurface\.height\)/, 'home landscape contracts the action surface to the measured post-inset width');
assert.match(homeTruthSync, /const targetXs = \[437, 549, 660\]/, 'home quick cards use the measured post-safe-area positions');

const tokenBlock = source.match(/const tokens = \{([\s\S]*?)\n  \};/);
assert.ok(tokenBlock, 'theme token block must exist');
const tokenNames = [...tokenBlock[1].matchAll(/^\s{4}([A-Za-z][A-Za-z0-9]*):/gm)].map((match) => match[1]);
assert.deepEqual(tokenNames, [
  'background', 'surface', 'subtle', 'text', 'muted', 'border',
  'accent', 'accentText', 'accentInk', 'warning', 'dangerSurface', 'dangerText',
], 'the canonical generator owns the 12 tokens required by the live verifier');

assert.doesNotMatch(source, /刷新账户状态|刷新真实服务状态/, 'Figma must not expose a product action that does not exist in the App');
assert.match(source, /真实账户状态读取中 · 操作禁用/, 'account security uses a truthful loading state');
assert.match(source, /待读取未启用 \/ AAL1 \/ AAL2/, 'MFA variants reflect real assurance states');
assert.match(source, /正在读取账户状态/, 'account actions stay disabled until real state arrives');
assert.match(source, /contractVersion', '2026-08-30\.1'/, 'generated nodes carry the current product-state contract');
assert.match(source, /提交后进入验证码页，不泄露账户是否存在/, 'recovery matches the App immediate OTP transition');
assert.match(source, /注册 \/ 密码恢复用途由真实流程决定/, 'OTP does not pretend every verification is signup');
assert.match(source, /'auth-mfa'[\s\S]*'正在读取 MFA 状态'[\s\S]*true\]/, 'MFA theme frames stay disabled before status load');
assert.match(source, /'device-provisioning'[\s\S]*unavailable = null/, 'unavailable layouts are selected from page-level configuration');
assert.match(source, /makeFrame\('Demo Banner'[\s\S]*vars\.dangerSurface/, 'unavailable product pages render the App demo banner with its theme token');
assert.match(source, /makeFrame\('Blocked State'[\s\S]*硬件连接尚未开放/, 'unavailable product pages render the real blocked state');
assert.match(source, /page\.unavailable[\s\S]*makeUnavailablePortrait/, 'portrait generation selects the unavailable product structure from page configuration');
assert.match(source, /page\.unavailable[\s\S]*makeUnavailableIntro\(page, 'Content \/ Landscape Primary'/, 'landscape generation selects the real intro pane from page configuration');
assert.match(source, /makeUnavailableDetail[\s\S]*makeBlockedState\(page, width, 160, vars\)/, 'landscape unavailable detail centers the real-height blocked card instead of stretching it');

assert.match(source, /frameIds\.length !== pages\.length \* 3/, 'the staging section validates 11 pages × 3 states before commit');
assert.equal((source.match(/frameIds\.push\(/g) ?? []).length, 3, 'each page contributes exactly Light, Dark, and Landscape frame IDs');
assert.match(source, /setBoundVariableForPaint/, 'fills and strokes use Figma variable bindings');
assert.match(source, /setExplicitVariableModeForCollection/, 'each top-level frame records its Light or Dark variable mode');
assert.match(source, /variable\.scopes = spec\.scopes/, 'tokens have explicit scopes');
assert.match(source, /frame\.paddingTop = 44;[\s\S]*frame\.paddingBottom = 34;/, 'portrait frames model top and bottom safe areas');
assert.match(source, /SAFE AREA · TOP 44[\s\S]*SAFE AREA · BOTTOM 34/, 'portrait safe areas are visible in the editable structure');
assert.match(source, /392, 350[\s\S]*left\.x = 20; left\.y = 20;/, 'landscape primary column uses the safe 20/392 geometry');
assert.match(source, /392, 350[\s\S]*right\.x = 432; right\.y = 20;/, 'landscape detail column uses the safe 432/392 geometry');
assert.match(source, /landscapeGrid', 'safe 20 \/ 392 \/ gap 20 \/ 392 \/ safe 20'/, 'landscape geometry is recorded for live verification');

assert.match(source, /stagingSection = figma\.createSection\(\)/, 'updates build in a separate staging Section');
assert.match(source, /if \(duplicate\) duplicate\.remove\(\);\s*committed = true;/, 'the old Section is removed only at the commit boundary');
assert.match(source, /if \(!committed\)[\s\S]*stagingSection\.remove\(\)[\s\S]*collection\.remove\(\)/, 'failed staging removes only new nodes and variable collections');
assert.match(source, /createdSceneNodes[\s\S]*node\.parent === figma\.currentPage[\s\S]*node\.remove\(\)/, 'failed staging also removes orphan Frame/Text nodes created on the current page');
assert.match(source, /historicalThemeCollectionIds'[\s\S]*JSON\.stringify/, 'retained previous theme collections are explicitly recorded for maintenance');
assert.doesNotMatch(source, /\[\.\.\.section\.children\]\.forEach\(\(child\) => child\.remove\(\)\)/, 'the old 33-frame Section is never emptied before replacement is complete');
assert.match(source, /DOSO_SOURCE_SYNC_TEST\.failAtFrame/, 'the real generator exposes deterministic failure injection for atomicity tests');

assert.doesNotMatch(liveVerifier, /const SECTION_ID/, 'the live verifier discovers the replacement Section instead of pinning the retired node ID');
assert.match(liveVerifier, /getPluginData\('themeCollectionId'\)/, 'the live verifier resolves the exact owned Light collection ID');
assert.match(liveVerifier, /getPluginData\('darkThemeCollectionId'\)/, 'the live verifier resolves the exact owned Dark collection ID');
assert.match(liveVerifier, /getPluginData\('historicalThemeCollectionIds'\)/, 'the live verifier reports retained historical collection IDs');
assert.match(liveVerifier, /getPluginData\('contractVersion'\).*2026-08-30\.1/, 'the live verifier rejects stale product-state contracts');
assert.match(liveVerifier, /variables\.length !== 12/, 'the live verifier requires exactly 12 variables in each active theme collection');
assert.match(liveVerifier, /landscapeGrid.*safe 20 \/ 392 \/ gap 20 \/ 392 \/ safe 20/, 'the live verifier checks the canonical landscape grid');
assert.match(liveVerifier, /Action \/ Disabled'\)\.length !== 6/, 'the live verifier expects two disabled contract pages across three variants');
assert.match(liveVerifier, /Action \/ Available'\)\.length !== 21/, 'the live verifier expects seven available product pages across three variants');
assert.match(liveVerifier, /fields\.length !== 81/, 'the live verifier excludes nonexistent fields from unavailable App pages');
assert.match(liveVerifier, /Demo Banner[\s\S]*Blocked State[\s\S]*unavailable controls/, 'the live verifier validates the unavailable App structure and absence of controls');

console.log('Figma source-sync structure, truth-state, theme, safe-area, and atomic-update contract PASS');
