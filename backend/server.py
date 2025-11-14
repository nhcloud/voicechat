"""
Backend WebSocket Server
Handles both Voice and Text modes securely

Purpose:
- Hides API keys from frontend (security)
- Routes requests to appropriate Azure API
- Manages authentication and rate limiting
- Provides WebSocket proxy for realtime communication
"""

import asyncio
import websockets
import json
import os
import logging
import uuid
import aiohttp
from datetime import datetime, timedelta
from typing import Dict, Set, Optional
from dotenv import load_dotenv
from collections import defaultdict
from urllib.parse import parse_qs, urlparse

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Azure OpenAI Configuration (server-side only, never exposed to client)
AZURE_ENDPOINT = os.getenv('AZURE_ENDPOINT', '').rstrip('/')
AZURE_API_KEY = os.getenv('AZURE_API_KEY', '')

# Model Deployments
AZURE_REALTIME_DEPLOYMENT = os.getenv('AZURE_REALTIME_DEPLOYMENT', 'gpt-realtime')
AZURE_CHAT_DEPLOYMENT = os.getenv('AZURE_CHAT_DEPLOYMENT', 'gpt-4o')  # or gpt-4, gpt-35-turbo

# API Versions
API_VERSION_REALTIME = os.getenv('API_VERSION_REALTIME', '2024-10-01-preview')
API_VERSION_CHAT = os.getenv('API_VERSION_CHAT', '2024-02-15-preview')

# Server Configuration
SERVER_HOST = '0.0.0.0'
SERVER_PORT = 8001

# Session Management
sessions: Dict[str, dict] = {}  # session_id -> {user_id, mode, created_at, azure_ws, client_ws}
user_connections: Dict[str, Set[str]] = defaultdict(set)  # user_id -> set of session_ids
user_requests: Dict[str, list] = defaultdict(list)  # user_id -> list of timestamps

# Rate Limiting Configuration
MAX_CONNECTIONS_PER_USER = 3
MAX_REQUESTS_PER_MINUTE = 60
RATE_LIMIT_WINDOW = 60  # seconds


def validate_azure_config():
    """Validate Azure configuration on startup"""
    if not AZURE_ENDPOINT or not AZURE_API_KEY:
        logger.error("Missing Azure configuration. Check .env file.")
        logger.error(f"AZURE_ENDPOINT: {'✓' if AZURE_ENDPOINT else '✗'}")
        logger.error(f"AZURE_API_KEY: {'✓' if AZURE_API_KEY else '✗'}")
        raise ValueError("Azure configuration incomplete")
    
    logger.info(f"✓ Azure endpoint: {AZURE_ENDPOINT}")
    logger.info(f"✓ Realtime deployment: {AZURE_REALTIME_DEPLOYMENT}")
    logger.info(f"✓ Chat deployment: {AZURE_CHAT_DEPLOYMENT}")


def build_azure_realtime_url():
    """Build Azure WebSocket URL for Realtime API"""
    ws_endpoint = AZURE_ENDPOINT.replace('https://', 'wss://')
    if not ws_endpoint.endswith('/'):
        ws_endpoint += '/'
    
    url = (
        f"{ws_endpoint}openai/realtime"
        f"?api-version={API_VERSION_REALTIME}"
        f"&deployment={AZURE_REALTIME_DEPLOYMENT}"
        f"&api-key={AZURE_API_KEY}"
    )
    return url


async def call_azure_chat_api(message: str) -> str:
    """Call Azure Chat Completion API (REST)"""
    url = f"{AZURE_ENDPOINT}/openai/deployments/{AZURE_CHAT_DEPLOYMENT}/chat/completions?api-version={API_VERSION_CHAT}"
    
    headers = {
        "api-key": AZURE_API_KEY,
        "Content-Type": "application/json"
    }
    
    data = {
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Respond naturally and concisely."},
            {"role": "user", "content": message}
        ],
        "max_tokens": 800,
        "temperature": 0.7
    }
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=data, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status == 200:
                    result = await response.json()
                    return result['choices'][0]['message']['content']
                else:
                    error_text = await response.text()
                    logger.error(f"Azure Chat API error: {response.status} - {error_text}")
                    return f"Error: Failed to get response (status {response.status})"
    except asyncio.TimeoutError:
        logger.error("Azure Chat API timeout")
        return "Error: Request timed out"
    except Exception as e:
        logger.error(f"Azure Chat API exception: {e}")
        return f"Error: {str(e)}"


