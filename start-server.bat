@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

cd /d "E:\培训相关\桌面\learning"
set PORT=3003

REM 1. 若端口被占用，结束占用进程（实现"重启"语义，避免 EADDRINUSE 静默失败）
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue).OwningProcess"') do set OLD_PID=%%a
if defined OLD_PID (
  echo [信息] 端口 %PORT% 被 PID %OLD_PID% 占用，正在结束旧进程以重启...
  taskkill /PID %OLD_PID% /F >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM 2. 定位 node 可执行文件（PATH > 系统默认 > WorkBuddy managed）
set NODE_EXE=
for /f "tokens=*" %%i in ('where node 2^>nul') do ( if not defined NODE_EXE set NODE_EXE=%%i )
if not defined NODE_EXE ( if exist "C:\Program Files\nodejs\node.exe" set NODE_EXE=C:\Program Files\nodejs\node.exe )
if not defined NODE_EXE ( if exist "C:\Users\xzj\.workbuddy\binaries\node\versions\22.22.2\node.exe" set NODE_EXE=C:\Users\xzj\.workbuddy\binaries\node\versions\22.22.2\node.exe )
if not defined NODE_EXE (
  echo [错误] 找不到 node.exe，请先安装 Node.js 或检查路径。
  pause
  exit /b 1
)
echo [信息] 使用 node: %NODE_EXE%

REM 3. 以独立隐藏进程启动（脱离本窗口，关闭 cmd 也不退出）
powershell -NoProfile -Command "Start-Process -FilePath '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory 'E:\培训相关\桌面\learning' -RedirectStandardOutput 'server.log' -RedirectStandardError 'server.err' -WindowStyle Hidden"
echo [信息] 正在启动服务器...

REM 4. 等待并真实探活，给出明确成败反馈
set tries=0
:wait
curl -s -m 2 http://localhost:%PORT%/api/certificates/templates >nul 2>&1
if !errorlevel!==0 (
  echo.
  echo ============================================
  echo  [成功] 有研学院本地服务器已启动（后台常驻）
  echo  访问地址: http://localhost:%PORT%
  echo  运行日志: server.log / server.err
  echo ============================================
  timeout /t 3 /nobreak >nul
  exit /b 0
)
set /a tries+=1
if %tries% geq 12 (
  echo.
  echo [失败] 12 秒内端口未就绪，server.err 内容如下：
  type server.err 2>nul
  pause
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto wait
