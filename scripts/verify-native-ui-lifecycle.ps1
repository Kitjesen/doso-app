[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $AdbPath = 'D:/software/Android/platform-tools/adb.exe',

    [Parameter()]
    [ValidatePattern('^[A-Za-z0-9._:-]+$')]
    [string] $Serial = 'emulator-5554',

    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string] $EvidenceDirectory,

    [Parameter()]
    [ValidatePattern('^[0-9a-fA-F]{64}$')]
    [string] $ExpectedApkSha256 = 'f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExpectedPackage = 'com.doso.robot.qa'
$ExpectedActivity = 'com.doso.robot.qa/com.doso.robot.MainActivity'
$ClassifierPath = Join-Path $PSScriptRoot 'classify-native-ui.mjs'
$ClassifierHelperPath = Join-Path $PSScriptRoot 'helpers/native-ui-state.mjs'
$WindowClassifierPath = Join-Path $PSScriptRoot 'classify-native-error-window.mjs'
$WindowClassifierHelperPath = Join-Path $PSScriptRoot 'helpers/native-error-window.mjs'
$MaximumUiXmlBytes = 2MB
$MaximumUiNodes = 10000
$AdbTimeoutSeconds = 15
$UiTimeoutSeconds = 20
$NodeTimeoutSeconds = 5
$RunId = [Guid]::NewGuid().ToString('N')
$RemoteUiPath = "/sdcard/doso-native-ui-$RunId.xml"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

$AllowedStates = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
@(
    'signed-out-login', 'signed-out-register', 'font-loading', 'auth-restoring',
    'auth-recovery-error', 'design-qa', 'authenticated-or-main', 'system-ui',
    'permission-dialog', 'native-splash-or-empty', 'unknown', 'invalid-input'
) | ForEach-Object { [void] $AllowedStates.Add($_) }

$AllowedScopes = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
@('app', 'mixed', 'foreign', 'empty', 'invalid') | ForEach-Object { [void] $AllowedScopes.Add($_) }

$AllowedMarkerIds = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
@(
    'auth-entry-header', 'login-intro', 'register-intro', 'login-form', 'register-form',
    'login-email', 'login-password', 'login-submit', 'login-register', 'register-username',
    'register-email', 'register-password', 'register-submit', 'register-login', 'font-loading',
    'app-font-misans', 'app-font-system-fallback', 'design-qa-disclosure', 'design-qa-preview',
    'home-device-card', 'home-control', 'main-navigation'
) | ForEach-Object { [void] $AllowedMarkerIds.Add($_) }

$AllowedForeignNodeCountKeys = @(
    'framework', 'systemUi', 'permissionController', 'inputMethod', 'launcher',
    'settings', 'shell', 'dosoNamespace', 'missingPackage', 'other'
)
$AllowedForeignMarkerIds = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
@(
    'android:id/aerr_wait', 'android:id/aerr_close',
    'android:id/aerr_restart', 'android:id/aerr_report'
) | ForEach-Object { [void] $AllowedForeignMarkerIds.Add($_) }

function Stop-WithPhase {
    param(
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $Code,
        [Parameter()][AllowNull()][object] $TransportStatus = $null,
        [Parameter()][AllowNull()][object] $ExitCode = $null
    )
    $exception = [System.InvalidOperationException]::new("DosoNativePhase:$Code")
    if ($PSBoundParameters.ContainsKey('TransportStatus')) {
        $exception.Data['DosoTransportStatus'] = $TransportStatus
        $exception.Data['DosoExitCode'] = $ExitCode
    }
    throw $exception
}

function Get-FixedPhaseCode {
    param([Parameter(Mandatory)][System.Management.Automation.ErrorRecord] $Record)
    if ($Record.Exception.Message -match '^DosoNativePhase:([a-z0-9_]+)$') {
        return $Matches[1]
    }
    return 'unexpected_failure'
}

function Get-TransportDiagnostic {
    param([Parameter(Mandatory)][System.Management.Automation.ErrorRecord] $Record)
    if ($Record.Exception.Message -cnotmatch '^DosoNativePhase:[a-z0-9_]+$') { return $null }
    $data = $Record.Exception.Data
    if ($null -eq $data -or $data.Count -ne 2 -or -not $data.Contains('DosoTransportStatus') `
        -or -not $data.Contains('DosoExitCode')) {
        return $null
    }
    $status = $data['DosoTransportStatus']
    $exitCode = $data['DosoExitCode']
    if ($status -isnot [string]) { return $null }
    if ($status -ceq 'nonzero_exit') {
        if ($exitCode -isnot [int] -or $exitCode -eq 0) { return $null }
        return [ordered]@{ transportStatus = 'nonzero_exit'; exitCode = [int] $exitCode }
    }
    if (($status -cne 'timeout' -and $status -cne 'start_failed' -and $status -cne 'stdin_failed') `
        -or $null -ne $exitCode) {
        return $null
    }
    return [ordered]@{ transportStatus = [string] $status; exitCode = $null }
}

function Get-NativeRunSummary {
    param(
        [Parameter(Mandatory)][ValidateSet('failed', 'completed')][string] $PrimaryOutcome,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PrimaryPhaseCode,
        [Parameter(Mandatory)][string] $PrimaryAcceptanceVerdict,
        [Parameter(Mandatory)] $Cleanup
    )
    $firstFailure = @('remoteUiRemove', 'finalForceStop', 'networkRestore') | Where-Object {
        $Cleanup[$_].status -in @('failed', 'skipped_app_stop_unconfirmed')
    } | Select-Object -First 1
    $failed = $PrimaryOutcome -eq 'failed' -or $null -ne $firstFailure
    return [ordered]@{
        outcome = if ($failed) { 'failed' } else { $PrimaryOutcome }
        phaseCode = if ($PrimaryOutcome -eq 'failed' -or $null -eq $firstFailure) { $PrimaryPhaseCode } else { $Cleanup[$firstFailure].phaseCode }
        acceptanceVerdict = if ($failed) { 'failed' } else { $PrimaryAcceptanceVerdict }
    }
}

