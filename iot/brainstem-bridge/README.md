# DOSO Brainstem read-only bridge

This standalone Node service exposes one bounded diagnostics route:

`GET /api/v1/brainstem/status`

It calls only Brainstem `RobotControl.GetControlStatus`. The returned `ControlStatus.fsm` supplies the CMS state, so a second `GetCmsState` call is intentionally unnecessary. No motion, enable/disable, stop, lease, stream, motor, or profile RPC is called or exposed.

The bridge does **not** establish device binding, robot ownership, control permission, or robot liveness. A successful response means only that this one read completed. There is deliberately no `/health` route, no redirect, no open CORS policy, no proxy URL, and no request-selectable target.

## Requirements

- Node.js 22.13 or newer (aligned with Expo SDK 57's minimum Node version).
- The real Brainstem proto tree. `DOSO_BRAINSTEM_PROTO_ROOT` must be an absolute path to the directory that contains `brainstem_api/cms.proto` and `brainstem_api/common.proto`. The proto is loaded in place; it is not copied or modified here.
- An explicit `DOSO_BRAINSTEM_TARGET` such as `robot-diagnostics.example:13145`. There is no default target and no historical robot address.
- A bearer token containing 32-256 non-space printable ASCII characters (`0x21`-`0x7e`).

At startup, the service logs the loaded `cms.proto` SHA-256 so an operator can record the exact contract without logging secrets.

The proto inspected for this implementation on 2026-10-12 had SHA-256 `CD91AF0C7E8E6B8F8626967A584B4C52C1E7BB04E966FDB06C0EA11540B31336`. Startup recomputes the hash; a changed value means the live contract must be reviewed again.

## Install and test

Install dependencies only inside this directory:

```powershell
Set-Location iot/brainstem-bridge
npm install
$env:DOSO_BRAINSTEM_PROTO_ROOT = 'D:\absolute\path\to\brainstem_api_parent'
npm test
```

### Redacted configuration preflight

Before starting the bridge, run the local preflight after setting the required
environment variables:

```powershell
npm run preflight:config
```

The command prints only protocol names, port numbers, transport type and
boolean file-presence checks. It never prints the target host, bearer token,
certificate paths or certificate contents. A non-zero exit means the proto
root or configured TLS files are missing/invalid. The report also makes the
current scope explicit: this bridge exposes `GetControlStatus` only; it does
not expose a control lease, motion, motor, ACK or dead-man executor.

Tests start a real loopback HTTP server and a loopback mock gRPC server loaded from the real proto. The mock is a protocol fixture, **not hardware evidence**. Tests never start Brainstem, scan an address, or touch CAN.

### Repeatable Android local protocol test

With `DOSO_BRAINSTEM_PROTO_ROOT` and a test-only `DOSO_BRAINSTEM_BEARER_TOKEN` set, run:

```powershell
node tools/local-protocol-fixture.js --local-protocol-fixture
```

This fixture owns its own random-port loopback gRPC server; it cannot select an external upstream. The HTTP listener is always `127.0.0.1` (default `8120`, overridden by `DOSO_BRAINSTEM_HTTP_PORT`). Only `GetControlStatus` is implemented; all other RPCs are rejected. The status is deliberately fixed to GROUNDED / no owner / motors disabled / no critical fault. It is **not a running Dart Brainstem service or a robot**.

For a connected Android development emulator, record the existing ADB reverse list, add only `tcp:8120 -> tcp:8120`, and enter `http://127.0.0.1:8120` plus that fixture token on the App's connection-diagnostics page. Do not use the emulator LAN alias or send the token over LAN HTTP. After verification remove only the test-owned reverse and stop the fixture by stdin `stop`, SIGINT, or SIGTERM. Never reuse the test token in deployment.

For an actual local Brainstem implementation, use the normal `src/index.js` launcher against an explicitly loopback-bound service on port **13145**. Keep the artifact's evidence level explicit: a real `UnifiedCmsServer` with injected Brain/FSM state is a server-contract harness, not full ONNX/MuJoCo simulation or hardware testing. The App diagnostics result does not distinguish those upstream implementations by itself; record the launch/source evidence separately.

## Start with production mTLS

```powershell
Set-Location iot/brainstem-bridge
$env:DOSO_BRAINSTEM_PROTO_ROOT = 'D:\absolute\path\to\brainstem_api_parent'
$env:DOSO_BRAINSTEM_TARGET = 'robot-diagnostics.example:13145'
$env:DOSO_BRAINSTEM_GRPC_CA = 'D:\secrets\brainstem-ca.pem'
$env:DOSO_BRAINSTEM_GRPC_CLIENT_CERT = 'D:\secrets\doso-client.pem'
$env:DOSO_BRAINSTEM_GRPC_CLIENT_KEY = 'D:\secrets\doso-client-key.pem'
$env:DOSO_BRAINSTEM_BEARER_TOKEN = '<cryptographically-random-token-of-at-least-32-characters>'
npm start
```

The HTTP listener defaults to `127.0.0.1:8120`. Set `DOSO_BRAINSTEM_HTTP_PORT=0` only for an ephemeral local/testing port. A non-loopback `DOSO_BRAINSTEM_HTTP_HOST` is rejected unless both `DOSO_BRAINSTEM_HTTP_CERT` and `DOSO_BRAINSTEM_HTTP_KEY` are absolute paths. TLS server-name overrides and TLS bypasses are not supported.

For a local mock only, loopback plaintext must be explicitly enabled:

```powershell
$env:DOSO_BRAINSTEM_TARGET = '127.0.0.1:13145'
$env:DOSO_BRAINSTEM_LOCAL_INSECURE = 'true'
```

This exception is rejected for every non-loopback target.

Optional settings:

- `DOSO_BRAINSTEM_ALLOWED_ORIGINS`: comma-separated canonical origins. Remote origins must use HTTPS; HTTP is accepted only for loopback hosts. Empty means no cross-origin browser access; `*` is rejected. On the fixed status path, an allowlisted origin may issue a strict `OPTIONS` preflight only for method `GET` and request headers `Authorization`, `X-Request-Id`, and `Accept` (case-insensitive). Preflight never requires the bearer token and never calls gRPC. Unsafe preflights return `403`; other methods on the status path return `405`.
- `DOSO_BRAINSTEM_MAX_CONCURRENT`: maximum concurrent diagnostic reads, default `4`.
- `DOSO_BRAINSTEM_HTTP_PORT`: HTTP(S) listen port, default `8120`.

Every actual `GET` request must send `Authorization: Bearer ...`. `x-request-id`, when supplied, must be a UUID and is echoed as the response nonce; otherwise the bridge generates one. Query parameters and request bodies are rejected, including on preflight. Responses are non-cacheable and bounded. The gRPC read deadline is fixed at three seconds, failures are closed (there is no stub fallback), and returned errors use fixed public codes/messages without forwarding raw gRPC details.

If the HTTP client disconnects before the response finishes, the gateway aborts and cancels the in-flight gRPC unary call and releases its concurrency slot. A normal completed response does not trigger cancellation.

## Response contract

```json
{
  "schemaVersion": 1,
  "source": "brainstem.grpc",
  "access": "read-only",
  "requestId": "123e4567-e89b-42d3-a456-426614174000",
  "observedAt": "2026-10-12T00:00:00.000Z",
  "transport": "mtls",
  "state": {
    "kind": "CMS_STATE_KIND_STANDING",
    "transition": "CMS_TRANSITION_KIND_NONE"
  },
  "control": {
    "owner": "CONTROL_OWNER_YUNZHUO",
    "motorOutputEnabled": true,
    "criticalMotorFault": false
  }
}
```

There are intentionally no battery, `online`, or `canControl` fields. This endpoint is for deliberate diagnostics, not polling.
