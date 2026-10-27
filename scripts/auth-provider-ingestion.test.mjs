// Actual AuthProvider same-runtime ingestion regressions.
// Run: node --test --test-timeout=15000 scripts/auth-provider-ingestion.test.mjs
// React hooks/native host and SDK are fixture boundaries, not a native renderer
// or a live Auth server. Production Provider, auth/session services, preparation
// tracker and operation coordinator are loaded together. No real credentials.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';

const nodeRequire = createRequire(import.meta.url);
const ROOT = new URL('../', import.meta.url);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session = label => {
  const userId = label === 'A' ? USER_A : USER_B;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { user: { id: userId }, access_token: `${encode({ alg: 'none' })}.${encode({
    sub: userId, session_id: userId, exp: Math.floor(Date.now() / 1000) + 3600,
  })}.synthetic` };
};

function environment({ initialPending = false, installationPending = false, registrationPending = false, mfaPending = false, mfaVerification = false, mfaEnrollment = false, cleanupPending = false, staleEnrollment = false, enrollmentPending = false, mfaStatusFailureOnce = false, profileTransport = null, authClient = null, localCleanupFailsOnce = false } = {}) {
  let stored = session('A');
  let cleanupBlocked = false;
  let cleanupAttempts = 0;
  const initial = deferred(), installation = deferred(), registration = deferred(), mfaFactors = deferred(), verification = deferred(), cleanup = deferred(), enrollmentReply = deferred();
  let staleExists = staleEnrollment;
  let nextSessionReadHold = null;
  let verified = false, enrolled = false;
  const factor = () => ({ id: 'fixture-mfa-factor', factor_type: 'totp', status: verified || !mfaEnrollment ? 'verified' : 'unverified' });
  const observations = {
    reads: 0,
    installationReads: 0,
    registeredUsers: [],
    terminalLists: 0,
    profileUsers: [],
    unsubscribed: 0,
    mfaStatusReads: 0,
    mfaChallenges: 0,
    mfaCleanups: 0,
    mfaEnrollments: 0,
  };
  const callbacks = new Set(), modules = new Map();
  let hooks;
  let profileSdk;
  const client = {
    auth: {
      async resetPasswordForEmail(...args) {
        assert.ok(authClient, 'PKCE probe requires the real SDK boundary');
        return authClient.auth.resetPasswordForEmail(...args);
      },
      async exchangeCodeForSession(...args) {
        assert.ok(authClient, 'PKCE probe requires the real SDK boundary');
        return authClient.auth.exchangeCodeForSession(...args);
      },
      mfa: {
        async listFactors() {
          observations.mfaStatusReads++;
          if (mfaStatusFailureOnce && observations.mfaStatusReads === 1) return { data: null, error: new Error('synthetic status failure') };
          if (mfaVerification) {
            const all = mfaEnrollment && !enrolled ? [] : [factor()];
            if (staleExists) all.push({ id: 'fixture-stale-factor', factor_type: 'totp', status: 'unverified' });
            return { data: { all, totp: all.filter(value => value.status === 'verified') }, error: null };
          }
          return mfaPending ? mfaFactors.promise : { data: { all: [], totp: [] }, error: null };
        },
        async getAuthenticatorAssuranceLevel() {
          return { data: { currentLevel: verified ? 'aal2' : 'aal1', nextLevel: 'aal2' }, error: null };
        },
        async enroll() { observations.mfaEnrollments++; if (enrollmentPending) await enrollmentReply.promise; enrolled = true; return { data: { id: 'fixture-mfa-factor', totp: { qr_code: '', secret: 'fixture-only', uri: '' } }, error: null }; },
        async unenroll({ factorId }) { observations.mfaCleanups++; if (cleanupPending) await cleanup.promise; if (factorId === 'fixture-stale-factor') staleExists = false; return { data: {}, error: null }; },
        async challengeAndVerify() {
          observations.mfaChallenges++;
          await verification.promise;
          verified = true;
          for (const callback of callbacks) callback('TOKEN_REFRESHED', stored);
          return { data: {}, error: null };
        },
      },
      async getSession() {
        observations.reads++;
        if (initialPending && observations.reads === 1) return initial.promise;
        if (nextSessionReadHold) { const held = nextSessionReadHold; nextSessionReadHold = null; await held.promise; }
        if (authClient) return authClient.auth.getSession();
        return { data: { session: stored }, error: null };
      },
      onAuthStateChange(callback) {
        if (authClient) {
          // No hand-emitted INITIAL_SESSION: delegate to the actual SDK, which
          // may itself refresh while preparing the initial notification.
          const { data } = authClient.auth.onAuthStateChange(callback);
          return { data: { subscription: { unsubscribe() {
            data.subscription.unsubscribe(); observations.unsubscribed++;
          } } } };
        }
        callbacks.add(callback);
        return { data: { subscription: { unsubscribe() {
          callbacks.delete(callback); observations.unsubscribed++;
        } } } };
      },
    },
    functions: { async invoke(_name, { body }) {
      const terminal = {
        id: 'fixture-terminal', installation_id: '22222222-2222-4222-8222-222222222222',
        platform: 'android', device_label: 'Fixture terminal', app_version: '0.0.1',
        first_seen_at: '2026-10-16T00:00:00.000Z', last_seen_at: '2026-10-16T00:00:00.000Z',
        revoked_at: null, revocation_reason: null, isCurrent: true,
      };
      if (body.action === 'register') {
        observations.registeredUsers.push(stored.user.id);
        if (registrationPending) return registration.promise;
        return { data: { terminal }, error: null };
      }
      if (body.action === 'heartbeat') return { data: { terminal }, error: null };
      if (body.action === 'list') {
        observations.terminalLists++;
        return { data: { terminals: [terminal] }, error: null };
      }
      throw new Error('Unexpected provider fixture action');
    } },
    async rpc(name) {
      if (name === 'list_my_login_methods') return { data: [], error: null };
      throw new Error('Unexpected provider fixture RPC');
    },
    from(table) {
      if (profileTransport) {
        // Actual PostgREST SDK and production fetch wrapper; Auth/session and
        // native host remain the existing synthetic Provider boundaries.
        profileSdk ??= createClient('https://profile-fixture.supabase.co', 'sb_publishable_fixture', {
          auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
          global: { fetch: load('src/services/authRequestFetch.ts').createAuthRequestFetch(profileTransport, { timeoutMs: 50 }) },
        });
        return profileSdk.from(table);
      }
      let userId;
      return { select() { return this; }, eq(_name, value) { userId = value; return this; },
        async maybeSingle() { observations.profileUsers.push(userId); return { data: { id: userId }, error: null }; } };
    },
  };
  function load(relative) {
    if (modules.has(relative)) return modules.get(relative).exports;
    const module = { exports: {} };
    modules.set(relative, module);
    const url = new URL(relative, ROOT);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, Error, Promise, URL, URLSearchParams, Response, Request, Headers, AbortController,
      TextDecoder, Uint8Array, atob, performance, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
      process: { env: {} },
      require(name) {
        if (name === 'react') return react;
        if (name === 'react/jsx-runtime') return nodeRequire(name);
        if (name === 'react-native') return {
          ActivityIndicator: 'ActivityIndicator', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View',
          Platform: { OS: 'android', Version: 35 },
          AppState: { addEventListener: () => ({ remove() {} }) },
          StyleSheet: { create: value => value, hairlineWidth: 1 },
          useWindowDimensions: () => ({ width: 390, height: 844 }),
        };
        if (name === '@expo/vector-icons') return { Ionicons: 'Ionicons' };
        if (name === 'react-native-safe-area-context') return {
          SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ left: 0, right: 0 }),
        };
        if (name.endsWith('/AppText')) return { Text: 'Text', TextInput: 'TextInput' };
        if (name === 'expo-linear-gradient') return { LinearGradient: 'LinearGradient' };
        if (name.endsWith('/AuthEntry')) {
          // Execute the actual palette function without pulling unrelated asset
          // imports into this host. It has no input/state policy under test.
          const source = readFileSync(new URL('src/components/AuthEntry.tsx', ROOT), 'utf8');
          const file = ts.createSourceFile('AuthEntry.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
          const palette = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useAuthEntryPalette');
          const output = ts.transpileModule(palette.getText(file), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
          const paletteModule = { exports: {} };
          vm.runInNewContext(output, { module: paletteModule, exports: paletteModule.exports,
            useAppTheme: () => ({ colors: {}, isDark: false }),
            useProductAppearance: load('src/appearance.ts').useProductAppearance });
          return paletteModule.exports;
        }
        if (name.endsWith('/theme')) return {
          radii: { md: 12, pill: 999 },
          // Appearance is a host boundary here, not an authentication policy.
          lightColors: new Proxy({}, { get: () => '#000000' }),
          darkColors: new Proxy({}, { get: () => '#000000' }),
          useAppTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }), isDark: false }),
        };
        if (name === 'expo-secure-store') return {
          getItemAsync: async () => {
            observations.installationReads++;
            return installationPending ? installation.promise : '22222222-2222-4222-8222-222222222222';
          }, setItemAsync: async () => {},
        };
        if (name.endsWith('/supabaseClient')) return { getSupabaseClient: () => {
          if (cleanupBlocked) throw new Error('synthetic local cleanup gate');
          return client;
        }, isSupabaseConfigured: true,
          clearLocalAuthSession: async () => {
            cleanupAttempts++;
            if (localCleanupFailsOnce && cleanupAttempts === 1) {
              cleanupBlocked = true;
              throw new Error('synthetic secure storage failure');
            }
            cleanupBlocked = false;
            stored = null;
          },
        };
        if (name.startsWith('.')) {
          const base = new URL(name, url);
          const suffix = /(?:AuthContext|GradientButton)$/.test(name) ? '.tsx' : '.ts';
          return load(new URL(`${base.href}${suffix}`).pathname.slice(ROOT.pathname.length));
        }
        throw new Error('Unexpected provider fixture dependency');
      },
    }, { filename: relative });
    return module.exports;
  }
  const changed = (before, after) => !before || !after || before.length !== after.length || before.some((value, index) => value !== after[index]);
  const react = {
    createContext: () => ({ Provider: 'FixtureContextProvider' }),
    useContext: () => hooks.value,
    useState(initialValue) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initialValue === 'function' ? initialValue() : initialValue;
      const owner = hooks;
      return [owner.slots[index], value => {
        owner.slots[index] = typeof value === 'function' ? value(owner.slots[index]) : value;
        owner.dirty = true;
      }];
    },
    useRef(value) { const index = hooks.cursor++; return hooks.slots[index] ??= { current: value }; },
    useMemo(factory, deps) {
      const index = hooks.cursor++;
      if (changed(hooks.slots[index]?.deps, deps)) hooks.slots[index] = { value: factory(), deps };
      return hooks.slots[index].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const index = hooks.cursor++, owner = hooks;
      if (changed(owner.slots[index]?.deps, deps)) owner.effects.push(() => {
        owner.slots[index]?.cleanup?.();
        owner.slots[index] = { deps, callback, cleanup: callback() };
      });
    },
  };
  const Provider = load('src/auth/AuthContext.tsx').AuthProvider;
  const coordinator = load('src/services/authSessionOperation.ts');
  function mount() {
    let mounted = true;
    hooks = { slots: [], cursor: 0, dirty: false, effects: [], value: null };
    const owner = hooks;
    const render = () => {
      hooks = owner; owner.cursor = 0; owner.dirty = false; owner.effects = [];
      owner.value = Provider({ children: null }).props.value;
      for (const effect of owner.effects) effect();
    };
    render();
    return {
      get value() { return owner.value; },
      async settle() {
        // AuthProvider schedules preparation on a timer; drain that boundary as
        // well as microtasks instead of assuming repeated immediates run it.
        await new Promise(resolve => setTimeout(resolve, 0));
        for (let count = 0; count < 10; count++) {
          await new Promise(resolve => setImmediate(resolve));
          if (mounted && owner.dirty) render();
        }
      },
      unmount() { mounted = false; for (const slot of owner.slots) slot?.cleanup?.(); },
    };
  }
  function mountSecurityScreen({ canManageMfa = false } = {}) {
    const Screen = load('src/screens/AccountSecurityScreen.tsx').AccountSecurityScreen;
    let mounted = true;
    const owner = { slots: [], cursor: 0, dirty: false, effects: [], value: null };
    const render = () => {
      hooks = owner; owner.cursor = 0; owner.dirty = false; owner.effects = [];
      owner.value = Screen({
        canManageMfa,
        email: 'fixture@example.invalid',
        emailVerified: false,
        onChangePassword() {},
        onManageMfa() {},
      });
      for (const effect of owner.effects) effect();
    };
    render();
    return {
      async settle() {
        for (let count = 0; count < 10; count++) {
          await new Promise(resolve => setImmediate(resolve));
          if (mounted && owner.dirty) render();
        }
      },
      unmount() {
        mounted = false;
        for (const slot of owner.slots) slot?.cleanup?.();
      },
    };
  }
  function mountMfaScreen(props = {}) {
    const Screen = load('src/screens/MfaSetupScreen.tsx').MfaSetupScreen;
    const expectedIdentity = load('src/services/authSessionIdentity.ts').readAuthSessionIdentity(stored);
    let mounted = true, nodes = [];
    const owner = { slots: [], cursor: 0, dirty: false, effects: [], value: null };
    const render = () => {
      hooks = owner; owner.cursor = 0; owner.dirty = false; owner.effects = []; nodes = [];
      const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node.type === 'function') return walk(node.type(node.props));
        nodes.push(node); walk(node.props?.children);
      };
      walk(Screen({ expectedIdentity, ...props }));
      for (const effect of owner.effects) effect();
    };
    render();
    return {
      render,
      replayEffects() { for (const slot of owner.slots) slot?.cleanup?.(); for (const slot of owner.slots) if (slot?.callback) slot.cleanup = slot.callback(); },
      async settle() { for (let count = 0; count < 12; count++) { await new Promise(resolve => setImmediate(resolve)); if (mounted && owner.dirty) render(); } },
      reload() { const button = nodes.find(node => node.type === 'Pressable' && node.props.children?.props?.children === '重新加载'); assert.ok(button); button.props.onPress(); },
      hasSetupSecret() { return nodes.some(node => node.props.accessibilityLabel === 'TOTP 设置密钥'); },
      enterCode(value) { nodes.find(node => node.type === 'TextInput').props.onChangeText(value); render(); },
      submit() { const button = nodes.find(node => node.type === 'Pressable' && /^验证并/.test(node.props.accessibilityLabel)); assert.ok(button); button.props.onPress(); },
      unmount() { if (!mounted) return; mounted = false; for (const slot of owner.slots) slot?.cleanup?.(); },
    };
  }
  return { coordinator, mount, mountSecurityScreen, mountMfaScreen, observations, initial, installation, registration, mfaFactors, verification, cleanup, enrollmentReply,
    load,
    fence: load('src/services/sessionIngestionFence.ts'),
    setStored: value => { stored = value; },
    holdNextSessionRead() { return nextSessionReadHold = deferred(); },
    emit: (event, nextSession) => { for (const callback of callbacks) callback(event, nextSession); },
  };
}

