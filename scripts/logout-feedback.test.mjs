import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(ast);
function evaluate(expression, context) {
  return vm.runInNewContext(ts.transpileModule(`(${expression})`, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS,
  } }).outputText, context);
}
function harness(revoke) {
  const history = [];
  const context = {
    authCallbackInbox: { current: { invalidate() {} } }, initialAuthUrl: { current: {} },
    authCallbackUi: { current: {} }, accountFlowInFlightRef: { current: false }, accountBusy: false,
    clearRecovery() {}, isSupabaseConfigured: true, revokeCurrentTerminal: revoke,
    isAccountSessionOutcomeError: error => error.code === 'session-cleanup-unconfirmed',
    revokeCurrentTerminalWithoutAudit: async () => { throw new Error('must not fall back'); },
    logout: async () => { throw new Error('must not fall back'); },
    humanizeAuthError: error => error.message, notify: (...args) => history.push(['notice', ...args]),
  };
  for (const name of ['setRecoveryLink', 'setAccountBusy', 'setLogoutPending', 'setAuthError',
    'setPendingAppleDisplayNames', 'setAppleRecoveryProbe', 'setPasswordNonceRequired',
    'setPendingVerification', 'setDevice', 'setSelectedModel', 'setActiveTab', 'setStage']) {
    context[name] = value => history.push([name, value]);
  }
  const declaration = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleLogout');
  return { history, context, run: evaluate(declaration.initializer.arguments[0].getText(ast), context) };
}

test('normal logout shows pending, prevents repeat dispatch, and releases feedback state after uncertain cleanup', async () => {
  let reject, calls = 0;
  const h = harness(() => { calls++; return new Promise((_, no) => { reject = no; }); });
  const pending = h.run();
  assert.ok(h.history.some(x => x[0] === 'setLogoutPending' && x[1] === true));
  await h.run();
  assert.equal(calls, 1);
  reject(Object.assign(new Error('本机退出结果待核对'), { code: 'session-cleanup-unconfirmed' }));
  await pending;
  assert.ok(h.history.some(x => x[0] === 'notice' && x[1] === '退出结果待核对' && x[4] === null));
  assert.equal(h.history.some(x => x[0] === 'notice' && x[1] === '已退出登录'), false);
  assert.equal(h.context.accountFlowInFlightRef.current, false);
  assert.ok(h.history.some(x => x[0] === 'setLogoutPending' && x[1] === false));
  assert.ok(h.history.some(x => x[0] === 'setAccountBusy' && x[1] === false));
});

test('successful normal logout returns to login and finishes its pending state', async () => {
  const h = harness(async () => {});
  await h.run();
  assert.ok(h.history.some(x => x[0] === 'setStage' && x[1] === 'login'));
  assert.ok(h.history.some(x => x[0] === 'notice' && x[1] === '已退出登录'));
  assert.ok(h.history.some(x => x[0] === 'setLogoutPending' && x[1] === false));
});

test('global loading distinguishes explicit logout from session restoration', () => {
  const expression = nodes.find(n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'LoadingScreen'
    && n.attributes.properties.some(p => p.name?.getText(ast) === 'label' && p.getText(ast).includes('正在恢复安全会话')));
  assert.ok(expression);
  const context = { React: { createElement: (_, props) => props }, LoadingScreen: 'Loading',
    logoutPending: true, mfaVerificationPending: false };
  assert.equal(evaluate(expression.getText(ast), context).label, '正在退出当前账户…');
  context.logoutPending = false;
  assert.equal(evaluate(expression.getText(ast), context).label, '正在恢复安全会话…');
  context.mfaVerificationPending = true;
  assert.equal(evaluate(expression.getText(ast), context).label, '正在核对双重验证结果…');
});
