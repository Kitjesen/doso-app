# Profile upgrade ACL verification gate

## 2026-10-17 foreign-owner registration negative: local SQL coverage closed

The candidate SQL now exercises an existing Auth session owned by another user,
with no terminal conflict, under authenticated userA claims. It requires exact
`42501 auth_session_inactive` and fixture-owner-visible, ordered full JSONB row
equality for terminals/outbox/audit before and after the denied call. This proves
durable row contents unchanged, not absence of sequence/lock effects or rolled-back
attempts. The existing valid-registration and missing-session assertions remain.

First combined candidate run failed (exit1): the new block reached its marker but
reused recovery session6, causing the unchanged recovery fixture to fail with
sessions_pkey. That failed input/transcript is preserved. Only the appended block
was moved to disjoint session106; second combined run exit0 / 36,928ms, candidate
and recovery psql both exit0, both candidate markers exactly once in the same
successful psql, 12 input hashes unchanged. Both owned clusters stopped with
independent pg_ctl status exit3. Two actual candidate runs, no baseline rerun,
one new composite scenario, no pgTAP count claim. See
`artifacts/release-readiness/20261017-register-foreign-session/integration.json`.
This does not close real Auth/JWT/Storage, complete Supabase upgrade/pgTAP, native,
or production approval gates. Next: complete shared-function role/privilege matrix
and remaining domain-specific valid/deleted-session side-effect checks.

## 2026-10-17 release-gate integration and shared-Auth approval boundary

The existing `test:profile-editing` suite was not previously called by the main
release gate. The gate now requires it, the normal
`test:profile-upgrade-preflight` command, and `test:release-gate-core`.
These checks are required in both full and design-audit modes. Original stage
order/logic is preserved; full mode still requires `test:db`, while design-audit
continues to explicitly defer only that external-runtime stage to the full gate.

Three actual RED→GREEN slices and final 15/15 execution (13 controlled CLI
contracts + the unchanged 2 real preflight-only subprocess tests) are retained
under `artifacts/release-readiness/20261017-profile-release-gate/`. The real
preflight subprocess stages files only; the 13 CLI contracts simulate the
child-process boundary and do not run actual npm stages. This is not an all-stage
release-gate run, pgTAP or a database upgrade. The prior execution was rehashed
on resumption, not rerun or counted as another pass. Production TypeScript and
candidate SQL were not changed.

The candidate tail is **not profile/avatar-only in deployment impact**.
`20261016155923_require_auth_session_authority.sql` directly defines the internal
Auth-session helper, replaces shared `private.is_session_active()`, and replaces
terminal registration with an Auth-only pre-write guard. Its consumers span
profiles/avatars, devices, terminal/audit reads and revocation, username/login
methods, robot command create/status and registration/email outbox/audit.
A future approval must explicitly cover this shared impact; a narrow
profile/avatar approval cannot authorize it. No production approval is present.
Do not remove the shared guard simply to fit a narrower approval.

The source-only independent review found no confirmed SQL authorization defect,
but returned **COMMENT_DEPLOYMENT_SCOPE_BLOCK**, not production approval.
Still required before rollout:

- Per-domain valid-session positive and deleted-Auth-session denial/zero-side-effect checks.
- Foreign-owner public registration: local synthetic SQL coverage is closed above; repeat under the approved complete Supabase upgrade/real-Auth acceptance, not inferred from this fixture.
- Final privilege matrix for public/anon/authenticated/service_role across the helper, shared gate and registration.
- Full isolated Supabase baseline/upgrade migration sequence, pgTAP, advisors,
  rollback review, real JWT/Storage HTTP and object-byte lifecycle evidence.

The shared candidate does not add an `auth.sessions` table grant. Its stated
guarantee concerns subsequent statements observing committed session deletion;
it does not cancel already executing statements or enforce idle/time-box expiry.
The scope review is source-only, not a fresh cloud observation. The release
owner's next local slice is the foreign-owned registration negative case, using
the existing isolated test runner without Docker/host changes or real accounts.

The 2026-10-17 slice prepares the existing isolated Supabase upgrade test. It does
not change production migrations or grant/revoke anything on a running database.

## Prepared contract

`pre_profile_editing_seed.sql` must run against the real historical migration
head through `20260827070734`. It snapshots the existing authenticated UPDATE
privileges for `avatar_url` and `display_name`, requires both to be true and does
not manufacture a grant. Unknown/false starting state stops the seed.

After the profile and Auth-session candidate tail, the existing pgTAP test now
adds eight assertions: historical privilege snapshot, avatar privilege removal
while nickname privilege remains, protected lifecycle/provenance columns, active
registered session, successful direct nickname write, actual nickname row value,
direct avatar write denied with SQLSTATE 42501, and unchanged legacy avatar.
The subsequent existing profile RPC success and preserved-avatar assertion stay
in place. This avoids mistaking a dead session or zero-row RLS update for the
intended privilege transition. Error message is deliberately NULL in throws_ok
so localized PostgreSQL permission text does not change the SQLSTATE contract.

The test still uses its upgrade sentinel, no_plan/finish and rollback. Data and
timestamps, legacy NULL/provider values, metadata protections and deleted-session
authority checks are retained. A failure is a release blocker, not permission
to loosen RLS or regrant direct avatar access.

## Verified and not verified

The real file-staging-only harness check passed 2/2. It copies the actual seed,
upgrade test and migration tail but does not start a database, execute SQL or run
pgTAP. Source review can approve this preparation, not database behavior.

The configured portable PostgreSQL 17.11 runtime contains pgcrypto but has no
pgTAP extension files. The original profile suite also depends on the full
Supabase Auth/Storage schema, triggers and preceding DOSO migrations. Existing
minimal synthetic fixtures are not an equivalent platform. Do not install fake
pgTAP helpers, trim assertions, replace tested policy/RPC logic, or relabel the
previous synthetic recovery pass as this upgrade test passing.

Actual full baseline/upgrade and Storage HTTP/object-byte verification remain
open. Prior Docker and memory blocks were not retried. Bounded read-only host
diagnosis / Docker Desktop startup was requested separately; there is no current
approval to reset/uninstall/delete volumes, edit host configuration, restart WSL
or the machine. No production deployment approval is implied by that request.

Once a suitable isolated environment and its resource/authority gates exist,
run the unchanged staging lifecycle with the updated test assets. Record exact
inputs, actual pgTAP output/exit and cleanup independently. A staging-only PASS
is not a migration, pgTAP, Android, Auth, design or release PASS.

References: [Supabase testing](https://supabase.com/docs/guides/local-development/cli/testing-and-linting),
[pgTAP throws_ok](https://pgtap.org/documentation.html#throws_ok).
