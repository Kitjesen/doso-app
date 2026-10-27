$ErrorActionPreference = 'Stop'

$configPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\config.toml')).Path
$config = (Get-Content -LiteralPath $configPath -Raw).Replace("`r`n", "`n").Replace("`r", "`n")
$supabasePath = Split-Path -Parent $configPath
$projectPath = Split-Path -Parent $supabasePath

function Assert-ConfigMatch {
  param(
    [Parameter(Mandatory)] [string] $Pattern,
    [Parameter(Mandatory)] [string] $Message
  )

  if ($config -notmatch $Pattern) {
    throw "Config assertion failed: $Message"
  }

  Write-Output "PASS: $Message"
}

function Assert-ConfigNotMatch {
  param(
    [Parameter(Mandatory)] [string] $Pattern,
    [Parameter(Mandatory)] [string] $Message
  )

  if ($config -match $Pattern) {
    throw "Config assertion failed: $Message"
  }

  Write-Output "PASS: $Message"
}

function Assert-FileMatch {
  param(
    [Parameter(Mandatory)] [string] $Path,
    [Parameter(Mandatory)] [string] $Pattern,
    [Parameter(Mandatory)] [string] $Message
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Config assertion failed: missing file $Path"
  }

  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -notmatch $Pattern) {
    throw "Config assertion failed: $Message"
  }

  Write-Output "PASS: $Message"
}

function Assert-FileNotMatch {
  param(
    [Parameter(Mandatory)] [string] $Path,
    [Parameter(Mandatory)] [string] $Pattern,
    [Parameter(Mandatory)] [string] $Message
  )

  $content = Get-Content -LiteralPath $Path -Raw
  if ($content -match $Pattern) {
    throw "Config assertion failed: $Message"
  }

  Write-Output "PASS: $Message"
}

Assert-ConfigMatch '(?m)^minimum_password_length = 10$' 'passwords require at least 10 characters'
Assert-ConfigMatch '(?m)^password_requirements = "lower_upper_letters_digits"$' 'passwords require lower-case, upper-case, and digits'
Assert-ConfigMatch '(?s)\[auth\.email\].*?enable_confirmations = true' 'email confirmation is required'
Assert-ConfigMatch '(?s)\[auth\.email\].*?secure_password_change = true' 'password changes require recent authentication'
Assert-ConfigMatch '"doso://auth/callback"' 'the app auth callback is allow-listed'
Assert-ConfigMatch '"doso://auth/reset-password"' 'the app password-reset callback is allow-listed'
Assert-ConfigMatch '(?s)\[auth\.email\].*?max_frequency = "60s"' 'email codes cannot be resent more than once per minute'
Assert-ConfigMatch '(?s)\[auth\.email\].*?otp_length = 8' 'email verification uses the hosted eight-digit OTP contract'
Assert-ConfigMatch '(?s)\[auth\.email\].*?otp_expiry = 600' 'email OTP expires after ten minutes'
Assert-ConfigMatch '(?m)^jwt_expiry = 1800$' 'access JWTs expire after thirty minutes'
Assert-ConfigMatch '(?s)\[auth\.mfa\.totp\].*?enroll_enabled = true.*?verify_enabled = true' 'TOTP MFA enrollment and verification are enabled for administrator step-up'
Assert-ConfigMatch '(?s)\[auth\.mfa\.phone\].*?otp_length = 6' 'phone MFA keeps its independent six-digit OTP contract'
Assert-ConfigMatch '(?s)\[edge_runtime\].*?enabled = true' 'the local Edge Functions runtime is enabled'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.confirmation\].*?content_path = "\./supabase/templates/confirmation\.html"' 'signup OTP template is configured'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.recovery\].*?content_path = "\./supabase/templates/recovery\.html"' 'password recovery OTP template is configured'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.reauthentication\].*?content_path = "\./supabase/templates/reauthentication\.html"' 'password-change reauthentication template is configured'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.magic_link\].*?content_path = "\./supabase/templates/magic_link\.html"' 'passwordless login OTP template is configured'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.email_change\].*?content_path = "\./supabase/templates/email_change\.html"' 'new-email verification OTP template is configured'
Assert-ConfigMatch '(?s)\[auth\.email\.notification\.password_changed\].*?enabled = true.*?content_path = "\./supabase/templates/password_changed_notification\.html"' 'password-changed security notification is enabled and branded'
Assert-ConfigMatch '(?s)\[auth\.email\.notification\.email_changed\].*?enabled = true.*?content_path = "\./supabase/templates/email_changed_notification\.html"' 'email-changed security notification is enabled and branded'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.confirmation\].*?subject = "验证你的 DOSO robotics 邮箱"' 'signup subject avoids exposing the OTP in notifications'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.recovery\].*?subject = "重置你的 DOSO robotics 密码"' 'recovery subject avoids exposing the OTP in notifications'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.reauthentication\].*?subject = "确认你的 DOSO robotics 账户操作"' 'reauthentication subject avoids exposing the OTP in notifications'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.magic_link\].*?subject = "登录 DOSO robotics"' 'login subject avoids exposing the OTP in notifications'
Assert-ConfigMatch '(?s)\[auth\.email\.template\.email_change\].*?subject = "验证你的 DOSO robotics 新邮箱"' 'email-change subject avoids exposing the OTP in notifications'
Assert-ConfigNotMatch '(?m)^subject\s*=\s*"[^"\r\n]*\{\{\s*\.Token\s*\}\}' 'email subjects never expose the OTP token'

