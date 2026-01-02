// Voice Chat - Configuration
// Shared UI for both Python and .NET backends
// Both backends run on port 8001 - only run one at a time
window.SERVER_CONFIG = {
    // WebSocket URL for backend server (Python or .NET, both on port 8001)
    websocketUrl: 'ws://localhost:8001',
    
    // Optional: Authentication token
    // In production, get this from your login system
    authToken: null,
    
    // Audio settings
    audio: {
        sampleRate: 24000,
        channels: 1,
        bufferSize: 2400  // 100ms at 24kHz
    }
};