def create_session(user_id: str, mode: str) -> str:
    """Create a new session for a user"""
    session_id = str(uuid.uuid4())
    sessions[session_id] = {
        'user_id': user_id,
        'mode': mode,
        'created_at': datetime.now(),
        'azure_ws': None,
        'client_ws': None,
        'message_count': 0
    }
    user_connections[user_id].add(session_id)
    logger.info(f"✓ Created {mode} session {session_id} for user {user_id}")
    return session_id


def cleanup_session(session_id: str):
    """Clean up session data"""
    if session_id in sessions:
        session = sessions[session_id]
        user_id = session['user_id']
        mode = session['mode']
        user_connections[user_id].discard(session_id)
        del sessions[session_id]
        logger.info(f"✓ Cleaned up {mode} session {session_id}")


def check_rate_limit(user_id: str) -> tuple[bool, str]:
    """Check if user is within rate limits"""
    now = datetime.now()
    
    # Check connection limit
    if len(user_connections[user_id]) >= MAX_CONNECTIONS_PER_USER:
        return False, f"Maximum {MAX_CONNECTIONS_PER_USER} concurrent connections exceeded"
    
    # Check request rate limit
    user_requests[user_id] = [
        ts for ts in user_requests[user_id]
        if (now - ts).total_seconds() < RATE_LIMIT_WINDOW
    ]
    
    if len(user_requests[user_id]) >= MAX_REQUESTS_PER_MINUTE:
        return False, f"Rate limit exceeded: {MAX_REQUESTS_PER_MINUTE} requests per minute"
    
    user_requests[user_id].append(now)
    return True, "OK"


def authenticate_user(websocket) -> Optional[str]:
    """
    Authenticate user from WebSocket connection.
    In production, replace with JWT/OAuth2 validation
    """
    try:
        auth_header = websocket.request.headers.get('Authorization', '')
    except AttributeError:
        auth_header = ''
    
    if auth_header.startswith('Bearer '):
        user_id = auth_header.replace('Bearer ', '').strip()
    else:
        user_id = f"anonymous-{uuid.uuid4().hex[:8]}"
    
    logger.info(f"✓ Authenticated user: {user_id}")
    return user_id


# ==============================================
# VOICE MODE HANDLERS (Realtime API)
# ==============================================

async def proxy_client_to_azure(client_ws, azure_ws, session_id: str):
    """Forward messages from client browser to Azure (Voice Mode)"""
    try:
        async for message in client_ws:
            if isinstance(message, str):
                logger.debug(f"Client → Azure [session {session_id[:8]}]: {message[:100]}...")
                await azure_ws.send(message)
                sessions[session_id]['message_count'] += 1
            elif isinstance(message, bytes):
                logger.debug(f"Client → Azure [session {session_id[:8]}]: {len(message)} bytes audio")
                await azure_ws.send(message)
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Client disconnected [session {session_id[:8]}]")
    except Exception as e:
        logger.error(f"Error proxying client to Azure: {e}")


async def proxy_azure_to_client(azure_ws, client_ws, session_id: str):
    """Forward messages from Azure back to client browser (Voice Mode)"""
    try:
        async for message in azure_ws:
            if isinstance(message, str):
                logger.debug(f"Azure → Client [session {session_id[:8]}]: {message[:100]}...")
                await client_ws.send(message)
            elif isinstance(message, bytes):
                logger.debug(f"Azure → Client [session {session_id[:8]}]: {len(message)} bytes audio")
                await client_ws.send(message)
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Azure disconnected [session {session_id[:8]}]")
    except Exception as e:
        logger.error(f"Error proxying Azure to client: {e}")