$confirmationTemplate = Join-Path $supabasePath 'templates\confirmation.html'
$recoveryTemplate = Join-Path $supabasePath 'templates\recovery.html'
$reauthenticationTemplate = Join-Path $supabasePath 'templates\reauthentication.html'
$magicLinkTemplate = Join-Path $supabasePath 'templates\magic_link.html'
$emailChangeTemplate = Join-Path $supabasePath 'templates\email_change.html'
$passwordChangedTemplate = Join-Path $supabasePath 'templates\password_changed_notification.html'
$emailChangedTemplate = Join-Path $supabasePath 'templates\email_changed_notification.html'
$anomalousLoginTemplate = Join-Path $supabasePath 'templates\custom\anomalous_login.html'
$newDeviceLoginTemplate = Join-Path $supabasePath 'templates\custom\new_device_login.html'
$accountDeletionConfirmationTemplate = Join-Path $supabasePath 'templates\custom\account_deletion_confirmation.html'
$accountDeletedTemplate = Join-Path $supabasePath 'templates\custom\account_deleted.html'

Assert-FileMatch $confirmationTemplate '\{\{\s*\.Token\s*\}\}' 'signup email displays the OTP token'
Assert-FileMatch $recoveryTemplate '\{\{\s*\.Token\s*\}\}' 'recovery email displays the OTP token'
Assert-FileMatch $reauthenticationTemplate '\{\{\s*\.Token\s*\}\}' 'reauthentication email displays the nonce token'
Assert-FileMatch $magicLinkTemplate '\{\{\s*\.Token\s*\}\}' 'passwordless login email displays the OTP token'
Assert-FileMatch $emailChangeTemplate '\{\{\s*\.Token\s*\}\}' 'new-email verification email displays the OTP token'
Assert-FileMatch $emailChangeTemplate '\{\{\s*\.NewEmail\s*\}\}' 'new-email verification identifies the requested email address'
Assert-FileMatch $passwordChangedTemplate '\{\{\s*\.Email\s*\}\}' 'password-changed notification identifies the account'
Assert-FileMatch $emailChangedTemplate '\{\{\s*\.OldEmail\s*\}\}' 'email-changed notification identifies the old email address'
Assert-FileMatch $emailChangedTemplate '\{\{\s*\.Email\s*\}\}' 'email-changed notification identifies the new account email address'
Assert-FileMatch $anomalousLoginTemplate '\{\{account_email\}\}' 'anomalous-login template requires an account email from the backend'
Assert-FileMatch $anomalousLoginTemplate '\{\{security_url\}\}' 'anomalous-login template requires a server-generated security URL'
Assert-FileNotMatch $newDeviceLoginTemplate '\{\{(account_email|location|ip_address)\}\}' 'new-install template omits duplicated or client-spoofable identity and network context'
Assert-FileMatch $newDeviceLoginTemplate '\{\{security_url\}\}' 'new-device template requires a server-generated security URL'
Assert-FileMatch $accountDeletionConfirmationTemplate '\{\{deletion_confirmation_url\}\}' 'account-deletion confirmation requires a server-generated one-time URL'
Assert-FileMatch $accountDeletedTemplate '\{\{account_email\}\}' 'account-deleted template requires the retained recipient address'
Assert-FileMatch $accountDeletedTemplate '\{\{event_time\}\}' 'account-deleted template requires an explicit event time'
Assert-FileNotMatch $confirmationTemplate '\{\{\s*\.(TokenHash|ConfirmationURL)\s*\}\}' 'signup email contains no link credential variable'
Assert-FileNotMatch $recoveryTemplate '\{\{\s*\.(TokenHash|ConfirmationURL)\s*\}\}' 'recovery email contains no link credential variable'
Assert-FileNotMatch $reauthenticationTemplate '\{\{\s*\.(TokenHash|ConfirmationURL)\s*\}\}' 'reauthentication email contains no link credential variable'
Assert-FileNotMatch $magicLinkTemplate '\{\{\s*\.(TokenHash|ConfirmationURL)\s*\}\}' 'passwordless login email contains no link credential variable'
Assert-FileNotMatch $emailChangeTemplate '\{\{\s*\.(TokenHash|ConfirmationURL)\s*\}\}' 'email-change email contains no link credential variable'
Assert-FileNotMatch $confirmationTemplate '(?i)href\s*=\s*["''][^"'']*\{\{\s*\.(Token|TokenHash|ConfirmationURL)' 'signup email never places a credential in a URL'
Assert-FileNotMatch $recoveryTemplate '(?i)href\s*=\s*["''][^"'']*\{\{\s*\.(Token|TokenHash|ConfirmationURL)' 'recovery email never places a credential in a URL'
Assert-FileNotMatch $reauthenticationTemplate '(?i)href\s*=\s*["''][^"'']*\{\{\s*\.(Token|TokenHash|ConfirmationURL)' 'reauthentication email never places a credential in a URL'
Assert-FileNotMatch $magicLinkTemplate '(?i)href\s*=\s*["''][^"'']*\{\{\s*\.(Token|TokenHash|ConfirmationURL)' 'passwordless login email never places a credential in a URL'
Assert-FileNotMatch $emailChangeTemplate '(?i)href\s*=\s*["''][^"'']*\{\{\s*\.(Token|TokenHash|ConfirmationURL)' 'email-change email never places a credential in a URL'
Assert-FileNotMatch $confirmationTemplate '(?i)<a\b' 'signup email is OTP-only and contains no clickable link'
Assert-FileNotMatch $recoveryTemplate '(?i)<a\b' 'recovery email is OTP-only and contains no clickable link'
Assert-FileNotMatch $reauthenticationTemplate '(?i)<a\b' 'reauthentication email is OTP-only and contains no clickable link'
Assert-FileNotMatch $magicLinkTemplate '(?i)<a\b' 'passwordless login email is OTP-only and contains no clickable link'
Assert-FileNotMatch $emailChangeTemplate '(?i)<a\b' 'email-change email is OTP-only and contains no clickable link'

