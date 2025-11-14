// Voice Bot - Dual Mode (Voice + Text Chat)
// Production Architecture (Browser → Backend → Azure)

// UI Elements
const modeToggle = document.getElementById('modeToggle');
const voiceContainer = document.getElementById('voiceContainer');
const textContainer = document.getElementById('textContainer');
const voiceControls = document.getElementById('voiceControls');
const infoText = document.getElementById('infoText');

const micBtn = document.getElementById('micBtn');
const closeBtn = document.getElementById('closeBtn');
const mainOrb = document.querySelector('.main-orb');
const glowRings = document.querySelectorAll('.glow-ring');
const statusText = document.querySelector('.status-text');
const settingsIcon = document.querySelector('.settings-icon');

// Text Chat Elements
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatStatus = document.getElementById('chatStatus');

// Mode Labels
const modeLabels = document.querySelectorAll('.mode-label');

// State Variables
let currentMode = 'voice'; // 'voice' or 'text'
let isListening = false;
let isConnected = false;
let ws = null;

// Voice Mode Variables
let audioContext = null;
let mediaStream = null;
let audioWorkletNode = null;
let audioChunks = [];
let isProcessingAudio = false;
let nextPlayTime = 0;
let currentAudioSource = null;
let scheduledSources = [];
let activeResponseId = null;
let completedResponses = new Set();
let responseTranscripts = new Map();
let cancelledResponses = new Set();
let isCancelling = false;
let lastBargeInTime = 0;
let bargeInCooldownMs = 1200;

// Text Mode Variables
let conversationHistory = [];
let isWaitingForResponse = false;

console.log('🎤 Dual-Mode Voice Bot Initialized');
console.log('🔒 Secure: Connecting through backend server');

// Initialize
updateModeUI();

// ============================================
// MODE TOGGLE
// ============================================

modeToggle.addEventListener('change', () => {
    const isVoiceMode = modeToggle.checked;
    currentMode = isVoiceMode ? 'voice' : 'text';
    
    console.log(`🔄 Switching to ${currentMode} mode`);
    
    // Update UI
    updateModeUI();
    
    // Disconnect if connected
    if (isConnected) {
        disconnectSession();
    }
    
    // Clear text chat if switching from text to voice
    if (isVoiceMode) {
        conversationHistory = [];
        const welcomeMsg = chatMessages.querySelector('.welcome-message');
        if (welcomeMsg) {
            chatMessages.innerHTML = '';
            chatMessages.appendChild(welcomeMsg);
        }
    }
});

function updateModeUI() {
    if (currentMode === 'voice') {
        // Show voice UI
        voiceContainer.style.display = 'flex';
        textContainer.style.display = 'none';
        voiceControls.style.display = 'flex';
        infoText.style.display = 'block';
        
        // Update labels
        modeLabels[0].classList.remove('active');
        modeLabels[1].classList.add('active');
        
        updateStatus('Click microphone to start');
    } else {
        // Show text UI
        voiceContainer.style.display = 'none';
        textContainer.style.display = 'flex';
        voiceControls.style.display = 'none';
        infoText.style.display = 'none';
        
        // Update labels
        modeLabels[0].classList.add('active');
        modeLabels[1].classList.remove('active');
        
        updateChatStatus('Ready');
        chatInput.focus();
    }
}

// ============================================
// VOICE MODE FUNCTIONS
// ============================================

async function connectToAzure() {
    try {
        updateStatus('Connecting...');
        console.log('🔗 Connecting to backend server (Voice Mode)...');
        
        let wsUrl = SERVER_CONFIG.websocketUrl;
        
        // Add mode parameter
        wsUrl += '?mode=voice';
        
        if (SERVER_CONFIG.authToken) {
            wsUrl += `&token=${encodeURIComponent(SERVER_CONFIG.authToken)}`;
            console.log('🔐 Using authentication token');
        }
        
        console.log('WebSocket URL:', wsUrl);
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ Connected to Voice Mode!');
            isConnected = true;
            updateStatus('Connected - Ready');
            sendSessionUpdate();
        };
        
        ws.onmessage = (event) => handleVoiceMessage(event.data);
        
        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            updateStatus('Connection error');
        };
        
        ws.onclose = (event) => {
            console.log('🔌 Disconnected', event.code, event.reason);
            isConnected = false;
            updateStatus('Disconnected');
            if (isListening) stopListening();
        };
    } catch (error) {
        console.error('❌ Connection failed:', error);
        updateStatus('Failed: ' + error.message);
    }
}

