import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const ROOT=new URL('../',import.meta.url);
const source=readFileSync(new URL('App.tsx',ROOT),'utf8');
const app=ts.createSourceFile('App.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return{promise,resolve};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const userId='11111111-1111-4111-8111-111111111111';
const sessionId='22222222-2222-4222-8222-222222222222';
const returnedSession={user:{id:userId},access_token:`fixture.${Buffer.from(JSON.stringify({session_id:sessionId})).toString('base64url')}.unsigned`};
function find(name){let result;const visit=node=>{if(ts.isVariableDeclaration(node)&&node.name.getText(app)===name)result=node.initializer;if(ts.isFunctionDeclaration(node)&&node.name?.text===name)result=node;ts.forEachChild(node,visit);};visit(app);assert.ok(result,`missing App symbol ${name}`);return result.getText(app);}
function evaluate(text,globals){const module={exports:{}};const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,Error,TypeError,Promise,Map,Set,URL,URLSearchParams,queueMicrotask,...globals});return module.exports;}
function loadProduction(getClient){const modules=new Map();function load(path){if(modules.has(path))return modules.get(path).exports;const module={exports:{}};modules.set(path,module);const text=readFileSync(new URL(path,ROOT),'utf8');const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,Error,TypeError,Promise,Map,Set,URL,URLSearchParams,queueMicrotask,atob,TextDecoder,process:{env:{}},console,require(name){if(name==='./supabaseClient')return{getSupabaseClient:getClient};if(name.startsWith('.'))return load(`src/services/${name.slice(2)}.ts`);throw new Error('Unexpected callback fixture import');}},{filename:path});return module.exports;}return{service:load('src/services/authService.ts'),coordinator:load('src/services/authSessionOperation.ts'),load};}
function build({initialUrl='doso://auth/reset-password?code=fixture-code',loading=true,sdkError=null,sdkHold=null,initialHold=null}={}){
  let sdkCalls=0,getters=0,initialCalls=0,listener=null,cleanup=null;
  const events=[];
  const api=loadProduction(()=>{getters++;return{auth:{async exchangeCodeForSession(){sdkCalls++;if(sdkHold)await sdkHold;if(sdkError)return{data:{session:null},error:sdkError};return{data:{session:returnedSession},error:null};}}};});
  const humanize=evaluate(`${find('humanizeAuthError')};module.exports=humanizeAuthError;`,{SupabaseConfigurationError:class extends Error{}});
  const context={authService:api.service,authLoading:loading,accountBusy:false,
    clearRecovery(){},logout(){throw new Error('Unexpected logout SDK boundary');},
    authCallbackDeduper:{current:api.service.createAuthCallbackDeduper(20)},
    authCallbackGate:{current:{loading,busy:false}},accountFlowInFlightRef:{current:false},
    exchangeSessionFromUrl:api.service.exchangeSessionFromUrl,humanizeAuthError:humanize,
    useCallback:fn=>fn,useRef:value=>({current:value}),
    getAuthSessionOperationSnapshot:api.coordinator.getAuthSessionOperationSnapshot,
    subscribeAuthSessionOperations:api.coordinator.subscribeAuthSessionOperations,
    Linking:{async getInitialURL(){initialCalls++;if(initialHold)await initialHold;return initialUrl;},addEventListener(_name,callback){listener=callback;return{remove(){listener=null;}};}},
    setAccountBusy(value){context.accountBusy=value;context.authCallbackGate.current.busy=value;events.push(['busy',value]);},
    setAuthError(value){events.push(['error',value]);},setRecoveryLink(value){events.push(['recovery',value]);context.onRecovery?.(value);},
    setPasswordNonceRequired(value){events.push(['nonce',value]);},setStage(value){events.push(['stage',value]);},notify(...args){events.push(['notify',...args]);}};
  if(existsSync(new URL('src/services/authCallbackInbox.ts',ROOT))){const inboxApi=api.load('src/services/authCallbackInbox.ts');context.createAuthCallbackInbox=inboxApi.createAuthCallbackInbox;context.AuthCallbackCancelledError=inboxApi.AuthCallbackCancelledError;context.readAuthSessionIdentity=api.load('src/services/authSessionIdentity.ts').readAuthSessionIdentity;context.authCallbackInbox=evaluate(`module.exports=${find('authCallbackInbox')};`,context);}
  context.initialAuthUrl=evaluate(`module.exports=${find('initialAuthUrl')};`,context);
  context.authCallbackUi=evaluate(`module.exports=${find('authCallbackUi')};`,context);
  context.handleAuthUrl=evaluate(`module.exports=${find('handleAuthUrl')};`,context);
  context.handleLogout=()=>evaluate(`module.exports=${find('handleLogout')};`,context)();
  const effect=needle=>{let body;const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText(app)==='useEffect'&&node.getText(app).includes(needle))body=node.arguments[0].getText(app);ts.forEachChild(node,visit);};visit(app);return body?evaluate(`module.exports=${body};`,context):null;};
  return{api,context,events,get sdkCalls(){return sdkCalls;},get getters(){return getters;},get initialCalls(){return initialCalls;},
    mount(){cleanup=effect('Linking.getInitialURL')();},unmount(){cleanup?.();},
    identity(key,restoring=false){hostIdentity(key,restoring);},
    preparedIdentityReset(){effect('}, [displayRecoveryIdentity]')();},
    setLoading(value){context.authLoading=value;context.authCallbackGate.current.loading=value;effect('authCallbackInbox.current.resume')?.();},
    emit(url){listener?.({url});},async settle(){for(let n=0;n<8;n++)await turn();}};
  function hostIdentity(key,restoring){context.mfaIdentity=key?{userId:key.split(':')[0],sessionId:key.split(':')[1]}:null;context.authLoading=restoring;effect('authCallbackInbox.current.reconcileIdentity')?.();}
}

