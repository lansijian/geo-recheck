@echo off
setlocal EnableExtensions

set "PROJECT_ROOT=%~dp0.."
set "TARGET=%PROJECT_ROOT%\data\datasets\crackforest"
set "REPOSITORY=https://github.com/cuilimeng/CrackForest-dataset.git"

if exist "%TARGET%\.git" (
    echo CrackForest already exists: %TARGET%
    git -C "%TARGET%" rev-parse --short HEAD
    exit /b 0
)

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] git.exe was not found in PATH.
    exit /b 1
)

echo Cloning CrackForest from GitHub...
git -c http.sslBackend=schannel clone --depth 1 "%REPOSITORY%" "%TARGET%"
if not errorlevel 1 goto success

echo Normal DNS failed. Resolving github.com through 1.0.0.1...
set "GITHUB_IP="
for /f "tokens=2" %%A in ('nslookup github.com 1.0.0.1 ^| findstr /C:"Address:"') do set "GITHUB_IP=%%A"
if not defined GITHUB_IP (
    echo [ERROR] Could not resolve github.com through fallback DNS.
    exit /b 1
)

echo Retrying GitHub with one-command DNS override: %GITHUB_IP%
git -c http.sslBackend=schannel -c http.curloptResolve=github.com:443:%GITHUB_IP% clone --depth 1 "%REPOSITORY%" "%TARGET%"
if errorlevel 1 (
    echo [ERROR] CrackForest clone failed.
    exit /b 1
)

:success
echo CrackForest downloaded successfully.
git -C "%TARGET%" remote -v
git -C "%TARGET%" rev-parse HEAD
echo This is a road-crack texture dataset, not a Guizhou geohazard dataset.
exit /b 0

