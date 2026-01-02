// Copyright (c) Microsoft. All rights reserved.
// Real-Time Voice Chat Backend Server using .NET

using VoiceChat.Backend.Services;
using DotNetEnv;

var builder = WebApplication.CreateBuilder(args);

// Load .env file from root directory (voicechat folder)
// Try multiple paths to find the .env file
var envPaths = new[]
{
    // From current working directory (when running from dotnet/backend)
    Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".env"),
    // Direct path to voicechat root
    "/Users/udaiapparamachandran/source/nhcloud/voicechat/.env",
    // From AppContext base directory (when running built executable)
    Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".env"),
    // Parent of current directory
    Path.Combine(Directory.GetCurrentDirectory(), "..", ".env"),
};

var envLoaded = false;
foreach (var envPath in envPaths)
{
    var fullPath = Path.GetFullPath(envPath);
    Console.WriteLine($"Checking for .env at: {fullPath}");
    if (File.Exists(fullPath))
    {
        Env.Load(fullPath);
        Console.WriteLine($"✓ Loaded .env from: {fullPath}");
        envLoaded = true;
        break;
    }
}

if (!envLoaded)
{
    Console.WriteLine("⚠ Warning: No .env file found! Checking environment variables...");
}

// Add services
builder.Services.AddLogging(logging =>
{
    logging.AddConsole();
    logging.SetMinimumLevel(LogLevel.Information);
});

// Configure CORS for frontend (served from file:// or any localhost port)
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)  // Allow any origin for development
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// Load configuration from environment variables
var azureSettings = new AzureOpenAISettings
{
    Endpoint = Environment.GetEnvironmentVariable("AZURE_ENDPOINT") ?? string.Empty,
    ApiKey = Environment.GetEnvironmentVariable("AZURE_API_KEY") ?? string.Empty,
    RealtimeDeployment = Environment.GetEnvironmentVariable("AZURE_REALTIME_DEPLOYMENT") ?? "gpt-realtime",
    ChatDeployment = Environment.GetEnvironmentVariable("AZURE_CHAT_DEPLOYMENT") ?? "gpt-4o",
    RealtimeApiVersion = Environment.GetEnvironmentVariable("API_VERSION_REALTIME") ?? "2024-10-01-preview",
    ChatApiVersion = Environment.GetEnvironmentVariable("API_VERSION_CHAT") ?? "2024-02-15-preview"
};

// Validate and display configuration
Console.WriteLine("======================================================================");
Console.WriteLine("Azure Configuration:");
Console.WriteLine($"  Endpoint: {(string.IsNullOrEmpty(azureSettings.Endpoint) ? "❌ NOT SET" : "✓ " + azureSettings.Endpoint)}");
Console.WriteLine($"  API Key: {(string.IsNullOrEmpty(azureSettings.ApiKey) ? "❌ NOT SET" : "✓ (hidden)")}");
Console.WriteLine($"  Realtime Deployment: {azureSettings.RealtimeDeployment}");
Console.WriteLine($"  Chat Deployment: {azureSettings.ChatDeployment}");
Console.WriteLine($"  Realtime API Version: {azureSettings.RealtimeApiVersion}");
Console.WriteLine($"  Chat API Version: {azureSettings.ChatApiVersion}");
Console.WriteLine("======================================================================");

if (string.IsNullOrEmpty(azureSettings.Endpoint) || string.IsNullOrEmpty(azureSettings.ApiKey))
{
    Console.WriteLine("❌ ERROR: Azure configuration incomplete! Check your .env file.");
}

builder.Services.AddSingleton(Microsoft.Extensions.Options.Options.Create(azureSettings));

// Add custom services
builder.Services.AddSingleton<SessionManager>();
builder.Services.AddSingleton<RateLimiter>();
builder.Services.AddSingleton<AzureRealtimeService>();
builder.Services.AddSingleton<AzureChatService>();

// Configure to listen on port 8001 (same as Python backend)
builder.WebHost.UseUrls("http://localhost:8001");

var app = builder.Build();

// Use CORS
app.UseCors();

