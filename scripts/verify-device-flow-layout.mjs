import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../src/screens/${name}`, import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const deviceRepository = readFileSync(new URL('../src/services/deviceRepository.ts', import.meta.url), 'utf8');
const deviceBindingFunction = readFileSync(new URL('../supabase/functions/device-binding/index.ts', import.meta.url), 'utf8');

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

const bindDevice = read('BindDeviceScreen.tsx');
assert.doesNotMatch(bindDevice, /accessibilityLabel="返回"[^>]*disabled=\{busy\}/, 'a stalled bind request must not trap the user on the page');
assert.match(bindDevice, /const submitPendingRef = useRef\(false\)/, 'the screen must synchronously suppress same-frame duplicate binding submissions');
assert.match(bindDevice, /if \(busy \|\| submitPendingRef\.current\) return/, 'both parent and local binding locks must guard submission');
assert.match(bindDevice, /finally \{[\s\S]*submitPendingRef\.current = false/, 'the local binding lock must always be released');
assert.match(bindDevice, /accessibilityLabel="设备序列号"/, 'the serial input must have a stable accessible name');
assert.match(bindDevice, /accessibilityLabel="一次性绑定码"/, 'the binding-code input must have a stable accessible name');
assert.match(bindDevice, /fieldErrors\.serial \? <Text[^>]*nativeID="bind-serial-error"[\s\S]*?\{fieldErrors\.serial\}/, 'serial validation must render beside the serial input');
assert.match(bindDevice, /fieldErrors\.code \? <Text[^>]*nativeID="bind-code-error"[\s\S]*?\{fieldErrors\.code\}/, 'binding-code validation must render beside the binding-code input');
assert.match(bindDevice, /\(nextFieldErrors\.serial \? serialInputRef : codeInputRef\)\.current\?\.focus\(\)/, 'invalid submission must focus its first invalid field');
assert.match(bindDevice, /setFieldErrors\(current => current\[field\] \? \{ \.\.\.current, \[field\]: undefined \} : current\)/, 'editing must clear only the field error that belongs to the edited input');
assert.match(bindDevice, /\{error \? <Text[^>]*styles\.serverError[^>]*>\{error\}<\/Text> : null\}/, 'repository errors must remain a distinct global message');
assert.match(bindDevice, /variant="auth"/, 'binding must reuse the solid authentication CTA instead of the legacy gradient');
assert.doesNotMatch(bindDevice, /layout:\s*\{[^}]*flex:\s*1/, 'portrait binding content must not push the intro and form to opposite ends');
assert.match(bindDevice, /layout:\s*\{[^}]*gap:\s*24/, 'portrait intro and form must use one deliberate 24px section gap');
assert.doesNotMatch(bindDevice, /card:\s*\{[^}]*marginTop/, 'the form card must not add a second portrait section gap');
assert.match(bindDevice, /back:\s*\{[^}]*width:\s*48[^}]*height:\s*48/, 'the visible back control must preserve a cross-platform 48px target');
assert.match(bindDevice, /title:\s*\{[^}]*fontSize:\s*28[^}]*fontWeight:\s*'700'/, 'the title must use restrained product hierarchy instead of display-heavy type');
assert.match(bindDevice, /subtitle:\s*\{[^}]*fontSize:\s*14[^}]*lineHeight:\s*22/, 'the binding instructions must remain readable at body size');
assert.match(bindDevice, /label:\s*\{[^}]*fontSize:\s*14[^}]*lineHeight:\s*20/, 'field labels must remain readable without relying on all-caps weight');
assert.match(bindDevice, /input:\s*\{[^}]*fontSize:\s*17[^}]*lineHeight:\s*24/, 'input values must use the shared readable form scale');
assert.match(bindDevice, /noteText:\s*\{[^}]*fontSize:\s*13[^}]*lineHeight:\s*20/, 'the security note must remain readable secondary text');
assert.match(bindDevice, /styles\.introPane, isLandscape && \[styles\.landscapeIntroPane, \{ width: layout\.introWidth \}\]/, 'the bind intro must use its fixed-width compact landscape composition');
assert.match(bindDevice, /landscapeIcon:\s*\{[^}]*height:\s*44[^}]*marginTop:\s*10[^}]*width:\s*44/, 'the landscape identity mark must fit the 390px viewport without shrinking below its visual role');
assert.match(bindDevice, /landscapeNote:\s*\{[^}]*marginTop:\s*8[^}]*padding:\s*11/, 'the truth-preserving binding note must remain fully visible in landscape');
assert.match(bindDevice, /landscapeNoteText:\s*\{[^}]*fontSize:\s*13[^}]*lineHeight:\s*20/, 'the compact landscape note must not shrink below the readable secondary-text scale');
assert.match(app, /const BIND_DEVICE_TIMEOUT_MS = 15_000/, 'production binding has a finite confirmation deadline');
assert.match(app, /const bindDeviceAttemptRef = useRef\(0\)/, 'binding owns a generation guard for late network results');
assert.match(app, /const bindDeviceAbortControllerRef = useRef<AbortController \| null>\(null\)/, 'binding owns an abort controller for the real network request');
assert.match(app, /const pendingBindSerialNumberRef = useRef<string \| null>\(null\)/, 'binding preserves only the normalized serial needed for read-only reconciliation');
assert.match(app, /const reconcileBoundDevice = useCallback\(async \(serialNumber: string\)/, 'ambiguous claim outcomes have an explicit reconciliation path');
assert.match(app, /for \(const delayMs of \[300, 900, 1_800\]\)[\s\S]*deviceRepository\.list\(\)[\s\S]*device\.serial_number\?\.trim\(\)\.toUpperCase\(\) === normalizedSerial/, 'reconciliation retries the authoritative device list and matches only the requested serial');
assert.match(app, /const cancelBindDeviceAttempt = useCallback\(\(\) => \{[\s\S]*bindDeviceAbortControllerRef\.current\?\.abort\(\)[\s\S]*bindDeviceAttemptRef\.current \+= 1[\s\S]*setDeviceBusy\(false\)[\s\S]*returnToDeviceSettings\(\)[\s\S]*reconcileBoundDevice\(serialNumber\)\.then/, 'leaving the page aborts, invalidates, and reconciles any already-committed server result');
assert.match(app, /deviceRepository\.claim\(serialNumber, code, \{[\s\S]*signal: controller\.signal[\s\S]*timeoutMs: BIND_DEVICE_TIMEOUT_MS/, 'binding forwards cancellation and a finite timeout to the real repository request');
assert.match(app, /if \(attempt !== bindDeviceAttemptRef\.current\) return/, 'late binding results cannot mutate the current App state');
assert.match(app, /ambiguousOutcome[\s\S]*await reconcileBoundDevice\(serialNumber\)/, 'a timeout or failed Edge response is reconciled before the App exposes a retry');
assert.match(app, /edge function\|fetch\|network\|abort\|timeout\|internal_error\|server could not complete\|non-2xx/i, 'structured and humanized server 5xx failures are all treated as ambiguous claim outcomes');
assert.match(app, /stage === 'bind-device'[\s\S]*cancelBindDeviceAttempt\(\)[\s\S]*return true/, 'Android hardware back uses the same safe cancellation contract');
assert.match(deviceRepository, /signal\?: AbortSignal/, 'the repository accepts cancellation from the App lifecycle');
assert.match(deviceRepository, /timeoutMs\?: number/, 'the repository accepts a bounded function timeout');
assert.match(deviceRepository, /\{ body, signal: options\.signal, timeout: options\.timeoutMs \}/, 'the Supabase function invocation receives both controls');
assert.match(deviceBindingFunction, /\.eq\("serial_number", serialNumber\)[\s\S]*?\.eq\("owner_id", caller\.user\.id\)[\s\S]*?idempotentRetry: true/, 'a committed claim can be reconciled idempotently after client cancellation or timeout');

console.log('Device flow theme, safe-area, and responsive layout contract verified.');
