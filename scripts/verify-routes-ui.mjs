import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [assets, routePolicy, routes] = await Promise.all([
  readFile(new URL('../src/assets.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/features/routes/routeStartPolicy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/screens/MapScreen.tsx', import.meta.url), 'utf8'),
]);

assert.match(routes, /useAppTheme\(\)/, 'Routes consumes the dynamic light/dark theme');
assert.match(routes, /useWindowDimensions\(\)/, 'Routes reads the runtime viewport');
assert.match(routes, /onLayout=\{measureViewport\}/, 'Routes measures the container after shell safe-area and navigation reservations');
assert.match(routes, /const isLandscape = width > height/, 'Routes has an explicit landscape branch');
assert.match(routes, /showExamples = false/, 'The normal product does not expose an example gallery by default');
assert.match(routes, /const examplesSelected = showExamples && library === '示例路线'/, 'Examples need an explicit caller opt-in, including after prop changes');
assert.match(routes, /layout\.useColumns && examplesSelected[\s\S]*landscapeIntroColumn[\s\S]*landscapeRoutesColumn/, 'Readable measured widths use a true two-column composition only for explicit examples');
assert.match(routes, /getAdaptivePageLayout\(\{[\s\S]*containerWidth: viewport\.width,[\s\S]*windowHeight: viewport\.height,[\s\S]*fontScale,[\s\S]*variant: 'map'/, 'The actual available width, height and font scale govern the shared adaptive contract');
assert.doesNotMatch(routes, /landscapeScale|safeLandscapeWidth|paddingTop: (99|29)\b/, 'The screen no longer shrinks a fixed portrait composition or compensates for an absolute header');
assert.match(routes, /const cardSurface = p.surface/, 'Route cards share the canonical light and dark surface');

assert.match(assets, /routeMapLarge: require\('\.\.\/assets\/figma\/routes-map-large\.png'\)/, 'Large route preview uses downloaded Figma pixels');
assert.match(assets, /routeMapCompact: require\('\.\.\/assets\/figma\/routes-map-compact\.png'\)/, 'Compact route preview uses downloaded Figma pixels');
assert.match(routes, /image: images\.routeMapLarge/, 'Route templates consume the real Figma map asset');
assert.match(routes, /<Image accessibilityIgnoresInvertColors resizeMode="cover" source=\{route\.image\}/, 'Map previews render accessible raster assets instead of code-drawn maps');
assert.match(routes, /opacity: isDark \? 0\.9 : 1/, 'Dark mode intentionally reduces the high-key map asset opacity');
assert.doesNotMatch(routes, /mapRoad|mapRiver|rotate: '[^']*deg'/, 'No fake map is drawn with view primitives');

assert.match(routes, /testID="route-preview-notice">以下是界面示例，不是设备地图或已保存路线。/, 'One visible list notice distinguishes examples from device and saved route data');
assert.doesNotMatch(routes, /可用路线模板|styles\.selectedLabel|styles\.routeCode|styles\.routeDetail/, 'Cards avoid redundant disclaimers');
assert.match(routes, /设备地图与路线编辑器尚在接入中/, 'Current device map and route editor integration remains truthful');
assert.match(routes, /地图接入后，可编辑航点并保存到“我的路线”/, 'The intended route creation and save flow is described without claiming completion');
assert.doesNotMatch(routes, /15 分钟 · 120 米|24 分钟 · 280 米|18 分钟 · 190 米/, 'Figma fixtures do not claim trusted route metrics');
assert.match(routes, /geometryValidation: 'unknown', routeId: null, source: 'template'/, 'Visible route fixtures remain non-executable templates without trusted IDs or geometry');
assert.doesNotMatch(routes, /setCustom|source: 'custom'/, 'The screen does not expose a pretend route editor');
assert.doesNotMatch(routes, /当前版本不支持绘制或保存自定义路线/, 'A temporary integration gap is not presented as the permanent product plan');
assert.match(routes, /testID=\{`route-library-\$\{item\}`\}/, 'Saved routes and example routes are explicitly separated');
assert.match(routes, /testID="route-owned-empty"/, 'The saved-route tab renders a real empty state rather than fake user data');
assert.match(routes, /同步设备地图', '编辑航点并保存', '设备校验后执行/, 'The empty state communicates the actual route workflow');
assert.match(routes, /routeName: \{ \.\.\.typography\.label/, 'Route names use the shared complete 15/22 typography token');
assert.match(routes, /routeNameActive: \{ color: p.actionInk \}/, 'Selected sky rows use readable paired dark ink without changing metrics');
assert.match(routes, /routeActive: \{ backgroundColor: selectedSurface \}/, 'Selection uses the single accent without a decorative outline');
assert.match(routes, /route: \{[^\n]*minHeight: 104/, 'All rows keep a consistent minimum height and may grow naturally');

assert.match(routePolicy, /input\.control\?\.available !== true/, 'Route start fails closed unless control is explicitly available');
assert.match(routePolicy, /input\.executor\?\.available !== true/, 'Route start fails closed unless the executor is explicitly available');
assert.match(routePolicy, /candidate\.source !== 'trusted'/, 'Only trusted route sources may execute');
assert.match(routePolicy, /TRUSTED_ROUTE_ID_PATTERN\.test\(trustedRouteId\)/, 'Trusted route IDs are format validated');
assert.match(routePolicy, /candidate\.geometryValidation !== 'validated'/, 'Only validated geometry may execute');
assert.match(routePolicy, /const readiness = deriveRouteStartReadiness\(currentInput\)/, 'Route start atomically re-derives current readiness');
assert.match(routePolicy, /onStart\(readiness\.trustedRouteId\)/, 'Only the revalidated trusted route ID reaches the command callback');

assert.match(routes, /deriveRouteStartReadiness\(routeStartInput\)/, 'The visible disabled state is derived from the shared route policy');
assert.match(routes, /accessibilityState=\{\{ disabled: !routeCanStart \}\}/, 'Start route exposes its fail-closed state');
assert.match(routes, /disabled=\{!routeCanStart\}/, 'Start route cannot dispatch without complete trusted evidence');
assert.match(routes, /attemptRouteStart\(routeStartInput, onStartRoute\)/, 'Route start uses the atomic policy boundary instead of calling the command callback directly');
assert.doesNotMatch(routes, /onPress=\{\(\) => onStartRoute\(/, 'Route start never directly dispatches a display name or stale selection');
assert.match(routes, /accessibilityLiveRegion="polite" testID="route-blocked-reason"/, 'The concrete blocked reason remains visible outside the start button without line clipping');
assert.match(routes, /filters: \{ flexDirection: 'row', minHeight: 48,/, 'The route filter parent provides a growing 48-point touch region');
assert.match(routes, /filterPressable: \{[^\n]*minHeight: 48/, 'Every route filter Pressable has a real minimum 48-point touch target');
assert.match(routes, /filterRail: \{[\s\S]*bottom: 4,[\s\S]*top: 4 \}/, 'The visual filter rail stays at the 36-point Figma height inside the touch region');
assert.match(routes, /activeFilter: \{[^\n]*minHeight: 40/, 'The active visual capsule grows with text instead of clipping larger font scales');
assert.match(routes, /onPress=\{\(\) => changeFilter\(item\)\}/, 'Route filters remain interactive');
assert.match(routes, /onSelect=\{\(id\) => \{ setSelectedId\(id\); setDetailsExpanded\(false\); \}\}/, 'Route selection remains interactive and resets previous help');
assert.match(routes, /onPress=\{\(\) => setDetailsExpanded\(\(value\) => !value\)\}/, 'The route help has a real expand/collapse action');

console.log('DOSO responsive Figma routes UI + trusted start contract PASS');
