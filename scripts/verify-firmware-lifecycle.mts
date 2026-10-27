interface Assertions { equal(actual: unknown, expected: unknown): void; ok(value: unknown): asserts value; throws(run: () => unknown, pattern: RegExp): void }
const assert: Assertions = {
  equal(actual, expected) { if (!Object.is(actual, expected)) throw new Error(`expected ${String(expected)}, received ${String(actual)}`); },
  ok(value): asserts value { if (!value) throw new Error("expected truthy value"); },
  throws(run, pattern) { try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; } throw new Error(`expected ${pattern}`); },
};
// @ts-expect-error Node type stripping requires explicit TypeScript extensions.
import { FirmwareLifecycleSimulator, type FirmwareSimulatorOptions } from "../iot/simulator/firmware-lifecycle-simulator.ts";
// @ts-expect-error Node type stripping requires explicit TypeScript extensions.
import { reduceFirmwareLifecycle, type FirmwareManifest } from "../src/domain/firmware-lifecycle/index.ts";

type Test = { name: string; run: () => void };
const tests: Test[] = []; const test = (name: string, run: () => void): void => { tests.push({ name, run }); };
const payload = new TextEncoder().encode("firmware-image-v2-with-two-chunks");
const defaults: FirmwareSimulatorOptions = { deviceId: "robot-alpha", model: "Doso-R1", hardwareRevision: "rev-c", bootloaderVersion: "1.4.0", installedVersion: "0.0.1", batteryPercent: 80, online: true, taskRunning: false };
const fixture = (options: Partial<FirmwareSimulatorOptions> = {}) => new FirmwareLifecycleSimulator({ ...defaults, ...options });
const release = (simulator: FirmwareLifecycleSimulator, overrides = {}) => simulator.createSignedManifest({ releaseId: "release-001", version: "0.0.2", sequence: 1, payload, ...overrides });
const scheduleAndDownload = (simulator: FirmwareLifecycleSimulator): void => { simulator.schedule(release(simulator)); simulator.downloadChunk(0, payload); simulator.startVerification(); simulator.finishVerification(); };
const corruptSignature = (value: string): string => `${value[0] === "x" ? "y" : "x"}${value.slice(1)}`;

test("success traverses explicit OTA phases and becomes irreversible", () => {
  const simulator = fixture(); const phases: string[] = [];
  phases.push(simulator.schedule(release(simulator)).phase);
  phases.push(simulator.downloadChunk(0, payload).phase);
  phases.push(simulator.startVerification().phase); simulator.finishVerification();
  phases.push(simulator.install().phase); phases.push(simulator.reboot().phase);
  phases.push(simulator.startHealthCheck().phase); phases.push(simulator.finishHealthCheck({ healthy: true }).phase);
  assert.equal(phases.join(","), "scheduled,downloading,verifying,installing,rebooting,health_checking,succeeded");
  assert.equal(simulator.snapshot().activeSlot, "B"); assert.equal(simulator.snapshot().slots.B.verified, true);
  assert.throws(() => simulator.cancel(), /terminal/);
});

test("chunk journal resumes the same job after disconnect and installs once", () => {
  const simulator = fixture(); simulator.schedule(release(simulator)); const split = 12;
  simulator.downloadChunk(0, payload.slice(0, split)); const before = simulator.snapshot(); assert.equal(before.downloadOffset, split);
  simulator.setOnline(false); assert.throws(() => simulator.downloadChunk(split, payload.slice(split)), /online/); assert.equal(simulator.snapshot().downloadOffset, split);
  simulator.setOnline(true); simulator.downloadChunk(split, payload.slice(split)); assert.equal(simulator.snapshot().downloadJournal.length, 2);
  simulator.startVerification(); simulator.finishVerification(); simulator.install(); simulator.install(); assert.equal(simulator.snapshot().installCount, 1);
});

test("tampered device health proof cannot report OTA success", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); simulator.startHealthCheck();
  assert.equal(simulator.finishHealthCheck({ healthy: true, tamperSignature: true }).phase, "rolled_back");
  assert.equal(simulator.snapshot().installedVersion, "0.0.1");
});

test("health-check deadline automatically rolls back to last-known-good", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); const checking = simulator.startHealthCheck();
  assert.ok(checking.healthDeadlineMs); simulator.advanceTime(29_999); assert.equal(simulator.snapshot().phase, "health_checking");
  assert.equal(simulator.advanceTime(2).phase, "rolled_back"); assert.equal(simulator.snapshot().activeSlot, "A");
});

test("a health success arriving at or after its deadline cannot win the timeout race", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); const checking = simulator.startHealthCheck();
  assert.ok(checking.healthDeadlineMs); simulator.setNowMs(checking.healthDeadlineMs);
  const result = simulator.finishHealthCheck({ healthy: true }); assert.equal(result.phase, "rolled_back"); assert.equal(result.installedVersion, "0.0.1");
});

