[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$testPath = Join-Path $PSScriptRoot 'native-ui-runner.test.ps1'
$runnerPath = Join-Path $PSScriptRoot 'verify-native-ui-lifecycle.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $testPath), [ref] $tokens, [ref] $parseErrors)
if ($parseErrors.Count -ne 0) { throw 'native_error_window_boundary:runner_test_parse' }
$actionDefinition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-ActionSegment' }, $true)
if ($null -eq $actionDefinition) { throw 'native_error_window_boundary:missing_action_helper' }
Set-Item -Path Function:script:Invoke-ActionSegment -Value $actionDefinition.Body.GetScriptBlock()
$runnerAst = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $runnerPath), [ref] $tokens, [ref] $parseErrors)
if ($parseErrors.Count -ne 0) { throw 'native_error_window_boundary:runner_parse' }

function Assert-True { param([bool] $Condition, [string] $Code) if (-not $Condition) { throw "native_error_window_boundary:$Code" } }
function Stop-WithPhase { param([string] $PhaseCode) throw "DosoNativePhase:$PhaseCode" }
function Get-FixedPhaseCode { param($Record) return 'DosoNativePhase:unexpected' }
function Get-TransportDiagnostic { param($Record) return $null }
function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode, [int] $TimeoutSeconds)
    if ($PhaseCode -eq 'cold_start') { return "Status: ok`nActivity: $ExpectedActivity" }
    return ''
}
function Set-AirplaneMode { param([bool] $Enabled, [string] $PhasePrefix) }
function Set-RadioSwitch { param([string] $Radio, [bool] $Enabled, [string] $PhasePrefix) }
function Wait-NetworkState { param($Expected, [string] $PhasePrefix) return $Expected }
function Start-Sleep { param([int] $Seconds) }
function Read-AppState { param([string] $PhasePrefix) return [ordered]@{ pid = '4242'; pidPresent = $true; activityResumed = $true } }
function Get-SanitizedUiState { param([bool] $ActivityResumed, [string] $PhasePrefix) return $script:foreignUi }
function New-WindowDiagnostic { param([string] $Status = 'not_requested') return [ordered]@{ status = $Status; windowKind = 'unknown'; expectedTitleMatch = 'unknown'; rawValuesRetained = $false } }

$script:errorWindowProbeCount = 0
function Get-SanitizedErrorWindow {
    $script:errorWindowProbeCount++
    return [ordered]@{ status = 'captured'; windowKind = 'unknown'; expectedTitleMatch = 'unknown'; rawValuesRetained = $false }
}

$ExpectedPackage = 'com.doso.robot.qa'
$ExpectedActivity = 'com.doso.robot.qa/com.doso.robot.MainActivity'
$RemoteUiPath = '/sdcard/doso-native-ui-fixture.xml'
$UiTimeoutSeconds = 5
$NodeTimeoutSeconds = 5
$ClassifierPath = 'fixture-classifier.mjs'
$script:ResolvedNode = 'node'
$script:foreignUi = [ordered]@{
    state = 'unknown'; scope = 'foreign'; safeForWarm = $false; rawValuesRetained = $false
    nodeCount = 4; appNodeCount = 0; inputNodeCount = 0; markerIds = @('android:id/aerr_wait','android:id/aerr_close')
    foreignMarkerIds = @('android:id/aerr_wait','android:id/aerr_close')
    foreignNodeCounts = [ordered]@{ framework = 4; systemUi = 0; permissionController = 0; inputMethod = 0; launcher = 0; settings = 0; shell = 0; dosoNamespace = 0; missingPackage = 0; other = 0 }
}
$coldResult = $null
$warmResult = [ordered]@{ attempted = $false; reason = 'not_reached' }
$actionStarted = $false
$networkMutationAttempted = $false
$offlineVerified = $false
$remoteUiMayExist = $false
$outcome = 'failed'
$phaseCode = 'preflight_not_started'
$acceptanceVerdict = 'not_evaluated'
$originalNetwork = [ordered]@{ airplane = $false; wifi = $true; mobileData = $true; defaultNetwork = 'present' }
$offlineNetwork = [ordered]@{ airplane = $true; wifi = $false; mobileData = $false; defaultNetwork = 'none' }
$ExpectedApkSha256 = ('a' * 64)
$cleanupResult = [ordered]@{ remoteUiRemove = [ordered]@{}; finalForceStop = [ordered]@{}; networkRestore = [ordered]@{} }

