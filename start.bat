@echo off
setlocal

rem Allow optional port as first argument, default to 8000
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

echo Starting PHP server on port %PORT%...
start "PHP Server" cmd /k "php -S 0.0.0.0:%PORT%"

rem Give the server a moment to start, then open the default browser
timeout /t 1 /nobreak >nul
echo Opening browser at http://0.0.0.0:%PORT%/
start "" "http://0.0.0.0:%PORT%/"

endlocal