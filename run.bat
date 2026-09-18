@echo off
chcp 65001 >nul
title Commishes Control Center

set "SCRIPT_DIR=%~dp0"

echo Starting Commishes Control Center...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%run.ps1"

if errorlevel 1 (
    echo.
    echo Failed to start Commishes Control Center.
    pause
)
