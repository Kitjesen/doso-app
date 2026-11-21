# Full App local acceptance

`com.doso.robot.localtest` / **DOSO Local Test** packages the normal `index.ts`
entry with the current App, UI and native modules. It installs alongside Dev,
QA and Video Test and includes its JavaScript bundle, so Metro is not required.
It has no cloud URL or client key and cannot log in or verify cloud ownership.
The App displays its unconfigured account state; guest navigation, explicit
local device testing and video use the same production components and gates.
This does not migrate the account backend or qualify authenticated screens.

The dedicated build uses the existing toolchain allowlist, four-GiB resource
gate, competing-process check, exclusive build lock, source snapshots and
bounded Gradle execution. It passes no placeholder configuration. Existing
QA/Dev public-key requirements, release signing and offline Preview stay intact.
Its precise package identity must also be Android-debuggable to use the local
LAN adapter. It grants no lease or motor permission automatically.
Native C++ uses `CMAKE_BUILD_TYPE=RelWithDebInfo` (including `NDEBUG`) to match the
release dependency fallback and the existing QA native configuration. Android
debuggability alone would otherwise select incompatible Debug C++ symbols.

Create a fresh directory below `artifacts/release-readiness`, then use the
documented JBR21 and Android SDK paths for the owned process only:

```powershell
$env:JAVA_HOME = 'D:/Android/Android Studio/jbr'
$env:ANDROID_HOME = 'D:/Android/Sdk'
$env:DOSO_SDK_ROOT = 'D:/inovxio/brain/DOSO-SDK'
$env:CARGO_HOME = "$env:USERPROFILE/.cargo"
$env:RUSTUP_HOME = "$env:USERPROFILE/.rustup"
$env:PROTOC = 'C:/toolchains/protobuf/bin/protoc.exe' # actual compiler path
node scripts/android-local-test.mjs --build artifacts/release-readiness/<fresh-run>
```

Before installation, verify the independently named package, debug certificate,
arm64 WebRTC library, normal-entry embedded bundle, and zero source drift.
The build script does not install or start the App. Keep the original packages
and evidence. The local manifest keeps networking and local hardware permissions,
allows explicitly selected LAN HTTP, and omits production authentication links.
Do not distribute this debug package as a production release.

Test the login page's honest unconfigured state and guest entry first, then
open local device testing without enabling motors. Real robot connection,
telemetry, video, movement, disconnect recovery and account acceptance are
distinct results; no UI preview or installation can substitute for them.

## 2026-11-04: G20 local-use acceptance

The selected test device is G20. Preserve its existing QA/Dev installation and
data; install this independently named localtest package alongside them. Record
the actual APK identity, G20 model, robot endpoint and observation time.

1. Open the normal App entry, enter guest mode, then choose **本地使用**. No
   account binding or claim-code entry is required for this route.
2. Select an independently authorized local connection. TLS uses the existing
   client identity; controlled LAN development access remains restricted to the
   supported debuggable test package and robot network allowlist. Merely finding
   an IP address does not grant access.
3. Read the real robot's current runtime state and update time. Do not acquire a
   control lease, enable motors or test joystick/motion commands. Record absent
   fields as unavailable; the current cloud status source does not provide battery
   level or location.
4. Verify background/foreground behavior and manual reconnection. Old values
   must not appear fresh after disconnection. Check Android Back and the App exit
   route; an unconfirmed safety stop must remain visible rather than report a
   successful exit.
5. Keep separate outcomes for package verification, G20 UI, local robot reads
   and reconnect/exit behavior. A missing device leaves the corresponding item
   pending, even if the package and code checks pass.

## Next: real remote-state acceptance

Use the cloud-configured QA package for this stage; localtest cannot validate
account login, cloud device ownership or remote-state settings. Coordinate the
following robot/cloud work with the RM500U-CNV task using the existing
`D:/DOSO/robot-cloud/deploy/AGENT.md` procedure:

1. Verify the restored robot and its existing runtime, build and validate the
   matching loopback-only `127.0.0.1:13146` status endpoint, then install the
   candidate ARM64 Agent. Keep collection disabled until the user opts in.
2. Resolve this device's authorized cloud identity, then verify a real status
   report through MQTT, Gateway and the business API. Use the existing single
   device enrollment path; do not make bulk factory administration a prerequisite.
3. In the actual account on G20, verify default-off, user enable, device
   confirmation, advancing collection timestamps and continued reporting when
   the App is in the background. A submitted request alone is not confirmation.
4. Disconnect and restore the robot network. Show stale data during the outage
   and verify recovery without inventing a physical power-off state.
5. Disable remote management. Verify immediate cloud rejection of old reports,
   then the device's stop acknowledgement; pending acknowledgement must remain
   distinguishable from confirmed stopped collection.

The first end-to-end acceptance uses Wi-Fi. Repeat the same flow over 5G after
Wi-Fi passes. Map upload/download and video remain separately authorized work.

## Latest observed result: 2026-11-04

- Built and retained `releases/20261104/DOSO-0.0.1-localtest-26858e25.apk`
  (versionCode 47), then installed it alongside the existing packages on G20
  (Android 13, arm64-v8a). Package, debug signature, native library, embedded
  normal-entry bundle and unchanged build inputs were verified.
- Real G20 checks passed: cold launch without Metro; guest to local use without
  login or a claim code; honest failed-connection message; Android Back and
  in-App Back to guest; foreground return showing connection checks paused.
- `192.168.66.64` did not respond to SSH, and G20's local read reported that the
  connection was not established. No real status, connected-session exit/stop
  acknowledgement, motion, cloud or 5G acceptance is claimed.
- Evidence: `artifacts/release-readiness/20261104-local-use-native-qa-140432/`
  contains `result.json`, `apk-verification.json`, `g20-acceptance.json`, UI dumps
  and screenshots. Earlier failed attempts and their diagnoses are preserved in
  their separate directories.