test("a late health proof cannot backdate its device observation to bypass the receive deadline", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); const checking = simulator.startHealthCheck();
  assert.ok(checking.healthDeadlineMs);
  simulator.setNowMs(checking.healthDeadlineMs + 1);
  const result = simulator.finishHealthCheck({ healthy: true, proofOverrides: { checkedAtMs: checking.healthDeadlineMs - 1 } });
  assert.equal(result.phase, "rolled_back");
  assert.equal(result.installedVersion, "0.0.1");
});

test("health failure automatically rolls back only to verified last-known-good slot", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); simulator.startHealthCheck();
  assert.equal(simulator.finishHealthCheck({ healthy: false }).phase, "rolled_back"); assert.equal(simulator.snapshot().activeSlot, "A"); assert.equal(simulator.snapshot().installedVersion, "0.0.1");
});

test("rollback failure or invalid proof enters irreversible recovery-required state", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install();
  assert.equal(simulator.failInstall({ rollbackSucceeds: false }).phase, "recovery_required"); assert.throws(() => simulator.finishRollback(true), /terminal/);
  const forged = fixture(); scheduleAndDownload(forged); forged.install();
  assert.equal(forged.failInstall({ tamperRollbackProof: true }).phase, "recovery_required");
});

test("validly signed health proofs are bound to the current job boot slot version and sequence", () => {
  const invalidProofs = [
    { deviceId: "robot-other" },
    { releaseId: "release-other" },
    { jobKey: "robot-alpha\u0000release-other" },
    { progressSequence: 999 },
    { bootId: "boot-stale" },
    { activeSlot: "A" as const },
    { version: "0.0.1" },
  ];
  for (const proofOverrides of invalidProofs) {
    const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); simulator.startHealthCheck();
    const result = simulator.finishHealthCheck({ healthy: true, proofOverrides });
    assert.equal(result.phase, "rolled_back");
    assert.equal(result.installedVersion, "0.0.1");
  }
});

test("device-release idempotency, concurrent release rejection and monotonic progress hold", () => {
  const simulator = fixture(); const signed = release(simulator); const first = simulator.schedule(signed); const duplicate = simulator.schedule(signed);
  assert.equal(first.jobKey, "robot-alpha\u0000release-001"); assert.equal(duplicate.progressSequence, first.progressSequence);
  const other = simulator.createSignedManifest({ releaseId: "release-002", version: "0.0.3", sequence: 2, payload });
  assert.throws(() => simulator.schedule(other), /concurrent/);
  const sequences = [simulator.snapshot().progressSequence, simulator.downloadChunk(0, payload.slice(0, 4)).progressSequence, simulator.downloadChunk(4, payload.slice(4)).progressSequence];
  assert.ok(sequences[0] < sequences[1] && sequences[1] < sequences[2]);
});

test("a completed job can create the next OTA job without losing release or A/B history", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); simulator.startHealthCheck(); simulator.finishHealthCheck({ healthy: true });
  const ready = simulator.beginNextJob(); assert.equal(ready.phase, "idle"); assert.equal(ready.lastReleaseSequence, 1); assert.equal(ready.activeSlot, "B"); assert.equal(ready.lastKnownGoodSlot, "B");
  const nextPayload = new TextEncoder().encode("firmware-image-v3");
  const next = simulator.createSignedManifest({ releaseId: "release-002", version: "0.0.3", sequence: 2, payload: nextPayload });
  assert.equal(simulator.schedule(next).phase, "scheduled"); simulator.downloadChunk(0, nextPayload); simulator.startVerification(); simulator.finishVerification();
  assert.equal(simulator.install().targetSlot, "A"); simulator.reboot(); simulator.startHealthCheck();
  const completed = simulator.finishHealthCheck({ healthy: true }); assert.equal(completed.phase, "succeeded"); assert.equal(completed.installedVersion, "0.0.3"); assert.equal(completed.lastReleaseSequence, 2); assert.equal(completed.activeSlot, "A");
});

test("cancel is allowed only while scheduled or downloading", () => {
  for (const downloaded of [false, true]) { const simulator = fixture(); simulator.schedule(release(simulator)); if (downloaded) simulator.downloadChunk(0, payload.slice(0, 2)); assert.equal(simulator.cancel().phase, "cancelled"); assert.throws(() => simulator.schedule(release(simulator)), /terminal/); }
  const verifying = fixture(); verifying.schedule(release(verifying)); verifying.downloadChunk(0, payload); verifying.startVerification(); assert.throws(() => verifying.cancel(), /only scheduled or downloading/);
});

test("install and reboot failures automatically finish rollback", () => {
  const install = fixture(); scheduleAndDownload(install); install.install(); assert.equal(install.failInstall().phase, "rolled_back");
  const reboot = fixture(); scheduleAndDownload(reboot); reboot.install(); reboot.reboot(); assert.equal(reboot.failReboot().phase, "rolled_back");
});

