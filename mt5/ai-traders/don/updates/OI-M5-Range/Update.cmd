@echo off
setlocal
set "appdir=%LOCALAPPDATA%\OI Gold AI Trader\release-2403511213\ai-trader"
if exist "%~dp0demo.mjs" set "appdir=%~dp0"
pushd "%appdir%" || (pause & exit /b 1)
node "%~dp0update.mjs"
popd
pause
