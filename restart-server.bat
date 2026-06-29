@echo off
chcp 65001 >nul
title 游雁学院后端服务 - 重启工具
color 0B

echo.
echo ========================================
echo   游雁学院 - 后端服务重启工具
echo ========================================
echo.

:: 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 获取端口
for /f "tokens=*" %%a in ('node -e "const fs=require('fs');const m=fs.readFileSync('server.js','utf8').match(/const port = (\d+)/);console.log(m?m[1]:'3003')"') do set PORT=%%a

echo [→] 检测端口 %PORT% 是否被占用...

:: 查找占用端口的进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo [!] 发现端口 %PORT% 被进程 PID=%%a 占用
    echo [→] 正在结束旧进程...
    taskkill /F /PID %%a >nul 2>&1
    timeout /t 1 /nobreak >nul
    echo [✓] 旧进程已结束
)

if not defined PID (
    echo [✓] 端口 %PORT% 未被占用
)

echo.
echo [→] 正在启动后端服务...
echo [→] 服务地址: http://localhost:%PORT%
echo [→] 按 Ctrl+C 停止服务
echo.
echo ========================================
echo.

node server.js

echo.
echo [→] 服务已停止
echo.
pause