function callbackAppHost(state, provider) {
  const text = readFileSync(new URL('App.tsx', ROOT), 'utf8');
  const file = ts.createSourceFile('App.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const find = name => {
    let found;
    const visit = node => {
      if (ts.isVariableDeclaration(node) && node.name.getText(file) === name) found = node.initializer;
      if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
      ts.forEachChild(node, visit);
    };
    visit(file); assert.ok(found, `App symbol ${name} must exist`); return found.getText(file);
  };
  let navigation;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
      && node.arguments[0]?.getText(file).includes('if (recovery || recoveryLink)')) navigation = node.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(navigation);
  const service = state.load('src/services/authService.ts');
  const inboxApi = state.load('src/services/authCallbackInbox.ts');
  const stages = [], notices = [];
  const context = {
    useRef: value => ({ current: value }), useCallback: fn => fn,
    authLoading: provider.value.loading, initializationError: provider.value.initializationError ?? null,
    accountBusy: false, recoveryLink: false,
    authService: service, createAuthCallbackInbox: inboxApi.createAuthCallbackInbox,
    AuthCallbackCancelledError: inboxApi.AuthCallbackCancelledError,
    SupabaseConfigurationError: class extends Error {},
    readAuthSessionIdentity: state.load('src/services/authSessionIdentity.ts').readAuthSessionIdentity,
    exchangeSessionFromUrl: provider.value.exchangeSessionFromUrl,
    clearRecovery: () => provider.value.clearRecovery(), logout: () => { throw new Error('Unexpected sign-out while busy'); },
    getAuthSessionOperationSnapshot: state.coordinator.getAuthSessionOperationSnapshot,
    notify(title) { notices.push(title); }, setAuthError() {}, setPasswordNonceRequired() {},
    setAccountBusy(value) { context.accountBusy = value; },
    setRecoveryLink(value) { context.recoveryLink = value; },
    setStage(value) { stages.push(value); },
    completedDeviceBootstrapKey: { current: null }, mfaVerificationPending: false,
    setDevice() {}, setSelectedModel() {}, setDeviceLoadError() {}, appleRecoveryProbeResolved: false,
  };
  const evaluate = source => {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(`module.exports = ${source};`, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { module, Error, Promise, Symbol, ...context });
    return module.exports;
  };
  for (const name of ['accountFlowInFlightRef','authCallbackGate','authCallbackInbox','authCallbackUi','initialAuthUrl']) context[name] = evaluate(find(name));
  context.authCallbackUi.current.mounted = true;
  context.authCallbackDeduper = { current: service.createAuthCallbackDeduper(20) };
  context.humanizeAuthError = evaluate(find('humanizeAuthError'));
  context.handleAuthUrl = evaluate(find('handleAuthUrl'));
  const disconnect = context.authCallbackInbox.current.connect();
  return {
    stages, notices,
    start: url => context.handleAuthUrl(url),
    logoutIntent: () => evaluate(find('handleLogout'))(),
    navigate() {
      Object.assign(context, { authLoading: provider.value.loading,
        initializationError: provider.value.initializationError ?? null, user: provider.value.user,
        profile: provider.value.profile, recovery: provider.value.recovery, preparedUserId: provider.value.preparedUserId });
      evaluate(navigation)();
    },
    dispose() { context.authCallbackUi.current.mounted = false; disconnect(); },
  };
}

