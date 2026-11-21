# Single normal-entry Android QA build

This launcher is a local QA build tool, not an installer, native test, production
deployment or store submission. `scripts/qa-build-once.mjs` has only the explicit
`--build --report-dir <existing release-evidence directory>` action. A directory
with an existing `attempt.json` cannot be reused. No retries or resource polling
are built in. Preserve old attempt files and old APKs.

## Public configuration and gate

On the current Windows host, select the existing Android Studio JBR 21 for QA
builds: `JAVA_HOME=D:/Android/Android Studio/jbr`, with
`ANDROID_HOME=D:/Android/Sdk`. Set these only for the owned build process; do not
change the user's global Java configuration. The 2026-10-25 JDK 24 attempt failed
at `configureCMakeRelWithDebInfo[arm64-v8a]`: Prefab returned exit0, but its JNA
native-access warning on stderr entered AGP 8.12.0's unrecognized-error branch.
The same Prefab arguments and inputs generated six files on both runtimes; JBR
21 produced no stderr. See the immutable diagnosis and runtime comparison in
`artifacts/release-readiness/20261025-control-depth-code14/`. This local toolchain
selection does not change the normal entry, resource gate, signing or acceptance
requirements. A new attempt after a diagnosed correction needs a fresh evidence
directory; never overwrite or reuse an earlier `attempt.json`.

Use the read-only public-key provenance checks documented in
`QA_PUBLIC_BUILD_ENVIRONMENT.md`. The selected modern publishable key stays in
orchestration memory, not a shell command, config file, argument, log or digest.
The shared environment helper fixes the backend to
`https://api-test.dosorobotics.com` for both platform URL variables and accepts
only the public key as configuration. Android development build and Metro
launchers use this same helper. EAS preview environment configuration is managed
separately from these local launchers.
Launch with the known non-secret Java/Android paths, wait for
`QA_BUILD_CONFIG_INPUT_READY_NO_ECHO`, then pass one token plus CR/LF/CRLF through
controlled stdin. Raw mode disables echo before this marker. Input is limited to
256 accepted bytes and 45 seconds; invalid data/non-TTY input stops before the
attempt/resource action. Clear the orchestration value afterward.

The CLI verifies the repository/staging-junction identity, report containment and
the exact retained f3135f77 APK before accepting input. It then reuses
`createQaBuildEnvironment`, constructs a fresh allowlisted child environment,
claims an exclusive repository build lock and records an exclusive attempt.
One CIM observation uses the reviewed preflight memory/process predicates.
Unknown observations, less than 4GiB free, competing tasks or invalid public
configuration stop before Gradle. The key is never serialized into evidence.

## Fixed build boundary

Instead of shell parsing a Windows batch command, invoke the selected Java
executable directly with `-jar gradle/wrapper/gradle-wrapper.jar` in the verified
short staging Android directory. This matches the existing wrapper's JVM entry.
Tasks are fixed to `:app:createBundleQaJsAndAssets --rerun :app:assembleQa`,
arm64-v8a and x86_64, no daemon/build-cache/configuration-cache, two workers and
no parallel execution. Explicit bundle rerun prevents reusing an old bundle
whose environment may not have been tracked as a Gradle input. No clean/delete,
prebuild, dependency update, release task, install or device action is included.

Discard arbitrary stdout/stderr. Separate bounded UTF-8 scanners retain only
fixed bundle-executed, assemble-completed and BUILD-SUCCESSFUL booleans; long
lines or invalid encoding fail closed. There is no raw build log, raw exception,
path/environment dump or credential-shaped output persisted. Failure diagnosis
is consequently limited to closed phases/outcomes and an actual exit code.

For a diagnosed build failure, the programmatic executor accepts an optional
line observer after UTF-8 and line-length validation. The normal CLI still
discards arbitrary output. A task-owned diagnostic caller must filter the
failure section, redact the exact public key and credential-shaped values,
and bound persisted lines; it must never dump raw stdout/stderr or environment.
Observer failure rejects output and uses the same owned-child cleanup path.

The owned child has a 20-minute deadline. On timeout, output rejection or
interrupt, terminate only its current PID/tree, bound the cleanup wait and record
cleanup separately. Never broad-kill Java/Gradle. Unconfirmed cleanup is not
safe adoption or permission to retry. Lock cleanup checks the owned file identity;
changed/replaced lock contents are left intact. Cleanup failure preserves the
primary decision and changes the final decision to `cleanup_unconfirmed`.

## Candidate is not an accepted package

In a shared workspace, the files covered by `snapshotQaBuildInputs` must stay
unchanged while `qa-build-once.lock` is owned. Other implementation lanes should
finish before the snapshot or wait until the build has closed; do not edit
App/native inputs underneath another build. If a normal build is already active,
wait for its result and independently compare the entire manifest with the
qualified source before considering reuse. Do not start a competing build or
adopt an `input_changed` result. A source version number and exit0 cannot repair
an uncertain source-to-package identity.

Bind non-private App/native input manifests before/after; exclude private env,
signing material, local.properties and generated outputs. Verify retained APK
bytes/SHA before/after. Even exit0 is insufficient: require executed (not cached)
bundle task, assemble/success markers, changed nonempty output, retained old APK
unchanged and zero input drift. No candidate is copied/adopted by this launcher.

Local Expo modules under `modules/` are native product inputs too: include their
module configuration, Gradle and source files. Exclude generated Android module
build/cache directories and private key material under the same rules. A source
manifest or autolinking discovery does not prove those modules compile into an APK.

`candidate_pending_metadata` requires a separate bounded inspection of package,
version, launcher, signing certificate, both ABIs and embedded normal-entry JS /
public configuration, followed by a new SHA-named retained copy. Build success
does not prove authentication, network connectivity, Android UI behavior or full
design/release acceptance. A preflight stop produces no new APK.

Tests use synthetic process output and filesystem fixtures plus real local Node
children (exit0, exit37, start failure, timeout). Synthetic candidate bytes are
deliberately not a valid APK and must never count as APK verification. Toolchain,
installed dependencies, Gradle caches/user configuration and private signing
inputs are not frozen; this is not a hermetic or fully reproducible build. The
launcher itself does not read private credential files, but cannot prove every
third-party build tool never reads its own configuration. Production permission
and runtime checks remain separate.

```text
node --test scripts/qa-build-once.test.mjs scripts/qa-build-environment.test.mjs scripts/qa-build-preflight.test.mjs
```
