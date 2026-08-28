@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "ENV_ROOT=D:\Anaconda\_envs\PulseWeave"
set "PYTHON=%ENV_ROOT%\Scripts\python.exe"

if not exist "%PYTHON%" (
    if not exist "D:\miniconda\python.exe" (
        echo [ERROR] Cannot find %PYTHON% or D:\miniconda\python.exe
        exit /b 1
    )
    echo [1/6] Creating PulseWeave Python environment...
    "D:\miniconda\python.exe" -m venv "%ENV_ROOT%"
    if errorlevel 1 exit /b 1
)

echo [2/6] Installing Python dependencies...
"%PYTHON%" -m pip install --index-url https://pypi.org/simple --upgrade pip
if errorlevel 1 exit /b 1
"%PYTHON%" -m pip install --index-url https://pypi.org/simple -r "%PROJECT_ROOT%\requirements.txt"
if errorlevel 1 exit /b 1

echo [3/6] Installing frontend dependencies...
pushd "%PROJECT_ROOT%\frontend"
call npm install
if errorlevel 1 (
    popd
    exit /b 1
)
popd

echo [4/6] Generating marker boards...
"%PYTHON%" "%PROJECT_ROOT%\scripts\generate_markers.py"
if errorlevel 1 exit /b 1
"%PYTHON%" "%PROJECT_ROOT%\scripts\generate_charuco.py"
if errorlevel 1 exit /b 1

echo [5/6] Generating benchmark...
"%PYTHON%" "%PROJECT_ROOT%\scripts\generate_benchmark.py"
if errorlevel 1 exit /b 1

echo [6/6] Seeding local demo...
"%PYTHON%" "%PROJECT_ROOT%\scripts\seed_demo.py"
if errorlevel 1 exit /b 1

echo.
echo Setup complete. Run scripts\run_dev.cmd
exit /b 0

