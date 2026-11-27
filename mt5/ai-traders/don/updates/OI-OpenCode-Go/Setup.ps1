$ErrorActionPreference = 'Stop'
try {
  $dir = Join-Path $env:LOCALAPPDATA 'OI Gold AI Trader\release-2403511213\ai-trader'
  if (!(Test-Path (Join-Path $dir 'demo.mjs'))) { $dir = (Read-Host 'Paste the ai-trader folder containing server.mjs and demo.mjs').Trim('"') }
  $state = Join-Path $env:USERPROFILE '.oi-gold-ai-trader'
  $file = Join-Path $state 'opencode-go.json'
  $mode = Read-Host '1 = OpenCode Go (default), 2 = return to DeepSeek'
  if ($mode -eq '2') {
    if (Test-Path $file) { Remove-Item -LiteralPath $file }
    Write-Host 'DeepSeek selected. Restart your usual bridge launcher.'
    exit 0
  }
  if ($mode -and $mode -ne '1') { throw 'Unknown choice' }
  $model = (Read-Host 'OpenCode Go model ID [glm-5.3-flash]').Trim()
  if (!$model) { $model = 'glm-5.3-flash' }
  $secret = Read-Host 'Paste OpenCode Go API key, then press Enter' -AsSecureString
  $token = [Net.NetworkCredential]::new('', $secret).Password.Trim()
  if (!$token) { throw 'Empty key' }
  $body = @{model=$model; messages=@(@{role='user';content='Return a JSON object with status equal to ok.'}); response_format=@{type='json_object'}} | ConvertTo-Json -Depth 5
  $response = Invoke-RestMethod -Method Post -Uri 'https://opencode.ai/inference/go/openai/v1/chat/completions' -Headers @{Authorization="Bearer $token"} -ContentType 'application/json' -Body $body -TimeoutSec 35 -MaximumRedirection 0
  if ($response.choices[0].finish_reason -ne 'stop' -or ($response.choices[0].message.content | ConvertFrom-Json).status -ne 'ok') { throw 'Model JSON test failed' }
  & node (Join-Path $PSScriptRoot 'install.mjs') $dir
  if ($LASTEXITCODE -ne 0) { throw 'Bridge patch failed before activation' }
  New-Item -ItemType Directory -Force -Path $state | Out-Null
  $tmp = Join-Path $state ([Guid]::NewGuid().ToString() + '.tmp')
  @{model=$model;secret=(ConvertFrom-SecureString $secret)} | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $tmp
  if (Test-Path $file) { [IO.File]::Replace($tmp,$file,$null) } else { [IO.File]::Move($tmp,$file) }
  Write-Host "OpenCode Go test passed: $model. Restart your usual Start-Phone Private bridge."
} catch { Write-Host ('Setup stopped: ' + $_.Exception.Message); exit 1 }
