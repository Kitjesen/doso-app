import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { bindVideoOrigin, directVideoOrigin, videoTargetKey } from '../src/features/video/videoBinding.ts';

test('video selection belongs to the selected direct robot and same gateway host', () => {
  const robot = { host: '192.168.66.64', port: 13145, transport: 'lan-dev' };
  const key = bindVideoOrigin('account-1', robot, 'http://192.168.66.64:8000');
  assert.equal(key, videoTargetKey('account-1', robot));
  assert.equal(bindVideoOrigin('account-1', robot, 'http://192.168.66.65:8000'), null);
  assert.equal(bindVideoOrigin(null, robot, 'http://192.168.66.64:8000'), null);
  assert.notEqual(key, videoTargetKey('account-2', robot));
  assert.notEqual(key, videoTargetKey('account-1', { ...robot, port: 13146 }));
  assert.notEqual(key, videoTargetKey('account-1', { ...robot, clientIdentityAlias: 'other' }));
});

test('direct LAN endpoints derive the sibling WebRTC gateway', () => {
  assert.equal(directVideoOrigin({ host: '192.168.66.64', port: 13145, transport: 'lan-dev' }), 'http://192.168.66.64:5050');
  assert.equal(directVideoOrigin({ host: '2001:db8::64', port: 13145, transport: 'lan-dev' }), 'http://[2001:db8::64]:5050');
  assert.equal(directVideoOrigin({ host: '192.168.66.64', port: 13145, transport: 'tls' }), null);
  assert.equal(directVideoOrigin(null), null);
});
