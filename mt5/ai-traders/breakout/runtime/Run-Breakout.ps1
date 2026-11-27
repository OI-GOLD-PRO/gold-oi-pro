$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)
$run = $env:OI_Breakout_RUN_DIR
$profilePath = $env:OI_Breakout_STATE_DIR
$parentId = [int]$env:OI_Breakout_PARENT
$parentTime = [long]$env:OI_Breakout_PARENT_TIME
$node = $null
$tunnel = $null
$ready = $false

function Save-Status([string]$name,$value) {
  $target = Join-Path $run $name
  $tmp = "$target.$PID.tmp"
  try {
    [IO.File]::WriteAllText($tmp,($value | ConvertTo-Json -Compress),$utf8)
    if ([IO.File]::Exists($target)) { $backup = $tmp + '.bak'; [IO.File]::Replace($tmp,$target,$backup); [IO.File]::Delete($backup) }
    else { [IO.File]::Move($tmp,$target) }
  } finally { if ([IO.File]::Exists($tmp)) { [IO.File]::Delete($tmp) } }
}
function Parent-WantsStop {
  if ([IO.File]::Exists((Join-Path $run 'stop'))) { return $true }
  try {
    $parent = Get-Process -Id $parentId -ErrorAction Stop
    return $parent.StartTime.Ticks -ne $parentTime
  } catch { return $true }
}
function Read-PhoneSecret([string]$directory,[string]$role) {
  $record = Join-Path $directory 'mobile-access.json'
  if ([IO.File]::Exists($record)) {
    $values = ConvertFrom-Json ([IO.File]::ReadAllText($record))
    $secure = ConvertTo-SecureString $values.$role
    return [Net.NetworkCredential]::new('',$secure).Password
  }
  $name = if ($role -eq 'owner') { 'phone-owner-password.txt' } else { 'phone-password.txt' }
  $legacy = Join-Path $directory $name
  if ([IO.File]::Exists($legacy)) { return [IO.File]::ReadAllText($legacy).Trim() }
  return [guid]::NewGuid().ToString('N')
}
function Invoke-Gh([string]$arguments,[string]$inputJson) {
  $command = New-Object Diagnostics.ProcessStartInfo
  $command.FileName = $env:OI_Breakout_GH
  $command.Arguments = $arguments
  $command.UseShellExecute = $false
  $command.CreateNoWindow = $true
  $command.RedirectStandardInput = $true
  $command.RedirectStandardOutput = $true
  $command.RedirectStandardError = $true
  $command.EnvironmentVariables['GH_PROMPT_DISABLED'] = '1'
  $command.EnvironmentVariables.Remove('OPENCODE_GO_API_KEY')
  $command.EnvironmentVariables.Remove('OI_Breakout_BRIDGE_TOKEN')
  $process = [Diagnostics.Process]::Start($command)
  try {
    $out = $process.StandardOutput.ReadToEndAsync()
    $err = $process.StandardError.ReadToEndAsync()
    if ($inputJson) { $process.StandardInput.Write($inputJson) }
    $process.StandardInput.Close()
    if (-not $process.WaitForExit(12000)) { $process.Kill(); return $null }
    if ($process.ExitCode -ne 0) { return $null }
    $raw = $out.GetAwaiter().GetResult()
    return $raw.Trim()
  } finally { $process.Dispose() }
}
function Permanent-Link([string]$url) {
  if (-not $env:OI_Breakout_GH) { return $null }
  $pair = Join-Path $profilePath 'phone-gist-id.txt'
  $payload = @{ files = @{ 'oi-ai-phone.txt' = @{content=$url} } }
  $id = $null
  if ([IO.File]::Exists($pair)) { $id = [IO.File]::ReadAllText($pair).Trim() }
  if ($id -match '^[0-9a-f]{20,64}$') {
    $output = Invoke-Gh ("api --hostname github.com --method PATCH gists/$id --input - --jq .id") ($payload | ConvertTo-Json -Depth 5 -Compress)
  } else {
    $payload['public'] = $false
    $output = Invoke-Gh 'api --hostname github.com --method POST gists --input - --jq .id' ($payload | ConvertTo-Json -Depth 5 -Compress)
  }
  if ($output -notmatch '^[0-9a-f]{20,64}$') { return $null }
  [IO.File]::WriteAllText($pair,$output,$utf8)
  return "https://oi-gold-pro.github.io/gold-oi-pro/ai-entry/#$output"
}
function Stop-Child($process) {
  if ($process) {
    try { if (-not $process.HasExited) { $process.Kill(); $null=$process.WaitForExit(4000) } } catch { }
    $process.Dispose()
  }
}
try {
  if ($env:OI_Breakout_TUNNEL) {
    $env:OI_VIEW_PASSWORD = Read-PhoneSecret $profilePath 'viewer'
    $env:OI_PHONE_OWNER_PASSWORD = Read-PhoneSecret $profilePath 'owner'
  }
  $serverPath = Join-Path $PSScriptRoot 'server.mjs'
  $nodeArgs = @('"' + $serverPath + '"')
  $node = Start-Process -FilePath $env:OI_Breakout_NODE -ArgumentList $nodeArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run 'node.log') -RedirectStandardError (Join-Path $run 'node-error.log')
  Remove-Item Env:OPENCODE_GO_API_KEY,Env:OI_Breakout_BRIDGE_TOKEN,Env:OI_VIEW_PASSWORD,Env:OI_PHONE_OWNER_PASSWORD -ErrorAction SilentlyContinue
  for ($attempt=0; $attempt -lt 24 -and -not (Parent-WantsStop) -and -not $node.HasExited; $attempt++) {
    try {
      $owners = @(Get-NetTCPConnection -State Listen -LocalPort 4193 -ErrorAction SilentlyContinue)
      if (@($owners | Where-Object { $_.OwningProcess -eq $node.Id }).Count -gt 0) {
        $result = Invoke-WebRequest -Uri 'http://127.0.0.1:4193/api/demo/status' -UseBasicParsing -TimeoutSec 2
        if ($result.StatusCode -eq 200) { $ready = $true; break }
      }
    } catch { }
    Start-Sleep -Milliseconds 400
  }
  if (Parent-WantsStop) { exit 0 }
  if (-not $ready) { throw 'แดชบอร์ด Breakout เปิดไม่สำเร็จ ตรวจ Node.js พอร์ต 4193 และข้อความด้านล่าง' }
  Save-Status 'status.json' @{ready=$true}
  $roundNumber=0
  $retryAt=[DateTime]::MinValue
  while (-not (Parent-WantsStop) -and -not $node.HasExited) {
    if (!$tunnel -and [DateTime]::UtcNow -ge $retryAt) {
  if ($env:OI_Breakout_TUNNEL) {
    Save-Status 'phone.json' @{url='';message='กำลังขอลิงก์มือถือจาก Cloudflare'}
    try {
      $round=[guid]::NewGuid().ToString('N')
      $tunnelLog = Join-Path $run ("tunnel-"+$round+".log")
      $roundNumber++
      $transport=if($roundNumber % 2 -eq 0){'auto'}else{'http2'}
      $stdoutLog=Join-Path $run ("stdout-"+$round+".log")
      $tunnel = Start-Process -FilePath $env:OI_Breakout_TUNNEL -ArgumentList @('tunnel','--protocol',$transport,'--url','http://127.0.0.1:4194') -WindowStyle Hidden -PassThru -RedirectStandardError $tunnelLog -RedirectStandardOutput $stdoutLog
      $url = $null
      for ($attempt=0; $attempt -lt 90 -and -not $url -and -not $tunnel.HasExited -and -not (Parent-WantsStop); $attempt++) {
        try {
          foreach ($log in @($tunnelLog,$stdoutLog)) {
            $logText=Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
            foreach ($candidate in [regex]::Matches([string]$logText,'https://([a-z0-9-]+)\.trycloudflare\.com\b')) {
              if ($candidate.Groups[1].Value -notin @('api','www')) { $url=$candidate.Value; break }
            }
            if ($url) { break }
          }
        } catch { }
        if (-not $url) { Start-Sleep -Seconds 1 }
      }
      if (!(Parent-WantsStop) -and $url -and !$tunnel.HasExited) {
        $deadChecks=0
        $nextProbe=[DateTime]::UtcNow.AddSeconds(30)
        $link=$url
        Save-Status 'phone.json' @{url=$url;direct=$url;message='Cloudflare ออกลิงก์แล้ว · คัดลอกลิงก์ตรงไปเปิดใน Safari ได้'}
        try { $permanent=Permanent-Link $url; if ($permanent) { $link=$permanent } } catch { }
        Save-Status 'phone.json' @{url=$link;direct=$url;message='มีลิงก์มือถือแล้ว · กำลังตรวจการเข้าถึงจากคอม'}
        $online=$false
        for ($i=0;$i -lt 3 -and !(Parent-WantsStop) -and !$tunnel.HasExited;$i++) {
          try {
            $response=Invoke-WebRequest -Uri ($url+'/') -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
            if ($response.StatusCode -eq 200 -and $response.Content -match 'autocomplete="current-password"') { $online=$true;break }
          } catch { }
          Start-Sleep -Seconds 2
        }
        $msg=if ($online) { 'ตรวจพบหน้าเข้าสู่ระบบแล้ว · ใช้ลิงก์ตรงหรือปุ่มคัดลอกลิงก์มือถือ' } else { 'คอมยังยืนยันลิงก์ไม่ได้ · ลองลิงก์ตรงบนมือถือ หากยังไม่ได้ให้ตรวจเครือข่ายของคอม' }
        Save-Status 'phone.json' @{url=$link;direct=$url;message=$msg}
      } else {
        $detail='Cloudflare ยังไม่ออก URL ภายในเวลาที่รอ'
        if ($tunnel.HasExited) { $detail='cloudflared หยุดทำงาน (exit '+$tunnel.ExitCode+')' }
        Stop-Child $tunnel; $tunnel=$null
        Save-Status 'phone.json' @{url='';message=($detail+' · '+$transport+' · ลองใหม่ใน 20 วินาที')}
      }
    } catch {
      Stop-Child $tunnel; $tunnel=$null
      Save-Status 'phone.json' @{url='';message='เปิดลิงก์มือถือไม่สำเร็จ แดชบอร์ดในเครื่องยังทำงาน'}
    }
  }
      $retryAt=[DateTime]::UtcNow.AddSeconds(20)
    }
    if ($tunnel -and !$tunnel.HasExited -and $url -and [DateTime]::UtcNow -ge $nextProbe) {
      $nextProbe=[DateTime]::UtcNow.AddSeconds(30)
      try {
        $null=Invoke-WebRequest -Uri ($url+'/') -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
        $deadChecks=0
      } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 530 -and $_.ErrorDetails.Message -match '1033') {
          $deadChecks++
        } else { $deadChecks=0 }
      }
      if ($deadChecks -ge 3) {
        Save-Status 'phone.json' @{url='';direct='';message='Cloudflare แจ้ง 1033 ซ้ำ กำลังขอลิงก์มือถือใหม่'}
        Stop-Child $tunnel
        $tunnel=$null
      }
    }
    if ($tunnel -and $tunnel.HasExited) {
      Save-Status 'phone.json' @{url='';message='การเชื่อมต่อมือถือหยุดแล้ว แดชบอร์ดในเครื่องยังทำงาน'}
      Stop-Child $tunnel
      $tunnel = $null
    }
    Start-Sleep -Milliseconds 550
  }
  if (-not (Parent-WantsStop) -and $node.HasExited) { throw 'โปรแกรมแดชบอร์ดหยุดระหว่างทำงาน ดูรายละเอียดด้านล่าง' }
} catch {
  Save-Status 'status.json' @{ready=$false;error=$_.Exception.Message}
  exit 1
} finally {
  Stop-Child $tunnel
  Stop-Child $node
}
