@echo off
chcp 65001 >nul 2>&1
title 游雁学院 - 重启服务器

echo ========================================
echo   游雁学院 - 重启本地服务器
echo ========================================
echo.

:: 1. 关闭所有 Node 进程
echo [1/2] 正在关闭旧 Node 进程...
taskkill /F /IM node.exe >nul 2>&1
if %errorlevel%==0 (
    echo       已关闭旧进程
    timeout /t 2 /nobreak >nul
) else (
    echo       无旧进程运行
)

:: 2. 启动服务器
echo [2/2] 正在启动服务器...
echo.
start "游雁学院 Server" cmd /k "node server.js"
echo       服务器已启动（新窗口）
echo.
echo   访问地址: http://localhost:3003
echo   管理后台: http://localhost:3003/dashboard.html
echo.
echo   按任意键关闭此窗口...
pause >nul