for (const cancelAt of ['before-event', 'after-event']) {
test(`logout intent ${cancelAt} retires real PKCE recovery without disabling the next attempt`, { timeout: 15_000 }, async t => {
  const entered = deferred(), release = deferred(), eventEntered = deferred(), releaseEvent = deferred();
  const key = 'retired-recovery-fixture';
  const value = { ...session('A'), refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600, token_type: 'bearer' };
  const returnedIds = [USER_B, '33333333-3333-4333-8333-333333333333'];
  const returnedValue = id => {
    const encode = data => Buffer.from(JSON.stringify(data)).toString('base64url');
    return { ...value, access_token: `${encode({ alg: 'none' })}.${encode({
      sub: USER_A, session_id: id, exp: value.expires_at,
    })}.synthetic` };
  };
  const stored = new Map([[key, JSON.stringify(value)]]);
  const sdkEvents = [];
  let pkceRequests = 0, app, view, callback;
  const reply = body => new Response(JSON.stringify(body), { status: 200, headers: {
    'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01',
  } });
  const sdk = createClient('https://retired-recovery.example.invalid', 'sb_publishable_fixture', {
    auth: { storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce',
      storage: { getItem: name => stored.get(name) ?? null, setItem: (name, data) => { stored.set(name, data); }, removeItem: name => { stored.delete(name); } } },
    global: { fetch: createAuthRequestFetch(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/auth/v1/recover') return reply({});
      assert.equal(url.pathname, '/auth/v1/token'); assert.equal(url.searchParams.get('grant_type'), 'pkce');
      pkceRequests++; entered.resolve(); await release.promise; return reply(returnedValue(returnedIds[pkceRequests - 1]));
    }) },
  });
  const subscription = sdk.auth.onAuthStateChange(async event => {
    sdkEvents.push(event);
    if (event === 'PASSWORD_RECOVERY') {
      eventEntered.resolve();
      if (cancelAt === 'after-event') await releaseEvent.promise;
    }
  }).data.subscription;
  try {
    await sdk.auth.initialize();
    const state = environment({ authClient: sdk }); view = state.mount(); await view.settle();
    const initialPreparedKey = view.value.preparedSessionKey;
    await state.load('src/services/authService.ts').sendPasswordRecoveryOtp('fixture@example.invalid'); await view.settle();
    assert.equal(stored.has(`${key}-code-verifier`), true, 'verifier came from public recovery API');
    app = callbackAppHost(state, view);
    callback = app.start('doso://auth/reset-password?code=fixture-authorization-code').then(() => 'resolved', error => error.name);
    await entered.promise; assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, true);
    if (cancelAt === 'after-event') { release.resolve(); await eventEntered.promise; }
    await app.logoutIntent(); release.resolve(); releaseEvent.resolve(); const outcome = await callback;
    for (let count = 0; count < 3; count++) await view.settle();
    app.navigate();
    const readIdentity = state.load('src/services/authSessionIdentity.ts').readAuthSessionIdentity;
    const replacedIdentity = readIdentity(view.value.session);
    t.diagnostic(JSON.stringify({ scenario: 'retired-real-pkce-recovery', cancelAt, pkceRequests,
      recoveryEventObserved: sdkEvents.includes('PASSWORD_RECOVERY'), callbackCancelled: outcome === 'AuthCallbackCancelledError',
      providerRecovery: view.value.recovery, navigatedToReset: app.stages.includes('reset-password'),
      replacementSessionIngested: replacedIdentity?.sessionId === returnedIds[0], prepared: view.value.preparedUserId === USER_A,
      finalBusy: state.coordinator.getAuthSessionOperationSnapshot().busy }));
    assert.ok(sdkEvents.includes('PASSWORD_RECOVERY')); assert.equal(pkceRequests, 1);
    assert.equal(outcome, 'AuthCallbackCancelledError'); assert.equal(view.value.recovery, false);
    assert.equal(app.stages.includes('reset-password'), false);
    assert.ok(app.notices.includes('退出尚未执行'), 'busy logout must not silently resemble completed sign-out');
    assert.equal(view.value.user?.id, USER_A, 'SDK session truth is still ingested; this is not sign-out');
    assert.equal(replacedIdentity?.sessionId, returnedIds[0]);
    assert.equal(view.value.preparedUserId, USER_A); assert.ok(view.value.preparedSessionKey);
    assert.notEqual(view.value.preparedSessionKey, initialPreparedKey);
    await state.load('src/services/authService.ts').sendPasswordRecoveryOtp('fixture@example.invalid'); await view.settle();
    await app.start('doso://auth/reset-password?code=fixture-next-authorization-code');
    for (let count = 0; count < 3; count++) await view.settle();
    app.navigate();
    assert.equal(pkceRequests, 2); assert.equal(view.value.recovery, true);
    assert.equal(app.stages.includes('reset-password'), true);
    assert.equal(readIdentity(view.value.session)?.sessionId, returnedIds[1]);
    t.diagnostic(JSON.stringify({ scenario: 'fresh-real-pkce-after-retirement', cancelAt, pkceRequests,
      recoveryEvents: sdkEvents.filter(event => event === 'PASSWORD_RECOVERY').length,
      providerRecovery: view.value.recovery, nextSessionIngested: readIdentity(view.value.session)?.sessionId === returnedIds[1],
      finalBusy: state.coordinator.getAuthSessionOperationSnapshot().busy }));
  } finally {
    release.resolve(); releaseEvent.resolve(); await callback; app?.dispose(); view?.unmount(); subscription.unsubscribe(); await sdk.auth.dispose();
  }
});
}

test('clearing recovery while idle permits later recovery; repeated events in one retired revision stay suppressed', { timeout: 10_000 }, async () => {
  const state = environment(), view = state.mount();
  const hold = deferred(); let operation;
  try {
    await view.settle(); view.value.clearRecovery();
    operation = state.coordinator.runAuthSessionOperation(async () => { state.emit('PASSWORD_RECOVERY', session('A')); });
    await operation; await view.settle(); assert.equal(view.value.recovery, true);
    operation = state.coordinator.runAuthSessionOperation(async () => {
      view.value.clearRecovery();
      state.emit('PASSWORD_RECOVERY', session('A')); state.emit('PASSWORD_RECOVERY', session('A'));
      await hold.promise;
    });
    hold.resolve(); await operation; await view.settle();
    assert.equal(view.value.recovery, false); assert.equal(view.value.user?.id, USER_A);
    await state.coordinator.runAuthSessionOperation(async () => { state.emit('PASSWORD_RECOVERY', session('A')); });
    await view.settle(); assert.equal(view.value.recovery, true);
  } finally { hold.resolve(); await operation; view.unmount(); }
});

