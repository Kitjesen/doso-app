import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const profile = await readFile(new URL('../src/screens/ProfileScreen.tsx', import.meta.url), 'utf8');
const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
const designQa = await readFile(new URL('../src/design-qa/DesignQaRoot.tsx', import.meta.url), 'utf8');

// Three-state layout and theme ownership.
assert.match(profile, /useAppTheme\(\)/, 'Profile uses the shared dynamic theme');
assert.match(profile, /useWindowDimensions\(\)/, 'Profile derives its layout from the live viewport');
assert.match(profile, /const isLandscape = width > height;/, 'Profile has an explicit orientation boundary');
assert.match(profile, /createStyles\(colors, isDark, layoutMetrics\)/, 'Profile styles follow the shared theme and measured responsive contract');
assert.match(profile, /<View onLayout=\{handleLayout\} style=\{styles\.measurementViewport\}>/, 'Profile measures the actual post-shell viewport');
assert.match(profile, /getProfileLayoutMetrics\(\{[\s\S]*?containerWidth: containerSize\.width,[\s\S]*?isLandscape,[\s\S]*?windowHeight: containerSize\.height,[\s\S]*?fontScale,/, 'Profile delegates actual post-header content width/height and real font scaling to one layout contract');
assert.doesNotMatch(profile, /useSafeAreaInsets|getSafeProfileTopOffset|PROFILE_LANDSCAPE_(?:DEVICE|CONTROLS)_TOP|leadingInset/, 'Profile no longer compensates for the retired absolute header or reclaims physical safe areas');
assert.match(profile, /primaryGrid:[\s\S]*?flexDirection: usesColumns \? 'row' : 'column'/, 'wide landscape is a real two-column layout with a narrow-screen stack fallback');
assert.match(profile, /deviceColumn:[\s\S]*?width: usesColumns \? deviceColumnWidth : '100%'/, 'device column uses the measured responsive width');
assert.match(profile, /controlsColumn:[\s\S]*?width: usesColumns \? controlsColumnWidth : '100%'/, 'controls use the measured width and stack safely when narrow');
assert.match(profile, /primaryGrid:[\s\S]*?gap: gridGap/, 'landscape gutter comes from the measured layout contract');
assert.match(profile, /measurementViewport:\s*\{\s*flex:\s*1\s*\}/, 'Profile keeps layout measurement inside the shared safe-area shell');
assert.match(profile, /viewport:\s*\{ flex: 1, minWidth: 0 \}/, 'Profile stays in normal flow under the shared Header');
assert.match(profile, /scroll:\s*\{\s*flex:\s*1\s*\}/, 'Profile scroll content occupies its measured viewport');
assert.match(profile, /content:[\s\S]*?paddingHorizontal: padding[\s\S]*?width: '100%'/, 'Profile uses shared responsive gutters rather than fixed Figma offsets');
assert.match(profile, /contentInsetAdjustmentBehavior="automatic"/, 'scroll content allows native system inset adjustment');
assert.doesNotMatch(profile, /translateX:\s*-|paddingRight:\s*78|getProfileLandscapeInsetReclaim/, 'Profile does not duplicate the App navigation reserve or use an unmeasured translation');
assert.doesNotMatch(profile, /deviceCard:[^\n]*?\bheight:/, 'device card never fixes a height that can clip dynamic text');
assert.match(profile, /deviceCard:[^\n]*?minHeight: 236[^\n]*?padding: cardLayout.inset/, 'device card remains content-driven with shared breathing room');
assert.doesNotMatch(profile, /primarySettingsCard:[^\n]*\bheight:/, 'larger supporting type grows settings cards without a clipping fixed height');
assert.match(profile, /const primaryCard = p.surface/, 'cards use the canonical two-theme surface');
assert.match(profile, /const rowSurface = 'transparent'/, 'setting rows do not add another nested surface');
assert.doesNotMatch(profile, /numberOfLines=/, 'long names, device data and unavailable reasons remain readable by wrapping');

// Primary Profile flow and product truthfulness.
assert.match(profile, /connected \? '在线' : '离线'/, 'online state comes only from the connected prop');
assert.match(profile, /batteryKnown = batteryPercent != null/, 'unknown battery is modeled explicitly');
assert.match(profile, /batteryKnown \? styles\.batteryRingKnown : styles\.batteryRingUnknown/, 'unknown battery never receives the green progress ring');
assert.match(profile, /batteryPercent == null \? '—' : `\$\{batteryPercent\}%`/, 'unknown battery renders an empty-state glyph');
assert.match(profile, /firmwareVersion = '待同步'/, 'firmware defaults to an honest pending state');
assert.match(profile, /lastSyncLabel = '尚未同步'/, 'last sync defaults to an honest pending state');
assert.match(profile, /runtimeHours == null \? '—'/, 'unknown runtime is never invented');
assert.doesNotMatch(profile, /50%|6\.4\s*(?:小时|h)|v2\.4\.1|2\s*(?:分钟|分钟前|min)/, 'Profile contains no trusted-looking Figma telemetry fixtures');

const primarySettings = profile.split('const controlsColumn = (')[1]?.split('const moreContent = (')[0] ?? '';
const primarySettingPositions = ['连接管理', '安全锁', '状态警报'].map((title) => primarySettings.indexOf(`title="${title}"`));
for (const [index, position] of primarySettingPositions.entries()) {
  assert.ok(position >= 0, `primary setting ${index + 1} exists before checking its order`);
}
assert.ok(primarySettingPositions[0] < primarySettingPositions[1], 'connection management precedes safety lock');
assert.ok(primarySettingPositions[1] < primarySettingPositions[2], 'safety lock precedes status alerts');
assert.doesNotMatch(primarySettings, /disabled=\{!canOpenProvisioning\}/, 'connection management keeps its truthful unavailable details reachable');
assert.match(primarySettings, /subtitle=\{provisioningReason\}/, 'connection management preserves the capability reason before navigation');
assert.match(profile, /safetyLock: boolean \| null;/, 'Profile accepts an explicit unknown safety-lock state');
assert.match(profile, /safetyLock == null[\s\S]*?connected \? '待同步' : '未连接'/, 'unknown safety lock is not inferred from connection status');
assert.match(primarySettings, /statusLabel=\{safetyLockStatus\.label\}/, 'safety lock renders a read-only status instead of a writable toggle');
assert.doesNotMatch(profile, /onToggleSafety|value=\{safetyLock\}/, 'safety lock has no writable UI action or callback');
assert.match(profile, /label: '已开启'[\s\S]*?tone: 'on'/, 'known enabled state has a distinct visual status');
assert.match(profile, /label: '已关闭'[\s\S]*?tone: 'off'/, 'known disabled state has a distinct visual status');
assert.match(profile, /accessibilityLabel=\{`安全锁，\$\{safetyLockStatus\.label\}。\$\{safetyLockStatus\.subtitle\}`\}/, 'safety-lock status has an explicit accessible label');
assert.match(app, /const trustedSafetyLock = readTrustedSafetyLock\(device\);[\s\S]*?const safetyLock = trustedSafetyLock \?\? true;/, 'command authorization stays fail-closed while presentation preserves unknown');
assert.match(app, /<ProfileScreen[\s\S]*?safetyLock=\{trustedSafetyLock\}/, 'production Profile receives the tri-state value');
assert.match(designQa, /<ProfileScreen[\s\S]*?safetyLock=\{null\}/, 'QA Profile exercises the unknown safety-lock state');
assert.match(primarySettings, /通知服务待接入/, 'status alert is disclosed as a preference without delivery');

// Existing product entries remain reachable below the accepted first viewport.
for (const requiredCopy of ['更多设置', '网络与配网', '固件更新', '绑定真实设备', '解绑当前设备', '设备接入', '附近 BLE 设备', '连接并发现服务，设备身份和配网需协议支持', 'IP 连接 / 添加机器狗', '账户']) {
  assert.ok(profile.includes(requiredCopy), `Profile preserves ${requiredCopy}`);
}
assert.doesNotMatch(profile, /disabled=\{!canOpenProvisioning\}/, 'provisioning explanation remains reachable while execution stays blocked');
assert.doesNotMatch(profile, /disabled=\{!canOpenFirmwareUpdate\}/, 'OTA explanation remains reachable while execution stays blocked');
assert.match(profile, /<View style=\{styles\.moreContent\} testID="profile-more-content">/, 'secondary product entries retain their inspectable group');
assert.match(profile, /testID="profile-controller-secondary">\{controlsColumn\}\{moreContent\}<\/ScrollView>/, 'short landscape keeps all secondary entries in its independently scrollable settings pane');
assert.match(profile, /testID="profile-scroll">[\s\S]*?\{moreContent\}[\s\S]*?<\/ScrollView>/, 'stacked and tall layouts retain scrollable secondary entries');
assert.match(profile, />状态说明<\//, 'status refresh placeholder is labelled as information, not an operation');
assert.match(profile, /connected \? '断开说明' : '当前离线'/, 'disconnect placeholder never claims to execute a physical command');

// Touch and accessibility contracts.
assert.match(profile, /connectionPrimary:[\s\S]*?minHeight: 48/, 'connected control has a 48dp target');
assert.match(profile, /retryButton:[\s\S]*?minHeight: 48/, 'retry control has a 48dp target');
assert.match(profile, /disconnectButton:[\s\S]*?minHeight: 48/, 'disconnect control has a 48dp target');
assert.match(profile, /settingRow:[\s\S]*?minHeight: 68/, 'setting rows exceed 44pt in every orientation and grow for readable descriptions');
assert.match(profile, /securityButton:[\s\S]*?minHeight: 48/, 'account security has a 48dp target');
assert.match(profile, /logoutButton:[\s\S]*?minHeight: 48/, 'logout has a 48dp target');
assert.match(profile, /<Switch[^>]+accessibilityHint=[^>]+accessibilityState=\{\{ disabled \}\}[^>]+disabled=\{disabled\}/, 'switches expose and enforce disabled state');
assert.doesNotMatch(profile, /accessibilityRole=\{onToggle \? 'switch' : 'text'\}/, 'a toggle is exposed only once through the native Switch');
assert.match(profile, /accessible=\{Boolean\(statusLabel\)\}/, 'read-only status rows become one coherent accessibility element');
assert.doesNotMatch(profile, /disabled && styles\.disabled|disabled:\s*\{\s*opacity:/, 'disabled setting reasons are never hidden behind whole-row opacity');
assert.doesNotMatch(profile, /fontSize: isLandscape \? [6-9] :/, 'landscape text never drops below 10sp through an orientation branch');

console.log('DOSO Profile UI three-state contract PASS — responsive, dark-safe, truth-preserving, product entries retained');
