import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const claimCallPattern = /set_config\s*\(\s*'request\.jwt\.claims'\s*,\s*'((?:''|[^'])*)'\s*,\s*(?:true|false)\s*\)/giu;
const sessionInsertPattern = /insert\s+into\s+auth\.sessions\s*\(([^)]*)\)\s*values\s*([\s\S]*?);/giu;
const sessionTuplePattern = new RegExp(
  `\\(\\s*'(?<session>${UUID})'\\s*,\\s*'(?<user>${UUID})'\\s*,\\s*now\\(\\)\\s*,\\s*now\\(\\)\\s*\\)`,
  'giu',
);

const missingAccountSession =
  '7aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaf|71111111-1111-4111-8111-111111111111';

const fixtures = [
  {
    name: 'doso schema',
    expectedValidPairs: 8,
    paths: ['supabase/tests/database/doso_schema.test.sql'],
  },
  {
    name: 'account email outbox',
    expectedValidPairs: 13,
    allowedMissingPairs: [missingAccountSession],
    paths: ['supabase/tests/database/account_email_outbox.test.sql'],
  },
  {
    name: 'robot command persistence',
    expectedValidPairs: 1,
    paths: ['supabase/tests/database/robot_command_persistence.test.sql'],
  },
  {
    name: 'robot command worker',
    expectedValidPairs: 5,
    paths: ['supabase/tests/database/robot_command_worker.test.sql'],
  },
  {
    name: 'profile editing',
    expectedValidPairs: 4,
    paths: ['supabase/tests/database/profile_editing.test.sql'],
  },
  {
    name: 'profile editing upgrade',
    expectedValidPairs: 1,
    paths: [
      'supabase/verification/upgrade/pre_profile_editing_seed.sql',
      'supabase/verification/upgrade/profile_editing_upgrade.test.sql',
    ],
  },
];

function pair(sessionId, userId) {
  return `${sessionId}|${userId}`;
}

function parseClaims(source, path) {
  const claimReferences = source.match(/'request\.jwt\.claims'/giu) ?? [];
  const calls = [...source.matchAll(claimCallPattern)];
  assert.equal(calls.length, claimReferences.length, `${path}: unparsed request.jwt.claims call`);

  const claims = [];
  for (const match of calls) {
    const encoded = match[1].replaceAll("''", "'");
    let value;
    assert.doesNotThrow(() => { value = JSON.parse(encoded); }, `${path}: invalid claims JSON`);
    assert(value && typeof value === 'object' && !Array.isArray(value), `${path}: claims must be an object`);
    const hasSub = Object.hasOwn(value, 'sub');
    const hasSession = Object.hasOwn(value, 'session_id');
    assert.equal(hasSub, hasSession, `${path}: sub and session_id must appear together`);
    if (!hasSub) continue;
    assert.match(value.sub, new RegExp(`^${UUID}$`, 'u'), `${path}: malformed sub`);
    assert.match(value.session_id, new RegExp(`^${UUID}$`, 'u'), `${path}: malformed session_id`);
    claims.push({ sessionId: value.session_id, userId: value.sub });
  }
  return claims;
}

function parseSessionSeeds(source, path) {
  const insertReferences = source.match(/insert\s+into\s+auth\.sessions/giu) ?? [];
  const inserts = [...source.matchAll(sessionInsertPattern)];
  assert.equal(inserts.length, insertReferences.length, `${path}: unparsed auth.sessions INSERT`);

  const seeds = [];
  for (const insert of inserts) {
    const columns = insert[1].split(',').map(value => value.trim().toLowerCase());
    assert.deepEqual(columns, ['id', 'user_id', 'created_at', 'updated_at'],
      `${path}: unsupported auth.sessions column shape`);
    const values = insert[2];
    const tuples = [...values.matchAll(sessionTuplePattern)];
    const residue = values.replace(sessionTuplePattern, '').replaceAll(',', '').trim();
    assert.equal(residue, '', `${path}: unparsed auth.sessions tuple`);
    assert(tuples.length > 0, `${path}: auth.sessions INSERT has no tuples`);
    for (const tuple of tuples) {
      seeds.push({ sessionId: tuple.groups.session, userId: tuple.groups.user });
    }
  }
  return seeds;
}

for (const fixture of fixtures) {
  test(`${fixture.name} JWT claims have exact Auth-session fixture authority`, async () => {
    const sources = await Promise.all(fixture.paths.map(async path => ({
      path,
      source: await readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
    })));
    const claims = sources.flatMap(({ source, path }) => parseClaims(source, path));
    const seeds = sources.flatMap(({ source, path }) => parseSessionSeeds(source, path));
    const claimPairs = new Set(claims.map(({ sessionId, userId }) => pair(sessionId, userId)));
    const seedPairs = new Set(seeds.map(({ sessionId, userId }) => pair(sessionId, userId)));
    const allowedMissing = new Set(fixture.allowedMissingPairs ?? []);

    assert.equal(seedPairs.size, seeds.length, `${fixture.name}: duplicate Auth-session seed`);

    const claimOwners = new Map();
    for (const { sessionId, userId } of claims) {
      const previous = claimOwners.get(sessionId);
      assert(!previous || previous === userId, `${fixture.name}: one session_id is claimed by multiple users`);
      claimOwners.set(sessionId, userId);
    }
    const seedOwners = new Map();
    for (const { sessionId, userId } of seeds) {
      assert(!seedOwners.has(sessionId), `${fixture.name}: duplicate seeded session_id`);
      seedOwners.set(sessionId, userId);
    }

    for (const allowedPair of allowedMissing) {
      assert(claimPairs.has(allowedPair), `${fixture.name}: allowed missing claim disappeared`);
      assert(!seedPairs.has(allowedPair), `${fixture.name}: negative Auth session was accidentally seeded`);
    }

    const validClaimPairs = new Set([...claimPairs].filter(value => !allowedMissing.has(value)));
    assert.equal(validClaimPairs.size, fixture.expectedValidPairs,
      `${fixture.name}: valid claim-pair count drifted`);
    assert.equal(seedPairs.size, fixture.expectedValidPairs,
      `${fixture.name}: Auth-session seed count drifted`);
    assert.deepEqual([...seedPairs].sort(), [...validClaimPairs].sort(),
      `${fixture.name}: JWT claims and Auth-session seeds differ`);
  });
}
