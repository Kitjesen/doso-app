import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

test('missing and invalid journey data never become sample measurements', () => {
  for (const journey of [undefined, { distanceM: NaN, durationMs: -1 }]) {
    const screen = mountAuthScreen({ screen: 'home-summary', journey });
    assert.match(screen.copy, /暂无定位/);
    assert.match(screen.copy, /暂无动态/);
    assert.doesNotMatch(screen.copy, /2\.4|48 min|巡检已结束|园区/);
  }
});

test('valid zero remains zero and records open and close without commands', () => {
  const events = Array.from({ length: 4 }, (_, i) => ({ id: String(i), at: '2026-11-11T14:32:00+08:00', title: '记录' + i }));
  const screen = mountAuthScreen({ screen: 'home-summary', journey: { distanceM: 0, durationMs: 0 }, events });
  assert.match(screen.copy, /0\.0.*km/);
  assert.match(screen.copy, /0.*min/);
  assert.doesNotMatch(screen.copy, /记录3/);
  screen.action('home-open-events').props.onPress(); screen.render();
  assert.match(screen.copy, /记录3/);
  screen.action('home-close-detail').props.onPress(); screen.render();
  assert.doesNotMatch(screen.copy, /记录3/);
  screen.action('home-open-map').props.onPress(); screen.render();
  assert.ok(screen.nodes.some(n => n.type === 'Modal' && n.props.visible));
});

test('production home has no dependency on visual fixtures', () => {
  for (const name of ['src/screens/HomeScreen.tsx', 'src/components/HomeSummary.tsx']) {
    const source = readFileSync(new URL('../' + name, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /design-qa|home-map\.png|园区东侧步道|巡检已结束/);
  }
});
