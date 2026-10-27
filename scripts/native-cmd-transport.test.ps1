[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$runnerPath = Join-Path $PSScriptRoot 'verify-native-ui-lifecycle.ps1'
$tokens = $null
$parseErrors = $null
$runnerAst = [System.Management.Automation.Language.Parser]::ParseFile(
    $runnerPath, [ref] $tokens, [ref] $parseErrors
)
if ($parseErrors.Count) { throw 'cmd_transport_test:runner_syntax' }
foreach ($name in @('Stop-WithPhase', 'Get-FixedPhaseCode', 'Get-TransportDiagnostic', 'Invoke-ProcessUtf8')) {
    $definition = $runnerAst.Find({
        param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true)
    if ($definition) { . ([scriptblock]::Create($definition.Extent.Text)) }
}
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$cmdPath = (@(Get-Command cmd.exe -CommandType Application) | Select-Object -First 1).Source

function Assert-True([bool] $Condition, [string] $Code) {
    if (-not $Condition) { throw "cmd_transport_test:$Code" }
}

function Invoke-ObservedCmd {
    param([string[]] $Arguments, [AllowNull()][string] $InputText = $null, [string] $PhaseCode)
    $record = $null
    $output = $null
    try {
        if ($PSBoundParameters.ContainsKey('InputText') -and $null -ne $InputText) {
            $output = Invoke-ProcessUtf8 -Executable $cmdPath -Arguments $Arguments -TimeoutSeconds 5 `
                -PhaseCode $PhaseCode -InputText $InputText
        } else {
            $output = Invoke-ProcessUtf8 -Executable $cmdPath -Arguments $Arguments -TimeoutSeconds 5 `
                -PhaseCode $PhaseCode
        }
    } catch { $record = $_ }
    return [ordered]@{
        failed = $null -ne $record
        phaseCode = if ($record) { Get-FixedPhaseCode -Record $record } else { $null }
        diagnostic = if ($record) { Get-TransportDiagnostic -Record $record } else { $null }
        output = $output
    }
}

$relativeBat = 'scripts\fixtures\native-cmd\cmd-probe.bat'
# Characterization only: passing assertions do not mean every transport shape is supported.
$simple = Invoke-ObservedCmd -Arguments @('/d', '/c', $relativeBat, 'simple', 'alpha', 'com.synthetic.qa;fixture') `
    -PhaseCode 'cmd_simple'
Assert-True (-not $simple.failed -and $simple.output -ceq 'cmd-fixture=PASS mode=simple') 'simple_sdk_shape'
Assert-True ($null -eq $simple.phaseCode -and $null -eq $simple.diagnostic) 'simple_no_diagnostic'

$spaceArgument = Invoke-ObservedCmd -Arguments @('/d', '/c', $relativeBat, 'space', 'space value', 'tail') `
    -PhaseCode 'cmd_space_argument'
Assert-True (-not $spaceArgument.failed -and $spaceArgument.output -ceq 'cmd-fixture=PASS mode=space') 'space_argument_without_space_entry'
Assert-True ($null -eq $spaceArgument.diagnostic) 'space_argument_no_diagnostic'

$spaceBat = 'scripts\fixtures\native-cmd\space fixture.bat'
$space = Invoke-ObservedCmd -Arguments @('/d', '/c', $spaceBat, 'space', 'space value', 'tail') `
    -PhaseCode 'cmd_space'
Assert-True ($space.failed -and $space.phaseCode -ceq 'cmd_space_failed') 'space_path_boundary_fixed_phase'
Assert-True ($space.diagnostic.transportStatus -ceq 'nonzero_exit' `
    -and $space.diagnostic.exitCode -is [int] -and $space.diagnostic.exitCode -eq 1) 'space_path_boundary_exit1'
Assert-True ($null -eq $space.output) 'space_path_boundary_no_output'

$stdin = Invoke-ObservedCmd -Arguments @('/d', '/c', $relativeBat, 'stdin', 'com.synthetic.qa;stdin') `
    -InputText '输入Ω-no-newline' -PhaseCode 'cmd_stdin'
Assert-True (-not $stdin.failed -and $stdin.output -ceq 'cmd-fixture=PASS mode=stdin 完成') 'utf8_stdin_without_newline'
Assert-True ($null -eq $stdin.phaseCode -and $null -eq $stdin.diagnostic) 'stdin_no_diagnostic'

$exit37 = Invoke-ObservedCmd -Arguments @('/d', '/c', $relativeBat, 'exit37') -PhaseCode 'cmd_exit'
Assert-True ($exit37.failed -and $exit37.phaseCode -ceq 'cmd_exit_failed') 'exit37_fixed_phase'
Assert-True ($exit37.diagnostic.transportStatus -ceq 'nonzero_exit' `
    -and $exit37.diagnostic.exitCode -is [int] -and $exit37.diagnostic.exitCode -eq 37) 'exit37_diagnostic'
Assert-True ($null -eq $exit37.output) 'exit37_no_output'

Write-Output 'native-cmd-transport-characterization=PASS supported=4 knownUnsupported=1 sdkRootCause=not_established'
