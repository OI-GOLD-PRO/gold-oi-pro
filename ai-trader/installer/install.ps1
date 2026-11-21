$ErrorActionPreference = 'Stop'
$app = Join-Path $PSScriptRoot 'ai-trader'
Write-Host 'Installing OI Gold AI Trader Demo'
function HasNode {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $version = & node --version
    if ($LASTEXITCODE -eq 0 -and "$version".Trim() -match '^v?(\d+)\.') {
      return ([int]$Matches[1] -ge 20)
    }
  }
  return $false
}
if (-not (HasNode)) {
  winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
  $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')
  if (-not (HasNode)) { throw 'Install Node.js 20+ and run this installer again.' }
}
$termRoot = Join-Path $env:APPDATA 'MetaQuotes\Terminal'
$terms = @(Get-ChildItem -Directory $termRoot -ErrorAction SilentlyContinue | Where-Object {Test-Path (Join-Path $_.FullName 'MQL5\Experts')})
$term = $null
if ($terms.Count -eq 1) { $term = $terms[0] }
if ($terms.Count -gt 1) {
  for ($i=0;$i -lt $terms.Count;$i++) { Write-Host ($i+1) $terms[$i].FullName (Get-Content (Join-Path $terms[$i].FullName 'origin.txt') -ErrorAction SilentlyContinue) }
  $choice = [int](Read-Host 'Select MT5 number, or 0 to skip')
  if ($choice -gt 0 -and $choice -le $terms.Count) { $term=$terms[$choice-1] }
}
if ($term) {
  $dest=Join-Path $term.FullName 'MQL5\Experts\OI Gold AI Trader'
  New-Item -ItemType Directory -Force $dest | Out-Null
  $originFile=Join-Path $term.FullName 'origin.txt'
  $editor=$null
  if(Test-Path $originFile){ $origin=(Get-Content -Raw $originFile).Trim(); if($origin){$editor=Join-Path $origin 'MetaEditor64.exe'} }
  foreach($src in Get-ChildItem "$app\*.mq5"){
    $target=Join-Path $dest $src.Name
    Copy-Item $src.FullName $target -Force
    if($editor -and (Test-Path $editor)){
      $log=Join-Path $PSScriptRoot ($src.BaseName+'.log')
      Start-Process $editor -ArgumentList ('/compile:"'+$target+'" /log:"'+$log+'"') -Wait
      if(!(Test-Path $log) -or !(Select-String -Path $log -Pattern '\b0 errors?\b' -Quiet)){Write-Warning "Verify compilation in MetaEditor: $target"}
    } else { Write-Warning "Open in MetaEditor and compile: $target" }
  }
} else { Write-Warning "MT5 not selected or not found. EA files: $app" }
$shell=New-Object -ComObject WScript.Shell
$desktop=$shell.SpecialFolders.Item('Desktop')
foreach ($entry in @('Start-Demo','Start-Phone')){
  $link=$shell.CreateShortcut((Join-Path $desktop ("OI Gold AI Trader - "+$entry+".lnk")))
  $link.TargetPath=Join-Path $PSHOME 'powershell.exe'
  $link.Arguments='-NoExit -NoProfile -ExecutionPolicy RemoteSigned -File "'+(Join-Path $app ($entry+'.ps1'))+'"'
  $link.WorkingDirectory=$app
  $link.Save()
}
Write-Host "Installed in $app"
Write-Host 'Open the Start-Phone desktop shortcut for mobile access. See the Thai guide for attaching the EAs and enabling WebRequest.'
$guide=Get-ChildItem "$app\*.txt" | Select-Object -First 1
if($guide){Start-Process notepad.exe -ArgumentList ('"'+$guide.FullName+'"')}
