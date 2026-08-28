@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
set "PYTHON=D:\Anaconda\_envs\PulseWeave\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo [ERROR] PulseWeave Python was not found: %PYTHON%
    echo Run scripts\setup_windows.cmd first.
    exit /b 1
)

"%PYTHON%" "%PROJECT_ROOT%\scripts\run_dev.py"
exit /b %errorlevel%

