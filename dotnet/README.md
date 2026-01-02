# .NET Backend

The .NET implementation of the Voice Chat backend using .NET 8.

> For general project information, see the [main README](../README.md).

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Configured `.env` file in the root `voicechat/` folder

## Quick Start

```bash
cd backend
dotnet run
```

The backend will start on **http://localhost:8001**.

## Project Structure

```
dotnet/
├── VoiceChat.sln
└── backend/
    ├── VoiceChat.Backend.csproj
    ├── Program.cs                    # Entry point, WebSocket server
    └── Services/
        ├── AzureOpenAISettings.cs    # Configuration POCO
        ├── AzureRealtimeService.cs   # Voice mode (Realtime API)
        ├── AzureChatService.cs       # Text mode (Chat Completion API)
        ├── SessionManager.cs         # User session tracking
        └── RateLimiter.cs            # Request rate limiting
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `DotNetEnv` | Load `.env` file |
| `System.Net.WebSockets` | WebSocket client for Azure |

## How It Works

### WebSocket Server

The backend exposes a WebSocket endpoint at `/ws` that:

1. Accepts browser connections
2. Reads the `mode` query parameter (`voice` or `text`)
3. Routes to the appropriate service

### Voice Mode (`AzureRealtimeService`)

```csharp
// Connects to Azure Realtime API as a WebSocket client
var azureUri = $"wss://{endpoint}/openai/realtime?api-version={version}&deployment={deployment}";
var azureWs = new ClientWebSocket();
azureWs.Options.SetRequestHeader("api-key", apiKey);
await azureWs.ConnectAsync(azureUri, ct);

// Bidirectional proxy between browser and Azure
// Browser audio → Azure → AI response → Browser
```

### Text Mode (`AzureChatService`)

```csharp
// Uses HTTP REST API for chat completions
var client = new HttpClient();
var response = await client.PostAsync(
    $"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={version}",
    content
);
```

## Configuration

Environment variables are loaded from `../.env` (root folder):

```csharp
var rootEnvPath = Path.Combine(Directory.GetCurrentDirectory(), "..", ".env");
Env.Load(rootEnvPath);

var settings = new AzureOpenAISettings
{
    Endpoint = Environment.GetEnvironmentVariable("AZURE_ENDPOINT"),
    ApiKey = Environment.GetEnvironmentVariable("AZURE_API_KEY"),
    // ...
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
| WebSocket library | `websockets` | `System.Net.WebSockets` |
| HTTP client | `aiohttp` | `HttpClient` |
| Async pattern | `asyncio` | `async/await` with Tasks |
| Config loading | `python-dotenv` | `DotNetEnv` |
