[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$runnerPath = Join-Path $PSScriptRoot 'verify-native-ui-lifecycle.ps1'
$tokens = $null
$parseErrors = $null
$runnerAst = [System.Management.Automation.Language.Parser]::ParseFile($runnerPath, [ref] $tokens, [ref] $parseErrors)
if ($parseErrors.Count) { throw 'transport_test:runner_syntax' }
foreach ($name in @('Stop-WithPhase', 'Get-FixedPhaseCode', 'Get-TransportDiagnostic', 'Invoke-ProcessUtf8')) {
    $definition = $runnerAst.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
    if ($definition) { . ([scriptblock]::Create($definition.Extent.Text)) }
}
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$nodePath = @(Get-Command node -CommandType Application)[0].Source

function Assert-True([bool] $Condition, [string] $Code) {
    if (-not $Condition) { throw "transport_test:$Code" }
}

function Invoke-ObservedProcess {
    param([hashtable] $Parameters)
    $record = $null
    $output = $null
    try { $output = Invoke-ProcessUtf8 @Parameters }
    catch { $record = $_ }
    $diagnostic = if ($record -and (Get-Command Get-TransportDiagnostic -CommandType Function -ErrorAction SilentlyContinue)) {
        Get-TransportDiagnostic -Record $record
    } else { $null }
    return [ordered]@{
        failed = $null -ne $record
        phaseCode = if ($record) { Get-FixedPhaseCode -Record $record } else { $null }
        diagnostic = $diagnostic
        output = $output
    }
}

$nonzero = Invoke-ObservedProcess -Parameters @{
    Executable = $nodePath
    Arguments = @('-e', 'process.stdout.write("transport-stdout-canary"); process.stderr.write("transport-stderr-canary"); process.exit(37)')
    TimeoutSeconds = 5
    PhaseCode = 'fixture_exit'
}
Assert-True ($nonzero.failed -and $nonzero.phaseCode -ceq 'fixture_exit_failed') 'nonzero_fixed_phase'
Assert-True ($null -ne $nonzero.diagnostic) 'nonzero_exit_diagnostic_retained'
Assert-True ($nonzero.diagnostic.transportStatus -ceq 'nonzero_exit' -and $nonzero.diagnostic.exitCode -ceq 37) 'nonzero_exact_numeric_exit'
$nonzeroJson = $nonzero | ConvertTo-Json -Depth 8
Assert-True ($nonzeroJson -notmatch 'transport-stdout-canary|transport-stderr-canary') 'nonzero_no_raw_output'

$clean = Invoke-ObservedProcess -Parameters @{
    Executable = $nodePath; Arguments = @('-e', 'process.stdout.write("完成"); process.stderr.write("transport-success-stderr-canary")')
    TimeoutSeconds = 5; PhaseCode = 'fixture_clean'
}
Assert-True (-not $clean.failed -and $null -eq $clean.diagnostic -and $null -eq $clean.phaseCode) 'success_no_stale_diagnostic'
Assert-True ($clean.output -ceq '完成') 'success_utf8_contract_unchanged'

$negative = Invoke-ObservedProcess -Parameters @{
    Executable = $nodePath; Arguments = @('-e', 'process.exit(-7)'); TimeoutSeconds = 5; PhaseCode = 'fixture_negative'
}
Assert-True ($negative.failed -and $negative.phaseCode -ceq 'fixture_negative_failed') 'negative_exit_fixed_phase'
Assert-True ($null -ne $negative.diagnostic -and $negative.diagnostic.transportStatus -ceq 'nonzero_exit' `
    -and $negative.diagnostic.exitCode -is [int] -and $negative.diagnostic.exitCode -eq -7) 'negative_int32_exit_preserved'

$missing = Invoke-ObservedProcess -Parameters @{
    Executable = Join-Path $PSScriptRoot ('nonexistent-transport-fixture-' + [guid]::NewGuid().ToString('N') + '.exe')
    Arguments = @('transport-argument-canary'); TimeoutSeconds = 5; PhaseCode = 'fixture_start'
}
Assert-True ($missing.failed -and $missing.phaseCode -ceq 'fixture_start_start_failed') 'start_failure_fixed_phase'
Assert-True ($null -ne $missing.diagnostic -and $missing.diagnostic.transportStatus -ceq 'start_failed' `
    -and $null -eq $missing.diagnostic.exitCode) 'start_failure_status_no_exit_code'

$timeoutTag = 'doso-transport-timeout-fixture-' + [guid]::NewGuid().ToString('N')
$timedOut = Invoke-ObservedProcess -Parameters @{
    Executable = $nodePath; Arguments = @('-e', 'process.stdout.write("transport-timeout-stdout-canary"); process.stderr.write("transport-timeout-stderr-canary"); setInterval(()=>{},1000)', '--', $timeoutTag)
    TimeoutSeconds = 1; PhaseCode = 'fixture_timeout'
}
Assert-True ($timedOut.failed -and $timedOut.phaseCode -ceq 'fixture_timeout_timeout') 'timeout_fixed_phase'
Assert-True ($null -ne $timedOut.diagnostic -and $timedOut.diagnostic.transportStatus -ceq 'timeout' `
    -and $null -eq $timedOut.diagnostic.exitCode) 'timeout_status_no_kill_exit_code'
$remainingTimeoutFixture = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -ceq 'node.exe' -and $_.CommandLine -like "*$timeoutTag*" })
Assert-True ($remainingTimeoutFixture.Count -eq 0) 'timeout_owned_child_closed'

$stdinFailure = Invoke-ObservedProcess -Parameters @{
    Executable = $nodePath; Arguments = @('-e', 'process.stderr.write("transport-stdin-stderr-canary"); process.exit(41)')
    TimeoutSeconds = 10; PhaseCode = 'fixture_stdin'; InputText = ('transport-stdin-canary' * 65536)
}
Assert-True ($stdinFailure.failed -and $stdinFailure.phaseCode -ceq 'fixture_stdin_failed') 'stdin_failure_existing_phase_unchanged'
Assert-True ($null -ne $stdinFailure.diagnostic -and $stdinFailure.diagnostic.transportStatus -ceq 'stdin_failed' `
    -and $null -eq $stdinFailure.diagnostic.exitCode) 'stdin_failure_not_confused_with_exit'

foreach ($observed in @($nonzero, $clean, $negative, $missing, $timedOut, $stdinFailure)) {
    if ($null -ne $observed.diagnostic) {
        $keys = @($observed.diagnostic.Keys | Sort-Object)
        Assert-True (($keys -join ',') -ceq 'exitCode,transportStatus') 'diagnostic_exact_fixed_keys'
    }
    $json = $observed | ConvertTo-Json -Depth 8
    Assert-True ($json -notmatch 'transport-[a-z-]+canary|nonexistent-transport-fixture|doso-transport-timeout-fixture') 'all_failures_no_raw_values'
}
Write-Output 'native-process-transport-tests=PASS scenarios=6'
