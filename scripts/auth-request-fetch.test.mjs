import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createClient } from '@supabase/supabase-js';
import { mapAuthOperationError } from '../src/services/authOperationError.ts';
import { createAuthRequestFetch } from '../src/services/authRequestFetch.ts';

const SUPABASE_URL = 'https://project.example.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_test';

test('logout deadline covers POST URL and Request forms, scope variants, and init method overrides', async () => {
  for (const scope of ['local', 'global', 'others']) {
    for (const [input, init] of [
      [`${SUPABASE_URL}/auth/v1/logout?scope=${scope}`, { method: 'POST' }],
      [new Request(`${SUPABASE_URL}/auth/v1/logout?scope=${scope}`, { method: 'POST' }), undefined],
      [new Request(`${SUPABASE_URL}/auth/v1/logout?scope=${scope}`), { method: 'post' }],
    ]) {
      let signal;
      const bounded = createAuthRequestFetch((_input, forwarded) => {
        signal = forwarded.signal;
        return new Promise(() => undefined);
      }, { timeoutMs: 5 });
      const response = await bounded(input, init);
      assert.equal(response.status, 408);
      assert.equal((await response.json()).code, 'request_timeout');
      assert.equal(signal.aborted, true);
    }
  }
});

test('logout deadline excludes other methods, overridden POST Requests, and similar paths', async () => {
  for (const [input, init] of [
    [`${SUPABASE_URL}/auth/v1/logout`, undefined],
    [`${SUPABASE_URL}/auth/v1/logout`, { method: 'DELETE' }],
    [`${SUPABASE_URL}/auth/v1/logout/`, { method: 'POST' }],
    [`${SUPABASE_URL}/auth/v1/logout-extra`, { method: 'POST' }],
    [new Request(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST' }), { method: 'GET' }],
  ]) {
    const caller = new AbortController();
    let receivedSignal;
    const bounded = createAuthRequestFetch(async (_input, forwarded) => {
      receivedSignal = forwarded.signal;
      return new Response(null, { status: 204 });
    }, { timeoutMs: 1 });
    assert.equal((await bounded(input, { ...init, signal: caller.signal })).status, 204);
    assert.equal(receivedSignal, caller.signal);
  }
});

test('logout uses the production 15-second monotonic deadline and discards a late 204', async () => {
  let now = 0;
  const bounded = createAuthRequestFetch(async () => {
    now = 15_001;
    return new Response(null, { status: 204 });
  }, { now: () => now });
  assert.equal((await bounded(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST' })).status, 408);
});

test('account-sessions SDK invocation settles when transport hangs and discards a late success', { timeout: 2000 }, async () => {
  let finishTransport, aborted = false;
  const transport = new Promise(resolve => { finishTransport = resolve; });
  const sdk = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: createAuthRequestFetch((_input, init) => {
      init.signal.addEventListener('abort', () => { aborted = true; }, { once: true });
      return transport;
    }, { timeoutMs: 20 }) },
  });
  const outcome = await sdk.functions.invoke('account-sessions', { body: { action: 'register' } });
  assert.equal(outcome.data, null);
  assert.ok(outcome.error);
  assert.equal(outcome.response.status, 408);
  assert.equal(aborted, true);
  finishTransport(new Response(JSON.stringify({ terminal: { id: 'late-synthetic' } }), {
    headers: { 'content-type': 'application/json' },
  }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(outcome.data, null);
});

test('reauthentication GET has a deadline and reports uncertain delivery when transport ignores abort', { timeout: 2000 }, async () => {
  let finishTransport, probeTimer, aborted = false;
  const transport = new Promise(resolve => { finishTransport = resolve; });
  const boundedFetch = createAuthRequestFetch((_input, init) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; }, { once: true });
    return transport;
  }, { timeoutMs: 20 });
  const request = boundedFetch(`${SUPABASE_URL}/auth/v1/reauthenticate`, { method: 'GET' });
  try {
    const response = await Promise.race([request,
      new Promise(resolve => { probeTimer = setTimeout(() => resolve('still-pending'), 150); })]);
    assert.notEqual(response, 'still-pending', 'nonce transport must settle before it can hold a global owner');
    assert.equal(response.status, 408);
    assert.equal(response.headers.get('X-Supabase-Api-Version'), '2024-01-01');
    assert.deepEqual(await response.json(), { code: 'request_timeout',
      message: '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。' });
    assert.equal(aborted, true);
  } finally {
    clearTimeout(probeTimer);
    finishTransport(new Response('{}', { headers: { 'content-type': 'application/json' } }));
    await request;
  }
});

test('reauthentication deadline excludes non-GET methods and similar paths', async () => {
  const cases = [
    [`${SUPABASE_URL}/auth/v1/reauthenticate`, 'POST'],
    [`${SUPABASE_URL}/auth/v1/reauthenticate`, 'DELETE'],
    [`${SUPABASE_URL}/auth/v1/reauthenticate/`, 'GET'],
    [`${SUPABASE_URL}/auth/v1/reauthenticate-extra`, 'GET'],
  ];

  for (const [url, method] of cases) {
    const caller = new AbortController();
    let receivedSignal;
    const boundedFetch = createAuthRequestFetch(async (_input, init) => {
      receivedSignal = init?.signal;
      return new Response(null, { status: 204 });
    }, { timeoutMs: 1 });

    const response = await boundedFetch(url, { method, signal: caller.signal });

    assert.equal(response.status, 204, `${method} ${new URL(url).pathname} must pass through`);
    assert.equal(receivedSignal, caller.signal);
  }
});

test('reauthentication recognizes Request methods, lowercase GET, and init overrides', async () => {
  const cases = [
    [new Request(`${SUPABASE_URL}/auth/v1/reauthenticate`), undefined],
    [new Request(`${SUPABASE_URL}/auth/v1/reauthenticate`, { method: 'POST' }), { method: 'get' }],
    [`${SUPABASE_URL}/auth/v1/reauthenticate`, { method: 'get' }],
  ];

  for (const [input, init] of cases) {
    const boundedFetch = createAuthRequestFetch((_request, forwarded) => new Promise((_resolve, reject) => {
      forwarded?.signal?.addEventListener('abort', () => reject(forwarded.signal.reason), { once: true });
    }), { timeoutMs: 5 });

    const response = await boundedFetch(input, init);

    assert.equal(response.status, 408);
    assert.deepEqual(await response.json(), {
      code: 'request_timeout',
      message: '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。',
    });
  }
});

test('reauthentication deadline includes response buffering and ignores a late body', async () => {
  let streamController;
  let aborted = false;
  const boundedFetch = createAuthRequestFetch(async (_input, init) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; }, { once: true });
    return new Response(new ReadableStream({
      start(controller) { streamController = controller; },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Late-Response': 'must-not-escape',
      },
    });
  }, { timeoutMs: 5 });

  const response = await boundedFetch(`${SUPABASE_URL}/auth/v1/reauthenticate`, { method: 'GET' });
  assert.equal(response.status, 408);
  assert.equal(response.headers.get('x-late-response'), null);
  assert.equal(aborted, true);
  assert.deepEqual(await response.json(), {
    code: 'request_timeout',
    message: '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。',
  });

  streamController.enqueue(new TextEncoder().encode(JSON.stringify({ delivered: true })));
  streamController.close();
  await Promise.resolve();
  assert.equal(response.status, 408);
});

