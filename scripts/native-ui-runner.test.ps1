[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RunnerPath = Join-Path $PSScriptRoot 'verify-native-ui-lifecycle.ps1'

function Assert-True {
    param([Parameter(Mandatory)][bool] $Condition, [Parameter(Mandatory)][string] $Code)
    if (-not $Condition) { throw "native_ui_runner_test:$Code" }
}

function Get-RunnerAst {
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
        (Resolve-Path -LiteralPath $RunnerPath),
        [ref] $tokens,
        [ref] $errors
    )
    Assert-True ($errors.Count -eq 0) 'runner_parse'
    return $ast
}

function Import-RunnerFunction {
    param(
        [Parameter(Mandatory)][System.Management.Automation.Language.ScriptBlockAst] $Ast,
        [Parameter(Mandatory)][string] $Name
    )
    $definition = $Ast.Find({
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
    }, $true)
    Assert-True ($null -ne $definition) "missing_function_$Name"
    Set-Item -Path "Function:script:$Name" -Value $definition.Body.GetScriptBlock()
}

function Invoke-CleanupFinally {
    param([Parameter(Mandatory)][System.Management.Automation.Language.ScriptBlockAst] $Ast)
    $outerTry = @($Ast.EndBlock.Statements | Where-Object {
        $_ -is [System.Management.Automation.Language.TryStatementAst] -and $null -ne $_.Finally
    }) | Select-Object -First 1
    Assert-True ($null -ne $outerTry) 'missing_cleanup_finally'
    $cleanupInitialization = @($Ast.EndBlock.Statements | Where-Object { $_.Extent.Text -match '^\$cleanupResult\s*=' })[0].Extent.Text
    $body = $cleanupInitialization + [Environment]::NewLine + (($outerTry.Finally.Statements | ForEach-Object { $_.Extent.Text }) -join [Environment]::NewLine)
    $body += @'

$summary = Get-NativeRunSummary -PrimaryOutcome $outcome -PrimaryPhaseCode $phaseCode -PrimaryAcceptanceVerdict 'not_evaluated' -Cleanup $cleanupResult
[ordered]@{
    finalForceStopSucceeded = $finalForceStopSucceeded
    outcome = $summary.outcome
    phaseCode = $summary.phaseCode
    restoreSkippedReason = $restoreSkippedReason
    networkLeftIsolated = $networkLeftIsolated
    ownedEmulatorStopRequired = $ownedEmulatorStopRequired
}
'@
    return @([scriptblock]::Create($body).Invoke())[-1]
}

function Invoke-ActionSegment {
    param([Parameter(Mandatory)][System.Management.Automation.Language.ScriptBlockAst] $Ast)
    $outerTry = @($Ast.EndBlock.Statements | Where-Object {
        $_ -is [System.Management.Automation.Language.TryStatementAst] -and $null -ne $_.Finally
    }) | Select-Object -First 1
    $innerTry = @($outerTry.Body.Statements | Where-Object {
        $_ -is [System.Management.Automation.Language.TryStatementAst]
    }) | Select-Object -First 1
    Assert-True ($null -ne $innerTry) 'missing_action_try'
    $statements = @($innerTry.Body.Statements)
    $start = -1
    $end = -1
    for ($index = 0; $index -lt $statements.Count; $index++) {
        $text = $statements[$index].Extent.Text.Trim()
        if ($text -eq "`$phaseCode = 'isolate_network'") { $start = $index }
        if ($text -eq "`$phaseCode = 'complete'") { $end = $index }
    }
    Assert-True ($start -ge 0 -and $end -ge $start) 'missing_action_segment'
    $segment = ($statements[$start..$end] | ForEach-Object { $_.Extent.Text }) -join [Environment]::NewLine
    $body = @"
try {
$segment
    [ordered]@{
        exceptionCode = `$null
        actionStarted = `$actionStarted
        networkMutationAttempted = `$networkMutationAttempted
        offlineVerified = `$offlineVerified
        remoteUiMayExist = `$remoteUiMayExist
        coldResult = `$coldResult
        warmResult = `$warmResult
        outcome = `$outcome
        phaseCode = `$phaseCode
        acceptanceVerdict = `$acceptanceVerdict
    }
}
catch {
    [ordered]@{
        exceptionCode = `$_.Exception.Message
        actionStarted = `$actionStarted
        networkMutationAttempted = `$networkMutationAttempted
        offlineVerified = `$offlineVerified
        remoteUiMayExist = `$remoteUiMayExist
        coldResult = `$coldResult
        warmResult = `$warmResult
        outcome = `$outcome
        phaseCode = `$phaseCode
        acceptanceVerdict = `$acceptanceVerdict
    }
}
"@
    return @([scriptblock]::Create($body).Invoke())[-1]
}

