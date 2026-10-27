[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$runnerPath = Join-Path $PSScriptRoot 'verify-native-ui-lifecycle.ps1'
$tokens = $null
$parseErrors = $null
$runnerAst = [System.Management.Automation.Language.Parser]::ParseFile($runnerPath, [ref] $tokens, [ref] $parseErrors)
if ($parseErrors.Count) { throw 'provenance_test:runner_syntax' }

function Assert-True([bool] $Condition, [string] $Code) {
    if (-not $Condition) { throw "provenance_test:$Code" }
}

foreach ($name in @('Stop-WithPhase', 'Get-FixedPhaseCode', 'Get-TransportDiagnostic', 'Get-NativeRunSummary')) {
    $definition = $runnerAst.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if ($definition) { . ([scriptblock]::Create($definition.Extent.Text)) }
}

$statements = @($runnerAst.EndBlock.Statements)
$outerTry = @($statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] -and $_.Finally })[0]
$innerTry = @($outerTry.Body.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] })[0]
$initialIndex = 0
while ($statements[$initialIndex].Extent.Text -ne '$script:ResolvedAdb = $null') { $initialIndex++ }
$outerIndex = [Array]::IndexOf($statements, $outerTry)
$initialization = ($statements[$initialIndex..($outerIndex - 1)] | ForEach-Object { $_.Extent.Text }) -join "`n"
$catchBody = $innerTry.CatchClauses[0].Body.Extent.Text
$freeze = (@($outerTry.Body.Statements | Select-Object -Skip 1) | ForEach-Object { $_.Extent.Text }) -join "`n"
$finallyBody = $outerTry.Finally.Extent.Text
$resultIndex = $outerIndex + 1
while ($statements[$resultIndex].Extent.Text -notmatch '^\$nativeResult\s*=') { $resultIndex++ }
$resultStatements = ($statements[($outerIndex + 1)..$resultIndex] | ForEach-Object { $_.Extent.Text }) -join "`n"