test('caller abort wins over the reauthentication deadline without timeout relabeling', async () => {
  let underlyingAborted = false;
  const caller = new AbortController();
  const boundedFetch = createAuthRequestFetch((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      underlyingAborted = true;
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  }), { timeoutMs: 1_000 });
  const request = boundedFetch(`${SUPABASE_URL}/auth/v1/reauthenticate`, {
    method: 'GET',
    signal: caller.signal,
  });

  caller.abort();

  await assert.rejects(request, (error) => error?.name === 'AbortError');
  assert.equal(underlyingAborted, true);
});

test('reauthentication uses the injected monotonic deadline after response buffering', async () => {
  let now = 0;
  let underlyingSignal;
  const boundedFetch = createAuthRequestFetch(async (_input, init) => {
    underlyingSignal = init?.signal;
    now = 11;
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }, { timeoutMs: 10, now: () => now });

  const response = await boundedFetch(`${SUPABASE_URL}/auth/v1/reauthenticate`, { method: 'GET' });

  assert.equal(response.status, 408);
  assert.equal(underlyingSignal?.aborted, true);
  assert.deepEqual(await response.json(), {
    code: 'request_timeout',
    message: '安全验证码发送结果暂时无法确认，请先检查邮箱，稍后再试。',
  });
});

function createMemoryStorage() {
  const values = new Map();
  return {
    values,
    adapter: {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
      removeItem: async (key) => values.delete(key),
    },
  };
}

function encodeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