test('cold native-config refresh failure preserves storage, respects SDK cooldown and recovers only on explicit retry', { timeout: 10_000 }, async t => {
  const originalNow = Date.now;
  let fakeNow = originalNow();
  Date.now = () => fakeNow;
  const key = 'cold-recovery-synthetic-session';
  const expiredAt = Math.floor(fakeNow / 1000) - 60;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expired = { ...session('A'), refresh_token: 'synthetic-expired-refresh',
    access_token: `${encode({ alg: 'none' })}.${encode({ sub: USER_A, session_id: USER_A, exp: expiredAt })}.synthetic`,
    expires_at: expiredAt, expires_in: 3600, token_type: 'bearer' };
  const originalStored = JSON.stringify(expired);
  const values = new Map([[key, originalStored]]);
  let online = false, requests = 0, deletes = 0, aborts = 0;
  let phase = 'offline';
  const requestEvents = [];
  // This test exercises SDK cooldown and Provider recovery, not host speed.
  // Keep its transport clock independent of the compressed SDK wall clock.
  // The real offline timer still aborts; auth-request-fetch.test.mjs separately
  // exercises monotonic deadline crossings and response/body delays.
  const transportNow = 0;
  let sdk, state, provider;
  const json = value => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    // Production fetch wrapping still buffers this into a real Response before
    // SDK parsing; a healthy synthetic body must not depend on stream timing.
    return { status: 200, statusText: 'OK', headers: new Headers({ 'content-type': 'application/json' }),
      async arrayBuffer() { return bytes.buffer; } };
  };
  const waitForState = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) {
      await provider.settle();
      if (predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.fail('cold-start fixture failed to reach its bounded expected state');
  };
  try {
    sdk = createClient('https://cold-fixture.supabase.co', 'sb_publishable_fixture', {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: true, storageKey: key,
        storage: { getItem: async name => values.get(name) ?? null,
          setItem: async (name, value) => { values.set(name, value); },
          removeItem: async name => { deletes++; values.delete(name); } } },
      global: { fetch: (bounded => async (input, init) => {
        const ordinal = requests + 1;
        try {
          const response = await bounded(input, init);
          const entry = requestEvents.find(item => item.ordinal === ordinal);
          if (entry) entry.outcome = 'success';
          return response;
        } catch (error) {
          const entry = requestEvents.find(item => item.ordinal === ordinal);
          if (entry) entry.outcome = 'rejected';
          throw error;
        }
      })(createAuthRequestFetch((input, init) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, '/auth/v1/token');
        assert.equal(url.searchParams.get('grant_type'), 'refresh_token');
        requests++;
        const entry = { ordinal: requests, phase, aborted: false, outcome: 'pending',
          busy: state.coordinator.getAuthSessionOperationSnapshot().busy };
        requestEvents.push(entry);
        init.signal.addEventListener('abort', () => { entry.aborted = true; }, { once: true });
        assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, true);
        if (online) return Promise.resolve(json({ ...session('A'), refresh_token: 'synthetic-rotated-refresh',
          expires_at: Math.floor(fakeNow / 1000) + 3600, expires_in: 3600, token_type: 'bearer' }));
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            // Advance only the SDK wall-clock retry budget. The offline request
            // deadline still uses the production wrapper's real short timer.
            fakeNow += 31_000;
            aborts++;
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      }, { timeoutMs: 10, now: () => transportNow })) },
    });
    state = environment({ authClient: sdk });
    provider = state.mount();
    await waitForState(() => !provider.value.loading && provider.value.initializationError
      && !state.coordinator.getAuthSessionOperationSnapshot().busy);
    assert.equal(provider.value.session, null);
    assert.equal(provider.value.profile, null);
    assert.equal(provider.value.preparedSessionKey, null);
    assert.equal(state.observations.registeredUsers.length, 0);
    assert.equal(state.observations.profileUsers.length, 0);
    assert.equal(values.get(key), originalStored);
    assert.equal(deletes, 0);
    assert.equal(aborts, requests);
    assert.ok(requests > 0 && requests <= 2);
    assert.equal(provider.value.initializationError.message, '认证服务暂时无法连接，请检查网络并稍后重试。');

    online = true;
    phase = 'cooldown';
    const failedRequests = requests;
    provider.value.retryInitialization();
    await waitForState(() => !provider.value.loading && provider.value.initializationError
      && !state.coordinator.getAuthSessionOperationSnapshot().busy);
    assert.equal(requests, failedRequests, 'SDK cooldown is respected, not bypassed by reconstructing the client');
    assert.equal(values.get(key), originalStored);
    fakeNow += 61_000;
    phase = 'recovery';
    provider.value.retryInitialization();
    await waitForState(() => Boolean(provider.value.preparedSessionKey));
    assert.equal(requests, failedRequests + 1);
    assert.equal(provider.value.initializationError, null);
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.preparedUserId, USER_A);
    assert.equal(provider.value.profile.id, USER_A);
    assert.equal(JSON.parse(values.get(key)).refresh_token, 'synthetic-rotated-refresh');
    assert.equal(deletes, 0);
    const stableRequests = requests;
    phase = 'stability';
    for (let attempt = 0; attempt < 3; attempt++) await provider.settle();
    assert.equal(requests, stableRequests, 'SDK notifications must not form an auto-refresh loop');
    const readsAtUnmount = state.observations.reads;
    const registeredAtUnmount = state.observations.registeredUsers.length;
    const profilesAtUnmount = state.observations.profileUsers.length;
    provider.unmount();
    const unsubscribedAtUnmount = state.observations.unsubscribed;
    assert.ok(unsubscribedAtUnmount > 0);
    phase = 'post-unmount';
    const afterUnmount = await state.coordinator.runAuthSessionOperation(() => sdk.auth.refreshSession());
    assert.equal(afterUnmount.error, null);
    await provider.settle();
    assert.equal(requests, stableRequests + 1, 'actual SDK emits a refresh notification after Provider unmount');
    assert.equal(state.observations.reads, readsAtUnmount);
    assert.equal(state.observations.registeredUsers.length, registeredAtUnmount);
    assert.equal(state.observations.profileUsers.length, profilesAtUnmount);
    t.diagnostic(JSON.stringify({ scenario: 'cold-refresh-recovery', offlineRefreshRequests: failedRequests,
      abortedRequests: aborts, storedSessionPreservedOnFailure: true, cooldownRetryNetworkRequests: 0,
      postCooldownRecoveryRequests: 1, postUnmountRefreshRequests: 1, postUnmountProviderReads: 0 }));
  } finally {
    t.diagnostic(JSON.stringify({ scenario: 'cold-refresh-transport', requestEvents,
      prepared: Boolean(provider?.value.preparedSessionKey),
      finalBusy: state?.coordinator.getAuthSessionOperationSnapshot().busy }));
    try {
      provider?.unmount();
      await provider?.settle();
      await sdk?.auth.dispose();
    } finally { Date.now = originalNow; }
  }
});

test('profile preparation timeout becomes retryable without publishing a prepared session or adopting the late profile', { timeout: 10_000 }, async () => {
  const first = deferred();
  let reads = 0;
  let firstSignal;
  const response = displayName => new Response(JSON.stringify([{ id: USER_A, display_name: displayName }]), {
    headers: { 'content-type': 'application/json' },
  });
  const state = environment({ profileTransport(input, init) {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/rest/v1/profiles');
    assert.equal(url.searchParams.get('id'), `eq.${USER_A}`);
    reads++;
    if (reads === 1) { firstSignal = init.signal; return first.promise; }
    return Promise.resolve(response('fresh retry'));
  } });
  const provider = state.mount();
  try {
    await provider.settle();
    assert.equal(reads, 1);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, true);
    assert.equal(provider.value.preparedSessionKey, null);
    await new Promise(resolve => setTimeout(resolve, 90));
    await provider.settle();
    assert.equal(firstSignal.aborted, true);
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.initializationError?.message, '账户资料读取超时，请检查网络后重试。');
    assert.equal(provider.value.profile, null);
    assert.equal(provider.value.preparedSessionKey, null);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
    assert.equal(reads, 1, 'no automatic replay of a timed-out profile read');

    provider.value.retryInitialization();
    await provider.settle();
    assert.equal(reads, 2, 'explicit retry starts one fresh profile read');
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.initializationError, null);
    assert.equal(provider.value.profile?.display_name, 'fresh retry');
    assert.equal(provider.value.preparedUserId, USER_A);
    const preparedKey = provider.value.preparedSessionKey;
    assert.ok(preparedKey);

    first.resolve(response('late abandoned profile'));
    await provider.settle();
    assert.equal(provider.value.profile?.display_name, 'fresh retry');
    assert.equal(provider.value.preparedSessionKey, preparedKey);
    assert.equal(provider.value.initializationError, null);
    assert.equal(reads, 2);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    first.resolve(response('late abandoned profile'));
    provider.unmount();
    await provider.settle();
  }
});

