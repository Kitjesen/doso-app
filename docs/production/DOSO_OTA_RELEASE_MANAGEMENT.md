# DOSO OTA release management

Updated: 2026-11-14

DOSO needs two version numbers because the updater and the robot software have
different lifecycles.

| Version | Owner | Meaning | Where it appears |
| --- | --- | --- | --- |
| `agentVersion` | OTA agent build | Version of the Rust `doso-ota` executable | `/health`, diagnostics, acceptance record |
| `version` | Release pipeline | Version of the Brainstem/policy bundle installed on the robot | Signed manifest, App OTA page, robot job |

Every release also receives:

- `releaseId`: immutable identifier; never reuse it for different bytes;
- `sequence`: monotonically increasing anti-rollback number;
- `channel`: `dev`, `qa`, or `stable`;
- `model` and `hardwareRevision`: target hardware boundary;
- `minimumBootloaderVersion` and `minimumBrainstemVersion`: dependency gates;
- `artifactSizeBytes` and `artifactSha256`: exact payload identity;
- `keyId`, signature, expiry, and automatic rollback policy.

The release pipeline should create a release in this order:

1. build Brainstem and the matching policy package from a recorded source revision;
2. assemble one immutable bundle and calculate its SHA-256 and byte size;
3. assign a SemVer `version`, a new `releaseId`, and the next `sequence`;
4. publish the unsigned candidate to the `dev` channel;
5. sign the manifest in a separate signing step; the private key never enters the App or robot;
6. deploy to a small QA ring and record download, install, health, and rollback evidence;
7. promote the exact same digest to `qa` and then `stable`; promotion changes metadata, not artifact bytes;
8. pause or revoke the release if health or field telemetry crosses the release threshold.

The device accepts a release only when the signature, expiry, channel, target
hardware, dependencies, battery, task state, version, sequence, artifact size,
and SHA-256 all pass. A release job is durable and idempotent. A successful
health proof records the agent version, bundle version, release ID, boot ID,
active slot, last-known-good slot, job ID, and timestamps.

The minimum management records are:

```text
release:
  releaseId, version, sequence, channel, manifestDigest, artifactDigest
  sourceRevision, buildTime, signerKeyId, compatibility, rollbackPolicy

deployment:
  deploymentId, releaseId, deviceId, ring, requestedBy, requestedAt
  startedAt, finishedAt, phase, result, failureReason

device acceptance:
  deviceId, agentVersion, brainstemVersion, bootIds, activeSlot
  lastKnownGoodSlot, calibrationDigest, canMappingDigest, timestamps
```

The first release channels should be `dev → qa → stable`. Do not let the App
choose an arbitrary URL or upload an OTA package. The App asks the domestic
release service for an authorized release/job, then reads the job state from
the robot management plane.

## Product-level assessment

The current Rust Agent has a product-oriented device-side core: signed
manifests, compatibility gates, resumable download, exact hash/size checks,
inactive-slot installation, health evidence, and rollback states. It is
appropriate to call this a **product-grade implementation slice**.

It is not yet a product-grade OTA service for shipping a fleet. The remaining
release gates are the domestic release service, immutable OSS storage, signing
key custody and rotation, deployment rings, revocation/pausing, real ARM64
builds, bootloader/Brainstem slot integration, and one-robot destructive
rollback acceptance. Until those are observed, the App must keep the production
OTA entry closed.

The architecture is intentionally smaller than a full Mender/RAUC/TUF stack.
That is suitable for the first Brainstem bundle, but kernel, bootloader, motor
firmware, and fleet-scale rollout should not be added to this first artifact.
