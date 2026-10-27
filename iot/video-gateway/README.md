# DOSO video gateway local preparation

Status: local preparation, not installed or launched. No robot/network access is performed by these files. Existing gRPC control is unchanged.

1. Run `sh inspect-camera-env.sh` on the robot Linux host after its power/network is restored. The script lists OS/architecture, device nodes, tools and local listeners. It does not capture frames, read credentials, contact another host, or start services.
2. Use the inventory to choose the actual USB capture node or IP-camera source. `/dev/video0` is not assumed: some nodes expose metadata or a different lens.
3. Follow [the staged runbook](../../docs/runbooks/ROBOT_VIDEO_SETUP.md). It separates camera verification, local H264 publishing and authenticated LAN readout.

`mediamtx.loopback.example.yml` binds RTSP/WebRTC only to 127.0.0.1; UDP ICE is loopback too. Its anonymous identity is limited to local IPs and one path. It has no camera/FFmpeg startup hooks. Other listeners, including MediaMTX's current default MoQ service, are explicitly disabled. No secret placeholders are included.

Do not turn this file into a public configuration by replacing listeners with `0.0.0.0`. LAN access requires a separate reviewed configuration with read-only viewer authentication, HTTPS signalling and the correct advertised robot address first. The installed MediaMTX version/architecture is unknown; fields are checked against the official v1.21.2 reference, not against a running binary.

Target media flow: actual camera → H264 without B-frames → local MediaMTX → video-only WebRTC/WHEP. This neither replaces the existing control transport nor grants movement authority. DOSO source now has a ControlVideoSurface host/status slot, but no actual receiver/provider, decoder or native WebRTC player. A WHEP URL alone cannot make the current APK play video. The user confirmed that the robot is powered off for now; two bounded SSH connection attempts timed out and no inventory script ran remotely. Wait for startup rather than retrying.

Primary sources, checked 2026-10-25: [configuration](https://mediamtx.org/docs/references/configuration-file), [WebRTC codec/connectivity](https://mediamtx.org/docs/features/webrtc-specific-features), [read with WHEP](https://mediamtx.org/docs/read/webrtc), [authentication](https://mediamtx.org/docs/features/authentication).

Local validation on 2026-10-25: existing Git `sh -n` accepted the inventory script (exit 0); the existing Node YAML parser accepted the template, and a read-only assertion confirmed all three listeners are loopback, eight other services are disabled, authentication is local-IP/path limited, and no startup hook is present. The script was not executed on a robot. MediaMTX is not installed or launched by this preparation; YAML parsing does not prove that an unknown installed MediaMTX version accepts the schema or that a camera/stream works.
