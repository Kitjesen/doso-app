import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const entry = await readFile(new URL('../src/components/AuthEntry.tsx', import.meta.url), 'utf8');
const loginScreen = await readFile(new URL('../src/screens/LoginScreen.tsx', import.meta.url), 'utf8');

function styleBlock(name) {
  const match = loginScreen.match(new RegExp(`${name}: \\{([^}]*)\\}`));
  assert.ok(match, `expected ${name} style to exist`);
  return match[1];
}

function numericStyle(block, property) {
  const match = block.match(new RegExp(`${property}:\\s*(\\d+)`));
  assert.ok(match, `expected ${property} to be numeric`);
  return Number(match[1]);
}

test('selected auth entry measures cutout-safe width before calculating landscape columns', () => {
  assert.match(entry, /edges=\{\['top', 'left', 'right', 'bottom'\]\}/);
  assert.match(entry, /getRegistrationLayout\(containerWidth \?\? width - insets.left - insets.right, fontScale\)/);
  assert.match(entry, /setContainerWidth\(nativeEvent.layout.width\)/);
  assert.match(entry, /width: layout.wide \? layout.contentWidth : portraitWidth/);
  assert.match(entry, /width: layout.wide \? layout.formWidth : portraitWidth/);
  assert.match(entry, /width: layout.wide \? layout.introWidth : portraitWidth/);
  assert.match(entry, /layout.wide && \{ gap: layout.gap \}/);
});
test('portrait auth fields remain scrollable real controls with keyboard-safe layout', () => {
  assert.match(entry, /<KeyboardAvoidingView/);
  assert.match(entry, /<ScrollView[\s\S]*keyboardShouldPersistTaps="handled"/);
  assert.match(entry, /identityField: \{ flex: 1, minWidth: 0 \}/);
  assert.doesNotMatch(entry, /resizeMode="stretch"/);
  assert.match(entry, /<TextInput/);
});

test('default auth pages use an explicit centered landscape composition at 844x390', () => {
  assert.match(
    loginScreen,
    /authStyles\.scrollContent,[\s\S]*landscape && authStyles\.scrollContentLandscape/,
    'default auth pages need a landscape-specific scroll composition',
  );
  assert.match(
    loginScreen,
    /authStyles\.content, landscape && authStyles\.contentLandscape/,
    'default auth page content needs an explicit centered landscape constraint',
  );
  assert.match(loginScreen, /authStyles\.defaultIntro, landscape && authStyles\.defaultIntroLandscape/);
  assert.match(loginScreen, /authStyles\.defaultForm, landscape && authStyles\.defaultFormLandscape/);

  const scroll = styleBlock('scrollContentLandscape');
  const content = styleBlock('contentLandscape');
  const intro = styleBlock('defaultIntroLandscape');
  const form = styleBlock('defaultFormLandscape');
  assert.match(content, /flexDirection:\s*'row'/, 'landscape uses two intentional regions instead of a tall single column');
  assert.ok(numericStyle(scroll, 'paddingTop') <= 24, 'short landscape viewports start near the safe-area edge');
  assert.ok(numericStyle(content, 'maxWidth') <= 844 - 48, 'the centered form cannot exceed the viewport');
  assert.ok(
    numericStyle(intro, 'width') + numericStyle(content, 'gap') + numericStyle(form, 'maxWidth') <= numericStyle(content, 'maxWidth'),
    'intro, gap, and form fit in the centered landscape content width',
  );
});
