@echo off
setlocal
set "appdir=%LOCALAPPDATA%\OI Gold AI Trader\release-2403511213\ai-trader"
if exist "%~dp0demo.mjs" set "appdir=%~dp0"
if not exist "%appdir%\demo.mjs" (
 echo Copy Update.cmd and update.mjs into your active ai-trader folder and run again.
 pause
 exit /b 1
)
pushd "%appdir%"
node "%~dp0update.mjs"
popd
pause
