import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const theme = read('src/theme.ts');
const app = read('App.tsx');
const header = read('src/components/AppHeader.tsx');
const nav = read('src/components/BottomNav.tsx');
const appConfig = JSON.parse(read('app.json'));
const manifest = read('android/app/src/main/AndroidManifest.xml');
const androidStrings = read('android/app/src/main/res/values/strings.xml');

assert.match(theme, /export const lightColors\s*=/, 'theme must expose a light semantic palette');
assert.match(theme, /export const darkColors\s*:/, 'theme must expose a dark semantic palette');
assert.match(theme, /export const colors\s*=\s*lightColors/, 'legacy colors export must remain the light palette');
assert.match(theme, /useColorScheme\(\)/, 'theme must respond to the system color scheme');
assert.match(theme, /export function useAppTheme\(/, 'theme must expose useAppTheme()');
assert.match(app, /setStatusBarStyle\(isDark \? 'light' : 'dark'/, 'system status-bar icons must remain legible when the theme changes');

for (const [name, source] of [['AppHeader', header], ['BottomNav', nav]]) {
  assert.match(source, /useProductAppearance\(\)/, `${name} must use the dynamic appearance adapter`);
  assert.match(source, /useWindowDimensions\(\)/, `${name} must respond to viewport changes`);
  assert.match(source, /[Ll]andscape/, `${name} must provide a landscape layout`);
}
assert.match(read('src/appearance.ts'), /useAppTheme\(\)/, 'appearance adapter must follow the live system theme');

assert.match(nav, /flexDirection:\s*'column'/, 'landscape navigation must be vertical');
assert.match(nav, /position:\s*'absolute'/, 'landscape navigation must dock to the right edge');
// 2026-10-10 user-approved icon-only redesign replaces the legacy dark Figma rail.
for (const icon of ['home-outline', 'map-outline', 'reader-outline', 'stats-chart-outline', 'person-outline']) {
  assert.ok(nav.includes(`icon: '${icon}'`), `navigation must retain the distinct ${icon} destination glyph`);
}
assert.doesNotMatch(nav, /desktop-outline|images\.nav|<Image|<Text/, 'slim navigation has outline glyphs, no bitmap icons or visible labels');
assert.match(nav, /selected \? p\.blue : 'transparent'/, 'only the selected indicator has a light-blue background');
assert.match(nav, /selected \? p\.actionInk : p\.secondary/, 'icon colors follow the live light/dark product palette');
assert.match(nav, /backgroundColor: p\.isDark \? p\.surface : p\.raised/, 'light navigation uses white and dark navigation uses neutral graphite');
assert.match(nav, /justifyContent:\s*'space-between'/, 'landscape navigation must pin the first and last controls to the Figma vertical rhythm');
assert.match(nav, /minWidth: 48, minHeight: 48, height: 48/, 'both orientations retain full-size 48dp touch targets');
assert.match(nav, /indicator: \{ width: 36, height: 36, borderRadius: 12/, 'selection stays compact within its larger touch target');
assert.match(nav, /nav: \{ height: 56/, 'the visual bar remains slim');
assert.match(nav, /accessibilityState=\{\{ selected \}\}/, 'selection is announced to assistive technology');
assert.match(nav, /onChange\(item.key\)/, 'every tab remains an independent live action');
assert.match(nav, /size=\{22\}/, 'outline icons use a consistent 22dp optical box');
assert.match(nav, /android_ripple=/, 'navigation presses must expose native Android feedback');
assert.match(nav, /pressed: \{ opacity: 0\.65 \}/, 'navigation presses expose feedback without changing layout');

assert.equal(appConfig.expo.orientation, 'default', 'Expo orientation must allow portrait and landscape');
assert.equal(appConfig.expo.userInterfaceStyle, 'automatic', 'Expo must follow the system theme');
assert.doesNotMatch(manifest, /android:screenOrientation="portrait"/, 'Android activity must not force portrait');
assert.match(
  androidStrings,
  /name="expo_system_ui_user_interface_style"[^>]*>automatic<\/string>/,
  'Android system UI style must be automatic',
);

console.log('Theme and orientation UI contract verified.');
