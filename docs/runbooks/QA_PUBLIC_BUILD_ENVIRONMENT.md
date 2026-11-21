# QA public build environment handoff

This is a local preparation tool, not a build/install command or release gate.
`scripts/qa-build-environment.mjs --probe` does not start Gradle, perform a
resource probe, make a network request or write a configuration file. Actual
build readiness remains a separate fresh `qa-build-preflight` decision.

## Source and handoff

The task orchestrator obtains the active public `SUPABASE_PUBLISHABLE_KEY` from
the authorized deployment configuration for `https://api-test.dosorobotics.com`.
It accepts one complete modern `sb_publishable_` key and verifies its deployment
provenance before handing it to the local helper. The helper checks the token
format and fixes both platform URLs to this HTTPS origin. Its configuration
object contains only `publishableKey`.

Do not copy the key into source, a config file, command arguments, evidence or
shell history. Do not read `.env.local`, credential stores, service keys or
keystores to run this probe. The orchestration holds the public value only in
memory, starts the exact `--probe` command with a task-owned TTY and waits for
`QA_PUBLIC_CONFIG_INPUT_READY_NO_ECHO`. That marker is printed only after raw mode
has disabled terminal echo. It sends the public value plus one line terminator
through the controlled stdin channel, never by a typed shell command. Clear the
ephemeral orchestration value afterward. Non-TTY input is deliberately rejected.

The receiver has a 256-byte input cap and 45-second deadline. Only one complete
modern token is accepted, framed by CR, LF or CRLF; extra lines, controls, spaces,
missing terminator and oversized input are invalid. The observed Windows tool
TTY converts submitted LF to CR. Synthetic tests cover this distinction; do not
assume a line feed survives the terminal transport. All errors are fixed messages
with only a closed phase code. Normal/error completion restores raw mode.

## Environment isolation

`createQaBuildEnvironment` reads only the named non-secret SystemRoot, JAVA_HOME,
ANDROID_HOME, TEMP and TMP paths from the host. Case-ambiguous, missing, relative
or nonexistent paths fail closed. It builds PATH from the current Node directory,
the selected Java bin/Android platform tools and Windows system directories; it
does not inherit arbitrary parent PATH entries or spread `process.env`.

The native point-cloud module also needs the external Rust SDK. Set
`DOSO_SDK_ROOT`, `CARGO_HOME`, `RUSTUP_HOME`, and `PROTOC` explicitly before
using the QA/local build launchers. These paths must exist; the SDK Cargo files,
`cargo.exe`, `rustup.exe`, and the actual Protobuf compiler are checked before
the child starts. Rust builds use a fixed `CARGO_BUILD_JOBS=2` to bound native
compiler concurrency alongside Gradle's two-worker limit. Point `PROTOC` at the
real compiler, not a user-profile shim.
The child receives only these four additional values and the verified Cargo
bin directory. Partial or ambiguous Rust configuration is rejected without
printing its contents. External SDK source inputs are included in the existing
before/after build manifest; its target directories and credentials are excluded.

The output contains fixed system/toolchain paths, CI/production mode,
`ENTRY_FILE=index.ts`, `EXPO_NO_DOTENV=1`, `https://api-test.dosorobotics.com` for
both Supabase URL variables, the public key,
and explicit off values for design/capture/simulation/diagnostic/social-provider
flags. Server Supabase variables, passwords, signing variables, NODE_OPTIONS,
Java/Gradle options and other unapproved variables are not inherited. A real
Node child receives that env with static argv and `shell:false`. It emits only a
fixed boolean contract; raw stdout/stderr/errors/environment are never dumped.

This does not prove all tools or dependencies never read arbitrary files. It
does not freeze installed node_modules/toolchains, validate a production signing
identity, establish network/Auth access or replace APK/native tests. A future
Gradle launcher must reuse the safe handoff and fresh resource gate, redact exact
public values and credential-shaped output in memory before retaining build
logs, bind before/after inputs and adopt only a newly verified artifact. This
probe contains no such build launcher and cannot override a resource stop.

## Verification and evidence

Local checks:

```text
node --test scripts/qa-build-environment.test.mjs scripts/qa-build-preflight.test.mjs
```

They exercise real child-process isolation with synthetic keys, configuration
rejection, unread secret getters, path failure cases, bounded line parsing and
non-TTY/unknown-action rejection. The 2026-10-17 real read-only handoff emitted
only booleans and no value; the record intentionally cannot independently
recompute key equality because no key or digest is retained. It is an attestation
of that controlled orchestration, not a portable credential or an App login test.
See `artifacts/release-readiness/20261017-avatar-client-qa-build/`.
