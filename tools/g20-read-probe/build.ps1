$ErrorActionPreference = 'Stop'
$probeRoot = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $probeRoot '../..')).Path
$evidenceRoot = Join-Path $repoRoot 'evidence/20261028-g20-pc-50hz-01'
$probeBuild = Join-Path $probeRoot 'build'
$probeJdk = 'D:/Android/Android Studio/jbr/bin'
$probeSdk = 'D:/software/Android'
$probeTools = Join-Path $probeSdk 'build-tools/35.0.0'
$androidJar = Join-Path $probeSdk 'platforms/android-35/android.jar'
$grpcCompileJars = @('grpc-api','grpc-core','grpc-okhttp','grpc-util') | ForEach-Object {
  Get-ChildItem -LiteralPath "$env:USERPROFILE/.gradle/caches/modules-2/files-2.1/io.grpc/$_/1.85.1" -Filter '*.jar' -Recurse | Select-Object -First 1 -ExpandProperty FullName
}
$probeCompileClasspath = (@($androidJar) + $grpcCompileJars) -join [IO.Path]::PathSeparator
New-Item -ItemType Directory -Force -Path $evidenceRoot,$probeBuild,(Join-Path $probeBuild 'classes'),(Join-Path $probeBuild 'dex') | Out-Null
function Check-ProbeStep { if ($LASTEXITCODE -ne 0) { throw "Probe build failed: native exit $LASTEXITCODE" } }
try {
  & "$probeJdk/javac.exe" -version
  Check-ProbeStep
  & "$probeJdk/javac.exe" --release 8 -classpath $probeCompileClasspath -d "$probeBuild/classes" "$probeRoot/ReadProbe.java" "$probeRoot/PcStatusProbe.java"
  Check-ProbeStep
  & "$probeJdk/jar.exe" --create --file "$probeBuild/classes.jar" -C "$probeBuild/classes" .
  Check-ProbeStep
  & "$probeTools/aapt2.exe" link -o "$probeBuild/base.apk" --manifest "$probeRoot/AndroidManifest.xml" -I $androidJar
  Check-ProbeStep
  $probeD8Classpath = @(); foreach ($grpcJar in $grpcCompileJars) { $probeD8Classpath += @('--classpath', $grpcJar) }
  & "$probeJdk/java.exe" -cp "$probeTools/lib/d8.jar" com.android.tools.r8.D8 --min-api 26 --lib $androidJar @probeD8Classpath --output "$probeBuild/dex" "$probeBuild/classes.jar"
  Check-ProbeStep
  Copy-Item -LiteralPath "$probeBuild/base.apk" -Destination "$probeBuild/unsigned.apk" -Force
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $probeZip = [IO.Compression.ZipFile]::Open("$probeBuild/unsigned.apk", [IO.Compression.ZipArchiveMode]::Update)
  try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($probeZip, "$probeBuild/dex/classes.dex", 'classes.dex') | Out-Null } finally { $probeZip.Dispose() }
  & "$probeTools/zipalign.exe" -f 4 "$probeBuild/unsigned.apk" "$probeBuild/aligned.apk"
  Check-ProbeStep
  $priorJavaHome = $env:JAVA_HOME
  try {
    $env:JAVA_HOME = 'D:/Android/Android Studio/jbr'
    & "$probeTools/apksigner.bat" sign --ks "$repoRoot/android/app/debug.keystore" --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android --out "$probeBuild/g20-read-probe.apk" "$probeBuild/aligned.apk"
    Check-ProbeStep
    $signature = & "$probeTools/apksigner.bat" verify --print-certs "$probeBuild/g20-read-probe.apk"
    Check-ProbeStep
    $signature | Set-Content -LiteralPath "$evidenceRoot/probe-build-signature.log"
    if (-not ($signature -match 'SHA-256 digest: fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c$')) { throw 'Probe signature does not match expected DOSO certificate' }
  } finally { $env:JAVA_HOME = $priorJavaHome }
  & "$probeTools/aapt2.exe" dump badging "$probeBuild/g20-read-probe.apk" | Set-Content -LiteralPath "$evidenceRoot/probe-build-manifest.log"
  Check-ProbeStep
  $archive = [IO.Compression.ZipFile]::OpenRead("$probeBuild/g20-read-probe.apk")
  try { $entries = @($archive.Entries | ForEach-Object FullName); $entries | Set-Content -LiteralPath "$evidenceRoot/probe-build-entries.log"; if ($entries -match '^lib/|rcsdk|\.jar$') { throw 'Unexpected bundled dependency' } } finally { $archive.Dispose() }
  Get-FileHash -Algorithm SHA256 -LiteralPath "$probeBuild/g20-read-probe.apk" | Format-List
  Set-Content -LiteralPath "$evidenceRoot/probe-build.exit" -Value 0
  Write-Output "APK: $probeBuild/g20-read-probe.apk"
} catch { Set-Content -LiteralPath "$evidenceRoot/probe-build.exit" -Value 1; throw }
