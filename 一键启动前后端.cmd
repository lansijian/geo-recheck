@echo off
setlocal EnableExtensions
title GeoRecheck V0.6 - Frontend and Backend

cd /d "%~dp0"
set "GEORECHECK_PYTHON=D:\Anaconda\_envs\PulseWeave\Scripts\python.exe"
set "GEORECHECK_OPEN_BROWSER=1"

if not exist "%GEORECHECK_PYTHON%" (
    echo [ERROR] Python environment was not found:
    echo %GEORECHECK_PYTHON%
    echo.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo [ERROR] Frontend dependencies were not found.
    echo Run scripts\setup_windows.cmd first.
    echo.
    pause
    exit /b 1
)

echo Starting GeoRecheck frontend and backend...
echo.
echo Backend: http://127.0.0.1:8000
echo Showcase: http://127.0.0.1:5173/showcase
echo Google Chrome will open automatically after both services are ready.
echo.
echo Keep this window open while testing.
echo Press Ctrl+C to stop both services.
echo ============================================================
echo.

"%GEORECHECK_PYTHON%" scripts\run_dev.py
set "APP_EXIT=%ERRORLEVEL%"

echo.
if not "%APP_EXIT%"=="0" (
    echo [ERROR] GeoRecheck stopped with exit code %APP_EXIT%.
) else (
    echo GeoRecheck has stopped.
)
echo.
pause
exit /b %APP_EXIT%
