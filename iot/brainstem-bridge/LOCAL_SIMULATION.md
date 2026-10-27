# Brainstem local motion gateway

This gateway is exclusively for the attested local Brainstem simulation. It binds `127.0.0.1:8122`, connects only to the simulation gRPC listener at `127.0.0.1:13147`, and reads simulation state from `127.0.0.1:13148`. It does not enable or disable motors and cannot be pointed at the hardware port.

Start the simulation and observer first. Then provide the exact observer instance UUID and proto root:

```powershell
$env:DOSO_BRAINSTEM_PROTO_ROOT='D:/inovxio/brain/brainstem/brainstem_api'
$env:DOSO_BRAINSTEM_SIMULATION_INSTANCE_ID='<observer-instance-uuid>'
node tools/start-local-motion.js
```

Creating a session still begins with `POST /api/v1/simulation/sessions`. That response is returned only after matching the simulation attestation, acquiring the Brainstem lease, and receiving the mandatory sequence-1 zero-speed acknowledgement.

The preferred controller transport upgrades `GET /api/v1/simulation/sessions/:id/stream` to WebSocket. The server first sends:

```json
{"kind":"stream-ready","schemaVersion":1,"simulationOnly":true,"sessionId":"<uuid>"}
```

The client then sends one input at a time and waits for its acknowledgement before sending the next:

```json
{"kind":"input","inputSequence":1,"velocity":{"x":0.2,"y":0,"z":0.1}}
{"kind":"input-ack","schemaVersion":1,"simulationOnly":true,"sessionId":"<uuid>","inputSequence":1,"accepted":true,"gRpcSequence":2,"status":"accepted"}
```

To disconnect normally, send `{"kind":"release"}` and wait for `kind: "release-ack"`. The release acknowledgement is emitted only after Brainstem acknowledges zero speed and confirms that the gRPC lease is inactive. Binary frames, frames over 16 KiB, replayed or non-contiguous sequences, a second pending input, duplicate streams, and mixing WebSocket with the HTTP input route all fail closed.

The earlier HTTP controller flow remains available for compatibility: repeated `PUT /api/v1/simulation/sessions/:id/input` followed by `DELETE /api/v1/simulation/sessions/:id`. A session must select exactly one input transport.

For both transports, the acknowledged zero-speed bootstrap may wait up to 1000 ms for the first input. As soon as that first input arrives, the session switches to the strict 250 ms inactivity watchdog. The 90 ms lease renewal and 25 ms minimum `WalkChecked` spacing remain enforced. Timeout, socket loss, command error, lease error, invalid input, explicit release, and process shutdown all send an acknowledged zero command before releasing the control lease.

Browser access is limited to the configured DOSO local preview origins. Native clients may omit `Origin`; exact `http://127.0.0.1:<gateway-port>` and `ws://127.0.0.1:<gateway-port>` origins are also accepted for local native WebSocket implementations. Wildcards and remote origins are rejected, and all requests still require the exact loopback `Host` value. Use `adb reverse tcp:8122 tcp:8122` for an Android emulator or device so the native client can address the gateway as `http://127.0.0.1:8122` and `ws://127.0.0.1:8122`.
