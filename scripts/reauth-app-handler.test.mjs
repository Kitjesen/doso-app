import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findFunction(name) {
  let found = null;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) && node.name?.text === name)
      || (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(file) === name))) {
      found = node;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(found, `missing App.tsx symbol ${name}`);
  return found;
}

function functionText(name) {
  const node = findFunction(name);
  if (ts.isFunctionDeclaration(node)) return node.getText(file);
  const declaration = node.declarationList.declarations.find(item => item.name.getText(file) === name);
  return `${name} = ${declaration.initializer.getText(file)}`;
}

function evaluateFunction(name, globals = {}) {
  const code = ts.transpileModule(`${functionText(name)}; module.exports = ${name};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, ...globals }, { filename: `App.${name}.tsx` });
  return module.exports;
}

const humanizeAuthError = evaluateFunction('humanizeAuthError', {
  SupabaseConfigurationError: class SupabaseConfigurationError extends Error {},
});
const operationModule = (() => {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../src/services/authSessionOperation.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, Promise, Set, console }, { filename: 'authSessionOperation.ts' });
  return module.exports;
})();

function buildHandler({ busy = false, nonceError = null, noncePromise = null } = {}) {
  const events = [];
  const nonce = noncePromise ?? (nonceError ? Promise.reject(nonceError) : Promise.resolve());
  let context;
  context = {
    accountBusy: busy,
    otpDeliveryInFlightRef: { current: false },
    accountSecurityNonceAttemptRef: { current: 0 },
    setAccountBusy(value) { context.accountBusy = value; events.push(['accountBusy', value]); },
    setAuthError(value) { events.push(['authError', value]); },
    setPasswordNonceRequired(value) { events.push(['nonceRequired', value]); },
    setRecoveryLink(value) { events.push(['recoveryLink', value]); },
    setStage(value) { events.push(['stage', value]); },
    notify(...args) { events.push(['notify', ...args]); },
    authService: { sendReauthenticationNonce: async () => { events.push(['dispatch']); return nonce; } },
    humanizeAuthError,
  };
  const contextKeys = Object.keys(context);
  const wrapperCode = ts.transpileModule(`function createHandler(${contextKeys.join(',')}) { ${functionText('handleRequestPasswordChange')}; return handleRequestPasswordChange; } module.exports = createHandler;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const wrapperModule = { exports: {} };
  vm.runInNewContext(wrapperCode, { module: wrapperModule, exports: wrapperModule.exports, Error, Promise }, { filename: 'App.handleRequestPasswordChange.tsx' });
  const result = wrapperModule.exports(...contextKeys.map(key => context[key]));
  return { context, events, handler: result ?? context.handleRequestPasswordChange };
}

test('an already busy account handler returns without dispatch or navigation', async () => {
  const state = buildHandler({ busy: true });
  await state.handler();
  assert.deepEqual(state.events, []);
  assert.equal(state.context.accountBusy, true, 'an unrelated UI owner is not cleared');
  assert.equal(state.context.otpDeliveryInFlightRef.current, false);
});

test('busy coordinator error is shown without entering reset-password or reporting success', async () => {
  const error = new operationModule.AuthSessionOperationBusyError();
  const state = buildHandler({ nonceError: error });
  await state.handler();
  assert.equal(state.events.filter(event => event[0] === 'dispatch').length, 1);
  const failure = state.events.find(event => event[0] === 'notify' && event[1] === '无法发送安全验证码');
  assert.equal(failure?.[2], error.message);
  assert.equal(state.events.some(event => event[0] === 'stage' && event[1] === 'reset-password'), false);
  assert.equal(state.events.some(event => event[0] === 'notify' && String(event[1]).includes('安全验证码已发送')), false);
  assert.equal(state.context.accountBusy, false);
  assert.equal(state.context.otpDeliveryInFlightRef.current, false);
});

test('uncertain timeout is reported as failure and always releases handler locks', async () => {
  const state = buildHandler({ nonceError: new Error('安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。') });
  await state.handler();
  const failure = state.events.find(event => event[0] === 'notify' && event[1] === '无法发送安全验证码');
  assert.equal(failure?.[2], '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。');
  assert.equal(state.events.some(event => event[0] === 'stage'), false);
  assert.equal(state.context.accountBusy, false);
  assert.equal(state.context.otpDeliveryInFlightRef.current, false);
});

test('repeated same-tick call dispatches only once while nonce delivery is pending', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const state = buildHandler({ noncePromise: pending });
  const first = state.handler();
  const second = state.handler();
  assert.equal(state.events.filter(event => event[0] === 'dispatch').length, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(state.events.filter(event => event[0] === 'dispatch').length, 1);
  assert.equal(state.events.filter(event => event[0] === 'nonceRequired' && event[1] === true).length, 1);
  assert.equal(state.events.filter(event => event[0] === 'recoveryLink' && event[1] === true).length, 1);
  assert.equal(state.events.filter(event => event[0] === 'stage' && event[1] === 'reset-password').length, 1);
  assert.equal(state.events.filter(event => event[0] === 'notify' && event[1] === '安全验证码已发送').length, 1);
  assert.equal(state.context.accountBusy, false);
  assert.equal(state.context.otpDeliveryInFlightRef.current, false);
});

test('a stale attempt cannot enter reset-password after leaving account security', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const state = buildHandler({ noncePromise: pending });
  const attempt = state.handler();
  state.context.accountSecurityNonceAttemptRef.current += 1;
  release();
  await attempt;
  assert.equal(state.events.some(event => event[0] === 'stage' && event[1] === 'reset-password'), false);
  assert.equal(state.context.accountBusy, false);
  assert.equal(state.context.otpDeliveryInFlightRef.current, false);
});