test('setup unmounted while enrollment preflight is held never dispatches enrollment', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true }), provider = state.mount();
  let screen, held;
  try {
    await provider.settle(); held = state.holdNextSessionRead(); screen = state.mountMfaScreen(); await screen.settle();
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
    assert.equal(state.observations.mfaEnrollments, 0);
    screen.unmount(); held.resolve(); await screen.settle();
    assert.equal(state.observations.mfaEnrollments, 0); assert.equal(state.observations.mfaCleanups, 0);
    assert.equal(screen.hasSetupSecret(), false);
  } finally { held?.resolve(); screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('late enrollment after setup unmount is not displayed and uses original-identity best-effort cleanup', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true, enrollmentPending: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); screen = state.mountMfaScreen(); await screen.settle();
    assert.equal(state.observations.mfaEnrollments, 1);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
    assert.equal(provider.value.loading, false); screen.unmount();
    state.enrollmentReply.resolve(); await screen.settle();
    assert.equal(state.observations.mfaCleanups, 1);
    assert.equal(screen.hasSetupSecret(), false);
    assert.equal(state.observations.mfaEnrollments, 1);
  } finally { state.enrollmentReply.resolve(); screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('enrollment returning after an auth-event identity switch exposes no setup secret and never cleans as B', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true, enrollmentPending: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); screen = state.mountMfaScreen(); await screen.settle();
    assert.equal(state.observations.mfaEnrollments, 1);
    state.setStored(session('B')); state.emit('SIGNED_IN', session('B')); await provider.settle();
    assert.equal(provider.value.loading, true); screen.unmount(); state.enrollmentReply.resolve();
    await screen.settle(); await provider.settle();
    assert.equal(state.observations.mfaCleanups, 0);
    assert.equal(screen.hasSetupSecret(), false);
    assert.equal(provider.value.preparedUserId, USER_B);
    assert.equal(state.observations.mfaEnrollments, 1);
  } finally { state.enrollmentReply.resolve(); screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('setup effect replay before microtask dispatch creates only one active enrollment', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); screen = state.mountMfaScreen(); screen.replayEffects(); await screen.settle();
    assert.equal(state.observations.mfaStatusReads, 1);
    assert.equal(state.observations.mfaEnrollments, 1);
    assert.equal(screen.hasSetupSecret(), true);
  } finally { screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('same-tick explicit retries select one current load and create only one factor', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true, mfaStatusFailureOnce: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); screen = state.mountMfaScreen(); await screen.settle();
    assert.equal(state.observations.mfaEnrollments, 0);
    screen.reload(); screen.reload(); await screen.settle();
    assert.equal(state.observations.mfaStatusReads, 2);
    assert.equal(state.observations.mfaEnrollments, 1);
    assert.equal(screen.hasSetupSecret(), true);
  } finally { screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('a current setup enrolls once without invalidating its prepared session', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); const preparedKey = provider.value.preparedSessionKey;
    screen = state.mountMfaScreen(); await screen.settle(); await provider.settle();
    assert.equal(state.observations.mfaEnrollments, 1);
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.preparedSessionKey, preparedKey);
  } finally { screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('a setup unmounted during stale-factor cleanup never starts a new enrollment', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true, staleEnrollment: true, cleanupPending: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); screen = state.mountMfaScreen(); await screen.settle();
    assert.equal(state.observations.mfaCleanups, 1);
    screen.unmount(); state.cleanup.resolve(); await screen.settle();
    assert.equal(state.observations.mfaEnrollments, 0, 'stale load must stop before creating a new factor');
  } finally { state.cleanup.resolve(); screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('factor cleanup intent preserves prepared UI while still excluding competitors', { timeout: 10_000 }, async () => {
  const state = environment(), provider = state.mount(), hold = deferred();
  let operation;
  try {
    await provider.settle();
    const preparedKey = provider.value.preparedSessionKey;
    const registrations = state.observations.registeredUsers.length;
    operation = state.coordinator.runAuthSessionOperation(() => hold.promise, { kind: 'factor-write' });
    await provider.settle();
    assert.equal(provider.value.loading, false, 'factor cleanup must not unmount its requesting screen without a real auth event');
    assert.equal(provider.value.preparedSessionKey, preparedKey);
    await assert.rejects(state.coordinator.runAuthSessionOperation(async () => 'competitor'), state.coordinator.isAuthSessionOperationBusyError);
    hold.resolve(); await operation; await provider.settle();
    assert.equal(provider.value.preparedSessionKey, preparedKey);
    assert.equal(state.observations.registeredUsers.length, registrations);
  } finally { hold.resolve(); await operation; provider.unmount(); await provider.settle(); }
});

test('leaving setup cannot delete its factor using a different restored identity', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); screen = state.mountMfaScreen(); await screen.settle();
    state.setStored(session('B')); screen.unmount(); await screen.settle();
    assert.equal(state.observations.mfaCleanups, 0, 'late cleanup must never adopt account B');
  } finally { screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('setup Back waits for actual cleanup without unmounting or registering a duplicate terminal', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true, cleanupPending: true }), provider = state.mount();
  let screen, requestBack, backs = 0;
  try {
    await provider.settle(); const preparedKey = provider.value.preparedSessionKey;
    const registrations = state.observations.registeredUsers.length;
    screen = state.mountMfaScreen({ onBackRequestChange: value => { requestBack = value; }, onBack: () => { backs++; } });
    await screen.settle(); requestBack(); requestBack(); await screen.settle(); await provider.settle();
    assert.equal(state.observations.mfaCleanups, 1);
    assert.equal(backs, 0);
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.preparedSessionKey, preparedKey);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().kind, 'factor-write');
    await assert.rejects(state.coordinator.runAuthSessionOperation(async () => 'competing sign-in'), state.coordinator.isAuthSessionOperationBusyError);
    state.cleanup.resolve(); await screen.settle(); await provider.settle();
    assert.equal(backs, 1); assert.equal(state.observations.mfaCleanups, 1);
    assert.equal(state.observations.registeredUsers.length, registrations);
    screen.unmount(); await screen.settle(); assert.equal(state.observations.mfaCleanups, 1);
  } finally { state.cleanup.resolve(); screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('setup without a captured identity never creates an unowned verification factor', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); screen = state.mountMfaScreen({ expectedIdentity: null }); await screen.settle();
    assert.equal(state.observations.mfaStatusReads, 0, 'missing identity must fail before the first MFA SDK call');
    assert.equal(state.observations.mfaCleanups, 0); assert.equal(state.observations.mfaChallenges, 0);
  } finally { screen?.unmount(); provider.unmount(); await provider.settle(); }
});

test('real auth events during factor-write still invalidate and prepare only after actual work settles', { timeout: 10_000 }, async () => {
  const state = environment(), provider = state.mount(), hold = deferred();
  let operation;
  try {
    await provider.settle(); const registrations = state.observations.registeredUsers.length;
    operation = state.coordinator.runAuthSessionOperation(() => hold.promise, { kind: 'factor-write' });
    state.setStored(session('B')); state.emit('SIGNED_IN', session('B')); await provider.settle();
    assert.equal(provider.value.loading, true);
    assert.equal(provider.value.preparedUserId, null);
    assert.equal(state.observations.registeredUsers.length, registrations);
    hold.resolve(); await operation; await provider.settle();
    assert.equal(provider.value.loading, false); assert.equal(provider.value.preparedUserId, USER_B);
    assert.equal(state.observations.registeredUsers.length, registrations + 1);
  } finally { hold.resolve(); await operation; provider.unmount(); await provider.settle(); }
});