test('one initial recovery link waits for restoration and exchanges once after release without URL re-emission',async t=>{
  const host=build(),gate=deferred();
  const holding=host.api.coordinator.runAuthSessionOperation(()=>gate.promise);
  try{
    host.mount();await host.settle();assert.equal(host.sdkCalls,0);assert.equal(host.getters,0);
    gate.resolve();await holding;host.setLoading(false);await host.settle();
    t.diagnostic(JSON.stringify({scenario:'initial-link',initialUrlReads:host.initialCalls,sdkCalls:host.sdkCalls,getters:host.getters,
      resetPage:host.events.some(item=>item[0]==='stage'&&item[1]==='reset-password'),invalidNotice:host.events.some(item=>item[0]==='notify'&&item[1]==='认证链接无效')}));
    assert.equal(host.sdkCalls,1);assert.equal(host.initialCalls,1);
    assert.ok(host.events.some(item=>item[0]==='stage'&&item[1]==='reset-password'));
    assert.equal(host.events.some(item=>item[0]==='notify'&&item[1]==='认证链接无效'),false);
  }finally{gate.resolve();await holding;host.unmount();}
});

test('a social callback can exchange while its enclosing social-login UI is busy',async()=>{
  const host=build({initialUrl:null,loading:false});
  try{
    host.mount();host.context.setAccountBusy(true);
    const task=host.context.handleAuthUrl('doso://auth/callback?code=fixture-social');
    await host.settle();assert.equal(host.sdkCalls,1);
    await task;
  }finally{host.unmount();}
});

test('effect cleanup and immediate replay retain one initial URL read and publish recovery once',async()=>{
  const host=build({loading:false});
  try {
    host.mount();host.unmount();host.mount();await host.settle();
    assert.equal(host.initialCalls,1);
    assert.equal(host.sdkCalls,1);
    assert.equal(host.events.filter(item=>item[0]==='stage'&&item[1]==='reset-password').length,1);
  } finally {host.unmount();}
});

