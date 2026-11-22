import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

test('home columns fit measured post-safe-area width without double-reserving navigation', () => {
  for (const available of [882, 946, 1202]) {
    const screen = home({ width: 1280, height: 800 });
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: available, height: 688 } } });
    screen.render();
    const primary = screen.nodes.find(node => node.props?.testID === 'home-primary-column');
    const secondary = screen.nodes.find(node => node.props?.testID === 'home-secondary-column');
    const scroll = screen.nodes.find(node => node.type === 'ScrollView');
    const content = flatten(scroll.props.contentContainerStyle);
    assert.equal(content.flexDirection, 'row');
    assert.equal(flatten(primary.props.style).width + flatten(secondary.props.style).width + content.gap + content.paddingHorizontal * 2, available);
    assert.equal(content.paddingRight, undefined);
  }
  for (const config of [{ width: 960, height: 600, fontScale: 1.6 }, { width: 844, height: 390, fontScale: 1.5 }, { width: 600, height: 390 }]) {
    const screen = home(config);
    screen.nodes[0].props.onLayout({ nativeEvent: { layout: { width: config.width - 78, height: config.height - 112 } } });
    screen.render();
    const scroll = screen.nodes.find(node => node.type === 'ScrollView');
    assert.notEqual(flatten(scroll.props.contentContainerStyle).flexDirection, 'row');
  }
});

function home(props = {}) {
  return mountAuthScreen({ screen: 'home', robotImage: 'selected-robot', robotName: 'THUNDER 01', connected: false, canRecall: false, safetyLock: false, onRecall: () => {}, onOpenControl: () => {}, onOpenRoutes: () => {}, onOpenTasks: () => {}, onOpenSafety: () => {}, ...props });
}
test('product home has four feature entries and no invented disconnected data', () => {
  const screen=home({hasDevice:false,batteryPercent:86,transport:'5G',updatedAt:'2026-11-11T14:32:00+08:00',journey:{locationLabel:'园区东侧'}});
  assert.match(screen.copy,/未连接.*连接你的第一台机器狗/);
  assert.doesNotMatch(screen.copy,/86|5G|园区东侧|14:32|召回|控制中心/);
  assert.equal(screen.nodes.filter(n=>n.props?.testID==='home-robot').length,1);
  for(const key of ['video','maps','tasks','settings']) assert.ok(screen.action('home-feature-'+key));
});

test('only connected finite battery is displayed, including zero',()=>{
  for(const value of [0,86,100])assert.ok(home({connected:true,batteryPercent:value}).nodes.some(n=>n.props?.testID==='home-battery'));
  for(const value of [undefined,null,NaN,Infinity,-1,101])assert.equal(home({connected:true,batteryPercent:value}).nodes.some(n=>n.props?.testID==='home-battery'),false);
});

test('actions preserve destinations and disconnected video never requests streaming',()=>{
  const calls=[];
  const screen=home({hasDevice:false,onConnect:()=>calls.push('connect'),onOpenVideo:()=>calls.push('video'),onOpenRoutes:()=>calls.push('maps'),onOpenTasks:()=>calls.push('tasks'),onOpenSafety:()=>calls.push('settings')});
  screen.action('home-primary').props.onPress();screen.action('home-feature-video').props.onPress();
  assert.deepEqual(calls,['connect','connect']);
  screen.render({connected:true,hasDevice:true});
  for(const key of ['video','maps','tasks','settings'])screen.action('home-feature-'+key).props.onPress();
  screen.action('home-primary').props.onPress();
  assert.deepEqual(calls,['connect','connect','video','maps','tasks','settings','settings']);
});

test('a selected LAN camera opens from home while the control service is offline',()=>{
  const calls=[];
  const direct=home({connected:false,onOpenDirectVideo:()=>calls.push('video'),onConnect:()=>calls.push('connect')});
  direct.action('home-feature-video').props.onPress();
  assert.deepEqual(calls,['video']);
});

test('guide and activity panels can be opened and dismissed',()=>{
  const screen=home({hasDevice:false});
  screen.action('home-bottom-card').props.onPress();screen.render();
  assert.match(screen.copy,/准备地图/);
  screen.action('home-panel-close').props.onPress();screen.render();
  assert.doesNotMatch(screen.copy,/准备地图/);
  screen.render({hasDevice:true,activities:[{id:'a',title:'位置已更新',at:'2026-11-11T14:32:00+08:00'}]});
  screen.action('home-bottom-card').props.onPress();screen.render();
  assert.match(screen.copy,/位置已更新/);
});

test('home mounts authorized remote status only while its panel is open', () => {
  const screen = home({ remoteStatus: 'AUTHORIZED_REMOTE_STATUS' });
  assert.doesNotMatch(screen.copy, /AUTHORIZED_REMOTE_STATUS/);
  screen.action('home-remote-status').props.onPress(); screen.render();
  assert.match(screen.copy, /AUTHORIZED_REMOTE_STATUS/);
  screen.action('home-panel-close').props.onPress(); screen.render();
  assert.doesNotMatch(screen.copy, /AUTHORIZED_REMOTE_STATUS/);
  assert.equal(home().action('home-remote-status'), undefined);
});
