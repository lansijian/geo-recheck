$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvironmentRoot = "D:\Anaconda\_envs\PulseWeave"
$Python = Join-Path $EnvironmentRoot "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $Python -PathType Leaf)) {
    $BootstrapPython = "D:\miniconda\python.exe"
    if (-not (Test-Path -LiteralPath $BootstrapPython -PathType Leaf)) {
        throw "未找到 $Python，也未找到用于创建环境的 $BootstrapPython。"
    }
    & $BootstrapPython -m venv $EnvironmentRoot
}

& $Python -m pip install --index-url https://pypi.org/simple --upgrade pip
& $Python -m pip install --index-url https://pypi.org/simple -r (Join-Path $ProjectRoot "requirements.txt")

Push-Location (Join-Path $ProjectRoot "frontend")
try {
    npm install
} finally {
    Pop-Location
}

& $Python (Join-Path $ProjectRoot "scripts\generate_markers.py")
& $Python (Join-Path $ProjectRoot "scripts\generate_charuco.py")
& $Python (Join-Path $ProjectRoot "scripts\generate_benchmark.py")
& $Python (Join-Path $ProjectRoot "scripts\seed_demo.py")

Write-Host "PulseWeave 环境准备完成：$Python" -ForegroundColor Green
