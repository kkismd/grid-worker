#!/usr/bin/env node

// server.js - Simple HTTP server for Grid Worker

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = http.createServer((req, res) => {
    // リクエストされたファイルパスを取得
    let filePath = '.' + (req.url === '/' ? '/index.html' : req.url);
    
    // ファイル拡張子を取得
    const extname = path.extname(filePath).toLowerCase();
    
    // MIMEタイプのマッピング
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.woff2': 'application/font-woff2',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm',
        '.ws': 'text/plain' // WorkerScript ファイル
    };
    
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    // CORS ヘッダーを追加（開発用）
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    
    // OPTIONSリクエストの処理（CORS プリフライト）
    if (req.method === 'OPTIONS') {
        res.writeHead(200, corsHeaders);
        res.end();
        return;
    }
    
    // ファイルを読み込んで送信
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                // 404 Not Found
                res.writeHead(404, { 
                    'Content-Type': 'text/html',
                    ...corsHeaders 
                });
                res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>404 Not Found</title>
</head>
<body>
    <h1>404 Not Found</h1>
    <p>The requested file <code>${req.url}</code> was not found.</p>
    <p><a href="/">← Back to Grid Worker</a></p>
</body>
</html>
                `, 'utf-8');
            } else {
                // 500 Server Error
                res.writeHead(500, {
                    'Content-Type': 'text/plain',
                    ...corsHeaders
                });
                res.end(`Server Error: ${error.code}\n`);
            }
        } else {
            // ファイル送信成功
            res.writeHead(200, { 
                'Content-Type': contentType,
                ...corsHeaders
            });
            res.end(content, 'utf-8');
        }
    });
});

// ポート設定
const PORT = process.env.PORT || 3000;

// サーバー起動
server.listen(PORT, () => {
    console.log('🚀 Grid Worker Server running at:');
    console.log(`   http://localhost:${PORT}`);
    console.log('');
    console.log('💡 Features:');
    console.log('   • Interactive WorkerScript editor');
    console.log('   • Multi-worker execution');
    console.log('   • Keyboard input support ($=key)');
    console.log('   • Real-time grid visualization');
    console.log('');
    console.log('Press Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Grid Worker Server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n👋 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});