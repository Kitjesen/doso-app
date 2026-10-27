[CmdletBinding()]
param(
    [Parameter()]
    [string] $AdbPath = 'adb',

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $Serial = 'emulator-5554',

    [Parameter()]
    [ValidateRange(1, 65535)]
    [int] $Port = 8081,

    [Parameter()]
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_.]*$')]
    [string] $Package = 'com.doso.robot',

    [Parameter()]
    [ValidatePattern('^[A-Za-z][A-Za-z0-9+.-]*$')]
    [string] $Scheme = 'doso',

    [Parameter()]
    [switch] $RestartApp
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-MetroReady {
    param(
        [Parameter(Mandatory)]
        [int] $TargetPort
    )

    $metroBaseUrl = "http://127.0.0.1:$TargetPort"
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.UseProxy = $false
    $client = [System.Net.Http.HttpClient]::new($handler, $true)
    $client.Timeout = [TimeSpan]::FromSeconds(5)

    try {
        $response = $client.GetAsync("$metroBaseUrl/status").GetAwaiter().GetResult()
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult().Trim()

        if (-not $response.IsSuccessStatusCode -or $body -ne 'packager-status:running') {
            throw "Metro status check failed at $metroBaseUrl/status (HTTP $([int] $response.StatusCode), body '$body')."
        }
    }
    catch {
        if ($_.Exception.Message -like 'Metro status check failed*') {
            throw
        }

        throw "Metro is not ready at $metroBaseUrl. Start it with 'npx expo start --dev-client --port $TargetPort', then retry. $($_.Exception.Message)"
    }
    finally {
        $client.Dispose()
    }

    return $metroBaseUrl
}

function Resolve-Adb {
    param(
        [Parameter(Mandatory)]
        [string] $Candidate
    )

    $command = Get-Command -Name $Candidate -CommandType Application -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "adb was not found at '$Candidate'. Pass -AdbPath with the Android platform-tools adb executable."
    }

    return $command.Source
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory)]
        [string] $Executable,

        [Parameter(Mandatory)]
        [string[]] $Arguments
    )

    $output = @(& $Executable @Arguments 2>&1)
    $exitCode = $LASTEXITCODE
    $text = ($output | ForEach-Object { [string] $_ }) -join [Environment]::NewLine

    if ($exitCode -ne 0) {
        throw "adb failed with exit code ${exitCode}: $Executable $($Arguments -join ' ')$([Environment]::NewLine)$text"
    }

    return $text.Trim()
}

# Keep this first: a missing Metro server must never result in adb/device changes.
$metroBaseUrl = Assert-MetroReady -TargetPort $Port
$resolvedAdb = Resolve-Adb -Candidate $AdbPath

$deviceState = Invoke-Adb -Executable $resolvedAdb -Arguments @('-s', $Serial, 'get-state')
if ($deviceState -ne 'device') {
    throw "Android target '$Serial' is not ready (adb state '$deviceState')."
}

$packagePath = Invoke-Adb -Executable $resolvedAdb -Arguments @('-s', $Serial, 'shell', 'pm', 'path', $Package)
if ($packagePath -notmatch '(?m)^package:') {
    throw "Android package '$Package' is not installed on '$Serial'."
}

Invoke-Adb -Executable $resolvedAdb -Arguments @('-s', $Serial, 'reverse', "tcp:$Port", "tcp:$Port") | Out-Null

if ($RestartApp) {
    Invoke-Adb -Executable $resolvedAdb -Arguments @('-s', $Serial, 'shell', 'am', 'force-stop', $Package) | Out-Null
}

$encodedMetroUrl = [Uri]::EscapeDataString($metroBaseUrl)
$devClientUrl = "${Scheme}://expo-development-client/?url=$encodedMetroUrl"
$activity = "$Package/.MainActivity"
$launchOutput = Invoke-Adb -Executable $resolvedAdb -Arguments @(
    '-s', $Serial,
    'shell', 'am', 'start', '-W',
    '-n', $activity,
    '-a', 'android.intent.action.VIEW',
    '-c', 'android.intent.category.BROWSABLE',
    '-d', $devClientUrl
)

if ($launchOutput -match '(?m)^(Error|Exception):') {
    throw "Android rejected the development-client launch.$([Environment]::NewLine)$launchOutput"
}

[pscustomobject]@{
    serial = $Serial
    package = $Package
    activity = $activity
    metroUrl = $metroBaseUrl
    developmentClientUrl = $devClientUrl
    launch = $launchOutput
}
