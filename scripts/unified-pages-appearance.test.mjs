import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { loadVisualTokenModules } from './helpers/visual-token-modules.mjs';

const baseline = new URL('../artifacts/ui-refresh/20261018-unified-pages-v5/before-source/', import.meta.url);
const targets = [
  'src/screens/MapScreen.tsx', 'src/screens/AnalysisScreen.tsx', 'src/screens/ProfileScreen.tsx',
  'src/screens/EditProfileScreen.tsx', 'src/screens/DataPrivacyScreen.tsx', 'src/screens/AccountSecurityScreen.tsx',
  'src/screens/BindDeviceScreen.tsx', 'src/screens/BleDiscoveryScreen.tsx', 'src/screens/ProvisioningScreen.tsx',
  'src/screens/FirmwareUpdateScreen.tsx', 'src/screens/DeviceUnavailableScreen.tsx', 'src/screens/ConnectionDiagnosticsScreen.tsx',
  'src/screens/BrainstemSimulationScreen.tsx', 'src/screens/ModelSelectScreen.tsx', 'src/screens/MfaSetupScreen.tsx',
  'src/screens/LoginScreen.tsx', 'src/screens/RegisterScreen.tsx', 'src/screens/EmailOtpScreen.tsx',
  'src/screens/ForgotPasswordScreen.tsx', 'src/screens/ResetPasswordScreen.tsx', 'src/screens/UsernameOnboardingScreen.tsx',
  'src/screens/DisplayNameConfirmationScreen.tsx', 'src/components/AuthEntry.tsx', 'src/components/GradientButton.tsx',
  'src/components/SocialLoginFeedback.tsx', 'src/components/AppToast.tsx', 'src/features/robot-lifecycle/robotDiagnosticsPanel.tsx',
];
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
function tokens(source) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, source);
  const out = []; for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) out.push(scanner.getTokenText());
  return out.join(' ');
}
function eventBindings(source) {
  const ast = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bindings = [];
  const visit = node => {
    if (ts.isJsxAttribute(node) && /^on[A-Z]/.test(node.name.getText(ast))) bindings.push(tokens(node.getText(ast)));
    ts.forEachChild(node, visit);
  }; visit(ast); return bindings;
}
const lum = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);

test('canonical theme and appearance share one neutral surface and readable normal/action pairs', () => {
  for (const dark of [false, true]) {
    const { theme, appearance } = loadVisualTokenModules({ dark });
    const colors = dark ? theme.darkColors : theme.lightColors;
    const p = appearance.getProductAppearance(dark);
    assert.equal(p.canvas, colors.background); assert.equal(p.surface, colors.surface);
    assert.equal(colors.surfaceStrong, p.surface); assert.equal(p.quiet, p.surface);
    assert.equal(p.selectionSurface, p.action); assert.equal(p.action, '#98D1FF');
    assert.equal(p.selectionInk, p.actionInk); assert.equal(p.actionInk, '#17354D');
    for (const background of [p.canvas, p.surface]) for (const foreground of [p.ink, p.secondary, p.blueInk]) assert.ok(contrast(background, foreground) >= 4.5);
    assert.ok(contrast(p.action, p.actionInk) >= 4.5);
  }
});

test('visual migration preserves every existing screen event binding, including retained handler guards', () => {
  for (const path of targets) {
    const beforePath = new URL(path, baseline);
    assert.ok(existsSync(beforePath), path);
    assert.deepEqual(eventBindings(read(path)), eventBindings(readFileSync(beforePath, 'utf8')), path);
  }
});

test('brand, five-tab navigation, fonts and trusted command policies remain byte-identical', () => {
  for (const path of ['App.tsx', 'src/components/AppHeader.tsx', 'src/components/AppText.tsx', 'src/assets.ts', 'src/typography.ts', 'src/features/tasks/taskStartPolicy.ts', 'src/features/routes/routeStartPolicy.ts']) {
    assert.equal(read(path), readFileSync(new URL(path, baseline), 'utf8'), path);
  }
  assert.match(read('src/components/BottomNav.tsx'), /selected \? p\.blue : 'transparent'/);
});

test('additional QA views are static allowlisted extras, not new formal pages or live diagnostic sessions', () => {
  const source = read('src/design-qa/DesignQaRoot.tsx');
  assert.match(source, /get\('design-qa'\) === '1'/);
  assert.match(source, /extra === 'data-privacy' \? <DataPrivacyScreen onBack=\{noop\}/);
  assert.match(source, /extra === 'edit-profile'/);
  assert.match(source, /qa-extra 不受支持/);
  assert.doesNotMatch(source, /<ConnectionDiagnosticsScreen|<BrainstemSimulationScreen/);
  assert.equal(read('src/design-qa/request.ts'), readFileSync(new URL('src/design-qa/request.ts', baseline), 'utf8'));
});
