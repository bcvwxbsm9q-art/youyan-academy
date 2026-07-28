@echo off
chcp 65001 >nul 2>&1
setlocal
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0restart-server.ps1"
