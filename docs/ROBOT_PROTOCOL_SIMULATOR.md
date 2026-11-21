# Robot Protocol Simulator

> Evidence classification: **SIMULATED**. This is an executable reference protocol, not production, network, firmware, or physical-device evidence.

## Reference slice

The only command is the non-motion `diagnostics.health_check`. The reference model includes:

- a manufacturing identity registry binding one device ID to one Ed25519 public key;
- `active`, `revoked`, `compromised`, and `retired` manufacturing identity states;
- `unassigned`, `owned`, `quarantined`, `compromised`, and `retired` device lifecycle states;
- deep-copied, short-lived, one-use pairing challenges consumed by compare-and-set only after signature verification;
- active/suspended accounts, active/revoked terminals, a revocable session/capability registry, and device command policy;
- immutable command authorization snapshots containing actor user, session, policy version, and capability, all revalidated at publish;
- signed commands, signed monotonic authorization-epoch updates, signed boot claims, signed ACKs, and signed telemetry;
- one-use boot challenges with expiry and monotonic boot counters;
- strict command, ACK, and telemetry shapes;
- `(device_id, idempotency_key)` command idempotency and transactional in-memory command/outbox/audit creation;
- atomic authorization revocation: queued work is cancelled and published work becomes `revocation_pending`;
- explicit outbox states, fencing tokens, lease-holder crash recovery, exponential retry with deterministic jitter, and transport-only DLQ behavior;
- publish-time account, terminal, ownership, lifecycle, epoch, TTL, capability, and policy checks;
- device-originated, Ed25519-signed, one-use delivery nonce challenges bound to manufacturing identity, device, active boot, command, epoch, revocation version, and monotonic delivery counter;
- a non-cacheable two-phase simulated delivery operation: all control-plane and robot checks are side-effect-free first; only after both pass do control authorization CAS, delivery counter, robot challenge CAS, and immediate execution commit synchronously. Robot validation failure consumes nothing, while an old signed `allow` cannot cross revocation even when the epoch update was lost;
- append-only authenticated ACK events—including unknown-command and binding-mismatch events—followed by active-boot projection and a non-reversing ACK state machine with structured terminal reasons;
- durable device receipts written before execution, including fail-closed recovery from an ambiguous `executing` crash;
- telemetry checks for active identity, epoch, boot, sequence, signature, and clock skew;
- non-empty structured logs with secret-field and PEM redaction.

Device private keys exist only in process memory. The simulator never writes or logs private keys or Wi-Fi credentials.

## Verification

Run:

```powershell
npm run test:g008-command-delivery
npm run test:g008-diagnostic-ui
npm run test:robot-simulator
npm run test:firmware-lifecycle
npm run test:release-gate
```

`test:robot-simulator` 是唯一的机器人模拟器聚合门禁：它失败即停地验证机器人协议 `28/28`、安全配网 `24/24`、G008 命令投递 `18/18`、G008 诊断 UI `9/9`，以及 lifecycle/trusted-data UI guard；随后复用 canonical G008 场景的已验证 append-only ACK events，按原顺序证明命令/设备投影可映射到诊断 DTO，且过期可信遥测会被隐藏并视为离线。`test:release-gate` 只调用该聚合一次，再执行固件、BLE、其余 lifecycle UI 与 TypeScript 门禁。这个聚合不会连接 MQTT、硬件或生产 Supabase。

The core protocol verifier prefixes its evidence with `SIMULATED`; the aggregate also relays exact pass markers from the diagnostic and static UI guards. Node itself may emit an environment warning because the existing package does not declare an ESM module type; that runtime-generated warning is not verifier evidence. Only the aggregate's final `SIMULATED SUMMARY 79/79 ...` line is the canonical simulator-gate classification.

The verifier covers success plus challenge mutation, invalid signatures, expiry, replay, cross-device use, manufacturing-key reuse, prohibited rebind, actor/capability denial, signed-command tampering, stale/cross-device epoch updates, atomic revocation, policy terminal states, fencing, reused leases, explicit-retry and vanished-holder DLQ paths, boot replay/counter/expiry, forged/stale/unknown/mismatched ACKs, immutable command finals, illegal ACK transitions, `accepted`/`executing` crash recovery, published-command cancellation with a lost epoch update, delivery-token replay, forged/tampered device delivery challenges, rollback after robot-side validation failure, session/capability revocation at publish, forged/stale/skewed telemetry, and actual log redaction.

## Not completed

- MQTT broker integration, topic ACLs, real QoS behavior, retained-message rules, or broker failover.
- mTLS certificates, secure-element storage, manufacturing PKI, certificate rotation, or revocation distribution.
- Supabase schema, RLS, Edge Functions, durable SQL transactions, hosted workers, or production audit storage.
- Real Bluetooth/Wi-Fi transport, radio permissions, GATT interoperability, test-AP behavior, or captive portals; only the offline provisioning contract is implemented.
- Production firmware signing/distribution, robot bootloader writes, physical power-loss rollback, motor control, routes, tasks, recall, emergency stop, safety interlocks, or trusted physical sensors; only the offline OTA lifecycle is implemented.
- Production mobile command integration; the current diagnostics panel is explicitly simulator-only and leaves physical controls locked.

## Next integration boundaries

1. Persist identities, epochs, boot sessions, commands, outbox rows, ACK events, receipts, telemetry cursors, and audits behind server-only Supabase mutation paths and RLS.
2. Implement a transactional hosted publisher that preserves the simulator's fencing and last-moment policy checks.
3. Map the signed envelopes onto an isolated MQTT broker with per-device mTLS ACLs, then test real QoS1 duplication, reconnect, and broker failure.
4. Implement firmware secure-key storage, boot counters, durable receipts, signed ACK/telemetry, and signed epoch-update verification.
5. Connect the verified Bluetooth/Wi-Fi provisioning contract to an Expo SDK 57 Development Build adapter, keeping credentials excluded from logs, analytics, crash reports, and cloud command payloads.
6. Validate the health-check slice on a stationary physical fixture before designing any motion command. Motion requires a separately reviewed safety protocol and hardware interlocks.

The simulator's online authoritative check and immediate delivery are intentionally indivisible. A real MQTT deployment cannot treat the signed allow as a bearer token: it still needs broker/device epoch synchronization plus explicit cancellation acknowledgement (or an equivalent online authorization exchange) before execution.