function Invoke-ProcessUtf8 {
    param(
        [Parameter(Mandatory)][string] $Executable,
        [Parameter(Mandatory)][string[]] $Arguments,
        [Parameter(Mandatory)][ValidateRange(1, 120)][int] $TimeoutSeconds,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhaseCode,
        [Parameter()][AllowNull()][string] $InputText = $null
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Executable
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.StandardOutputEncoding = $Utf8NoBom
    $startInfo.StandardErrorEncoding = $Utf8NoBom
    $hasInput = $PSBoundParameters.ContainsKey('InputText') -and $null -ne $InputText
    $startInfo.RedirectStandardInput = $hasInput
    if ($startInfo.RedirectStandardInput) {
        $startInfo.StandardInputEncoding = $Utf8NoBom
    }
    foreach ($argument in $Arguments) {
        [void] $startInfo.ArgumentList.Add($argument)
    }

    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        try {
            if (-not $process.Start()) {
                Stop-WithPhase "${PhaseCode}_start_failed" -TransportStatus 'start_failed' -ExitCode $null
            }
        }
        catch {
            Stop-WithPhase "${PhaseCode}_start_failed" -TransportStatus 'start_failed' -ExitCode $null
        }

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        $timer = [System.Diagnostics.Stopwatch]::StartNew()
        if ($startInfo.RedirectStandardInput) {
            try {
                $writeTask = $process.StandardInput.WriteAsync($InputText)
                if (-not $writeTask.Wait($TimeoutSeconds * 1000)) {
                    try { $process.Kill($true) } catch { }
                    try { $process.WaitForExit() } catch { }
                    Stop-WithPhase "${PhaseCode}_timeout" -TransportStatus 'timeout' -ExitCode $null
                }
                [void] $writeTask.GetAwaiter().GetResult()
                $process.StandardInput.Close()
            }
            catch {
                if ($_.Exception.Message -like 'DosoNativePhase:*') { throw }
                try { $process.Kill($true) } catch { }
                try { $process.WaitForExit() } catch { }
                Stop-WithPhase "${PhaseCode}_failed" -TransportStatus 'stdin_failed' -ExitCode $null
            }
        }

        $remainingMilliseconds = [Math]::Max(1, ($TimeoutSeconds * 1000) - [int] $timer.ElapsedMilliseconds)
        if (-not $process.WaitForExit($remainingMilliseconds)) {
            try { $process.Kill($true) } catch { }
            try { $process.WaitForExit() } catch { }
            Stop-WithPhase "${PhaseCode}_timeout" -TransportStatus 'timeout' -ExitCode $null
        }

        $stdout = $stdoutTask.GetAwaiter().GetResult()
        [void] $stderrTask.GetAwaiter().GetResult()
        if ($process.ExitCode -ne 0) {
            Stop-WithPhase "${PhaseCode}_failed" -TransportStatus 'nonzero_exit' -ExitCode ([int] $process.ExitCode)
        }
        return $stdout.Trim()
    }
    finally {
        $process.Dispose()
    }
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory)][string[]] $Arguments,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhaseCode,
        [Parameter()][ValidateRange(1, 120)][int] $TimeoutSeconds = $AdbTimeoutSeconds
    )
    return Invoke-ProcessUtf8 -Executable $script:ResolvedAdb -Arguments (@('-s', $Serial) + $Arguments) `
        -TimeoutSeconds $TimeoutSeconds -PhaseCode $PhaseCode
}

function Write-JsonNoOverwrite {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)] $Value,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhaseCode
    )
    $json = $Value | ConvertTo-Json -Depth 12
    try {
        $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
            $writer = [System.IO.StreamWriter]::new($stream, $Utf8NoBom)
            try { $writer.Write($json) } finally { $writer.Dispose() }
        }
        finally {
            if ($stream) { $stream.Dispose() }
        }
    }
    catch {
        Stop-WithPhase $PhaseCode
    }
}

function Read-BinarySwitch {
    param(
        [Parameter(Mandatory)][string] $Name,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhaseCode
    )
    $value = Invoke-Adb -Arguments @('shell', 'settings', 'get', 'global', $Name) -PhaseCode $PhaseCode
    if ($value -notmatch '^[01]$') { Stop-WithPhase "${PhaseCode}_invalid" }
    return $value -eq '1'
}

function Read-DefaultNetwork {
    param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhaseCode)
    $connectivity = Invoke-Adb -Arguments @('shell', 'dumpsys', 'connectivity') -PhaseCode $PhaseCode
    if ($connectivity -match '(?im)^\s*Active default network:\s*(?:none|null|-1)\s*$') { return 'none' }
    if ($connectivity -match '(?im)^\s*Active default network:\s*\d+\s*$') { return 'present' }
    Stop-WithPhase "${PhaseCode}_unknown"
}

function ConvertTo-BaseApkPath {
    param([Parameter(Mandatory)][string] $PackagePathText)
    if ($PackagePathText -notmatch '^package:(/data/app/[A-Za-z0-9_./=:+~-]+/base\.apk)$') {
        Stop-WithPhase 'package_path_invalid'
    }
    return $Matches[1]
}

function Read-NetworkState {
    param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhasePrefix)
    return [ordered]@{
        airplane = Read-BinarySwitch -Name 'airplane_mode_on' -PhaseCode "${PhasePrefix}_airplane"
        wifi = Read-BinarySwitch -Name 'wifi_on' -PhaseCode "${PhasePrefix}_wifi"
        mobileData = Read-BinarySwitch -Name 'mobile_data' -PhaseCode "${PhasePrefix}_mobile"
        defaultNetwork = Read-DefaultNetwork -PhaseCode "${PhasePrefix}_default"
    }
}

function Test-NetworkState {
    param([Parameter(Mandatory)] $Actual, [Parameter(Mandatory)] $Expected)
    return $Actual.airplane -eq $Expected.airplane `
        -and $Actual.wifi -eq $Expected.wifi `
        -and $Actual.mobileData -eq $Expected.mobileData `
        -and $Actual.defaultNetwork -eq $Expected.defaultNetwork
}

