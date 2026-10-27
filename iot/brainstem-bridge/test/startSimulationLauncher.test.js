import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const launcher = path.resolve('tools/start-simulation.ps1');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runPowerShell(script, args = [], env = {}) {
  return spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 15_000,
    windowsHide: true,
  });
}

async function copiedLauncher() {
  const root = await mkdtemp(path.join(tmpdir(), 'doso-simulation-launcher-'));
  const script = path.join(root, 'start-simulation.ps1');
  const runtime = path.join(root, '.local-simulation');
  await copyFile(launcher, script);
  await mkdir(runtime);
  return { root, script, runtime };
}

function sleeper() {
  return spawn('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Seconds 60'], {
    stdio: 'ignore', windowsHide: true,
  });
}

test('launcher parses and keeps the 90 second yielding startup contract', async () => {
  const source = await readFile(launcher, 'utf8');
  assert.match(source, /\[int\]\$StartupTimeoutSeconds = 90/u);
  assert.equal((source.match(/AddSeconds\(\$StartupTimeoutSeconds\)/gu) ?? []).length, 2);
  assert.match(source, /Start-Sleep -Milliseconds 250/u);
  assert.match(source, /stop-\$instanceId\.requested/u);
  assert.match(source, /dartCreatedAt =/u);
  assert.match(source, /pythonCreatedAt =/u);

  const command = [
    '$tokens=$null; $errors=$null;',
    '[System.Management.Automation.Language.Parser]::ParseFile($env:DOSO_LAUNCHER_UNDER_TEST,[ref]$tokens,[ref]$errors) | Out-Null;',
    'if($errors.Count){$errors | ForEach-Object {$_.ToString()}; exit 1}',
  ].join(' ');
  const parsed = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8', env: { ...process.env, DOSO_LAUNCHER_UNDER_TEST: launcher }, windowsHide: true,
  });
  assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
});

test('stop signals a safe marker but never kills a reused or unrelated PID', async () => {
  const fixture = await copiedLauncher();
  const process = sleeper();
  try {
    await sleep(250);
    const marker = path.join(fixture.runtime, 'stop-test.requested');
    await writeFile(path.join(fixture.runtime, 'runtime.json'), JSON.stringify({
      schemaVersion: 2,
      stopFile: marker,
      dartPid: process.pid,
      pythonPid: process.pid,
      dartCreatedAt: '2000-01-01T00:00:00.000Z',
      pythonCreatedAt: '2000-01-01T00:00:00.000Z',
    }));
    const result = runPowerShell(fixture.script, ['-Stop']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(`${result.stdout}${result.stderr}`, /Skipped PID/u);
    assert.doesNotThrow(() => globalThis.process.kill(process.pid, 0));
    assert.equal(await readFile(marker, 'utf8'), '');
  } finally {
    process.kill();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('stop rejects an external marker and legacy metadata stays confined to stop.requested', async () => {
  const unsafe = await copiedLauncher();
  const unsafeProcess = sleeper();
  try {
    await sleep(250);
    const external = path.join(unsafe.root, 'outside.requested');
    await writeFile(path.join(unsafe.runtime, 'runtime.json'), JSON.stringify({
      stopFile: external, dartPid: unsafeProcess.pid,
    }));
    const rejected = runPowerShell(unsafe.script, ['-Stop']);
    assert.notEqual(rejected.status, 0);
    await assert.rejects(readFile(external), { code: 'ENOENT' });
    assert.doesNotThrow(() => globalThis.process.kill(unsafeProcess.pid, 0));
  } finally {
    unsafeProcess.kill();
    await rm(unsafe.root, { recursive: true, force: true });
  }

  const legacy = await copiedLauncher();
  const legacyProcess = sleeper();
  try {
    await sleep(250);
    await writeFile(path.join(legacy.runtime, 'runtime.json'), JSON.stringify({
      schemaVersion: 1, dartPid: legacyProcess.pid,
    }));
    const accepted = runPowerShell(legacy.script, ['-Stop']);
    assert.equal(accepted.status, 0, accepted.stderr || accepted.stdout);
    assert.doesNotThrow(() => globalThis.process.kill(legacyProcess.pid, 0));
    assert.equal(await readFile(path.join(legacy.runtime, 'stop.requested'), 'utf8'), '');
  } finally {
    legacyProcess.kill();
    await rm(legacy.root, { recursive: true, force: true });
  }
});
