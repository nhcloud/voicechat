namespace VoiceChat.Backend.Services;

/// <summary>
/// Azure OpenAI configuration settings loaded from environment variables
/// </summary>
public class AzureOpenAISettings
{
    /// <summary>
    /// Azure OpenAI endpoint URL (AZURE_ENDPOINT)
    /// </summary>
    public string Endpoint { get; set; } = string.Empty;

    /// <summary>
    /// Azure OpenAI API key (AZURE_API_KEY)
    /// </summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>
    /// Deployment name for Realtime API - voice mode (AZURE_REALTIME_DEPLOYMENT)
    /// </summary>
    public string RealtimeDeployment { get; set; } = "gpt-realtime";

    /// <summary>
    /// Deployment name for Chat Completion API - text mode (AZURE_CHAT_DEPLOYMENT)
    /// </summary>
    public string ChatDeployment { get; set; } = "gpt-4o";

    /// <summary>
    /// API version for Realtime API (API_VERSION_REALTIME)
    /// </summary>
    public string RealtimeApiVersion { get; set; } = "2025-04-01-preview";

    /// <summary>
    /// API version for Chat Completion API (API_VERSION_CHAT)
    /// </summary>
    public string ChatApiVersion { get; set; } = "2025-04-01-preview";

}