# Execute production catch/finally/result statements; replace only the OS boundary and primary action stimulus.
function Invoke-ProvenanceScenario {
    param(
        [string] $PrimaryCode = 'offline_airplane_broadcast_failed',
        [string] $PrimaryVerdict = 'not_evaluated',
        [string] $RestoreCode = 'restore_airplane_broadcast_failed',
        [string] $RemoveCode = '',
        [string] $StopCode = '',
        [AllowNull()][object] $PrimaryExitCode = $null,
        [AllowNull()][object] $RestoreExitCode = $null,
        [bool] $WithActions = $true,
        [bool] $RemoteUi = $false,
        [switch] $VerifiedOffline,
        [switch] $UnexpectedPrimary
    )
    $script:restoreCode = $RestoreCode
    $script:removeCode = $RemoveCode
    $script:stopCode = $StopCode
    $script:restoreExitCode = $RestoreExitCode
    $script:cleanupActions = [System.Collections.Generic.List[string]]::new()
    $ExpectedPackage = 'com.doso.robot.qa'
    $ExpectedActivity = 'com.doso.robot.qa/com.doso.robot.MainActivity'
    $ExpectedApkSha256 = 'f3135f778f2a6e67c1b0878e32b7bf856418a86af971b0879462fbe0d1ca1e7e'
    $RunId = 'synthetic-provenance-test'
    $RemoteUiPath = '/sdcard/doso-native-ui-synthetic.xml'
    . ([scriptblock]::Create($initialization))
    $deviceReady = $WithActions
    $actionStarted = $WithActions
    $networkMutationAttempted = $WithActions
    $remoteUiMayExist = $RemoteUi
    $offlineVerified = [bool] $VerifiedOffline
    $originalNetwork = [ordered]@{ airplane = $false; wifi = $true; mobileData = $true; defaultNetwork = 'present' }
    $code = @"
try {
    try {
        if (`$UnexpectedPrimary) { throw 'synthetic-private-email@example.invalid private-code-87654321' }
        if (`$PrimaryCode) {
            if (`$null -ne `$PrimaryExitCode) {
                Stop-WithPhase `$PrimaryCode -TransportStatus 'nonzero_exit' -ExitCode `$PrimaryExitCode
            }
            Stop-WithPhase `$PrimaryCode
        }
        `$outcome = 'completed'
        `$phaseCode = 'complete'
        `$acceptanceVerdict = `$PrimaryVerdict
    }
    catch $catchBody
    $freeze
}
finally $finallyBody
$resultStatements
`$nativeResult
"@
    return . ([scriptblock]::Create($code))
}

function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode)
    if ($Arguments -contains 'rm') {
        [void] $script:cleanupActions.Add('remove')
        if ($script:removeCode) { Stop-WithPhase $script:removeCode }
    }
    elseif ($Arguments -contains 'force-stop') {
        [void] $script:cleanupActions.Add('stop')
        if ($script:stopCode) { Stop-WithPhase $script:stopCode }
    }
    else { throw 'synthetic-private-unexpected-command' }
}
function Set-AirplaneMode {
    param([bool] $Enabled, [string] $PhasePrefix)
    [void] $script:cleanupActions.Add('restore-airplane')
    if ($script:restoreCode -eq 'raw') { throw 'synthetic-private-token-and-password' }
    if ($null -ne $script:restoreExitCode) {
        Stop-WithPhase $script:restoreCode -TransportStatus 'nonzero_exit' -ExitCode $script:restoreExitCode
    }
    if ($script:restoreCode) { Stop-WithPhase $script:restoreCode }
}
function Set-RadioSwitch { param([string] $Radio, [bool] $Enabled, [string] $PhasePrefix); [void] $script:cleanupActions.Add("restore-$Radio") }
function Wait-NetworkState { param($Expected, [string] $PhasePrefix); [void] $script:cleanupActions.Add('verify-network'); return $Expected }

$dualFailure = Invoke-ProvenanceScenario -PrimaryExitCode 37 -RestoreExitCode 41
Assert-True ($dualFailure.phaseCode -eq 'offline_airplane_broadcast_failed') 'primary_failure_survives_restore_failure'
Assert-True ($dualFailure.cleanup.networkRestore.phaseCode -eq 'restore_airplane_broadcast_failed') 'restore_failure_retained_separately'
Assert-True ($dualFailure.primaryOutcome -eq 'failed' -and $dualFailure.primaryPhaseCode -eq 'offline_airplane_broadcast_failed') 'frozen_primary_failure'
Assert-True ($dualFailure.acceptanceVerdict -eq 'failed') 'dual_failure_not_passed'
Assert-True ($dualFailure.ownedEmulatorStopRequired) 'restore_failure_requires_owned_stop'
Assert-True ($dualFailure.networkStateAfterCleanup -eq 'unconfirmed') 'restore_failure_network_not_assumed'
Assert-True ($dualFailure.primaryTransportDiagnostic.transportStatus -ceq 'nonzero_exit' `
    -and $dualFailure.primaryTransportDiagnostic.exitCode -ceq 37) 'primary_transport_exit_37'
Assert-True ($dualFailure.cleanup.networkRestore.transportDiagnostic.transportStatus -ceq 'nonzero_exit' `
    -and $dualFailure.cleanup.networkRestore.transportDiagnostic.exitCode -ceq 41) 'cleanup_transport_exit_41'
Assert-True ($null -eq $dualFailure.cleanup.remoteUiRemove.transportDiagnostic `
    -and $null -eq $dualFailure.cleanup.finalForceStop.transportDiagnostic) 'unrelated_cleanup_transport_null'

$primaryOnly = Invoke-ProvenanceScenario -RestoreCode ''
Assert-True ($primaryOnly.phaseCode -eq 'offline_airplane_broadcast_failed') 'primary_with_successful_cleanup'
Assert-True ($primaryOnly.cleanup.finalForceStop.status -eq 'succeeded' -and $primaryOnly.cleanup.networkRestore.status -eq 'succeeded') 'successful_cleanup_recorded'
Assert-True (($script:cleanupActions -join ',') -eq 'stop,restore-airplane,restore-wifi,restore-data,verify-network') 'stop_before_reconnect'
Assert-True ($null -eq $primaryOnly.primaryTransportDiagnostic) 'nontransport_primary_diagnostic_null'
foreach ($step in @('remoteUiRemove', 'finalForceStop', 'networkRestore')) {
    Assert-True ($null -eq $primaryOnly.cleanup[$step].transportDiagnostic) "successful_cleanup_transport_null_$step"
}

foreach ($verdict in @('passed', 'bounded_incomplete')) {
    $clean = Invoke-ProvenanceScenario -PrimaryCode '' -PrimaryVerdict $verdict -RestoreCode '' -RemoteUi $true
    Assert-True ($clean.outcome -eq 'completed' -and $clean.acceptanceVerdict -eq $verdict) "clean_$verdict"
    Assert-True ($clean.primaryAcceptanceVerdict -eq $verdict) "primary_clean_$verdict"
    Assert-True ($clean.networkStateAfterCleanup -eq 'restored' -and -not $clean.ownedEmulatorStopRequired) 'clean_network_confirmed'
    Assert-True ($null -eq $clean.primaryTransportDiagnostic) "clean_primary_transport_null_$verdict"
    foreach ($step in @('remoteUiRemove', 'finalForceStop', 'networkRestore')) {
        Assert-True ($clean.cleanup[$step].status -eq 'succeeded') "clean_step_$step"
        Assert-True ($null -eq $clean.cleanup[$step].transportDiagnostic) "clean_transport_null_${verdict}_$step"
    }
    $restoreFailure = Invoke-ProvenanceScenario -PrimaryCode '' -PrimaryVerdict $verdict
    Assert-True ($restoreFailure.outcome -eq 'failed' -and $restoreFailure.acceptanceVerdict -eq 'failed') "cleanup_downgrades_$verdict"
    Assert-True ($restoreFailure.primaryOutcome -eq 'completed' -and $restoreFailure.primaryAcceptanceVerdict -eq $verdict) "preserves_primary_$verdict"
    Assert-True ($restoreFailure.phaseCode -eq 'restore_airplane_broadcast_failed') 'cleanup_summary_exact_code'
}

$removeFailure = Invoke-ProvenanceScenario -PrimaryCode '' -PrimaryVerdict 'passed' -RestoreCode '' -RemoteUi $true -RemoveCode 'remote_ui_remove_failed'
Assert-True ($removeFailure.outcome -eq 'failed' -and $removeFailure.phaseCode -eq 'remote_ui_remove_failed' -and $removeFailure.acceptanceVerdict -eq 'failed') 'remove_failure_downgrades_pass'
Assert-True ($removeFailure.cleanup.networkRestore.status -eq 'succeeded') 'later_cleanup_success_cannot_erase_failure'

$multiFailure = Invoke-ProvenanceScenario -RemoteUi $true -RemoveCode 'remote_ui_remove_failed'
Assert-True ($multiFailure.phaseCode -eq 'offline_airplane_broadcast_failed') 'primary_wins_summary_only'
Assert-True ($multiFailure.cleanup.remoteUiRemove.phaseCode -eq 'remote_ui_remove_failed' -and $multiFailure.cleanup.networkRestore.phaseCode -eq 'restore_airplane_broadcast_failed') 'both_cleanup_failures_retained'

$completedMultiFailure = Invoke-ProvenanceScenario -PrimaryCode '' -PrimaryVerdict 'passed' -RemoteUi $true -RemoveCode 'remote_ui_remove_failed'
Assert-True ($completedMultiFailure.phaseCode -eq 'remote_ui_remove_failed' -and $completedMultiFailure.cleanup.networkRestore.phaseCode -eq 'restore_airplane_broadcast_failed') 'deterministic_cleanup_summary_does_not_erase_second_failure'

foreach ($primaryCode in @('offline_airplane_broadcast_failed', '')) {
    $stopFailure = Invoke-ProvenanceScenario -PrimaryCode $primaryCode -PrimaryVerdict 'passed' -StopCode 'final_force_stop_failed'
    Assert-True ($stopFailure.cleanup.finalForceStop.phaseCode -eq 'final_force_stop_failed') 'stop_failure_fixed_code'
    Assert-True ($stopFailure.cleanup.networkRestore.status -eq 'skipped_app_stop_unconfirmed') 'restore_explicitly_skipped'
    Assert-True (-not $stopFailure.restore.attempted -and $stopFailure.ownedEmulatorStopRequired -and -not $stopFailure.networkLeftIsolated) 'stop_failure_no_unverified_isolation_claim'
    Assert-True ($stopFailure.networkStateAfterCleanup -eq 'unconfirmed') 'stop_failure_network_unconfirmed'
    Assert-True (($script:cleanupActions -join ',') -eq 'stop') 'stop_failure_no_radio_enable'
    $expectedPhase = if ($primaryCode) { $primaryCode } else { 'final_force_stop_failed' }
    Assert-True ($stopFailure.phaseCode -eq $expectedPhase -and $stopFailure.acceptanceVerdict -eq 'failed') 'stop_failure_primary_precedence'
}

$isolatedStopFailure = Invoke-ProvenanceScenario -VerifiedOffline -StopCode 'final_force_stop_failed'
Assert-True ($isolatedStopFailure.networkLeftIsolated -and $isolatedStopFailure.ownedEmulatorStopRequired -and -not $isolatedStopFailure.restore.attempted) 'verified_offline_stop_failure_no_reconnect'

$preflight = Invoke-ProvenanceScenario -PrimaryCode 'device_not_ready' -WithActions $false
Assert-True ($preflight.phaseCode -eq 'device_not_ready' -and $script:cleanupActions.Count -eq 0) 'preflight_no_cleanup_actions'
Assert-True ($preflight.networkStateAfterCleanup -eq 'not_touched') 'preflight_network_not_touched'
Assert-True ($null -eq $preflight.primaryTransportDiagnostic) 'preflight_transport_null'
foreach ($step in @('remoteUiRemove', 'finalForceStop', 'networkRestore')) {
    Assert-True ($preflight.cleanup[$step].status -eq 'not_required') "preflight_$step"
    Assert-True ($null -eq $preflight.cleanup[$step].transportDiagnostic) "preflight_transport_null_$step"
}

$privateError = Invoke-ProvenanceScenario -UnexpectedPrimary -RestoreCode 'raw'
$privateJson = $privateError | ConvertTo-Json -Depth 12
Assert-True ($privateError.phaseCode -eq 'unexpected_failure' -and $privateError.cleanup.networkRestore.phaseCode -eq 'unexpected_failure') 'unexpected_errors_fixed_category'
Assert-True ($privateJson -notmatch 'synthetic-private|87654321|password|token|example.invalid') 'no_private_error_echo'
Assert-True ($null -eq $privateError.primaryTransportDiagnostic `
    -and $null -eq $privateError.cleanup.networkRestore.transportDiagnostic) 'unexpected_nontransport_diagnostic_null'

function Read-SyntheticTransportDiagnostic {
    param([AllowNull()][object] $Status, [AllowNull()][object] $ExitCode)
    try { Stop-WithPhase 'synthetic_transport' -TransportStatus $Status -ExitCode $ExitCode }
    catch { return Get-TransportDiagnostic -Record $_ }
}

foreach ($status in @('timeout', 'start_failed', 'stdin_failed')) {
    $diagnostic = Read-SyntheticTransportDiagnostic -Status $status -ExitCode $null
    Assert-True ($diagnostic.transportStatus -ceq $status -and $null -eq $diagnostic.exitCode) "transport_$status"
}
foreach ($pair in @(
    [pscustomobject]@{ status = 'private-status-canary'; exit = $null },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = $null },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = $true },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = @(37) },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = 0 },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = '37-private-exit-canary' },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = 37.5 },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = [long] 37 },
    [pscustomobject]@{ status = 'nonzero_exit'; exit = ([long] [int]::MaxValue + 1) },
    [pscustomobject]@{ status = 'timeout'; exit = 37 }
)) {
    $diagnostic = Read-SyntheticTransportDiagnostic -Status $pair.status -ExitCode $pair.exit
    Assert-True ($null -eq $diagnostic) 'malformed_transport_pair_rejected'
}
$plainDiagnostic = $null
try { throw [System.InvalidOperationException]::new('private-plain-canary') } catch { $plainDiagnostic = Get-TransportDiagnostic -Record $_ }
Assert-True ($null -eq $plainDiagnostic) 'nontransport_diagnostic_null'
$missingKeyException = [System.InvalidOperationException]::new('private-missing-key-canary')
$missingKeyException.Data['DosoTransportStatus'] = 'nonzero_exit'
$missingKeyRecord = [System.Management.Automation.ErrorRecord]::new(
    $missingKeyException, 'synthetic', [System.Management.Automation.ErrorCategory]::NotSpecified, $null
)
Assert-True ($null -eq (Get-TransportDiagnostic -Record $missingKeyRecord)) 'missing_transport_key_rejected'
$forgedException = [System.InvalidOperationException]::new('private-forged-message-canary')
$forgedException.Data['DosoTransportStatus'] = 'nonzero_exit'
$forgedException.Data['DosoExitCode'] = 37
$forgedRecord = [System.Management.Automation.ErrorRecord]::new(
    $forgedException, 'synthetic', [System.Management.Automation.ErrorCategory]::NotSpecified, $null
)
Assert-True ($null -eq (Get-TransportDiagnostic -Record $forgedRecord)) 'forged_nonphase_metadata_rejected'
Assert-True ($null -eq (Read-SyntheticTransportDiagnostic -Status 'TIMEOUT' -ExitCode $null)) 'transport_status_exact_case'
$extraKeyException = [System.InvalidOperationException]::new('DosoNativePhase:synthetic_transport')
$extraKeyException.Data['DosoTransportStatus'] = 'nonzero_exit'
$extraKeyException.Data['DosoExitCode'] = 37
$extraKeyException.Data['PrivateCanaryKey'] = 'private-extra-data-canary'
$extraKeyRecord = [System.Management.Automation.ErrorRecord]::new(
    $extraKeyException, 'synthetic', [System.Management.Automation.ErrorCategory]::NotSpecified, $null
)
Assert-True ($null -eq (Get-TransportDiagnostic -Record $extraKeyRecord)) 'transport_extra_data_key_rejected'
$diagnosticJson = @($plainDiagnostic, (Get-TransportDiagnostic -Record $missingKeyRecord)) | ConvertTo-Json -Compress
Assert-True ($diagnosticJson -notmatch 'private-|canary|37-private') 'malformed_transport_no_echo'

Write-Output 'native-ui-error-provenance-tests=PASS scenarios=32'