$emailLogoUrlPattern = 'https://vchvqfdlkomlrjenkdhj\.supabase\.co/storage/v1/object/public/email-assets/doso-robotics-wordmark-email-29dea10fd204\.png'
Assert-FileMatch $confirmationTemplate $emailLogoUrlPattern 'signup email uses the approved public HTTPS company logo URL'
Assert-FileMatch $recoveryTemplate $emailLogoUrlPattern 'recovery email uses the approved public HTTPS company logo URL'
Assert-FileMatch $reauthenticationTemplate $emailLogoUrlPattern 'reauthentication email uses the approved public HTTPS company logo URL'
Assert-FileMatch $magicLinkTemplate $emailLogoUrlPattern 'passwordless login email uses the approved public HTTPS company logo URL'
Assert-FileMatch $emailChangeTemplate $emailLogoUrlPattern 'email-change email uses the approved public HTTPS company logo URL'
Assert-FileMatch $passwordChangedTemplate $emailLogoUrlPattern 'password-changed email uses the approved public HTTPS company logo URL'
Assert-FileMatch $emailChangedTemplate $emailLogoUrlPattern 'email-changed email uses the approved public HTTPS company logo URL'
Assert-FileMatch $confirmationTemplate 'alt="[^"]*DOSO robotics"' 'signup email provides a readable logo fallback'
Assert-FileMatch $recoveryTemplate 'alt="[^"]*DOSO robotics"' 'recovery email provides a readable logo fallback'
Assert-FileMatch $reauthenticationTemplate 'alt="[^"]*DOSO robotics"' 'reauthentication email provides a readable logo fallback'
Assert-FileMatch $magicLinkTemplate 'alt="[^"]*DOSO robotics"' 'passwordless login email provides a readable logo fallback'
Assert-FileMatch $emailChangeTemplate 'alt="[^"]*DOSO robotics"' 'email-change email provides a readable logo fallback'
Assert-FileMatch $passwordChangedTemplate 'alt="[^"]*DOSO robotics"' 'password-changed email provides a readable logo fallback'
Assert-FileMatch $emailChangedTemplate 'alt="[^"]*DOSO robotics"' 'email-changed email provides a readable logo fallback'
Assert-FileNotMatch $confirmationTemplate '(?i)src\s*=\s*["'']data:' 'signup email does not embed a base64 logo'
Assert-FileNotMatch $recoveryTemplate '(?i)src\s*=\s*["'']data:' 'recovery email does not embed a base64 logo'
Assert-FileNotMatch $reauthenticationTemplate '(?i)src\s*=\s*["'']data:' 'reauthentication email does not embed a base64 logo'
Assert-FileNotMatch $magicLinkTemplate '(?i)src\s*=\s*["'']data:' 'passwordless login email does not embed a base64 logo'
Assert-FileNotMatch $emailChangeTemplate '(?i)src\s*=\s*["'']data:' 'email-change email does not embed a base64 logo'
Assert-FileNotMatch $passwordChangedTemplate '(?i)src\s*=\s*["'']data:' 'password-changed email does not embed a base64 logo'
Assert-FileNotMatch $emailChangedTemplate '(?i)src\s*=\s*["'']data:' 'email-changed email does not embed a base64 logo'

