import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const notice = { title: '通知服务尚未接入', message: '当前不能确认是否存在新的设备告警。', tone: 'info' };

test('bell feedback reserves normal layout space instead of covering navigation', () => {
  const screen = mountAuthScreen({ screen: 'toast', notice, onDismiss: () => {}, width: 753, height: 471 });
  const region = flatten(screen.nodes[0].props.style);
  assert.notEqual(region.position, 'absolute', 'an absolute full-width feedback card intercepts navigation below it');
  assert.equal(region.zIndex ?? 0, 0, 'feedback must not float above the navigation');
  assert.match(screen.copy, /通知服务尚未接入/);
});

test('feedback has an explicit accessible close target instead of making all text dismiss it', () => {
  let dismissed = 0;
  const screen = mountAuthScreen({ screen: 'toast', notice, onDismiss: () => dismissed++ });
  const close = screen.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === '关闭提示');
  assert.ok(close, 'the visible close icon must be a separately labelled control');
  const size = flatten(close.props.style({ pressed: false }));
  assert.ok(size.minWidth >= 48 && size.minHeight >= 48);
  assert.equal(screen.nodes.filter(node => node.type === 'Pressable').length, 1, 'the message itself must not be a dismiss button');
  close.props.onPress();
  assert.equal(dismissed, 1);
  screen.render({ notice: null });
  assert.equal(screen.nodes.length, 0);
});

test('long feedback remains fully readable in bounded scrolling space through short landscape and large-text resize', () => {
  const message = '当前不能确认是否存在新的设备告警。请以真实设备状态为准，不会显示演示告警。'.repeat(8);
  const screen = mountAuthScreen({ screen: 'toast', notice: { ...notice, message }, onDismiss: () => {},
    width: 390, height: 844, insets: { top: 24, bottom: 24, left: 0, right: 0 } });
  const scrollingCopy = () => screen.nodes.find(node => node.type === 'ScrollView');
  assert.ok(scrollingCopy(), 'long feedback needs scrolling, not two-line truncation');
  assert.ok(screen.copy.includes(message));
  assert.ok(screen.nodes.filter(node => node.type === 'Text').every(node => node.props.numberOfLines == null));
  const portraitLimit = flatten(scrollingCopy().props.style).maxHeight;
  screen.resize({ width: 753, height: 471, fontScale: 1.5, insets: { top: 0, bottom: 24, left: 48, right: 16 } });
  const landscapeLimit = flatten(scrollingCopy().props.style).maxHeight;
  assert.ok(landscapeLimit > 0 && landscapeLimit <= 471 - 24);
  assert.ok(landscapeLimit < portraitLimit);
  assert.ok(screen.copy.includes(message), 'resizing must not drop or replace pending feedback');
  screen.resize({ width: 320, height: 240, fontScale: 2, insets: { top: 24, bottom: 24, left: 0, right: 0 } });
  assert.ok(flatten(scrollingCopy().props.style).maxHeight <= 240 - 48);
  const close = screen.nodes.find(node => node.type === 'Pressable');
  assert.ok(flatten(close.props.style({ pressed: false })).minHeight >= 48);
});

test('an already-safe parent does not apply landscape and bottom insets a second time', () => {
  const screen = mountAuthScreen({ screen: 'toast', notice, onDismiss: () => {}, width: 753, height: 471,
    insets: { top: 0, bottom: 24, left: 48, right: 16 } });
  const padding = () => {
    const { paddingLeft, paddingRight, paddingBottom } = flatten(screen.nodes[0].props.style);
    return [paddingLeft, paddingRight, paddingBottom];
  };
  assert.deepEqual(padding(), [60, 28, 24], 'standalone feedback still protects the system safe area');
  screen.render({ withinSafeArea: true });
  assert.deepEqual(padding(), [18, 18, 8], 'main shell already owns the system insets');
  assert.match(screen.copy, /当前不能确认是否存在新的设备告警/);
});
