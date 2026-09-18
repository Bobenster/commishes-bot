@echo off
chcp 65001 >nul
title Commishes Control Center (Debug)

set "APP_DIR=%~dp0out\commishes-control-center-win32-x64"
set "EXE=%APP_DIR%\commishes-control-center.exe"

if not exist "%EXE%" (
    echo Error: Executable not found at %EXE%
    echo Please run "npm run build" first.
    pause
    exit /b 1
)

echo Starting Commishes Control Center (waiting for exit)...
echo.
"%EXE%"
echo.
echo Application exited with code %ERRORLEVEL%
pause