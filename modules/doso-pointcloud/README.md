# Android point-cloud view

`DosoPointCloud` is an Expo native view containing Android OpenGL ES 2 rendering.
It receives XYZ through `doso_sdk_android`, which uses the existing Rust SDK's
gRPC point-cloud subscription and decoder. Point arrays remain in native code;
JavaScript receives only status and point counts. Drag rotates, pinch zooms.

Build with `DOSO_SDK_ROOT` set to the DOSO-SDK checkout (or Gradle
`-PdosoSdkRoot=...`). `preBuild` invokes its `android/build.ps1` using the NDK
selected by the App and packages the generated ARM64 shared library. The build
host needs Cargo, the `aarch64-linux-android` target, protoc, and the Android NDK.
Windows builds use PowerShell; Linux/macOS builds use the SDK's Bash script.
No binary is checked into this module.

The current native library supports `arm64-v8a`. Other APK ABIs and APKs without
the library report unavailable instead of loading JNI. Production cleartext
is rejected. QA LAN follows the existing QA/dev/localtest build identities,
private IPv4 restriction and Android `NetworkSecurityPolicy`.

View props are `endpoint` (the SDK gRPC origin), `kind` (1 map, 2 scan), and
`active`. `onStatus` emits `{status, message, points}`. The owner must choose
the actual SDK endpoint; the Web Gateway's 5050 origin is not interchangeable
with the default gRPC 5052 listener. HTTPS uses the Rust SDK's trust settings;
it does not inherit Brainstem KeyChain/mTLS identities.

Detach, background, prop changes and destruction cancel the native session
and clear displayed data. Stale and terminal error states clear geometry.
Cached first frames are not proof of current sensor freshness. Rendering and
physical G20 performance require device acceptance after the native build.
