"""
Backend WebSocket Server
Handles both Voice and Text modes securely

Purpose:
- Hides API keys from frontend (security)
- Routes requests to appropriate Azure API
- Manages authentication and rate limiting
- Provides WebSocket proxy for realtime communication
- Uses Microsoft Agent Framework for text chat (same as .NET version)
"""

import asyncio
import websockets
import json
import os
import logging
import uuid
from datetime import datetime, timedelta
from typing import Dict, Set, Optional
from dotenv import load_dotenv
from collections import defaultdict
from urllib.parse import parse_qs, urlparse
from pathlib import Path

# Microsoft Agent Framework imports (same pattern as .NET Microsoft.Agents.AI.AIAgent)
# Using AzureOpenAIChatClient.create_agent() pattern as shown in:
# https://github.com/microsoft/agent-framework/tree/main/python/samples/getting_started/agents/azure_openai
from agent_framework.azure import AzureOpenAIChatClient

# Weather tool for function calling
from weather_tool import execute_tool

# Load environment variables from root voicechat folder
# Try multiple locations for .env file
env_paths = [
    Path(__file__).parent.parent.parent / '.env',  # voicechat/.env
    Path(__file__).parent / '.env',  # backend/.env (fallback)
    Path.cwd().parent / '.env',  # parent of cwd
]

env_loaded = False
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        print(f"✓ Loaded .env from: {env_path}")
        env_loaded = True
        break

if not env_loaded:
    load_dotenv()  # Try default locations


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

# Global Chat Agent instance (initialized once, like .NET's singleton service)
# The agent is created from AzureOpenAIChatClient.create_agent()
_chat_agent = None
_chat_client = None
_agent_lock = asyncio.Lock()

# Session Management
sessions: Dict[str, dict] = {}  # session_id -> {user_id, mode, created_at, azure_ws, client_ws, agent_session}
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


async def get_chat_agent():
    """
    Get or create the ChatAgent instance (singleton pattern like .NET).
    Uses Microsoft Agent Framework with Azure OpenAI, matching the .NET implementation.
    
    Pattern follows:
    https://github.com/microsoft/agent-framework/tree/main/python/samples/getting_started/agents/azure_openai/azure_chat_client_basic.py
    """
    global _chat_agent, _chat_client
    
    async with _agent_lock:
        if _chat_agent is not None:
            return _chat_agent
        
        if not AZURE_ENDPOINT or not AZURE_API_KEY:
            logger.error("Azure configuration not set - cannot create ChatAgent")
            return None
        
        try:
            # Create the Azure OpenAI Chat Client with explicit settings
            # This mirrors the .NET pattern: AzureOpenAIClient -> GetChatClient -> CreateAIAgent
            _chat_client = AzureOpenAIChatClient(
                endpoint=AZURE_ENDPOINT,
                deployment_name=AZURE_CHAT_DEPLOYMENT,
                api_key=AZURE_API_KEY,
            )
            
            # Create agent from the chat client (like .NET's CreateAIAgent)
            _chat_agent = _chat_client.create_agent(
                instructions="You are a helpful assistant. Respond naturally and concisely.",
            )
            
            logger.info("✓ ChatAgent initialized with Microsoft Agent Framework (AzureOpenAIChatClient)")
            return _chat_agent
            
        except Exception as e:
            logger.error(f"Failed to create ChatAgent: {e}")
            import traceback
            traceback.print_exc()
            return None