function successfulPasswordResponse(label) {
  return new Response(JSON.stringify({
    access_token: `access-${label}`,
    expires_in: 3600,
    refresh_token: `refresh-${label}`,
    token_type: 'bearer',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'qa@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-13T00:00:00Z',
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('password login aborts the underlying Auth request at its deadline and never establishes a session', async () => {
  let aborted = false;
  const fakeFetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      aborted = true;
      reject(init.signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  const storage = createMemoryStorage();
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: storage.adapter,
    },
    global: {
      fetch: createAuthRequestFetch(fakeFetch, { timeoutMs: 20 }),
    },
  });
  const events = [];
  const { data: subscription } = client.auth.onAuthStateChange((event) => events.push(event));

  const result = await client.auth.signInWithPassword({
    email: 'qa@example.com',
    password: 'ExamplePassword123',
  });

  subscription.subscription.unsubscribe();
  assert.equal(result.error?.code, 'request_timeout');
  assert.equal(result.data.session, null);
  assert.equal(result.data.user, null);
  assert.equal(aborted, true);
  assert.equal(events.includes('SIGNED_IN'), false);
  assert.equal([...storage.values.values()].some((value) => value.includes('access_token')), false);
});

test('profile preparation read has a deadline and returns safe retry feedback even when transport ignores abort', { timeout: 2000 }, async () => {
  let finishTransport;
  let aborted = false;
  const transport = new Promise(resolve => { finishTransport = resolve; });
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: createAuthRequestFetch((_input, init) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; }, { once: true });
      return transport;
    }, { timeoutMs: 20 }) },
  });
  const read = Promise.resolve(client.from('profiles').select('id').maybeSingle());
  try {
    const result = await Promise.race([read, new Promise(resolve => setTimeout(() => resolve('still-pending'), 100))]);
    assert.notEqual(result, 'still-pending', 'profile preparation must not remain indefinitely pending');
    assert.equal(result.data, null);
    assert.equal(result.error?.code, 'request_timeout');
    assert.equal(result.error?.message, '账户资料读取超时，请检查网络后重试。');
    assert.equal(aborted, true);
  } finally {
    finishTransport(new Response(JSON.stringify([{ id: 'late-profile' }]), { headers: { 'content-type': 'application/json' } }));
    await read;
  }
});

test('cold-start refresh aborts a permanently hung request within its retry budget and preserves storage', async () => {
  const storage = createMemoryStorage();
  const storageKey = 'sb-project-auth-token';
  const session = {
    access_token: encodeJwt({
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) - 60,
      role: 'authenticated',
      sub: '11111111-1111-4111-8111-111111111111',
    }),
    expires_at: Math.floor(Date.now() / 1000) - 60,
    expires_in: 3600,
    refresh_token: 'existing-refresh-token',
    token_type: 'bearer',
    user: {
      id: '11111111-1111-4111-8111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'qa@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-10-13T00:00:00Z',
    },
  };
  storage.values.set(storageKey, JSON.stringify(session));
  const originalDateNow = Date.now;
  let fakeNow = originalDateNow();
  let attempts = 0;
  Date.now = () => fakeNow;
  const fakeFetch = (_input, init) => new Promise((_resolve, reject) => {
    attempts += 1;
    init?.signal?.addEventListener('abort', () => {
      fakeNow += attempts === 1 ? 29_200 : 700;
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  try {
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: true,
        storage: storage.adapter,
      },
      global: {
        fetch: createAuthRequestFetch(fakeFetch, { timeoutMs: 10 }),
      },
    });

    const result = await Promise.race([
      client.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('refresh remained hung')), 1_000)),
    ]);

    assert.equal(result.error?.name, 'AuthRetryableFetchError');
    assert.equal(attempts, 2);
    assert.equal(storage.values.get(storageKey), JSON.stringify(session));
  } finally {
    Date.now = originalDateNow;
  }
});

test('a caller abort cancels the underlying Auth request without being relabeled as a timeout', async () => {
  let underlyingAborted = false;
  const fakeFetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      underlyingAborted = true;
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  const caller = new AbortController();
  const boundedFetch = createAuthRequestFetch(fakeFetch, { timeoutMs: 1_000 });
  const startedAt = Date.now();
  const request = boundedFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    signal: caller.signal,
  });

  setTimeout(() => caller.abort(), 10);

  await assert.rejects(request, (error) => error?.name === 'AbortError');
  assert.equal(underlyingAborted, true);
  assert.ok(Date.now() - startedAt < 200, 'caller abort should not wait for the Auth deadline');
});