test('unmount cancels waiting intent instead of falsely resolving it',async()=>{
  const host=build({initialUrl:null,loading:true});
  host.mount();
  const outcome=host.context.handleAuthUrl('doso://auth/callback?code=waiting').then(()=> 'resolved',error=>error.name);
  host.unmount();await host.settle();
  assert.equal(await outcome,'AuthCallbackCancelledError');
  host.setLoading(false);await host.settle();assert.equal(host.sdkCalls,0);
});

test('known identity replacement cancels waiting callbacks, but first restoration does not',async()=>{
  const host=build({initialUrl:null,loading:true});host.mount();
  host.identity(null,true);
  const kept=host.context.handleAuthUrl('doso://auth/callback?code=bootstrap');
  host.identity('owner-a:session-a',true);host.setLoading(false);await kept;
  assert.equal(host.sdkCalls,1);
  host.setLoading(true);
  const cancelled=host.context.handleAuthUrl('doso://auth/callback?code=old-owner').then(()=> 'resolved',error=>error.name);
  host.identity('owner-a:session-b',true);host.setLoading(false);await host.settle();
  assert.equal(await cancelled,'AuthCallbackCancelledError');assert.equal(host.sdkCalls,1);
  host.unmount();
});

test('known logged-out baseline is not mistaken for bootstrap when another login establishes identity',async()=>{
  const host=build({initialUrl:null,loading:true});host.mount();host.identity(null,false);
  const cancelled=host.context.handleAuthUrl('doso://auth/callback?code=other-login').then(()=> 'resolved',error=>error.name);
  host.identity('owner-a:session-a',false);host.setLoading(false);await host.settle();
  assert.equal(await cancelled,'AuthCallbackCancelledError');assert.equal(host.sdkCalls,0);host.unmount();
});

test('explicit logout intent clears pending and a late initial URL even while UI is busy',async()=>{
  const initial=deferred(),host=build({initialHold:initial.promise});host.mount();host.context.setAccountBusy(true);
  const cancelled=host.context.handleAuthUrl('doso://auth/callback?code=pending-logout').then(()=> 'resolved',error=>error.name);
  await host.context.handleLogout();initial.resolve();host.setLoading(false);await host.settle();
  assert.equal(await cancelled,'AuthCallbackCancelledError');assert.equal(host.sdkCalls,0);host.unmount();
});

test('pending and active duplicates share a task; a distinct overflow is rejected',async()=>{
  const sdk=deferred(),host=build({initialUrl:null,loading:true,sdkHold:sdk.promise});host.mount();
  const first=host.context.handleAuthUrl('doso://auth/callback?code=one');
  assert.equal(host.context.handleAuthUrl('doso://auth/callback?code=one'),first);
  await assert.rejects(host.context.handleAuthUrl('doso://auth/callback?code=overflow'),/已有认证链接/);
  host.setLoading(false);await host.settle();assert.equal(host.sdkCalls,1);
  assert.equal(host.context.handleAuthUrl('doso://auth/callback?code=one'),first);
  const second=host.context.handleAuthUrl('doso://auth/callback?code=two').catch(error=>error.name);
  const repeatedSecond=host.context.handleAuthUrl('doso://auth/callback?code=two');
  assert.equal(repeatedSecond,host.context.handleAuthUrl('doso://auth/callback?code=two'));
  void repeatedSecond.catch(()=>undefined);
  await assert.rejects(host.context.handleAuthUrl('doso://auth/callback?code=three'),/已有认证链接/);
  sdk.resolve();await first;assert.equal(await second,'AuthCallbackCancelledError');
  await host.context.handleAuthUrl('doso://auth/callback?code=one');assert.equal(host.sdkCalls,1);host.unmount();
});

test('SDK failure publishes no recovery and subscription wakes do not retry it',async()=>{
  const host=build({loading:false,sdkError:new Error('fixture transport failure')});host.mount();await host.settle();
  assert.equal(host.sdkCalls,1);assert.equal(host.events.some(item=>item[0]==='stage'),false);
  for(let n=0;n<3;n++){await host.api.coordinator.runAuthSessionOperation(async()=>{});host.setLoading(false);}
  await host.settle();assert.equal(host.sdkCalls,1);host.unmount();
});

