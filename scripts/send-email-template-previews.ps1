param(
  [string]$Recipient = '',

  [ValidateSet(
    'confirmation',
    'magic_link',
    'recovery',
    'reauthentication',
    'email_change',
    'password_changed',
    'email_changed',
    'anomalous_login',
    'new_device_login',
    'account_deletion_confirmation',
    'account_deleted'
  )]
  [string]$StartAt = 'confirmation',

  [ValidateRange(1, 60)]
  [int]$DelaySeconds = 10
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Recipient)) {
  $Recipient = Read-Host 'Enter the preview recipient email'
}
if ($Recipient -notmatch '^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$') {
  throw 'Recipient must be a valid email address.'
}
$dosoTemplateIds = @(
  'confirmation',
  'magic_link',
  'recovery',
  'reauthentication',
  'email_change',
  'password_changed',
  'email_changed',
  'anomalous_login',
  'new_device_login',
  'account_deletion_confirmation',
  'account_deleted'
)
$dosoStartIndex = [Array]::IndexOf($dosoTemplateIds, $StartAt)
if ($dosoStartIndex -lt 0) {
  throw "Unknown template id: $StartAt"
}

$dosoSecurePassword = Read-Host 'Enter the DirectMail SMTP password (hidden; not written to command history)' -AsSecureString
try {
  $env:DIRECTMAIL_SMTP_PASSWORD = [System.Net.NetworkCredential]::new(
    '',
    $dosoSecurePassword
  ).Password
  if ([string]::IsNullOrWhiteSpace($env:DIRECTMAIL_SMTP_PASSWORD)) {
    throw 'DirectMail SMTP password is empty.'
  }

  $dosoRemaining = $dosoTemplateIds[$dosoStartIndex..($dosoTemplateIds.Count - 1)]
  for ($dosoIndex = 0; $dosoIndex -lt $dosoRemaining.Count; $dosoIndex += 1) {
    $dosoTemplateId = $dosoRemaining[$dosoIndex]
    & node scripts/send-email-template-previews.mjs `
      --send `
      --only $dosoTemplateId `
      --to $Recipient
    if ($LASTEXITCODE -ne 0) {
      throw "Template send failed at $dosoTemplateId. Check DirectMail details before retrying with -StartAt $dosoTemplateId."
    }
    if ($dosoIndex -lt ($dosoRemaining.Count - 1)) {
      Start-Sleep -Seconds $DelaySeconds
    }
  }
} finally {
  Remove-Item Env:DIRECTMAIL_SMTP_PASSWORD -ErrorAction SilentlyContinue
  $dosoSecurePassword.Dispose()
}
