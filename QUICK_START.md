# 🚀 Quick Start - Dual-Mode AI Assistant

## ⚡ 3-Minute Setup

### Step 1: Configure Backend (1 min)

Create `backend/.env` file:

```env
AZURE_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com
AZURE_API_KEY=YOUR-API-KEY-HERE
AZURE_REALTIME_DEPLOYMENT=gpt-realtime
AZURE_CHAT_DEPLOYMENT=gpt-4o
```

**Replace:**
- `YOUR-RESOURCE` → Your Azure OpenAI resource name
- `YOUR-API-KEY-HERE` → Your API key from Azure Portal

### Step 2: Install Dependencies (1 min)

```bash
cd backend
pip install -r requirements.txt
```

### Step 3: Start Servers (30 seconds)

**Terminal 1: Backend**
```bash
cd backend
python server.py
```

**Terminal 2: Frontend**
```bash
cd frontend
python server.py
```

✅ Browser opens automatically at `http://localhost:8000`

---

## 🎮 How to Use

### Text Mode (Left Toggle Position)
1. Click toggle to **TEXT** (left)
2. Type message in input box
3. Press Enter or click Send button
4. AI responds with text

**Use when:** Quick questions, want to see history, copy/paste answers

### Voice Mode (Right Toggle Position)
1. Click toggle to **VOICE** (right)
2. Click microphone button
3. Speak your question
4. AI responds with voice

**Use when:** Hands-free, driving, natural conversation

---

## 🔍 Verify It's Working

### Check Backend Terminal:
```
✓ Server ready for connections
📡 Accepting both Voice and Text mode connections
```

### Check Browser:
- Toggle switch visible at top center
- Default: Voice mode (green orb visible)
- Switch to Text: Chat interface appears

### Test:
1. **Text mode:** Type "Hello" → Should get text response
2. **Voice mode:** Click mic → Say "Hello" → Should get voice response

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend won't start | Check `.env` file exists in `backend/` folder |
| "Missing Azure configuration" | Verify all 4 variables in `.env` |
| Connection failed | Check `AZURE_ENDPOINT` format (https://...) |
| No voice response | Check `AZURE_REALTIME_DEPLOYMENT` name matches Azure Portal |
| No text response | Check `AZURE_CHAT_DEPLOYMENT` name matches Azure Portal |
| Port 8001 in use | Kill process: `netstat -ano | findstr :8001` then `taskkill /PID <pid> /F` |

---

## 📖 More Information

- **Full Setup Guide:** `README.md`
- **Configuration Details:** `backend/CONFIG.md`
- **Testing Procedures:** `TESTING_GUIDE.md`
- **Demo Script:** `DEMO_SCRIPT.md`
- **Implementation Details:** `IMPLEMENTATION_SUMMARY.md`

---

## ✨ Key Features

- 🔀 **Toggle Switch:** Instant mode switching
- 💬 **Text Chat:** Modern interface with message bubbles
- 🎤 **Voice Chat:** Real-time audio with interruption support
- 🔒 **Secure:** API keys on backend only
- 💰 **Cost-Optimized:** Right API for each mode
- 🎨 **Professional:** ChatGPT-inspired green theme

---

## 📊 What's Under the Hood

```
TEXT MODE:                  VOICE MODE:
[Chat Interface]            [Animated Orb]
       ↓                           ↓
WebSocket (?mode=text)      WebSocket (?mode=voice)
       ↓                           ↓
Your Backend                Your Backend
       ↓                           ↓
Azure Chat API              Azure Realtime API
(gpt-4o)                    (gpt-realtime)
[$$ cheaper]                [$$$ premium]
```

---

## 🎯 Success Checklist

Before demo, verify:
- ✅ Backend running without errors
- ✅ Frontend opens at localhost:8000
- ✅ Toggle switch visible and working
- ✅ Text mode: Can send/receive messages
- ✅ Voice mode: Mic works, AI responds with voice
- ✅ No console errors in browser (F12)

---

## 🆘 Get Help

1. Check error in backend terminal
2. Check browser console (F12)
3. Review `backend/CONFIG.md` for configuration
4. Review `TESTING_GUIDE.md` for test procedures
5. Check Azure Portal:
   - Verify resource exists
   - Verify deployments exist
   - Check API keys are valid

---

**Ready to demo! 🎉**

