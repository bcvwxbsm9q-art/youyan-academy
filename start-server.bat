@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在关闭旧服务器（如有）...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3003') do taskkill /F /PID %%a >nul 2>&1

echo 正在启动游雁学院服务器...
echo.
node server.js

echo.
echo 服务器已停止运行，按任意键退出...
pause >nul