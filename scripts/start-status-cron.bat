@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Nem talalhato Node.js a gepen.
    echo Toltsd le es telepitsd innen: https://nodejs.org/
    pause
    exit /b 1
)

node "run-status-cron.mjs"

echo.
echo A folyamat leallt.
pause