async def call_azure_chat_api_with_agent(message: str, agent_session) -> str:
    """
    Call Azure Chat API using Microsoft Agent Framework (ChatAgent).
    This mirrors the .NET AzureChatService pattern using AIAgent.
    
    Pattern follows:
    https://github.com/microsoft/agent-framework/tree/main/python/samples/getting_started/agents/azure_openai/azure_chat_client_with_session.py
    
    Args:
        message: User's text message
        agent_session: The agent session for conversation history
    
    Returns:
        The assistant's response text
    """
    agent = await get_chat_agent()
    if agent is None:
        return "Error: Azure OpenAI is not configured. Check AZURE_ENDPOINT and AZURE_API_KEY environment variables."
    
    try:
        # Run the agent with the user's message (mirrors .NET's agent.RunAsync)
        # Using non-streaming for simplicity - session maintains conversation history
        result = await agent.run(message, session=agent_session)
        
        # AgentRunResponse has a text property with the response content
        response_text = str(result) if result else "No response generated."
        
        return response_text
        
    except Exception as e:
        logger.error(f"Agent error: {e}")
        import traceback
        traceback.print_exc()
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
        'message_count': 0,
        'agent_session': None  # Agent session for text mode conversation history (RC1)
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
    """
    Forward messages from Azure back to client browser (Voice Mode)
    Intercepts function calls and executes tools server-side
    """
    try:
        async for message in azure_ws:
            if isinstance(message, str):
                logger.debug(f"Azure → Client [session {session_id[:8]}]: {message[:100]}...")
                
                # Check for function calls that need server-side handling
                if await try_handle_function_call(message, azure_ws, session_id):
                    # Function was handled, still forward to client for visibility
                    await client_ws.send(message)
                    continue
                
                await client_ws.send(message)
            elif isinstance(message, bytes):
                logger.debug(f"Azure → Client [session {session_id[:8]}]: {len(message)} bytes audio")
                await client_ws.send(message)
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"Azure disconnected [session {session_id[:8]}]")
    except Exception as e:
        logger.error(f"Error proxying Azure to client: {e}")


async def try_handle_function_call(message: str, azure_ws, session_id: str) -> bool:
    """
    Handle function calls from Azure OpenAI and send results back
    
    Args:
        message: JSON message from Azure
        azure_ws: WebSocket connection to Azure
        session_id: Current session ID
        
    Returns:
        True if a function call was handled, False otherwise
    """
    try:
        data = json.loads(message)
        msg_type = data.get("type")
        
        # Handle function call arguments done - this is when we execute the tool
        if msg_type == "response.function_call_arguments.done":
            call_id = data.get("call_id")
            name = data.get("name")
            arguments = data.get("arguments", "{}")
            
            if not call_id or not name:
                return False
            
            logger.info(f"[{session_id[:8]}] 🔧 Function call: {name} with args: {arguments}")
            
            # Execute the tool
            result = execute_tool(name, arguments)
            logger.info(f"[{session_id[:8]}] 🌤️ Tool result: {result}")
            
            # Send the function result back to Azure
            await send_function_result(azure_ws, call_id, result)
            
            return True
        
        return False
    except json.JSONDecodeError:
        return False
    except Exception as e:
        logger.error(f"Error handling function call: {e}")
        return False


async def send_function_result(azure_ws, call_id: str, result: str):
    """
    Send function execution result back to Azure OpenAI
    
    Args:
        azure_ws: WebSocket connection to Azure
        call_id: The function call ID
        result: JSON string with the function result
    """
    # Send conversation.item.create with function output
    item_create = json.dumps({
        "type": "conversation.item.create",
        "item": {
            "type": "function_call_output",
            "call_id": call_id,
            "output": result
        }
    })
    await azure_ws.send(item_create)
    logger.debug(f"Sent function_call_output for call_id: {call_id}")
    
    # Trigger response.create to continue the conversation
    response_create = json.dumps({
        "type": "response.create"
    })
    await azure_ws.send(response_create)
    logger.debug("Sent response.create to continue after function call")


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
# TEXT MODE HANDLERS (Microsoft Agent Framework)
# ==============================================

