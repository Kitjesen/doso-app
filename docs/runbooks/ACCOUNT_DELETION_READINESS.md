# Account deletion and privacy release gate

Status: DELETION REQUEST/EXECUTION NOT IMPLEMENTED / NOT APPROVED FOR PRODUCTION.
Read-only preview: local candidate implemented 2026-10-17, not deployed or wired
to the App. Hosted inventory date: 2026-10-15; not re-queried by this implementation.

The new in-app **数据与隐私** view is a read-only explanation of the current code's data scope. It is not an approved privacy policy, a consent record, a deletion request, or evidence of store compliance. No account is deleted by opening or closing it. Signing out does not delete an account or release a robot.

## 2026-10-17 legacy Android BLE disclosure amendment

The existing robot/connection paragraph now explains that Android11 and below
need location permission and enabled Location Services for BLE discovery. The
statement is explicitly scoped to this scan flow: it checks the enabled state,
not phone latitude/longitude reading, saving or uploading. This matches the
adapter's fine-location/API23–30 services check and maxSdkVersion30 legacy
manifest declarations. No runtime/permission/configuration, scan, storage or
network behavior changed. Current bundled route/map examples do not imply a
geographic map provider or coordinate collection.

Actual missing-copy RED precedes the one-literal amendment. Component-host
regressions7/7 include one new test over8 theme/orientation/font-scale host
combinations; TypeScript actual exit0 and independent fact/scope approval bind
page1a3247e6…/testbfb4c35e…. This is not native font/layout, permission-dialog,
scanning or location-access evidence. Old6 test bodies and11 protected runtime
sources are unchanged; no existing auth/backend count is reused as fresh proof.

This closes only a disclosure omission, not the deletion or formal-policy gate.
The planning-only preview, unapproved device/retention decisions, contact/policy
and deployment prerequisites below remain unchanged. No account/session/object,
cloud permissions or data were modified, and no new package was built or
installed. Release NO-GO/formal design0/20 remain. Canonical evidence:
`artifacts/release-readiness/20261017-ble-privacy-disclosure/integration.json`.

## Local read-only preview candidate — 2026-10-17

`supabase/functions/account-deletion-preview` adds only an authenticated `GET`
information boundary. Production uses the default shared active-account and
caller-RLS session gate. It reads a head-only exact count of current caller-owned
non-demo devices and returns only `hasVisibleBoundPhysicalRobot`. The scope is
explicitly `caller_rls_current_devices_only`: false does not mean all historic or
backend ownership is absent, and it never certifies safe unbinding or eligibility.
Missing/malformed/error counts remain unavailable, not false.

All successful results remain `planning_only` with submission, request creation
and execution false. Six unresolved areas stay blocked: device disposition,
retention/redaction, provider revocation, server avatar cleanup, in-flight
command/enrollment handling and independent executor/ledger. A visible physical
robot adds a decision blocker but never selects a disposition. Responses exclude
account/terminal/device/Storage/provider identifiers, tokens, raw errors and
counts; they are no-store. The handler cannot create a request/job, freeze/revoke,
unbind, delete, send email, write audit or call Auth Admin/Storage/RPC.

Node integration executes the real index/handler/http/shared auth with SDK and
environment fixtures; Deno tests execute the typed handler with fake SDK replies.
These do not prove hosted JWT/session/RLS, full inventory or erasure. No actual
account or session is created, revoked or deleted. No SQL schema or permission
changes accompany this preview. It is not wired to the App and does not satisfy
in-app/web deletion initiation requirements.

The reviewed SQL dependencies and joint Auth-session gate must be installed and
verified first, shared Edge auth second, preview last. Production approval and
the remaining deployment tests are still required; this local implementation
does not authorize that ordered unit. Evidence:
`artifacts/release-readiness/20261017-deletion-readonly-preview/`.

## Verified starting point

