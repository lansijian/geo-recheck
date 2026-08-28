@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
if defined GEORECHECK_PYTHON (
    set "PYTHON=%GEORECHECK_PYTHON%"
    if not exist "%GEORECHECK_PYTHON%" (
        echo [ERROR] GEORECHECK_PYTHON does not exist: %GEORECHECK_PYTHON%
        exit /b 1
    )
) else (
    set "ENV_ROOT=%PROJECT_ROOT%\.venv"
    set "PYTHON=%PROJECT_ROOT%\.venv\Scripts\python.exe"
    if not exist "%PROJECT_ROOT%\.venv\Scripts\python.exe" (
        echo [1/9] Creating local Python environment...
        where py >nul 2>nul
        if not errorlevel 1 (
            py -3.11 -m venv "%PROJECT_ROOT%\.venv"
        ) else (
            python -m venv "%PROJECT_ROOT%\.venv"
        )
        if errorlevel 1 exit /b 1
    )
)

echo [2/9] Installing Python dependencies...
"%PYTHON%" -m pip install --index-url https://pypi.org/simple --upgrade pip
if errorlevel 1 exit /b 1
"%PYTHON%" -m pip install --index-url https://pypi.org/simple -r "%PROJECT_ROOT%\requirements.txt"
if errorlevel 1 exit /b 1

echo [3/9] Installing frontend dependencies...
pushd "%PROJECT_ROOT%\frontend"
call npm install
if errorlevel 1 (
    popd
    exit /b 1
)
popd

echo [4/9] Downloading official wall crack dataset...
"%PYTHON%" "%PROJECT_ROOT%\scripts\download_wall_scene_data.py"
if errorlevel 1 exit /b 1

echo [5/9] Selecting licensed wall scenes...
"%PYTHON%" "%PROJECT_ROOT%\scripts\select_wall_scenes.py"
if errorlevel 1 exit /b 1

echo [6/9] Generating coherent wall recheck demo...
"%PYTHON%" "%PROJECT_ROOT%\scripts\generate_wall_recheck_demo.py"
if errorlevel 1 exit /b 1

echo [7/9] Generating recheck stickers and calibration board...
"%PYTHON%" "%PROJECT_ROOT%\scripts\generate_markers.py"
if errorlevel 1 exit /b 1
"%PYTHON%" "%PROJECT_ROOT%\scripts\generate_charuco.py"
if errorlevel 1 exit /b 1

echo [8/9] Running V0.3 method comparison...
"%PYTHON%" "%PROJECT_ROOT%\scripts\run_validation_v03.py"
if errorlevel 1 exit /b 1

echo [9/9] Seeding local demo...
"%PYTHON%" "%PROJECT_ROOT%\scripts\reset_demo.py"
if errorlevel 1 exit /b 1

echo.
echo Setup complete. Run scripts\run_dev.cmd
exit /b 0
