#!/usr/bin/env node
/**
 * Frontend HTTP Server (Node.js)
 * Serves the HTML/CSS/JavaScript files for the voice bot interface
 * 
 * Usage: node server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8000;
const FRONTEND_DIR = __dirname;

// MIME types for serving static files
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });
        res.end();
        return;
    }

    // Get the file path
    let filePath = path.join(FRONTEND_DIR, req.url === '/' ? 'index.html' : req.url);
    
    // Remove query strings
    filePath = filePath.split('?')[0];

    // Security: prevent directory traversal
    if (!filePath.startsWith(FRONTEND_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // Get file extension and MIME type
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Read and serve the file
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
            return;
        }

        // Set headers including CORS and required headers for audio worklets
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            // Required for audio worklets (microphone access)
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin'
        });
        res.end(content);
    });
});

// Open browser based on platform
function openBrowser(url) {
    const platform = process.platform;
    let command;
    
    if (platform === 'darwin') {
        command = `open "${url}"`;
    } else if (platform === 'win32') {
        command = `start "${url}"`;
    } else {
        command = `xdg-open "${url}"`;
    }
    
    exec(command, (err) => {
        if (err) {
            console.log('⚠️  Could not open browser automatically. Please open manually.');
        }
    });
}

server.listen(PORT, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌐 Frontend Server (UI) - Node.js');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📡 Server: http://localhost:${PORT}`);
    console.log(`📁 Serving: ${FRONTEND_DIR}`);
    console.log('🔗 Opening browser...');
    console.log('📝 Press Ctrl+C to stop');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Open browser automatically
    openBrowser(`http://localhost:${PORT}`);
    
    console.log('✅ Frontend ready! Browser should open automatically.');
    console.log('💡 Make sure backend server is also running on port 8001\n');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n👋 Frontend server stopped.');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 Frontend server stopped.');
    process.exit(0);
});