$result = Invoke-ActionSegment -Ast $runnerAst
if ($result.exceptionCode -ne $null) { Write-Output "native-error-window-boundary RED harness action exception: $($result.exceptionCode)"; exit 1 }
Assert-True ($result.coldResult.ui.scope -eq 'foreign') 'foreign_ui_fixture_used'
Assert-True ($result.warmResult.reason -eq 'cold_state_unsafe') 'unsafe_cold_stopped_warm'
Assert-True ($script:errorWindowProbeCount -eq 1) 'window_probe_not_called'
Assert-True ($result.coldResult.windowDiagnostic.status -eq 'captured') 'window_probe_status'
# Execute the real diagnostic failure path inside the actual cold action statements.
foreach ($name in @('New-WindowDiagnostic','Get-SanitizedErrorWindow','Get-NativeRunSummary')) {
    $definition = $runnerAst.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    Set-Item -Path "Function:script:$name" -Value $definition.Body.GetScriptBlock()
}
$cleanupDefinition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-CleanupFinally' }, $true)
Set-Item -Path Function:script:Invoke-CleanupFinally -Value $cleanupDefinition.Body.GetScriptBlock()
$script:commands = [System.Collections.Generic.List[string]]::new()
function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode, [int] $TimeoutSeconds)
    [void] $script:commands.Add($Arguments -join ' ')
    if ($PhaseCode -eq 'cold_start') { return "Status: ok`nActivity: $ExpectedActivity" }
    if ($PhaseCode -eq 'cold_window_displays') { throw 'private-diagnostic-read-canary' }
    return ''
}
$deviceReady = $true; $finalForceStopSucceeded = $false
$restoreSkippedReason = $null; $networkLeftIsolated = $false; $ownedEmulatorStopRequired = $false
$restoreResult = [ordered]@{attempted=$false;switchesRestored=$false;defaultNetworkRestored=$false}
$result = Invoke-ActionSegment -Ast $runnerAst
Assert-True ($null -eq $result.exceptionCode -and $result.outcome -ceq 'completed' -and $result.acceptanceVerdict -ceq 'bounded_incomplete') 'diagnostic_error_does_not_mask_cold_unsafe'
Assert-True ($result.coldResult.windowDiagnostic.status -ceq 'read_failed' -and -not $result.warmResult.attempted) 'read_failure_fixed_no_warm'
Assert-True (@($script:commands | Where-Object {$_ -like '*KEYCODE_HOME*'}).Count -eq 0) 'no_home_from_diagnostic'
Assert-True (@($script:commands | Where-Object {$_ -ceq 'shell dumpsys window windows'}).Count -eq 0) 'no_second_read_after_failure'
$remoteUiMayExist = $true; $actionStarted = $true; $networkMutationAttempted = $true
$outcome = $result.outcome; $phaseCode = $result.phaseCode
$cleanup = Invoke-CleanupFinally -Ast $runnerAst
Assert-True ($cleanup.finalForceStopSucceeded -and $restoreResult.switchesRestored -and $restoreResult.defaultNetworkRestored) 'cleanup_after_diagnostic_failure'
Assert-True (($result | ConvertTo-Json -Depth 10) -notmatch 'private-diagnostic-read-canary') 'no_diagnostic_exception_echo'
Write-Output 'native-error-window-action-tests=PASS one-probe/no-warm/read-failure-preserves-unsafe/cleanup'
