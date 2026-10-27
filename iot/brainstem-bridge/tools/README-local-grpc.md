# Local status-only gRPC protocol fixture

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