test("install and reboot are bound to the active boot and install retry is reducer-idempotent", () => {
  const simulator = fixture();
  scheduleAndDownload(simulator);
  const activeBootId = simulator.snapshot().activeBootId!;
  assert.throws(() => simulator.install("forged-boot"), /active boot|boot identity/);
  assert.equal(simulator.snapshot().phase, "verifying");

  const installed = simulator.install(activeBootId);
  const reducerRetry = reduceFirmwareLifecycle(installed, {
    type: "install",
    progressSequence: installed.progressSequence,
    releaseId: installed.manifest!.releaseId,
    currentBootId: activeBootId,
  });
  assert.equal(reducerRetry, installed);
  assert.throws(() => reduceFirmwareLifecycle(installed, {
    type: "install",
    progressSequence: installed.progressSequence + 1,
    releaseId: installed.manifest!.releaseId,
    currentBootId: activeBootId,
  }), /idempotency conflict/);
  assert.throws(() => simulator.install("forged-boot"), /idempotency|boot identity/);
  const retried = simulator.install(activeBootId);
  assert.equal(retried.phase, "installing");
  assert.equal(retried.installCount, 1);
  assert.equal(retried.progressSequence, installed.progressSequence);

  assert.throws(() => simulator.reboot(activeBootId), /must change|boot identity/);
  assert.equal(simulator.snapshot().phase, "installing");
  const rebooted = simulator.reboot();
  assert.equal(rebooted.phase, "rebooting");
  assert.equal(rebooted.activeBootId === activeBootId, false);
});

test("release sequence may skip forward and signed manifest battery policy is enforced", () => {
  const simulator = fixture(); scheduleAndDownload(simulator); simulator.install(); simulator.reboot(); simulator.startHealthCheck(); simulator.finishHealthCheck({ healthy: true }); simulator.beginNextJob();
  const skipped = simulator.createSignedManifest({ releaseId: "release-005", version: "0.0.5", sequence: 5, payload, minimumBatteryPercent: 75 });
  assert.equal(simulator.schedule(skipped).lastReleaseSequence, 5);

  const lowBattery = fixture({ batteryPercent: 70 });
  const demanding = lowBattery.createSignedManifest({ releaseId: "release-005", version: "0.0.5", sequence: 5, payload, minimumBatteryPercent: 75 });
  assert.throws(() => lowBattery.schedule(demanding), /battery/);
});

test("manifest trust, schema, compatibility, artifact and operational gates fail closed", () => {
  const simulator = fixture(); const signed = release(simulator); assert.throws(() => simulator.schedule({ ...signed, signatureB64url: corruptSignature(signed.signatureB64url) }), /signature/);
  const cases: Array<[Partial<FirmwareManifest>, RegExp]> = [[{ manifestVersion: 2 }, /manifest version/], [{ issuedAtMs: 1_900_000_000_000 }, /issued/], [{ models: ["Other"] }, /model/], [{ hardwareRevisions: ["rev-z"] }, /hardware/], [{ minimumBootloaderVersion: "2.0.0" }, /bootloader/], [{ minimumBatteryPercent: 101 }, /battery/], [{ expiresAtMs: 1 }, /expired/], [{ sha256: "bad" }, /metadata/], [{ sizeBytes: 0 }, /metadata/], [{ rollbackPolicy: { mode: "manual", healthTimeoutMs: 30_000 } }, /rollback policy/]];
  for (const [override, pattern] of cases) { const candidate = fixture(); const base = release(candidate); assert.throws(() => candidate.schedule(candidate.signManifest({ ...base.manifest, ...override })), pattern); }
  for (const [options, pattern] of [[{ batteryPercent: 29 }, /battery/], [{ online: false }, /online/], [{ taskRunning: true }, /task/]] as const) { const candidate = fixture(options); assert.throws(() => candidate.schedule(release(candidate)), pattern); }
  for (const batteryPercent of [Number.NaN, Number.POSITIVE_INFINITY, -1, 101]) { const candidate = fixture({ batteryPercent }); assert.throws(() => candidate.schedule(release(candidate)), /battery/); }
  const unsafeClock = fixture(); const clockManifest = release(unsafeClock); unsafeClock.setNowMs(Number.NaN); assert.throws(() => unsafeClock.schedule(clockManifest), /clock/);
  const tampered = fixture(); const changed = payload.slice(); changed[0] ^= 0xff; tampered.schedule(release(tampered)); tampered.downloadChunk(0, changed); tampered.startVerification();
  const failed = tampered.finishVerification(); assert.equal(failed.phase, "failed"); assert.equal(failed.failure?.code, "artifact_hash_mismatch");
  assert.equal(failed.activeSlot, "A"); assert.equal(failed.installedVersion, "0.0.1"); assert.throws(() => tampered.install(), /terminal/);
});

let passed = 0; console.log("SIMULATED FIRMWARE LIFECYCLE VERIFICATION");
for (const entry of tests) { try { entry.run(); passed += 1; console.log(`SIMULATED PASS ${entry.name}`); } catch (error) { console.error(`SIMULATED FAIL ${entry.name}`); throw error; } }
console.log(`SIMULATED SUMMARY ${passed}/${tests.length} PASS, 0 FAIL`);
