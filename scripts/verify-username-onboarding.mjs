import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
const screen = await readFile(new URL('../src/screens/UsernameOnboardingScreen.tsx', import.meta.url), 'utf8');
const authService = await readFile(new URL('../src/services/authService.ts', import.meta.url), 'utf8');
const apiTypes = await readFile(new URL('../src/types/api.ts', import.meta.url), 'utf8');

const gateIndex = app.indexOf('if (!hasClaimedUsername(profile))');
const deviceListIndex = app.indexOf('deviceRepository\n      .list()');

assert.ok(gateIndex >= 0, 'authenticated users without a verified username provenance are gated');
assert.ok(deviceListIndex > gateIndex, 'the username gate runs before any device list request');
assert.match(apiTypes, /export type UsernameProvenance =\s*\| 'registration'\s*\| 'manual_claim'\s*\| 'admin_verified'\s*\| 'legacy_inferred'\s*\| 'social_provisional';/, 'username provenance exposes exactly the five canonical values');
assert.match(apiTypes, /export type Profile = \{[\s\S]*?username_claimed_at: string \| null;[\s\S]*?username_provenance: UsernameProvenance;/, 'Profile carries the server-owned username provenance');
assert.match(apiTypes, /Insert: \{[\s\S]*?username_claimed_at\?: string \| null;[\s\S]*?username_provenance: UsernameProvenance;/, 'profile inserts require provenance while keeping the claim timestamp optional and nullable');
assert.match(apiTypes, /Enums: \{\s*username_provenance: UsernameProvenance;\s*\};/, 'manual Supabase database types map the username_provenance enum');
assert.match(app, /const CLAIMED_USERNAME_PROVENANCES = new Set<UsernameProvenance>\(\[\s*'registration',\s*'manual_claim',\s*'admin_verified',\s*\]\)/, 'only explicit registration, manual claim, and admin verification are accepted as claimed provenance');
assert.match(app, /function hasClaimedUsername\(profile: Profile\) \{\s*return Boolean\(profile\.username_claimed_at\) && CLAIMED_USERNAME_PROVENANCES\.has\(profile\.username_provenance\);\s*\}/, 'the username gate requires both a claim timestamp and an accepted provenance');
assert.doesNotMatch(app.match(/const CLAIMED_USERNAME_PROVENANCES[\s\S]*?\]\);/)?.[0] ?? '', /legacy_inferred|social_provisional/, 'legacy and social provisional usernames fail closed into onboarding');
assert.match(app, /setStage\('username-onboarding'\)/, 'the gate enters the dedicated onboarding stage');
assert.match(app, /await authService\.claimUsername\(username\)/, 'the screen submits through the username RPC service');
assert.match(app, /await refreshProfile\(\)/, 'the app reloads the server profile after a claim');
assert.match(app, /completedDeviceBootstrapKey\.current === bootstrapKey/, 'completed device bootstrap work is not repeated for the same user, claim state, and retry attempt');
assert.match(app, /completedDeviceBootstrapKey\.current = bootstrapKey[\s\S]*?setStage\(primaryDevice \? 'main' : 'models'\)/, 'the bootstrap key is committed before navigation changes');
assert.doesNotMatch(app, /\[authLoading, deviceLoadAttempt, profile,/, 'token refresh profile objects do not reset the current app stage');
assert.match(app, /stage === 'username-onboarding'[\s\S]*?void handleLogout\(\)/, 'Android back exits the account instead of bypassing onboarding');
assert.match(screen, /normalizeRegistrationUsername\(username\)/, 'the onboarding screen uses the shared 3-24 character validator');
assert.match(screen, /退出当前账户/, 'the only alternative to claiming is logging out');
assert.doesNotMatch(screen, /onBack|跳过|稍后/, 'the onboarding screen has no navigation bypass');
assert.match(authService, /rpc\('claim_username',[\s\S]*?p_username: normalized/, 'the service calls the migration RPC with its exact argument');
assert.match(authService, /\.select\(\s*'id,email,username,username_claimed_at,username_provenance,display_name,[^']+'[\s\S]*?\)\s*\.eq\('id'/, 'profile loading selects both server-owned username claim fields and fails closed when the hosted migration is missing');
assert.match(authService, /username_invalid[\s\S]*?username_reserved[\s\S]*?username_taken[\s\S]*?username_already_claimed/, 'stable RPC errors receive dedicated mappings');
assert.match(apiTypes, /username_claimed_at: string \| null/, 'Profile exposes the server-owned claim marker');
assert.match(app, /!nextProfile \|\| !hasClaimedUsername\(nextProfile\)/, 'claim completion is accepted only after the refreshed profile has consistent claimed provenance');
assert.match(app, /profile\?\.username_provenance/, 'profile provenance changes re-evaluate onboarding eligibility');
assert.match(apiTypes, /claim_username:[\s\S]*?Args: \{ p_username: string \}[\s\S]*?Returns: string/, 'database types match the claim_username RPC');

console.log('DOSO username onboarding static contract PASS');