$runnerSource = Get-Content -LiteralPath $RunnerPath -Raw
$runnerAst = Get-RunnerAst
foreach ($name in @('Stop-WithPhase', 'Get-FixedPhaseCode', 'Get-TransportDiagnostic', 'Get-NativeRunSummary', 'Invoke-ProcessUtf8', 'Read-AppState', 'Convert-UiXmlToNodes', 'ConvertTo-BaseApkPath', 'Convert-ClassifierResult', 'New-WindowDiagnostic')) {
    Import-RunnerFunction -Ast $runnerAst -Name $name
}

$ExpectedPackage = 'com.doso.robot.qa'
$ExpectedActivity = 'com.doso.robot.qa/com.doso.robot.MainActivity'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$MaximumUiXmlBytes = 2MB
$MaximumUiNodes = 10000
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
@('android:id/aerr_wait', 'android:id/aerr_close', 'android:id/aerr_restart', 'android:id/aerr_report') |
    ForEach-Object { [void] $AllowedForeignMarkerIds.Add($_) }
$mockActivityText = "mResumedActivity: ActivityRecord{fixture $ExpectedActivity t1}"

$legacyClassifierCode = $null
try {
    [void] (Convert-ClassifierResult -JsonText (@{
        state = 'unknown'; scope = 'app'; nodeCount = 0; appNodeCount = 0; inputNodeCount = 0
        markerIds = @(); safeForWarm = $false; rawValuesRetained = $false
    } | ConvertTo-Json -Compress))
}
catch { $legacyClassifierCode = $_.Exception.Message }
Assert-True ($legacyClassifierCode -eq 'DosoNativePhase:classifier_schema_invalid') 'classifier_requires_foreign_diagnostics'

function New-ClassifierFixture {
    return [ordered]@{
        state = 'unknown'
        scope = 'mixed'
        nodeCount = 3
        appNodeCount = 1
        inputNodeCount = 0
        markerIds = @()
        safeForWarm = $false
        rawValuesRetained = $false
        foreignNodeCounts = [ordered]@{
            framework = 0; systemUi = 0; permissionController = 0; inputMethod = 0; launcher = 0
            settings = 0; shell = 0; dosoNamespace = 0; missingPackage = 0; other = 2
        }
        foreignMarkerIds = @('android:id/aerr_wait')
    }
}

function Get-ClassifierFailureCode {
    param([Parameter(Mandatory)] $Fixture)
    try {
        [void] (Convert-ClassifierResult -JsonText ($Fixture | ConvertTo-Json -Compress -Depth 8))
        return $null
    }
    catch { return $_.Exception.Message }
}

$validClassifier = Convert-ClassifierResult -JsonText ((New-ClassifierFixture) | ConvertTo-Json -Compress -Depth 8)
$validClassifierFields = @($validClassifier.Keys | Sort-Object)
$expectedClassifierResultFields = @(
    'appNodeCount', 'foreignMarkerIds', 'foreignNodeCounts', 'inputNodeCount', 'markerIds',
    'nodeCount', 'rawValuesRetained', 'safeForWarm', 'scope', 'state'
)
Assert-True (($validClassifierFields -join ',') -ceq ($expectedClassifierResultFields -join ',')) 'classifier_fixed_result_schema'
Assert-True ($validClassifier.foreignNodeCounts.other -eq 2) 'classifier_foreign_count_preserved'
Assert-True (($validClassifier.foreignMarkerIds -join ',') -ceq 'android:id/aerr_wait') 'classifier_foreign_marker_preserved'

