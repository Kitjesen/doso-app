import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('every main-page landscape header stays in normal flow without legacy fixed offsets', () => {
  for (const flow of [true, false]) {
    const screen = mountAuthScreen({ screen: 'header', width: 960, height: 600, flow });
    const outer = flatten(screen.nodes[0].props.style);
    assert.notEqual(outer.position, 'absolute');
    assert.equal(outer.top ?? 0, 0);
    assert.equal(outer.width, '100%');
  }
});

test('a task context header replaces the greeting without dropping profile or notifications', () => {
  const calls = [];
  const screen = mountAuthScreen({ screen: 'header', width: 960, height: 600, flow: true,
    title: '任务', subtitle: 'THUNDER 01（离线）', displayName: 'DOSO Demo',
    onProfile: () => calls.push('profile'), onNotifications: () => calls.push('notifications') });
  assert.match(screen.copy, /任务.*THUNDER 01（离线）/);
  assert.doesNotMatch(screen.copy, /你好|今天/);
  for (const label of ['编辑个人资料', '通知']) {
    screen.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label).props.onPress();
  }
  assert.deepEqual(calls, ['profile', 'notifications']);
  const outer = flatten(screen.nodes[0].props.style);
  assert.notEqual(outer.position, 'absolute');
  assert.equal(outer.width, '100%');
});