- The local backend has no account-deletion orchestrator. `supabase/functions/README.md` explicitly keeps deletion runtime tables and execution disabled; `supabase/tests/database/account_email_outbox.test.sql` checks that the deletion-request table is absent. Deletion email HTML is a design asset, not an executable deletion flow.
- This turn's deployed read-only inventory found no `public.account_deletion_requests`, no public/private RPC matching the searched deletion-related names, and no dedicated deletion function among the four deployed Edge-function slugs. This is an inventory, not an attestation of every hosted function's source semantics.
- The cloud inventory also found no `profile-avatars` bucket. The recent profile/retirement candidate must not be represented as deployed.
- Cloud foreign keys observed: profiles and account terminals cascade from Auth users; devices and consumed device claims use SET NULL. These SQL actions alone do not prove safe device-authority revocation, physical re-claim, provider-token revocation, or object-byte erasure.
- Full evidence and exact read-only query: `artifacts/release-readiness/20261015-data-privacy-entry/root-cloud.json`. No real user rows, sessions, credentials or personal files were read by this inventory, and no mutation was executed.
- Local avatar-cleanup evidence is retained under `artifacts/release-readiness/20261017-avatar-cleanup-proof/`. It proves that the production client must require an exact successful Storage response before reporting an object removed and clearing its local journal. It does not prove hosted Storage deletion, physical byte erasure, or an account-deletion runtime.

## Data decisions that must precede enabling deletion

| Area | Existing local contract | Unclosed deletion requirement |
| --- | --- | --- |
| Profile / Auth identity | Profile FK cascades from Auth; local identity projection also cascades | Real self-service authorization, reauthentication, explicit confirmation and final Auth deletion |
| Terminal access | Existing revoke RPCs and account-sessions action; JWT lifetime is separate | Block account access first and verify terminal/native-session handling; do not assume deleting Auth immediately invalidates JWTs |
| Physical robot | Device inventory survives user deletion with owner NULL; explicit unbind has authority/telemetry/command effects | Owner-approved access/ownership disposition and safe re-claim; no movement command and no automatic transfer to another account |
| Private avatars | Owner-scoped paths, per-object retirement candidate and strict client response validation | A server-only deletion snapshot of current, retired and orphaned owner objects; Storage API cleanup before Auth deletion; partial/unknown-result recovery; never delete Storage metadata directly or equate empty metadata with physical byte erasure |
| Commands / enrollment | Local user CASCADE plus terminal RESTRICT relationships | Disposable-fixture tests with existing command/enrollment rows; no assumption that independent FK tests prove full deletion |
| Email outbox | Local user SET NULL; terminal-state PII redaction after the code's default 30 days | Decide queued/leased/dispatching handling and approved retention; the code default is not a legal or product retention commitment |
| Audit records | Local actor/target UUIDs can outlive the user without a FK | Approved retained fields, legal basis, period, access and redaction procedure |
| External providers | Local subject hashes are not provider revocation credentials | Apple/Authing revocation adapters, securely held server credentials if needed, explicit failure/unknown recovery |
| Local App data | Auth session, installation ID, pending avatar-operation journal | Clear only the intended owner's local state after a confirmed terminal outcome; unknown outcome must not be relabeled success |

Local reference points: `docs/SOCIAL_AUTH.md:149`, `supabase/migrations/20260822185835_add_account_terminal_security.sql`, `supabase/migrations/20260822185849_harden_network_backend.sql`, `supabase/tests/database/doso_schema.test.sql`, `supabase/tests/database/robot_command_persistence.test.sql`, and `docs/runbooks/ACCOUNT_EMAIL_OUTBOX_DEPLOYMENT.md`. Test names/line references describe available local contracts; those database tests were not run this turn.

## Ordering conflict that the deletion runtime must resolve

The ordinary profile/avatar path cannot be reused as the deletion executor. It is a user-session flow: profile mutation, retirement preparation and Storage removal depend on an active account and active session. Once `account_status='deleting'` is applied or the current terminal/session is revoked, those ordinary calls lose authority. Reversing the order is also unsafe: deleting the Auth user first cascades the profile and retirement rows, destroying the references needed to find and reconcile avatar cleanup debt.

