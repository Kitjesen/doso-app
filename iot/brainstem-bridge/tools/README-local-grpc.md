# Local gRPC protocol fixtures

This fixture verifies TLS, HTTP/2, mTLS, gRPC framing/trailers and the real
Brainstem protobuf schema without a charged robot. It is **SIMULATION**: it does
not run the Dart FSM, connect to robot hardware or CAN, or prove the G20 App's
end-to-end connection.

From the workspace root:

```powershell
node doso-app/iot/brainstem-bridge/tools/local-grpc-fixture.mjs
node --test doso-app/iot/brainstem-bridge/tools/local-grpc-fixture.test.mjs
```

The first command performs one request, prints a structured result without
credentials, and closes the listener in `finally`. No background service or
certificate/private-key files are created. Existing local `node-forge` and
`protobufjs` packages are reused; the interoperability test also uses the bridge's
existing `@grpc/grpc-js`. No packages are installed.

`createLocalGrpcFixture({ protoPath?, timeoutMs?, testOnly? })` always binds
`127.0.0.1` on a randomly assigned port. Address/port options are rejected. The
default proto is the existing source
`D:/inovxio/brain/brainstem/brainstem_api/brainstem_api/cms.proto`; its sibling
`common.proto` is loaded by protobufjs without modifying generated files.

The returned object contains `origin`, `port`, `host`, `simulation`, `protocol`,
and an idempotent async `close()`. With the explicit `testOnly: true` option it
also contains temporary `credentials` in RAM: `ca`, `observer: {cert,key}`,
`unauthorized: {cert,key}` (same CA and CN, different leaf), `wrongCa`, and
`wrongClient: {cert,key}`. Never log or persist these values. Always await
`close()` in a `finally` block.

`requestLocalGrpc({ origin, ca, cert, key, rpcPath?, body?, timeoutMs? })` is a
reusable loopback-only client using Node TLS and HTTP/2, normal chain verification
and `127.0.0.1` IP SAN verification. It returns `statusCode`, `simulation`, response
`headers`, `trailers`, and the framed `body`. `frameMessage`, `unframeMessage`,
`loadProtocol`, `STATUS_PATH`, and `runLocalGrpcSimulation` are also exported.

Only the exact observer leaf certificate may call `GetControlStatus`. It returns
a fixed Grounded state, motors disabled, owner NONE, no lease, no accepted
commands, and not ready to walk. The `owner_id` value `SIMULATION` and response
header `x-doso-simulation: true` explicitly identify the fixture. The observer
label is not enough: a second certificate with the same CN is denied.

Every other method declared in the real service, including Enable, Walk,
WalkChecked, AcquireControl and all lease operations, returns PERMISSION_DENIED
(7) and has no handler or state effects. Unknown methods return UNIMPLEMENTED
(12). Status requests require exactly one uncompressed five-byte-framed empty
protobuf message. Invalid requests return INVALID_ARGUMENT (3); declared or
actual payloads above 64 KiB return RESOURCE_EXHAUSTED (8). Incomplete requests
have a bounded deadline, and idle sessions and TLS handshakes are bounded too.

The tests use real TCP/TLS sockets for successful protobuf decoding, missing
certificates, wrong CAs, exact-leaf authorization, all denied methods, unknown
methods, malformed and oversized frames, incomplete-request deadlines, normal
grpc-js interoperability, and failure after the server closes.

## PC control receiver simulation

`createLocalControlFixture({ protoPath?, leaseDurationMs = 300, maxRecords = 5000 })`
is a separate, explicit **SIMULATION** receiver for the QA plaintext LAN client.
The original `createLocalGrpcFixture` remains mTLS and status-only. The control
receiver reuses the real proto and installed `@grpc/grpc-js`, always binds
`127.0.0.1` on a random port, rejects bind/port overrides, and has no forwarding,
robot, CAN, Dart, or simulator-process dependency. Production TLS is not tested
by this plaintext receiver.

It implements GetControlStatus, GetProfile, GetVoltage, GetMotorStatus, Enable,
Disable, StandUp, SitDown, AcquireControl, RenewControlLease, ReleaseControl and
WalkChecked. Other methods return UNIMPLEMENTED. Profile is SIMULATION, voltage
is zero, and all 16 fake motors are offline. Enable/StandUp change only fixture
variables; they never enable a physical motor. Responses carry
`x-doso-simulation: true`; the snapshot's source is SIMULATION. The wire ownerId
must match the caller principal during a lease, as the real client requires;
outside a lease it is SIMULATION. Snapshots redact ownerId to SIMULATION and
never contain lease tokens or principals.

Control requests require a syntactically valid `x-doso-dev-client`; acquisition
must match clientId, and lease calls must match the current principal. This is a
local QA identity check, not authentication. The receiver preserves the source
server's 300 ms rolling lease, 18 ms minimum arrival interval, initial neutral
command, positive increasing sequence, exact-payload last-sequence replay,
rejection/revocation, neutral frame, release and expiry semantics. Lost input
expires the simulated lease and clears simulated movement. It does not execute
or certify the real state machine or motor watchdog.

The API returns `host`, `port`, `protocol`, `definition`, `snapshot()`,
`setFault(fault)`, and idempotent `close()`. Always close in finally. `snapshot()`
returns total received/accepted/rejected and acceptance rate, received Hz,
bounded request intervals with min/p50/p95/max/mean, simulated state/stop events,
and the latest maxRecords WalkChecked records. Records contain process-relative
monotonic milliseconds, sequence, direction, interval, decision and ACK sequence.
Aggregate acceptance counts cover the whole run; percentile statistics cover
the retained bounded window. No token, principal, certificate or key is logged.

`setFault({ rejectReason?, ackSequenceOffset?, delayMs?, disconnect? })` replaces
the WalkChecked fault scenario. Rejection uses a real reason 1..9, ACK sequence
offset is 0 or 1, and ACK delay is 0..10000 ms. `disconnect: true` closes the
receiver transport without an ACK; the rolling lease still expires. `setFault()`
clears the fault. Faults do not target real hardware.

From the doso-app directory:

```powershell
node --test iot/brainstem-bridge/tools/local-grpc-fixture.test.mjs
node iot/brainstem-bridge/tools/local-grpc-measure.mjs
node iot/brainstem-bridge/tools/local-grpc-measure.mjs --serve
```

The baseline sends up to 250 sequential WalkChecked requests with a 20 ms
minimum send interval, stops at the first invalid/rejected ACK, releases and
closes, then prints JSON without secrets. `passed` requires 250 accepted ACKs
and observed 49..51 Hz. The bounded precision wait avoids coarse Windows timer
quantization; it is measurement pacing, not application implementation. RTT is
PC client send-to-ACK on one machine, not G20 input-to-receiver latency.

`--serve` prints a single SIMULATION host/port readiness object. It closes on
`stop`, stdin EOF, SIGINT/SIGTERM, or after ten minutes. Stdin `snapshot` prints
the current bounded JSON record; `fault {"delayMs":150}` changes the fault;
`fault {}` clears it. The receiver never opens a PC LAN listener or requests a
firewall change. A separate operator can run
`adb reverse tcp:<device-port> tcp:<printed-PC-port>` and choose the explicit QA
LAN endpoint `127.0.0.1:<device-port>`. This requires the QA LAN gate to allow
that exact loopback address; a blocked gate must be reported, not bypassed by
changing listener exposure. Running this receiver or PC baseline does not prove
G20 controls, G20 timing, robot motor operation, or production readiness.
