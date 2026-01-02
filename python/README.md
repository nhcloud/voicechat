# Python Backend

The Python implementation of the Voice Chat backend using asyncio and websockets.

> For general project information, see the [main README](../README.md).

## Prerequisites

- Python 3.8+
- [Node.js 14+](https://nodejs.org/) (for frontend)
- Configured `.env` file in the root `voicechat/` folder

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the Backend

```bash
python3 server.py
```

The backend will start on **http://localhost:8001**.

### 3. Start the Frontend

```bash
cd ../../ui
node server.js
# or: npm start
```

The frontend will start on **http://localhost:8000** and open in your browser.

## Project Structure

```
python/
└── backend/
    └── server.py             # WebSocket server
```

> **Note:** Dependencies are in the root `requirements.txt` file.

## Dependencies

| Package | Purpose |
|---------|---------|
| `websockets` | WebSocket server and client |
| `aiohttp` | Async HTTP client for Chat API |
| `python-dotenv` | Load `.env` file |

Install from root folder:
```bash
pip install -r ../requirements.txt
```

## How It Works

### WebSocket Server

The backend runs an asyncio WebSocket server that:

1. Accepts browser connections on port 8001
2. Reads the `mode` query parameter (`voice` or `text`)
3. Routes to the appropriate handler

```python
async def handle_client(websocket, path):
    mode = parse_qs(urlparse(path).query).get('mode', ['voice'])[0]
    
    if mode == 'voice':
        await handle_voice_mode(websocket)
    else:
        await handle_text_mode(websocket)
```

### Voice Mode

Connects to Azure Realtime API and proxies bidirectionally:

```python
async def handle_voice_mode(browser_ws):
    azure_url = f"wss://{endpoint}/openai/realtime?api-version={version}&deployment={deployment}"
    
    async with websockets.connect(azure_url, extra_headers={"api-key": api_key}) as azure_ws:
        # Proxy: browser <-> azure
        await asyncio.gather(
            forward(browser_ws, azure_ws),  # Browser → Azure
            forward(azure_ws, browser_ws)   # Azure → Browser
        )
```

### Text Mode

Uses HTTP REST API for chat completions:

```python
async def handle_text_mode(browser_ws):
    async with aiohttp.ClientSession() as session:
        async with session.post(chat_url, json=payload, headers=headers) as response:
            # Stream response back to browser
            async for chunk in response.content:
                await browser_ws.send(chunk)
```

## Configuration

Environment variables are loaded from `../.env` (root folder):

```python
from dotenv import load_dotenv
import os

# Load from root voicechat folder
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

AZURE_ENDPOINT = os.getenv('AZURE_ENDPOINT')
AZURE_API_KEY = os.getenv('AZURE_API_KEY')
```

## Running in Production

For production, consider using:

```bash
# With uvicorn (if using ASGI wrapper)
uvicorn server:app --host 0.0.0.0 --port 8001

# Or with gunicorn
gunicorn -w 4 -k uvicorn.workers.UvicornWorker server:app
```

## Differences from .NET

| Aspect | Python | .NET |
|--------|--------|------|
| WebSocket library | `websockets` | `System.Net.WebSockets` |
| HTTP client | `aiohttp` | `HttpClient` |
| Async pattern | `asyncio` | `async/await` with Tasks |
| Config loading | `python-dotenv` | `DotNetEnv` |
