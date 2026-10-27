import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const ROOT = new URL('../', import.meta.url);
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const appFile = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function nodeText(name) {
  let found;
  const visit = node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(appFile) === name)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(appFile);
  assert.ok(found, `missing App.tsx symbol ${name}`);
  if (ts.isFunctionDeclaration(found)) return found.getText(appFile);
  return found.declarationList.declarations.find(item => item.name.getText(appFile) === name).initializer.getText(appFile);
}

function evaluateFunction(name, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(`${nodeText(name)}; module.exports = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, ...globals }, { filename: `App.${name}.tsx` });
  return module.exports;
}

const humanizeAuthError = evaluateFunction('humanizeAuthError', {
  SupabaseConfigurationError: class SupabaseConfigurationError extends Error {},
});
const operationModule = (() => {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('src/services/authSessionOperation.ts', ROOT), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, Set, console }, { filename: 'authSessionOperation.ts' });
  return module.exports;
})();

function makeState({ purpose = 'password-recovery', pending = true, sendError = null, resendError = null, pendingPromise = null } = {}) {
  const events = [];
  const send = pendingPromise ?? Promise.resolve();
  const recoveryError = sendError ?? resendError;
  const context = {
    accountBusy: false,
    otpDeliveryInFlightRef: { current: false },
    pendingVerification: pending ? { email: 'qa@example.com', purpose } : null,
    setAccountBusy(value) { context.accountBusy = value; events.push(['busy', value]); },
    setAuthError(value) { events.push(['error', value]); },
    setPendingVerification(value) { context.pendingVerification = value; events.push(['pending', value]); },
    setStage(value) { events.push(['stage', value]); },
    notify(...args) { events.push(['notify', ...args]); },
    humanizeAuthError,
    authService: {
      sendPasswordRecoveryOtp: async email => { events.push(['recovery-send', email]); if (recoveryError) throw recoveryError; await send; },
      resendSignupOtp: async email => { events.push(['signup-resend', email]); if (resendError) throw resendError; },
    },
  };
  return { context, events };
}

function bindHandler(name, context) {
  const keys = Object.keys(context);
  const code = ts.transpileModule(`function createHandler(${keys.join(',')}) { const ${name} = ${nodeText(name)}; return ${name}; } module.exports = createHandler;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Error, Promise }, { filename: `App.${name}.tsx` });
  return module.exports(...keys.map(key => context[key]));
}

test('forgot-password delivery failure keeps stage/pending unchanged and clears busy state', async () => {
  const error = new operationModule.AuthSessionOperationBusyError();
  const state = makeState({ pending: false, sendError: error });
  const handler = bindHandler('handleForgotPassword', state.context);
  await handler('qa@example.com');
  assert.equal(state.events.some(event => event[0] === 'stage'), false);
  assert.equal(state.events.some(event => event[0] === 'pending'), false);
  assert.equal(state.events.some(event => event[0] === 'notify' && event[1] === '验证码已发送'), false);
  assert.equal(state.events.filter(event => event[0] === 'error').at(-1)?.[1], error.message);
  assert.equal(state.context.accountBusy, false);
  assert.equal(state.context.otpDeliveryInFlightRef.current, false);
});

test('forgot-password uncertain delivery uses the fixed user-facing message', async () => {
  const error = new Error('邮件发送结果暂时无法确认，请先检查收件箱和垃圾邮件，稍后再试。');
  const state = makeState({ pending: false, sendError: error });
  await bindHandler('handleForgotPassword', state.context)('qa@example.com');
  assert.equal(state.events.filter(event => event[0] === 'error').at(-1)?.[1], error.message);
  assert.equal(state.context.pendingVerification, null);
  assert.equal(state.context.accountBusy, false);
});

for (const purpose of ['signup', 'password-recovery']) {
  test(`resend ${purpose} failure rethrows the same error without success notification`, async () => {
    const error = new operationModule.AuthSessionOperationBusyError();
    const state = makeState({ purpose, resendError: error });
    const handler = bindHandler('handleResendVerification', state.context);
    await assert.rejects(handler(), caught => caught === error);
    assert.equal(state.events.filter(event => event[0] === 'error').at(-1)?.[1], error.message);
    assert.equal(state.events.some(event => event[0] === 'notify' && event[1] === '验证码已重新发送'), false);
    assert.equal(state.context.accountBusy, false);
    assert.equal(state.context.otpDeliveryInFlightRef.current, false);
  });
}

test('successful recovery delivery navigates once and repeated pending call does not duplicate dispatch', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const state = makeState({ pendingPromise: pending });
  const handler = bindHandler('handleForgotPassword', state.context);
  const first = handler('qa@example.com');
  const second = handler('qa@example.com');
  assert.equal(state.events.filter(event => event[0] === 'recovery-send').length, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(state.events.filter(event => event[0] === 'recovery-send').length, 1);
  assert.equal(state.events.filter(event => event[0] === 'stage' && event[1] === 'verify-recovery').length, 1);
  assert.equal(state.events.filter(event => event[0] === 'notify' && event[1] === '验证码已发送').length, 1);
  assert.equal(state.context.accountBusy, false);
  assert.equal(state.context.otpDeliveryInFlightRef.current, false);
});
