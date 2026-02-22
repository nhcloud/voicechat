#!/bin/bash
# Start .NET Backend and UI

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting .NET Backend and UI..."
echo

# Start .NET backend in background
echo "[1/2] Starting .NET Backend..."
cd "$SCRIPT_DIR/backend-dotnet"
dotnet run &
DOTNET_PID=$!

# Wait a moment for backend to start
sleep 3

# Start UI server in background
echo "[2/2] Starting UI Server..."
cd "$SCRIPT_DIR/frontend"
npm start &
UI_PID=$!

echo
echo "Both services are running:"
echo "- .NET Backend (PID: $DOTNET_PID): http://localhost:5000 (or configured port)"
echo "- UI Server (PID: $UI_PID): http://localhost:3000 (or configured port)"
echo
echo "Press Ctrl+C to stop all services"

# Wait for both processes
wait