test('the Auth deadline also bounds a response whose body never finishes', async () => {
  let aborted = false;
  const fakeFetch = async (_input, init) => {
    init?.signal?.addEventListener('abort', () => { aborted = true; }, { once: true });
    return new Response(new ReadableStream({ start() {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: createAuthRequestFetch(fakeFetch, { timeoutMs: 20 }) },
  });

  const result = await client.auth.signInWithPassword({
    email: 'qa@example.com',
    password: 'ExamplePassword123',
  });

  assert.equal(result.error?.code, 'request_timeout');
  assert.equal(result.data.session, null);
  assert.equal(aborted, true);
});

test('a retry can sign in while a late timed-out response stays ignored', async () => {
  let calls = 0;
  const observedRequests = [];
  const fakeFetch = async (_input, init) => {
    calls += 1;
    observedRequests.push({
      body: JSON.parse(String(init?.body)),
      headers: new Headers(init?.headers),
    });
    if (calls === 1) {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return successfulPasswordResponse('late');
    }
    return successfulPasswordResponse('retry');
  };
  const storage = createMemoryStorage();
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: true,
      storage: storage.adapter,
    },
    global: { fetch: createAuthRequestFetch(fakeFetch, { timeoutMs: 20 }) },
  });
  const events = [];
  const { data: subscription } = client.auth.onAuthStateChange((event) => events.push(event));

  const first = await client.auth.signInWithPassword({
    email: 'qa@example.com',
    password: 'ExamplePassword123',
  });
  const retry = await client.auth.signInWithPassword({
    email: 'qa@example.com',
    password: 'ExamplePassword123',
  });
  await new Promise((resolve) => setTimeout(resolve, 70));

  subscription.subscription.unsubscribe();
  assert.equal(first.error?.code, 'request_timeout');
  assert.equal(retry.error, null);
  assert.equal(retry.data.session?.access_token, 'access-retry');
  assert.equal(events.filter((event) => event === 'SIGNED_IN').length, 1);
  const stored = [...storage.values.values()].join('\n');
  assert.match(stored, /access-retry/);
  assert.doesNotMatch(stored, /access-late/);
  assert.deepEqual(observedRequests[1].body, {
    email: 'qa@example.com',
    password: 'ExamplePassword123',
    gotrue_meta_security: {},
  });
  assert.equal(observedRequests[1].headers.get('apikey'), PUBLISHABLE_KEY);
  assert.match(observedRequests[1].headers.get('content-type') ?? '', /^application\/json/i);
});

test('a completed Auth request clears its deadline and caller-abort listener', async () => {
  let underlyingSignal;
  const fakeFetch = async (_input, init) => {
    underlyingSignal = init?.signal;
    return successfulPasswordResponse('complete');
  };
  const caller = new AbortController();
  const boundedFetch = createAuthRequestFetch(fakeFetch, { timeoutMs: 20 });

  const response = await boundedFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    signal: caller.signal,
  });
  assert.equal(response.status, 200);

  caller.abort();
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(underlyingSignal?.aborted, false);
});

test('other REST resources remain outside the bounded profile-read deadline', async () => {
  let underlyingSignal;
  const fakeFetch = async (_input, init) => {
    underlyingSignal = init?.signal;
    await new Promise((resolve) => setTimeout(resolve, 35));
    return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const originalSignal = new AbortController().signal;
  const boundedFetch = createAuthRequestFetch(fakeFetch, { timeoutMs: 10 });

  // profiles GET is now intentionally bounded. Keep the passthrough contract
  // for unrelated resources rather than silently removing this regression.
  const response = await boundedFetch(`${SUPABASE_URL}/rest/v1/devices`, {
    method: 'GET',
    signal: originalSignal,
  });

  assert.equal(response.status, 200);
  assert.equal(underlyingSignal, originalSignal);
});

test('profile mutations and HEAD requests bypass the read deadline, including Request method and init overrides', async () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'HEAD']) {
    for (const asRequest of [false, true]) {
      const signal = new AbortController().signal;
      let receivedSignal;
      const boundedFetch = createAuthRequestFetch(async (_input, init) => {
        receivedSignal = init?.signal;
        await new Promise(resolve => setTimeout(resolve, 5));
        return new Response(null, { status: 204 });
      }, { timeoutMs: 1 });
      const input = asRequest ? new Request(`${SUPABASE_URL}/rest/v1/profiles`, { method })
        : `${SUPABASE_URL}/rest/v1/profiles`;
      const init = asRequest ? { signal } : { method, signal };
      const response = await boundedFetch(input, init);
      assert.equal(response.status, 204, `${method} ${asRequest ? 'Request' : 'URL'} must pass through`);
      assert.equal(receivedSignal, signal);
    }
  }
  const overridden = createAuthRequestFetch(async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(null, { status: 204 });
  }, { timeoutMs: 1 });
  assert.equal((await overridden(new Request(`${SUPABASE_URL}/rest/v1/profiles`), { method: 'PATCH' })).status, 204);
});

