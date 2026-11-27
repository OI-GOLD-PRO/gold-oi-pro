@echo off
setlocal
set "app=%LOCALAPPDATA%\OI Gold AI Trader\release-2403511213\ai-trader"
if not exist "%app%\server.mjs" (echo Installation not found & pause & exit /b 1)
for %%F in (Start-Demo.ps1 Start-Private.ps1 viewer.mjs) do (
 if not exist "%~dp0%%F" (echo Extract the complete ZIP first & pause & exit /b 1)
)
for %%F in (Start-Demo.ps1 Start-Private.ps1 viewer.mjs) do (
 if exist "%app%\%%F" if not exist "%app%\%%F.before-remember" copy "%app%\%%F" "%app%\%%F.before-remember" >nul
 copy /y "%~dp0%%F" "%app%\%%F" >nul || exit /b 1
)
powershell -NoProfile -Command "foreach($f in 'Start-Demo.ps1','Start-Private.ps1'){Unblock-File -LiteralPath (Join-Path $env:app $f)}; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut((Join-Path ($w.SpecialFolders.Item('Desktop')) 'OI AI Trader - Start-Phone Private.lnk')); $s.TargetPath=Join-Path $PSHOME 'powershell.exe'; $s.Arguments='-NoExit -NoProfile -ExecutionPolicy RemoteSigned -File '+[char]34+(Join-Path $env:app 'Start-Private.ps1')+[char]34; $s.WorkingDirectory=$env:app; $s.Save()"
pause
