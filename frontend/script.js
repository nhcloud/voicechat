// AI Assistant - Dual Mode (Voice + Text)
// Production Architecture: Browser → Backend → Azure

// ============================================
// UI ELEMENTS
// ============================================

// Mode Switcher
const textModeBtn = document.getElementById('textModeBtn');
const voiceModeBtn = document.getElementById('voiceModeBtn');
const modeIndicator = document.getElementById('modeIndicator');

// Containers
const voiceContainer = document.getElementById('voiceContainer');
const textContainer = document.getElementById('textContainer');

// Voice Mode
const waveformContainer = document.getElementById('waveformContainer');
const micBtn = document.getElementById('micBtn');
const micBtnLabel = document.getElementById('micBtnLabel');
const voiceStatus = document.getElementById('voiceStatus');
const endSessionContainer = document.getElementById('endSessionContainer');
const endSessionBtn = document.getElementById('endSessionBtn');

// Text Mode
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const textMicBtn = document.getElementById('textMicBtn');
const recordingStatus = document.getElementById('recordingStatus');

// Connection Bar
const connectionBar = document.getElementById('connectionBar');

// Help Modal
const helpBtn = document.getElementById('helpBtn');
const helpModal = document.getElementById('helpModal');
const closeHelpModal = document.getElementById('closeHelpModal');

// Voice Selector
const voiceSelector = document.getElementById('voiceSelector');

// ============================================
// STATE VARIABLES
// ============================================

let currentMode = 'voice';
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
let cancelledResponses = new Set();
let isCancelling = false;
let lastBargeInTime = 0;
let bargeInCooldownMs = 1200;

// Text Mode Variables
let conversationHistory = [];
let isWaitingForResponse = false;

// Speech-to-Text Variables (for Text Mode)
let sttRecognition = null;
let isRecordingSTT = false;

// Text-to-Speech Variables
let ttsUtterance = null;
let currentSpeakingBtn = null;

console.log('🎤 AI Voice Assistant Initialized');
console.log('🔒 Secure: Connecting through backend server');

// ============================================
// INITIALIZATION
// ============================================

function init() {
    updateModeUI();
    setupModeIndicator();
    updateConnectionStatus(false);
    setupHelpModal();
    setupSpeechToText();
}

function setupModeIndicator() {
    // Position the indicator on the active button
    const activeBtn = document.querySelector('.mode-btn.active');
    if (activeBtn && modeIndicator) {
        const rect = activeBtn.getBoundingClientRect();
        const parentRect = activeBtn.parentElement.getBoundingClientRect();
        modeIndicator.style.left = (activeBtn.offsetLeft) + 'px';
        modeIndicator.style.width = activeBtn.offsetWidth + 'px';
    }
}

function setupHelpModal() {
    if (helpBtn && helpModal) {
        helpBtn.addEventListener('click', () => {
            helpModal.style.display = 'flex';
        });
        
        closeHelpModal?.addEventListener('click', () => {
            helpModal.style.display = 'none';
        });
        
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.style.display = 'none';
            }
        });
    }
}

function setupSpeechToText() {
    // Check if Speech Recognition is available
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
        sttRecognition = new SpeechRecognition();
        sttRecognition.continuous = false;
        sttRecognition.interimResults = true;
        sttRecognition.lang = 'en-US';
        
        sttRecognition.onstart = () => {
            console.log('🎤 Speech recognition started');
            isRecordingSTT = true;
            updateSTTUI(true);
        };
        
        sttRecognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            // Update input with transcription
            if (finalTranscript) {
                const currentValue = chatInput.value;
                chatInput.value = currentValue + (currentValue ? ' ' : '') + finalTranscript;
                chatInput.dispatchEvent(new Event('input'));
            }
        };
        
        sttRecognition.onerror = (event) => {
            console.error('❌ Speech recognition error:', event.error);
            stopSTT();
        };
        
        sttRecognition.onend = () => {
            console.log('⏹️ Speech recognition ended');
            stopSTT();
        };
    } else {
        console.warn('⚠️ Speech Recognition not supported');
        if (textMicBtn) {
            textMicBtn.style.display = 'none';
        }
    }
}

// ============================================
// MODE SWITCHING
// ============================================

textModeBtn.addEventListener('click', () => switchMode('text'));
voiceModeBtn.addEventListener('click', () => switchMode('voice'));

