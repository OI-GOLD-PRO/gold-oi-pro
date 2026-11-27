$ErrorActionPreference = 'Stop'
try {
  $dir = Join-Path $env:LOCALAPPDATA 'OI Gold AI Trader\release-2403511213\ai-trader'
  if (!(Test-Path (Join-Path $dir 'demo.mjs'))) { $dir = (Read-Host 'Paste the ai-trader folder containing server.mjs and demo.mjs').Trim('"') }
  $state = Join-Path $env:USERPROFILE '.oi-gold-ai-trader'
  $file = Join-Path $state 'go-decision.json'
  $mode = Read-Host '1 = OpenCode Go (default), 2 = restore previous provider'
  if ($mode -eq '2') {
    if (Test-Path $file) { Remove-Item -LiteralPath $file }
    Write-Host 'Previous provider selected. Restart your usual bridge launcher.'
    exit 0
  }
  if ($mode -and $mode -ne '1') { throw 'Unknown choice' }
  $model = 'jev-1.14'
  $secret = Read-Host 'Paste OpenCode Go API key, then press Enter' -AsSecureString
  $token = [Net.NetworkCredential]::new('', $secret).Password.Trim()
  if (!$token) { throw 'Empty key' }
  $token | node (Join-Path $PSScriptRoot 'probe.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Go Decision test failed. See message above.' }
  & node (Join-Path $PSScriptRoot 'install.mjs') $dir
  if ($LASTEXITCODE -ne 0) { throw 'Bridge patch failed before activation' }
  New-Item -ItemType Directory -Force -Path $state | Out-Null
  $tmp = Join-Path $state ([Guid]::NewGuid().ToString() + '.tmp')
  @{model=$model;secret=(ConvertFrom-SecureString $secret)} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $tmp
  if (Test-Path $file) { [IO.File]::Replace($tmp,$file,($tmp + ".previous")) } else { [IO.File]::Move($tmp,$file) }
  Write-Host "OpenCode Go test passed: $model. Restart your usual Start-Phone Private bridge."
} catch { Write-Host ('Setup stopped: ' + $_.Exception.Message); exit 1 }
