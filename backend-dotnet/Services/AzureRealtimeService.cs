using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace VoiceChat.Backend.Services;

/// <summary>
/// Handles real-time voice chat sessions using Azure OpenAI Realtime API
/// </summary>
public class AzureRealtimeService
{
    private readonly AzureOpenAISettings _settings;
    private readonly SessionManager _sessionManager;
    private readonly ILogger<AzureRealtimeService> _logger;

    public AzureRealtimeService(
        IOptions<AzureOpenAISettings> settings,
        SessionManager sessionManager,
        ILogger<AzureRealtimeService> logger)
    {
        _settings = settings.Value;
        _sessionManager = sessionManager;
        _logger = logger;
    }

    /// <summary>
    /// Handles a voice session by proxying between client and Azure Realtime API
    /// </summary>
    public async Task HandleVoiceSession(WebSocket clientWs, string sessionId)
    {
        ValidateConfiguration();
        
        var azureWsUrl = BuildAzureRealtimeUrl();
        // Log URL without API key for debugging
        var debugUrl = azureWsUrl.Split("&api-key=")[0];
        _logger.LogInformation("Connecting to Azure Realtime API for session {SessionId}...", sessionId[..8]);
        _logger.LogInformation("Azure URL (key hidden): {Url}", debugUrl);

        using var azureWs = new ClientWebSocket();
        
        try
        {
            // Connect to Azure
            await azureWs.ConnectAsync(new Uri(azureWsUrl), CancellationToken.None);
            _logger.LogInformation("✓ Connected to Azure Realtime API [session {SessionId}]", sessionId[..8]);

            // Create cancellation token for coordinated shutdown
            using var cts = new CancellationTokenSource();

            // Start bidirectional proxying
            var clientToAzure = ProxyClientToAzure(clientWs, azureWs, sessionId, cts.Token);
            var azureToClient = ProxyAzureToClient(azureWs, clientWs, sessionId, cts.Token);

            // Wait for either direction to complete (or error)
            var completedTask = await Task.WhenAny(clientToAzure, azureToClient);
            
            // Cancel the other task
            cts.Cancel();

            // Wait for both to complete with error handling
            try
            {
                await Task.WhenAll(clientToAzure, azureToClient);
            }
            catch (OperationCanceledException)
            {
                // Expected when cancelling
            }
        }
        catch (WebSocketException ex)
        {
            _logger.LogError(ex, "Azure Realtime API connection failed for session {SessionId}", sessionId[..8]);
            
            // Send error to client
            await SendErrorToClient(clientWs, $"Failed to connect to Azure Realtime API: {ex.Message}");
            
            if (ex.Message.Contains("401") || ex.Message.Contains("403"))
            {
                _logger.LogError("Check your AZURE_API_KEY and AZURE_ENDPOINT configuration");
            }
            if (ex.Message.Contains("404"))
            {
                _logger.LogError("Check your deployment name: {Deployment}", _settings.RealtimeDeployment);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in voice session {SessionId}", sessionId[..8]);
            await SendErrorToClient(clientWs, $"Voice session error: {ex.Message}");
        }
    }

    /// <summary>
    /// Proxies messages from client browser to Azure
    /// </summary>
    private async Task ProxyClientToAzure(
        WebSocket clientWs, 
        WebSocket azureWs, 
        string sessionId,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[64 * 1024]; // 64KB buffer for audio

        try
        {
            while (clientWs.State == WebSocketState.Open && 
                   azureWs.State == WebSocketState.Open &&
                   !cancellationToken.IsCancellationRequested)
            {
                var result = await clientWs.ReceiveAsync(
                    new ArraySegment<byte>(buffer), 
                    cancellationToken);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogInformation("Client closed connection for session {SessionId}", sessionId[..8]);
                    break;
                }

                _sessionManager.UpdateActivity(sessionId);

                // Forward to Azure
                await azureWs.SendAsync(
                    new ArraySegment<byte>(buffer, 0, result.Count),
                    result.MessageType,
                    result.EndOfMessage,
                    cancellationToken);

                // Log JSON messages (skip binary audio for noise reduction)
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    LogClientMessage(message, sessionId);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Normal cancellation
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
        {
            _logger.LogInformation("Client connection closed prematurely for session {SessionId}", sessionId[..8]);
        }
    }

    /// <summary>
    /// Proxies messages from Azure back to client browser
    /// Intercepts function calls and executes tools server-side
    /// </summary>
    private async Task ProxyAzureToClient(
        WebSocket azureWs, 
        WebSocket clientWs, 
        string sessionId,
        CancellationToken cancellationToken)
    {
        var buffer = new byte[64 * 1024]; // 64KB buffer for audio

        try
        {
            while (azureWs.State == WebSocketState.Open && 
                   clientWs.State == WebSocketState.Open &&
                   !cancellationToken.IsCancellationRequested)
            {
                var result = await azureWs.ReceiveAsync(
                    new ArraySegment<byte>(buffer), 
                    cancellationToken);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    _logger.LogInformation("Azure closed connection for session {SessionId}", sessionId[..8]);
                    break;
                }

                // Check for function calls in text messages
                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var message = Encoding.UTF8.GetString(buffer, 0, result.Count);
                    
                    // Check if this is a function call that needs server-side handling
                    if (await TryHandleFunctionCall(message, azureWs, sessionId, cancellationToken))
                    {
                        // Function was handled, still forward to client for visibility
                        await clientWs.SendAsync(
                            new ArraySegment<byte>(buffer, 0, result.Count),
                            result.MessageType,
                            result.EndOfMessage,
                            cancellationToken);
                        continue;
                    }
                    
                    LogAzureMessage(message, sessionId);
                }

                // Forward to client
                await clientWs.SendAsync(
                    new ArraySegment<byte>(buffer, 0, result.Count),
                    result.MessageType,
                    result.EndOfMessage,
                    cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Normal cancellation
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
        {
            _logger.LogInformation("Azure connection closed prematurely for session {SessionId}", sessionId[..8]);
        }
    }

    /// <summary>
    /// Handles function calls from Azure OpenAI and sends results back
    /// </summary>
    private async Task<bool> TryHandleFunctionCall(
        string message, 
        WebSocket azureWs, 
        string sessionId,
        CancellationToken cancellationToken)
    {
        try
        {
            using var doc = JsonDocument.Parse(message);
            var root = doc.RootElement;
            
            if (!root.TryGetProperty("type", out var typeElement))
                return false;

            var type = typeElement.GetString();
            
            // Handle function call arguments done - this is when we execute the tool
            if (type == "response.function_call_arguments.done")
            {
                var callId = root.TryGetProperty("call_id", out var callIdEl) 
                    ? callIdEl.GetString() : null;
                var name = root.TryGetProperty("name", out var nameEl) 
                    ? nameEl.GetString() : null;
                var arguments = root.TryGetProperty("arguments", out var argsEl) 
                    ? argsEl.GetString() : "{}";

                if (string.IsNullOrEmpty(callId) || string.IsNullOrEmpty(name))
                    return false;

                _logger.LogInformation("[{SessionId}] 🔧 Function call: {Name} with args: {Args}", 
                    sessionId[..8], name, arguments);

                // Execute the tool
                string result;
                if (name == "get_weather")
                {
                    result = WeatherTool.Execute(arguments ?? "{}");
                    _logger.LogInformation("[{SessionId}] 🌤️ Weather result: {Result}", sessionId[..8], result);
                }
                else
                {
                    result = JsonSerializer.Serialize(new { error = $"Unknown function: {name}" });
                    _logger.LogWarning("[{SessionId}] ⚠️ Unknown function: {Name}", sessionId[..8], name);
                }

                // Send the function result back to Azure
                await SendFunctionResult(azureWs, callId, result, cancellationToken);
                
                return true;
            }

            return false;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    /// <summary>
    /// Sends function execution result back to Azure OpenAI
    /// </summary>
    private async Task SendFunctionResult(
        WebSocket azureWs, 
        string callId, 
        string result,
        CancellationToken cancellationToken)
    {
        // Send conversation.item.create with function output
        var itemCreate = JsonSerializer.Serialize(new
        {
            type = "conversation.item.create",
            item = new
            {
                type = "function_call_output",
                call_id = callId,
                output = result
            }
        });

        var itemBuffer = Encoding.UTF8.GetBytes(itemCreate);
        await azureWs.SendAsync(
            new ArraySegment<byte>(itemBuffer),
            WebSocketMessageType.Text,
            true,
            cancellationToken);

        _logger.LogDebug("Sent function_call_output for call_id: {CallId}", callId);

        // Trigger response.create to continue the conversation
        var responseCreate = JsonSerializer.Serialize(new
        {
            type = "response.create"
        });

        var responseBuffer = Encoding.UTF8.GetBytes(responseCreate);
        await azureWs.SendAsync(
            new ArraySegment<byte>(responseBuffer),
            WebSocketMessageType.Text,
            true,
            cancellationToken);

        _logger.LogDebug("Sent response.create to continue after function call");
    }

    private void LogClientMessage(string message, string sessionId)
    {
        try
        {
            var json = JsonDocument.Parse(message);
            var type = json.RootElement.TryGetProperty("type", out var typeElement) 
                ? typeElement.GetString() 
                : "unknown";
            
            // Only log non-audio messages to reduce noise
            if (type != "input_audio_buffer.append")
            {
                _logger.LogDebug("[{SessionId}] Client → Azure: {Type}", sessionId[..8], type);
            }
        }
        catch
        {
            _logger.LogDebug("[{SessionId}] Client → Azure: (non-JSON)", sessionId[..8]);
        }
    }

    private void LogAzureMessage(string message, string sessionId)
    {
        try
        {
            var json = JsonDocument.Parse(message);
            var type = json.RootElement.TryGetProperty("type", out var typeElement) 
                ? typeElement.GetString() 
                : "unknown";
            
            // Log important events
            if (type is "session.created" or "response.created" or "response.done" or "error")
            {
                _logger.LogInformation("[{SessionId}] Azure → Client: {Type}", sessionId[..8], type);
            }
            else if (!type?.StartsWith("response.audio") ?? true)
            {
                _logger.LogDebug("[{SessionId}] Azure → Client: {Type}", sessionId[..8], type);
            }
        }
        catch
        {
            _logger.LogDebug("[{SessionId}] Azure → Client: (non-JSON)", sessionId[..8]);
        }
    }

    private string BuildAzureRealtimeUrl()
    {
        var wsEndpoint = _settings.Endpoint.Replace("https://", "wss://").TrimEnd('/');
        return $"{wsEndpoint}/openai/realtime" +
               $"?api-version={_settings.RealtimeApiVersion}" +
               $"&deployment={_settings.RealtimeDeployment}" +
               $"&api-key={_settings.ApiKey}";
    }

    private void ValidateConfiguration()
    {
        if (string.IsNullOrEmpty(_settings.Endpoint))
            throw new InvalidOperationException("AZURE_ENDPOINT environment variable is not set");
        if (string.IsNullOrEmpty(_settings.ApiKey))
            throw new InvalidOperationException("AZURE_API_KEY environment variable is not set");
        if (string.IsNullOrEmpty(_settings.RealtimeDeployment))
            throw new InvalidOperationException("AZURE_REALTIME_DEPLOYMENT environment variable is not set");
    }

    private async Task SendErrorToClient(WebSocket clientWs, string errorMessage)
    {
        if (clientWs.State == WebSocketState.Open)
        {
            var errorJson = JsonSerializer.Serialize(new
            {
                type = "error",
                error = errorMessage
            });
            var buffer = Encoding.UTF8.GetBytes(errorJson);
            await clientWs.SendAsync(
                new ArraySegment<byte>(buffer),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None);
        }
    }
}
