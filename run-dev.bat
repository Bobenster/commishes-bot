@echo off
chcp 65001 >nul
title Commishes Control Center - Dev

set "SCRIPT_DIR=%~dp0"
start "Commishes Control Center - Dev" cmd /k "cd /d "%SCRIPT_DIR%" && npm run dev"
