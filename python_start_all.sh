#!/bin/bash
# Start Python Backend (with venv) and UI

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Python Backend and UI..."
echo

# Start Python backend in background with venv activation
echo "[1/2] Starting Python Backend (activating .venv)..."
cd "$SCRIPT_DIR/backend-python"
source .venv/bin/activate
python server.py &
PYTHON_PID=$!

# Wait a moment for backend to start
sleep 3

# Start UI server in background
echo "[2/2] Starting UI Server..."
cd "$SCRIPT_DIR/frontend"
npm start &
UI_PID=$!

echo
echo "Both services are running:"
echo "- Python Backend (PID: $PYTHON_PID): http://localhost:8001 (or configured port)"
echo "- UI Server (PID: $UI_PID): http://localhost:3000 (or configured port)"
echo
echo "Press Ctrl+C to stop all services"

# Wait for both processes
wait
