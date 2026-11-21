# DOSO OTA implementation plan

Updated: 2026-11-14

This is the implementation contract for the first real OTA slice. The existing TypeScript lifecycle model and simulator remain development assets; the production gate stays closed until the three real pieces below are implemented and observed on one robot.

## First update object

The first production OTA updates:

1. the Brainstem application bundle;
2. a compatible policy package selected by that Brainstem build.

The first slice does not update the host kernel, bootloader, CAN driver, motor firmware, or arbitrary user files. Those are separate release objects with different recovery requirements.

## Three pieces to implement

## Code ownership and implementation language

The current OTA code is TypeScript in the App repository:

- `src/domain/firmware-lifecycle/index.ts`: immutable lifecycle reducer and A/B semantics;
- `iot/simulator/firmware-lifecycle-simulator.ts`: signed-manifest and failure-path simulator;
- `src/features/robot-lifecycle/firmwareUpdateGateway.ts`: App gateway seam and presentation model;
- `src/screens/FirmwareUpdateScreen.tsx`: App UI.

The Rust workspace at `D:\DOSO\robot-cloud` contains `doso-cloud-link`, cloud Gateway, telemetry, shared cloud protocols, and the separate `ota` package. The robot-side OTA agent is the Rust binary `doso-ota`, because it needs filesystem safety, resumable I/O, signature verification, process supervision, and A/B or immutable-release switching. It is not added to `doso-cloud-link` and does not make the Brainstem motion service replace its own executable.

The App TypeScript reducer and the Rust agent will implement the same wire contract at two different trust boundaries. They must share manifest field names, proof binding, slot semantics, and error meanings; they must not share a second transport or let the App become the installer.

### 1. Release service

The domestic backend publishes an immutable signed release manifest and stores the artifact in private object storage. The App receives a short-lived artifact reference through an authenticated device job; it never receives a signing private key and does not upload or install the artifact itself.

There is no OTA mount or remote artifact deployment in the current repository. The following locations are the planned production layout, not current evidence:

```text
Aliyun OSS private bucket
  /firmware/{channel}/{model}/{releaseId}/manifest.json
  /firmware/{channel}/{model}/{releaseId}/brainstem.bundle
        │ short-lived signed URL issued by the domestic release service
        ▼
Robot update agent
  /var/lib/doso-ota/staging/{jobId}/artifact
  /opt/doso/releases/{version}/
  /opt/doso/current -> /opt/doso/releases/{version}/
  /opt/doso/last-known-good -> /opt/doso/releases/{version}/
```

The App does not mount OSS and does not download the firmware into App storage. The robot agent downloads to its own staging directory, verifies the artifact, and atomically switches an immutable release directory or inactive A/B slot.

Required manifest fields:

- `manifestVersion`, `releaseId`, monotonic `sequence`, semantic `version`;
- target model and hardware revision;
- minimum bootloader and Brainstem dependency versions;
- artifact size and SHA-256;
- signature and key identifier;
- rollback mode and health-check deadline;
- release channel and expiry.

Required job operations:

```text
GET  /v1/devices/{deviceId}/firmware/releases
POST /v1/devices/{deviceId}/firmware/jobs
GET  /v1/devices/{deviceId}/firmware/jobs/{jobId}
POST /v1/devices/{deviceId}/firmware/jobs/{jobId}/cancel
```

The job is bound to the authenticated user, device authorization epoch, release ID, and one idempotency key. Repeating the same request returns the same job. A different release cannot run while a job is active.

### 2. Robot update agent

The robot needs a management-plane update agent separate from the motion executor. It may use the existing authenticated device channel, but it must not accept arbitrary shell commands and must not make Brainstem responsible for replacing its own running process.

The agent must:

1. read the device ID, model, hardware revision, bootloader, active slot, current version, boot ID, power state, task state, and last-known-good version;
2. verify the manifest signature with a device-installed public key;
3. reject wrong device/model/hardware, expired or downgraded releases, bad dependencies, low or unknown power, active tasks, and a second concurrent job;
4. download to a temporary file with a resumable chunk journal;
5. verify the exact size and SHA-256 before installation;
6. install into the inactive immutable version directory or A/B slot;
7. switch atomically and restart only the update object;
8. publish a new boot ID and a signed health proof containing device, release, job, slot, version, sequence, and receive time;
9. return to the last-known-good slot when startup, Brainstem protocol, CAN read-only, strategy load, or health checks fail;
10. enter `recovery_required` when the verified rollback path itself fails.

The update agent must preserve calibration, network configuration, device identity, account binding, and user data. It must never report success from process start or port-open alone.

### 3. App production adapter

The App should replace the current unavailable page only after the release service and robot update agent provide the above contract. The App adapter should expose a small interface:

