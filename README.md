# 🎤 Real-Time AI Assistant - Dual Mode (Voice + Text)

A production-ready AI assistant with dual-mode support: Voice chat using Azure OpenAI Realtime API and Text chat using Chat Completion API. Features ChatGPT-style interface, secure backend architecture, rate limiting, authentication, and seamless mode switching.

## 🏆 Architecture

**Industry-standard 3-tier architecture** (same as OpenAI, Stripe, Netflix):

```
Browser (Frontend)  →  Your Backend Server  →  Azure OpenAI
  • Microphone            • API Keys 🔒           • GPT Models
  • Voice UI              • Authentication        • Speech-to-Text
  • Audio Playback        • Rate Limiting         • Text-to-Speech
  • NO API Keys ✅        • User Tracking         • AI Processing
```

**Security Features:**
- ✅ API keys hidden on server (never exposed to browser)
- ✅ User authentication & authorization
- ✅ Rate limiting (60 requests/min, 3 concurrent connections)
- ✅ Session management & tracking
- ✅ Cost control & usage monitoring

## 🎯 Features

### 🆕 Dual-Mode Support
- **Voice Mode** - Real-time voice conversation with natural speech interaction
- **Text Mode** - Traditional text chat with instant responses
- **Seamless Toggle** - Switch between modes with one click
- **Smart API Selection** - Automatically uses the right API for each mode

### Core Features
- **Beautiful UI** - ChatGPT-style interface with animated green orb (voice) and modern chat interface (text)
- **Interruption Support** - Can interrupt AI mid-response in voice mode
- **Low Latency** - WebSocket-based communication for both modes
- **Production Ready** - Enterprise-grade security & scalability
- **Rate Limiting** - Prevent abuse and control costs
- **Session Tracking** - Monitor usage per user
- **Cost Optimization** - Uses cheaper API for text chat

## 📁 Project Structure

```
Realtime-voice-Bot/
├── frontend/
│   ├── server.py             # Frontend HTTP server (port 8000)
│   ├── index.html            # Main UI
│   ├── styles.css            # ChatGPT-style animations
│   ├── script.js             # Voice bot logic
│   ├── config.js             # Backend URL (NO API keys)
│   └── audio-processor.js    # Audio capture worklet
│
├── backend/
│   ├── server.py             # Backend WebSocket server (port 8001)
│   ├── .env                  # Secrets (API keys) - NEVER commit!
│   └── requirements.txt      # Python dependencies
│
├── README.md                 # This file
├── QUICK_START.md            # 3-minute setup guide
└── ARCHITECTURE.md           # Technical details
```

## 🚀 Quick Start (2 Steps)

### Prerequisites
- Python 3.8+
- Azure OpenAI account with gpt-realtime deployment
- Microphone access

### Step 1: Install Dependencies

```bash
# Navigate to backend folder
cd backend

# Install Python packages
pip install -r requirements.txt
```

### Step 2: Configure Environment

Create `backend/.env` file with your Azure credentials:
```env
# Required: Azure OpenAI credentials
AZURE_ENDPOINT=https://your-resource.openai.azure.com
AZURE_API_KEY=your-secret-api-key

# Voice Mode deployment (Realtime API)
AZURE_REALTIME_DEPLOYMENT=gpt-realtime

# Text Mode deployment (Chat Completion API)
AZURE_CHAT_DEPLOYMENT=gpt-4o

# API Versions (optional)
API_VERSION_REALTIME=2024-10-01-preview
API_VERSION_CHAT=2024-02-15-preview
```

⚠️ **IMPORTANT:** Never commit `.env` file to Git!
📝 **See** `backend/CONFIG.md` for detailed configuration guide

## 🎬 Running the Application

**Terminal 1: Backend Server**
```bash
cd backend
python server.py
```

**Terminal 2: Frontend Server**
```bash
cd frontend
python server.py
```

✅ Browser will open automatically at http://localhost:8000

## 🧪 Testing

### 1. Test Mode Toggle
- Use toggle switch at top center to switch between Text and Voice modes
- UI should smoothly transition between chat interface and voice orb
- Both modes should work independently

### 2. Test Voice Mode
- Toggle to **Voice** mode
- Click microphone button
- Grant microphone permission
- Start speaking
- AI should respond with voice audio
- Try interrupting AI mid-response (should work!)

