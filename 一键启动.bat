@echo off
title AI Link Bridge
cd /d "%~dp0server"
where node.exe >nul 2>&1
if errorlevel 1 goto node_missing
echo 1. Start service and open Doubao browser
echo 2. Sign in to dedicated Doubao browser
choice /c 12 /n /m "Select [1/2] (default 1 in 5 seconds): " /t 5 /d 1
if errorlevel 2 goto login
node.exe background-launcher.js
goto result
:login
node.exe background-launcher.js --login
:result
if errorlevel 1 goto start_failed
exit /b

:start_failed
echo [ERROR] Startup failed. Read the message above and server\logs\browser-launch.log.
pause
exit /b 1

:node_missing
echo [ERROR] Node.js was not found in PATH.
cmd.exe /d /k