test('Request profile GET and an init GET override are bounded without Auth-only headers', async () => {
  const caller = new AbortController();
  const boundedFetch = createAuthRequestFetch((_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  }), { timeoutMs: 5 });
  for (const [request, init] of [
    [new Request(`${SUPABASE_URL}/rest/v1/profiles?select=id`, { signal: caller.signal }), undefined],
    [new Request(`${SUPABASE_URL}/rest/v1/profiles`, { method: 'PATCH' }), { method: 'get' }],
  ]) {
    const response = await boundedFetch(request, init);
    assert.equal(response.status, 408);
    assert.equal(response.headers.has('X-Supabase-Api-Version'), false);
    assert.deepEqual(await response.json(), { code: 'request_timeout', message: '账户资料读取超时，请检查网络后重试。' });
  }
});

test('profile response body and monotonic deadline are bounded before any data reaches the SDK', async () => {
  let streamController;
  const bodyFetch = createAuthRequestFetch(async () => new Response(new ReadableStream({
    start(controller) { streamController = controller; },
  }), { headers: { 'content-type': 'application/json' } }), { timeoutMs: 5 });
  try {
    assert.equal((await bodyFetch(`${SUPABASE_URL}/rest/v1/profiles`)).status, 408);
  } finally { streamController.close(); }
  let now = 0;
  const lateFetch = createAuthRequestFetch(async () => {
    now = 11;
    return new Response('[]', { headers: { 'content-type': 'application/json' } });
  }, { timeoutMs: 10, now: () => now });
  assert.equal((await lateFetch(`${SUPABASE_URL}/rest/v1/profiles`)).status, 408);
});

test('a caller abort raised synchronously by fetch startup cannot miss the listener', async () => {
  const caller = new AbortController();
  const fakeFetch = () => {
    caller.abort();
    return new Promise(() => undefined);
  };
  const boundedFetch = createAuthRequestFetch(fakeFetch, { timeoutMs: 1_000 });

  await assert.rejects(
    boundedFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      signal: caller.signal,
    }),
    (error) => error?.name === 'AbortError',
  );
});

test('an Auth response completed after the monotonic deadline cannot establish a session', async () => {
  let monotonicNow = 0;
  let underlyingSignal;
  const fakeFetch = async (_input, init) => {
    underlyingSignal = init?.signal;
    monotonicNow = 21;
    return successfulPasswordResponse('late-clock');
  };
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: {
      fetch: createAuthRequestFetch(fakeFetch, {
        timeoutMs: 20,
        now: () => monotonicNow,
      }),
    },
  });

  const result = await client.auth.signInWithPassword({
    email: 'qa@example.com',
    password: 'ExamplePassword123',
  });

  assert.equal(result.error?.code, 'request_timeout');
  assert.equal(result.data.session, null);
  assert.equal(underlyingSignal?.aborted, true);
});

test('a bodyless 204 Auth response remains a valid bodyless response', async () => {
  const fakeFetch = async () => new Response(null, {
    status: 204,
    headers: { 'X-Test': 'preserved' },
  });
  const boundedFetch = createAuthRequestFetch(fakeFetch, { timeoutMs: 100 });

  const response = await boundedFetch(`${SUPABASE_URL}/auth/v1/verify`, { method: 'POST' });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-test'), 'preserved');
  assert.equal(await response.text(), '');
});

test('a timed-out signup preserves the uncertain registration result message', async () => {
  const fakeFetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
  const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { fetch: createAuthRequestFetch(fakeFetch, { timeoutMs: 20 }) },
  });

  const result = await client.auth.signUp({
    email: 'qa@example.com',
    password: 'ExamplePassword123',
  });
  const mapped = mapAuthOperationError(result.error, 'register');

  assert.equal(result.error?.code, 'request_timeout');
  assert.equal(mapped.category, 'network_unavailable');
  assert.equal(
    mapped.message,
    '注册请求结果暂时无法确认。请检查邮箱中的确认邮件，或尝试登录后再决定是否重新注册。',
  );
});

test('PKCE recovery and Apple ID-token exchange share the interactive Auth deadline', async () => {
  const fakeFetch = () => new Promise(() => undefined);
  const boundedFetch = createAuthRequestFetch(fakeFetch, { timeoutMs: 20 });
  const requests = ['pkce', 'id_token'].map(async (grantType) => {
    const response = await boundedFetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
    });
    return response.json();
  });

  const results = await Promise.race([
    Promise.all(requests),
    new Promise((_, reject) => setTimeout(() => reject(new Error('interactive token exchange remained hung')), 200)),
  ]);

  assert.deepEqual(results.map((result) => result.code), ['request_timeout', 'request_timeout']);
});
