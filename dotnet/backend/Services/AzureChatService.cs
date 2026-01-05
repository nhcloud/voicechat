using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Azure;
using Azure.AI.OpenAI;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

namespace VoiceChat.Backend.Services;

/// <summary>
/// Handles text chat sessions using Azure OpenAI Chat Completion API
/// </summary>
public class AzureChatService
{
    private readonly AzureOpenAISettings _settings;
    private readonly SessionManager _sessionManager;
    private readonly ILogger<AzureChatService> _logger;
    private readonly AzureOpenAIClient? _client;

    public AzureChatService(
        IOptions<AzureOpenAISettings> settings,
        SessionManager sessionManager,
        ILogger<AzureChatService> logger)
    {
        _settings = settings.Value;
        _sessionManager = sessionManager;
        _logger = logger;

        // Initialize Azure OpenAI client if configured
        if (!string.IsNullOrEmpty(_settings.Endpoint) && !string.IsNullOrEmpty(_settings.ApiKey))
        {
            _client = new AzureOpenAIClient(
                new Uri(_settings.Endpoint),
                new AzureKeyCredential(_settings.ApiKey));
        }
    }

    /// <summary>
    /// Handles a text chat session
    /// </summary>
    public async Task HandleTextSession(WebSocket clientWs, string sessionId)
    {
        if (_client == null)
        {
            await SendMessage(clientWs, new { type = "error", error = "Azure OpenAI is not configured. Check AZURE_ENDPOINT and AZURE_API_KEY environment variables." });
            return;
        }

        var buffer = new byte[8 * 1024]; // 8KB buffer for text
        var conversationHistory = new List<ChatMessage>
        {
            new SystemChatMessage("You are a helpful assistant. Respond naturally and concisely.")
        };

        _logger.LogInformation("Text mode session started: {SessionId}", sessionId[..8]);

        // Send session created notification
        await SendMessage(clientWs, new { type = "session.created", session_id = sessionId });

        try
        {
            while (clientWs.State == WebSocketState.Open)
            {
                // Accumulate message fragments
                var messageBuilder = new StringBuilder();
                WebSocketReceiveResult result;
                
                do
                {
                    result = await clientWs.ReceiveAsync(
                        new ArraySegment<byte>(buffer), 
                        CancellationToken.None);

                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        break;
                    }

                    if (result.MessageType == WebSocketMessageType.Text)
                    {
                        messageBuilder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    }
                } while (!result.EndOfMessage);

                if (result.MessageType == WebSocketMessageType.Close)
                {
                    break;
                }

                if (result.MessageType == WebSocketMessageType.Text && messageBuilder.Length > 0)
                {
                    var messageJson = messageBuilder.ToString();
                    _logger.LogDebug("[{SessionId}] Received message: {Message}", sessionId[..8], messageJson);
                    await ProcessTextMessage(clientWs, sessionId, messageJson, conversationHistory);
                }
            }
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
        {
            _logger.LogInformation("Text session closed prematurely: {SessionId}", sessionId[..8]);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in text session {SessionId}", sessionId[..8]);
            await SendMessage(clientWs, new { type = "error", error = ex.Message });
        }
    }

    private async Task ProcessTextMessage(
        WebSocket clientWs, 
        string sessionId, 
        string messageJson,
        List<ChatMessage> conversationHistory)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var request = JsonSerializer.Deserialize<TextMessageRequest>(messageJson, options);
            
            // Support both 'text_message' (frontend) and 'text.message' formats
            // Support both 'content' (frontend) and 'Text' fields
            var messageType = request?.Type;
            var messageText = request?.Content ?? request?.Text;
            
            _logger.LogDebug("[{SessionId}] Parsed message - Type: {Type}, Content: {Content}", 
                sessionId[..8], messageType ?? "null", messageText ?? "null");
            
            if ((messageType != "text_message" && messageType != "text.message") || string.IsNullOrEmpty(messageText))
            {
                _logger.LogWarning("[{SessionId}] Invalid message type or empty content. Type: {Type}", 
                    sessionId[..8], messageType ?? "null");
                return;
            }

            _logger.LogInformation("[{SessionId}] User: {Message}", sessionId[..8], messageText[..Math.Min(50, messageText.Length)]);
            _sessionManager.UpdateActivity(sessionId);

            // Add user message to history
            conversationHistory.Add(new UserChatMessage(messageText));

            // Get response from Azure OpenAI
            var chatClient = _client!.GetChatClient(_settings.ChatDeployment);
            
            // Stream the response
            var responseBuilder = new StringBuilder();
            
            await foreach (var update in chatClient.CompleteChatStreamingAsync(conversationHistory))
            {
                foreach (var contentPart in update.ContentUpdate)
                {
                    if (!string.IsNullOrEmpty(contentPart.Text))
                    {
                        responseBuilder.Append(contentPart.Text);
                    }
                }
            }

            var fullResponse = responseBuilder.ToString();
            
            // Add assistant response to history
            conversationHistory.Add(new AssistantChatMessage(fullResponse));
            
            // Send response in the format expected by the frontend
            await SendMessage(clientWs, new 
            { 
                type = "text_response",
                content = fullResponse
            });

            _logger.LogInformation("[{SessionId}] Assistant: {Response}", 
                sessionId[..8], fullResponse[..Math.Min(50, fullResponse.Length)]);
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Invalid JSON message in session {SessionId}: {Message}", sessionId[..8], messageJson);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing message in session {SessionId}", sessionId[..8]);
            await SendMessage(clientWs, new { type = "error", error = ex.Message });
        }
    }

    private async Task SendMessage(WebSocket ws, object message)
    {
        if (ws.State == WebSocketState.Open)
        {
            var json = JsonSerializer.Serialize(message);
            var buffer = Encoding.UTF8.GetBytes(json);
            await ws.SendAsync(
                new ArraySegment<byte>(buffer),
                WebSocketMessageType.Text,
                true,
                CancellationToken.None);
        }
    }

    private class TextMessageRequest
    {
        public string? Type { get; set; }
        public string? Text { get; set; }
        public string? Content { get; set; }
    }
}
