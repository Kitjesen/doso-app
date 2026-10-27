param(
  [switch]$Stop,
  [switch]$Wait,
  [ValidateRange(1, 600)]
  [int]$StartupTimeoutSeconds = 90,
  [string]$BrainstemRoot = '',
  [string]$Dart = '',
  [string]$Python = ''
)

$ErrorActionPreference = 'Stop'
$toolDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $toolDir '.local-simulation'
$stateFile = Join-Path $runtimeDir 'runtime.json'
$serverScript = Join-Path $toolDir 'local_sim_server.dart'
$simScript = Join-Path $toolDir 'local_mujoco_sim.py'

function Get-NormalizedPath([string]$PathValue) {
  return [IO.Path]::GetFullPath($PathValue).Replace('\', '/').TrimEnd('/').ToLowerInvariant()
}

function Get-ProcessRecord([int]$ProcessId) {
  return Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Get-ProcessCreatedAt($ProcessRecord) {
  if (-not $ProcessRecord -or -not $ProcessRecord.CreationDate) { return $null }
  try { return ([datetimeoffset]$ProcessRecord.CreationDate).ToUniversalTime().ToString('o') } catch { return $null }
}

function Test-TaskOwnedProcess([int]$ProcessId, [string]$ExpectedScript, [string]$ExpectedCreatedAt) {
  $record = Get-ProcessRecord -ProcessId $ProcessId
  if (-not $record -or -not $record.CommandLine) { return $false }
  $expected = Get-NormalizedPath -PathValue $ExpectedScript
  $matchesScript = $false
  foreach ($match in [regex]::Matches([string]$record.CommandLine, '"([^"]*)"|(\S+)')) {
    $token = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
    try {
      if ((Get-NormalizedPath -PathValue $token) -eq $expected) {
        $matchesScript = $true
        break
      }
    } catch {}
  }
  if (-not $matchesScript) { return $false }
  if ($ExpectedCreatedAt) {
    $actualCreatedAt = Get-ProcessCreatedAt -ProcessRecord $record
    if (-not $actualCreatedAt) { return $false }
    try {
      $expectedTime = ([datetimeoffset]$ExpectedCreatedAt).ToUniversalTime()
      $actualTime = ([datetimeoffset]$actualCreatedAt).ToUniversalTime()
      if ([math]::Abs(($actualTime - $expectedTime).TotalSeconds) -gt 1) { return $false }
    } catch { return $false }
  }
  return $true
}

function Resolve-SafeStopFile($Runtime) {
  $candidate = if ($Runtime.PSObject.Properties.Name -contains 'stopFile' -and $Runtime.stopFile) {
    [string]$Runtime.stopFile
  } else {
    Join-Path $runtimeDir 'stop.requested'
  }
  $full = [IO.Path]::GetFullPath($candidate)
  $parentIsSafe = (Get-NormalizedPath -PathValue ([IO.Path]::GetDirectoryName($full))) -eq (Get-NormalizedPath -PathValue $runtimeDir)
  $suffixIsSafe = [IO.Path]::GetFileName($full).EndsWith('.requested', [StringComparison]::OrdinalIgnoreCase)
  if (-not $parentIsSafe -or -not $suffixIsSafe) {
    throw 'Recorded simulation stop marker is outside the task runtime directory or is not a .requested marker.'
  }
  return $full
}

function Stop-TaskOwnedProcess([int]$ProcessId, [string]$ExpectedScript, [string]$ExpectedCreatedAt, [int]$WaitSeconds) {
  if (-not (Test-TaskOwnedProcess -ProcessId $ProcessId -ExpectedScript $ExpectedScript -ExpectedCreatedAt $ExpectedCreatedAt)) {
    Write-Warning "Skipped PID $ProcessId because its command line or creation time does not match the recorded task process."
    return
  }
  try {
    Wait-Process -Id $ProcessId -Timeout $WaitSeconds -ErrorAction Stop
  } catch {
    if (Test-TaskOwnedProcess -ProcessId $ProcessId -ExpectedScript $ExpectedScript -ExpectedCreatedAt $ExpectedCreatedAt) {
      Stop-Process -Id $ProcessId -ErrorAction SilentlyContinue
    } else {
      Write-Warning "Skipped force-stop for PID $ProcessId because process ownership changed while waiting."
    }
  }
}

if ($Stop) {
  if (-not (Test-Path -LiteralPath $stateFile)) {
    Write-Output 'No task-owned local simulation is recorded.'
    exit 0
  }
  $runtime = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
  $stopFile = Resolve-SafeStopFile -Runtime $runtime
  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  New-Item -ItemType File -Path $stopFile -Force | Out-Null
  if ($runtime.dartPid) {
    Stop-TaskOwnedProcess -ProcessId ([int]$runtime.dartPid) -ExpectedScript $serverScript `
      -ExpectedCreatedAt ([string]$runtime.dartCreatedAt) -WaitSeconds 10
  }
  if ($runtime.pythonPid) {
    Stop-TaskOwnedProcess -ProcessId ([int]$runtime.pythonPid) -ExpectedScript $simScript `
      -ExpectedCreatedAt ([string]$runtime.pythonCreatedAt) -WaitSeconds 10
  }
  Write-Output 'Completed the task-owned Brainstem local simulation stop request.'
  exit 0
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
if (Test-Path -LiteralPath $stateFile) {
  $old = Get-Content -Raw -LiteralPath $stateFile | ConvertFrom-Json
  $owned = @()
  if ($old.dartPid -and (Test-TaskOwnedProcess -ProcessId ([int]$old.dartPid) -ExpectedScript $serverScript -ExpectedCreatedAt ([string]$old.dartCreatedAt))) {
    $owned += [int]$old.dartPid
  }
  if ($old.pythonPid -and (Test-TaskOwnedProcess -ProcessId ([int]$old.pythonPid) -ExpectedScript $simScript -ExpectedCreatedAt ([string]$old.pythonCreatedAt))) {
    $owned += [int]$old.pythonPid
  }
  if ($owned.Count -gt 0) { throw "Task-owned simulation already running: $($owned -join ', ')" }
}

$instanceId = [guid]::NewGuid().ToString()
$stopFile = Join-Path $runtimeDir "stop-$instanceId.requested"
$dartOut = Join-Path $runtimeDir 'brainstem.stdout.log'
$dartErr = Join-Path $runtimeDir 'brainstem.stderr.log'
$pythonOut = Join-Path $runtimeDir 'mujoco.stdout.log'
$pythonErr = Join-Path $runtimeDir 'mujoco.stderr.log'
$packageConfig = Join-Path $BrainstemRoot '.dart_tool\package_config.json'
$hanDogDir = Join-Path $BrainstemRoot 'han_dog'
$dartArguments = "--packages=`"$packageConfig`" `"$serverScript`" --port 13147 --profile-dir profiles --profile mini --stop-file `"$stopFile`""

$oldOrt = $env:ONNXRUNTIME_DLL_PATH
$env:ONNXRUNTIME_DLL_PATH = Join-Path $BrainstemRoot 'onnxruntime.dll'
$dartProcess = Start-Process -FilePath $Dart -WorkingDirectory $hanDogDir -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $dartOut -RedirectStandardError $dartErr `
  -ArgumentList $dartArguments
$env:ONNXRUNTIME_DLL_PATH = $oldOrt
$pythonProcess = $null

try {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($dartProcess.HasExited) { throw "Brainstem exited early. See $dartErr" }
    if (Select-String -LiteralPath $dartOut -Pattern 'READY address=127.0.0.1' -Quiet -ErrorAction SilentlyContinue) { break }
    Start-Sleep -Milliseconds 250
  }
  if (-not (Select-String -LiteralPath $dartOut -Pattern 'READY address=127.0.0.1' -Quiet -ErrorAction SilentlyContinue)) {
    throw "Brainstem did not become ready within $StartupTimeoutSeconds seconds. See $dartOut and $dartErr"
  }

  $pythonArguments = "`"$simScript`" --brainstem-port 13147 --observer-port 13148 --instance-id $instanceId --stop-file `"$stopFile`" --api-root `"$(Join-Path $BrainstemRoot 'brainstem_api\python')`" --xml `"$(Join-Path $BrainstemRoot 'sim\robot\quadruped_v3.xml')`" --realtime"
  $pythonProcess = Start-Process -FilePath $Python -WorkingDirectory $BrainstemRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $pythonOut -RedirectStandardError $pythonErr `
    -ArgumentList $pythonArguments

  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  $snapshot = $null
  while ((Get-Date) -lt $deadline) {
    if ($pythonProcess.HasExited) { throw "MuJoCo exited early. See $pythonErr" }
    try {
      $snapshot = Invoke-RestMethod -Uri 'http://127.0.0.1:13148/state' -TimeoutSec 1
      if ($snapshot.ready -and $snapshot.instanceId -eq $instanceId) { break }
    } catch {}
    Start-Sleep -Milliseconds 250
  }
  if (-not $snapshot.ready -or $snapshot.instanceId -ne $instanceId) {
    throw "MuJoCo did not reach Standing within $StartupTimeoutSeconds seconds. See $pythonOut and $pythonErr"
  }

  $dartRecord = Get-ProcessRecord -ProcessId $dartProcess.Id
  $pythonRecord = Get-ProcessRecord -ProcessId $pythonProcess.Id
  [ordered]@{
    schemaVersion = 2
    instanceId = $instanceId
    stopFile = $stopFile
    dartPid = $dartProcess.Id
    dartCreatedAt = Get-ProcessCreatedAt -ProcessRecord $dartRecord
    pythonPid = $pythonProcess.Id
    pythonCreatedAt = Get-ProcessCreatedAt -ProcessRecord $pythonRecord
    brainstem = '127.0.0.1:13147'
    observer = 'http://127.0.0.1:13148/state'
    startedAt = (Get-Date).ToUniversalTime().ToString('o')
    brainstemRoot = $BrainstemRoot
  } | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding utf8
  Write-Output "Brainstem local simulation ready: instanceId=$instanceId"
  Write-Output 'gRPC: 127.0.0.1:13147'
  Write-Output 'Observer: http://127.0.0.1:13148/state'

  if ($Wait) {
    while (-not $dartProcess.HasExited -and -not $pythonProcess.HasExited) { Start-Sleep -Seconds 1 }
  }
} catch {
  New-Item -ItemType File -Path $stopFile -Force | Out-Null
  Stop-TaskOwnedProcess -ProcessId $dartProcess.Id -ExpectedScript $serverScript `
    -ExpectedCreatedAt (Get-ProcessCreatedAt -ProcessRecord (Get-ProcessRecord -ProcessId $dartProcess.Id)) -WaitSeconds 2
  if ($pythonProcess) {
    Stop-TaskOwnedProcess -ProcessId $pythonProcess.Id -ExpectedScript $simScript `
      -ExpectedCreatedAt (Get-ProcessCreatedAt -ProcessRecord (Get-ProcessRecord -ProcessId $pythonProcess.Id)) -WaitSeconds 2
  }
  throw
}