$unknownTopLevel = New-ClassifierFixture
$unknownTopLevel.privateCanary = 'must-not-return'
Assert-True ((Get-ClassifierFailureCode $unknownTopLevel) -eq 'DosoNativePhase:classifier_schema_invalid') 'classifier_unknown_top_level'
$missingTopLevel = New-ClassifierFixture
$missingTopLevel.Remove('foreignMarkerIds')
Assert-True ((Get-ClassifierFailureCode $missingTopLevel) -eq 'DosoNativePhase:classifier_schema_invalid') 'classifier_missing_top_level'

foreach ($invalidCount in @(1.5, $true, -1, 10001)) {
    $invalidForeignCount = New-ClassifierFixture
    $invalidForeignCount.foreignNodeCounts.other = $invalidCount
    Assert-True ((Get-ClassifierFailureCode $invalidForeignCount) -eq 'DosoNativePhase:classifier_foreign_count_invalid') 'classifier_foreign_count_value'
}
foreach ($invalidForeignObjectCase in @(
    [pscustomobject]@{ value = $null },
    [pscustomobject]@{ value = @() },
    [pscustomobject]@{ value = 'private-object-canary' }
)) {
    $invalidForeignCounts = New-ClassifierFixture
    $invalidForeignCounts.foreignNodeCounts = $invalidForeignObjectCase.value
    $invalidForeignCountsCode = Get-ClassifierFailureCode $invalidForeignCounts
    Assert-True ($invalidForeignCountsCode -eq 'DosoNativePhase:classifier_foreign_count_invalid') 'classifier_foreign_count_object'
    Assert-True (-not $invalidForeignCountsCode.Contains('private-object-canary')) 'classifier_foreign_count_object_privacy'
}
foreach ($key in $AllowedForeignNodeCountKeys) {
    foreach ($invalidCountCase in @(
        [pscustomobject]@{ value = $null },
        [pscustomobject]@{ value = @(1) },
        [pscustomobject]@{ value = 'private-count-canary' }
    )) {
        $invalidForeignCount = New-ClassifierFixture
        $invalidForeignCount.foreignNodeCounts[$key] = $invalidCountCase.value
        $invalidForeignCountCode = Get-ClassifierFailureCode $invalidForeignCount
        Assert-True ($invalidForeignCountCode -eq 'DosoNativePhase:classifier_foreign_count_invalid') "classifier_foreign_count_shape_$key"
        Assert-True (-not $invalidForeignCountCode.Contains('private-count-canary')) "classifier_foreign_count_shape_privacy_$key"
    }
}
$unknownForeignKey = New-ClassifierFixture
$unknownForeignKey.foreignNodeCounts.privateCanary = 0
Assert-True ((Get-ClassifierFailureCode $unknownForeignKey) -eq 'DosoNativePhase:classifier_foreign_count_invalid') 'classifier_foreign_count_keys'
$missingForeignKey = New-ClassifierFixture
$missingForeignKey.foreignNodeCounts.Remove('framework')
Assert-True ((Get-ClassifierFailureCode $missingForeignKey) -eq 'DosoNativePhase:classifier_foreign_count_invalid') 'classifier_foreign_count_missing_key'
$inconsistentForeignCount = New-ClassifierFixture
$inconsistentForeignCount.foreignNodeCounts.other = 1
Assert-True ((Get-ClassifierFailureCode $inconsistentForeignCount) -eq 'DosoNativePhase:classifier_count_consistency_invalid') 'classifier_foreign_count_sum'

