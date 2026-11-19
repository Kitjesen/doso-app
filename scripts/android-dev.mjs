import { spawn, spawnSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync, writeFileSync, readFileSync, realpathSync, fstatSync, lstatSync } from 'node:fs';
import { dirname, join, relative, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createQaBuildEnvironment, parseQaPublishableInput, readNoEchoInput } from './qa-build-environment.mjs';
import { assessQaBuildReadiness, snapshotQaBuildInputs, QA_COMPETING_TASK_PREDICATE } from './qa-build-preflight.mjs';
import { createQaBuildCommand, executeQaBuild } from './qa-build-once.mjs';

export function debugCommand(root, environment) {
  const command = createQaBuildCommand(root, environment, 'C:/doso-build/android');
  command.args = ['-Xmx64m', '-Xms64m', '-Dorg.gradle.appname=gradlew', '-jar',
    'gradle/wrapper/gradle-wrapper.jar', ':app:assembleDebug', '-PreactNativeArchitectures=arm64-v8a',
    '--no-daemon', '--console=plain', '--max-workers=2', '--no-parallel'];
  return command;
}

async function main() {
  const [mode, destination] = process.argv.slice(2);
  if (process.argv.length !== 4 || !['--build', '--metro'].includes(mode)) throw Error('Use --build or --metro and a fresh evidence directory');
  const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
  const output = realpathSync(destination);
  const inside = relative(realpathSync(join(root, 'artifacts/release-readiness')), output);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw Error('Evidence directory required');
  writeFileSync(join(output, 'dev-attempt.json'), JSON.stringify({mode, startedAt:new Date().toISOString()}), {flag:'wx'});
  const config = parseQaPublishableInput(await readNoEchoInput());
  process.stdin.setRawMode(false); process.stdin.pause();
  const environment = createQaBuildEnvironment(process.env, config);
  environment.NODE_ENV = 'development';
  const probe = spawnSync(join(environment.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command', `$o=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop; $p=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ProcessId -ne ${process.pid} -and (${QA_COMPETING_TASK_PREDICATE}) }); @{freeMemoryKiB=[long]$o.FreePhysicalMemory; count=$p.Count}|ConvertTo-Json -Compress`],
    {env:environment,encoding:'utf8',windowsHide:true,timeout:15000});
  if (probe.status !== 0) throw Error('Resource probe failed');
  const resources = JSON.parse(probe.stdout);
  if (!Number.isSafeInteger(resources.count) || resources.count < 0 || resources.count > 10000) throw Error('Invalid resource observation');
  const assessment = assessQaBuildReadiness({freeMemoryKiB:resources.freeMemoryKiB,environment,
    competingProcesses:Array.from({length:resources.count},()=>({}))});
  writeFileSync(join(output,'preflight.json'),JSON.stringify(assessment,null,2));
  if (!assessment.ready) throw Error(`Preflight blocked: ${assessment.blockers.join(',')}`);
  if (mode === '--build') {
    const lockPath=join(root,'artifacts/release-readiness/qa-build-active.lock');
    const lock=openSync(lockPath,'wx');
    try {
      const before=snapshotQaBuildInputs(root,environment.DOSO_SDK_ROOT);
      const execution=await executeQaBuild(debugCommand(root,environment));
      const inputDrift=JSON.stringify(before)!==JSON.stringify(snapshotQaBuildInputs(root,environment.DOSO_SDK_ROOT));
      const result={execution,inputDrift,apk:null};
      if (!inputDrift && execution.outcome==='completed' && execution.exitCode===0 && execution.buildSuccessful) {
        const path=join(root,'android/app/build/outputs/apk/debug/app-debug.apk');
        const bytes=readFileSync(path);
        result.apk={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
      }
      writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2));
      console.log(JSON.stringify(result));
      if (!result.apk) process.exitCode=1;
    } finally {
      const owned=fstatSync(lock),current=lstatSync(lockPath);
      if (owned.ino===current.ino && owned.dev===current.dev) unlinkSync(lockPath);
      closeSync(lock);
    }
  } else {
    delete environment.CI;
    // adb reverse connects to IPv4 loopback; Windows may resolve localhost to ::1 first.
    const child=spawn(process.execPath,['--dns-result-order=ipv4first',join(root,'node_modules/expo/bin/cli'),'start','--dev-client','--localhost','--port','8084'],
      {cwd:root,env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const report = chunk => process.stdout.write(chunk.toString().split(config.publishableKey).join('[public-config]'));
    child.stdout.on('data',report);child.stderr.on('data',report);
    process.once('SIGINT',()=>child.kill());process.once('SIGTERM',()=>child.kill());
    await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code??1;resolve();});});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>{
    if(process.stdin.isTTY && process.stdin.isRaw)process.stdin.setRawMode(false);
    process.stdin.pause();
  });
}