async def handle_text_mode(websocket, session_id: str):
    """
    Handle Text Mode connection using Microsoft Agent Framework.
    This mirrors the .NET AzureChatService implementation using AIAgent.
    
    Pattern follows:
    https://github.com/microsoft/agent-framework/tree/main/python/samples/getting_started/agents/azure_openai/azure_chat_client_with_session.py
    """
    try:
        # Get the ChatAgent instance
        agent = await get_chat_agent()
        if agent is None:
            await websocket.send(json.dumps({
                'type': 'error',
                'error': 'Azure OpenAI is not configured. Check AZURE_ENDPOINT and AZURE_API_KEY environment variables.'
            }))
            return
        
        # Create a new session for this conversation (like .NET's agent.CreateSessionAsync())
        # The session maintains conversation history across multiple agent.run() calls
        agent_session = await agent.create_session()
        sessions[session_id]['agent_session'] = agent_session
        
        logger.info(f"✓ Text mode activated with ChatAgent for session {session_id[:8]}")
        
        # Send session created confirmation
        await websocket.send(json.dumps({
            'type': 'session.created',
            'session_id': session_id
        }))
        
        logger.info(f"Waiting for text messages...")
        
        async for message in websocket:
            if isinstance(message, str):
                try:
                    data = json.loads(message)
                    logger.debug(f"Received message type: {data.get('type')}")
                    
                    if data.get('type') in ['text_message', 'text.message']:
                        user_message = data.get('content', '') or data.get('text', '')
                        
                        if not user_message:
                            logger.warning(f"[{session_id[:8]}] Empty message received")
                            continue
                        
                        logger.info(f"📨 [{session_id[:8]}] User: {user_message[:50]}...")
                        
                        # Call the agent using the Agent Framework (mirrors .NET's agent.RunAsync)
                        response = await call_azure_chat_api_with_agent(user_message, agent_session)
                        logger.info(f"📨 [{session_id[:8]}] Assistant: {response[:50]}...")
                        
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


from websockets.http11 import Response


async def health_check(connection, request):
    """
    HTTP health check endpoint (matches .NET's /health endpoint).
    This is called by websockets library for HTTP requests before WebSocket upgrade.
    """
    if request.path == "/health":
        return Response(
            200,
            "OK",
            websockets.Headers([("Content-Type", "application/json")]),
            json.dumps({
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }).encode()
        )
    # Return None to let websockets handle as WebSocket
    return None


async def main():
    """Start the WebSocket server"""
    validate_azure_config()
    
    # Initialize the ChatAgent at startup (like .NET's DI singleton)
    agent = await get_chat_agent()
    if agent:
        logger.info("✓ ChatAgent ready for text mode sessions")
    else:
        logger.warning("⚠ ChatAgent not initialized - text mode will not work")
    
    logger.info("=" * 70)
    logger.info("🚀 Backend Server (WebSocket + Microsoft Agent Framework)")
    logger.info("=" * 70)
    logger.info(f"Server: ws://{SERVER_HOST}:{SERVER_PORT}")
    logger.info(f"Health: http://{SERVER_HOST}:{SERVER_PORT}/health")
    logger.info(f"Azure: {AZURE_ENDPOINT}")
    logger.info(f"Voice Mode: {AZURE_REALTIME_DEPLOYMENT} (Realtime API)")
    logger.info(f"Text Mode: {AZURE_CHAT_DEPLOYMENT} (Agent Framework - ChatAgent)")
    logger.info(f"Rate Limit: {MAX_REQUESTS_PER_MINUTE} req/min, {MAX_CONNECTIONS_PER_USER} concurrent")
    logger.info("=" * 70)
    
    # Start cleanup task
    cleanup_task = asyncio.create_task(periodic_cleanup())
    
    # Start WebSocket server with HTTP health check support
    async with websockets.serve(
        handle_client_connection,
        SERVER_HOST,
        SERVER_PORT,
        max_size=10 * 1024 * 1024,  # 10MB max message size
        ping_interval=20,
        ping_timeout=20,
        process_request=health_check  # Handle /health HTTP requests
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