$invalidForeignMarker = New-ClassifierFixture
$invalidForeignMarker.foreignMarkerIds = @('private-marker-canary')
$invalidForeignMarkerCode = Get-ClassifierFailureCode $invalidForeignMarker
Assert-True ($invalidForeignMarkerCode -eq 'DosoNativePhase:classifier_foreign_marker_invalid') 'classifier_foreign_marker_allowlist'
Assert-True (-not $invalidForeignMarkerCode.Contains('private-marker-canary')) 'classifier_foreign_marker_privacy'
$duplicateForeignMarker = New-ClassifierFixture
$duplicateForeignMarker.foreignMarkerIds = @('android:id/aerr_wait', 'android:id/aerr_wait')
Assert-True ((Get-ClassifierFailureCode $duplicateForeignMarker) -eq 'DosoNativePhase:classifier_foreign_marker_invalid') 'classifier_foreign_marker_unique'
$unsortedForeignMarker = New-ClassifierFixture
$unsortedForeignMarker.foreignMarkerIds = @('android:id/aerr_wait', 'android:id/aerr_close')
Assert-True ((Get-ClassifierFailureCode $unsortedForeignMarker) -eq 'DosoNativePhase:classifier_foreign_marker_invalid') 'classifier_foreign_marker_sorted'
$scalarForeignMarker = New-ClassifierFixture
$scalarForeignMarker.foreignMarkerIds = 'android:id/aerr_wait'
Assert-True ((Get-ClassifierFailureCode $scalarForeignMarker) -eq 'DosoNativePhase:classifier_foreign_marker_invalid') 'classifier_foreign_marker_array'

$unsafeWarm = New-ClassifierFixture
$unsafeWarm.safeForWarm = $true
Assert-True ((Get-ClassifierFailureCode $unsafeWarm) -eq 'DosoNativePhase:classifier_safe_scope_invalid') 'classifier_warm_requires_app_scope'
$safeWarm = New-ClassifierFixture
$safeWarm.state = 'signed-out-login'
$safeWarm.scope = 'app'
$safeWarm.nodeCount = 6
$safeWarm.appNodeCount = 6
$safeWarm.inputNodeCount = 2
$safeWarm.markerIds = @('auth-entry-header', 'login-form', 'login-email', 'login-password', 'login-submit', 'login-register')
$safeWarm.safeForWarm = $true
$safeWarm.foreignNodeCounts.other = 0
$safeWarm.foreignMarkerIds = @()
Assert-True ($null -eq (Get-ClassifierFailureCode $safeWarm)) 'classifier_warm_app_only'
$safeWarmWithForeignMarker = New-ClassifierFixture
$safeWarmWithForeignMarker.state = 'signed-out-login'
$safeWarmWithForeignMarker.scope = 'app'
$safeWarmWithForeignMarker.nodeCount = 6
$safeWarmWithForeignMarker.appNodeCount = 6
$safeWarmWithForeignMarker.inputNodeCount = 2
$safeWarmWithForeignMarker.markerIds = @('auth-entry-header', 'login-form', 'login-email', 'login-password', 'login-submit', 'login-register')
$safeWarmWithForeignMarker.safeForWarm = $true
$safeWarmWithForeignMarker.foreignNodeCounts.other = 0
Assert-True ((Get-ClassifierFailureCode $safeWarmWithForeignMarker) -eq 'DosoNativePhase:classifier_safe_scope_invalid') 'classifier_warm_rejects_foreign_marker'

$resolvedNode = (@(Get-Command -Name 'node' -CommandType Application) | Select-Object -First 1).Source
$transportOutput = Invoke-ProcessUtf8 -Executable $resolvedNode `
    -Arguments @('-e', "process.stdout.write('device')") -TimeoutSeconds 5 -PhaseCode 'transport_fixture'
Assert-True ($transportOutput -is [string]) 'transport_scalar_output'
Assert-True ($transportOutput -ceq 'device') 'transport_exact_output'

$classifierPath = Join-Path $PSScriptRoot 'classify-native-ui.mjs'
$canary = 'private-input-canary-must-not-return'
$loginMarkerIds = @('auth-entry-header', 'login-form', 'login-email', 'login-password', 'login-submit', 'login-register')
$classifierNodes = @($loginMarkerIds | ForEach-Object {
    [ordered]@{
        packageName = 'com.doso.robot.qa'
        className = if ($_ -in @('login-email', 'login-password')) { 'android.widget.EditText' } else { 'android.view.View' }
        resourceId = $_
        text = $canary
        description = $canary
        password = $_ -eq 'login-password'
    }
})
$classifierPayload = [ordered]@{
    expectedPackage = 'com.doso.robot.qa'
    expectedActivityResumed = $true
    nodes = $classifierNodes
} | ConvertTo-Json -Compress -Depth 8
$classifierOutput = Invoke-ProcessUtf8 -Executable $resolvedNode -Arguments @($classifierPath) `
    -TimeoutSeconds 5 -PhaseCode 'classifier_transport_fixture' -InputText $classifierPayload
