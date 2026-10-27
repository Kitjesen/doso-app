[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$runnerPath = Join-Path $PSScriptRoot 'verify-native-ui-lifecycle.ps1'
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $runnerPath), [ref] $tokens, [ref] $errors)
if ($errors.Count) { throw 'native_error_window_schema:runner_parse' }
function Assert-True { param([bool] $Condition, [string] $Code) if (-not $Condition) { throw "native_error_window_schema:$Code" } }
function Import-RunnerFunction { param([string] $Name) $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name }, $true); if ($null -eq $definition) { throw "native_error_window_schema:missing_$Name" }; Set-Item -Path "Function:script:$Name" -Value $definition.Body.GetScriptBlock() }
function Stop-WithPhase { param([string] $PhaseCode) throw $PhaseCode }
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
Import-RunnerFunction 'New-WindowDiagnostic'
Import-RunnerFunction 'Convert-ErrorWindowResult'
$default = New-WindowDiagnostic
Assert-True ($default.status -eq 'not_requested' -and $default.windowKind -eq 'unknown' -and $default.expectedTitleMatch -eq 'unknown' -and $default.rawValuesRetained -eq $false) 'default_schema'
$captured = New-WindowDiagnostic -Status 'captured'
Assert-True ($captured.status -eq 'captured' -and $captured.rawValuesRetained -eq $false) 'captured_schema'
$valid = Convert-ErrorWindowResult -JsonText '{"windowKind":"anr-title","expectedTitleMatch":"match","rawValuesRetained":false}'
Assert-True ($valid.windowKind -eq 'anr-title' -and $valid.expectedTitleMatch -eq 'match' -and $valid.rawValuesRetained -eq $false) 'valid_classifier'
foreach ($json in @(
    '{"status":"captured","windowKind":"anr-title","expectedTitleMatch":"match","rawValuesRetained":false}',
    '{"windowKind":"unknown","expectedTitleMatch":"match","rawValuesRetained":false}',
    '{"windowKind":"anr-title","expectedTitleMatch":"match","rawValuesRetained":true}',
    '{"windowKind":"private-title","expectedTitleMatch":"unknown","rawValuesRetained":false}'
)) {
    $failed = $false
    try { [void](Convert-ErrorWindowResult -JsonText $json) } catch { $failed = $true }
    Assert-True $failed 'malformed_schema_rejected'
}
$schemaCaseIndex = 0
foreach ($json in @('null', '[]', '{"windowKind":"unknown"}',
    '{"windowKind":"ANR-TITLE","expectedTitleMatch":"match","rawValuesRetained":false}',
    '{"windowKind":"anr-title","expectedTitleMatch":true,"rawValuesRetained":false}',
    '{"windowKind":"anr-title","expectedTitleMatch":"unknown","rawValuesRetained":false}',
    '{"windowKind":"unknown","expectedTitleMatch":"unknown","rawValuesRetained":"false"}',
    '{"windowKind":"unknown","expectedTitleMatch":"unknown","rawValuesRetained":false,"privateKey":"private-schema-canary"}',
    '{"private":"private-json-canary"', ('x' * 4097))) {
    $schemaCaseIndex++
    $code = $null
    try { [void](Convert-ErrorWindowResult -JsonText $json) } catch { $code = $_.Exception.Message }
    Assert-True ($code -match '^window_classifier_(output|schema|value|consistency)_invalid$') "strict_fixed_schema_code_$schemaCaseIndex"
    Assert-True ($code -notmatch 'private-|canary') 'schema_error_no_input_echo'
}