function sendSessionUpdate() {
    ws.send(JSON.stringify({
        type: 'session.update',
        session: {
            instructions: 'You are a helpful voice assistant. Respond naturally and concisely.',
            modalities: ['audio', 'text'],
            turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500
            },
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: { model: 'whisper-1' },
            voice: 'alloy'
        }
    }));
}

function handleVoiceMessage(data) {
    try {
        const event = JSON.parse(data);
        
        switch (event.type) {
            case 'session.created':
                console.log('✅ Session created');
                break;
                
            case 'input_audio_buffer.speech_started':
                const nowTs = Date.now();
                if (nowTs - lastBargeInTime < bargeInCooldownMs) {
                    console.log('🛑 Ignoring speech_started (within cooldown)');
                    break;
                }
                const aiSpeaking = scheduledSources.length > 0 || currentAudioSource;
                if (aiSpeaking || (activeResponseId && !isCancelling)) {
                    console.log('⚡ INTERRUPTION DETECTED - Cancelling AI response');
                    interruptForUserSpeech();
                    lastBargeInTime = nowTs;
                } else {
                    console.log('🎤 Speech detected');
                }
                break;
                
            case 'input_audio_buffer.speech_stopped':
                console.log('⏸️ Speech ended');
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                if (event.transcript) console.log('👤 You:', event.transcript);
                break;
                
            case 'response.created':
                updateStatus('AI thinking...');
                console.log('🤖 AI response started');
                audioChunks = [];
                isCancelling = false;
                activeResponseId = event.response?.id || event.response_id;
                stopAllScheduledAudio();
                break;
                
            case 'response.audio_transcript.delta':
                if (event.delta) console.log('💬', event.delta);
                break;
                
            case 'response.audio.delta':
                const audioData = event.delta;
                if (audioData) {
                    if (isCancelling) {
                        console.log('⚠️ Ignoring audio delta during cancellation');
                        break;
                    }
                    audioChunks.push(audioData);
                    processAudioBuffer();
                }
                break;
                
            case 'response.audio.done':
                console.log('🏁 Audio complete');
                processAudioBuffer(true);
                break;
                
            case 'response.done':
                const doneResponseId = event.response?.id || event.response_id;
                if (doneResponseId) {
                    completedResponses.add(doneResponseId);
                    if (activeResponseId === doneResponseId) {
                        activeResponseId = null;
                    }
                }
                console.log('✅ Response complete');
                updateStatus(isListening ? 'Listening...' : 'Ready');
                processAudioBuffer(true);
                break;
                
            case 'error':
                console.error('❌ Error:', event.error);
                break;
        }
    } catch (error) {
        console.error('❌ Parse error:', error);
    }
}

// Microphone button
micBtn.addEventListener('click', async () => {
    if (!isConnected) {
        await connectToAzure();
        return;
    }
    
    isListening = !isListening;
    if (isListening) await startListening();
    else stopListening();
});

async function startListening() {
    micBtn.classList.add('active');
    mainOrb.classList.add('active');
    glowRings.forEach(r => r.classList.add('active'));
    statusText.classList.add('active');
    updateStatus('Listening...');
    
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true }
        });
        
        await audioContext.audioWorklet.addModule('audio-processor.js');
        const source = audioContext.createMediaStreamSource(mediaStream);
        audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-processor');
        
        audioWorkletNode.port.onmessage = (event) => {
            if (isListening && ws && ws.readyState === WebSocket.OPEN) {
                const base64 = arrayBufferToBase64(event.data);
                ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
            }
        };
        
        source.connect(audioWorkletNode);
        console.log('🎤 Recording');
    } catch (error) {
        console.error('❌ Mic error:', error);
        updateStatus('Microphone denied');
        stopListening();
    }
}

function stopListening() {
    micBtn.classList.remove('active');
    mainOrb.classList.remove('active');
    glowRings.forEach(r => r.classList.remove('active'));
    statusText.classList.remove('active');
    updateStatus('Processing...');
    
    if (audioWorkletNode) audioWorkletNode.disconnect();
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    audioWorkletNode = null;
    mediaStream = null;
}

function processAudioBuffer(isComplete = false) {
    if (isProcessingAudio) return;
    if (isCancelling) {
        console.log('⚠️ Cancellation in progress - skipping buffer processing');
        return;
    }
    
    const minChunks = isComplete ? 1 : 3;
    if (audioChunks.length < minChunks) return;
    
    const chunksToProcess = audioChunks.splice(0, audioChunks.length);
    if (chunksToProcess.length > 0) {
        isProcessingAudio = true;
        playAudioChunks(chunksToProcess).then(() => {
            isProcessingAudio = false;
            if (audioChunks.length > 0) setTimeout(() => processAudioBuffer(false), 10);
        }).catch(err => {
            console.error('❌ Audio error:', err);
            isProcessingAudio = false;
        });
    }
}

