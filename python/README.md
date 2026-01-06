# Python Backend

The Python implementation of the Voice Chat backend using asyncio, websockets, and Microsoft Agent Framework.

> For general project information, see the [main README](../README.md).

## Prerequisites

- Python 3.8+
- [Node.js 14+](https://nodejs.org/) (for frontend)
- Configured `.env` file in the root `voicechat/` folder

## Quick Start

### 1. Create Virtual Environment (Recommended)

```bash
cd ..  # Go to voicechat root
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt --pre
```

> **Note:** The `--pre` flag is required to install the pre-release Microsoft Agent Framework packages.

### 3. Start the Backend

```bash
cd backend
python3 server.py
```

The backend will start on **http://localhost:8001**.

### 4. Start the Frontend

```bash
cd ../../ui
node server.js
# or: npm start
```

The frontend will start on **http://localhost:8000** and open in your browser.

## Project Structure

```
python/
├── README.md             # This file
├── requirements.txt      # Python dependencies
├── concepts.ipynb        # Agent Framework concepts notebook
└── backend/
    └── server.py         # WebSocket server with Agent Framework
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `websockets` | WebSocket server and client for voice proxy |
| `agent-framework-core` | Microsoft Agent Framework core library |
| `agent-framework-azure-ai` | Azure OpenAI integration via `AzureOpenAIChatClient` |
| `python-dotenv` | Load `.env` file configuration |
| `azure-identity` | Azure authentication (optional) |

Install all dependencies:
```bash
pip install -r requirements.txt --pre
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

### Text Mode (Microsoft Agent Framework)

Uses Microsoft Agent Framework for chat completions with conversation memory:

```python
from agent_framework.azure import AzureOpenAIChatClient

# Global agent singleton (created once on startup)
client = AzureOpenAIChatClient(
    endpoint=AZURE_ENDPOINT,
    deployment_name=AZURE_CHAT_DEPLOYMENT,
    api_key=AZURE_API_KEY,
)
agent = client.create_agent(
    instructions="You are a helpful assistant.",
)

async def handle_text_mode(browser_ws):
    # Create thread for this session's conversation memory
    thread = agent.get_new_thread()
    
    async for message in browser_ws:
        data = json.loads(message)
        user_message = data.get('text', '')
        
        # Run agent with thread for context
        result = await agent.run(user_message, thread=thread)
        
        await browser_ws.send(json.dumps({
            'type': 'text_response',
            'content': str(result)
        }))
```

## Microsoft Agent Framework

The text mode uses Microsoft Agent Framework (`agent-framework-azure-ai`), providing the same patterns as the .NET implementation.

### Key Classes

| Class | Purpose |
|-------|---------|
| `AzureOpenAIChatClient` | Client for Azure OpenAI with Agent Framework |
| `agent.create_agent()` | Creates an AI agent with instructions |
| `AgentThread` | Maintains conversation context across turns |

### Creating an Agent

```python
from agent_framework.azure import AzureOpenAIChatClient

# Create client with Azure credentials
client = AzureOpenAIChatClient(
    endpoint=os.getenv('AZURE_ENDPOINT'),
    deployment_name=os.getenv('AZURE_CHAT_DEPLOYMENT'),
    api_key=os.getenv('AZURE_API_KEY'),
)

# Create agent with system instructions
agent = client.create_agent(
    instructions="You are a helpful assistant.",
)
```

### Using AgentThread for Memory

```python
# Create a new thread for conversation context
thread = agent.get_new_thread()

# First message
result1 = await agent.run("My name is Alice", thread=thread)
# Agent knows the name

# Second message - agent remembers context
result2 = await agent.run("What's my name?", thread=thread)
# Agent responds: "Your name is Alice"
```

### Streaming Responses

```python
async for chunk in agent.run_stream(user_message, thread=thread):
    await websocket.send(json.dumps({
        'type': 'text_delta',
        'content': str(chunk)
    }))
```

See [Agent Framework samples](https://github.com/microsoft/agent-framework/tree/main/python/samples/getting_started/agents/azure_openai) for more examples.

## Configuration

Environment variables are loaded from `../.env` (root voicechat folder):

```python
from dotenv import load_dotenv
import os

# Load from root voicechat folder
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

AZURE_ENDPOINT = os.getenv('AZURE_ENDPOINT')
AZURE_API_KEY = os.getenv('AZURE_API_KEY')
AZURE_CHAT_DEPLOYMENT = os.getenv('AZURE_CHAT_DEPLOYMENT')
AZURE_REALTIME_DEPLOYMENT = os.getenv('AZURE_REALTIME_DEPLOYMENT')
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
| **WebSocket library** | `websockets` | `System.Net.WebSockets` |
| **Agent Framework package** | `agent-framework-azure-ai` | `Microsoft.Agents.AI` |
| **Client class** | `AzureOpenAIChatClient` | `AzureOpenAIClient` |
| **Create agent** | `client.create_agent()` | `chatClient.CreateAIAgent()` |
| **Run agent** | `await agent.run()` | `await agent.RunAsync()` |
| **Streaming** | `agent.run_stream()` | `agent.RunStreamingAsync()` |
| **Get thread** | `agent.get_new_thread()` | `agent.GetNewThread()` |
| **Async pattern** | `asyncio` | `async/await` with Tasks |
| **Config loading** | `python-dotenv` | `DotNetEnv` |

## Troubleshooting

### "Azure OpenAI is not configured"

Check that your `.env` file exists in the root `voicechat/` folder with:
```
AZURE_ENDPOINT=https://your-resource.openai.azure.com
AZURE_API_KEY=your-api-key
AZURE_CHAT_DEPLOYMENT=gpt-4o
AZURE_REALTIME_DEPLOYMENT=gpt-4o-realtime-preview
```

### Import errors with agent-framework

Make sure you installed with the `--pre` flag:
```bash
pip install -r requirements.txt --pre
```

### Connection refused on port 8001

Make sure the backend server is running:
```bash
cd backend
python3 server.py
```

## 📓 Concepts Notebook

See [concepts.ipynb](concepts.ipynb) for an interactive notebook explaining:
- Architecture overview
- Agent Framework concepts
- Code examples with `AzureOpenAIChatClient`
- Comparison with .NET patterns