test('unmount during an active exchange keeps the lease until settle and suppresses late UI',async()=>{
  const sdk=deferred(),host=build({initialUrl:null,loading:false,sdkHold:sdk.promise});host.mount();
  const outcome=host.context.handleAuthUrl('doso://auth/reset-password?code=active').catch(error=>error.name);
  await host.settle();host.unmount();await host.settle();
  assert.equal(host.api.coordinator.getAuthSessionOperationSnapshot().busy,true);
  const count=host.events.length;sdk.resolve();assert.equal(await outcome,'AuthCallbackCancelledError');
  await host.settle();assert.equal(host.events.length,count);assert.equal(host.api.coordinator.getAuthSessionOperationSnapshot().busy,false);
});

test('own returned session transition is allowed exactly once; later identity changes cancel pending intent',async()=>{
  const host=build({initialUrl:null,loading:false});host.mount();host.identity(null,false);
  await host.context.handleAuthUrl('doso://auth/reset-password?code=own-exchange');
  host.identity(`${userId}:${sessionId}`,false);
  assert.ok(host.events.some(item=>item[0]==='stage'&&item[1]==='reset-password'));
  host.setLoading(true);
  const outcome=host.context.handleAuthUrl('doso://auth/callback?code=old-session').catch(error=>error.name);
  host.identity(`${userId}:33333333-3333-4333-8333-333333333333`,false);host.setLoading(false);
  assert.equal(await outcome,'AuthCallbackCancelledError');await host.settle();assert.equal(host.sdkCalls,1);host.unmount();
});

test('gate is rechecked at dispatch and unkeyed inputs never alias each other',async()=>{
  const host=build({initialUrl:null,loading:false});host.mount();
  const task=host.context.handleAuthUrl('doso://auth/callback?code=recheck');
  host.setLoading(true);await host.settle();assert.equal(host.sdkCalls,0);
  host.setLoading(false);await task;
  host.setLoading(true);
  const invalid=host.context.handleAuthUrl('doso://auth/callback').catch(error=>error.name);
  await assert.rejects(host.context.handleAuthUrl('doso://auth/callback?different=1'),/已有认证链接/);
  host.unmount();assert.equal(await invalid,'AuthCallbackCancelledError');
});

test('prepared identity invalidation does not clear an active callback busy owner',async()=>{
  const sdk=deferred(),host=build({initialUrl:null,loading:false,sdkHold:sdk.promise});host.mount();
  const task=host.context.handleAuthUrl('doso://auth/reset-password?code=held-busy').catch(error=>error.name);
  await host.settle();assert.equal(host.context.accountBusy,true);
  host.preparedIdentityReset();assert.equal(host.context.accountBusy,true);
  await host.context.handleLogout();sdk.resolve();assert.equal(await task,'AuthCallbackCancelledError');
  assert.equal(host.events.some(item=>item[0]==='stage'),false);assert.equal(host.context.accountBusy,false);host.unmount();
});

test('own identity effect before task settlement does not cancel its successful recovery',async()=>{
  const host=build({initialUrl:null,loading:false});host.mount();host.identity('previous:session',false);
  host.context.onRecovery=value=>{if(value)queueMicrotask(()=>host.identity(`${userId}:${sessionId}`,false));};
  await host.context.handleAuthUrl('doso://auth/reset-password?code=own-transition');
  assert.equal(host.sdkCalls,1);assert.ok(host.events.some(item=>item[0]==='stage'&&item[1]==='reset-password'));
  host.unmount();
});

test('a late initial URL after real unmount cannot reach the getter or SDK',async()=>{
  const initial=deferred(),host=build({loading:false,initialHold:initial.promise});host.mount();host.unmount();
  await host.settle();initial.resolve();await host.settle();
  assert.equal(host.initialCalls,1);assert.equal(host.getters,0);assert.equal(host.sdkCalls,0);assert.equal(host.events.length,0);
});
