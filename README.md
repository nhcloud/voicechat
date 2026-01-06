# 🎤 Real-Time AI Voice Chat

A production-ready AI assistant with dual-mode support: **Voice chat** using Azure OpenAI Realtime API and **Text chat** using Microsoft Agent Framework.

Available in both **Python** and **.NET** implementations with a shared frontend.

## 🏗️ Architecture

The application uses an industry-standard 3-tier architecture where the browser never has direct access to API keys:

```
┌─────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   Browser   │ ──────► │  Backend Server  │ ──────► │   Azure OpenAI   │
│    (UI)     │   WS    │  (Python/.NET)   │   WS    │                  │
└─────────────┘  :8001  └──────────────────┘         └──────────────────┘
      │                         │
      │                         ├── API Keys 🔒 (secure)
      │                         ├── Rate Limiting
      │                         └── Session Management
      │
      └── Microphone, Audio Playback, NO API Keys ✅
```

### WebSocket Flow

Both backends act as a **WebSocket proxy** between the browser and Azure:

1. **Browser → Backend**: User audio/text via `ws://localhost:8001`
2. **Backend → Azure**: Forwards to Azure Realtime API with authentication
3. **Azure → Backend**: AI response (audio/text)
4. **Backend → Browser**: Streams response to user

### Dual-Mode API Selection

| Mode | Technology | WebSocket URL | Use Case |
|------|------------|---------------|----------|
| **Voice** | Azure Realtime API | `ws://localhost:8001?mode=voice` | Real-time voice conversation |
| **Text** | Microsoft Agent Framework | `ws://localhost:8001?mode=text` | Text-based queries with memory |

## 🤖 Microsoft Agent Framework

Both Python and .NET backends use [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) for text mode, providing a unified programming model:

### Key Benefits

- **Conversation Memory**: `AgentThread` maintains context across multiple turns
- **Unified API**: Same patterns work in Python and .NET
- **Tool Support**: Add custom functions that the AI can invoke
- **Streaming**: Built-in streaming response support
- **Enterprise Ready**: Production-quality AI orchestration

### API Comparison

| Concept | Python | .NET |
|---------|--------|------|
| **Client** | `AzureOpenAIChatClient` | `AzureOpenAIClient` |
| **Create Agent** | `client.create_agent(instructions=...)` | `chatClient.CreateAIAgent(instructions: ...)` |
| **Run Agent** | `await agent.run(message, thread=thread)` | `await agent.RunAsync(message, thread)` |
| **New Thread** | `agent.get_new_thread()` | `agent.GetNewThread()` |
| **Streaming** | `agent.run_stream()` | `agent.RunStreamingAsync()` |

### Python Example

```python
from agent_framework.azure import AzureOpenAIChatClient

# Create client and agent
client = AzureOpenAIChatClient(
    endpoint=AZURE_ENDPOINT,
    deployment_name=AZURE_CHAT_DEPLOYMENT,
    api_key=AZURE_API_KEY,
)
agent = client.create_agent(instructions="You are a helpful assistant.")

# Create thread for conversation memory
thread = agent.get_new_thread()

# Run with context
result = await agent.run("Hello!", thread=thread)
```

### .NET Example

```csharp
using Microsoft.Agents.AI;
using Azure.AI.OpenAI;

// Create client and agent
var client = new AzureOpenAIClient(new Uri(endpoint), new AzureKeyCredential(apiKey));
var chatClient = client.GetChatClient(deploymentName);
var agent = chatClient.CreateAIAgent(
    name: "ChatAssistant",
    instructions: "You are a helpful assistant."
);

// Create thread for conversation memory
var thread = agent.GetNewThread();

// Run with context
var result = await agent.RunAsync("Hello!", thread);
```

