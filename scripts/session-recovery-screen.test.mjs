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
const setterNames = ['setRecoveryExitBusy', 'setRecoveryExitError', 'setNotice', 'setRecoveryLink',
  'setPasswordNonceRequired', 'setPendingVerification', 'setPendingAppleDisplayNames', 'setAppleRecoveryProbe',
  'setDevice', 'setSelectedModel', 'setRobotConnectionVisible', 'setActiveTab', 'setAuthError', 'setStage'];
test('session transport failure explains recovery actions without claiming password rejection', () => {
  const fn = nodes.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'humanizeAuthError');
  const humanize = evaluate(fn.getText(ast), { Error, SupabaseConfigurationError: class extends Error {} });
  assert.equal(humanize(new Error('Failed to send a request to the Edge Function')), '暂时无法连接账户会话服务。请重新尝试，或退出本机账户后重新登录。');
});
function logoutHarness(logoutLocalSession) {
  const history = [];
  const context = { logoutLocalSession, recoveryExitInFlight: { current: false },
    authCallbackInbox: { current: { invalidate: () => history.push(['invalidate']) } },
    initialAuthUrl: { current: { delivered: false, promise: null } }, authCallbackUi: { current: { owner: 'old' } },
    clearRecovery: () => history.push(['clearRecovery']), notify: (...args) => history.push(['notice', ...args]),
    humanizeAuthError: () => '本机退出失败，请重试。',
  };
  for (const name of setterNames) context[name] = value => history.push([name, value]);
  const declaration = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'handleRecoveryLogout');
  return { run: evaluate(declaration.initializer.arguments[0].getText(ast), context), history, context };
}

test('recovery exit clears local session without dispatching cloud revocation and ignores double tap', async () => {
  let finish, calls = 0;
  const h = logoutHarness(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const pending = h.run();
  await h.run();
  assert.equal(calls, 1);
  assert.equal(h.context.authCallbackUi.current.owner, null);
  assert.equal(h.history.some(x => x[0] === 'setStage'), false);
  finish(); await pending;
  assert.ok(h.history.some(x => x[0] === 'setStage' && x[1] === 'login'));
  assert.ok(h.history.some(x => x[0] === 'notice' && x[2].includes('云端终端撤销尚未确认')));
  assert.equal(h.context.recoveryExitInFlight.current, false);
});

test('failed local cleanup stays on recovery and surfaces an actionable error', async () => {
  const h = logoutHarness(async () => { throw new Error('synthetic storage failure'); });
  await h.run();
  assert.ok(h.history.some(x => x[0] === 'setRecoveryExitError' && x[1] === '本机退出失败，请重试。'));
  assert.equal(h.history.some(x => x[0] === 'setStage'), false);
  assert.deepEqual(h.history.at(-1), ['setRecoveryExitBusy', false]);
});

test('recovery screen renders retry, local logout, busy status and visible feedback', () => {
  const fn = nodes.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'ServiceErrorScreen');
  const context = { React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) },
    useAppTheme: () => ({ colors: {} }), styles: {}, SafeAreaProvider: 'Provider', SafeAreaView: 'Safe',
    View: 'View', Text: 'Text', GradientButton: 'Button', Pressable: 'Pressable' };
  const render = evaluate(fn.getText(ast), context);
  let retries = 0, exits = 0;
  const renderWith = busy => render({ busy, logoutBusy: busy, message: '会话服务暂不可用', title: '无法恢复账户会话',
    feedback: '本机退出失败，请重试。', onRetry: () => retries++, onLogout: () => exits++ });
  const flatten = node => typeof node === 'object' && node ? [node, ...node.children.flatMap(flatten)] : [];
  let tree = flatten(renderWith(false));
  tree.find(x => x.type === 'Button').props.onPress();
  tree.find(x => x.props.testID === 'service-error-logout').props.onPress();
  assert.equal(retries, 1); assert.equal(exits, 1);
  assert.ok(tree.find(x => x.props.testID === 'service-error-feedback').children.includes('本机退出失败，请重试。'));
  tree = flatten(renderWith(true));
  assert.equal(tree.find(x => x.props.testID === 'service-error-logout').props.disabled, true);
  assert.ok(tree.some(x => x.children.includes('正在退出…')));
});
