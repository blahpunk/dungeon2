@echo off
setlocal

rem Allow optional port as first argument, default to 8000
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

echo Starting server on port %PORT%...
start "Dungeon Server" cmd /k "python -m http.server %PORT%"

rem Give the server a moment to start, then open the default browser
timeout /t 1 /nobreak >nul
echo Opening browser at http://localhost:%PORT%/
start "" "http://localhost:%PORT%/"

endlocal