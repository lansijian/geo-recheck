$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvironmentRoot = Join-Path $ProjectRoot ".venv"
$Python = if ($env:GEORECHECK_PYTHON) { $env:GEORECHECK_PYTHON } else { Join-Path $EnvironmentRoot "Scripts\python.exe" }

if ($env:GEORECHECK_PYTHON) {
    if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
        throw "GEORECHECK_PYTHON 指向的文件不存在：$Python"
    }
} elseif (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3.11 -m venv $EnvironmentRoot
    } elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv $EnvironmentRoot
    } else {
        throw "未找到 Python。请先安装 Python 3.11 或设置 GEORECHECK_PYTHON。"
    }
}

& $Python -m pip install --index-url https://pypi.org/simple --upgrade pip
& $Python -m pip install --index-url https://pypi.org/simple -r (Join-Path $ProjectRoot "requirements.txt")

Push-Location (Join-Path $ProjectRoot "frontend")
try {
    npm install
} finally {
    Pop-Location
}

& $Python (Join-Path $ProjectRoot "scripts\download_wall_scene_data.py")
& $Python (Join-Path $ProjectRoot "scripts\select_wall_scenes.py")
& $Python (Join-Path $ProjectRoot "scripts\generate_wall_recheck_demo.py")
& $Python (Join-Path $ProjectRoot "scripts\generate_markers.py")
& $Python (Join-Path $ProjectRoot "scripts\generate_charuco.py")
& $Python (Join-Path $ProjectRoot "scripts\run_validation_v03.py")
& $Python (Join-Path $ProjectRoot "scripts\reset_demo.py")

Write-Host "GeoRecheck 环境准备完成：$Python" -ForegroundColor Green
