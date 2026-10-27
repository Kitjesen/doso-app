# DOSO Edge Functions

These functions are the trusted boundary for account terminals, physical-device
binding, and administration. Mobile/web clients send the user's Supabase access
token as `Authorization: Bearer <access_token>`. Every function verifies that
token with Auth and reloads `profiles.app_role` and `profiles.account_status`
from PostgreSQL.

Required secrets:

```text
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only service role key
PASSWORD_RECOVERY_REDIRECT_URL=https://app.example.com/auth/reset
# Hosted Supabase injects SUPABASE_SECRET_KEYS. Create a named secret key
# called "automations" and invoke account-email-worker with it on `apikey`.
DOSO_EMAIL_WORKER_SECRET_NAME=automations
ALIYUN_DM_ACCESS_KEY_ID=dedicated RAM user access key id
ALIYUN_DM_ACCESS_KEY_SECRET=dedicated RAM user access key secret
ALIYUN_DM_ACCOUNT_NAME=no-reply@auth.dosorobotics.com
ALIYUN_DM_REGION_ID=cn-hangzhou
```

`SUPABASE_SERVICE_ROLE_KEY` must never be bundled into the Expo app or admin
website. The `automations` named secret key and Aliyun credentials have the
same restriction. Do not create or document an ad-hoc
`DOSO_EMAIL_WORKER_SECRET`; Cron uses the named key stored in Vault and the
worker selects the same key from platform-managed `SUPABASE_SECRET_KEYS`. Use a
dedicated RAM identity limited to `dm:SingleSendMail`; never use an Alibaba
Cloud root-account AccessKey.

## JSON action API

All mutations use `POST` with `Content-Type: application/json`.

- `account-sessions`: `register`, `list`, `heartbeat`, `revoke_one`,
  `revoke_others`, `revoke_all`
- `device-binding`: `claim`, `unbind`
- `admin-users`: `list_users`, `set_status`, `set_role`, `send_password_reset`,
  `global_signout`, `list_audit_logs`
- `admin-devices`: `list_devices`, `create_inventory`, `rotate_binding_code`,
  `unbind`
- `device-enrollment`: `begin`, `attest`, `complete`
- `account-email-worker`: internal `POST` only. Platform JWT verification is
  disabled so Cron can use an opaque named Supabase secret key on `apikey`;
  the function validates that named key before claiming one outbox row at a
  time. An absent body defaults to 10 messages. A present body must be exactly
  a JSON object with an integer `limit` from 1 through 25; malformed bodies
  return 400 before any claim.

Errors use `{ "error": { "code": "...", "message": "..." } }`. Passwords,
access/refresh tokens, service keys, and binding-code digests are never returned
or written to audit metadata. A newly rotated plaintext binding code is returned
exactly once to an administrator.

Specific-terminal revocation is enforced immediately by DOSO RLS and functions.
Supabase Auth only exposes `local`, `others`, and `global` sign-out scopes for a
caller token; responses explicitly distinguish application revocation from
native Auth revocation.

### Shared Edge session authority — local candidate, not deployed

The shared `authenticate` gate now reads its active terminal through the caller's
client and RLS, not the service-role client. Auth verification, account/role/AAL
checks and the existing function signature are preserved. Missing/error/malformed
terminal responses fail closed; there is no privileged fallback. The exported
`authenticateWithClients` core uses explicit SDK factories for local behavior
tests, while the production wrapper always supplies the real factories.

This is an ordered deployment unit with
`20261016155923_require_auth_session_authority.sql` and its reviewed dependencies:
the candidate's joint Auth-session/terminal gate must be installed and verified
before deploying the Edge change. Old terminal-only RLS does not establish the
new Auth-session guarantee. No production migration or deployment is authorized
by this note. Registration still skips the terminal-exists check and relies on
the candidate `register_account_terminal` Auth-only guard before writes.

Local behavior checks: `node --test scripts/edge-auth-authority.test.mjs`.
These execute real authorization code with mocked SDK boundaries, not a hosted
JWT/signature/revocation test. Account-deletion request/execution remains
unimplemented. The local read-only preview candidate below is not deployed and
must not be enabled based only on these checks.

### Account deletion impact preview — local candidate, not deployed

