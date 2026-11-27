@echo off
setlocal
set "dest=%LOCALAPPDATA%\OI Gold AI Trader\release-2403511213\ai-trader"
if not exist "%dest%\server.mjs" goto fail
for %%F in (owner.html viewer.html viewer.js journal.mjs) do if not exist "%~dp0%%F" goto fail
for %%F in (owner.html viewer.html viewer.js journal.mjs) do (
 if not exist "%dest%\%%F.before123" copy /y "%dest%\%%F" "%dest%\%%F.before123" >nul || goto fail
 copy /y "%~dp0%%F" "%dest%\%%F" >nul || goto fail
)
echo Dashboard 1.23 installed. Restart Start-Phone Private.
pause
exit /b 0
:fail
echo Update failed. Extract the entire ZIP and check the installation folder.
pause
exit /b 1
