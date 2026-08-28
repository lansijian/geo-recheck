$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = if ($env:GEORECHECK_PYTHON) { $env:GEORECHECK_PYTHON } else { Join-Path $ProjectRoot ".venv\Scripts\python.exe" }
if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    throw "未找到 Python 环境：$Python。请先运行 scripts\setup_windows.cmd。"
}

$Backend = Start-Process -FilePath $Python `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", "8000") `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -PassThru

try {
    Write-Host "Backend: http://127.0.0.1:8000" -ForegroundColor Green
    Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Green
    npm run dev --prefix (Join-Path $ProjectRoot "frontend")
} finally {
    if (-not $Backend.HasExited) {
        Stop-Process -Id $Backend.Id
    }
}