### 3. Test Text Mode
- Toggle to **Text** mode
- Type a message in the input box
- Press Send or hit Enter
- AI should respond with text
- Check that messages appear in chat history

### 4. Verify Security (IMPORTANT!)
**Open Browser DevTools (F12):**
1. Go to Network tab → WS filter
2. Click on WebSocket connection
3. ✅ URL should be `ws://localhost:8001?mode=voice` or `mode=text` (NOT Azure)
4. ✅ Messages should NOT contain API keys

**This proves your API keys are hidden!** 🔒

### 5. Test Rate Limiting
- Open 3 browser tabs → all connect ✅
- Open 4th tab → rejected with "Rate limit exceeded" ✅

### 6. Verify API Usage
- Check backend logs in terminal
- Voice mode should show "Connected to Azure Realtime API"
- Text mode should show "Text mode activated"
- Confirms correct API is being used for each mode ✅

## 🔒 Security Features

### Before (Insecure Demo)
```javascript
// API key in browser - ANYONE can steal! ❌
const apiKey = "EbHq...SECRET...";
ws = new WebSocket(`wss://azure...?api-key=${apiKey}`);
```

### After (Production Ready)
```javascript
// No API keys in browser ✅
ws = new WebSocket('ws://localhost:8001');
// Backend handles authentication & Azure connection
```

**Security Checklist:**
- [✅] API keys stored in backend/.env (gitignored)
- [✅] API keys NEVER sent to browser
- [✅] User authentication framework ready
- [✅] Rate limiting enabled (60 req/min per user)
- [✅] Max 3 concurrent connections per user
- [✅] All sessions logged with user ID
- [✅] Cost control via rate limits

## ⚙️ Configuration

### Backend Settings (`backend/.env`)

```env
# Azure OpenAI Configuration
AZURE_ENDPOINT=https://your-resource.openai.azure.com
AZURE_API_KEY=your-secret-key

# Voice Mode: Realtime API deployment
AZURE_REALTIME_DEPLOYMENT=gpt-realtime

# Text Mode: Chat Completion API deployment
# Options: gpt-4o (recommended), gpt-4, gpt-35-turbo
AZURE_CHAT_DEPLOYMENT=gpt-4o

# API Versions
API_VERSION_REALTIME=2024-10-01-preview
API_VERSION_CHAT=2024-02-15-preview

# Server Configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=8001

# Rate Limiting
MAX_CONNECTIONS_PER_USER=3
MAX_REQUESTS_PER_MINUTE=60
```

📝 **For detailed configuration guide, see `backend/CONFIG.md`**

### Frontend Settings (`frontend/config.js`)

```javascript
window.SERVER_CONFIG = {
    websocketUrl: 'ws://localhost:8001',
    authToken: null  // Optional: add user auth token
};
```

## 🔄 Dual-Mode Architecture

### How It Works

The application automatically routes to the appropriate Azure API based on the selected mode:

```
┌─────────────────────────────────────────────┐
│  Frontend - Mode Toggle                     │
│  [Text Mode] ←→ [Voice Mode]               │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  TEXT MODE    │       │  VOICE MODE   │
│  ?mode=text   │       │  ?mode=voice  │
└───────────────┘       └───────────────┘
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  Backend      │       │  Backend      │
│  REST API     │       │  WebSocket    │
│  Handler      │       │  Proxy        │
└───────────────┘       └───────────────┘
        │                       │
        ▼                       ▼
┌───────────────┐       ┌───────────────┐
│  Azure Chat   │       │  Azure        │
│  Completion   │       │  Realtime     │
│  API          │       │  API          │
│  (gpt-4o)     │       │  (gpt-real)   │
└───────────────┘       └───────────────┘
```

### Cost Comparison

| Mode | API Used | Input Cost | Output Cost | Use Case |
|------|----------|------------|-------------|----------|
| **Voice** | Realtime API | $$$$ | $$$$ | Real-time voice conversation |
| **Text** | Chat Completion | $$ | $$ | Text-based queries |

**💡 Tip:** Use Text mode for quick questions to save costs. Use Voice mode when you need hands-free or voice interaction.

### API Endpoints Used

**Voice Mode:**
```
wss://[endpoint]/openai/realtime
→ Realtime API (WebSocket)
→ Bidirectional audio streaming
→ Voice Activity Detection (VAD)
→ Speech-to-Text + GPT + Text-to-Speech (all integrated)
```

**Text Mode:**
```
https://[endpoint]/openai/deployments/[model]/chat/completions
→ Chat Completion API (REST)
→ Standard JSON request/response
→ Text input → Text output
→ Lower latency for text-only interactions
```

## 🔐 Adding Authentication

### Option 1: JWT Tokens
```javascript
// frontend/config.js
window.SERVER_CONFIG = {
    websocketUrl: 'ws://localhost:8001',
    authToken: localStorage.getItem('jwt_token')
};
```

### Option 2: Update Backend
```python
# backend/secure_server.py
def authenticate_user(headers):
    auth_header = headers.get('Authorization', '')
    # Add your authentication logic here
    # - Validate JWT token
    # - Check database
    # - Verify permissions
    return user_id