async def handle_voice_mode(websocket, session_id: str):
    """Handle Voice Mode connection"""
    azure_ws = None
    
    try:
        logger.info(f"Connecting to Azure Realtime API for session {session_id[:8]}...")
        
        azure_url = build_azure_realtime_url()
        logger.debug(f"Azure URL (key hidden): {azure_url.split('&api-key=')[0]}")
        
        async with websockets.connect(
            azure_url,
            max_size=10 * 1024 * 1024,  # 10MB max message size
            ping_interval=20,
            ping_timeout=20,
            user_agent_header='Realtime-Voice-Bot/1.0'
        ) as azure_ws:
            sessions[session_id]['azure_ws'] = azure_ws
            logger.info(f"✓ Connected to Azure Realtime API [session {session_id[:8]}]")
            
            # Start bidirectional proxying
            await asyncio.gather(
                proxy_client_to_azure(websocket, azure_ws, session_id),
                proxy_azure_to_client(azure_ws, websocket, session_id),
                return_exceptions=True
            )
    
    except websockets.exceptions.WebSocketException as e:
        logger.error(f"Azure Realtime API connection failed: {e}")
        error_msg = str(e)
        if "401" in error_msg or "403" in error_msg:
            logger.error("Check your AZURE_API_KEY and AZURE_ENDPOINT in .env file")
        if "404" in error_msg:
            logger.error(f"Check your AZURE_REALTIME_DEPLOYMENT name: {AZURE_REALTIME_DEPLOYMENT}")
        try:
            await websocket.send(json.dumps({
                'type': 'error',
                'error': f'Failed to connect to Azure Realtime API: {str(e)}'
            }))
        except:
            pass
    except Exception as e:
        logger.error(f"Error in voice mode: {e}", exc_info=True)
        try:
            await websocket.send(json.dumps({
                'type': 'error',
                'error': f'Voice mode error: {str(e)}'
            }))
        except:
            pass


# ==============================================
# TEXT MODE HANDLERS (Chat Completion API)
# ==============================================

async def handle_text_mode(websocket, session_id: str):
    """Handle Text Mode connection"""
    try:
        logger.info(f"✓ Text mode activated for session {session_id[:8]}")
        logger.info(f"Waiting for text messages...")
        
        async for message in websocket:
            if isinstance(message, str):
                try:
                    data = json.loads(message)
                    logger.debug(f"Received message type: {data.get('type')}")
                    
                    if data.get('type') == 'text_message':
                        user_message = data.get('content', '')
                        logger.info(f"📨 Text message from user: {user_message[:50]}...")
                        
                        # Call Azure Chat API
                        response = await call_azure_chat_api(user_message)
                        logger.info(f"📨 Response from Azure: {response[:50]}...")
                        
                        # Send back to client
                        await websocket.send(json.dumps({
                            'type': 'text_response',
                            'content': response
                        }))
                        
                        sessions[session_id]['message_count'] += 1
                    else:
                        logger.warning(f"Unknown message type: {data.get('type')}")
                    
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'error': 'Invalid message format'
                    }))
                except Exception as e:
                    logger.error(f"Error processing text message: {e}", exc_info=True)
                    await websocket.send(json.dumps({
                        'type': 'error',
                        'error': str(e)
                    }))
    
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Text mode client disconnected [session {session_id[:8]}]")
    except Exception as e:
        logger.error(f"Error in text mode: {e}", exc_info=True)


# ==============================================
# MAIN CONNECTION HANDLER
# ==============================================

