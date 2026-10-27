[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'verify-native-ui-lifecycle.ps1'), [ref] $tokens, [ref] $parseErrors)
if ($parseErrors.Count) { throw 'airplane_contract_test:syntax' }
foreach ($name in @('Stop-WithPhase', 'Set-AirplaneMode')) {
    $definition = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    . ([scriptblock]::Create($definition.Extent.Text))
}

function Assert-True([bool] $Condition, [string] $Code) {
    if (-not $Condition) { throw "airplane_contract_test:$Code" }
}

$script:commands = [System.Collections.Generic.List[string]]::new()
$script:mode = 'enabled'
$script:failCommand = $false
$script:failState = $false
function Invoke-Adb {
    param([string[]] $Arguments, [string] $PhaseCode)
    $command = $Arguments -join ' '
    [void] $script:commands.Add($command)
    if ($command -in @('shell cmd connectivity airplane-mode enable', 'shell cmd connectivity airplane-mode disable')) {
        if ($script:failCommand) { Stop-WithPhase "${PhaseCode}_failed" }
        return 'synthetic-private-setter-output'
    }
    if ($command -eq 'shell cmd connectivity airplane-mode') {
        if ($script:failState) { Stop-WithPhase "${PhaseCode}_failed" }
        return $script:mode
    }
    throw 'airplane_contract_test:unexpected_legacy_command'
}

$output = @(Set-AirplaneMode -Enabled $true -PhasePrefix 'offline_airplane')
Assert-True ($output.Count -eq 0) 'no_command_output_echo'
Assert-True (($script:commands -join ',') -eq 'shell cmd connectivity airplane-mode enable,shell cmd connectivity airplane-mode') 'supported_service_command_and_readback'

$script:commands.Clear()
$script:mode = 'disabled'
[void] (Set-AirplaneMode -Enabled $false -PhasePrefix 'restore_airplane')
Assert-True (($script:commands -join ',') -eq 'shell cmd connectivity airplane-mode disable,shell cmd connectivity airplane-mode') 'restore_supported_command_and_readback'

foreach ($case in @(
    @{ mode = 'disabled'; commandFail = $false; stateFail = $false; prefix = 'offline_airplane'; phase = 'offline_airplane_state_mismatch'; count = 2 },
    @{ mode = 'synthetic-private-email@example.invalid-87654321'; commandFail = $false; stateFail = $false; prefix = 'offline_airplane'; phase = 'offline_airplane_state_mismatch'; count = 2 },
    @{ mode = 'enabled'; commandFail = $true; stateFail = $false; prefix = 'offline_airplane'; phase = 'offline_airplane_command_failed'; count = 1 },
    @{ mode = 'enabled'; commandFail = $false; stateFail = $true; prefix = 'offline_airplane'; phase = 'offline_airplane_state_failed'; count = 2 },
    @{ mode = 'disabled'; commandFail = $false; stateFail = $false; prefix = 'restore_airplane'; phase = 'restore_airplane_state_mismatch'; count = 2 }
)) {
    $script:commands.Clear()
    $script:mode = $case.mode
    $script:failCommand = $case.commandFail
    $script:failState = $case.stateFail
    $failure = $null
    try { [void] (Set-AirplaneMode -Enabled $true -PhasePrefix $case.prefix) } catch { $failure = $_.Exception.Message }
    Assert-True ($failure -ceq "DosoNativePhase:$($case.phase)") 'fixed_failure_phase'
    Assert-True ($script:commands.Count -eq $case.count) 'no_retry_or_fallback'
    Assert-True ($failure -notmatch 'synthetic-private|87654321|example.invalid') 'no_state_echo'
}
Write-Output 'native-airplane-command-tests=PASS scenarios=7'