`account-deletion-preview` accepts authenticated `GET` only. It rejects query
parameters and mutating methods before account reads. `OPTIONS` uses the shared
CORS policy without authentication. All responses are `Cache-Control: no-store`
and `Pragma: no-cache`; no raw SDK errors or account values are logged.

The production entry uses the default `authenticate(request)` active-account and
caller-RLS session gate. The only extra query is a caller-scoped head/exact count
of `devices`, filtered to the verified user's `owner_id` and `is_demo=false`.
The response exposes only `hasVisibleBoundPhysicalRobot`, never the count or any
device/account/session identifiers. A zero count means no physical robot is
visible in that current RLS view; it does not certify full inventory, no previous
ownership, safe unbinding or deletion eligibility. Missing/error/malformed counts
are fixed `503 preview_unavailable`, not zero. Authentication failures remain
fixed `401/403 preview_authorization_required` and do not run that count query.

Every successful preview has `state: planning_only`, `canSubmit: false`,
`requestCreated: false`, and `executionAvailable: false`. Robot disposition,
retention/redaction, provider revocation, server avatar cleanup, in-flight
command/enrollment handling and the executor/independent ledger all remain
explicit blockers. A visible robot adds another decision blocker; no policy is
chosen even when no robot is visible. There is no request/job/audit/email,
freeze/revoke/unbind/delete, Auth Admin, Storage or RPC operation.

This is not an in-app deletion initiation path, a complete data-impact inventory,
reauthentication, an approved retention policy or app-store compliance evidence.
The current App privacy screen is unchanged and is not wired to this endpoint.
Deployment requires the reviewed dependent SQL/joint Auth-session gate to be
installed and verified first, the shared Edge auth change second, and this
preview last, with separately scoped explicit production approval. No such
deployment is authorized here.

Local checks: `node --test scripts/account-deletion-preview.test.mjs
scripts/edge-auth-authority.test.mjs`; the Deno function suite includes
`tests/account_deletion_preview_test.ts`. SDK/environment fixtures do not prove
hosted Auth-session revocation or database RLS behavior.

## Account security email outbox

`register_account_terminal` atomically writes the terminal, optional
`new_device_login` outbox row, and `terminal.register` audit event. The feature
is default-off. The dedupe identity is a SHA-256 digest of the server-known user
and installation; the payload does not duplicate the email or store IP/location.

The worker renders only generated templates, rejects payload keys outside the
allowlist, HTML-escapes every value, and accepts links only on credential-free
HTTPS DOSO hosts at the exact `/account/security` or
`/account/delete/confirm` route required by the template. It claims exactly one
row, fences immediately before provider dispatch, and records `accepted` only
after RequestId/EnvId are durably stored. Provider error summaries are stripped
of AccessKey IDs/secrets and sender/recipient addresses before persistence.
Transport/timeout ambiguity and provider-success/DB-ack failure become
`delivery_unknown`; dispatch lease expiry can never cause automatic resend.

The DirectMail API returning `RequestId` and `EnvId` means the provider accepted
the request; it does not prove inbox delivery. Delivery receipts, bounce events,
complaints, spam-folder placement, and rendering are separate production checks.

Risk-based and account-deletion templates remain design assets only. Their
runtime feature rows, deletion tables, and execution paths are not installed.
Unknown retries require an audited operator reason and warn that duplicates are
possible. See `docs/runbooks/ACCOUNT_EMAIL_OUTBOX_DEPLOYMENT.md` for Vault/Cron,
alerts, PII retention, stop, and forward-fix procedures.

Run the shared unit tests with:

```sh
npx --yes deno@2.5.6 test --allow-read --allow-env --config supabase/functions/deno.json supabase/functions/tests
```

## Robot device enrollment

`device-enrollment` requires the user's verified Supabase access token and an
active DOSO terminal session. Its JSON actions are `begin`, `attest`, and
`complete`. The first action creates or reuses a short-lived challenge; the
other actions verify canonical Ed25519 manufacturing proofs before calling one
atomic service-role RPC. A signed higher factory-reset counter invalidates the
old runtime authority and asks the App to begin again with a fresh challenge.
No private key, Wi-Fi credential, raw signature, or service-role key is returned
to the App or persisted by this function.