Assert-True ($classifierOutput -is [string]) 'classifier_transport_scalar_output'
Assert-True (-not $classifierOutput.Contains($canary)) 'classifier_transport_no_canary'
$classifierResult = $classifierOutput | ConvertFrom-Json
$expectedClassifierFields = @(
    'appNodeCount', 'foreignMarkerIds', 'foreignNodeCounts', 'inputNodeCount', 'markerIds',
    'nodeCount', 'rawValuesRetained', 'safeForWarm', 'scope', 'state'
)
$actualClassifierFields = @($classifierResult.PSObject.Properties.Name | Sort-Object)
Assert-True (($actualClassifierFields -join ',') -eq ($expectedClassifierFields -join ',')) 'classifier_transport_schema'
Assert-True ($classifierResult.state -eq 'signed-out-login' -and $classifierResult.scope -eq 'app') 'classifier_transport_state'
Assert-True ($classifierResult.safeForWarm -eq $true -and $classifierResult.rawValuesRetained -eq $false) 'classifier_transport_privacy'

$modernBasePath = ConvertTo-BaseApkPath -PackagePathText 'package:/data/app/~~fixture-token==/com.doso.robot.qa-fixture==/base.apk'
Assert-True ($modernBasePath -eq '/data/app/~~fixture-token==/com.doso.robot.qa-fixture==/base.apk') 'modern_base_apk_path'
$invalidPathCode = $null
try { [void] (ConvertTo-BaseApkPath -PackagePathText 'package:/data/local/tmp/com.doso.robot.qa/base.apk') } catch { $invalidPathCode = $_.Exception.Message }
Assert-True ($invalidPathCode -eq 'DosoNativePhase:package_path_invalid') 'base_apk_path_scope'

function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode, [int] $TimeoutSeconds)
    if ($PhaseCode -like '*_pid') { return '4242' }
    if ($PhaseCode -like '*_activity') { return $script:mockActivityText }
    throw 'native_ui_runner_test:unexpected_read_app_command'
}

$appState = Read-AppState -PhasePrefix 'fixture'
Assert-True ($appState.pid -eq '4242') 'read_app_process_id'
Assert-True ($appState.activityResumed) 'read_app_exact_activity'
$mockActivityText = "mResumedActivity: ActivityRecord{fixture ${ExpectedActivity}Extra t1}"
$nonExactState = Read-AppState -PhasePrefix 'fixture'
Assert-True (-not $nonExactState.activityResumed) 'activity_boundary'
Assert-True ($runnerSource -notmatch '(?im)^\s*\$pid\s*=') 'reserved_pid_assignment'

$emptyNodes = @(Convert-UiXmlToNodes -XmlText '<hierarchy rotation="0"></hierarchy>')
Assert-True ($emptyNodes.Count -eq 0) 'empty_xml_array'
Assert-True ($runnerSource -match '\$nodes\s*=\s*@\(Convert-UiXmlToNodes') 'empty_nodes_json_array_guard'

foreach ($xmlCase in @(
    '<hierarchy><node text="private-fragment">',
    '<!DOCTYPE hierarchy [<!ENTITY private "private-entity">]><hierarchy>&private;</hierarchy>',
    '<!DOCTYPE hierarchy SYSTEM "file:///private-source"><hierarchy></hierarchy>'
)) {
    $caught = $null
    try { [void] @(Convert-UiXmlToNodes -XmlText $xmlCase) } catch { $caught = $_.Exception.Message }
    Assert-True ($caught -eq 'DosoNativePhase:ui_xml_invalid') 'xml_failure_code'
    Assert-True ($caught -notmatch 'private') 'xml_failure_privacy'
}

