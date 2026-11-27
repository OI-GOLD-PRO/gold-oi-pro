$ErrorActionPreference = 'Stop'
if (Get-NetTCPConnection -State Listen -LocalPort 4173,4174 -ErrorAction SilentlyContinue) { throw "Close the running Start-Phone first." }
$ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
if (!(Test-Path $ts)) {
  winget install --id Tailscale.Tailscale --exact
  if (!(Test-Path $ts)) { throw "Install Tailscale for Windows, then reopen this shortcut." }
}
$current = (& $ts status --json | Out-String | ConvertFrom-Json)
if ($current.BackendState -ne 'Running') {
  & $ts up
  if ($LASTEXITCODE -ne 0) { throw "Sign in to Tailscale and retry." }
}
$info = (& $ts status --json | Out-String | ConvertFrom-Json)
$dns = $info.Self.DNSName.TrimEnd('.')
if ($dns -notmatch '^[a-zA-Z0-9.-]+\.ts\.net$') { throw "Enable MagicDNS in Tailscale." }
$env:OI_PRIVATE_HOST = $dns + ':8443'
& $ts serve --bg --https=8443 http://127.0.0.1:4174
if ($LASTEXITCODE -ne 0) { throw "Enable HTTPS using the Tailscale instructions above, then retry." }
$dir = Join-Path $env:USERPROFILE ".oi-gold-ai-trader"
New-Item -ItemType Directory -Force $dir | Out-Null
foreach ($file in 'phone-owner-password.txt','phone-password.txt') {
  if (!(Test-Path (Join-Path $dir $file))) { [guid]::NewGuid().ToString("N") | Set-Content -NoNewline (Join-Path $dir $file) }
}
$env:OI_PHONE_OWNER_PASSWORD=(Get-Content -Raw (Join-Path $dir 'phone-owner-password.txt')).Trim()
$env:OI_VIEW_PASSWORD=(Get-Content -Raw (Join-Path $dir 'phone-password.txt')).Trim()
Write-Host "Permanent private dashboard: https://$env:OI_PRIVATE_HOST/"
& (Join-Path $PSScriptRoot 'Start-Demo.ps1')
