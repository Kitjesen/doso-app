import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { mountAuthScreen } from './helpers/auth-screen-harness.mjs';

test('login exposes read-only robot connection without submitting account credentials', () => {
  let opened = 0; let logins = 0;
  const host = mountAuthScreen({ screen: 'login', onOpenRobotConnection: () => opened++, onLogin: () => logins++ });
  const action = host.action('login-robot-connection');
  assert.ok(action, 'a production-visible local robot connection entry is required');
  action.props.onPress();
  assert.equal(opened, 1); assert.equal(logins, 0);
});

test('home no longer exposes a separate robot connection banner', () => {
  let opened = 0;
  const host = mountAuthScreen({ screen: 'home', connected: false, canRecall: false, robotName: 'THUNDER 01',
    safetyLock: true, onOpenRobotConnection: () => opened++ });
  const action = host.action('home-robot-connection');
  assert.equal(action, undefined); assert.equal(opened, 0);
});

test('local connection surface is separate from authenticated main and cannot create authority', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(source, /robotConnectionVisible\) return <SafeAreaProvider><RobotConnectionScreen/);
  const loadingGate = source.search(/if \(authLoading \|\| mfaVerificationPending[^\n]*return <LoadingScreen/);
  assert.ok(loadingGate >= 0 && source.indexOf('if (robotConnectionVisible) return') < loadingGate);
  assert.match(source, /PRODUCTION_ROBOT_COMMAND_EXECUTOR: RobotCommandExecutor \| null = null/);
  assert.match(source, /onOpenRobotConnection=\{\(\) => setRobotConnectionVisible\(true\)\}/);
  assert.match(source, /onOpenMap=\{controlTarget === 'direct' \? undefined : \(\) => \{ setActiveTab\('map'\); setStage\('main'\); \}\}/);
});

test('account-only connection actions reuse the full existing device-bootstrap safety gate', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'canOpenRobotAccountActions') initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(initializer);
  const check = (commitReady, extras = {}) => vm.runInNewContext(initializer, {
    guestMode: false, user: { id: 'fixture' }, preparedSessionKey: 'fixture-prepared', preparedUserId: 'fixture',
    authLoading: false, initializationError: null, mfaVerificationPending: false, accountBusy: false, deviceBootstrapBusy: false, stage: 'main',
    deviceBootstrapIntent: { current: { canCommit: id => id === 'fixture' && commitReady } }, ...extras,
  });
  assert.equal(check(true), true);
  assert.equal(check(false), false, 'profile/onboarding/Apple/recovery readiness is not optional');
  for (const extras of [{ guestMode: true }, { deviceBootstrapBusy: true }, { mfaVerificationPending: true }, { authLoading: true }, { initializationError: 'fixture-error' },
    { preparedUserId: 'other' }, { stage: 'forgot-password' }, { accountBusy: true }]) assert.equal(check(true, extras), false);
});
