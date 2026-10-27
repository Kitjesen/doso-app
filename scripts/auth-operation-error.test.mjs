import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);

function transpile(relative) {
  return ts.transpileModule(readFileSync(new URL(relative, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function loadMapper() {
  const module = { exports: {} };
  vm.runInNewContext(transpile('src/services/authOperationError.ts'), {
    Error,
    TypeError,
    exports: module.exports,
    module,
    require,
  });
  return module.exports;
}

const mapper = loadMapper();
const emailOtpContract = (() => {
  const module = { exports: {} };
  vm.runInNewContext(transpile('src/services/emailOtp.ts'), {
    Error,
    RegExp,
    exports: module.exports,
    module,
  });
  return module.exports;
})();

function loadAuthService(auth, getClient = () => ({ auth }), observeCoordinator = () => {}) {
  const module = { exports: {} };
  // Each fixture runs the actual same-runtime coordinator; never bypass its
  // synchronous exclusion just to make the older error-mapping harness load.
  const coordinator = { exports: {} };
  vm.runInNewContext(transpile('src/services/authSessionOperation.ts'), {
    Error, Promise, module: coordinator, exports: coordinator.exports,
  });
  observeCoordinator(coordinator.exports);
  const localRequire = name => {
    if (name === './authSessionOperation') return coordinator.exports;
    if (name === './authOperationError') return mapper;
    if (name === './emailOtp') return emailOtpContract;
    if (name === './supabaseClient') return { getSupabaseClient: getClient };
    if (name === './authRedirect') return {
      buildAuthRedirectUrl: () => 'doso://auth/callback',
      createAuthCallbackDeduper: () => {},
      getAuthCallbackDeduplicationKey: () => '',
      parseAuthCallbackKind: () => null,
    };
    if (name === './appleAuthCore') return { normalizePresentationDisplayName: value => value };
    if (name === './otpError') return { mapOtpOperationError: error => error };
    throw new Error(`Unexpected auth service dependency: ${name}`);
  };
  vm.runInNewContext(transpile('src/services/authService.ts'), {
    Error,
    TypeError,
    URL,
    URLSearchParams,
    exports: module.exports,
    module,
    process,
    require: localRequire,
  });
  return module.exports;
}

test('login blocked by an existing owner never enters the SDK client boundary', async () => {
  let coordinator, release, clientReads = 0, sdkCalls = 0;
  const auth = { signInWithPassword: async () => { sdkCalls++; return { data: {}, error: null }; } };
  const service = loadAuthService(auth, () => { clientReads++; return { auth }; }, api => { coordinator = api; });
  const holding = coordinator.runAuthSessionOperation(() => new Promise(resolve => { release = resolve; }));
  try {
    await assert.rejects(service.login({ email: 'fixture@example.invalid', password: 'synthetic-only' }),
      coordinator.isAuthSessionOperationBusyError);
    assert.equal(clientReads, 0, 'busy rejection must happen before potentially first SDK construction');
    assert.equal(sdkCalls, 0);
  } finally { release(); await holding; }
});

test('register blocked by an existing owner never enters the SDK client boundary', async () => {
  let coordinator, release, clientReads = 0, sdkCalls = 0;
  const auth = { signUp: async () => { sdkCalls++; return { data: {}, error: null }; } };
  const service = loadAuthService(auth, () => { clientReads++; return { auth }; }, api => { coordinator = api; });
  const holding = coordinator.runAuthSessionOperation(() => new Promise(resolve => { release = resolve; }));
  try {
    await assert.rejects(service.register({ username: 'fixture_robot', email: 'fixture@example.invalid', password: 'synthetic-only' }),
      coordinator.isAuthSessionOperationBusyError);
    assert.equal(clientReads, 0, 'busy rejection must happen before potentially first SDK construction');
    assert.equal(sdkCalls, 0);
  } finally { release(); await holding; }
});

for (const [method, sdkMethod, input] of [
  ['login', 'signInWithPassword', { email: 'fixture@example.invalid', password: 'synthetic-only' }],
  ['register', 'signUp', { username: 'fixture_robot', email: 'fixture@example.invalid', password: 'synthetic-only' }],
]) {
  test(`${method} owns the client boundary and retains exclusion until its SDK call settles`, async () => {
    let coordinator, settle;
    const entered = [];
    const sdkResult = new Promise(resolve => { settle = resolve; });
    const auth = { [sdkMethod]: () => {
      entered.push({ boundary: 'sdk', busy: coordinator.getAuthSessionOperationSnapshot().busy });
      return sdkResult;
    } };
    const service = loadAuthService(auth, () => {
      entered.push({ boundary: 'client', busy: coordinator.getAuthSessionOperationSnapshot().busy });
      return { auth };
    }, api => { coordinator = api; });
    const data = { session: null, user: null };
    const pending = service[method](input);
    try {
      assert.deepEqual(entered, [{ boundary: 'client', busy: true }, { boundary: 'sdk', busy: true }]);
      let competitorRan = false;
      await assert.rejects(coordinator.runAuthSessionOperation(async () => { competitorRan = true; }),
        coordinator.isAuthSessionOperationBusyError);
      assert.equal(competitorRan, false);
      assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, true);
      settle({ data, error: null });
      assert.equal(await pending, data);
      assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.equal(entered.length, 2, 'no automatic second client entry or SDK retry');
    } finally { settle({ data, error: null }); await pending.catch(() => undefined); }
  });

  test(`${method} preserves client-boundary errors and releases ownership without mapping or SDK dispatch`, async () => {
    for (const name of ['SupabaseConfigurationError', 'Error']) {
      let coordinator, sdkCalls = 0, getterBusy = false;
      const original = new Error('synthetic client boundary failure');
      original.name = name;
      const auth = { [sdkMethod]: async () => { sdkCalls++; } };
      const service = loadAuthService(auth, () => {
        getterBusy = coordinator.getAuthSessionOperationSnapshot().busy;
        throw original;
      }, api => { coordinator = api; });
      await assert.rejects(service[method](input), error => error === original);
      assert.equal(getterBusy, true);
      assert.equal(sdkCalls, 0);
      assert.equal(coordinator.getAuthSessionOperationSnapshot().busy, false);
      assert.equal(await coordinator.runAuthSessionOperation(async () => 'available'), 'available');
    }
  });
}

const mappingCases = [
  ['wrong password', { code: 'invalid_credentials', status: 400 }, 'login', 'invalid_credentials', '邮箱或密码不正确，请检查后重试。'],
  ['code before legacy message', { code: 'invalid_credentials', message: 'Network request failed', status: 400 }, 'login', 'invalid_credentials', '邮箱或密码不正确，请检查后重试。'],
  ['unconfirmed email', { code: 'email_not_confirmed', status: 400 }, 'login', 'email_not_confirmed', '邮箱尚未确认，请先查看确认邮件。'],
  ['rate limit code', { code: 'over_request_rate_limit', status: 429 }, 'login', 'rate_limited', '操作过于频繁，请稍后再试。'],
  ['registration disabled', { code: 'signup_disabled', status: 422 }, 'register', 'signup_disabled', '当前暂未开放邮箱注册，请稍后再试。'],
  ['email registration disabled', { code: 'email_provider_disabled', status: 422 }, 'register', 'signup_disabled', '当前暂未开放邮箱注册，请稍后再试。'],
  ['weak password', { code: 'weak_password', status: 422 }, 'register', 'weak_password', '密码强度不足，请使用更长且更难猜测的密码。'],
  ['existing account', { code: 'user_already_exists', status: 422 }, 'register', 'account_may_exist', '无法完成注册。请检查邮箱中的确认邮件，或尝试登录。'],
  ['service failure', { code: 'unexpected_failure', status: 500 }, 'login', 'service_unavailable', '登录服务暂时不可用，请稍后重试。'],
  ['login network failure', new TypeError('Network request failed'), 'login', 'network_unavailable', '无法连接认证服务，请检查网络后重试。'],
  ['uncertain registration timeout', { code: 'request_timeout', status: 504 }, 'register', 'network_unavailable', '注册请求结果暂时无法确认。请检查邮箱中的确认邮件，或尝试登录后再决定是否重新注册。'],
];

for (const [name, error, operation, category, message] of mappingCases) {
  test(`maps ${name} without exposing upstream details`, () => {
    const mapped = mapper.mapAuthOperationError(error, operation);
    assert.equal(mapped.category, category);
    assert.equal(mapped.message, message);
  });
}

test('unknown upstream content is not copied into the mapped error', () => {
  const secret = 'Bearer secret-token SQL: select * from auth.users';
  const mapped = mapper.mapAuthOperationError({
    body: { access_token: secret },
    code: secret,
    message: secret,
  }, 'register');
  assert.equal(mapped.authCode, undefined);
  assert.equal(mapped.message, '暂时无法完成注册，请稍后重试。');
  assert.doesNotMatch(JSON.stringify(mapped), /secret-token|auth\.users/i);
});

test('register keeps local validation errors and never calls the SDK', async () => {
  let calls = 0, clientReads = 0;
  const auth = { signUp: async () => { calls += 1; } };
  const service = loadAuthService(auth, () => { clientReads++; return { auth }; });
  await assert.rejects(
    service.register({ username: 'ok_name', email: 'not-an-email', password: 'StrongPass123' }),
    { message: '请输入有效的邮箱地址。' },
  );
  assert.equal(clientReads, 0);
  assert.equal(calls, 0);
});

test('service configuration errors remain available to the existing App handler', async () => {
  const configurationError = new Error('configuration missing');
  configurationError.name = 'SupabaseConfigurationError';
  const service = loadAuthService({}, () => { throw configurationError; });
  await assert.rejects(
    service.login({ email: 'user@example.com', password: 'password' }),
    error => error === configurationError,
  );
});

test('register maps a returned SDK error at the service boundary', async () => {
  const service = loadAuthService({
    signUp: async () => ({ data: null, error: { code: 'weak_password', message: 'raw policy body', status: 422 } }),
  });
  await assert.rejects(
    service.register({ username: 'robot_01', email: 'USER@Example.com ', password: 'short' }),
    { message: '密码强度不足，请使用更长且更难猜测的密码。', category: 'weak_password' },
  );
});

test('register treats database failures as service faults instead of username conflicts', async () => {
  const service = loadAuthService({
    signUp: async () => ({
      data: null,
      error: {
        message: 'Database error saving new user: duplicate key SQL select * from auth.users',
        status: 500,
      },
    }),
  });
  await assert.rejects(
    service.register({ username: 'robot_01', email: 'user@example.com', password: 'StrongPass123' }),
    { message: '注册服务暂时不可用，请稍后重试。', category: 'service_unavailable' },
  );
});

test('register maps a thrown network failure as an uncertain result without retrying', async () => {
  let calls = 0;
  const service = loadAuthService({
    signUp: async () => {
      calls += 1;
      throw new TypeError('Failed to fetch https://project.supabase.co/auth/v1/signup?token=secret');
    },
  });
  await assert.rejects(
    service.register({ username: 'robot_01', email: 'user@example.com', password: 'StrongPass123' }),
    {
      message: '注册请求结果暂时无法确认。请检查邮箱中的确认邮件，或尝试登录后再决定是否重新注册。',
      category: 'network_unavailable',
    },
  );
  assert.equal(calls, 1);
});

test('login normalizes only the email and maps returned credentials errors', async () => {
  let received;
  const service = loadAuthService({
    signInWithPassword: async input => {
      received = input;
      return { data: null, error: { code: 'invalid_credentials', message: 'Invalid login credentials', status: 400 } };
    },
  });
  await assert.rejects(
    service.login({ email: ' USER@Example.com ', password: '  password with spaces  ' }),
    { message: '邮箱或密码不正确，请检查后重试。', category: 'invalid_credentials' },
  );
  assert.equal(received.email, 'user@example.com');
  assert.equal(received.password, '  password with spaces  ');
});

test('login maps a thrown network failure and does not expose its URL', async () => {
  const service = loadAuthService({
    signInWithPassword: async () => {
      throw new TypeError('Network request failed for https://secret-project.supabase.co');
    },
  });
  await assert.rejects(
    service.login({ email: 'user@example.com', password: 'password' }),
    { message: '无法连接认证服务，请检查网络后重试。', category: 'network_unavailable' },
  );
});

test('restored-session feedback sanitizes only the known retryable transport error without rewriting unrelated Auth errors', async () => {
  for (const [name, status] of [['AuthRetryableFetchError', 0], ['AuthRetryableFetchError', 500],
    ['AuthRetryableFetchErrorExtra', 0], ['AuthApiError', 400]]) {
    const upstream = { name, status, message: 'private upstream URL and token details' };
    const service = loadAuthService({ getSession: async () => ({ data: { session: null }, error: upstream }) });
    await assert.rejects(service.getSession(), error => {
      if (name !== 'AuthRetryableFetchError' || status !== 0) return error === upstream;
      assert.ok(error instanceof Error);
      assert.equal(error.message, '认证服务暂时无法连接，请检查网络并稍后重试。');
      assert.doesNotMatch(error.message, /private|URL|token/);
      return true;
    });
  }
});

test('profile service maps only the exact timeout code to a safe Error usable by Provider feedback', async () => {
  for (const code of ['request_timeout', 'request_timeout_extra', 'PGRST116']) {
    const upstream = { code, message: 'private upstream URL and query details' };
    const service = loadAuthService({}, () => ({
      from: () => ({ select() { return this; }, eq() { return this; },
        maybeSingle: async () => ({ data: null, error: upstream }) }),
    }));
    await assert.rejects(service.getProfile('fixture-user'), error => {
      if (code !== 'request_timeout') return error === upstream;
      assert.ok(error instanceof Error);
      assert.equal(error.message, '账户资料读取超时，请检查网络后重试。');
      assert.doesNotMatch(error.message, /private|URL|query/);
      return true;
    });
  }
});

for (const method of ['verifySignupOtp', 'verifyPasswordRecoveryOtp']) {
  test(`${method} forwards an eight-digit email OTP with its leading zero intact`, async () => {
    let received;
    const service = loadAuthService({
      verifyOtp: async input => {
        received = input;
        return { data: { session: null, user: null }, error: null };
      },
    });

    await service[method]('qa@example.com', '01234567');

    assert.equal(received.token, '01234567');
  });
}

test('email OTP service accepts 6 through 10 digits and rejects overflow or non-numeric input', async () => {
  const received = [];
  const service = loadAuthService({
    verifyOtp: async input => {
      received.push(input.token);
      return { data: { session: null, user: null }, error: null };
    },
  });

  for (const code of ['012345', '01234567', '0123456789']) {
    await service.verifySignupOtp('qa@example.com', code);
  }
  for (const code of ['01234567890', '01234a']) {
    await assert.rejects(
      service.verifySignupOtp('qa@example.com', code),
      { message: '请输入邮件中的 6–10 位数字验证码。' },
    );
  }

  assert.deepEqual(received, ['012345', '01234567', '0123456789']);
});
