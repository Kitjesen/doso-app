import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../src/screens/${name}`, import.meta.url), 'utf8');

const screens = [
  ['DeviceUnavailableScreen.tsx', true],
  ['BindDeviceScreen.tsx', true],
  ['BleDiscoveryScreen.tsx', true],
  ['ProvisioningScreen.tsx', true],
  ['FirmwareUpdateScreen.tsx', true],
];

for (const [name, needsSafeAreaMigration] of screens) {
  const source = read(name);
  assert.match(source, /useAppTheme\(\)/, `${name} must follow the system theme`);
  assert.match(source, /useWindowDimensions\(\)/, `${name} must respond to viewport changes`);
  if (name === 'BindDeviceScreen.tsx' || name === 'DeviceUnavailableScreen.tsx') {
    assert.match(source, /getDevicePageLayout\(\{ width, height, insetLeft: insets\.left, insetRight: insets\.right, containerWidth \}\)/, `${name} must size columns from the safe viewport`);
    assert.match(source, /onLayout=\{\(\{ nativeEvent \}\) => setContainerWidth\(nativeEvent\.layout\.width\)\}/, `${name} must prefer measured safe content over stale JS window dimensions`);
    assert.match(source, /const isLandscape = layout\.usesColumns/, `${name} must stack when safe columns cannot fit`);
    for (const field of ['contentWidth', 'introWidth', 'detailsWidth']) {
      assert.ok(source.includes(`width: layout.${field}`), `${name} must apply the computed ${field}`);
    }
    assert.match(source, /flexGrow: 0, flexShrink: 0, flexBasis: 'auto'/, `${name} must not let content redistribute column widths`);
  } else {
    assert.match(source, /width\s*>=\s*700\s*&&\s*width\s*>\s*height/, `${name} must enable its two-column layout at 844x390`);
  }
  assert.match(source, /width\s*<\s*360/, `${name} must preserve a compact layout below 360px`);
  assert.match(source, /landscapeLayout/, `${name} must expose a readable landscape layout`);
  assert.match(source, /content:\s*\{[^}]*paddingHorizontal:\s*24/, `${name} portrait content must match the Figma 24px safe gutter`);
  assert.doesNotMatch(source, /\bscreenPadding\b/, `${name} must not inherit the 20px main-shell gutter`);
  assert.doesNotMatch(source, /import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*['"]\.\.\/theme['"]/, `${name} must not use the legacy light-only palette`);
  if (needsSafeAreaMigration) {
    assert.match(source, /SafeAreaView/, `${name} must protect content from display cutouts`);
    assert.match(source, /edges=\{\['top', 'left', 'right', 'bottom'\]\}/, `${name} must apply all safe-area edges`);
  }
}

// Binding and scanner interactions are exercised by bind-device-screen.test.mjs.
console.log('Device flow theme, safe-area, and responsive layout contract verified.');