function switchMode(mode) {
    if (currentMode === mode) return;
    
    currentMode = mode;
    console.log(`🔄 Switching to ${mode} mode`);
    
    // Update button states
    textModeBtn.classList.toggle('active', mode === 'text');
    voiceModeBtn.classList.toggle('active', mode === 'voice');
    
    // Animate indicator
    const activeBtn = mode === 'text' ? textModeBtn : voiceModeBtn;
    modeIndicator.style.left = activeBtn.offsetLeft + 'px';
    modeIndicator.style.width = activeBtn.offsetWidth + 'px';
    
    // Stop any ongoing speech/recording
    stopTTS();
    stopSTT();
    
    // Disconnect if connected
    if (isConnected) {
        disconnectSession();
    }
    
    // Update UI
    updateModeUI();
    
    // Clear text chat when switching to voice
    if (mode === 'voice') {
        conversationHistory = [];
        resetChatMessages();
    }
}

function updateModeUI() {
    if (currentMode === 'voice') {
        voiceContainer.style.display = 'flex';
        textContainer.style.display = 'none';
        updateVoiceStatus('Ready to listen', false);
    } else {
        voiceContainer.style.display = 'none';
        textContainer.style.display = 'flex';
        chatInput.focus();
    }
}

// ============================================
// CONNECTION STATUS
// ============================================

function updateConnectionStatus(connected, text = null) {
    isConnected = connected;
    connectionBar.classList.toggle('connected', connected);
    const textEl = connectionBar.querySelector('.connection-text');
    textEl.textContent = text || (connected ? 'Connected' : 'Disconnected');
    
    // Show/hide end session button based on connection state (voice mode only)
    if (endSessionContainer) {
        endSessionContainer.style.display = (connected && currentMode === 'voice') ? 'block' : 'none';
    }
}

// ============================================
// VOICE MODE FUNCTIONS
// ============================================

async function connectVoiceMode() {
    try {
        updateVoiceStatus('Connecting...', false);
        updateConnectionStatus(false, 'Connecting...');
        console.log('🔗 Connecting to backend (Voice Mode)...');
        
        let wsUrl = SERVER_CONFIG.websocketUrl + '?mode=voice';
        
        if (SERVER_CONFIG.authToken) {
            wsUrl += `&token=${encodeURIComponent(SERVER_CONFIG.authToken)}`;
        }
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ Connected to Voice Mode!');
            updateConnectionStatus(true);
            updateVoiceStatus('Connected - Ready', false);
            sendSessionUpdate();
        };
        
        ws.onmessage = (event) => handleVoiceMessage(event.data);
        
        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            updateVoiceStatus('Connection error', false);
            updateConnectionStatus(false, 'Error');
        };
        
        ws.onclose = (event) => {
            console.log('🔌 Disconnected', event.code, event.reason);
            updateConnectionStatus(false);
            updateVoiceStatus('Disconnected', false);
            if (isListening) stopListening();
        };
    } catch (error) {
        console.error('❌ Connection failed:', error);
        updateVoiceStatus('Connection failed', false);
        updateConnectionStatus(false, 'Failed');
    }
}

