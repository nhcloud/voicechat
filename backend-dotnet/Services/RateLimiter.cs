using System.Collections.Concurrent;

namespace VoiceChat.Backend.Services;

/// <summary>
/// Rate limiter to prevent abuse and control costs
/// </summary>
public class RateLimiter
{
    private readonly ConcurrentDictionary<string, UserRateInfo> _userRates = new();
    private readonly ILogger<RateLimiter> _logger;
    
    // Configuration
    private const int MaxConnectionsPerUser = 3;
    private const int MaxRequestsPerMinute = 60;
    private const int RateLimitWindowSeconds = 60;

    public RateLimiter(ILogger<RateLimiter> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Checks if user is within rate limits
    /// </summary>
    public (bool Allowed, string Reason) CheckRateLimit(string userId)
    {
        var now = DateTime.UtcNow;
        var rateInfo = _userRates.GetOrAdd(userId, _ => new UserRateInfo());

        lock (rateInfo)
        {
            // Clean up old request timestamps
            var windowStart = now.AddSeconds(-RateLimitWindowSeconds);
            rateInfo.RequestTimestamps.RemoveAll(t => t < windowStart);

            // Check concurrent connections
            if (rateInfo.ActiveConnections >= MaxConnectionsPerUser)
            {
                _logger.LogWarning("User {UserId} exceeded max connections ({Max})", userId, MaxConnectionsPerUser);
                return (false, $"Maximum concurrent connections ({MaxConnectionsPerUser}) exceeded");
            }

            // Check request rate
            if (rateInfo.RequestTimestamps.Count >= MaxRequestsPerMinute)
            {
                _logger.LogWarning("User {UserId} exceeded rate limit ({Max}/min)", userId, MaxRequestsPerMinute);
                return (false, $"Rate limit exceeded ({MaxRequestsPerMinute} requests/minute)");
            }

            // Allow request
            rateInfo.ActiveConnections++;
            rateInfo.RequestTimestamps.Add(now);
            
            return (true, string.Empty);
        }
    }

    /// <summary>
    /// Records a request for rate limiting
    /// </summary>
    public void RecordRequest(string userId)
    {
        if (_userRates.TryGetValue(userId, out var rateInfo))
        {
            lock (rateInfo)
            {
                rateInfo.RequestTimestamps.Add(DateTime.UtcNow);
            }
        }
    }

    /// <summary>
    /// Releases a connection when user disconnects
    /// </summary>
    public void ReleaseConnection(string userId)
    {
        if (_userRates.TryGetValue(userId, out var rateInfo))
        {
            lock (rateInfo)
            {
                rateInfo.ActiveConnections = Math.Max(0, rateInfo.ActiveConnections - 1);
            }
        }
    }

    /// <summary>
    /// Gets current rate info for a user
    /// </summary>
    public (int ActiveConnections, int RequestsInWindow) GetUserRateInfo(string userId)
    {
        if (_userRates.TryGetValue(userId, out var rateInfo))
        {
            lock (rateInfo)
            {
                var windowStart = DateTime.UtcNow.AddSeconds(-RateLimitWindowSeconds);
                var requestsInWindow = rateInfo.RequestTimestamps.Count(t => t >= windowStart);
                return (rateInfo.ActiveConnections, requestsInWindow);
            }
        }
        return (0, 0);
    }

    private class UserRateInfo
    {
        public int ActiveConnections { get; set; }
        public List<DateTime> RequestTimestamps { get; } = new();
    }
}