Import-RunnerFunction 'Stop-WithPhase'
Import-RunnerFunction 'Invoke-ProcessUtf8'
Import-RunnerFunction 'Get-SanitizedErrorWindow'
$WindowClassifierPath = Join-Path $PSScriptRoot 'classify-native-error-window.mjs'
$script:ResolvedNode = @(Get-Command node -CommandType Application)[0].Source
$UiTimeoutSeconds = 5; $NodeTimeoutSeconds = 5
$displayFixture = "WINDOW MANAGER DISPLAY CONTENTS (dumpsys window displays)`n  mCurrentFocus=Window{a1b2 u0 Application Not Responding: com.doso.robot.qa}"
$windowFixture = "WINDOW MANAGER WINDOWS (dumpsys window windows)`n  Window #0 Window{a1b2 u0 Application Not Responding: com.doso.robot.qa}:`n    mOwnerUid=1000 showForAllUsers=false package=android appop=NONE`n  Window #1 Window{b3c4 u0 Other}:`n    mSession=private-window-transport-canary"
$script:readMode = 'success'
$script:readCommands = [System.Collections.Generic.List[string]]::new()
function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode, [int] $TimeoutSeconds)
    $command = $Arguments -join ' '
    [void] $script:readCommands.Add($command)
    if ($command -ceq 'shell dumpsys window displays') {
        if ($script:readMode -in @('first-timeout','first-start','first-exit')) {
            $status = @{ 'first-timeout'='timeout'; 'first-start'='start_failed'; 'first-exit'='nonzero_exit' }[$script:readMode]
            $code = if ($status -ceq 'nonzero_exit') { 17 } else { $null }
            Stop-WithPhase 'fixture_window_read_failed' -TransportStatus $status -ExitCode $code
        }
        if ($script:readMode -ceq 'invalid-focus') { return 'private-invalid-focus-canary' }
        if ($script:readMode -ceq 'control') { return $displayFixture + [char]0 }
        if ($script:readMode -ceq 'oversized') { return $displayFixture + ('x' * 2MB) }
        return $displayFixture
    }
    if ($command -ceq 'shell dumpsys window windows') {
        if ($script:readMode -ceq 'second-exit') { Stop-WithPhase 'fixture_window_read_failed' -TransportStatus 'nonzero_exit' -ExitCode 19 }
        return $windowFixture
    }
    throw 'window_test:unexpected_command'
}
$good = Get-SanitizedErrorWindow -ExpectedProcessKnown $true -MarkerIds @('android:id/aerr_close','android:id/aerr_wait')
Assert-True ($good.status -ceq 'captured' -and $good.windowKind -ceq 'anr-title' -and $good.expectedTitleMatch -ceq 'match') 'real_node_cli_utf8_window_boundary'
Assert-True (($script:readCommands -join ',') -ceq 'shell dumpsys window displays,shell dumpsys window windows') 'exact_two_current_only_reads'
foreach ($mode in @('first-timeout','first-start','first-exit','second-exit','invalid-focus','control','oversized')) {
    $script:readMode = $mode; $script:readCommands.Clear()
    $result = Get-SanitizedErrorWindow -ExpectedProcessKnown $true -MarkerIds @('android:id/aerr_wait')
    $expectedStatus = if ($mode -in @('invalid-focus','control','oversized')) { 'captured' } else { 'read_failed' }
    Assert-True ($result.status -ceq $expectedStatus -and $result.windowKind -ceq 'unknown' -and $result.expectedTitleMatch -ceq 'unknown') 'failed_or_unusable_read_closed'
    $expectedReads = if ($mode -ceq 'second-exit') { 2 } else { 1 }
    Assert-True ($script:readCommands.Count -eq $expectedReads) 'no_read_retry_or_fallback'
    Assert-True (($result | ConvertTo-Json -Compress) -notmatch 'private-|canary|a1b2|mCurrentFocus|mSession|title.*qa') 'read_result_no_raw_values'
}
$script:readCommands.Clear()
$unknown = Get-SanitizedErrorWindow -ExpectedProcessKnown $false -MarkerIds @()
Assert-True ($unknown.status -ceq 'not_requested' -and $script:readCommands.Count -eq 0) 'unknown_process_no_read'
Write-Output 'native-error-window-schema-read-tests=PASS schema/canary/realCLI/7failure-or-unusable/unknown-process'