function sendSessionUpdate() {
    const selectedVoice = voiceSelector ? voiceSelector.value : 'alloy';
    console.log(`🔊 Using voice: ${selectedVoice}`);
    
    ws.send(JSON.stringify({
        type: 'session.update',
        session: {
            instructions: 'You are a helpful voice assistant. Respond naturally and concisely. When users ask about weather in a city, use the get_weather function to retrieve current weather information.',
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
            voice: selectedVoice,
            tools: [
                {
                    type: 'function',
                    name: 'get_weather',
                    description: 'Get the current weather for a specified city. Call this whenever the user asks about weather conditions in a specific location.',
                    parameters: {
                        type: 'object',
                        properties: {
                            city: {
                                type: 'string',
                                description: "The city name to get weather for (e.g., 'Seattle', 'New York', 'London')"
                            },
                            unit: {
                                type: 'string',
                                description: "Temperature unit: 'celsius' or 'fahrenheit'",
                                enum: ['celsius', 'fahrenheit']
                            }
                        },
                        required: ['city']
                    }
                }
            ],
            tool_choice: 'auto'
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
                if (nowTs - lastBargeInTime < bargeInCooldownMs) break;
                const aiSpeaking = scheduledSources.length > 0 || currentAudioSource;
                if (aiSpeaking || (activeResponseId && !isCancelling)) {
                    console.log('⚡ INTERRUPTION - Cancelling AI');
                    interruptForUserSpeech();
                    lastBargeInTime = nowTs;
                }
                break;
                
            case 'input_audio_buffer.speech_stopped':
                console.log('⏸️ Speech ended');
                break;
                
            case 'conversation.item.input_audio_transcription.completed':
                if (event.transcript) console.log('👤 You:', event.transcript);
                break;
                
            case 'response.created':
                updateVoiceStatus('AI thinking...', true);
                audioChunks = [];
                isCancelling = false;
                activeResponseId = event.response?.id || event.response_id;
                stopAllScheduledAudio();
                break;
                
            case 'response.audio_transcript.delta':
                if (event.delta) console.log('💬', event.delta);
                break;
                
            case 'response.audio.delta':
                if (event.delta && !isCancelling) {
                    audioChunks.push(event.delta);
                    // Show speaking animation when AI starts responding
                    if (waveformContainer && !waveformContainer.classList.contains('speaking')) {
                        waveformContainer.classList.remove('active');
                        waveformContainer.classList.add('speaking');
                    }
                    processAudioBuffer();
                }
                break;
                
            case 'response.audio.done':
                processAudioBuffer(true);
                break;
                
            case 'response.done':
                const doneResponseId = event.response?.id || event.response_id;
                if (doneResponseId) {
                    completedResponses.add(doneResponseId);
                    if (activeResponseId === doneResponseId) activeResponseId = null;
                }
                // Return to listening state or idle
                if (waveformContainer) {
                    waveformContainer.classList.remove('speaking');
                    if (isListening) {
                        waveformContainer.classList.add('active');
                    }
                }
                updateVoiceStatus(isListening ? 'Listening...' : 'Ready', isListening);
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

function updateVoiceStatus(text, active) {
    const statusText = voiceStatus.querySelector('.status-text');
    statusText.textContent = text;
    voiceStatus.classList.toggle('active', active);
}

// Microphone button
micBtn.addEventListener('click', async () => {
    if (!isConnected) {
        await connectVoiceMode();
        return;
    }
    
    isListening = !isListening;
    if (isListening) await startListening();
    else stopListening();
});

// End Session button
if (endSessionBtn) {
    endSessionBtn.addEventListener('click', () => {
        console.log('🛑 Ending voice session...');
        if (isListening) stopListening();
        stopAllScheduledAudio();
        disconnectSession();
        updateVoiceStatus('Session ended', false);
        
        // Reset UI state
        micBtn.classList.remove('active');
        micBtn.querySelector('.mic-icon').style.display = 'block';
        micBtn.querySelector('.stop-icon').style.display = 'none';
        micBtnLabel.textContent = 'Click to speak';
        
        // Reset waveform
        if (waveformContainer) {
            waveformContainer.classList.remove('active', 'speaking');
        }
    });
}

async function startListening() {
    micBtn.classList.add('active');
    waveformContainer.classList.add('active');
    waveformContainer.classList.remove('speaking');
    micBtn.querySelector('.mic-icon').style.display = 'none';
    micBtn.querySelector('.stop-icon').style.display = 'block';
    micBtnLabel.textContent = 'Click to stop';
    updateVoiceStatus('Listening...', true);
    
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
        updateVoiceStatus('Microphone denied', false);
        stopListening();
    }
}

function stopListening() {
    micBtn.classList.remove('active');
    waveformContainer.classList.remove('active');
    micBtn.querySelector('.mic-icon').style.display = 'block';
    micBtn.querySelector('.stop-icon').style.display = 'none';
    micBtnLabel.textContent = 'Click to speak';
    updateVoiceStatus('Processing...', false);
    
    if (audioWorkletNode) audioWorkletNode.disconnect();
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    audioWorkletNode = null;
    mediaStream = null;
    isListening = false;
}

function processAudioBuffer(isComplete = false) {
    if (isProcessingAudio || isCancelling) return;
    
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
    
    source.start(startTime);
    currentAudioSource = source;
    scheduledSources.push({ source, startTime, duration: buffer.duration });
    nextPlayTime = startTime + buffer.duration;
    
    source.onended = () => {
        if (currentAudioSource === source) currentAudioSource = null;
        scheduledSources = scheduledSources.filter(s => s.source !== source);
    };
}

function interruptForUserSpeech() {
    stopAllScheduledAudio();
    audioChunks = [];
    isProcessingAudio = false;
    nextPlayTime = audioContext ? audioContext.currentTime : 0;
    
    if (ws && ws.readyState === WebSocket.OPEN && activeResponseId && !completedResponses.has(activeResponseId)) {
        ws.send(JSON.stringify({
            type: 'response.cancel',
            response_id: activeResponseId,
            event_id: ''
        }));
        cancelledResponses.add(activeResponseId);
        isCancelling = true;
    }
    
    updateVoiceStatus('Listening...', true);
}

function stopAllScheduledAudio() {
    for (const entry of scheduledSources) {
        try { entry.source.stop(); } catch (e) {}
    }
    scheduledSources = [];
    currentAudioSource = null;
}

// ============================================
// TEXT MODE FUNCTIONS
// ============================================

async function connectTextMode() {
    try {
        updateConnectionStatus(false, 'Connecting...');
        console.log('🔗 Connecting to backend (Text Mode)...');
        
        let wsUrl = SERVER_CONFIG.websocketUrl + '?mode=text';
        
        if (SERVER_CONFIG.authToken) {
            wsUrl += `&token=${encodeURIComponent(SERVER_CONFIG.authToken)}`;
        }
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ Connected to Text Mode!');
            updateConnectionStatus(true);
        };
        
        ws.onmessage = (event) => handleTextMessage(event.data);
        
        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            updateConnectionStatus(false, 'Error');
        };
        
        ws.onclose = (event) => {
            console.log('🔌 Disconnected', event.code, event.reason);
            updateConnectionStatus(false);
        };
    } catch (error) {
        console.error('❌ Connection failed:', error);
        updateConnectionStatus(false, 'Failed');
    }
}

function handleTextMessage(data) {
    try {
        const message = JSON.parse(data);
        
        if (message.type === 'text_response') {
            removeTypingIndicator();
            addMessage('assistant', message.content);
            isWaitingForResponse = false;
        } else if (message.type === 'error') {
            removeTypingIndicator();
            addMessage('system', 'Error: ' + message.error);
            isWaitingForResponse = false;
        }
    } catch (error) {
        console.error('❌ Parse error:', error);
    }
}

// Text input handlers
chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = chatInput.scrollHeight + 'px';
    sendBtn.disabled = !chatInput.value.trim() || isWaitingForResponse;
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
    }
});

