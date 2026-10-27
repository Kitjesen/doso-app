# Pinned Skydroid RCSDK

The local Maven artifact is the unmodified official `app/libs/rcsdk-v1.9.2.aar` from
Skydroid's public [RCSDK demo](https://gitee.com/skydroid/rcsdk-demo), commit
`d9c6bcab8bb9993cd16f117c01a7601dce10ea6a`.

- Bytes: 2,209,790
- SHA-256: `e5977ba3292246bcee026defdb8563a18adc9d5573fdfb20a6880ee469f0fde2`
- Upstream Git blob: `e2c750b4b644f8af2f6b521c749172f2cd57840d`
- Supported JNI ABIs: `arm64-v8a`, `armeabi-v7a`

The generated POM only gives Gradle a stable local external-artifact identity;
the AAR bytes are not repackaged. This avoids unsupported direct local-AAR
dependencies in an Android library. No H16 airlink dependency is included.

Upstream publicly distributes this SDK for integration; its demo repository does
not declare a general open-source license. Retain this origin and review SDK
redistribution terms before public/store distribution. This is an internal QA integration.

The adapter performs only device detection, local RC connection/disconnection and
GET of channels/settings/control mode. It never calls KeyManager SET/ACTION.
`InternalKey.ONLY_CONNECT_RC` is a version-pinned, public process-local SDK flag:
the default starts airlink helpers as well; RC-only avoids that path. Changes to
that internal API require re-auditing the official AAR before upgrading.

Original SDK read examples and bytecode audit evidence remain under
`artifacts/research/20261025-g20-input/`. No vendor code is executed by local
unit/compile tests.

Dependency audit of the pinned classes (JDK `jdeps`) found no Gson, Fastjson,
Netty, OkHttp or Rx dependency. Android supplies `org.json` and `org.xmlpull.v1`;
Kotlin is supplied by the Expo Android build. Remaining external references are
`com.fishsemi.sdk.aircontrol`, `com.fishsemi.sdk.d2dcontrol`,
`com.skydroid.fpvplayer` and `org.apache.commons.net.ftp`, in other SDK airlink,
camera/video and upgrade paths. The official demo lists only AndroidX UI libraries,
this AAR and the documented optional H16 airlink AAR. DOSO does not include or
invoke those optional paths; this does not establish whole-SDK runtime completeness.
G20 local RC startup still needs device-side runtime validation.

Each published frame brackets the channel GET with two reads of settings/mode.
Mismatches stop the input run. This detects observed configuration races, not an
atomic device transaction: the SDK provides no configuration generation token.
Post-read latency does not extend the native 150 ms sample freshness limit.