$brandedEmailTemplates = @(
  @{ Path = $confirmationTemplate; Name = 'signup' },
  @{ Path = $recoveryTemplate; Name = 'recovery' },
  @{ Path = $reauthenticationTemplate; Name = 'reauthentication' },
  @{ Path = $magicLinkTemplate; Name = 'passwordless-login' },
  @{ Path = $emailChangeTemplate; Name = 'email-change' },
  @{ Path = $passwordChangedTemplate; Name = 'password-changed' },
  @{ Path = $emailChangedTemplate; Name = 'email-changed' },
  @{ Path = $anomalousLoginTemplate; Name = 'anomalous-login' },
  @{ Path = $newDeviceLoginTemplate; Name = 'new-device-login' },
  @{ Path = $accountDeletionConfirmationTemplate; Name = 'account-deletion-confirmation' },
  @{ Path = $accountDeletedTemplate; Name = 'account-deleted' }
)

foreach ($template in $brandedEmailTemplates) {
  Assert-FileMatch $template.Path 'max-width:640px' "$($template.Name) email uses the approved wide card layout"
  Assert-FileMatch $template.Path 'Robotics for the real world\.' "$($template.Name) email includes the branded footer"
  Assert-FileNotMatch $template.Path '(?i)email-icon-|<svg\b|data:image' "$($template.Name) email has no unhosted or embedded icon dependency"
}

foreach ($template in @($confirmationTemplate, $recoveryTemplate, $reauthenticationTemplate, $magicLinkTemplate, $emailChangeTemplate)) {
  Assert-FileMatch $template 'class="otp-code"[^>]*font-size:56px' "OTP email $template uses the large OTP treatment"
}

$deviceRepository = Join-Path $projectPath 'src\services\deviceRepository.ts'
$appEntry = Join-Path $projectPath 'App.tsx'
$accountSecurityScreen = Join-Path $projectPath 'src\screens\AccountSecurityScreen.tsx'

Assert-FileMatch $deviceRepository "\.eq\('is_demo', false\)" 'device loading excludes legacy demo rows after a physical device is bound'
Assert-FileMatch $appEntry "profile\?\.app_role === 'admin' \|\| profile\?\.app_role === 'support'" 'only management roles can enter TOTP enrollment'
Assert-FileMatch $accountSecurityScreen 'canManageMfa \? \(' 'the management TOTP entry is hidden from ordinary users'

$checkedFiles = @(
  $configPath,
  $confirmationTemplate,
  $recoveryTemplate,
  $reauthenticationTemplate,
  $magicLinkTemplate,
  $emailChangeTemplate,
  $passwordChangedTemplate,
  $emailChangedTemplate,
  $anomalousLoginTemplate,
  $newDeviceLoginTemplate,
  $accountDeletionConfirmationTemplate,
  $accountDeletedTemplate,
  $deviceRepository,
  $appEntry,
  $accountSecurityScreen,
  (Join-Path $projectPath '.env.example'),
  (Join-Path $projectPath 'docs\NETWORK_BACKEND.md')
)

foreach ($checkedFile in $checkedFiles) {
  Assert-FileNotMatch $checkedFile '(?i)(sb_secret_[a-z0-9_-]{12,}|service[_-]?role\s*[=:]\s*["'']?[a-z0-9._-]{12,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,})' "no literal secret is committed in $checkedFile"
}

Assert-ConfigNotMatch '(?m)^\s*pass\s*=\s*"(?!env\()[^"\r\n]+"' 'SMTP passwords must be supplied through env()'