See [Agent Framework GitHub](https://github.com/microsoft/agent-framework) for more examples and documentation.

## 📁 Project Structure

```
voicechat/
├── .env.template         # Environment variables template
├── .env                  # Your local credentials (git-ignored)
├── README.md             # This file
│
├── dotnet/               # .NET Backend
│   ├── README.md         # .NET-specific setup
│   ├── concepts.ipynb    # .NET concepts notebook
│   └── backend/          # WebSocket server (port 8001)
│
├── python/               # Python Backend
│   ├── README.md         # Python-specific setup
│   ├── concepts.ipynb    # Python concepts notebook
│   └── backend/          # WebSocket server (port 8001)
│
└── ui/                   # Shared Frontend (Node.js)
    ├── README.md         # Frontend documentation
    ├── index.html        # Main UI
    ├── styles.css        # ChatGPT-style theme
    ├── script.js         # Voice/text logic
    ├── config.js         # WebSocket URL config
    ├── audio-processor.js# Audio worklet for microphone
    ├── server.js         # Node.js HTTP server (port 8000)
    └── package.json      # Node.js package file
```

> **Note:** Both backends use port 8001. Run only one backend at a time.

## 🚀 Quick Start

### Prerequisites

- Azure OpenAI resource with:
  - **Realtime deployment** (e.g., `gpt-4o-realtime-preview`) - for voice mode
  - **Chat deployment** (e.g., `gpt-4o`) - for text mode
- Modern browser with microphone support

### Step 1: Configure Environment

```bash
cp .env.template .env
# Edit .env with your Azure credentials
```

### Step 2: Start a Backend

Choose **one** backend to run:

| Backend | Command |
|---------|---------|
| Python | `cd python/backend && pip install -r ../requirements.txt --pre && python3 server.py` |
| .NET | `cd dotnet/backend && dotnet run` |

See [Python README](python/README.md) or [.NET README](dotnet/README.md) for detailed setup.

### Step 3: Start the Frontend

```bash
cd ui
node server.js
# or
npm start
```

> **Note:** Requires Node.js 14+. No additional dependencies needed.

### Step 4: Open Browser

Navigate to **http://localhost:8000**

## 🔧 Environment Variables

Configure in `.env` file at the project root:

| Variable | Description | Required |
|----------|-------------|----------|
| `AZURE_ENDPOINT` | Azure OpenAI endpoint URL | ✅ |
| `AZURE_API_KEY` | Azure OpenAI API key | ✅ |
| `AZURE_REALTIME_DEPLOYMENT` | Voice mode deployment name | ✅ |
| `AZURE_CHAT_DEPLOYMENT` | Text mode deployment name | ✅ |
| `API_VERSION_REALTIME` | Realtime API version | Optional |
| `API_VERSION_CHAT` | Chat API version | Optional |

## 🎯 Features

### Dual-Mode Support
- **Voice Mode** - Real-time voice conversation with natural speech
- **Text Mode** - Traditional text chat with streaming responses and conversation memory
- **Seamless Toggle** - Switch between modes with one click

### Voice Mode Features
- 🎤 Real-time speech-to-text
- 🔊 AI voice responses
- ⚡ Barge-in support (interrupt AI mid-response)
- 🎨 Animated voice orb UI

### Text Mode Features (Agent Framework)
- 💬 Text-based chat with streaming responses
- 🧠 Conversation memory via `AgentThread`
- 🔧 Extensible with custom tools/functions
- 🔄 Same API patterns in Python and .NET

### Security Features
- 🔒 API keys stored server-side only
- 🚫 No credentials in browser
- ⏱️ Rate limiting (60 req/min)
- 👥 Session management

## 📖 Usage

### Voice Mode (Default)
1. Allow microphone access when prompted
2. Click the microphone button or press **Space**
3. Speak naturally - AI responds in real-time
4. Speak while AI is talking to interrupt

### Text Mode
1. Click the **Text** toggle button
2. Type your message
3. Press **Enter** to send
4. View streaming responses with conversation context

## 🔒 Security Notes

- **Never commit `.env`** - it contains your API keys
- Browser connects to your backend only, never directly to Azure
- Rate limiting prevents abuse and controls costs

## 📚 Platform-Specific Documentation

- [Python Backend](python/README.md) - Python setup, dependencies, and Agent Framework usage
- [.NET Backend](dotnet/README.md) - .NET setup, dependencies, and Agent Framework usage
- [Frontend UI](ui/README.md) - Frontend setup and configuration

## 📓 Concept Notebooks

Interactive notebooks explaining the architecture and Agent Framework concepts:

- [Python Concepts](python/concepts.ipynb) - Python Agent Framework patterns
- [.NET Concepts](dotnet/concepts.ipynb) - .NET Agent Framework patterns

## 🔗 Resources

- [Microsoft Agent Framework](https://github.com/microsoft/agent-framework) - Official repository
- [Azure OpenAI Service](https://learn.microsoft.com/en-us/azure/ai-services/openai/) - Azure documentation
- [Azure OpenAI Realtime API](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/realtime-audio) - Voice mode documentation
