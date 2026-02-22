# .NET Backend

The .NET implementation of the Voice Chat backend using ASP.NET Core and Microsoft Agent Framework.

> For general project information, see the [main README](../README.md).

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) or later
- [Node.js 14+](https://nodejs.org/) (for frontend)
- Configured `.env` file in the root `voicechat/` folder

## Quick Start

### 1. Start the Backend

```bash
dotnet run
```

The backend will start on **http://localhost:8001**.

### 2. Start the Frontend

```bash
cd ../frontend
node server.js
# or: npm start
```

The frontend will start on **http://localhost:8000** and open in your browser.

## Project Structure

```
backend-dotnet/
├── README.md                     # This file
├── VoiceChat.sln                 # Solution file
├── concepts.ipynb                # Agent Framework concepts notebook
├── VoiceChat.Backend.csproj      # Project file
├── Program.cs                    # Entry point, WebSocket server
└── Services/
    ├── AzureOpenAISettings.cs    # Configuration POCO
    ├── AzureRealtimeService.cs   # Voice mode (Realtime API)
    ├── AzureChatService.cs       # Text mode (Agent Framework)
    ├── SessionManager.cs         # User session tracking
    └── RateLimiter.cs            # Request rate limiting
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `DotNetEnv` | Load `.env` file |
| `Azure.AI.OpenAI` | Azure OpenAI client |
| `Microsoft.Agents.AI` | Microsoft Agent Framework |
| `Microsoft.Extensions.AI` | AI abstractions and extensions |
| `System.Net.WebSockets` | WebSocket client for Azure |

## How It Works

### WebSocket Server

The backend exposes a WebSocket endpoint at the root path `/` that:

1. Accepts browser connections
2. Reads the `mode` query parameter (`voice` or `text`)
3. Routes to the appropriate service

### Voice Mode (`AzureRealtimeService`)

Connects to Azure Realtime API as a WebSocket client:

```csharp
// Connects to Azure Realtime API
var azureUri = $"wss://{endpoint}/openai/realtime?api-version={version}&deployment={deployment}";
var azureWs = new ClientWebSocket();
azureWs.Options.SetRequestHeader("api-key", apiKey);
await azureWs.ConnectAsync(azureUri, ct);

// Bidirectional proxy between browser and Azure
// Browser audio → Azure → AI response → Browser
```

### Text Mode (`AzureChatService`) - Microsoft Agent Framework

Uses Microsoft Agent Framework for chat completions with conversation memory:

```csharp
using Microsoft.Agents.AI;
using Azure.AI.OpenAI;

// Create client and agent (singleton, created once)
var client = new AzureOpenAIClient(
    new Uri(config.Endpoint),
    new AzureKeyCredential(config.ApiKey));

var chatClient = client.GetChatClient(config.ChatDeployment);

_agent = chatClient.CreateAIAgent(
    name: "ChatAssistant",
    instructions: "You are a helpful assistant.",
    description: "A helpful chat assistant powered by Azure OpenAI",
    loggerFactory: loggerFactory);
```

Per-session conversation handling:

```csharp
public async Task HandleTextSession(WebSocket clientWs, string sessionId)
{
    // Create a new thread for this conversation session
    var thread = _agent.GetNewThread();
    
    while (clientWs.State == WebSocketState.Open)
    {
        var message = await ReceiveMessageAsync(clientWs);
        
        // Run agent with thread for context
        var result = await _agent.RunAsync(userMessage, thread);
        
        await SendMessageAsync(clientWs, new { 
            type = "text_response", 
            content = result.ToString() 
        });
    }
}
```

## Microsoft Agent Framework

The text mode uses Microsoft Agent Framework (`Microsoft.Agents.AI`), providing the same patterns as the Python implementation.

### Key Classes

| Class | Purpose |
|-------|---------|
| `AzureOpenAIClient` | Azure SDK client for OpenAI |
| `CreateAIAgent()` | Extension method to create an AI agent |
| `AIAgent` | Agent with conversation capabilities |
| `AgentThread` | Maintains conversation context across turns |

### Creating an Agent

```csharp
using Microsoft.Agents.AI;
using Azure.AI.OpenAI;

// Create Azure OpenAI client
var client = new AzureOpenAIClient(
    new Uri(endpoint),
    new AzureKeyCredential(apiKey));

// Get chat client for your deployment
var chatClient = client.GetChatClient(deploymentName);

// Create agent with system instructions
var agent = chatClient.CreateAIAgent(
    name: "ChatAssistant",
    instructions: "You are a helpful assistant.",
    description: "A helpful chat assistant"
);
```

### Using AgentThread for Memory

```csharp
// Create a new thread for conversation context
var thread = agent.GetNewThread();

// First message
var result1 = await agent.RunAsync("My name is Alice", thread);
// Agent knows the name

// Second message - agent remembers context
var result2 = await agent.RunAsync("What's my name?", thread);
// Agent responds: "Your name is Alice"
```

### Streaming Responses

```csharp
await foreach (var chunk in agent.RunStreamingAsync(userMessage, thread))
{
    await SendMessageAsync(clientWs, new { 
        type = "text_delta", 
        content = chunk.ToString() 
    });
}
```

## Configuration

Environment variables are loaded from `../.env` (root voicechat folder):

```csharp
var rootEnvPath = Path.Combine(Directory.GetCurrentDirectory(), "..", ".env");
Env.Load(rootEnvPath);

var settings = new AzureOpenAISettings
{
    Endpoint = Environment.GetEnvironmentVariable("AZURE_ENDPOINT"),
    ApiKey = Environment.GetEnvironmentVariable("AZURE_API_KEY"),
    ChatDeployment = Environment.GetEnvironmentVariable("AZURE_CHAT_DEPLOYMENT"),
    RealtimeDeployment = Environment.GetEnvironmentVariable("AZURE_REALTIME_DEPLOYMENT"),
};
```

## Building

```bash
# Build only
dotnet build

# Build and run
dotnet run

# Publish for production
dotnet publish -c Release
```

## Differences from Python

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

### Package restore fails

Run the following to restore NuGet packages:
```bash
dotnet restore
```

### Connection refused on port 8001

Make sure the backend server is running:
```bash
dotnet run
```

## 📓 Concepts Notebook

See [concepts.ipynb](concepts.ipynb) for an interactive notebook explaining:
- Architecture overview
- Agent Framework concepts
- Code examples with `CreateAIAgent()`
- Comparison with Python patterns
