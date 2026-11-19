# Vocal Trainer — dev launcher
# Starts backend + Vite + Electron in one command.
# Run from the vocal-trainer directory: .\start.ps1
# powershell -ExecutionPolicy Bypass -File start.ps1

$root = $PSScriptRoot

Write-Host "`n==> Starting Vocal Trainer`n" -ForegroundColor Cyan

# ── Check prerequisites ────────────────────────────────────────────────────────
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: python not found on PATH" -ForegroundColor Red; exit 1
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: ffmpeg not found. Install with: winget install ffmpeg" -ForegroundColor Red; exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: node not found on PATH" -ForegroundColor Red; exit 1
}

# ── Backend ────────────────────────────────────────────────────────────────────
Write-Host "[1/3] Starting Python backend on :8000..." -ForegroundColor Yellow
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$root\backend'; uvicorn main:app --host 0.0.0.0 --port 8000" `
    -PassThru -WindowStyle Normal

# Wait for backend to be ready
Write-Host "      Waiting for backend..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $ready = $true; break }
    } catch {}
}
if (-not $ready) {
    Write-Host "ERROR: Backend did not start in time. Check the backend window for errors." -ForegroundColor Red
    $backend | Stop-Process -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "      Backend ready." -ForegroundColor Green

# ── Vite dev server ────────────────────────────────────────────────────────────
Write-Host "[2/3] Starting Vite on :5173..." -ForegroundColor Yellow
$vite = Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$root\electron'; npx vite" `
    -PassThru -WindowStyle Minimized

# Wait for Vite
$viteReady = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("localhost", 5173)
        if ($tcp.Connected) { $tcp.Close(); $viteReady = $true; break }
        $tcp.Close()
    } catch {}
}
if (-not $viteReady) {
    Write-Host "ERROR: Vite did not start in time." -ForegroundColor Red
    $backend | Stop-Process -ErrorAction SilentlyContinue
    $vite   | Stop-Process -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "      Vite ready." -ForegroundColor Green

# ── Electron ───────────────────────────────────────────────────────────────────
Write-Host "[3/3] Launching Electron..." -ForegroundColor Yellow
$electron = Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$root\electron'; npx electron ." `
    -PassThru -WindowStyle Minimized

$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169" } | Select-Object -First 1).IPAddress
Write-Host "`nAll services running." -ForegroundColor Cyan
Write-Host "Open on your phone (same WiFi): http://${localIP}:5173`n" -ForegroundColor Green

# ── Keep alive — kill children on Ctrl+C ──────────────────────────────────────
try {
    Wait-Process -Id $electron.Id -ErrorAction SilentlyContinue
} finally {
    Write-Host "`nShutting down..." -ForegroundColor DarkGray
    $electron | Stop-Process -ErrorAction SilentlyContinue
    $vite     | Stop-Process -ErrorAction SilentlyContinue
    $backend  | Stop-Process -ErrorAction SilentlyContinue
}
