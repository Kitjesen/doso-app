# Robot Command Worker deployment

## Current release posture

G015 installs the database dispatch fence and a fail-closed Edge worker. The
worker now includes a short-lived HTTPS adapter for a separately deployed,
long-running IoT Gateway. Keep
`DOSO_ROBOT_COMMAND_DELIVERY_ENABLED=false` in every hosted environment. Even if
the flag is changed prematurely, missing Gateway configuration returns fixed
`503 transport_unconfigured` before the worker imports a signer, constructs a
database client, or claims a command.

The Edge Function does not maintain an MQTT connection. Supabase Edge workers
have bounded lifetimes, so the external Gateway owns the long-running MQTT/mTLS
session, QoS receipt, reconnect loop, broker credentials, and device
certificates. The Edge worker sends one bounded HTTPS request per claimed
command.

The only supported command remains the stationary, non-motion
`diagnostics.health_check`. A `published` result means only that the future
transport accepted the signed message for delivery. Device success requires a
separately authenticated robot ACK through `robot-ingress`.

## Preconditions for a future staging canary

Do not enable the worker until all of the following are true:

1. The G014 robot persistence migration and the G015 dispatch-hardening
   migration are deployed to an isolated staging project.
2. A real IoT Gateway has received a separate security review and is deployed
   as a long-running service. Simulator, in-memory, development broker, and
   local fallback endpoints are not allowed. Configure its exact command URL in
   `DOSO_ROBOT_COMMAND_GATEWAY_URL` and its independent service credential in
   `DOSO_ROBOT_COMMAND_GATEWAY_API_KEY` through Edge Function secrets.
3. The adapter has bounded connection and publish behavior and can distinguish
   a cryptographically or operationally proven zero-delivery rejection from an
   ambiguous outcome. Timeout, abort, connection loss, malformed receipt, and
   ordinary exceptions must remain `delivery_unknown`.
4. An Ed25519 signing identity has been generated outside the repository. Store
   its PKCS8 private material in the staging Edge secret named by
   `DOSO_ROBOT_COMMAND_SIGNING_PRIVATE_KEY_PKCS8_PEM`; distribute only the
   corresponding public identity through the reviewed device trust process.
5. Supabase has generated an independent named secret entry called
   `robot-command-worker`. Do not reuse the ingress, email automation, anon,
   publishable, or legacy service-role credential.

## IoT Gateway v1 contract

The configured Gateway URL must be an exact `https://` endpoint without URL
credentials, query parameters, or a fragment. The worker sends:

- `POST` with `Authorization: Bearer <gateway service credential>`;
- the command id and idempotency key in fixed headers;
- JSON containing `protocol_version`, the complete signed command envelope, and
  `signature_b64url`;
- the worker's existing publish deadline as the request abort signal.

The Gateway returns HTTP `202` with exactly
`{"accepted":true,"transport_message_id":"..."}` only after it has accepted
the message into the production MQTT/mTLS delivery path. This means published
to the transport, not executed by the robot.

The Gateway derives the broker topic only from the signed
`command.device_id`: `doso/v1/devices/{device_id}/commands`. It must publish at
MQTT QoS 1 with `retain=false`; it must not accept a caller-supplied topic, QoS,
or retain override. Per-device broker ACLs and mTLS identities must allow each
robot to consume only its own command topic and publish only its own ACK and
telemetry topics.

A 4xx response is a definite non-delivery only when its exact JSON body is
`{"accepted":false,"definitely_not_delivered":true,"error_code":"..."}` and
the Gateway guarantees the rejection occurred before broker publication. Every
timeout, connection loss, 5xx, malformed receipt, redirect, or unproven 4xx is
`delivery_unknown` and is never automatically retried.

Never paste private keys, API keys, transport credentials, or Vault values into
this runbook, source control, shell history, tickets, or deployment logs.

## Staging deployment sequence

1. Confirm all database and Functions tests plus
   `npm run test:robot-command-worker-contract` pass from a clean checkout.
2. Deploy the migrations while delivery remains disabled. Confirm the
   `begin_robot_command_publish` RPC is executable only by `service_role` and
   direct CRUD on `private.device_command_outbox` is unavailable.
3. Configure the dedicated named Supabase secret, signing key,
   `DOSO_ROBOT_COMMAND_GATEWAY_URL`, and
   `DOSO_ROBOT_COMMAND_GATEWAY_API_KEY` through the platform secret manager.
   Keep the delivery flag false.
4. Deploy `robot-command-worker` with `verify_jwt=false`. This setting is
   intentional: platform JWT verification does not authenticate the opaque
   named secret. The function validates `apikey` before reading the body or
   creating any client.
5. Store the worker URL and its dedicated invocation credential in Supabase
   Vault. Configure Supabase Cron to read those Vault entries at execution time
   and invoke the Edge Function with POST and the `apikey` header. Cron SQL must
   not contain literal credentials.