Assert-True ($runnerSource -match '\$acceptanceVerdict\s*=\s*''bounded_incomplete''') 'bounded_incomplete_verdict'
Assert-True ($runnerSource -match '\$nativeResult\s*=\s*\[ordered\]@\{\s*schemaVersion\s*=\s*5') 'native_result_schema_v5'
Assert-True ($runnerSource -match '\$warmResult\s*=\s*\[ordered\]@\{\s*attempted\s*=\s*\$true;\s*reason\s*=\s*''in_progress''') 'warm_attempted_before_home'
Assert-True ($runnerSource -match '\$homeApp\s*=\s*Read-AppState') 'home_state_check'
Assert-True ($runnerSource -match 'warm_home_app_still_resumed') 'home_resumed_guard'
Assert-True ($runnerSource -match 'warm_home_pid_changed') 'home_pid_guard'
Assert-True ($runnerSource -match 'if \(-not \$warmUi\.safeForWarm\)') 'warm_safe_guard'
foreach ($field in @('runnerSourceSha256', 'classifierSourceSha256', 'classifierHelperSha256')) {
    Assert-True (($runnerSource | Select-String -Pattern $field -AllMatches).Matches.Count -ge 2) "source_identity_$field"
}

$script:cleanupActions = [System.Collections.Generic.List[string]]::new()
$script:cleanupMode = 'success'
$ExpectedPackage = 'com.doso.robot.qa'
$RemoteUiPath = '/sdcard/doso-native-ui-fixture.xml'
$deviceReady = $true
$remoteUiMayExist = $false
$actionStarted = $true
$networkMutationAttempted = $true
$offlineVerified = $true
$originalNetwork = [ordered]@{ airplane = $false; wifi = $true; mobileData = $true; defaultNetwork = 'present' }
$finalForceStopSucceeded = $false
$restoreSkippedReason = $null
$networkLeftIsolated = $false
$ownedEmulatorStopRequired = $false
$restoreResult = [ordered]@{ attempted = $false; switchesRestored = $false; defaultNetworkRestored = $false }
$outcome = 'failed'
$phaseCode = 'cold_start_failed'

function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode, [int] $TimeoutSeconds)
    if ($Arguments -contains 'rm') {
        [void] $script:cleanupActions.Add('remote-remove')
        if ($script:cleanupMode -eq 'remote-failure') { Stop-WithPhase 'remote_ui_remove_failed' }
        return ''
    }
    if ($Arguments -contains 'force-stop') {
        [void] $script:cleanupActions.Add('force-stop')
        if ($script:cleanupMode -eq 'force-stop-failure') { Stop-WithPhase 'final_force_stop_failed' }
        return ''
    }
    throw 'native_ui_runner_test:unexpected_cleanup_adb'
}

function Set-AirplaneMode {
    param([bool] $Enabled, [string] $PhasePrefix)
    [void] $script:cleanupActions.Add('restore-airplane')
}

function Set-RadioSwitch {
    param([string] $Radio, [bool] $Enabled, [string] $PhasePrefix)
    [void] $script:cleanupActions.Add("restore-$Radio")
}

function Wait-NetworkState {
    param($Expected, [string] $PhasePrefix)
    [void] $script:cleanupActions.Add('verify-network')
    return $Expected
}

$cleanupState = Invoke-CleanupFinally -Ast $runnerAst
Assert-True (($cleanupActions -join ',') -eq 'force-stop,restore-airplane,restore-wifi,restore-data,verify-network') 'failure_cleanup_order'
Assert-True ($cleanupState.finalForceStopSucceeded) 'failure_force_stop_success'
Assert-True ($restoreResult.attempted -and $restoreResult.switchesRestored -and $restoreResult.defaultNetworkRestored) 'failure_network_restored'
Assert-True ($cleanupState.phaseCode -eq 'cold_start_failed') 'failure_phase_preserved'

