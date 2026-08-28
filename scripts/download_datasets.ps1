$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Target = Join-Path $ProjectRoot "data\datasets\crackforest"

if (Test-Path -LiteralPath (Join-Path $Target ".git") -PathType Container) {
    Write-Host "CrackForest 已存在：$Target"
    exit 0
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
git clone --depth 1 https://github.com/cuilimeng/CrackForest-dataset.git $Target
if ($LASTEXITCODE -ne 0) {
    Write-Warning "CrackForest 下载失败。该数据集不阻塞合成几何基准，可稍后重试此脚本。"
    exit 0
}

Write-Host "CrackForest 下载完成。它仅用于道路裂缝纹理与视觉测试，不是贵州地灾训练集。" -ForegroundColor Green

