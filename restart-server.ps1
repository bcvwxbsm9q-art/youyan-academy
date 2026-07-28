# restart-server.ps1 - YouYan Academy local server one-click restart
# Kills all stale server.js processes (zombies), then starts a fresh detached background instance.
$ErrorActionPreference = 'Continue'
$PORT = 3003
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$WD = $ScriptDir

Write-Host "=== YouYan Academy Local Server Restart ==="

# 1. Find node processes running server.js (exclude WorkBuddy internal mcp processes)
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -like '*server.js*' -and $_.CommandLine -notlike '*app.asar*'
}
if ($procs) {
    foreach ($p in $procs) {
        try {
            Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
            Write-Host ("[OK] Killed stale server.js PID=" + $p.ProcessId)
        } catch {
            Write-Host ("[WARN] Failed to kill PID=" + $p.ProcessId + ": " + $_.Exception.Message)
        }
    }
    Start-Sleep -Seconds 2
    Write-Host "Stale processes cleared."
} else {
    Write-Host "No running server.js found, starting fresh."
}

# 2. Locate node.exe
$NODE = $null
$cands = @(
    'C:\Program Files\nodejs\node.exe',
    'C:\Users\xzj\.workbuddy\binaries\node\versions\22.22.2\node.exe'
)
foreach ($c in $cands) { if (Test-Path $c) { $NODE = $c; break } }
if (-not $NODE) { $NODE = (Get-Command node -ErrorAction SilentlyContinue).Source }
if (-not $NODE) {
    Write-Host "[ERROR] node.exe not found."
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host ("[OK] Using node: " + $NODE)

# 3. Start a detached hidden background process (survives this window closing)
Start-Process -FilePath $NODE -ArgumentList 'server.js' -WorkingDirectory $WD `
    -RedirectStandardOutput (Join-Path $WD 'server.log') `
    -RedirectStandardError (Join-Path $WD 'server.err') `
    -WindowStyle Hidden
Write-Host "Starting server (detached)..."

# 4. Health probe
$ok = $false
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri ("http://localhost:" + $PORT + "/") -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $ok = $true; Write-Host ("[OK] Server ready after " + ($i+1) + "s"); break }
    } catch { }
}
if ($ok) {
    Write-Host "======================================"
    Write-Host " SUCCESS: server is up (background)"
    Write-Host (" URL: http://localhost:" + $PORT)
    Write-Host " Logs: server.log / server.err"
    Write-Host "======================================"
} else {
    Write-Host "[FAIL] Server not ready in 25s. Check server.err:"
    if (Test-Path (Join-Path $WD 'server.err')) {
        Get-Content (Join-Path $WD 'server.err') -Tail 20 | ForEach-Object { Write-Host $_ }
    }
}
Read-Host "Press Enter to close this window (server keeps running in background)"
