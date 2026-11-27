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
  $secret = Read-Host "DeepSeek API key" -AsSecureString
  $env:DEEPSEEK_API_KEY = [Net.NetworkCredential]::new("", $secret).Password
}
if (-not $env:OI_MT5_LOGIN) { $env:OI_MT5_LOGIN = Read-Host "MT5 login number" }
if (-not $env:OI_MT5_SERVER) { $env:OI_MT5_SERVER = Read-Host "MT5 server (exact name)" }
if (-not $env:OI_MT5_SYMBOL) { $env:OI_MT5_SYMBOL = Read-Host "Broker gold symbol (e.g. XAUUSDc)" }
if (-not $env:OI_JOURNAL_FILE) {
  $broker = $env:OI_MT5_SERVER -replace '[/\\:]','_'
  $name = "OIJournal_" + $broker + "_" + $env:OI_MT5_LOGIN + ".tsv"
  $env:OI_JOURNAL_FILE = Join-Path "$env:APPDATA\MetaQuotes\Terminal\Common\Files" $name
}
$env:OI_STATE_DIR = Join-Path $state ($env:OI_MT5_SERVER + "_" + $env:OI_MT5_LOGIN -replace '[^A-Za-z0-9_-]','_')
Write-Host "Dashboard: http://127.0.0.1:4173/"
node (Join-Path $PSScriptRoot "server.mjs")