sendBtn.addEventListener('click', sendTextMessage);

// Text mode microphone button for Speech-to-Text
if (textMicBtn) {
    textMicBtn.addEventListener('click', toggleSTT);
}

function toggleSTT() {
    if (isRecordingSTT) {
        stopSTT();
    } else {
        startSTT();
    }
}

function startSTT() {
    if (!sttRecognition) {
        alert('Speech recognition is not supported in your browser. Please use Chrome or Edge.');
        return;
    }
    
    try {
        sttRecognition.start();
    } catch (error) {
        console.error('❌ Failed to start speech recognition:', error);
    }
}

function stopSTT() {
    if (sttRecognition && isRecordingSTT) {
        try {
            sttRecognition.stop();
        } catch (error) {
            // Ignore errors when stopping
        }
    }
    isRecordingSTT = false;
    updateSTTUI(false);
}

function updateSTTUI(recording) {
    if (textMicBtn) {
        textMicBtn.classList.toggle('recording', recording);
        const micIcon = textMicBtn.querySelector('.mic-icon');
        const recordingIcon = textMicBtn.querySelector('.recording-icon');
        if (micIcon) micIcon.style.display = recording ? 'none' : 'block';
        if (recordingIcon) recordingIcon.style.display = recording ? 'block' : 'none';
    }
    if (recordingStatus) {
        recordingStatus.style.display = recording ? 'flex' : 'none';
    }
}

async function sendTextMessage() {
    const message = chatInput.value.trim();
    if (!message || isWaitingForResponse) return;
    
    if (!isConnected) {
        await connectTextMode();
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!isConnected) return;
    }
    
    chatInput.value = '';
    chatInput.style.height = 'auto';
    sendBtn.disabled = true;
    
    addMessage('user', message);
    showTypingIndicator();
    
    isWaitingForResponse = true;
    
    try {
        ws.send(JSON.stringify({
            type: 'text_message',
            content: message
        }));
    } catch (error) {
        console.error('❌ Send error:', error);
        removeTypingIndicator();
        isWaitingForResponse = false;
    }
}

