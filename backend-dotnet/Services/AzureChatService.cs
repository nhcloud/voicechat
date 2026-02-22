using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using Azure;
using Azure.AI.OpenAI;
using Microsoft.Agents.AI;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

// Disambiguate ChatMessage - use Microsoft.Extensions.AI version for the agent
using ChatMessage = Microsoft.Extensions.AI.ChatMessage;

namespace VoiceChat.Backend.Services;

/// <summary>
/// Handles text chat sessions using Microsoft.Agents.AI framework with Azure OpenAI
/// </summary>
public class AzureChatService
{
    private readonly SessionManager _sessionManager;
    private readonly ILogger<AzureChatService> _logger;
    private readonly AIAgent? _agent;

    public AzureChatService(
        IOptions<AzureOpenAISettings> settings,
        SessionManager sessionManager,
        ILogger<AzureChatService> logger,
        ILoggerFactory loggerFactory)
    {
        _sessionManager = sessionManager;
        _logger = logger;

        var config = settings.Value;

        // Initialize the AIAgent once if configured
        if (!string.IsNullOrEmpty(config.Endpoint) && !string.IsNullOrEmpty(config.ApiKey))
        {
            var client = new AzureOpenAIClient(
                new Uri(config.Endpoint),
                new AzureKeyCredential(config.ApiKey));

            var chatClient = client.GetChatClient(config.ChatDeployment);

            _agent = chatClient.AsAIAgent(
                name: "ChatAssistant",
                instructions: "You are a helpful assistant. Respond naturally and concisely.",
                description: "A helpful chat assistant powered by Azure OpenAI",
                loggerFactory: loggerFactory);
        }
    }

    /// <summary>
    /// Handles a text chat session
    /// </summary>
    public async Task HandleTextSession(WebSocket clientWs, string sessionId)
    {
        if (_agent is null)
        {
            await SendMessageAsync(clientWs, new { type = "error", error = "Azure OpenAI is not configured. Check AZURE_ENDPOINT and AZURE_API_KEY environment variables." });
            return;
        }

        // Create a new thread for this conversation session
        var session = await _agent.CreateSessionAsync();
        
        _logger.LogInformation("Text mode session started with AIAgent: {SessionId}", sessionId[..8]);
        await SendMessageAsync(clientWs, new { type = "session.created", session_id = sessionId });

        var buffer = new byte[8 * 1024];

        try
        {
            while (clientWs.State == WebSocketState.Open)
            {
                var message = await ReceiveFullMessageAsync(clientWs, buffer);
                
                if (message is null)
                    break;

                _logger.LogDebug("[{SessionId}] Received: {Message}", sessionId[..8], message);
                await ProcessMessageAsync(clientWs, sessionId, message, session);
            }
        }
        catch (WebSocketException ex) when (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
        {
            _logger.LogInformation("Text session closed prematurely: {SessionId}", sessionId[..8]);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error in text session {SessionId}", sessionId[..8]);
            await SendMessageAsync(clientWs, new { type = "error", error = ex.Message });
        }
    }

    private async Task<string?> ReceiveFullMessageAsync(WebSocket ws, byte[] buffer)
    {
        var messageBuilder = new StringBuilder();
        WebSocketReceiveResult result;

        do
        {
            result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);

            if (result.MessageType == WebSocketMessageType.Close)
                return null;

            if (result.MessageType == WebSocketMessageType.Text)
                messageBuilder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));

        } while (!result.EndOfMessage);

        return messageBuilder.Length > 0 ? messageBuilder.ToString() : null;
    }

    private async Task ProcessMessageAsync(WebSocket clientWs, string sessionId, string messageJson, AgentSession session)
    {
        try
        {
            var request = JsonSerializer.Deserialize<TextMessageRequest>(messageJson, JsonOptions);

            if (!IsValidRequest(request, out var messageText))
            {
                _logger.LogWarning("[{SessionId}] Invalid message type or empty content. Type: {Type}",
                    sessionId[..8], request?.Type ?? "null");
                return;
            }

            _logger.LogInformation("[{SessionId}] User: {Message}", sessionId[..8], Truncate(messageText, 50));
            _sessionManager.UpdateActivity(sessionId);

            // Run the agent with the user's message
            var response = await _agent!.RunAsync(
                messages: [new ChatMessage(ChatRole.User, messageText)],
                session: session);

            var responseText = response.Text ?? string.Empty;

            await SendMessageAsync(clientWs, new { type = "text_response", content = responseText });

            _logger.LogInformation("[{SessionId}] Assistant: {Response}", sessionId[..8], Truncate(responseText, 50));
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Invalid JSON in session {SessionId}", sessionId[..8]);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing message in session {SessionId}", sessionId[..8]);
            await SendMessageAsync(clientWs, new { type = "error", error = ex.Message });
        }
    }

    private static bool IsValidRequest(TextMessageRequest? request, out string messageText)
    {
        messageText = request?.Content ?? request?.Text ?? string.Empty;
        return request?.Type is "text_message" or "text.message" && !string.IsNullOrEmpty(messageText);
    }

    private static string Truncate(string text, int maxLength) =>
        text.Length <= maxLength ? text : text[..maxLength] + "...";

    private static async Task SendMessageAsync(WebSocket ws, object message)
    {
        if (ws.State != WebSocketState.Open)
            return;

        var json = JsonSerializer.Serialize(message);
        var buffer = Encoding.UTF8.GetBytes(json);
        await ws.SendAsync(new ArraySegment<byte>(buffer), WebSocketMessageType.Text, true, CancellationToken.None);
    }

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private sealed class TextMessageRequest
    {
        public string? Type { get; set; }
        public string? Text { get; set; }
        public string? Content { get; set; }
    }
}
