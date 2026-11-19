# Read-only G20 SDK instrumentation probe

This APK is an explicitly identified local experiment, package
`com.doso.g20.readprobe`, instrumentation target `com.doso.robot.qa`. It has no
launcher, Internet permission, robot transport, copied SDK classes, or JNI
libraries. It loads the target application's installed RCSDK through
`getTargetContext().getClassLoader()` and uses dynamic callback proxies.

Build with `./tools/g20-read-probe/build.ps1`. It uses installed JDK 21,
aapt2, d8, zipalign, and apksigner without Gradle or new dependencies. The APK
is signed using the existing debug keystore in place. The build rejects a
certificate mismatch against the DOSO `fac61745...` certificate. Evidence is
written under `evidence/20261028-g20-pc-50hz-01/probe-build*`.

The parent operator may install the APK and run one experiment at a time:

```powershell
adb shell am instrument -w -e mode channels com.doso.g20.readprobe/com.doso.g20.readprobe.ReadProbe
adb shell am instrument -w -e mode settings com.doso.g20.readprobe/com.doso.g20.readprobe.ReadProbe
adb shell am instrument -w -e mode mode com.doso.g20.readprobe/com.doso.g20.readprobe.ReadProbe
```

Only those mode values, optional `-e raw16 true|false`, and optional
`-e intervalMs 20|100` are accepted. The interval defaults to 20 ms; values
other than the exact strings `20` and `100` are rejected. For the brief vendor
comparison baseline, append `-e intervalMs 100` before the instrumentation
component. The
three mode names select exactly one of `KeyChannels`, `KeyChannelSettings`, or
`KeyControlMode`, exclusively through `KeyManager.get`. The probe never calls
SDK SET/ACTION or robot APIs. After initialization it sets the process-local
connection selector to RC only and connects, matching `SkydroidG20Source.kt`.
That source closes with `disconnectRC`, which this probe also uses. It restores
the previous `onlyConnect` selector in cleanup.

Each run waits at most three seconds for connection, reads for three seconds
with the selected target minimum request interval and at most 160 responses,
and has a ten-second outer watchdog. The three-second window limits new GET
requests; a GET started within that window retains its complete 500 ms callback
wait, even after the request window closes. Requests are serial. A missing GET
callback stops the run after at most 500 ms; late/duplicate callbacks cannot
add records after timeout or cleanup. Unrecognized callback methods cannot
consume a pending request. It prints only a structured probe
summary: counts, monotonic request/callback timings, and optionally the first
16 raw channel integers. Settings and mode values are not logged. No account,
principal, or token is collected. The target rate is a request, not a result.

The optional 100 ms interval matches the observed vendor channel page for
sound-source isolation; the default 20 ms interval retains the 50 Hz throughput
target. Selecting a target interval does not prove achieved rate. The SDK
singleton and properties are invoked through their public
Kotlin object `INSTANCE`, getters and setters; the corresponding original class
and method names were verified in code30 APK DEX definitions. Failure telemetry
contains only a fixed enum `failureStage` and exception class name, without
exception messages or stack traces. `InspectSdk.java` reads the existing SDK AAR
class tables in memory and `InspectDex.java` reads APK DEX identifiers; neither
adds SDK content to the probe or guesses obfuscated names.

The success result requires a completed measurement window, at least one
successful callback, no failed callbacks, and successful cleanup. Mixed success
and failure is reported as `partial_callbacks`; zero successes is
`no_successful_callbacks`. A cleanup failure remains recorded across repeated
cleanup calls. Deadline, normal completion, and onDestroy compete for one
finish operation, which uses its captured outcome. `node
tools/g20-read-probe/selfcheck.mjs` performs a local JVM check of the extracted
cleanup implementation, concurrent cleanup, callback isolation and completion
predicates; it does not load Android or the vendor SDK.

The artifact was compiled and signature/package contents were checked on PC.
It has not been installed or run by its authoring worker. Availability of the
target classloader's SDK/JNI, connection behavior, callback timing, and any
audible effect remain unverified until the operator runs it on G20. Reflection
or JNI failure reports `reflection_or_jni_unavailable`; it does not fall back
to hooks, a new SDK copy, or device writes. SDK-native blocking cannot be
proven bounded by a Java watchdog, so the operator still owns external device
process termination if a vendor native call hangs.

## Fixed PC status diagnostic

`-e mode pcStatus` selects an independent read-only gRPC test. It accepts no
`raw16`, `intervalMs`, endpoint, metadata, identity or token options. It connects
only to `127.0.0.1:19146` and sends one empty protobuf request to
`brainstem.api.v1.RobotControl/GetControlStatus`. The operator owns USB adb reverse
to the PC simulation receiver. This mode does not initialize the controller SDK,
acquire a lease, or send Enable/Walk or any other RPC.

The helper compiles against existing grpc-api/okhttp/core/util 1.85.1 JARs from
Gradle's local cache. Those JARs are compile classpath only and are not packaged
in the APK. It uses the product's `ClientCall.Listener` pattern, not grpc-stub
`ClientCalls`, which was proven absent in code30. Target dependency loading
failure is reported as `pc_status_unavailable` with a class name.

The RPC has a three-second deadline and three-second latch wait, a 64 KiB body
limit, a second-response check, and call cancellation/channel `shutdownNow` in
finally and lifecycle cleanup. Success reports only gRPC code and body length
alongside fixed probe identity/result fields, without response content. Failure
reports gRPC code, exception class and a fixed description category (`cleartext`,
`preface`, `name_resolution`, `connection_refused`, `connection_reset`, `timeout`,
`tls`, `other`, `none`). Descriptions and cause messages are examined only for
classification and never emitted. No arbitrary message or stack is printed.

```powershell
adb shell am instrument -w -e mode pcStatus com.doso.g20.readprobe/com.doso.g20.readprobe.ReadProbe
```