function addMessage(role, content) {
    // Remove empty state if exists
    const emptyState = chatMessages.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    
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
    
    const footer = document.createElement('div');
    footer.className = 'message-footer';
    
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    footer.appendChild(time);
    
    // Add speak button for assistant messages (Text-to-Speech)
    if (role === 'assistant') {
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        const speakBtn = document.createElement('button');
        speakBtn.className = 'speak-btn';
        speakBtn.title = 'Read aloud (Text-to-Speech)';
        speakBtn.innerHTML = `
            <svg class="speaker-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
            <svg class="stop-speaker-icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="display:none">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
        `;
        speakBtn.onclick = () => toggleTTS(content, speakBtn);
        
        actions.appendChild(speakBtn);
        footer.appendChild(actions);
    }
    
    contentDiv.appendChild(bubble);
    contentDiv.appendChild(footer);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    conversationHistory.push({ role, content });
}

// Text-to-Speech functionality
function toggleTTS(text, btn) {
    // If currently speaking this message, stop it
    if (currentSpeakingBtn === btn) {
        stopTTS();
        return;
    }
    
    // Stop any current speech
    stopTTS();
    
    // Start new speech
    if ('speechSynthesis' in window) {
        ttsUtterance = new SpeechSynthesisUtterance(text);
        ttsUtterance.rate = 1.0;
        ttsUtterance.pitch = 1.0;
        ttsUtterance.volume = 1.0;
        
        // Get available voices and prefer a natural voice
        const voices = speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => 
            v.name.includes('Google') || 
            v.name.includes('Microsoft') || 
            v.name.includes('Natural')
        ) || voices[0];
        
        if (preferredVoice) {
            ttsUtterance.voice = preferredVoice;
        }
        
        ttsUtterance.onstart = () => {
            updateTTSButton(btn, true);
            currentSpeakingBtn = btn;
        };
        
        ttsUtterance.onend = () => {
            updateTTSButton(btn, false);
            currentSpeakingBtn = null;
        };
        
        ttsUtterance.onerror = () => {
            updateTTSButton(btn, false);
            currentSpeakingBtn = null;
        };
        
        speechSynthesis.speak(ttsUtterance);
    } else {
        alert('Text-to-Speech is not supported in your browser.');
    }
}

function stopTTS() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
    }
    if (currentSpeakingBtn) {
        updateTTSButton(currentSpeakingBtn, false);
        currentSpeakingBtn = null;
    }
}

function updateTTSButton(btn, speaking) {
    btn.classList.toggle('speaking', speaking);
    const speakerIcon = btn.querySelector('.speaker-icon');
    const stopIcon = btn.querySelector('.stop-speaker-icon');
    if (speakerIcon) speakerIcon.style.display = speaking ? 'none' : 'block';
    if (stopIcon) stopIcon.style.display = speaking ? 'block' : 'none';
}

function showTypingIndicator() {
    removeTypingIndicator();
    
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
    if (indicator) indicator.remove();
}

function resetChatMessages() {
    chatMessages.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
            </div>
            <h3>Start a conversation</h3>
            <p>Type a message or click the microphone to speak</p>
        </div>
    `;
    // Stop any ongoing TTS when resetting
    stopTTS();
}

// ============================================
// COMMON FUNCTIONS
// ============================================

function disconnectSession() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        if (currentMode === 'voice' && activeResponseId) {
            ws.send(JSON.stringify({
                type: 'response.cancel',
                response_id: activeResponseId,
                event_id: ''
            }));
        }
        ws.close();
    }
    
    ws = null;
    isConnected = false;
    activeResponseId = null;
    completedResponses.clear();
    cancelledResponses.clear();
    isCancelling = false;
    isWaitingForResponse = false;
    
    // Stop any ongoing speech
    stopTTS();
    stopSTT();
    
    updateConnectionStatus(false);
}

// Utility functions
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
});

// Initialize on load
init();

// Load voices for TTS (needed for some browsers)
if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
    };
}

console.log('✅ Ready - Select mode and start chatting!');