Before destroying profile/Auth references, a trusted server-only worker therefore needs a durable, owner-scoped snapshot of the current profile avatar plus retired and orphaned owner paths. It must not take an unfenced snapshot and only then disable writes: that gap permits an upload to escape the inventory. Freezing account/avatar/command writes and recording known references must use a reviewed transaction/locking protocol. Storage enumeration happens across a separate API boundary; already in-flight uploads/saves must be settled or durably accounted for before final inventory reconciliation and Auth deletion. One empty list after freezing is not proof that those requests cannot still commit. Ordinary `profile_avatar_retirements` rows are concurrency protection for profile edits, not a durable account-deletion ledger. The deletion operation must preserve its own phase and per-object outcomes across retries. It must use the Storage API rather than deleting `storage.objects` metadata directly. A timeout, malformed response or otherwise unconfirmed removal remains `unknown`; it cannot be automatically resent, removed from the ledger, or reported as completion. Even a confirmed absence from Storage metadata does not by itself attest that every underlying physical byte has been erased.

This ordering description is design-only. No server-only deletion worker, deletion ledger, Storage sweep, provider revocation or Auth deletion is wired or deployed, and no account or object was deleted to produce this document.

## Required execution contract — design only

1. Authenticate the requester and validate current account/session authority. Reauthenticate when required, then show the actual account/data/device impact before explicit confirmation.
2. Record a durable owner-scoped operation and idempotency identity. A delayed or duplicated client request must not create a second deletion job. Unknown responses remain unknown, not automatic resubmission.
3. Through a reviewed server-only transaction/locking protocol, make the account non-operational, fence new avatar/command writes and record known profile/avatar references in an independent durable cleanup ledger before those references can be destroyed. Do not treat ordinary retirement rows as that ledger or allow an unfenced snapshot-to-freeze gap.
4. Revoke access and settle or durably account for existing in-flight writers before reconciling the full Storage inventory through its API. Do not assume a database lock or one empty Storage list cancels an in-flight request; do not send robot movement instructions as part of account deletion.
5. Apply the approved device disposition and external-provider revocation. Keep durable phase evidence for partial failure and operator-safe recovery.
6. Resolve the snapshotted private objects through the Storage API and settle in-flight email/data retention before final Auth deletion. Storage ownership can block Auth deletion; SQL metadata removal is not an acceptable substitute, and unknown cleanup must remain retry-fenced and incomplete.
7. Delete the Auth account only after required earlier stages are confirmed. Confirm completion to the client; pending, blocked and unknown are distinct from completed.
8. Verify a separate, disposable test account end-to-end with explicit authorization. Preserve non-PII phase/audit evidence and verify the previously issued credentials no longer authorize sensitive operations.

The exact schema, business policy, retention terms and rollout still require review. No production migration, privilege change, provider revocation or account deletion is authorized by this document.

## Product decision pending

The user has been asked whether deletion should revoke the former account's robot access, keep the physical device, and require on-site verification before another claim, or pause for manual ownership review while a robot is bound. **No option has been accepted automatically.** Do not silently map an owner NULL FK to an approved public re-claim policy.

The formal privacy policy/contact, data-retention terms and public web deletion resource are also not approved or deployed. Do not invent a support email, erase legal exceptions, or display a dummy success action.

## Current platform references

- [Apple account deletion guideline](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion): apps offering account creation need an easy-to-find in-app initiation path; deactivation/sign-out alone is insufficient. Explain retained data and timing. Apple sign-in also needs provider-token revocation. This read-only information view does not satisfy the deletion requirement.
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en): account-creating apps need both an in-app deletion path and a functional web request resource for account/associated-data deletion, with accurate store declarations.
- [Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data): user deletion is not immediate JWT sign-out, and owned Storage objects can prevent Auth-user deletion.

Store policy references were read on 2026-10-15. They are release criteria, not legal advice or a guarantee of approval; actual retention obligations require the product/legal owner's review.