$cleanupActions.Clear()
$cleanupMode = 'remote-failure'
$remoteUiMayExist = $true
$finalForceStopSucceeded = $false
$restoreSkippedReason = $null
$networkLeftIsolated = $false
$ownedEmulatorStopRequired = $false
$restoreResult = [ordered]@{ attempted = $false; switchesRestored = $false; defaultNetworkRestored = $false }
$outcome = 'completed'
$phaseCode = 'complete'
$cleanupState = Invoke-CleanupFinally -Ast $runnerAst
Assert-True (($cleanupActions -join ',') -eq 'remote-remove,force-stop,restore-airplane,restore-wifi,restore-data,verify-network') 'remote_cleanup_independent'
Assert-True ($cleanupState.outcome -eq 'failed' -and $cleanupState.phaseCode -eq 'remote_ui_remove_failed') 'remote_failure_recorded'
Assert-True ($restoreResult.switchesRestored) 'remote_failure_restored'

$cleanupActions.Clear()
$cleanupMode = 'force-stop-failure'
$remoteUiMayExist = $false
$finalForceStopSucceeded = $false
$restoreSkippedReason = $null
$networkLeftIsolated = $false
$ownedEmulatorStopRequired = $false
$restoreResult = [ordered]@{ attempted = $false; switchesRestored = $false; defaultNetworkRestored = $false }
$outcome = 'completed'
$phaseCode = 'complete'
$cleanupState = Invoke-CleanupFinally -Ast $runnerAst
Assert-True (($cleanupActions -join ',') -eq 'force-stop') 'stop_failure_blocks_restore'
Assert-True ($cleanupState.outcome -eq 'failed' -and $cleanupState.phaseCode -eq 'final_force_stop_failed') 'stop_failure_recorded'
Assert-True (-not $restoreResult.attempted) 'stop_failure_restore_not_attempted'
Assert-True ($cleanupState.restoreSkippedReason -eq 'app_stop_unconfirmed') 'stop_failure_reason'
Assert-True ($cleanupState.networkLeftIsolated -and $cleanupState.ownedEmulatorStopRequired) 'stop_failure_isolation_flags'

$script:actionMode = 'safe-warm'
$script:actionCommands = [System.Collections.Generic.List[string]]::new()
$script:actionAppReads = 0
$script:actionUiReads = 0
$offlineNetwork = [ordered]@{ airplane = $true; wifi = $false; mobileData = $false; defaultNetwork = 'none' }
$UiTimeoutSeconds = 20

function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode, [int] $TimeoutSeconds)
    if ($Arguments -contains 'force-stop') { [void] $script:actionCommands.Add('force-stop'); return '' }
    if ($Arguments -contains 'start') {
        [void] $script:actionCommands.Add('start')
        if ($script:actionMode -eq 'cold-failure') { throw 'DosoNativePhase:cold_start_failed' }
        return "Status: ok`nActivity: $ExpectedActivity"
    }
    if ($Arguments -contains 'KEYCODE_HOME') { [void] $script:actionCommands.Add('home'); return '' }
    throw 'native_ui_runner_test:unexpected_action_adb'
}

function Set-AirplaneMode { param([bool] $Enabled, [string] $PhasePrefix); [void] $script:actionCommands.Add('airplane') }
function Set-RadioSwitch { param([string] $Radio, [bool] $Enabled, [string] $PhasePrefix); [void] $script:actionCommands.Add($Radio) }
function Wait-NetworkState { param($Expected, [string] $PhasePrefix); [void] $script:actionCommands.Add('network-check'); return $Expected }
function Start-Sleep { param([int] $Seconds) }
function Read-AppState {
    param([string] $PhasePrefix)
    $script:actionAppReads += 1
    if ($script:actionAppReads -eq 1) { return [ordered]@{ pid = '4242'; pidPresent = $true; activityResumed = $true } }
    if ($script:actionAppReads -eq 2) { return [ordered]@{ pid = '4242'; pidPresent = $true; activityResumed = $false } }
    return [ordered]@{ pid = '4242'; pidPresent = $true; activityResumed = $true }
}
function Get-SanitizedUiState {
    param([bool] $ActivityResumed, [string] $PhasePrefix)
    $script:actionUiReads += 1
    return [ordered]@{
        state = 'signed-out-login'; scope = 'app'; nodeCount = 6; appNodeCount = 6; inputNodeCount = 2
        markerIds = @('auth-entry-header', 'login-form', 'login-email', 'login-password', 'login-submit', 'login-register')
        foreignNodeCounts = [ordered]@{
            framework = 0; systemUi = 0; permissionController = 0; inputMethod = 0; launcher = 0
            settings = 0; shell = 0; dosoNamespace = 0; missingPackage = 0; other = 0
        }
        foreignMarkerIds = @()
        safeForWarm = $true; rawValuesRetained = $false
    }
}