function appMfaOwner(state, provider) {
  // Execute the actual App handler and reconciliation effect against the same
  // production flow/service/Provider cache, while React/native rendering is host.
  const source = readFileSync(new URL('App.tsx', ROOT), 'utf8');
  const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler, completionEffect, contextExpression;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handleMfaVerify') handler = node.initializer;
    if (ts.isBinaryExpression(node) && node.left.getText(file) === 'mfaVerificationContext.current') contextExpression = node.right;
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'useEffect'
      && node.arguments[0]?.getText(file).includes('const completion = flow.reconcile')) completionEffect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(handler); assert.ok(completionEffect); assert.ok(contextExpression);
  const flow = state.load('src/auth/mfaVerificationFlow.ts').createMfaVerificationFlow();
  const identity = state.load('src/services/authSessionIdentity.ts').readAuthSessionIdentity;
  let stage = 'mfa-setup';
  const notices = [];
  const context = { current: null };
  const contextCode = ts.transpileModule(`export const value = ${contextExpression.getText(file)};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sync = ({ probeError = false, probePending = false } = {}) => {
    const target = { exports: {} };
    vm.runInNewContext(contextCode, { exports: target.exports, module: target,
      mfaIdentity: identity(provider.value.session), preparedSessionKey: provider.value.preparedSessionKey,
      preparedUserId: provider.value.preparedUserId, authLoading: provider.value.loading,
      canManageMfa: true, profile: provider.value.profile, user: provider.value.user, stage,
      mfaProbeFailed: probeError, appleRecoveryProbeResolved: !probeError && !probePending,
      getAuthSessionOperationSnapshot: state.coordinator.getAuthSessionOperationSnapshot,
    });
    context.current = target.exports.value;
  };
  sync();
  const module = { exports: {} };
  const code = ts.transpileModule(`export const verify = ${handler.getText(file)}; export const reconcile = ${completionEffect.getText(file)};`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mfa = state.load('src/services/mfaService.ts');
  vm.runInNewContext(code, {
    exports: module.exports, module, Error, Promise,
    mfaVerificationContext: context, mfaIdentity: context.current.identity,
    mfaVerificationFlow: { current: flow }, mfaVerificationOwnerMounted: { current: true },
    setMfaVerificationRevision() {},
    verifyTotpEnrollment: mfa.verifyTotpEnrollment, verifyTotpFactor: mfa.verifyTotpFactor,
    isAuthSessionOperationBusyError: state.coordinator.isAuthSessionOperationBusyError,
    getAuthSessionOperationSnapshot: state.coordinator.getAuthSessionOperationSnapshot,
    notify: (...notice) => notices.push(notice), setStage: value => { stage = value; },
  });
  return { flow, notices, verify: module.exports.verify, reconcile(probe) { sync(probe); module.exports.reconcile(); }, get stage() { return stage; }, get context() { return context.current; } };
}

for (const enrollment of [false, true]) {
test(`App-owned ${enrollment ? 'enrollment' : 'step-up'} completion survives the auth-loading screen unmount`, { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: enrollment }), provider = state.mount();
  let screen;
  try {
    await provider.settle();
    const owner = appMfaOwner(state, provider);
    screen = state.mountMfaScreen({ onVerify: owner.verify }); await screen.settle();
    screen.enterCode('123456'); screen.submit(); screen.submit();
    await provider.settle();
    assert.equal(state.observations.mfaChallenges, 1);
    assert.equal(provider.value.loading, true);
    screen.unmount(); await screen.settle(); owner.reconcile();
    assert.equal(owner.flow.isPending(), true);
    assert.equal(owner.notices.length, 0);
    assert.equal(state.observations.mfaCleanups, 0);
    state.verification.resolve();
    for (let count = 0; count < 4; count++) { await provider.settle(); owner.reconcile(); }
    assert.equal(owner.stage, 'account-security');
    assert.equal(owner.notices.length, 1);
    assert.equal(owner.flow.isPending(), false);
    assert.equal(state.observations.mfaChallenges, 1);
    owner.reconcile(); assert.equal(owner.notices.length, 1);
  } finally {
    screen?.unmount(); provider.unmount(); state.verification.resolve(); await provider.settle();
  }
});
}

test('App-owned completion discards a late result after the restored identity changes', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); const owner = appMfaOwner(state, provider);
    screen = state.mountMfaScreen({ onVerify: owner.verify }); await screen.settle();
    screen.enterCode('123456'); screen.submit(); await provider.settle(); screen.unmount();
    state.setStored(session('B')); state.verification.resolve();
    for (let count = 0; count < 4; count++) { await provider.settle(); owner.reconcile(); }
    assert.equal(provider.value.user?.id, USER_B);
    assert.equal(owner.notices.length, 0);
    assert.equal(owner.flow.isPending(), false);
    assert.equal(state.observations.mfaChallenges, 1);
  } finally { screen?.unmount(); provider.unmount(); state.verification.resolve(); await provider.settle(); }
});

test('a pre-dispatch busy rejection clears the App attempt without requiring a new preparation epoch', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true }), provider = state.mount(), held = deferred();
  let operation;
  try {
    await provider.settle(); const owner = appMfaOwner(state, provider);
    operation = state.coordinator.runAuthSessionOperation(() => held.promise);
    await assert.rejects(owner.verify({ kind: 'step-up', factorId: 'fixture-mfa-factor', code: '123456' }), state.coordinator.isAuthSessionOperationBusyError);
    assert.equal(owner.flow.isPending(), false);
    assert.equal(state.observations.mfaChallenges, 0);
    assert.equal(owner.notices.length, 0);
  } finally { provider.unmount(); held.resolve(); await operation; await provider.settle(); }
});

test('invalid MFA input cannot create an App attempt waiting for a nonexistent write-preparation epoch', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true }), provider = state.mount();
  try {
    await provider.settle(); const owner = appMfaOwner(state, provider);
    await assert.rejects(owner.verify({ kind: 'step-up', factorId: 'fixture-mfa-factor', code: 'bad' }));
    assert.equal(owner.flow.isPending(), false);
    assert.equal(state.observations.mfaChallenges, 0);
    assert.equal(owner.notices.length, 0);
  } finally { provider.unmount(); await provider.settle(); }
});

test('a verification failure survives screen unmount as generic feedback without automatic challenge replay', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); const owner = appMfaOwner(state, provider);
    screen = state.mountMfaScreen({ onVerify: owner.verify }); await screen.settle();
    screen.enterCode('123456'); screen.submit(); await provider.settle(); screen.unmount();
    state.verification.reject(new Error('PRIVATE_SYNTHETIC_MFA_DETAIL'));
    for (let count = 0; count < 4; count++) { await provider.settle(); owner.reconcile(); }
    assert.equal(owner.flow.isPending(), false);
    assert.equal(owner.notices.length, 1);
    assert.equal(owner.notices[0][2], 'error');
    assert.doesNotMatch(JSON.stringify(owner.notices), /PRIVATE_SYNTHETIC/);
    assert.equal(state.observations.mfaChallenges, 1);
  } finally { screen?.unmount(); provider.unmount(); state.verification.resolve(); await provider.settle(); }
});

test('a failed current Apple recovery probe retires MFA delivery rather than trapping the loading gate', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle(); const owner = appMfaOwner(state, provider);
    screen = state.mountMfaScreen({ onVerify: owner.verify }); await screen.settle();
    screen.enterCode('123456'); screen.submit(); await provider.settle(); screen.unmount();
    state.verification.resolve();
    for (let count = 0; count < 3; count++) await provider.settle();
    owner.reconcile({ probePending: true }); assert.equal(owner.flow.isPending(), true);
    owner.reconcile({ probeError: true });
    assert.equal(owner.context.loading, false);
    assert.equal(owner.context.active, false);
    assert.equal(owner.flow.isPending(), false);
    assert.equal(owner.notices.length, 0, 'a failed probe cannot emit an MFA success toast');
    assert.equal(provider.value.loading, false, 'the existing Apple recovery error gate can now render');
  } finally { screen?.unmount(); provider.unmount(); state.verification.resolve(); await provider.settle(); }
});

test('App wiring keeps unrelated auth-loading gates and delegates managed MFA completion to its persistent owner', () => {
  const source = readFileSync(new URL('App.tsx', ROOT), 'utf8');
  assert.match(source, /if \(authLoading \|\| mfaVerificationPending\) return <LoadingScreen/);
  assert.match(source, /<MfaSetupScreen[\s\S]*?onVerify=\{handleMfaVerify\}/);
  assert.match(source, /if \(mfaVerificationPending\) return undefined/);
  assert.match(source, /loading: authLoading \|\| Boolean\(user && preparedSessionKey && !appleRecoveryProbeResolved && !mfaProbeFailed\)/);
  const file = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let gate, hardwareBack;
  const visit = node => {
    if (ts.isIfStatement(node) && node.expression.getText(file) === 'authLoading || mfaVerificationPending') gate = node.expression;
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'BackHandler.addEventListener'
      && node.arguments[0]?.text === 'hardwareBackPress') hardwareBack = node.arguments[1];
    ts.forEachChild(node, visit);
  };
  visit(file); assert.ok(gate);
  for (const authLoading of [false, true]) for (const mfaVerificationPending of [false, true]) {
    assert.equal(vm.runInNewContext(gate.getText(file), { authLoading, mfaVerificationPending }), authLoading || mfaVerificationPending);
  }
  assert.ok(hardwareBack);
  for (const mfaBusy of [false, true]) for (const pending of [false, true]) {
    let backs = 0;
    const request = vm.runInNewContext(`(${hardwareBack.getText(file)})`, {
      __DEV__: false, stage: 'mfa-setup', mfaBusy,
      robotConnectionVisible: false,
      mfaVerificationFlow: { current: { isPending: () => pending } },
      mfaBackRequestRef: { current: () => { backs++; } },
    });
    assert.equal(request(), true);
    assert.equal(backs, mfaBusy || pending ? 0 : 1);
  }
});

test('enrollment verification transfers factor ownership before the auth-loading unmount', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle();
    screen = state.mountMfaScreen(); await screen.settle();
    screen.enterCode('123456'); screen.submit();
    await provider.settle();
    assert.equal(state.observations.mfaChallenges, 1);
    assert.equal(provider.value.loading, true);
    screen.unmount(); await screen.settle();
    assert.equal(state.observations.mfaCleanups, 0, 'unmount must not delete the factor being verified');
  } finally {
    screen?.unmount(); provider.unmount(); state.verification.resolve();
    await provider.settle();
  }
});

test('an enrollment precondition rejection keeps screen cleanup ownership until explicit exit', { timeout: 10_000 }, async () => {
  const state = environment({ mfaVerification: true, mfaEnrollment: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle();
    screen = state.mountMfaScreen({ onVerify: async () => { throw new Error('synthetic precondition rejection'); } });
    await screen.settle(); screen.enterCode('123456'); screen.submit(); await screen.settle();
    assert.equal(state.observations.mfaChallenges, 0);
    assert.equal(state.observations.mfaCleanups, 0);
    screen.unmount(); await screen.settle();
    assert.equal(state.observations.mfaCleanups, 1, 'ownership never transferred to the rejecting parent');
  } finally { screen?.unmount(); provider.unmount(); await provider.settle(); }
});

for (const boundary of ['installation', 'registration']) {
test(`preparation excludes competing mutations during delayed ${boundary}`, { timeout: 10_000 }, async () => {
  const state = environment({ [`${boundary}Pending`]: true }), view = state.mount();
  try {
    await view.settle();
    assert.equal(boundary === 'installation' ? state.observations.installationReads : state.observations.registeredUsers.length, 1);
    await assert.rejects(state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      state.coordinator.isAuthSessionOperationBusyError);
  } finally {
    view.unmount();
    state.installation.resolve('22222222-2222-4222-8222-222222222222');
    state.registration.resolve({ data: { terminal: { id: 'fixture-terminal' } }, error: null });
    await view.settle();
  }
});
}

test('unmount during installation lookup prevents late registration dispatch', { timeout: 10_000 }, async () => {
  const state = environment({ installationPending: true }), view = state.mount();
  await view.settle();
  view.unmount();
  state.installation.resolve('22222222-2222-4222-8222-222222222222');
  await view.settle();
  assert.equal(state.observations.registeredUsers.length, 0);
});

test('a Provider-prepared session mounts the real security screen without re-registering', { timeout: 10_000 }, async () => {
  const state = environment();
  const provider = state.mount();
  let screen;
  try {
    await provider.settle();
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.preparedUserId, USER_A);
    const preparedKey = provider.value.preparedSessionKey;
    assert.ok(preparedKey);
    assert.equal(state.observations.registeredUsers.length, 1);
    const settledReads = state.observations.reads;
    for (let count = 0; count < 3; count++) await provider.settle();
    assert.equal(state.observations.reads, settledReads, 'an owned read without an auth event must not schedule itself again');
    assert.equal(state.observations.registeredUsers.length, 1);

    screen = state.mountSecurityScreen();
    await screen.settle();
    assert.equal(state.observations.registeredUsers.length, 1, 'security mount must not register the prepared session again');
    assert.equal(state.observations.terminalLists, 1);
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.preparedSessionKey, preparedKey);

    screen.unmount();
    screen = undefined;
    await provider.settle();
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.preparedSessionKey, preparedKey);
  } finally {
    screen?.unmount();
    provider.unmount();
  }
  assert.equal(state.observations.unsubscribed, 1);
});

test('real security-screen MFA status read preserves Provider preparation without a loading/remount loop', { timeout: 10_000 }, async () => {
  const state = environment({ mfaPending: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle();
    const readyKey = provider.value.preparedSessionKey;
    assert.ok(readyKey);
    screen = state.mountSecurityScreen({ canManageMfa: true });
    await screen.settle(); await provider.settle();
    assert.equal(state.observations.mfaStatusReads, 1);
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, true);
    assert.equal(provider.value.loading, false, 'a standalone status read must not trigger the App loading-screen gate');
    assert.equal(provider.value.preparedSessionKey, readyKey);
    await assert.rejects(state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      state.coordinator.isAuthSessionOperationBusyError);
    state.mfaFactors.resolve({ data: { all: [], totp: [] }, error: null });
    for (let count = 0; count < 3; count++) { await screen.settle(); await provider.settle(); }
    assert.equal(provider.value.loading, false);
    assert.equal(provider.value.preparedSessionKey, readyKey);
    assert.equal(state.observations.registeredUsers.length, 1);
    assert.equal(state.observations.mfaStatusReads, 1);
  } finally {
    screen?.unmount(); provider.unmount();
    state.mfaFactors.resolve({ data: { all: [], totp: [] }, error: null });
    await provider.settle();
  }
});

test('an auth event during standalone MFA read still invalidates and fresh-ingests after actual idle', { timeout: 10_000 }, async () => {
  const state = environment({ mfaPending: true }), provider = state.mount();
  let screen;
  try {
    await provider.settle();
    const initialReads = state.observations.reads;
    screen = state.mountSecurityScreen({ canManageMfa: true });
    await screen.settle(); await provider.settle();
    assert.equal(provider.value.loading, false);
    state.setStored(session('B'));
    state.emit('TOKEN_REFRESHED', session('A'));
    await provider.settle();
    assert.equal(provider.value.loading, true, 'read classification must not suppress an actual auth event');
    assert.equal(provider.value.preparedSessionKey, null);
    assert.equal(state.observations.reads, initialReads, 'fresh ingestion must wait for retained read settlement');
    state.mfaFactors.resolve({ data: { all: [], totp: [] }, error: null });
    for (let count = 0; count < 3; count++) await provider.settle();
    assert.equal(provider.value.user?.id, USER_B, 'must read current SDK session, not replay event A');
    assert.equal(provider.value.preparedUserId, USER_B);
    assert.equal(provider.value.loading, false);
    assert.equal(state.observations.reads, initialReads + 1);
    const stableKey = provider.value.preparedSessionKey;
    for (let count = 0; count < 3; count++) await provider.settle();
    assert.equal(provider.value.preparedSessionKey, stableKey);
    assert.equal(state.observations.registeredUsers.length, 2);
  } finally {
    screen?.unmount(); provider.unmount();
    state.mfaFactors.resolve({ data: { all: [], totp: [] }, error: null });
    await provider.settle();
  }
});

test('an owned pending Provider read excludes competing operations and a refresh event reconciles once', { timeout: 10_000 }, async () => {
  const state = environment({ initialPending: true }), view = state.mount();
  try {
    await view.settle();
    assert.equal(state.observations.reads, 1);
    await assert.rejects(state.coordinator.runAuthSessionOperation(async () => 'competing mutation'),
      state.coordinator.isAuthSessionOperationBusyError);
    state.setStored(session('B'));
    state.emit('TOKEN_REFRESHED', session('B'));
    state.initial.resolve({ data: { session: session('A') }, error: null });
    for (let count = 0; count < 3; count++) await view.settle();
    assert.equal(view.value.user?.id, USER_B, 'the invalidated read must not publish captured A');
    assert.equal(view.value.loading, false);
    assert.equal(view.value.preparedUserId, USER_B);
    assert.deepEqual(state.observations.registeredUsers, [USER_B]);
    // Two Provider reads: initial + one fresh. The Functions host boundary here
    // does not run the real SDK's token getter, so it adds no SDK read.
    assert.equal(state.observations.reads, 2);
    for (let count = 0; count < 3; count++) await view.settle();
    assert.equal(state.observations.reads, 2, 'a refresh notification must not cause a self-read loop');
    assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
  } finally {
    view.unmount();
    state.initial.resolve({ data: { session: session('A') }, error: null });
    await view.settle();
  }
});

test('unmounting a Provider during its owned read prevents late preparation and releases only after settlement', { timeout: 10_000 }, async () => {
  const state = environment({ initialPending: true }), view = state.mount();
  await view.settle();
  view.unmount();
  assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, true);
  state.initial.resolve({ data: { session: session('A') }, error: null });
  await view.settle();
  assert.equal(state.observations.registeredUsers.length, 0);
  assert.equal(state.observations.profileUsers.length, 0);
  assert.equal(state.coordinator.getAuthSessionOperationSnapshot().busy, false);
});

test('idle completion rereads current SDK storage rather than replaying the auth event', { timeout: 10_000 }, async () => {
  const state = environment(), view = state.mount(), hold = deferred();
  try {
    await view.settle();
    const reads = state.observations.reads;
    const pending = state.coordinator.runAuthSessionOperation(() => hold.promise);
    state.emit('SIGNED_IN', session('A'));
    state.setStored(session('B'));
    await view.settle();
    assert.equal(state.observations.reads, reads);
    hold.resolve(); await pending; await view.settle();
    assert.equal(view.value.user.id, USER_B);
    assert.equal(view.value.preparedUserId, USER_B);
    assert.equal(view.value.loading, false);
    assert.equal(state.observations.reads, reads + 1);
  } finally { hold.resolve(); view.unmount(); }
});

for (const outcome of ['unknown', 'revoked']) {
test(`${outcome} identity remains blocked on Provider remount while fresh B is allowed`, { timeout: 10_000 }, async () => {
  const state = environment();
  const ticket = state.fence.beginSessionRevocation({ userId: USER_A, sessionId: USER_A });
  state.fence[outcome === 'unknown' ? 'markSessionRevocationUnknown' : 'markSessionRevoked'](ticket);
  let view = state.mount();
  try {
    await view.settle();
    assert.equal(view.value.user, null);
    assert.equal(view.value.preparedUserId, null);
    assert.ok(view.value.initializationError);
    assert.equal(state.observations.registeredUsers.length, 0);
    view.unmount(); view = state.mount(); await view.settle();
    assert.equal(view.value.user, null);
    assert.equal(state.observations.registeredUsers.length, 0);
    state.setStored(session('B')); state.emit('SIGNED_IN', session('B')); await view.settle();
    assert.equal(view.value.preparedUserId, USER_B);
    assert.equal(view.value.loading, false);
    assert.equal(state.fence.getSessionIngestionBlock(session('A')), outcome);
  } finally { view.unmount(); }
});
}

test('recovery hint is identity-bound and unsubscribe prevents late event work', { timeout: 10_000 }, async () => {
  const state = environment(), view = state.mount();
  await view.settle();
  state.emit('PASSWORD_RECOVERY', session('A')); await view.settle();
  assert.equal(view.value.recovery, true);
  state.setStored(session('B')); state.emit('TOKEN_REFRESHED', session('B')); await view.settle();
  assert.equal(view.value.recovery, false);
  view.unmount();
  const reads = state.observations.reads;
  state.emit('SIGNED_IN', session('A')); await view.settle();
  assert.equal(state.observations.reads, reads);
  assert.equal(state.observations.unsubscribed, 1);
});

test('retry after local cleanup failure stays on the error gate without throwing from the effect', { timeout: 10_000 }, async () => {
  const state = environment({ localCleanupFailsOnce: true }), view = state.mount();
  try {
    await view.settle();
    await assert.rejects(view.value.logoutLocalSession(), /本机登录信息清理失败/);
    await view.settle();
    const reads = state.observations.reads;
    view.value.retryInitialization();
    await view.settle();
    assert.equal(view.value.loading, false);
    assert.match(view.value.initializationError.message, /本机登录信息尚未清理完成/);
    assert.equal(view.value.user, null);
    assert.equal(view.value.preparedSessionKey, null);
    assert.equal(state.observations.reads, reads, 'retry must not bypass failed cleanup to read the retained session');
    await view.value.logoutLocalSession();
    await view.settle();
    assert.equal(view.value.loading, false);
    assert.equal(view.value.initializationError, null);
    assert.equal(view.value.user, null);
  } finally { view.unmount(); }
});

test('explicit local exit retires a pending preparation and its late auth event', { timeout: 10_000 }, async () => {
  const state = environment({ registrationPending: true }), view = state.mount();
  try {
    await view.settle();
    assert.equal(view.value.loading, true);
    await view.value.logoutLocalSession();
    state.emit('SIGNED_IN', session('A'));
    await view.settle();
    assert.equal(view.value.user, null);
    assert.equal(view.value.profile, null);
    assert.equal(view.value.preparedSessionKey, null);
    state.registration.resolve({ data: { terminal: { id: 'synthetic-terminal' } }, error: null });
    await view.settle();
    assert.equal(view.value.user, null);
    assert.equal(view.value.loading, false);
    assert.equal(view.value.initializationError, null);
  } finally { view.unmount(); }
});

for (const assertionKind of ['publication', 'preparation']) {
test(`busy auth event ${assertionKind} is fenced`, { timeout: 10_000 }, async t => {
  const state = environment(), view = state.mount(), hold = deferred();
  let operation;
  try {
    await view.settle();
    const profileCount = state.observations.profileUsers.length;
    const registrationCount = state.observations.registeredUsers.length;
    operation = state.coordinator.runAuthSessionOperation(() => hold.promise);
    state.emit('SIGNED_IN', session('B'));
    await view.settle();
    t.diagnostic(JSON.stringify({ publishedCapturedB: view.value.user?.id === USER_B,
      addedRegistrations: state.observations.registeredUsers.length - registrationCount,
      addedProfileReads: state.observations.profileUsers.length - profileCount }));
    if (assertionKind === 'publication') {
      assert.equal(view.value.user?.id === USER_B, false, 'busy captured B was published by actual AuthProvider');
    } else {
      assert.equal(state.observations.registeredUsers.length, registrationCount, 'busy event must not register a captured account');
      assert.equal(state.observations.profileUsers.length, profileCount, 'busy event must not prepare a captured account');
    }
  } finally {
    view.unmount(); hold.resolve(); await operation;
  }
});

test(`busy initial restoration ${assertionKind} is fenced`, { timeout: 10_000 }, async t => {
  const state = environment({ initialPending: true }), hold = deferred();
  const operation = state.coordinator.runAuthSessionOperation(() => hold.promise);
  const view = state.mount();
  try {
    state.initial.resolve({ data: { session: session('A') }, error: null });
    await view.settle();
    t.diagnostic(JSON.stringify({ publishedInitialA: view.value.user?.id === USER_A,
      registrations: state.observations.registeredUsers.length, profileReads: state.observations.profileUsers.length }));
    assert.equal(state.observations.reads, 0, 'a pre-existing operation must prevent initial SDK read dispatch');
    if (assertionKind === 'publication') {
      assert.equal(view.value.user?.id === USER_A, false, 'busy initial session was published by actual AuthProvider');
    } else {
      assert.equal(state.observations.registeredUsers.length, 0, 'busy restoration must not register its old session');
    }
  } finally {
    view.unmount(); hold.resolve(); await operation;
  }
});
}
