import { pathToFileURL } from 'node:url';

const probes = [
  { name: 'heartbeat_current_terminal', body: {} },
  { name: 'claim_username', body: { p_username: 'doso_public_probe' } },
  { name: 'list_my_login_methods', body: {} },
];
const expectedProjectRef = 'vchvqfdlkomlrjenkdhj';

export function classifyRpcResponse(httpStatus, payload, expectedFunctionName) {
  const code = typeof payload?.code === 'string' && payload.code ? payload.code : 'none';
  if (httpStatus >= 200 && httpStatus < 300) {
    return { classification: 'unexpected_success', httpStatus, code };
  }
  if (httpStatus === 404 && code === 'PGRST202') {
    return { classification: 'missing', httpStatus, code };
  }
  const exactAclDenial = `permission denied for function ${expectedFunctionName}`;
  if (httpStatus >= 400 && httpStatus < 500 && code === '42501' && payload?.message === exactAclDenial) {
    return { classification: 'present_blocked', httpStatus, code };
  }
  if (httpStatus >= 400 && httpStatus < 500 && ['42501', 'P0001'].includes(code)) {
    return { classification: 'unexpected_execution', httpStatus, code };
  }
  return { classification: 'indeterminate', httpStatus, code };
}

export async function probeRpc({ baseUrl, publishableKey, name, body, fetchImpl = fetch }) {
  const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = {};
  }
  return { name, ...classifyRpcResponse(response.status, payload, name) };
}

export function evaluateExpectedState(results, expectation) {
  if (!['predeploy', 'postdeploy'].includes(expectation)) {
    throw new Error(`unsupported expectation: ${expectation}`);
  }
  const expected = new Map([
    ['heartbeat_current_terminal', 'present_blocked'],
    ['claim_username', expectation === 'predeploy' ? 'missing' : 'present_blocked'],
    ['list_my_login_methods', expectation === 'predeploy' ? 'missing' : 'present_blocked'],
  ]);
  return results.flatMap((result) => {
    const wanted = expected.get(result.name);
    return wanted === result.classification
      ? []
      : [`${result.name} expected ${wanted}, found ${result.classification}`];
  });
}

async function main() {
  const expectationArg = process.argv.find((arg) => arg.startsWith('--expect='));
  const expectation = expectationArg?.slice('--expect='.length) || 'postdeploy';
  const target = hostedTarget(
    process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  );
  const publishableKey = required(
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    'SUPABASE_PUBLISHABLE_KEY or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );

  const results = [];
  for (const probe of probes) {
    results.push(await probeRpc({ baseUrl: target.baseUrl, publishableKey, ...probe }));
  }

  console.log(
    `HOSTED PUBLIC RPC PROBE target=${target.projectRef} host=${target.hostname} expectation=${expectation}`,
  );
  for (const result of results) {
    console.log(
      `${result.classification.toUpperCase()} ${result.name} http=${result.httpStatus} code=${result.code}`,
    );
  }

  const failures = evaluateExpectedState(results, expectation);
  if (failures.length) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 2;
    return;
  }
  console.log(`PASS hosted public RPC schema state matches ${expectation}`);
}

export function hostedTarget(rawValue) {
  const value = required(rawValue, 'SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL');
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('hosted public RPC probe requires an HTTPS URL');
  const expectedHostname = `${expectedProjectRef}.supabase.co`;
  if (url.hostname !== expectedHostname) {
    throw new Error(`hosted public RPC probe expected Supabase project ${expectedProjectRef}`);
  }
  return {
    baseUrl: url.origin,
    hostname: url.hostname,
    projectRef: expectedProjectRef,
  };
}

function required(value, label) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing ${label}`);
  return normalized;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
