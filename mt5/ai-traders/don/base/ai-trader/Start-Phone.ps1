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

if (Get-NetTCPConnection -State Listen -LocalPort 4173,4174 -ErrorAction SilentlyContinue) { throw "Close the running AI Trader dashboard first, then run Start-Phone.ps1 again." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  winget install --id GitHub.cli --exact --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")
}
& gh auth status --hostname github.com *> $null
if ($LASTEXITCODE -ne 0) {
  & gh auth login --hostname github.com --web --git-protocol https --scopes gist
  if ($LASTEXITCODE -ne 0) { throw "GitHub sign-in failed." }
}
$log = Join-Path $dir ("phone-" + [guid]::NewGuid() + ".log")
$tunnel = Start-Process $cf -ArgumentList "tunnel","--url","http://127.0.0.1:4174" -RedirectStandardError $log -PassThru
try {
  $url = $null
  for ($i=0; $i -lt 90 -and -not $url -and -not $tunnel.HasExited; $i++) {
    Start-Sleep -Seconds 1
    $match = [regex]::Match([string](Get-Content -Raw $log -ErrorAction SilentlyContinue),'https://[a-z0-9-]+\.trycloudflare\.com\b')
    if ($match.Success) { $url=$match.Value }
  }
  if (-not $url) { throw "Tunnel did not provide a URL. See $log" }
  $pairFile = Join-Path $dir "phone-gist-id.txt"
  $payload = @{files=@{'oi-ai-phone.txt'=@{content=$url}}}
  if (Test-Path $pairFile) {
    $id = (Get-Content -Raw $pairFile).Trim()
    if ($id -notmatch '^[0-9a-f]{20,64}$') { throw "Invalid saved pairing ID." }
    $payload | ConvertTo-Json -Depth 5 -Compress | gh api --hostname github.com --method PATCH "gists/$id" --input - --silent
  } else {
    $payload['public']=$false
    $id = $payload | ConvertTo-Json -Depth 5 -Compress | gh api --hostname github.com --method POST gists --input - --jq .id
  }
  if ($LASTEXITCODE -ne 0 -or $id -notmatch '^[0-9a-f]{20,64}$') { throw "GitHub pairing failed. Run gh auth refresh -h github.com -s gist and retry." }
  $id | Set-Content -NoNewline $pairFile
  $entry="https://oi-gold-pro.github.io/gold-oi-pro/ai-entry/#$id"
  Write-Host "Permanent phone link: $entry"
  & (Join-Path $PSScriptRoot "Start-Demo.ps1")
} finally {
  if (-not $tunnel.HasExited) { $tunnel.Kill() }
}