```text
inspect(deviceId) -> device profile + current release + eligibility
start(deviceId, releaseId, idempotencyKey) -> job
read(jobId) -> phase, progress, result, proof summary
cancel(jobId) -> accepted only while scheduled/downloading
```

The existing `FirmwareLifecycleState`, manifest validation, phase labels, progress rules, and rollback presentation remain the App state model. The production adapter supplies real events and never calls the simulated gateway. The firmware screen stays disabled when the adapter is absent.

Download progress must be based on received bytes, not fixed demo percentages. The adapter reports `downloadedBytes`, `totalBytes`, and `remainingBytes`; the UI may derive a percentage for accessibility but displays byte counts as the primary progress evidence.

## State and evidence contract

The production job must use the existing phase semantics:

```text
scheduled → downloading → verifying → installing → rebooting
          → health_checking → succeeded
                              ↘ rollback_pending → rolling_back → rolled_back
                                                            ↘ recovery_required
```

Every event carries the job ID, device ID, release ID, monotonically increasing progress sequence, and server or device receive time. A late event, old boot ID, old authorization epoch, or mismatched slot must not revive a terminal job.

The first real single-robot acceptance is:

1. inspect current state and preserve a backup of the current release metadata;
2. start a signed Brainstem/policy release while the robot is idle and physically safe;
3. interrupt the download and resume it from the journal;
4. complete a successful inactive-slot install and health proof;
5. repeat with a deliberately bad artifact hash and confirm rejection before install;
6. repeat with a health failure and confirm automatic rollback;
7. repeat with a rollback failure and confirm `recovery_required` without claiming success;
8. restart the App and query the same job ID to confirm the result is durable;
9. verify CAN mapping, calibration, network, identity, account binding, and user data after every successful or rolled-back run.

The acceptance record must include App version, robot update-agent version, Brainstem version, manifest digest, artifact digest, device ID, job ID, boot IDs, active/last-known-good slots, and timestamps. No motor enable or motion command is part of OTA acceptance.

## Current code status

- `src/domain/firmware-lifecycle/index.ts` contains the immutable state reducer, manifest compatibility checks, monotonic progress, A/B slot model, health proof binding, and rollback states.
- `iot/simulator/firmware-lifecycle-simulator.ts` exercises the signed manifest and failure paths.
- `src/features/robot-lifecycle/firmwareUpdateGateway.ts` and `FirmwareUpdateScreen.tsx` preserve the development-only simulation and fail closed for production.
- `robotCapabilityReadiness.ts` correctly keeps production OTA unavailable until trusted evidence exists.

## Robot-side implementation added 2026-11-14

The Rust workspace now contains an independent `ota` member at
`D:/DOSO/robot-cloud/ota`. It is not part of `doso-cloud-link` or
Brainstem. The crate currently implements the local installer and a loopback
management API:

- Ed25519 signed manifest decoding and compatibility checks;
- release sequence and semantic-version monotonicity;
- device model, hardware, bootloader, Brainstem, online, task, and battery gates;
- resumable signed-URL download with a byte journal;
- exact size and SHA-256 verification;
- inactive-slot installation and durable slot pointers;
- allow-listed Brainstem systemd restart;
- Brainstem, strategy, CAN read-only, and boot health evidence;
- device-signature verification for the health proof, including boot ID, release, and version;
- automatic switch to last-known-good and `recovery_required` when rollback health fails;
- durable job status and cancel endpoint;
- loopback API at `127.0.0.1:13147` with optional bearer token.

The crate has local tests for signature rejection, compatibility gates, resumable
download, exact hash/size checks, A/B installation, and successful health
commit. `cargo test -p doso-ota` is the reproducible check.

This is source-level implementation plus local tests. It is not yet a real
robot deployment: the release service/OSS signed URL, public-key installation,
Brainstem health endpoint, strategy marker, CAN read-only marker, and a real
robot rollback run still need to be configured and observed before the App
production gate can be opened.

The Windows development build is at
`D:/DOSO/robot-cloud/target/release/doso-ota.exe` and is only a host
artifact. The ARM64 robot binary still needs the Linux cross-linker
`aarch64-linux-gnu-gcc`; no Windows executable is treated as a robot package.

Version and release promotion rules are recorded in
[`DOSO_OTA_RELEASE_MANAGEMENT.md`](DOSO_OTA_RELEASE_MANAGEMENT.md).

国内 ECS、OSS、HTTPS 和发布 API 的正式部署边界记录在
[`DOSO_OTA_DOMESTIC_DEPLOYMENT.md`](DOSO_OTA_DOMESTIC_DEPLOYMENT.md)。

The missing implementation is outside the current App-only simulator: release storage/signing, the robot update agent, its real device job transport, and one physical robot with A/B or equivalent boot rollback. Until those exist, the production OTA entry must remain unavailable rather than display a simulated success.
