import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

const flat=style=>Object.assign({},...[style].flat(Infinity).filter(Boolean));
const mount=(options={})=>mountAuthScreen({screen:'home',robotName:'THUNDER 01',robotImage:'selected-robot',connected:false,canRecall:false,safetyLock:false,onRecall:()=>{},onOpenControl:()=>{},onOpenRoutes:()=>{},onOpenTasks:()=>{},onOpenSafety:()=>{},...options});
const node=(screen,id)=>screen.nodes.find(n=>n.props?.testID===id);

test('device card separates identity, truthful status and battery hero in both themes',()=>{
  for(const dark of [false,true]){
    const screen=mount({dark});
    assert.equal(flat(node(screen,'home-device-card').props.style).borderRadius,20);
    assert.equal(flat(node(screen,'home-device-header').props.style).position,undefined);
    assert.ok(node(screen,'home-device-hero'));
    assert.ok(node(screen,'home-connection-state'));
    assert.match(screen.copy,/THUNDER 01/);assert.match(screen.copy,/离线/);
    assert.match(screen.copy,/电量待同步/);assert.equal(node(screen,'home-battery-meter'),undefined);
    assert.equal(screen.nodes.filter(n=>n.type==='Image'&&n.props.source==='selected-robot').length,1);
  }
});

test('battery fill appears only for a finite trusted value, including real zero',()=>{
  for(const batteryPercent of [0,37,100]){
    const screen=mount({batteryPercent});
    const meter=node(screen,'home-battery-meter');assert.ok(meter);
    assert.equal(meter.props.accessibilityRole,'progressbar');
    assert.equal(meter.props.accessibilityValue.now,batteryPercent);
    assert.equal(meter.props.accessibilityValue.max,100);
    assert.equal(flat(node(screen,'home-battery-fill').props.style).width,`${batteryPercent}%`);
  }
  for(const batteryPercent of [undefined,null,NaN,Infinity,-1,101]){
    assert.equal(node(mount({batteryPercent}),'home-battery-meter'),undefined);
  }
});

test('narrow and large-text device hero stacks instead of squeezing text beside the photo',()=>{
  for(const dimensions of [{width:320},{width:390,fontScale:1.6}]){
    const screen=mount(dimensions);
    assert.equal(flat(node(screen,'home-device-hero').props.style).flexDirection,'column');
    assert.equal(flat(node(screen,'home-device-header').props.style).flexWrap,'wrap');
  }
  const screen=mount();
  assert.equal(flat(node(screen,'home-device-hero').props.style).flexDirection,'row');
});

test('measured content width wins over a wide window for device and quick cards',()=>{
  const screen=mount({width:844,height:390});
  screen.nodes[0].props.onLayout({nativeEvent:{layout:{width:300,height:278}}});
  screen.render();
  assert.equal(flat(node(screen,'home-device-hero').props.style).flexDirection,'column');
  assert.equal(flat(node(screen,'home-quick-list').props.style).flexDirection,'column');
});

test('connected but unavailable recall does not ask the user to connect again',()=>{
  const screen=mount({connected:true,canRecall:false,recallBlockedReason:'执行器未接入'});
  assert.match(screen.copy,/已连接/);assert.match(screen.copy,/当前召回不可用/);
  assert.doesNotMatch(screen.copy,/连接设备后可检查权限/);
  const recall=screen.action('home-recall');
  assert.equal(recall.props.disabled,true);assert.equal(recall.props.accessibilityHint,'执行器未接入');
});