$coldResult = $null
$warmResult = [ordered]@{ attempted = $false; reason = 'not_reached' }
$actionStarted = $false
$networkMutationAttempted = $false
$offlineVerified = $false
$remoteUiMayExist = $false
$outcome = 'failed'
$phaseCode = 'preflight_complete'
$acceptanceVerdict = 'not_evaluated'
$actionState = Invoke-ActionSegment -Ast $runnerAst
Assert-True ($null -eq $actionState.exceptionCode) 'safe_warm_action_exception'
Assert-True ($actionState.outcome -eq 'completed' -and $actionState.acceptanceVerdict -eq 'passed') 'safe_warm_verdict'
Assert-True ($actionState.warmResult.attempted -and $actionState.warmResult.samePid -and $actionState.warmResult.sameCoarseState) 'safe_warm_result'
Assert-True (($actionCommands -join ',') -eq 'force-stop,airplane,wifi,data,network-check,start,home,network-check,start') 'safe_warm_sequence'
Assert-True ($actionAppReads -eq 3 -and $actionUiReads -eq 2) 'safe_warm_observations'

$actionMode = 'cold-failure'
$actionCommands.Clear()
$actionAppReads = 0
$actionUiReads = 0
$coldResult = $null
$warmResult = [ordered]@{ attempted = $false; reason = 'not_reached' }
$actionStarted = $false
$networkMutationAttempted = $false
$offlineVerified = $false
$remoteUiMayExist = $false
$outcome = 'failed'
$phaseCode = 'preflight_complete'
$acceptanceVerdict = 'not_evaluated'
$failedAction = Invoke-ActionSegment -Ast $runnerAst
Assert-True ($failedAction.exceptionCode -eq 'DosoNativePhase:cold_start_failed') 'cold_failure_code'
Assert-True ($failedAction.actionStarted -and $failedAction.networkMutationAttempted -and $failedAction.offlineVerified) 'cold_failure_action_state'

function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode, [int] $TimeoutSeconds)
    if ($Arguments -contains 'force-stop') { [void] $script:cleanupActions.Add('force-stop'); return '' }
    throw 'native_ui_runner_test:unexpected_post_failure_adb'
}
function Set-AirplaneMode { param([bool] $Enabled, [string] $PhasePrefix); [void] $script:cleanupActions.Add('restore-airplane') }
function Set-RadioSwitch { param([string] $Radio, [bool] $Enabled, [string] $PhasePrefix); [void] $script:cleanupActions.Add("restore-$Radio") }
function Wait-NetworkState { param($Expected, [string] $PhasePrefix); [void] $script:cleanupActions.Add('verify-network'); return $Expected }

$cleanupActions.Clear()
$cleanupMode = 'success'
$deviceReady = $true
$remoteUiMayExist = [bool] $failedAction.remoteUiMayExist
$actionStarted = [bool] $failedAction.actionStarted
$networkMutationAttempted = [bool] $failedAction.networkMutationAttempted
$finalForceStopSucceeded = $false
$restoreSkippedReason = $null
$networkLeftIsolated = $false
$ownedEmulatorStopRequired = $false
$restoreResult = [ordered]@{ attempted = $false; switchesRestored = $false; defaultNetworkRestored = $false }
$outcome = 'failed'
$phaseCode = 'cold_start_failed'
$cleanupState = Invoke-CleanupFinally -Ast $runnerAst
Assert-True (($cleanupActions -join ',') -eq 'force-stop,restore-airplane,restore-wifi,restore-data,verify-network') 'cold_failure_cleanup_sequence'
Assert-True ($cleanupState.phaseCode -eq 'cold_start_failed' -and $restoreResult.switchesRestored) 'cold_failure_restored'

Write-Output 'native-ui-runner-mock-tests=PASS'