async function playAudioChunks(chunks) {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        let totalLength = 0;
        const pcmArrays = [];
        
        for (const base64 of chunks) {
            try {
                const audioData = base64ToArrayBuffer(base64);
                const pcm = new Int16Array(audioData);
                pcmArrays.push(pcm);
                totalLength += pcm.length;
            } catch (err) {
                console.error('Decode error:', err);
            }
        }
        
        if (totalLength === 0) return;
        
        const combined = new Int16Array(totalLength);
        let offset = 0;
        for (const pcm of pcmArrays) {
            combined.set(pcm, offset);
            offset += pcm.length;
        }
        
        const buffer = audioContext.createBuffer(1, combined.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < combined.length; i++) {
            channelData[i] = combined[i] / 32768.0;
        }
        
        await schedulePlayback(buffer);
    } catch (error) {
        console.error('❌ Play error:', error);
    }
}

async function schedulePlayback(buffer) {
    if (audioContext.state === 'suspended') await audioContext.resume();
    if (buffer.duration < 0.01) return;
    
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    source.buffer = buffer;
    gain.gain.value = 1.2;
    source.connect(gain);
    gain.connect(audioContext.destination);
    
    const currentTime = audioContext.currentTime;
    const startTime = Math.max(currentTime, nextPlayTime);
    
    console.log('▶️ Playing', buffer.duration.toFixed(2), 's at', startTime.toFixed(2));
    
    source.start(startTime);
    currentAudioSource = source;
    
    scheduledSources.push({ source, startTime, duration: buffer.duration });
    nextPlayTime = startTime + buffer.duration;
    
    source.onended = () => {
        console.log('✅ Audio chunk ended');
        if (currentAudioSource === source) {
            currentAudioSource = null;
        }
        scheduledSources = scheduledSources.filter(s => s.source !== source);
    };
    
    source.onerror = (error) => {
        console.error('❌ Audio playback error:', error);
    };
}

function interruptForUserSpeech() {
    try {
        console.log('🛑 STOPPING ALL AUDIO FOR INTERRUPTION');
        
        stopAllScheduledAudio();
        
        audioChunks = [];
        isProcessingAudio = false;
        nextPlayTime = audioContext ? audioContext.currentTime : 0;
        
        if (ws && ws.readyState === WebSocket.OPEN && activeResponseId && !completedResponses.has(activeResponseId)) {
            console.log('⛔ Sending response.cancel for response', activeResponseId);
            const cancelMsg = {
                type: 'response.cancel',
                response_id: activeResponseId,
                event_id: ''
            };
            ws.send(JSON.stringify(cancelMsg));
            cancelledResponses.add(activeResponseId);
            isCancelling = true;
        }
        
        updateStatus('Listening...');
    } catch (e) {
        console.error('❌ Error during interruption:', e);
    }
}

function stopAllScheduledAudio() {
    const now = audioContext ? audioContext.currentTime : 0;
    console.log('🛑 Stopping all scheduled audio sources. Count:', scheduledSources.length, 'currentTime:', now);
    
    for (const entry of scheduledSources) {
        try {
            entry.source.stop();
        } catch (e) {
            // Already stopped
        }
    }
    
    scheduledSources = [];
    currentAudioSource = null;
}

function updateStatus(msg) {
    statusText.textContent = msg;
}

// ============================================
// TEXT MODE FUNCTIONS
// ============================================

async function connectTextMode() {
    try {
        updateChatStatus('Connecting...');
        console.log('🔗 Connecting to backend server (Text Mode)...');
        
        let wsUrl = SERVER_CONFIG.websocketUrl;
        
        // Add mode parameter
        wsUrl += '?mode=text';
        
        if (SERVER_CONFIG.authToken) {
            wsUrl += `&token=${encodeURIComponent(SERVER_CONFIG.authToken)}`;
            console.log('🔐 Using authentication token');
        }
        
        console.log('WebSocket URL:', wsUrl);
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ Connected to Text Mode!');
            isConnected = true;
            updateChatStatus('Connected');
        };
        
        ws.onmessage = (event) => handleTextMessage(event.data);
        
        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            updateChatStatus('Connection error');
        };
        
        ws.onclose = (event) => {
            console.log('🔌 Disconnected', event.code, event.reason);
            isConnected = false;
            updateChatStatus('Disconnected');
        };
    } catch (error) {
        console.error('❌ Connection failed:', error);
        updateChatStatus('Failed');
    }
}

