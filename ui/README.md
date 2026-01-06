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
├── package.json        # Node.js package file
└── README.md           # This file
```

## How It Works

### Static File Server

The Node.js server (`server.js`) serves static files with:

- **CORS headers** - Allow cross-origin requests
- **Audio worklet headers** - Required for microphone access:
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Opener-Policy: same-origin`

### WebSocket Connection

The frontend connects to the backend via WebSocket with a mode parameter:

```javascript
// config.js
const SERVER_CONFIG = {
    websocketUrl: 'ws://localhost:8001'
};

// script.js - Voice mode
const voiceWs = new WebSocket(SERVER_CONFIG.websocketUrl + '?mode=voice');

// script.js - Text mode
const textWs = new WebSocket(SERVER_CONFIG.websocketUrl + '?mode=text');
```

### Voice Mode

1. **Microphone capture** - Uses Web Audio API with `AudioWorklet`
2. **Audio encoding** - PCM16 mono at 24kHz (Azure Realtime API format)
3. **WebSocket streaming** - Sends audio chunks to backend
4. **AI response playback** - Receives and plays audio responses

### Text Mode

1. **User input** - Text input field
2. **WebSocket messaging** - Sends JSON messages to backend
3. **Streaming response** - Displays AI text responses in real-time
4. **Conversation memory** - Backend maintains context via `AgentThread`

## Dual-Mode Architecture

The frontend supports seamless switching between voice and text modes:

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (UI)                       │
├─────────────────────────────────────────────────────────┤
│  Voice Mode                    │  Text Mode             │
│  - Microphone capture          │  - Text input          │
│  - Audio playback              │  - Streaming text      │
│  - Animated voice orb          │  - Chat history        │
├─────────────────────────────────────────────────────────┤
│             WebSocket: ws://localhost:8001              │
│        ?mode=voice    │    ?mode=text                   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│               Backend (Python or .NET)                  │
├─────────────────────────────────────────────────────────┤
│  Voice Handler                 │  Text Handler          │
│  - Azure Realtime API proxy    │  - Agent Framework     │
│  - Bidirectional audio         │  - AgentThread memory  │
└─────────────────────────────────────────────────────────┘
```

## Configuration

Edit `config.js` to change the backend URL:

```javascript
const SERVER_CONFIG = {
    websocketUrl: 'ws://localhost:8001',  // Backend WebSocket URL
    sampleRate: 24000,                    // Audio sample rate
    voiceId: 'alloy'                      // Azure voice ID
};
```

## Features

- 🎤 **Voice Mode** - Real-time speech-to-speech conversation
- 💬 **Text Mode** - Traditional text chat with streaming and memory
- 🌙 **Dark Theme** - ChatGPT-style interface
- 📱 **Responsive** - Works on desktop and mobile
- ⚡ **Barge-in** - Interrupt AI mid-response by speaking
- 🔄 **Mode Toggle** - Switch between voice and text with one click

## Browser Support

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome/Edge | 90+ | Recommended |
| Firefox | 90+ | Full support |
| Safari | 15+ | Full support |

> **Note:** Microphone access requires HTTPS in production, but works on `localhost` for development.

## File Details

### index.html
Main HTML page with:
- Mode toggle buttons (Voice/Text)
- Chat message container
- Voice mode animated orb
- Text input field

### styles.css
ChatGPT-inspired dark theme:
- Dark background (#1e1e1e)
- Animated voice orb with gradients
- Responsive layout
- Chat bubble styling

### script.js
Core application logic:
- WebSocket connection management
- Voice mode: microphone capture, audio playback
- Text mode: message sending, streaming display
- Mode switching logic

### config.js
Configuration settings:
- Backend WebSocket URL
- Audio settings (sample rate, voice ID)
- Feature flags

### audio-processor.js
Audio worklet for microphone capture:
- Converts float32 audio to PCM16
- Handles audio buffering
- Processes audio in real-time

### server.js
Node.js HTTP server:
- Serves static files
- Sets CORS headers
- Sets audio worklet security headers
- Opens browser automatically

## Troubleshooting

### Microphone not working

1. Check browser permissions for microphone access
2. Ensure you're on `localhost` or HTTPS
3. Check browser console for errors

### WebSocket connection failed

1. Ensure backend is running on port 8001
2. Check `config.js` has correct WebSocket URL
3. Check browser console for connection errors

### Audio playback issues

1. Check browser supports Web Audio API
2. Ensure audio context is not suspended (click to interact first)
3. Check browser console for audio errors

## Development

To modify the frontend:

1. Edit the files directly (no build step required)
2. Refresh the browser to see changes
3. Use browser DevTools for debugging

### Adding Custom Styles

Edit `styles.css` to customize the appearance.

### Changing WebSocket Behavior

Edit `script.js` to modify WebSocket message handling.

### Adding New Features

1. Add UI elements in `index.html`
2. Add styles in `styles.css`
3. Add logic in `script.js`
