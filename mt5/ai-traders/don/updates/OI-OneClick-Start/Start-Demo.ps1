$ErrorActionPreference = "Stop"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js 20 or later." }
$state = Join-Path $env:USERPROFILE ".oi-gold-ai-trader"
New-Item -ItemType Directory -Force $state | Out-Null
$tokenFile = Join-Path $state "bridge-token.txt"
if (-not (Test-Path $tokenFile)) {
  [guid]::NewGuid().ToString("N") | Set-Content -NoNewline $tokenFile
}
$env:OI_BRIDGE_TOKEN = (Get-Content -Raw $tokenFile).Trim()
Write-Host "Copy InpBridgeToken for the EA from $tokenFile"
if (-not $env:DEEPSEEK_API_KEY) {
  $keyFile = Join-Path $state "deepseek-current-user.dpapi"
  if (Test-Path $keyFile) {
    $secret = ConvertTo-SecureString (Get-Content -Raw $keyFile).Trim()
  } else {
    $secret = Read-Host "DeepSeek API key (saved for this Windows user)" -AsSecureString
    if (!$secret.Length) { throw "Empty API key" }
    ConvertFrom-SecureString $secret | Set-Content -NoNewline $keyFile
  }
  $env:DEEPSEEK_API_KEY = [Net.NetworkCredential]::new("", $secret).Password
}
$profileFile = Join-Path $state 'mt5-start-profile.xml'
if (Test-Path $profileFile) {
  $profileData = Import-Clixml -LiteralPath $profileFile
} else {
  $profileData = @{}
}
foreach ($field in @(
  @('OI_MT5_LOGIN','MT5 account number'),
  @('OI_MT5_SERVER','MT5 broker server (exact name)'),
  @('OI_MT5_SYMBOL','Gold symbol (e.g. XAUUSDc)')
)) {
  $name = $field[0]
  $value = [Environment]::GetEnvironmentVariable($name)
  if (!$value) { $value = $profileData[$name] }
  if (!$value) { $value = Read-Host $field[1] }
  $value = ([string]$value).Trim()
  if (!$value -or ($name -eq 'OI_MT5_LOGIN' -and $value -notmatch '^[0-9]+$')) {
    throw "Invalid $name. Restart and enter the correct MT5 details."
  }
  [Environment]::SetEnvironmentVariable($name,$value)
  if ($profileData[$name] -ne $value) { $profileChanged=$true }; $profileData[$name]=$value
}
$tmpFile=$profileFile+'.'+[guid]::NewGuid().ToString('N')
if ($profileChanged) { try {
  $profileData | Export-Clixml -LiteralPath $tmpFile
  if (Test-Path $profileFile) { [IO.File]::Replace($tmpFile,$profileFile,$null) }
  else { [IO.File]::Move($tmpFile,$profileFile) }
} finally { if(Test-Path $tmpFile){Remove-Item -LiteralPath $tmpFile} } }
Write-Host ("MT5 profile: {0} / {1} / {2}" -f $env:OI_MT5_LOGIN,$env:OI_MT5_SERVER,$env:OI_MT5_SYMBOL)
if (-not $env:OI_JOURNAL_FILE) {
  $broker = $env:OI_MT5_SERVER -replace '[/\\:]','_'
  $name = "OIJournal_" + $broker + "_" + $env:OI_MT5_LOGIN + ".tsv"
  $env:OI_JOURNAL_FILE = Join-Path "$env:APPDATA\MetaQuotes\Terminal\Common\Files" $name
}
$env:OI_STATE_DIR = Join-Path $state ($env:OI_MT5_SERVER + "_" + $env:OI_MT5_LOGIN -replace '[^A-Za-z0-9_-]','_')
Write-Host "Dashboard: http://127.0.0.1:4173/"
node (Join-Path $PSScriptRoot "server.mjs")
