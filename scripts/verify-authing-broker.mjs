import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let assertions = 0;
function check(run) {
  run();
  assertions += 1;
}

const [coreSource, webService, nativeService, migration, envExample, decision, socialDocs, matrix] = await Promise.all([
  readFile(new URL('../src/services/authingBrokerCore.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/socialAuthService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/socialAuthService.native.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260824090000_add_external_identity_registry.sql', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
  readFile(new URL('../docs/AUTHING_PROVIDER_OPTION_DECISION.md', import.meta.url), 'utf8'),
  readFile(new URL('../docs/SOCIAL_AUTH.md', import.meta.url), 'utf8'),
  readFile(new URL('../docs/PRODUCTION_VERIFICATION_MATRIX.md', import.meta.url), 'utf8'),
]);

const transpiled = ts.transpileModule(coreSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
check(() => assert.equal(transpiled.diagnostics?.length ?? 0, 0));
const broker = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
);

const separated = { wechatProviderId: 'custom:wechat', qqProviderId: 'custom:qq' };
check(() => assert.equal(broker.normalizeCustomProviderId(undefined), null));
check(() => assert.equal(broker.normalizeCustomProviderId(''), null));
check(() => assert.equal(broker.normalizeCustomProviderId('provider:wechat'), null));
check(() => assert.equal(broker.normalizeCustomProviderId('custom:wechat!'), null));
check(() => assert.equal(broker.normalizeCustomProviderId(' CUSTOM:WECHAT '), 'custom:wechat'));
check(() => assert.deepEqual(
  broker.getAuthingBrokerReadiness('wechat', { qqProviderId: 'custom:qq' }).blockerCodes,
  ['provider-id-missing-or-invalid'],
));
check(() => assert.deepEqual(
  broker.getAuthingBrokerReadiness('wechat', {
    wechatProviderId: 'custom:authing',
    qqProviderId: 'custom:authing',
  }).blockerCodes,
  ['provider-route-collision', 'provider-route-mismatch'],
));
check(() => assert.deepEqual(
  broker.getAuthingBrokerReadiness('qq', {
    wechatProviderId: 'custom:wechat',
    qqProviderId: 'custom:wechat',
  }).blockerCodes,
  ['provider-route-collision', 'provider-route-mismatch'],
));
check(() => assert.deepEqual(
  broker.getAuthingBrokerReadiness('wechat', {
    wechatProviderId: 'custom:qq',
    qqProviderId: 'custom:wechat',
  }).blockerCodes,
  ['provider-route-mismatch'],
));
check(() => assert.equal(broker.getAuthingBrokerReadiness('wechat', separated).ready, true));
check(() => assert.equal(broker.getAuthingBrokerReadiness('qq', separated).ready, true));
check(() => assert.deepEqual(
  broker.buildAuthingOAuthArguments('wechat', separated, 'doso://auth/callback'),
  {
    provider: 'custom:wechat',
    options: { redirectTo: 'doso://auth/callback', skipBrowserRedirect: true },
  },
));
check(() => assert.deepEqual(
  broker.buildAuthingOAuthArguments('qq', separated, 'https://app.example/auth/callback'),
  {
    provider: 'custom:qq',
    options: { redirectTo: 'https://app.example/auth/callback', skipBrowserRedirect: true },
  },
));
check(() => assert.throws(
  () => broker.buildAuthingOAuthArguments('wechat', { wechatProviderId: 'custom:authing', qqProviderId: 'custom:authing' }, 'doso://auth/callback'),
  /provider-route-collision/,
));
check(() => assert.throws(
  () => broker.buildAuthingOAuthArguments('qq', separated, '   '),
  /redirect URI is missing/,
));
check(() => assert.deepEqual(
  broker.interpretSocialBrowserResult(
    { type: 'success', url: 'doso://auth/callback?code=one' },
    'doso://auth/callback',
  ),
  { status: 'callback', callbackUrl: 'doso://auth/callback?code=one' },
));
check(() => assert.deepEqual(
  broker.interpretSocialBrowserResult({ type: 'cancel' }, 'doso://auth/callback'),
  { status: 'cancelled' },
));
for (const invalidCallback of [
  'doso://auth/reset-password?code=one',
  'doso://auth/not-a-callback?code=one',
  'doso://evil/callback?code=one',
  'https://evil.example/auth/callback?code=one',
  'https://user:pass@app.example/auth/callback?code=one',
]) {
  check(() => assert.throws(
    () => broker.interpretSocialBrowserResult(
      { type: 'success', url: invalidCallback },
      'doso://auth/callback',
    ),
    /invalid callback/,
  ));
}
check(() => assert.deepEqual(
  broker.interpretSocialBrowserResult(
    { type: 'success', url: 'https://app.example/auth/callback?code=one' },
    'https://app.example/auth/callback',
  ),
  { status: 'callback', callbackUrl: 'https://app.example/auth/callback?code=one' },
));
check(() => assert.throws(
  () => broker.interpretSocialBrowserResult(
    { type: 'success', url: 'https://app.example/auth/reset-password?code=one' },
    'https://app.example/auth/callback',
  ),
  /invalid callback/,
));

for (const [platform, source] of [['web', webService], ['native', nativeService]]) {
  check(() => assert.match(source, /from ['"]\.\/authingBrokerCore['"]/));
  check(() => assert.match(source, /getAuthingBrokerReadiness\(/));
  check(() => assert.match(source, /buildAuthingOAuthArguments\(/));
  check(() => assert.match(source, /interpretSocialBrowserResult\(result, redirectTo\)/));
  check(() => assert.doesNotMatch(source, /authorizationParams|queryParams|connection(?:Id|_id)?/i));
  check(() => assert.doesNotMatch(source, /function getCustomProviderId|CUSTOM_PROVIDER_PATTERN/));
  check(() => assert.doesNotMatch(source, /console\.(?:log|debug|info|warn|error)/));
  assert.ok(platform);
}

check(() => assert.match(migration, /when 'custom:wechat' then 'wechat'/));
check(() => assert.match(migration, /when 'custom:qq' then 'qq'/));
check(() => assert.match(envExample, /^EXPO_PUBLIC_WECHAT_SUPABASE_PROVIDER=custom:wechat$/m));
check(() => assert.match(envExample, /^EXPO_PUBLIC_QQ_SUPABASE_PROVIDER=custom:qq$/m));
check(() => assert.match(envExample, /^EXPO_PUBLIC_WECHAT_AUTH_ENABLED=false$/m));
check(() => assert.match(envExample, /^EXPO_PUBLIC_QQ_AUTH_ENABLED=false$/m));
check(() => assert.doesNotMatch(envExample, /^EXPO_PUBLIC_(?:AUTHING|WECHAT|QQ).*?(?:SECRET|APPKEY|APP_KEY|CLIENT_SECRET)=/mi));
check(() => assert.doesNotMatch(`${coreSource}\n${webService}\n${nativeService}`, /AppSecret|AppKey|client_secret|service_role/));

const productionContracts = `${decision}\n${socialDocs}\n${matrix}`;
check(() => assert.match(productionContracts, /账号关联(?:和|\/)?字段匹配(?:保持)?关闭|账号关联\/字段匹配关闭/));
check(() => assert.match(productionContracts, /scope (?:精确)?为 `openid profile`/));
check(() => assert.match(productionContracts, /`email_optional=true`/));
check(() => assert.match(productionContracts, /verified email[^\n]*`BLOCKED`|Canary 返回 verified email/));
check(() => assert.match(productionContracts, /不得原地复用旧 identifier|不能原地复用 identifier/));
check(() => assert.match(productionContracts, /issuer fingerprint、provider key、subject hash (?:与|和) DOSO user ID/));
check(() => assert.match(productionContracts, /最多 3 个 Custom Provider|上限为 3 个 Custom Provider/));
check(() => assert.match(productionContracts, /至少 2 个社会(?:化)?连接和 2 个自建 OIDC 应用|至少 2 个社会连接和 2 个 OIDC 应用/));
check(() => assert.match(productionContracts, /Supabase (?:禁用受影响 Custom Provider|禁 Provider)[^\n]*Authing (?:禁用对应连接\/应用|禁连接\/应用)[^\n]*client/));
check(() => assert.match(productionContracts, /禁用 Provider 不会撤销已经签发的 DOSO session|不能撤销已有 DOSO sessions/));
check(() => assert.match(productionContracts, /terminal\/session 撤销 runbook/));

console.log(`DOSO Authing broker contract PASS (${assertions}/${assertions} assertions; live tenant/device verification still required)`);