function Wait-NetworkState {
    param(
        [Parameter(Mandatory)] $Expected,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhasePrefix
    )
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        $actual = Read-NetworkState -PhasePrefix $PhasePrefix
        if (Test-NetworkState -Actual $actual -Expected $Expected) { return $actual }
        Start-Sleep -Seconds 1
    }
    Stop-WithPhase "${PhasePrefix}_mismatch"
}

function Set-AirplaneMode {
    param([Parameter(Mandatory)][bool] $Enabled, [Parameter(Mandatory)][string] $PhasePrefix)
    # AOSP ConnectivityService/CTS use this permission-checked shell API, not a shell-sent protected broadcast.
    $action = if ($Enabled) { 'enable' } else { 'disable' }
    Invoke-Adb -Arguments @('shell', 'cmd', 'connectivity', 'airplane-mode', $action) -PhaseCode "${PhasePrefix}_command" | Out-Null
    $actual = Invoke-Adb -Arguments @('shell', 'cmd', 'connectivity', 'airplane-mode') -PhaseCode "${PhasePrefix}_state"
    $expected = if ($Enabled) { 'enabled' } else { 'disabled' }
    if ($actual -cne $expected) { Stop-WithPhase "${PhasePrefix}_state_mismatch" }
}

function Set-RadioSwitch {
    param(
        [Parameter(Mandatory)][ValidateSet('wifi', 'data')][string] $Radio,
        [Parameter(Mandatory)][bool] $Enabled,
        [Parameter(Mandatory)][string] $PhasePrefix
    )
    $verb = if ($Enabled) { 'enable' } else { 'disable' }
    Invoke-Adb -Arguments @('shell', 'svc', $Radio, $verb) -PhaseCode "${PhasePrefix}_${Radio}" | Out-Null
}

