@echo off
chcp 65001 >nul
title 游雁学院 - 本地服务器
cd /d "%~dp0"
echo ========================================
echo    游雁学院 - 企业学习平台
echo ========================================
echo.
echo 正在启动服务器...
echo.
node server.js
