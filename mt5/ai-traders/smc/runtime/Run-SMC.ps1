$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false)
$run = $env:OI_SMC_RUN_DIR
$profilePath = $env:OI_SMC_STATE_DIR
$parentId = [int]$env:OI_SMC_PARENT
$parentTime = [long]$env:OI_SMC_PARENT_TIME
$node = $null
$tunnel = $null
$ready = $false
$phoneProbe = [guid]::NewGuid().ToString('N')
$publishedUrl = $null

function Save-Status([string]$name,$value) {
  $target = Join-Path $run $name
  $tmp = "$target.$PID.tmp"
  try {
    [IO.File]::WriteAllText($tmp,($value | ConvertTo-Json -Compress),$utf8)
    if ([IO.File]::Exists($target)) {
      $backup = $tmp + '.bak'
      [IO.File]::Replace($tmp,$target,$backup)
      Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    }
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
function Invoke-Gh([string]$arguments,[string]$inputJson) {
  $command = New-Object Diagnostics.ProcessStartInfo
  $command.FileName = $env:OI_SMC_GH
  $command.Arguments = $arguments
  $command.UseShellExecute = $false
  $command.CreateNoWindow = $true
  $command.RedirectStandardInput = $true
  $command.RedirectStandardOutput = $true
  $command.RedirectStandardError = $true
  $command.EnvironmentVariables['GH_PROMPT_DISABLED'] = '1'
  $command.EnvironmentVariables.Remove('OPENCODE_GO_API_KEY')
  $command.EnvironmentVariables.Remove('OI_SMC_BRIDGE_TOKEN')
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
  if (-not $env:OI_SMC_GH) { return $null }
  $pair = Join-Path $profilePath 'phone-gist-id.txt'
  $content = if ($url) { $url } else { 'SMC_OFFLINE' }
  $payload = @{ files = @{ 'oi-ai-phone.txt' = @{content=$content} } }
  $id = $null
  if ([IO.File]::Exists($pair)) { $id = [IO.File]::ReadAllText($pair).Trim() }
  if ($id -match '^[0-9a-f]{20,64}$') {
    $output = Invoke-Gh ("api --hostname github.com --method PATCH gists/$id --input - --jq .id") ($payload | ConvertTo-Json -Depth 5 -Compress)
  } else {
    if (!$url) { return $null }
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
function Probe-Mobile([string]$url) {
  try {
    $resp = Invoke-WebRequest -Uri ($url+'/_smc_ready') -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
    return ($resp.StatusCode -eq 204 -and [string]$resp.Headers['X-OI-SMC-Ready'] -ceq $phoneProbe)
  } catch { return $false }
}
function Read-QuickUrl($logPaths) {
  foreach ($log in $logPaths) {
    $content = [string](Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue)
    $found = [regex]::Match($content,'\|\s*(https://[a-z0-9-]+\.trycloudflare\.com)\s*\|')
    if ($found.Success) { return $found.Groups[1].Value }
  }
  return $null
}
function Phone-Status([string]$message,[string]$url='', [string]$direct='') {
  Save-Status 'phone.json' @{url=$url;direct=$direct;message=$message}
}
function Invalidate-PhoneLink {
  if ($script:publishedUrl) {
    try { $null = Permanent-Link '' } catch { }
    $script:publishedUrl = $null
  }
}
try {
  if ($env:OI_SMC_TUNNEL) { $env:OI_SMC_MOBILE_PROBE = $phoneProbe }
  $serverPath = Join-Path $PSScriptRoot 'server.mjs'
  $nodeArgs = @('"' + $serverPath + '"')
  $node = Start-Process -FilePath $env:OI_SMC_NODE -ArgumentList $nodeArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run 'node.log') -RedirectStandardError (Join-Path $run 'node-error.log')
  Remove-Item Env:OPENCODE_GO_API_KEY,Env:OI_SMC_BRIDGE_TOKEN,Env:OI_VIEW_PASSWORD,Env:OI_PHONE_OWNER_PASSWORD -ErrorAction SilentlyContinue
  for ($attempt=0; $attempt -lt 24 -and -not (Parent-WantsStop) -and -not $node.HasExited; $attempt++) {
    try {
      $owners = @(Get-NetTCPConnection -State Listen -LocalPort 4183 -ErrorAction SilentlyContinue)
      if (@($owners | Where-Object { $_.OwningProcess -eq $node.Id }).Count -gt 0) {
        $result = Invoke-WebRequest -Uri 'http://127.0.0.1:4183/api/demo/status' -UseBasicParsing -TimeoutSec 2
        if ($result.StatusCode -eq 200) { $ready = $true; break }
      }
    } catch { }
    Start-Sleep -Milliseconds 400
  }
  if (Parent-WantsStop) { exit 0 }
  if (-not $ready) { throw 'แดชบอร์ด SMC เปิดไม่สำเร็จ ตรวจ Node.js พอร์ต 4183 และข้อความด้านล่าง' }
  Save-Status 'status.json' @{ready=$true}
  $roundNumber = 0
  $retryAt = [DateTime]::MinValue
  $request = Join-Path $run 'mobile-reconnect'
  $url = $null
  $link = $null
  $failures = 0
  $nextProbe = [DateTime]::MinValue
  if ($env:OI_SMC_TUNNEL) {
    # An older release may have published an address for a tunnel that has stopped.
    $script:publishedUrl = 'previous run'
    Invalidate-PhoneLink
  }
  while (-not (Parent-WantsStop) -and -not $node.HasExited) {
    if (!$env:OI_SMC_TUNNEL) { Start-Sleep -Milliseconds 550; continue }
    if ([IO.File]::Exists($request)) {
      Phone-Status 'กำลังเชื่อมต่อมือถือใหม่'
      Remove-Item -LiteralPath $request -Force -ErrorAction SilentlyContinue
      Stop-Child $tunnel; $tunnel = $null
      Invalidate-PhoneLink
      $retryAt = [DateTime]::MinValue
    }
    if ($tunnel -and $tunnel.HasExited) {
      Phone-Status 'Tunnel หยุดทำงาน กำลังเชื่อมต่อมือถือใหม่'
      Stop-Child $tunnel; $tunnel = $null
      Invalidate-PhoneLink
      $retryAt = [DateTime]::UtcNow.AddSeconds(2)
    }
    if (!$tunnel -and [DateTime]::UtcNow -ge $retryAt) {
      $roundNumber++
      $transport = if ($roundNumber % 2 -eq 0) { 'auto' } else { 'http2' }
      Phone-Status ('กำลังขอลิงก์มือถือ · รอบ ' + $roundNumber + ' · ' + $transport)
      $name = [guid]::NewGuid().ToString('N')
      $stderr = Join-Path $run ('tunnel-' + $name + '.log')
      $stdout = Join-Path $run ('stdout-' + $name + '.log')
      $url = $null
      $online = $false
      try {
        $tunnel = Start-Process -FilePath $env:OI_SMC_TUNNEL -ArgumentList @('tunnel','--protocol',$transport,'--url','http://127.0.0.1:4184') -WindowStyle Hidden -PassThru -RedirectStandardError $stderr -RedirectStandardOutput $stdout
        $urlBy = [DateTime]::UtcNow.AddSeconds(40)
        while (!$url -and [DateTime]::UtcNow -lt $urlBy -and !$tunnel.HasExited -and !$node.HasExited -and !(Parent-WantsStop) -and ![IO.File]::Exists($request)) {
          $url = Read-QuickUrl @($stderr,$stdout)
          if (!$url) { Start-Sleep -Seconds 1 }
        }
        if ($url -and !$tunnel.HasExited) {
          Phone-Status 'ได้ที่อยู่จาก Cloudflare แล้ว · กำลังทดสอบผ่านอินเทอร์เน็ต'
          $probeBy = [DateTime]::UtcNow.AddSeconds(50)
          while (!$online -and [DateTime]::UtcNow -lt $probeBy -and !$tunnel.HasExited -and !$node.HasExited -and !(Parent-WantsStop) -and ![IO.File]::Exists($request)) {
            $online = Probe-Mobile $url
            if (!$online) { Start-Sleep -Seconds 2 }
          }
        }
        if ($online -and !$tunnel.HasExited -and !$node.HasExited -and !(Parent-WantsStop) -and ![IO.File]::Exists($request)) {
          $link = $url
          Phone-Status 'มือถือพร้อมใช้ · ตรวจสอบลิงก์ตรงแล้ว' $url $url
          try {
            $permanent = Permanent-Link $url
            if ($permanent) {
              $link = $permanent
              $script:publishedUrl = $url
            }
          } catch { }
          if ($tunnel.HasExited -or !(Probe-Mobile $url)) {
            Phone-Status 'Tunnel หลุดระหว่างเตรียมลิงก์ · กำลังเชื่อมใหม่'
            Stop-Child $tunnel; $tunnel = $null
            Invalidate-PhoneLink
            $retryAt = [DateTime]::UtcNow.AddSeconds(2)
          } else {
            $nextProbe = [DateTime]::UtcNow.AddSeconds(12)
            $failures = 0
            Phone-Status 'มือถือพร้อมใช้ · ตรวจสอบจากอินเทอร์เน็ตแล้ว' $link $url
          }
        } else {
          Phone-Status 'ลิงก์มือถือยังเข้าไม่ได้ · จะเชื่อมต่อใหม่อัตโนมัติ'
          Stop-Child $tunnel; $tunnel = $null
          $retryAt = [DateTime]::UtcNow.AddSeconds(8)
        }
      } catch {
        Phone-Status 'เปิด Tunnel ไม่สำเร็จ · จะลองใหม่อัตโนมัติ'
        Stop-Child $tunnel; $tunnel = $null
        Invalidate-PhoneLink
        $retryAt = [DateTime]::UtcNow.AddSeconds(8)
      }
    }
    if ($tunnel -and !$tunnel.HasExited -and $url -and [DateTime]::UtcNow -ge $nextProbe) {
      if (Probe-Mobile $url) {
        if ($failures) { Phone-Status 'มือถือพร้อมใช้อีกครั้ง' $link $url }
        $failures = 0
        $nextProbe = [DateTime]::UtcNow.AddSeconds(12)
      } else {
        $failures++
        Phone-Status 'ตรวจไม่พบ Tunnel จากอินเทอร์เน็ต · กำลังเช็กซ้ำ'
        $nextProbe = [DateTime]::UtcNow.AddSeconds(4)
        if ($failures -ge 2) {
          Stop-Child $tunnel; $tunnel = $null
          Invalidate-PhoneLink
          $retryAt = [DateTime]::UtcNow.AddSeconds(2)
          Phone-Status 'Tunnel ขาดการเชื่อมต่อ · กำลังขอลิงก์มือถือใหม่'
        }
      }
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
  if ($env:OI_SMC_TUNNEL) { Invalidate-PhoneLink }
}
