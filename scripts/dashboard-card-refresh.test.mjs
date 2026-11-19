import assert from 'node:assert/strict';
import test from 'node:test';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';
const flat=s=>Object.assign({},...[s].flat(Infinity).filter(Boolean));
const mount=(props={})=>mountAuthScreen({screen:'home',robotName:'THUNDER 01',robotImage:'robot',connected:false,safetyLock:false,onOpenRoutes(){},onOpenTasks(){},onOpenSafety(){},...props});
test('product cards grow at large font scales and preserve usable actions',()=>{
  for(const dark of [false,true]){
    const screen=mount({fontScale:1.6,dark});
    for(const key of ['video','maps','tasks','settings']){
      const node=screen.action('home-feature-'+key),style=flat(node.props.style({pressed:false}));
      assert.equal(style.width,'100%');assert.equal(style.height,undefined);assert.ok(style.minHeight>=44);
    }
    const footer=screen.nodes.find(n=>n.props?.testID==='home-device-header');
    assert.equal(flat(footer.props.style).flexDirection,'column');
    assert.ok(flat(screen.action('home-primary').props.style({pressed:false})).minHeight>=44);
  }
});
test('feature layout responds to measured usable width',()=>{
  const screen=mount({width:844,height:390});
  screen.nodes[0].props.onLayout({nativeEvent:{layout:{width:270,height:300}}});screen.render();
  assert.equal(flat(screen.action('home-feature-maps').props.style({pressed:false})).width,'100%');
});
