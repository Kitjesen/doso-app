import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flat = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const mount = (options = {}) => mountAuthScreen({
  screen: 'home', robotName: 'THUNDER 01', robotImage: 'selected-robot',
  connected: false, canRecall: false, safetyLock: false,
  onRecall: () => {}, onOpenControl: () => {}, onOpenRoutes: () => {},
  onOpenTasks: () => {}, onOpenSafety: () => {}, ...options,
});
const node = (screen, id) => screen.nodes.find(item => item.props?.testID === id);
const contains = (element, id) => Array.isArray(element)
  ? element.some(child => contains(child, id))
  : !!element && typeof element === 'object' && (element.props?.testID === id || contains(element.props?.children, id));

test('wide home separates device and features', () => {
  const screen = mount({ width: 960, height: 600 });
  screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: 882, height: 488 } } });
  screen.render();
  const primary = node(screen, 'home-primary-column');
  const secondary = node(screen, 'home-secondary-column');
  assert.ok(primary);
  assert.ok(secondary);
  assert.equal(flat(screen.nodes.find(item => item.type === 'ScrollView').props.contentContainerStyle).flexDirection, 'row');
  assert.ok(flat(primary.props.style).width > flat(secondary.props.style).width);
  assert.ok(flat(primary.props.style).width + flat(secondary.props.style).width <= 834);
});

test('layout measurement ignores empty and non-finite transient sizes', () => {
  const screen = mount({ width: 960, height: 600 });
  const measure = (width, height = 488) => {
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width, height } } });
    screen.render();
  };
  measure(882);
  const width = flat(node(screen, 'home-primary-column').props.style).width;
  for (const invalid of [0, -1, NaN, Infinity]) {
    measure(invalid);
    assert.equal(flat(node(screen, 'home-primary-column').props.style).width, width);
    measure(800, invalid);
    assert.equal(flat(node(screen, 'home-primary-column').props.style).width, width);
  }
});
