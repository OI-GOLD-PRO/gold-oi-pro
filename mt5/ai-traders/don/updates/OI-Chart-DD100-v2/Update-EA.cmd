@echo off
setlocal
if "%~1"=="" (
 echo Drag OI_Trader_Live.mq5 onto Update-EA.cmd.
 pause
 exit /b 1
)
node "%~dp0update.mjs" "%~f1"
pause