// WebSocket endpoint for voice/text chat
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(20)
});

// Map WebSocket handler at root path (to match Python backend)
app.Map("/", async context =>
{
    if (context.WebSockets.IsWebSocketRequest)
    {
        var logger = context.RequestServices.GetRequiredService<ILogger<Program>>();
        var sessionManager = context.RequestServices.GetRequiredService<SessionManager>();
        var rateLimiter = context.RequestServices.GetRequiredService<RateLimiter>();
        var realtimeService = context.RequestServices.GetRequiredService<AzureRealtimeService>();
        var chatService = context.RequestServices.GetRequiredService<AzureChatService>();

        using var webSocket = await context.WebSockets.AcceptWebSocketAsync();
        
        // Get mode from query string
        var mode = context.Request.Query["mode"].FirstOrDefault() ?? "voice";
        var token = context.Request.Query["token"].FirstOrDefault();
        
        logger.LogInformation("New WebSocket connection - Mode: {Mode}", mode);

        // Authenticate user (simplified - in production use proper auth)
        var userId = AuthenticateUser(token);
        if (userId == null)
        {
            logger.LogWarning("Authentication failed");
            await webSocket.CloseAsync(
                System.Net.WebSockets.WebSocketCloseStatus.PolicyViolation,
                "Authentication failed",
                CancellationToken.None);
            return;
        }

        // Check rate limits
        var (allowed, reason) = rateLimiter.CheckRateLimit(userId);
        if (!allowed)
        {
            logger.LogWarning("Rate limit exceeded for user {UserId}: {Reason}", userId, reason);
            await webSocket.CloseAsync(
                System.Net.WebSockets.WebSocketCloseStatus.PolicyViolation,
                reason,
                CancellationToken.None);
            return;
        }

        // Create session
        var sessionId = sessionManager.CreateSession(userId, mode);
        logger.LogInformation("Session created: {SessionId} for user {UserId}", sessionId[..8], userId);

        try
        {
            if (mode == "voice")
            {
                await realtimeService.HandleVoiceSession(webSocket, sessionId);
            }
            else
            {
                await chatService.HandleTextSession(webSocket, sessionId);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Error in session {SessionId}", sessionId[..8]);
        }
        finally
        {
            sessionManager.CleanupSession(sessionId);
            rateLimiter.ReleaseConnection(userId);
            logger.LogInformation("Session ended: {SessionId}", sessionId[..8]);
        }
    }
    else
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
    }
});

// Health check endpoint
app.MapGet("/health", () => Results.Ok(new { status = "healthy", timestamp = DateTime.UtcNow }));

// Print startup info
Console.WriteLine("═══════════════════════════════════════════════════════════════════════");
Console.WriteLine("🚀 Real-Time Voice Chat Backend (.NET)");
Console.WriteLine("═══════════════════════════════════════════════════════════════════════");
Console.WriteLine($"Server: http://localhost:5001");
Console.WriteLine($"WebSocket: ws://localhost:5001/ws");
Console.WriteLine($"Azure Endpoint: {(string.IsNullOrEmpty(azureSettings.Endpoint) ? "NOT SET" : azureSettings.Endpoint)}");
Console.WriteLine($"Voice Mode: {azureSettings.RealtimeDeployment} (Realtime API)");
Console.WriteLine($"Text Mode: {azureSettings.ChatDeployment} (Chat Completion API)");
Console.WriteLine("═══════════════════════════════════════════════════════════════════════");
Console.WriteLine("💡 Start the frontend server separately on port 5000");
Console.WriteLine("═══════════════════════════════════════════════════════════════════════");

app.Run();

// Simple authentication helper (replace with proper auth in production)
static string? AuthenticateUser(string? token)
{
    // In production, validate JWT token, API key, etc.
    // For demo purposes, generate anonymous user ID
    if (string.IsNullOrEmpty(token))
    {
        return $"anon_{Guid.NewGuid():N}"[..16];
    }
    
    // Simple token validation (in production, verify properly)
    return $"user_{token.GetHashCode():X8}";
}