6. Invoke once with delivery disabled. Expect fixed `503 delivery_disabled`
   and verify that command/outbox rows remain unclaimed.
7. Remove both Gateway variables and invoke with the adapter deliberately
   unavailable. Expect fixed `503 transport_unconfigured` and again verify zero
   claims. A partially configured or non-HTTPS Gateway must return fixed
   `503 transport_configuration_error`, also with zero claims.
8. Enable `DOSO_ROBOT_COMMAND_DELIVERY_ENABLED=true` only in staging, then run a
   single-device canary with `limit=1`. Confirm the order in database evidence:
   queued → leased → dispatching → published, followed by a separately signed
   ACK. Never interpret `published` alone as device execution.
9. Increase the Cron batch gradually. The request default is 10 and the hard
   maximum is 25; the worker lease is 30 seconds, publish timeout is at most 10
   seconds, and no new claim or transport starts after the 45-second work
   deadline. A required final persistence or reconciliation call may complete
   after that deadline; the Edge Function runtime timeout must leave headroom.

## Monitoring and incident rules

Worker responses and logs expose only fixed counters. Monitor at least:

- `persistenceUnknown > 0`: pause non-essential new command creation and
  investigate database health. The worker must keep running so it can reconcile
  already claimed or ambiguous commands; do not stop its schedule.
- new `delivery_unknown`: never automatically retry; reconcile with trusted
  transport/device evidence before any manual decision.
- new `revocation_pending`: authority changed after dispatch began; never put
  the row back into the automatic queue.
- rising `transportFailures`: inspect the reviewed adapter without logging
  command identifiers, lease/fence values, message identifiers, credentials, or
  raw provider errors.
- stale queued/leased rows and dead letters.

The worker reconciles timeouts before and after its serial claim loop. An
expired pre-dispatch lease may be queued again; an expired dispatching lease or
published ACK deadline becomes `delivery_unknown`.

### G016 aggregate operations snapshot

Call `get_robot_operations_observability` from a trusted server process using
the `service_role`; never put that credential in the App. The RPC defaults to a
one-hour event window and a 120-second trusted-shadow threshold. It returns only
fixed aggregate counters and timestamps. It does not return device or command
identifiers, payloads, digests, provider errors, or transport message metadata.

Use these initial thresholds in staging, sampled once per minute:

- Warn when `queued.oldest_age_seconds > 120`; pause non-essential new command
  creation and investigate when it exceeds 600 or the queued count grows for
  five consecutive samples. The worker must keep running to reconcile existing
  rows.
- Treat any `leased_overdue_count` persisting for two samples as a worker-health
  alert. Treat any `dispatching_overdue_count` as critical because transport may
  already have received the command; do not requeue it.
- Treat any current `published_overdue_count` or `revocation_pending_count` as
  an incident requiring reconciliation with separately trusted
  transport/device evidence. For terminal `delivery_unknown_count` and
  `dead_letter_count`, alert on a positive delta between adjacent samples or on
  independent persisted Edge event evidence. A repeated non-zero rolling-window
  count does not mean a new event occurred.
- For ACK rejection counters, alert on a positive delta between adjacent
  samples or independent persisted Edge event evidence, especially for
  authorization, binding, and boot mismatches. Warn when `unknown_command`
  exceeds five attempts in the one-hour window. A repeated non-zero count in
  consecutive samples does not mean a new event occurred; never log the
  rejected frame or its reason JSON.
- Warn when more than 10% of eligible trusted shadows are stale for five
  minutes, and escalate at 30% or when the missing count rises. A stale trusted
  shadow does not mean a robot is offline; it means only that no newer accepted
  trusted snapshot is persisted inside the selected threshold.

`published` does not prove device success. Only a separately authenticated ACK
can prove the device-side outcome. Edge verification rejects and raw telemetry
rejects that are not persisted in `device_command_ack_events` are not visible in
this RPC; monitor those at the Edge boundary without adding payloads or device
identifiers to this aggregate. Rolling-window aging can offset or hide a positive
delta when older events leave the window, so exact new-event alerts must use
persistent Edge logs or event stream evidence. These thresholds are conservative
starting values and must be recalibrated from staging traffic before production
rollout.

## Rollback

1. Set `DOSO_ROBOT_COMMAND_DELIVERY_ENABLED=false` first.
2. Disable the Vault-backed Cron schedule.
3. Remove the Gateway URL and credential, then redeploy the fail-closed worker
   if the adapter or Gateway is suspect.
4. Rotate the dedicated worker named secret and signing identity when exposure
   is possible. Do not rotate or reuse unrelated application credentials.
5. Preserve `delivery_unknown` and `revocation_pending` rows for investigation;
   do not bulk requeue them. Only expired `leased` rows that never crossed begin
   are eligible for automatic retry.

Production rollout requires a separate approval after the staging canary,
transport security review, trusted ACK evidence, monitoring, and rollback drill
are complete. G015 alone is not that approval.
