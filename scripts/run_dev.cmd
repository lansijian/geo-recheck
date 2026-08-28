@echo off
setlocal
set "PROJECT_ROOT=%~dp0.."
if defined GEORECHECK_PYTHON (
    set "PYTHON=%GEORECHECK_PYTHON%"
) else (
    set "PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"
)

if not exist "%PYTHON%" (
    echo [ERROR] Python environment was not found: %PYTHON%
    echo Run scripts\setup_windows.cmd first.
    exit /b 1
)

"%PYTHON%" "%PROJECT_ROOT%\scripts\run_dev.py"
exit /b %errorlevel%