```

## 📊 Monitoring & Logging

Backend automatically logs:
- ✅ User connections (session ID, user ID)
- ✅ Message count per session
- ✅ Rate limit violations
- ✅ Connection errors
- ✅ Session duration

View logs in terminal where `secure_server.py` is running.

## 🚀 Production Deployment

### 1. Environment Variables
Move secrets to environment:
```bash
export AZURE_API_KEY="your-secret-key"
export AZURE_ENDPOINT="https://..."
```

### 2. Use HTTPS/WSS
Update frontend config:
```javascript
websocketUrl: 'wss://your-domain.com'  // Secure WebSocket
```

### 3. Docker Deployment
```bash
# Build image
docker build -t voice-bot-backend backend/

# Run container
docker run -p 8001:8001 --env-file backend/.env voice-bot-backend
```

### 4. Cloud Deployment
Deploy to:
- AWS EC2 / ECS / Lambda
- Azure App Service / Container Instances
- Google Cloud Run / Compute Engine
- Heroku, DigitalOcean, etc.

## 🛠️ Troubleshooting

### Backend won't start
**Error:** `Missing Azure configuration`  
**Fix:** Check `backend/.env` file exists and has all required variables

### Frontend can't connect
**Error:** `WebSocket connection failed`  
**Fix:** Ensure backend is running on port 8001
```bash
curl http://localhost:8001
```

### Audio not working
**Error:** `getUserMedia failed`  
**Fix:** 
- Use HTTPS or localhost (required for microphone)
- Grant microphone permission
- Check microphone not used by another app

### Port already in use
**Error:** `Address already in use`  
**Fix:** Kill process using the port
```bash
# Windows
netstat -ano | findstr :8001
taskkill /PID <pid> /F

# Linux/Mac
lsof -ti:8001 | xargs kill -9
```

## 📚 API Reference

### WebSocket Messages (Browser → Backend → Azure)

**Session Configuration:**
```json
{
  "type": "session.update",
  "session": {
    "modalities": ["audio", "text"],
    "instructions": "You are a helpful assistant",
    "voice": "alloy"
  }
}
```

**Audio Input:**
```javascript
ws.send(audioBuffer);  // Binary PCM16 audio data
```

**Cancel Response:**
```json
{
  "type": "response.cancel"
}
```

### Server Events (Azure → Backend → Browser)

**Session Created:**
```json
{
  "type": "session.created",
  "session": { ... }
}
```

**Audio Response:**
```javascript
// Binary audio data (PCM16 format)
```

**Transcript:**
```json
{
  "type": "conversation.item.created",
  "item": {
    "type": "message",
    "role": "assistant",
    "content": [...]
  }
}
```

## 🎓 Architecture Details

See [ARCHITECTURE.md](ARCHITECTURE.md) for:
- Detailed security flow
- Real-world comparisons (ChatGPT, Stripe, etc.)
- Enterprise deployment guide
- Scaling strategies
- Complete API documentation

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Azure OpenAI Realtime API
- Web Audio API
- WebSocket Protocol
- ChatGPT voice mode design inspiration

## 📞 Support

For issues or questions:
1. Check [ARCHITECTURE.md](ARCHITECTURE.md) for detailed docs
2. Review troubleshooting section above
3. Check backend logs for errors
4. Verify Azure OpenAI service status

---

**Built with ❤️ using industry-standard production architecture**

**Same security patterns as:** OpenAI ChatGPT • Stripe Payments • Google Meet • Netflix
