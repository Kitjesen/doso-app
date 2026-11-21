# Robot Device Enrollment Deployment

## Purpose

This rollout establishes a hosted trust seam between a factory-installed Ed25519 identity and the robot's runtime authority key. It does not transmit or store Wi-Fi credentials, enable MQTT delivery, or enable physical motion.

## Production contract

- `private.robot_manufacturing_identities` stores the factory public identity and reset counter. It has no direct API table privileges.
- `private.robot_enrollment_sessions` stores five-minute, one-time challenges fenced to owner, terminal, Supabase auth session, authority version, authorization epoch, factory reset counter, and a strictly increasing device event sequence.
- `device-enrollment` exposes authenticated `begin`, `attest`, and `complete` actions.
- The Edge function verifies canonical Ed25519 proofs. SQL rechecks every authority fence inside the transition transaction.
- Completion calls the existing `provision_robot_device_authority` RPC to install the robot-generated operational public key and active boot ID.
- A manufacturing-signed higher reset counter terminates the current challenge, advances the counter monotonically, clears stale runtime authority, and requires a fresh `begin`.
- Only proof digests and audit metadata are persisted. Raw signatures, private keys, and network credentials are not stored.

## Deployment order

1. Take a hosted database backup or confirm point-in-time recovery before applying the additive migration.
2. Verify the hosted migration ledger and apply `20260827070734_add_robot_device_enrollment.sql` in the normal Supabase deployment lane.
3. Confirm the five enrollment RPCs are executable only by `service_role` and both private tables remain inaccessible through PostgREST roles.
4. Deploy `device-enrollment` with normal Supabase JWT verification enabled. Do not configure `verify_jwt = false` for this function.
5. Import each robot's manufacturing public identity through a controlled factory/admin backend that holds the service-role credential. Never ship that credential in the app or robot firmware.
6. Run one physical staging enrollment: authenticated owner begins; the robot signs the challenge with its manufacturing key; the robot later signs an online confirmation containing its newly generated operational public key and boot ID.
7. Verify `robot.enrollment_*` and `robot.authority_provisioned` audit events, then accept one signed telemetry frame from the new operational key.

## Release gates

- Replays and out-of-order identity/reset/online-confirmation events are rejected.
- Expired, revoked-session, owner-changed, epoch-changed, or reset-counter-changed enrollment sessions cannot commit.
- A forged manufacturing signature never reaches a commit RPC.
- The operational public-key fingerprint is derived and checked by the database before authority changes.
- Robot command delivery and physical motion remain disabled until GATT, secure Wi-Fi handoff, MQTT/mTLS, trusted ACK/telemetry, and physical safety acceptance are separately complete.

## Rollback

Disable or remove the `device-enrollment` function first to stop new sessions. The migration is additive; prefer leaving its tables and audit history in place while the issue is corrected. Use the pre-deployment backup only for a database-level incident that cannot be repaired forward.
