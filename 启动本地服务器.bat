@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title 游雁学院 - 本地服务器
cd /d "%~dp0"

echo.
echo ============================================
echo      游雁学院 - 企业在线学习平台
echo ============================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js
    echo        下载: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo [√] Node.js 已就绪

:: 检查依赖
if not exist "node_modules" (
    echo.
    echo [!] 正在安装依赖...
    call npm install
    if %errorlevel% neq 0 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
    echo [√] 依赖安装完成
    echo.
) else (
    echo [√] 依赖已就绪
)

:: 检查数据文件
if not exist "data.json" (
    echo [!] data.json 不存在，将使用空数据
) else (
    echo [√] data.json 已就绪
)

:: ==========================================
:: 释放端口3003（精准释放，不影响其他node进程）
:: ==========================================
echo.
echo [*] 正在检测端口 3003 占用状态...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003.*LISTENING" 2^>nul') do (
    set "USING_PID=%%a"
    goto :port_found
)
goto :port_free

:port_found
echo [!] 端口 3003 被进程 PID=%USING_PID% 占用，正在结束...
taskkill /f /pid %USING_PID% >nul 2>&1
if %errorlevel% equ 0 (
    echo [√] 已结束进程 PID=%USING_PID%
) else (
    echo [警告] 无法结束进程 PID=%USING_PID%，请手动关闭后重试
    pause
    exit /b 1
)

:: 等待端口完全释放，最多等待10秒
echo [*] 等待端口释放...
set /a wait_count=0
:wait_port
timeout /t 1 /nobreak >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3003.*LISTENING" 2^>nul') do (
    set /a wait_count+=1
    if !wait_count! lss 10 (
        echo [*] 端口仍在占用，等待释放... (!wait_count!/10)
        goto :wait_port
    ) else (
        echo [错误] 端口 3003 10秒后仍未释放，请检查后台进程
        pause
        exit /b 1
    )
)
echo [√] 端口 3003 已释放

:port_free
echo.
echo ▸ 启动服务器: http://localhost:3003/
echo.

:: 启动浏览器
start "" http://localhost:3003/

:: 启动 Node 服务器
node server.js

echo.
echo ▸ 服务器已停止
pause
