@echo off
REM Start Python Backend (with venv) and UI

echo Starting Python Backend and UI...
echo.

REM Start Python backend in a new window with venv activation
echo [1/2] Starting Python Backend (activating .venv)...
start "Python Backend" cmd /k "cd /d %~dp0 && call .venv\Scripts\activate && cd backend && python server.py"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start UI server in a new window
echo [2/2] Starting UI Server...
start "UI Server" cmd /k "cd /d %~dp0..\ui && npm start"

echo.
echo Both services are starting in separate windows.
echo - Python Backend: http://localhost:8001 (or configured port)
echo - UI Server: http://localhost:3000 (or configured port)
echo.
pause
