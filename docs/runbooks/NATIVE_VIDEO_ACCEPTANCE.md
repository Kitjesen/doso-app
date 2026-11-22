# Independent native video acceptance

`com.doso.robot.videotest` / **DOSO Video Test** is an explicitly isolated,
receive-only native build. It uses the production WHEP receiver, native
`RTCView`, freeze/reconnect and AppState release code. Its own entry does not
load the account provider, the normal App, control sessions or joystick input.
It reads the real Gateway bootstrap, capabilities, state and readiness before
viewing; `ready=false` is displayed honestly and does not imply motion readiness.

The standard QA/Dev public-configuration requirement and offline Preview remain
unchanged. This test has no cloud configuration and does not test accounts or
the production control-page binding. No placeholder key is supplied.

The build uses the same toolchain environment allowlist, four-GiB free-memory
minimum, competing-process check, exclusive build lock, input snapshots and
bounded Gradle execution as the normal build. It builds arm64 with an embedded
JS bundle, so no Metro is needed. It installs alongside Dev, QA and Preview.

Create a fresh directory below `artifacts/release-readiness`, then run:

```powershell
$env:JAVA_HOME = 'D:/Android/Android Studio/jbr'
$env:ANDROID_HOME = 'D:/Android/Sdk'
node scripts/android-video-test.mjs --build artifacts/release-readiness/<fresh-run>
```

Use the existing JBR 21 documented in `QA_SINGLE_BUILD.md`; JDK 24's Prefab
native-access warning is a known failure in the local Android toolchain. Set
these paths only for the owned build process, not globally.

Record the resulting APK identity and inspect the merged manifest before
installing. The manifest retains INTERNET and permits cleartext solely in this
test variant; shared URL validation restricts HTTP to explicit local addresses.
It has no production authentication deep links or BLE/location permissions.
Do not ship this package as a production release or store credentials in it.

Enter the verified real video Gateway origin, select **读取并观看**, and observe
the phase and changing picture. `receiving` is published only after decoded
frame counters advance. Stop, background, or leave to release; each run also
stops after 60 seconds. A gateway read, track or socket alone is not a playback
pass. Record the named target, APK, actual decoded playback, freeze/recovery and
consumer cleanup separately. Do not use this result as robot-motion acceptance.
