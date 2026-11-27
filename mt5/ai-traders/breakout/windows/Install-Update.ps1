$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'OI Gold Breakout'
$mutex = [Threading.Mutex]::new($false,'Local\OIGoldBreakoutSetup101')
$locked = $false
try {
  try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
  if (!$locked) { throw 'Close the Breakout window, then run Update-Breakout.cmd again.' }
  [void][IO.Directory]::CreateDirectory($root)
  $source = Join-Path $PSScriptRoot 'Breakout.ps1'
  $dest = Join-Path $root 'Breakout.ps1'
  $temp = Join-Path $root ([guid]::NewGuid().ToString('N') + '.tmp')
  try {
    [IO.File]::Copy($source,$temp)
    Unblock-File -LiteralPath $temp
    if ([IO.File]::Exists($dest)) {
      $backup=$temp+'.bak'
      [IO.File]::Replace($temp,$dest,$backup)
      [IO.File]::Delete($backup)
    } else { [IO.File]::Move($temp,$dest) }
  } finally { if ([IO.File]::Exists($temp)) { [IO.File]::Delete($temp) } }
  $exe = Join-Path $PSHOME 'powershell.exe'
  $argsLine = '-NoLogo -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $dest + '"'
  $desktop = [Environment]::GetFolderPath('DesktopDirectory')
  $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'OI Gold Breakout AI Trader.lnk'))
  $shortcut.TargetPath = $exe
  $shortcut.Arguments = $argsLine
  $shortcut.WorkingDirectory = $root
  $icon = Join-Path $root 'OI-Gold-Breakout-Setup-x64.exe'
  if (Test-Path -LiteralPath $icon) { $shortcut.IconLocation = $icon+',0' }
  $shortcut.Save()
} finally { if ($locked) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
Start-Process -FilePath $exe -ArgumentList $argsLine -WorkingDirectory $root
