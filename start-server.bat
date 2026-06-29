@echo off
chcp 65001 >nul
title 游雁学院后端服务
color 0A

echo.
echo ========================================
echo   游雁学院 - 企业学习平台
echo ========================================
echo.

:: 检查 Node.js 是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [✓] Node.js 版本: 
node --version
echo.

:: 检查依赖是否已安装
if not exist "node_modules" (
    echo [提示] 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [✓] 依赖安装完成
    echo.
)

:: 获取端口（从 server.js 读取）
for /f "tokens=*" %%a in ('node -e "const fs=require('fs');const m=fs.readFileSync('server.js','utf8').match(/const port = (\d+)/);console.log(m?m[1]:'3003')"') do set PORT=%%a

echo [→] 正在启动后端服务...
echo [→] 服务地址: http://localhost:%PORT%
echo [→] 按 Ctrl+C 停止服务
echo.
echo ========================================
echo.

:: 启动服务
node server.js

:: 服务停止后的提示
echo.
echo [→] 服务已停止
echo.
pause
