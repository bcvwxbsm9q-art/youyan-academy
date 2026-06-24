# 重启本地服务器脚本
# 用于停止并重新启动 node server.js

Write-Host "正在重启本地服务器..." -ForegroundColor Cyan

# 查找并停止占用 3000 端口的进程（默认端口）
$port = 3000
$processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique

if ($processes) {
    Write-Host "发现占用端口 $port 的进程: $processes" -ForegroundColor Yellow
    foreach ($pid in $processes) {
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "已停止进程 PID: $pid" -ForegroundColor Green
        } catch {
            Write-Host "无法停止进程 $pid : $_" -ForegroundColor Red
        }
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "端口 $port 未被占用" -ForegroundColor Green
}

# 启动服务器
Write-Host "`n启动服务器..." -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止服务器`n" -ForegroundColor Gray

# 使用 node 直接运行 server.js
node server.js
