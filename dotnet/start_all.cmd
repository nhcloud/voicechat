@echo off
REM Start .NET Backend and UI

echo Starting .NET Backend and UI...
echo.

REM Start .NET backend in a new window
echo [1/2] Starting .NET Backend...
start "DotNet Backend" cmd /k "cd /d %~dp0backend && dotnet run"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Start UI server in a new window
echo [2/2] Starting UI Server...
start "UI Server" cmd /k "cd /d %~dp0..\ui && npm start"

echo.
echo Both services are starting in separate windows.
echo - .NET Backend: http://localhost:5000 (or configured port)
echo - UI Server: http://localhost:3000 (or configured port)
echo.
pause