function Read-AppState {
    param([Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhasePrefix)
    $pidText = Invoke-Adb -Arguments @('shell', 'pidof', $ExpectedPackage) -PhaseCode "${PhasePrefix}_pid"
    if ($pidText -notmatch '^\d+(?:\s+\d+)*$') { Stop-WithPhase "${PhasePrefix}_pid_invalid" }
    $appProcessId = ($pidText -split '\s+')[0]
    $activityText = Invoke-Adb -Arguments @('shell', 'dumpsys', 'activity', 'activities') -PhaseCode "${PhasePrefix}_activity"
    $escapedActivity = [Regex]::Escape($ExpectedActivity)
    $resumed = $activityText -match "(?im)(?:mResumedActivity|topResumedActivity).*${escapedActivity}(?=\s|$|[}\]])"
    return [ordered]@{ pid = $appProcessId; pidPresent = $true; activityResumed = [bool] $resumed }
}

function Convert-UiXmlToNodes {
    param([Parameter(Mandatory)][string] $XmlText)
    if ($Utf8NoBom.GetByteCount($XmlText) -gt $MaximumUiXmlBytes) { Stop-WithPhase 'ui_xml_too_large' }

    $settings = [System.Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $settings.MaxCharactersInDocument = $MaximumUiXmlBytes
    $settings.IgnoreComments = $true
    $settings.IgnoreProcessingInstructions = $true
    $stringReader = [System.IO.StringReader]::new($XmlText)
    $reader = $null
    $nodes = [System.Collections.Generic.List[object]]::new()
    try {
        $reader = [System.Xml.XmlReader]::Create($stringReader, $settings)
        while ($reader.Read()) {
            if ($reader.NodeType -ne [System.Xml.XmlNodeType]::Element -or $reader.Name -ne 'node') { continue }
            if ($nodes.Count -ge $MaximumUiNodes) { Stop-WithPhase 'ui_node_limit' }
            $nodes.Add([ordered]@{
                packageName = [string] $reader.GetAttribute('package')
                className = [string] $reader.GetAttribute('class')
                resourceId = [string] $reader.GetAttribute('resource-id')
                text = [string] $reader.GetAttribute('text')
                description = [string] $reader.GetAttribute('content-desc')
                password = $reader.GetAttribute('password') -eq 'true'
            })
        }
    }
    catch {
        if ($_.Exception.Message -like 'DosoNativePhase:*') { throw }
        Stop-WithPhase 'ui_xml_invalid'
    }
    finally {
        if ($reader) { $reader.Dispose() }
        $stringReader.Dispose()
    }
    return $nodes.ToArray()
}

function Convert-ClassifierResult {
    param([Parameter(Mandatory)][string] $JsonText)
    if ($Utf8NoBom.GetByteCount($JsonText) -gt 64KB) { Stop-WithPhase 'classifier_output_too_large' }
    try { $parsed = $JsonText | ConvertFrom-Json -Depth 12 } catch { Stop-WithPhase 'classifier_output_invalid' }
    $required = @(
        'state', 'scope', 'nodeCount', 'appNodeCount', 'inputNodeCount', 'markerIds',
        'safeForWarm', 'rawValuesRetained', 'foreignNodeCounts', 'foreignMarkerIds'
    )
    if ($parsed -isnot [pscustomobject]) { Stop-WithPhase 'classifier_schema_invalid' }
    $actualProperties = @($parsed.PSObject.Properties.Name | Sort-Object)
    $expectedProperties = @($required | Sort-Object)
    if (($actualProperties -join ',') -cne ($expectedProperties -join ',')) {
        Stop-WithPhase 'classifier_schema_invalid'
    }
    if (-not $AllowedStates.Contains([string] $parsed.state)) { Stop-WithPhase 'classifier_state_invalid' }
    if (-not $AllowedScopes.Contains([string] $parsed.scope)) { Stop-WithPhase 'classifier_scope_invalid' }
    if ($parsed.safeForWarm -isnot [bool] -or $parsed.rawValuesRetained -isnot [bool] -or $parsed.rawValuesRetained) {
        Stop-WithPhase 'classifier_privacy_invalid'
    }
    $counts = @($parsed.nodeCount, $parsed.appNodeCount, $parsed.inputNodeCount)
    foreach ($count in $counts) {
        if ($count -isnot [long] -and $count -isnot [int]) { Stop-WithPhase 'classifier_count_invalid' }
        if ([long] $count -lt 0 -or [long] $count -gt $MaximumUiNodes) { Stop-WithPhase 'classifier_count_invalid' }
    }
    if ($parsed.markerIds -isnot [System.Array]) { Stop-WithPhase 'classifier_marker_invalid' }
    $markers = @($parsed.markerIds)
    $seenMarkers = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    foreach ($marker in $markers) {
        $value = [string] $marker
        if (-not $AllowedMarkerIds.Contains($value) -or -not $seenMarkers.Add($value)) {
            Stop-WithPhase 'classifier_marker_invalid'
        }
    }

    if ($parsed.foreignNodeCounts -isnot [pscustomobject]) {
        Stop-WithPhase 'classifier_foreign_count_invalid'
    }
    $actualForeignKeys = @($parsed.foreignNodeCounts.PSObject.Properties.Name | Sort-Object)
    $expectedForeignKeys = @($AllowedForeignNodeCountKeys | Sort-Object)
    if (($actualForeignKeys -join ',') -cne ($expectedForeignKeys -join ',')) {
        Stop-WithPhase 'classifier_foreign_count_invalid'
    }
    $foreignNodeCounts = [ordered]@{}
    [long] $foreignNodeTotal = 0
    foreach ($key in $AllowedForeignNodeCountKeys) {
        $count = $parsed.foreignNodeCounts.$key
        if ($count -isnot [long] -and $count -isnot [int]) {
            Stop-WithPhase 'classifier_foreign_count_invalid'
        }
        if ([long] $count -lt 0 -or [long] $count -gt $MaximumUiNodes) {
            Stop-WithPhase 'classifier_foreign_count_invalid'
        }
        $foreignNodeCounts[$key] = [int] $count
        $foreignNodeTotal += [long] $count
    }
    if ([long] $parsed.appNodeCount -gt [long] $parsed.nodeCount `
        -or [long] $parsed.inputNodeCount -gt [long] $parsed.appNodeCount `
        -or $foreignNodeTotal -ne ([long] $parsed.nodeCount - [long] $parsed.appNodeCount)) {
        Stop-WithPhase 'classifier_count_consistency_invalid'
    }

    if ($parsed.foreignMarkerIds -isnot [System.Array]) {
        Stop-WithPhase 'classifier_foreign_marker_invalid'
    }
    $foreignMarkers = @($parsed.foreignMarkerIds)
    $seenForeignMarkers = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
    $previousForeignMarker = $null
    foreach ($marker in $foreignMarkers) {
        if ($marker -isnot [string] -or -not $AllowedForeignMarkerIds.Contains($marker) `
            -or -not $seenForeignMarkers.Add($marker)) {
            Stop-WithPhase 'classifier_foreign_marker_invalid'
        }
        if ($null -ne $previousForeignMarker -and [string]::CompareOrdinal($previousForeignMarker, $marker) -ge 0) {
            Stop-WithPhase 'classifier_foreign_marker_invalid'
        }
        $previousForeignMarker = $marker
    }
    if ($parsed.safeForWarm -and ($parsed.scope -cne 'app' -or $foreignNodeTotal -ne 0 -or $foreignMarkers.Count -ne 0)) {
        Stop-WithPhase 'classifier_safe_scope_invalid'
    }
    return [ordered]@{
        state = [string] $parsed.state
        scope = [string] $parsed.scope
        nodeCount = [int] $parsed.nodeCount
        appNodeCount = [int] $parsed.appNodeCount
        inputNodeCount = [int] $parsed.inputNodeCount
        markerIds = @($markers | ForEach-Object { [string] $_ })
        foreignNodeCounts = $foreignNodeCounts
        foreignMarkerIds = @($foreignMarkers | ForEach-Object { [string] $_ })
        safeForWarm = [bool] $parsed.safeForWarm
        rawValuesRetained = $false
    }
}

function Get-SanitizedUiState {
    param(
        [Parameter(Mandatory)][bool] $ActivityResumed,
        [Parameter(Mandatory)][ValidatePattern('^[a-z0-9_]+$')][string] $PhasePrefix
    )
    Invoke-Adb -Arguments @('shell', 'uiautomator', 'dump', '--compressed', $RemoteUiPath) `
        -PhaseCode "${PhasePrefix}_dump" -TimeoutSeconds $UiTimeoutSeconds | Out-Null
    $xmlText = Invoke-Adb -Arguments @('exec-out', 'cat', $RemoteUiPath) `
        -PhaseCode "${PhasePrefix}_read" -TimeoutSeconds $UiTimeoutSeconds
    $nodes = @(Convert-UiXmlToNodes -XmlText $xmlText)
    $payload = [ordered]@{
        expectedPackage = $ExpectedPackage
        expectedActivityResumed = $ActivityResumed
        nodes = $nodes
    } | ConvertTo-Json -Compress -Depth 8
    $classifierText = Invoke-ProcessUtf8 -Executable $script:ResolvedNode -Arguments @($ClassifierPath) `
        -TimeoutSeconds $NodeTimeoutSeconds -PhaseCode "${PhasePrefix}_classify" -InputText $payload
    $result = Convert-ClassifierResult -JsonText $classifierText
    $xmlText = $null
    $nodes = $null
    $payload = $null
    return $result
}

function New-WindowDiagnostic {
    param([ValidateSet('not_requested', 'captured', 'read_failed')][string] $Status = 'not_requested')
    return [ordered]@{ status = $Status; windowKind = 'unknown'; expectedTitleMatch = 'unknown'; rawValuesRetained = $false }
}

function Convert-ErrorWindowResult {
    param([Parameter(Mandatory)][string] $JsonText)
    if ($Utf8NoBom.GetByteCount($JsonText) -gt 4KB) { Stop-WithPhase 'window_classifier_output_invalid' }
    try { $parsed = $JsonText | ConvertFrom-Json -Depth 4 -NoEnumerate } catch { Stop-WithPhase 'window_classifier_output_invalid' }
    if ($null -eq $parsed -or $parsed -isnot [pscustomobject] -or $parsed -is [System.Array] `
        -or ((@($parsed.PSObject.Properties.Name | Sort-Object) -join ',') -cne 'expectedTitleMatch,rawValuesRetained,windowKind')) {
        Stop-WithPhase 'window_classifier_schema_invalid'
    }
    if ($parsed.windowKind -isnot [string] -or $parsed.windowKind -cnotin @('anr-title', 'app-error-title', 'unknown') `
        -or $parsed.expectedTitleMatch -isnot [string] -or $parsed.expectedTitleMatch -cnotin @('match', 'not-confirmed', 'unknown') `
        -or $parsed.rawValuesRetained -isnot [bool] -or $parsed.rawValuesRetained) {
        Stop-WithPhase 'window_classifier_value_invalid'
    }
    if (($parsed.windowKind -ceq 'unknown') -ne ($parsed.expectedTitleMatch -ceq 'unknown')) {
        Stop-WithPhase 'window_classifier_consistency_invalid'
    }
    return [ordered]@{ windowKind = [string] $parsed.windowKind; expectedTitleMatch = [string] $parsed.expectedTitleMatch; rawValuesRetained = $false }
}

function Get-SanitizedErrorWindow {
    param(
        [Parameter(Mandatory)][bool] $ExpectedProcessKnown,
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]] $MarkerIds
    )
    if (-not $ExpectedProcessKnown) { return New-WindowDiagnostic }
    $displayText = $null; $windowText = $null; $payload = $null; $classifierText = $null
    try {
        # Post-capture parser limits only: the existing transport uses ReadToEndAsync, not a hard memory cap.
        # Explicit subcommands avoid the full dump's historical LAST ANR/trace sections. Snapshots are not atomic.
        $displayText = Invoke-Adb -Arguments @('shell', 'dumpsys', 'window', 'displays') -PhaseCode 'cold_window_displays' -TimeoutSeconds $UiTimeoutSeconds
        if ($Utf8NoBom.GetByteCount($displayText) -gt 2MB -or $displayText -match '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') {
            return New-WindowDiagnostic -Status 'captured'
        }
        $focusLines = @([regex]::Matches($displayText, '(?m)^[ \t]*mCurrentFocus=[^\r\n]*\r?$'))
        if ($focusLines.Count -ne 1 -or $focusLines[0].Value -cnotmatch '^[ \t]*mCurrentFocus=Window\{[0-9a-fA-F]+ u0 [^{}\r\n]{1,512}\}[ \t]*\r?$') {
            return New-WindowDiagnostic -Status 'captured'
        }
        $windowText = Invoke-Adb -Arguments @('shell', 'dumpsys', 'window', 'windows') -PhaseCode 'cold_window_windows' -TimeoutSeconds $UiTimeoutSeconds
        if ($Utf8NoBom.GetByteCount($windowText) -gt 2MB -or $windowText -match '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') {
            return New-WindowDiagnostic -Status 'captured'
        }
        $payload = [ordered]@{ displayDump = $displayText; windowDump = $windowText; markerIds = @($MarkerIds); expectedProcessKnown = $true } | ConvertTo-Json -Compress -Depth 4
        $classifierText = Invoke-ProcessUtf8 -Executable $script:ResolvedNode -Arguments @($WindowClassifierPath) `
            -TimeoutSeconds $NodeTimeoutSeconds -PhaseCode 'cold_window_classify' -InputText $payload
        $classified = Convert-ErrorWindowResult -JsonText $classifierText
        return [ordered]@{ status = 'captured'; windowKind = $classified.windowKind; expectedTitleMatch = $classified.expectedTitleMatch; rawValuesRetained = $false }
    }
    catch {
        # A diagnostic read must never overwrite the already-unsafe cold result or prevent final cleanup.
        return New-WindowDiagnostic -Status 'read_failed'
    }
    finally { $displayText = $null; $windowText = $null; $payload = $null; $classifierText = $null }
}

$script:ResolvedAdb = $null
$script:ResolvedNode = $null
$evidenceRoot = $null
$runStartPath = $null
$nativeResultPath = $null
$originalNetwork = $null
$offlineNetwork = [ordered]@{ airplane = $true; wifi = $false; mobileData = $false; defaultNetwork = 'none' }
$coldResult = $null
$warmResult = [ordered]@{ attempted = $false; reason = 'not_reached' }
$installedApkSha256 = $null
$runnerSourceSha256 = $null
$classifierSourceSha256 = $null
$classifierHelperSha256 = $null
$windowClassifierSourceSha256 = $null
$windowClassifierHelperSha256 = $null
$actionStarted = $false
$networkMutationAttempted = $false
$offlineVerified = $false
$finalForceStopSucceeded = $false
$restoreSkippedReason = $null
$networkLeftIsolated = $false
$ownedEmulatorStopRequired = $false
$networkStateAfterCleanup = 'not_touched'
$deviceReady = $false
$remoteUiMayExist = $false
$outcome = 'failed'
$acceptanceVerdict = 'not_evaluated'
$phaseCode = 'preflight_not_started'
$primaryTransportDiagnostic = $null
$restoreResult = [ordered]@{ attempted = $false; switchesRestored = $false; defaultNetworkRestored = $false }
$cleanupResult = [ordered]@{
    remoteUiRemove = [ordered]@{ status = 'not_required'; phaseCode = $null; transportDiagnostic = $null }
    finalForceStop = [ordered]@{ status = 'not_required'; phaseCode = $null; transportDiagnostic = $null }
    networkRestore = [ordered]@{ status = 'not_required'; phaseCode = $null; transportDiagnostic = $null }
}

try {
try {
    $phaseCode = 'resolve_tools'
    $adbCommand = @(Get-Command -Name $AdbPath -CommandType Application -ErrorAction SilentlyContinue) | Select-Object -First 1
    $nodeCommand = @(Get-Command -Name 'node' -CommandType Application -ErrorAction SilentlyContinue) | Select-Object -First 1
    if (-not $adbCommand -or -not $nodeCommand `
        -or -not (Test-Path -LiteralPath $ClassifierPath -PathType Leaf) `
        -or -not (Test-Path -LiteralPath $ClassifierHelperPath -PathType Leaf) `
        -or -not (Test-Path -LiteralPath $WindowClassifierPath -PathType Leaf) `
        -or -not (Test-Path -LiteralPath $WindowClassifierHelperPath -PathType Leaf)) {
        Stop-WithPhase 'tool_preflight_failed'
    }
    $script:ResolvedAdb = $adbCommand.Source
    $script:ResolvedNode = $nodeCommand.Source
    try {
        $runnerSourceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
        $classifierSourceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ClassifierPath).Hash.ToLowerInvariant()
        $classifierHelperSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $ClassifierHelperPath).Hash.ToLowerInvariant()
        $windowClassifierSourceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $WindowClassifierPath).Hash.ToLowerInvariant()
        $windowClassifierHelperSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $WindowClassifierHelperPath).Hash.ToLowerInvariant()
    }
    catch {
        Stop-WithPhase 'source_hash_failed'
    }

    $evidenceRoot = [System.IO.Path]::GetFullPath($EvidenceDirectory)
    if (Test-Path -LiteralPath $evidenceRoot) { Stop-WithPhase 'evidence_directory_exists' }
    [void] [System.IO.Directory]::CreateDirectory($evidenceRoot)
    $runStartPath = Join-Path $evidenceRoot 'run-start.json'
    $nativeResultPath = Join-Path $evidenceRoot 'native-result.json'

    $phaseCode = 'device_preflight'
    if ((Invoke-Adb -Arguments @('get-state') -PhaseCode 'device_state') -ne 'device') { Stop-WithPhase 'device_not_ready' }
    $deviceReady = $true
    if ((Invoke-Adb -Arguments @('shell', 'getprop', 'sys.boot_completed') -PhaseCode 'boot_complete') -ne '1') {
        Stop-WithPhase 'boot_not_complete'
    }

    $packageList = Invoke-Adb -Arguments @('shell', 'pm', 'list', 'packages', '--user', '0', $ExpectedPackage) -PhaseCode 'package_list'
    if ($packageList -ne "package:$ExpectedPackage") { Stop-WithPhase 'qa_package_missing' }
    $packagePathText = Invoke-Adb -Arguments @('shell', 'pm', 'path', $ExpectedPackage) -PhaseCode 'package_path'
    $baseApkPath = ConvertTo-BaseApkPath -PackagePathText $packagePathText
    $packageDump = Invoke-Adb -Arguments @('shell', 'dumpsys', 'package', $ExpectedPackage) -PhaseCode 'package_dump'
    if ($packageDump -notmatch "(?m)^\s*Package \[$([Regex]::Escape($ExpectedPackage))\]" -or $packageDump -notmatch '(?m)^\s*versionName=\S+-qa\s*$') {
        Stop-WithPhase 'qa_build_identity_invalid'
    }
    $hashText = Invoke-Adb -Arguments @('shell', 'toybox', 'sha256sum', $baseApkPath) -PhaseCode 'package_hash'
    if ($hashText -notmatch '^([0-9a-fA-F]{64})\s+') { Stop-WithPhase 'package_hash_invalid' }
    $installedApkSha256 = $Matches[1].ToLowerInvariant()
    if ($installedApkSha256 -ne $ExpectedApkSha256.ToLowerInvariant()) { Stop-WithPhase 'package_hash_mismatch' }

    $originalNetwork = Read-NetworkState -PhasePrefix 'network_initial'
    $runStart = [ordered]@{
        schemaVersion = 1
        runId = $RunId
        startedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
        serial = $Serial
        expectedPackage = $ExpectedPackage
        expectedActivity = $ExpectedActivity
        expectedApkSha256 = $ExpectedApkSha256.ToLowerInvariant()
        installedApkSha256 = $installedApkSha256
        runnerSourceSha256 = $runnerSourceSha256
        classifierSourceSha256 = $classifierSourceSha256
        classifierHelperSha256 = $classifierHelperSha256
        windowClassifierSourceSha256 = $windowClassifierSourceSha256
        windowClassifierHelperSha256 = $windowClassifierHelperSha256
        bootComplete = $true
        qaPackageVerified = $true
        originalNetwork = $originalNetwork
        rawValuesRetained = $false
    }
    Write-JsonNoOverwrite -Path $runStartPath -Value $runStart -PhaseCode 'run_start_write_failed'

    $phaseCode = 'isolate_network'
    $actionStarted = $true
    Invoke-Adb -Arguments @('shell', 'am', 'force-stop', $ExpectedPackage) -PhaseCode 'initial_force_stop' | Out-Null
    $networkMutationAttempted = $true
    $networkStateAfterCleanup = 'unconfirmed'
    Set-AirplaneMode -Enabled $true -PhasePrefix 'offline_airplane'
    Set-RadioSwitch -Radio 'wifi' -Enabled $false -PhasePrefix 'offline'
    Set-RadioSwitch -Radio 'data' -Enabled $false -PhasePrefix 'offline'
    [void] (Wait-NetworkState -Expected $offlineNetwork -PhasePrefix 'network_offline')
    $offlineVerified = $true
    $networkStateAfterCleanup = 'verified_offline'

    $phaseCode = 'cold_launch'
    $coldLaunch = Invoke-Adb -Arguments @('shell', 'am', 'start', '-W', '-n', $ExpectedActivity) -PhaseCode 'cold_start'
    if ($coldLaunch -notmatch '(?im)^\s*Status:\s*ok\s*$' -or $coldLaunch -notmatch "(?im)^\s*Activity:\s*$([Regex]::Escape($ExpectedActivity))\s*$") {
        Stop-WithPhase 'cold_start_status_invalid'
    }
    Start-Sleep -Seconds 20
    $coldApp = Read-AppState -PhasePrefix 'cold'
    if (-not $coldApp.activityResumed) { Stop-WithPhase 'cold_activity_not_resumed' }
    $remoteUiMayExist = $true
    $coldUi = Get-SanitizedUiState -ActivityResumed $coldApp.activityResumed -PhasePrefix 'cold_ui'
    $coldResult = [ordered]@{
        launchStatus = 'ok'
        pidPresent = $coldApp.pidPresent
        activityResumed = $coldApp.activityResumed
        ui = $coldUi
        windowDiagnostic = New-WindowDiagnostic
    }

    if (-not $coldUi.safeForWarm -and $coldUi.scope -ceq 'foreign' -and $coldUi.nodeCount -gt 0 `
        -and ($coldUi.foreignNodeCounts.framework + $coldUi.foreignNodeCounts.systemUi) -eq $coldUi.nodeCount `
        -and @($coldUi.foreignMarkerIds).Count -gt 0) {
        $coldResult.windowDiagnostic = Get-SanitizedErrorWindow -ExpectedProcessKnown ($coldApp.pidPresent -and $coldApp.activityResumed) -MarkerIds @($coldUi.foreignMarkerIds)
    }

    if (-not $coldUi.safeForWarm) {
        $warmResult = [ordered]@{ attempted = $false; reason = 'cold_state_unsafe' }
        $acceptanceVerdict = 'bounded_incomplete'
    }
    else {
        $phaseCode = 'warm_resume'
        $warmResult = [ordered]@{ attempted = $true; reason = 'in_progress' }
        Invoke-Adb -Arguments @('shell', 'input', 'keyevent', 'KEYCODE_HOME') -PhaseCode 'warm_home' | Out-Null
        Start-Sleep -Seconds 1
        $homeApp = Read-AppState -PhasePrefix 'warm_home'
        if ($homeApp.activityResumed) { Stop-WithPhase 'warm_home_app_still_resumed' }
        if ($homeApp.pid -ne $coldApp.pid) { Stop-WithPhase 'warm_home_pid_changed' }
        [void] (Wait-NetworkState -Expected $offlineNetwork -PhasePrefix 'network_before_warm')
        $warmLaunch = Invoke-Adb -Arguments @('shell', 'am', 'start', '-W', '-n', $ExpectedActivity) -PhaseCode 'warm_start'
        if ($warmLaunch -notmatch '(?im)^\s*Status:\s*ok\s*$') { Stop-WithPhase 'warm_start_status_invalid' }
        Start-Sleep -Seconds 3
        $warmApp = Read-AppState -PhasePrefix 'warm'
        if (-not $warmApp.activityResumed) { Stop-WithPhase 'warm_activity_not_resumed' }
        $warmUi = Get-SanitizedUiState -ActivityResumed $warmApp.activityResumed -PhasePrefix 'warm_ui'
        if (-not $warmUi.safeForWarm) { Stop-WithPhase 'warm_state_unsafe' }
        $samePid = $warmApp.pid -eq $coldApp.pid
        $sameState = $warmUi.state -eq $coldUi.state -and $warmUi.scope -eq $coldUi.scope
        if (-not $samePid) { Stop-WithPhase 'warm_pid_changed' }
        if (-not $sameState) { Stop-WithPhase 'warm_state_changed' }
        $warmResult = [ordered]@{
            attempted = $true
            launchStatus = 'ok'
            samePid = $samePid
            activityResumed = $warmApp.activityResumed
            sameCoarseState = $sameState
            ui = $warmUi
        }
        $acceptanceVerdict = 'passed'
    }

    $outcome = 'completed'
    $phaseCode = 'complete'
}
catch {
    $outcome = 'failed'
    $phaseCode = Get-FixedPhaseCode -Record $_
    $primaryTransportDiagnostic = Get-TransportDiagnostic -Record $_
}
# Freeze action/preflight provenance before cleanup. Cleanup only writes its own records.
$primaryOutcome = $outcome
$primaryPhaseCode = $phaseCode
$primaryAcceptanceVerdict = $acceptanceVerdict
}
finally {

if ($deviceReady -and $remoteUiMayExist) {
    try {
        Invoke-Adb -Arguments @('shell', 'rm', '-f', '--', $RemoteUiPath) -PhaseCode 'remote_ui_remove' | Out-Null
        $cleanupResult.remoteUiRemove.status = 'succeeded'
    }
    catch {
        $cleanupResult.remoteUiRemove.status = 'failed'
        $cleanupResult.remoteUiRemove.phaseCode = Get-FixedPhaseCode -Record $_
        $cleanupResult.remoteUiRemove.transportDiagnostic = Get-TransportDiagnostic -Record $_
    }
}

if ($deviceReady -and $actionStarted) {
    try {
        Invoke-Adb -Arguments @('shell', 'am', 'force-stop', $ExpectedPackage) -PhaseCode 'final_force_stop' | Out-Null
        $finalForceStopSucceeded = $true
        $cleanupResult.finalForceStop.status = 'succeeded'
    }
    catch {
        $cleanupResult.finalForceStop.status = 'failed'
        $cleanupResult.finalForceStop.phaseCode = Get-FixedPhaseCode -Record $_
        $cleanupResult.finalForceStop.transportDiagnostic = Get-TransportDiagnostic -Record $_
        $restoreSkippedReason = 'app_stop_unconfirmed'
        $networkLeftIsolated = $offlineVerified
        $networkStateAfterCleanup = 'unconfirmed'
        $ownedEmulatorStopRequired = $true
        if ($networkMutationAttempted -and $originalNetwork) {
            $cleanupResult.networkRestore.status = 'skipped_app_stop_unconfirmed'
            $cleanupResult.networkRestore.phaseCode = 'app_stop_unconfirmed'
        }
    }
}

if ($deviceReady -and $networkMutationAttempted -and $originalNetwork -and $finalForceStopSucceeded) {
    $restoreResult.attempted = $true
    try {
        Set-AirplaneMode -Enabled ([bool] $originalNetwork.airplane) -PhasePrefix 'restore_airplane'
        Set-RadioSwitch -Radio 'wifi' -Enabled ([bool] $originalNetwork.wifi) -PhasePrefix 'restore'
        Set-RadioSwitch -Radio 'data' -Enabled ([bool] $originalNetwork.mobileData) -PhasePrefix 'restore'
        $restoredNetwork = Wait-NetworkState -Expected $originalNetwork -PhasePrefix 'network_restored'
        $restoreResult.switchesRestored = $restoredNetwork.airplane -eq $originalNetwork.airplane `
            -and $restoredNetwork.wifi -eq $originalNetwork.wifi `
            -and $restoredNetwork.mobileData -eq $originalNetwork.mobileData
        $restoreResult.defaultNetworkRestored = $restoredNetwork.defaultNetwork -eq $originalNetwork.defaultNetwork
        $cleanupResult.networkRestore.status = 'succeeded'
        $networkStateAfterCleanup = 'restored'
    }
    catch {
        $cleanupResult.networkRestore.status = 'failed'
        $cleanupResult.networkRestore.phaseCode = Get-FixedPhaseCode -Record $_
        $cleanupResult.networkRestore.transportDiagnostic = Get-TransportDiagnostic -Record $_
        $networkStateAfterCleanup = 'unconfirmed'
        $ownedEmulatorStopRequired = $true
    }
}
}

