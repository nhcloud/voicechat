#!/usr/bin/env python3
"""
Frontend HTTP Server
Serves the HTML/CSS/JavaScript files for the voice bot interface
"""

import http.server
import socketserver
import webbrowser
import os
from pathlib import Path

def main():
    # Get current directory (frontend folder)
    frontend_dir = Path(__file__).parent
    os.chdir(frontend_dir)
    
    PORT = 8000
    
    class CustomHandler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            # Add CORS headers
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')
            # Required for audio worklets (microphone access)
            self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
            self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
            super().end_headers()
    
    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print(f"🌐 Frontend Server (UI)")
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
            print(f"📡 Server: http://localhost:{PORT}")
            print(f"📁 Serving: {frontend_dir}")
            print(f"🔗 Opening browser...")
            print(f"📝 Press Ctrl+C to stop")
            print(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n")
            
            # Open browser automatically
            webbrowser.open(f'http://localhost:{PORT}')
            
            print("✅ Frontend ready! Browser should open automatically.")
            print("💡 Make sure backend server is also running on port 8001\n")
            httpd.serve_forever()
            
    except KeyboardInterrupt:
        print("\n\n👋 Frontend server stopped.")
    except OSError as e:
        if 'address already in use' in str(e).lower():
            print(f"\n❌ Port {PORT} is already in use.")
            print(f"💡 Stop other servers or change the port.")
        else:
            raise

if __name__ == "__main__":
    main()

