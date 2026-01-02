# Voice Chat Frontend (UI)

A shared frontend for the Voice Chat application, serving HTML/CSS/JavaScript files.

> For general project information, see the [main README](../README.md).

## Prerequisites

- [Node.js 14+](https://nodejs.org/)
- A running backend (Python or .NET) on port 8001

## Quick Start

```bash
node server.js
# or
npm start
```

The frontend will start on **http://localhost:8000** and open automatically in your browser.

## Project Structure

```
ui/
├── index.html          # Main HTML page
├── styles.css          # ChatGPT-style dark theme
├── script.js           # Voice/text chat logic
├── config.js           # WebSocket URL configuration
├── audio-processor.js  # Audio worklet for microphone capture
├── server.js           # Node.js HTTP server
└── package.json        # Node.js package file
```

## How It Works

### Static File Server

The Node.js server (`server.js`) serves static files with:

- **CORS headers** - Allow cross-origin requests
- **Audio worklet headers** - Required for microphone access:
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Opener-Policy: same-origin`

### WebSocket Connection

The frontend connects to the backend via WebSocket:

```javascript
// config.js
const SERVER_CONFIG = {
    websocketUrl: 'ws://localhost:8001'
};

// script.js
const ws = new WebSocket(SERVER_CONFIG.websocketUrl + '?mode=voice');
```

### Voice Mode

1. **Microphone capture** - Uses Web Audio API with `AudioWorklet`
2. **Audio encoding** - PCM16 mono at 24kHz (Azure Realtime API format)
3. **WebSocket streaming** - Sends audio chunks to backend
4. **AI response playback** - Receives and plays audio responses

### Text Mode

1. **User input** - Text input field
2. **WebSocket messaging** - Sends JSON messages
3. **Streaming response** - Displays AI text responses in real-time

## Configuration

Edit `config.js` to change the backend URL:

```javascript
const SERVER_CONFIG = {
    websocketUrl: 'ws://localhost:8001',  // Change for different backend
    sampleRate: 24000,
    voiceId: 'alloy'
};
```

## Features

- 🎤 **Voice Mode** - Real-time speech-to-speech conversation
- 💬 **Text Mode** - Traditional text chat with streaming
- 🌙 **Dark Theme** - ChatGPT-style interface
- 📱 **Responsive** - Works on desktop and mobile
- ⚡ **Barge-in** - Interrupt AI mid-response by speaking

## Browser Support

- Chrome/Edge 90+ (recommended)
- Firefox 90+
- Safari 15+

> **Note:** Microphone access requires HTTPS in production, but works on `localhost` for development.

## No Dependencies

The server uses only Node.js built-in modules - no `npm install` required!