$summary = Get-NativeRunSummary -PrimaryOutcome $primaryOutcome -PrimaryPhaseCode $primaryPhaseCode `
    -PrimaryAcceptanceVerdict $primaryAcceptanceVerdict -Cleanup $cleanupResult
$outcome = $summary.outcome
$phaseCode = $summary.phaseCode
$acceptanceVerdict = $summary.acceptanceVerdict
$nativeResult = [ordered]@{
    schemaVersion = 5
    runId = $RunId
    finishedAtUtc = [DateTimeOffset]::UtcNow.ToString('o')
    outcome = $outcome
    acceptanceVerdict = $acceptanceVerdict
    phaseCode = $phaseCode
    primaryOutcome = $primaryOutcome
    primaryPhaseCode = $primaryPhaseCode
    primaryAcceptanceVerdict = $primaryAcceptanceVerdict
    primaryTransportDiagnostic = $primaryTransportDiagnostic
    cleanup = $cleanupResult
    expectedPackage = $ExpectedPackage
    expectedActivity = $ExpectedActivity
    expectedApkSha256 = $ExpectedApkSha256.ToLowerInvariant()
    installedApkSha256 = $installedApkSha256
    runnerSourceSha256 = $runnerSourceSha256
    classifierSourceSha256 = $classifierSourceSha256
    classifierHelperSha256 = $classifierHelperSha256
    windowClassifierSourceSha256 = $windowClassifierSourceSha256
    windowClassifierHelperSha256 = $windowClassifierHelperSha256
    networkIsolation = [ordered]@{
        requested = $actionStarted
        verifiedOffline = $offlineVerified
    }
    cold = $coldResult
    warm = $warmResult
    restore = $restoreResult
    finalForceStopSucceeded = $finalForceStopSucceeded
    restoreSkippedReason = $restoreSkippedReason
    networkLeftIsolated = $networkLeftIsolated
    networkStateAfterCleanup = $networkStateAfterCleanup
    ownedEmulatorStopRequired = $ownedEmulatorStopRequired
    rawValuesRetained = $false
}

try {
    if (-not $nativeResultPath) { Stop-WithPhase 'result_path_unavailable' }
    Write-JsonNoOverwrite -Path $nativeResultPath -Value $nativeResult -PhaseCode 'native_result_write_failed'
    Write-Output ($nativeResult | ConvertTo-Json -Compress -Depth 12)
}
catch {
    Write-Error 'DOSO native UI verification failed: evidence_write_failed'
    exit 1
}

if ($outcome -ne 'completed') { exit 1 }
