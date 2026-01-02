using System.Collections.Concurrent;

namespace VoiceChat.Backend.Services;

/// <summary>
/// Manages user sessions for voice and text chat
/// </summary>
public class SessionManager
{
    private readonly ConcurrentDictionary<string, SessionInfo> _sessions = new();
    private readonly ILogger<SessionManager> _logger;

    public SessionManager(ILogger<SessionManager> logger)
    {
        _logger = logger;
        
        // Start periodic cleanup
        _ = Task.Run(async () =>
        {
            while (true)
            {
                await Task.Delay(TimeSpan.FromMinutes(5));
                CleanupStaleSessions();
            }
        });
    }

    /// <summary>
    /// Creates a new session for a user
    /// </summary>
    public string CreateSession(string userId, string mode)
    {
        var sessionId = Guid.NewGuid().ToString("N");
        var session = new SessionInfo
        {
            SessionId = sessionId,
            UserId = userId,
            Mode = mode,
            CreatedAt = DateTime.UtcNow,
            LastActivity = DateTime.UtcNow
        };

        _sessions[sessionId] = session;
        _logger.LogInformation("Session created: {SessionId} for user {UserId}, mode: {Mode}",
            sessionId[..8], userId, mode);

        return sessionId;
    }

    /// <summary>
    /// Gets session information
    /// </summary>
    public SessionInfo? GetSession(string sessionId)
    {
        return _sessions.TryGetValue(sessionId, out var session) ? session : null;
    }

    /// <summary>
    /// Updates session activity timestamp
    /// </summary>
    public void UpdateActivity(string sessionId)
    {
        if (_sessions.TryGetValue(sessionId, out var session))
        {
            session.LastActivity = DateTime.UtcNow;
            session.MessageCount++;
        }
    }

    /// <summary>
    /// Cleans up a specific session
    /// </summary>
    public void CleanupSession(string sessionId)
    {
        if (_sessions.TryRemove(sessionId, out var session))
        {
            _logger.LogInformation("Session cleaned up: {SessionId}, messages: {MessageCount}",
                sessionId[..8], session.MessageCount);
        }
    }

    /// <summary>
    /// Removes stale sessions (inactive for more than 30 minutes)
    /// </summary>
    private void CleanupStaleSessions()
    {
        var staleThreshold = DateTime.UtcNow.AddMinutes(-30);
        var staleSessionIds = _sessions
            .Where(kvp => kvp.Value.LastActivity < staleThreshold)
            .Select(kvp => kvp.Key)
            .ToList();

        foreach (var sessionId in staleSessionIds)
        {
            if (_sessions.TryRemove(sessionId, out _))
            {
                _logger.LogInformation("Stale session removed: {SessionId}", sessionId[..8]);
            }
        }

        if (staleSessionIds.Count > 0)
        {
            _logger.LogInformation("Cleaned up {Count} stale sessions", staleSessionIds.Count);
        }
    }

    /// <summary>
    /// Gets active session count
    /// </summary>
    public int ActiveSessionCount => _sessions.Count;
}

/// <summary>
/// Session information
/// </summary>
public class SessionInfo
{
    public required string SessionId { get; init; }
    public required string UserId { get; init; }
    public required string Mode { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime LastActivity { get; set; }
    public int MessageCount { get; set; }
}
