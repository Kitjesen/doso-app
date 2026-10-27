import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [screen, authService, apiTypes] = await Promise.all([
  readFile(new URL('../src/screens/AccountSecurityScreen.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/authService.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/types/api.ts', import.meta.url), 'utf8'),
]);

// Static wiring guard only: this does not prove hosted RPC deployment, RLS behavior,
// provider credentials, or successful identity refreshes on a real device.
const summaryType = apiTypes.match(/export type ExternalIdentitySummary = \{([\s\S]*?)\n\};/)?.[1] ?? '';
const expectedFields = [
  ['registry_id', 'string'],
  ['provider_key', 'string'],
  ['kind', 'ExternalIdentityKind'],
  ['email_verified', 'boolean'],
  ['linked_at', 'string'],
  ['provider_last_sign_in_at', 'string | null'],
  ['last_observed_at', 'string'],
  ['unlinked_at', 'string | null'],
  ['status', 'ExternalIdentityStatus'],
];
for (const [field, type] of expectedFields) {
  assert.match(summaryType, new RegExp(`\\b${field}: ${type.replace('|', '\\|')};`), `identity summary exposes canonical ${field} with the expected nullability`);
}
assert.equal((summaryType.match(/^\s+\w+:/gm) ?? []).length, expectedFields.length, 'identity summary exposes exactly the nine UI-safe RPC fields');
assert.doesNotMatch(summaryType, /^\s+(id|last_sign_in_at):/m, 'legacy ambiguous identity field names are absent from the client type');
assert.match(apiTypes, /list_my_login_methods:[\s\S]*?Returns: ExternalIdentitySummary\[\]/, 'database types include the login-method RPC');
assert.match(authService, /const EXTERNAL_IDENTITY_FIELDS = \[[\s\S]*?'registry_id'[\s\S]*?'provider_last_sign_in_at'[\s\S]*?'status'[\s\S]*?\] as const satisfies readonly \(keyof ExternalIdentitySummary\)\[\]/, 'runtime decoder pins the canonical field set to the TypeScript contract');
assert.match(authService, /fields\.length !== EXTERNAL_IDENTITY_FIELDS\.length[\s\S]*?hasOwnProperty\.call\(record, field\)/, 'runtime decoder rejects missing and extra fields');
assert.match(authService, /isNullableTimestamp\(record\.provider_last_sign_in_at\)[\s\S]*?isNullableTimestamp\(record\.unlinked_at\)/, 'runtime decoder accepts null only for the two nullable timestamps');
assert.match(authService, /new Set<ExternalIdentityKind>\(\['email', 'apple', 'wechat', 'qq', 'other'\]\)/, 'runtime decoder accepts every canonical identity kind and no unknown kind');
assert.match(authService, /new Set<ExternalIdentityStatus>\(\['active', 'unlinked'\]\)/, 'runtime decoder accepts every canonical identity status and no unknown status');
assert.match(authService, /EXTERNAL_IDENTITY_KINDS\.has[\s\S]*?EXTERNAL_IDENTITY_STATUSES\.has/, 'runtime decoder validates identity kind and status values');
assert.match(authService, /export async function listMyLoginMethods\(\)[\s\S]*?rpc\('list_my_login_methods'\)[\s\S]*?decodeExternalIdentitySummaries\(data \?\? \[\]\)/, 'auth service decodes the server-owned login-method RPC response before returning it');
assert.doesNotMatch(authService, /console\.(?:log|debug|info|warn|error)/, 'identity decoding never logs hosted payloads or tokens');
assert.match(screen, /const loadTerminals = useCallback[\s\S]*?registerCurrentTerminal\(\)[\s\S]*?heartbeatCurrentTerminal\(\)[\s\S]*?listAccountTerminals\(\)/, 'terminal management has its own load path');
assert.match(screen, /const loadLoginMethods = useCallback[\s\S]*?listMyLoginMethods\(\)/, 'identity summaries have an independent load path');
assert.match(screen, /setTerminalError\(errorMessage\(loadError\)\)[\s\S]*?setLoginMethodsError\(errorMessage\(loadError\)\)/, 'terminal and identity failures are reported independently');
assert.doesNotMatch(screen, /Promise\.all\([\s\S]*?listAccountTerminals\(\)[\s\S]*?listMyLoginMethods\(\)/, 'identity RPC failure cannot reject the terminal load path');
assert.match(screen, /method\.status === 'active' && !method\.unlinked_at/, 'the UI renders active login methods only');
assert.match(screen, /emailVerified && activeEmailMethod\?\.email_verified/, 'password changes require both account email verification and an active verified email identity');
assert.match(screen, /key=\{method\.registry_id\}/, 'login-method rows use the canonical registry identifier');
assert.match(screen, /method\.provider_last_sign_in_at[\s\S]*?formatLastSeen\(method\.provider_last_sign_in_at\)/, 'login-method rows use the canonical provider sign-in timestamp');
assert.doesNotMatch(screen, /method\.(?:id|last_sign_in_at)\b/, 'the UI contains no legacy identity field references');
assert.match(screen, /找回或修改密码前，需要先添加并验证安全邮箱/, 'social-only accounts receive a clear verified-email requirement');
assert.match(screen, /\{normalizedEmail\}/, 'the screen never renders a blank email prop as a login address');
assert.doesNotMatch(screen, /subject|identity_hash|token|access_token|refresh_token/i, 'the login-method UI never renders provider subjects, hashes, or tokens');
assert.doesNotMatch(screen, /关联.*按钮|解除关联|取消关联|onLink|onUnlink/, 'manual identity linking and unlinking are not exposed yet');

console.log('DOSO account identities UI static wiring guard PASS (not a behavioral or security test)');
