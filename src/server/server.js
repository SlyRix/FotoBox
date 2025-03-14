// server/index.js
const express = require('express');
const cors = require('cors');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 5000;

// Track ongoing captures to prevent conflicts
const captureInProgress = { status: false };

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create photos directory if it doesn't exist
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');
if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}

// Create QR codes directory if it doesn't exist
const QR_DIR = path.join(__dirname, 'public', 'qrcodes');
if (!fs.existsSync(QR_DIR)) {
    fs.mkdirSync(QR_DIR, { recursive: true });
}

// Live view WebSocket setup
let wsServer;
let liveViewProcess = null;
let activeConnections = 0;

// Initialize WebSocket server
function setupWebSocketServer(server) {
    console.log('Setting up WebSocket server...');

    // Create WebSocket server without a specific path (connects at root level)
    wsServer = new WebSocket.Server({
        server: server
    });

    wsServer.on('connection', (ws, req) => {
        activeConnections++;
        console.log(`New WebSocket connection from ${req.socket.remoteAddress}`);
        console.log(`Active connections: ${activeConnections}`);

        // Start live view stream if it's not already running
        if (liveViewProcess === null) {
            startLiveView();
        }

        ws.on('close', () => {
            activeConnections--;
            console.log(`Active connections: ${activeConnections}`);

            // If no clients are connected, stop the live view process
            if (activeConnections === 0 && liveViewProcess !== null) {
                stopLiveView();
            }
        });
    });
}

function stopLiveView() {
    if (liveViewProcess) {
        console.log('Stopping live view process...');
        liveViewProcess.kill('SIGINT');  // You can use 'SIGTERM' or 'SIGKILL' if necessary
        liveViewProcess = null;  // Clean up after killing the process
    }
}

function startLiveView() {
    console.log('Starting live view stream...');
    const captureCommand = 'gphoto2 --stdout --capture-movie';
    try {
        liveViewProcess = spawn(captureCommand, {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        liveViewProcess.stdout.on('data', (data) => {
            if (wsServer.clients.size > 0) {
                wsServer.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        let base64Data = data.toString('base64');
                        client.send(JSON.stringify({ type: 'liveview', image: base64Data }));
                    }
                });
            }
        });

    } catch (error) {
        console.error('Error starting live view:', error);
    }
}

// API Endpoints

// Get list of all photos
app.get('/api/photos', (req, res) => {
    fs.readdir(PHOTOS_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to retrieve photos' });
        }

        const photoFiles = files.filter(file =>
            /\.(jpg|jpeg|png)$/i.test(file)
        );

        const photos = photoFiles.map(file => {
            const stats = fs.statSync(path.join(PHOTOS_DIR, file));
            return {
                filename: file,
                url: `/photos/${file}`,
                qrUrl: `/qrcodes/qr_${file.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`,
                timestamp: stats.mtime.getTime()
            };
        }).sort((a, b) => b.timestamp - a.timestamp);

        res.json(photos);
    });
});

// Take a new photo
app.post('/api/photos/capture', (req, res) => {
    if (captureInProgress.status) {
        return res.status(429).json({
            success: false,
            error: 'A photo capture is already in progress. Please try again in a moment.'
        });
    }

    captureInProgress.status = true;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wedding_${timestamp}.jpg`;
    const filepath = path.join(PHOTOS_DIR, filename);

    console.log(`${new Date().toISOString()}: Starting photo capture process...`);

    // Stop live view process if it's running to avoid conflicts
    if (liveViewProcess !== null) {
        stopLiveView();
    }

    const captureCommand = `gphoto2 --force-overwrite --capture-image-and-download --filename "${filepath}"`;

    exec(captureCommand, (error, stdout, stderr) => {
        captureInProgress.status = false;

        if (error || stderr.includes('ERROR')) {
            console.error(`${new Date().toISOString()}: Error capturing photo: ${error ? error.message : stderr}`);
            return res.status(500).json({
                success: false,
                error: 'Failed to capture photo'
            });
        }

        console.log(`${new Date().toISOString()}: Photo captured successfully: ${filename}`);

        // Generate QR code for this photo
        const photoUrl = `http://${req.headers.host}/photos/${filename}`;
        const qrFilename = `qr_${timestamp}.png`;
        const qrFilepath = path.join(QR_DIR, qrFilename);

        QRCode.toFile(qrFilepath, photoUrl, {
            color: {
                dark: '#000',
                light: '#FFF'
            }
        }, (qrErr) => {
            if (qrErr) {
                console.error(`${new Date().toISOString()}: Error generating QR code: ${qrErr.message}`);
            }

            res.json({
                success: true,
                photo: {
                    filename,
                    url: `/photos/${filename}`,
                    qrUrl: `/qrcodes/${qrFilename}`,
                    timestamp: Date.now()
                }
            });
        });
    });
});

// Delete a photo
app.delete('/api/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(PHOTOS_DIR, filename);

    fs.unlink(filepath, (err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete photo' });
        }

        res.json({ success: true, message: 'Photo deleted successfully' });
    });
});

// Create HTTP server and attach WebSocket server
const server = http.createServer(app);
setupWebSocketServer(server);

// Start the server
server.listen(PORT, () => {
    console.log(`${new Date().toISOString()}: Server running on port ${PORT}`);
    console.log(`${new Date().toISOString()}: Photos directory: ${PHOTOS_DIR}`);
    console.log(`${new Date().toISOString()}: QR codes directory: ${QR_DIR}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    stopLiveView();
    process.exit();
});