async def handle_client_connection(websocket):
    """Handle incoming WebSocket connection from client browser"""
    session_id = None
    mode = None
    path = "/"
    
    try:
        # Try to get path from websocket object
        if hasattr(websocket, 'path'):
            path = websocket.path
        elif hasattr(websocket, 'request'):
            path = websocket.request.path
        
        # Extract mode from connection path
        mode = 'voice'  # default
        if '?' in path:
            query = path.split('?', 1)[1]
            params = parse_qs(query)
            mode_param = params.get('mode', ['voice'])[0]
            if mode_param in ['voice', 'text']:
                mode = mode_param
        
        logger.info(f"📞 New connection request - Mode: {mode} - Path: {path}")
        
        # Authenticate user
        user_id = authenticate_user(websocket)
        if not user_id:
            await websocket.close(1008, "Authentication failed")
            return
        
        # Check rate limits
        allowed, reason = check_rate_limit(user_id)
        if not allowed:
            logger.warning(f"Rate limit exceeded for user {user_id}: {reason}")
            await websocket.close(1008, reason)
            return
        
        # Create session
        session_id = create_session(user_id, mode)
        sessions[session_id]['client_ws'] = websocket
        
        logger.info(f"✓ Client connected: user={user_id}, mode={mode}, session={session_id[:8]}")
        
        # Route to appropriate handler
        if mode == 'voice':
            logger.info(f"Routing to voice mode handler...")
            await handle_voice_mode(websocket, session_id)
        elif mode == 'text':
            logger.info(f"Routing to text mode handler...")
            await handle_text_mode(websocket, session_id)
        else:
            logger.error(f"Unknown mode: {mode}")
            await websocket.close(1008, "Invalid mode")
    
    except websockets.exceptions.ConnectionClosed as e:
        logger.info(f"Connection closed normally: {e.code} {e.reason}")
    except Exception as e:
        logger.error(f"Error in client connection: {e}", exc_info=True)
        try:
            await websocket.send(json.dumps({
                'type': 'error',
                'error': str(e)
            }))
        except:
            pass
    finally:
        # Cleanup
        if session_id:
            session = sessions.get(session_id)
            if session:
                logger.info(f"Session {session_id[:8]} stats: {session['message_count']} messages, mode: {session['mode']}")
            cleanup_session(session_id)
        
        try:
            await websocket.close()
        except:
            pass


async def periodic_cleanup():
    """Periodically clean up stale sessions"""
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        now = datetime.now()
        stale_sessions = [
            sid for sid, session in sessions.items()
            if (now - session['created_at']).total_seconds() > 3600  # 1 hour
        ]
        for sid in stale_sessions:
            logger.warning(f"Cleaning up stale session {sid[:8]}")
            cleanup_session(sid)


async def main():
    """Start the WebSocket server"""
    validate_azure_config()
    
    logger.info("=" * 70)
    logger.info("🚀 Backend Server (WebSocket + Azure AI)")
    logger.info("=" * 70)
    logger.info(f"Server: ws://{SERVER_HOST}:{SERVER_PORT}")
    logger.info(f"Azure: {AZURE_ENDPOINT}")
    logger.info(f"Voice Mode: {AZURE_REALTIME_DEPLOYMENT} (Realtime API)")
    logger.info(f"Text Mode: {AZURE_CHAT_DEPLOYMENT} (Chat Completion API)")
    logger.info(f"Rate Limit: {MAX_REQUESTS_PER_MINUTE} req/min, {MAX_CONNECTIONS_PER_USER} concurrent")
    logger.info("=" * 70)
    
    # Start cleanup task
    cleanup_task = asyncio.create_task(periodic_cleanup())
    
    # Start WebSocket server
    async with websockets.serve(
        handle_client_connection,
        SERVER_HOST,
        SERVER_PORT,
        max_size=10 * 1024 * 1024,  # 10MB max message size
        ping_interval=20,
        ping_timeout=20
    ):
        logger.info("✅ Backend ready for connections")
        logger.info("📡 Accepting both Voice and Text mode connections")
        logger.info("💡 Make sure frontend is running on port 8000")
        await asyncio.Future()  # Run forever


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("\n👋 Backend server shutting down...")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)