function handleTextMessage(data) {
    try {
        const message = JSON.parse(data);
        
        if (message.type === 'text_response') {
            console.log('📨 Received text response');
            removeTypingIndicator();
            addMessage('assistant', message.content);
            isWaitingForResponse = false;
            updateChatStatus('Ready');
        } else if (message.type === 'error') {
            console.error('❌ Error:', message.error);
            removeTypingIndicator();
            addMessage('system', 'Error: ' + message.error);
            isWaitingForResponse = false;
            updateChatStatus('Error');
        }
    } catch (error) {
        console.error('❌ Parse error:', error);
    }
}

// Text input handlers
chatInput.addEventListener('input', () => {
    // Auto-resize textarea
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
    
    // Enable/disable send button
    sendBtn.disabled = !chatInput.value.trim() || isWaitingForResponse;
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
    }
});

sendBtn.addEventListener('click', () => {
    sendTextMessage();
});

async function sendTextMessage() {
    const message = chatInput.value.trim();
    if (!message || isWaitingForResponse) return;
    
    // Connect if not connected
    if (!isConnected) {
        await connectTextMode();
        // Wait a bit for connection
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!isConnected) {
            updateChatStatus('Connection failed');
            return;
        }
    }
    
    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;
    
    // Add user message to chat
    addMessage('user', message);
    
    // Show typing indicator
    showTypingIndicator();
    
    // Send to backend
    isWaitingForResponse = true;
    updateChatStatus('Sending...');
    
    try {
        ws.send(JSON.stringify({
            type: 'text_message',
            content: message
        }));
        console.log('📤 Sent text message:', message);
        updateChatStatus('Waiting for response...');
    } catch (error) {
        console.error('❌ Send error:', error);
        removeTypingIndicator();
        isWaitingForResponse = false;
        updateChatStatus('Send failed');
    }
}

function addMessage(role, content) {
    // Remove welcome message if exists
    const welcomeMsg = chatMessages.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? '👤' : '🤖';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    contentDiv.appendChild(bubble);
    contentDiv.appendChild(time);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Store in history
    conversationHistory.push({ role, content });
}

function showTypingIndicator() {
    removeTypingIndicator(); // Remove if exists
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'typing-indicator';
    typingDiv.id = 'typingIndicator';
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '🤖';
    
    const dotsDiv = document.createElement('div');
    dotsDiv.className = 'typing-dots';
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        dotsDiv.appendChild(dot);
    }
    
    typingDiv.appendChild(avatar);
    typingDiv.appendChild(dotsDiv);
    
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

function updateChatStatus(status) {
    chatStatus.textContent = status;
}

// ============================================
// COMMON FUNCTIONS
// ============================================

// Close button - works for both modes
closeBtn.addEventListener('click', () => {
    console.log('🔴 Stop button pressed - Ending session');
    
    if (currentMode === 'voice') {
        if (isListening) stopListening();
        stopAllScheduledAudio();
        audioChunks = [];
        isProcessingAudio = false;
        nextPlayTime = 0;
        
        if (audioWorkletNode) {
            audioWorkletNode.disconnect();
            audioWorkletNode = null;
        }
        
        if (mediaStream) {
            mediaStream.getTracks().forEach(t => t.stop());
            mediaStream = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        
        updateStatus('Session ended');
    } else {
        updateChatStatus('Session ended');
    }
    
    disconnectSession();
});

function disconnectSession() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        if (currentMode === 'voice' && activeResponseId) {
            console.log('⛔ Cancelling active response before closing');
            const cancelMsg = {
                type: 'response.cancel',
                response_id: activeResponseId,
                event_id: ''
            };
            ws.send(JSON.stringify(cancelMsg));
        }
        ws.close();
    }
    
    ws = null;
    isConnected = false;
    activeResponseId = null;
    completedResponses.clear();
    responseTranscripts.clear();
    cancelledResponses.clear();
    isCancelling = false;
    isWaitingForResponse = false;
    
    console.log('✅ Session disconnected');
}

// Settings
settingsIcon.addEventListener('click', () => {
    alert(`Mode: ${currentMode}\nConnected: ${isConnected}\nWebSocket: ${SERVER_CONFIG.websocketUrl}`);
});

// Utils
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (currentMode === 'voice') {
        if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            micBtn.click();
        }
    }
    if (e.code === 'Escape') closeBtn.click();
});

console.log('✅ Ready - Toggle mode and start chatting!');
