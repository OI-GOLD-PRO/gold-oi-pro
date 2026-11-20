$ErrorActionPreference = "Stop"
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Installing Cloudflare Tunnel..."
  winget install --id Cloudflare.cloudflared --exact
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
$cf = (Get-Command cloudflared -ErrorAction Stop).Source
$dir = Join-Path $env:USERPROFILE ".oi-gold-ai-trader"
New-Item -ItemType Directory -Force $dir | Out-Null
$file = Join-Path $dir "phone-password.txt"
if (-not (Test-Path $file)) { [guid]::NewGuid().ToString("N") | Set-Content -NoNewline $file }
$env:OI_VIEW_PASSWORD = (Get-Content -Raw $file).Trim()
$ownerFile = Join-Path $dir "phone-owner-password.txt"
if (-not (Test-Path $ownerFile)) { [guid]::NewGuid().ToString("N") | Set-Content -NoNewline $ownerFile }
$env:OI_PHONE_OWNER_PASSWORD = (Get-Content -Raw $ownerFile).Trim()
Write-Host "Phone settings login: owner"
Write-Host "Owner password file: $ownerFile"
Write-Host "Phone login: viewer"
Write-Host "Phone password file: $file"
Write-Host "Open the https://....trycloudflare.com URL shown in the tunnel window."
if (Get-NetTCPConnection -State Listen -LocalPort 4173,4174 -ErrorAction SilentlyContinue) { throw "Close the running AI Trader dashboard first, then run Start-Phone.ps1 again." }
$tunnel = Start-Process $cf -ArgumentList "tunnel","--url","http://127.0.0.1:4174" -PassThru
try { & (Join-Path $PSScriptRoot "Start-Demo.ps1") }
finally { if (-not $tunnel.HasExited) { $tunnel.Kill() } }
