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
    // Create WebSocket server without a specific path (connects at root level)
    wsServer = new WebSocket.Server({
        server: server
    });

    wsServer.on('connection', (ws) => {
        console.log('New client connected to live view');
        activeConnections++;

        // Start live view stream if it's not already running
        if (liveViewProcess === null) {
            startLiveView();
        }

        ws.on('close', () => {
            console.log('Client disconnected from live view');
            activeConnections--;

            // If no clients are connected, stop the live view process
            if (activeConnections === 0 && liveViewProcess !== null) {
                stopLiveView();
            }
        });
    });
}

// Start the live view process
function startLiveView() {
    console.log('Starting live view stream...');

    try {
        // Using gphoto2 capture-movie mode to get live view frames
        // --stdout: Output to stdout instead of to a file
        // --frames: Number of frames to capture (0 = unlimited)
        // --no-keep: Don't keep file on camera
        // Note: You might need to remove 'sudo' if running without proper permissions
        const captureCommand = 'gphoto2 --stdout --capture-movie --frames=0 --no-keep';

        liveViewProcess = spawn(captureCommand, { shell: true });

        liveViewProcess.stdout.on('data', (data) => {
            console.log(`Received frame data: ${data.length} bytes`);
            // Broadcast the frame data to all connected clients
            if (wsServer) {
                wsServer.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(data);
                    }
                });
            }
        });

        liveViewProcess.stderr.on('data', (data) => {
            console.error(`Live view stderr: ${data}`);
            // Check for specific error messages
            if (data.toString().includes('not supported') ||
                data.toString().includes('error') ||
                data.toString().includes('failed')) {
                console.error('Camera does not support live view or encountered an error');
            }
        });

        liveViewProcess.on('close', (code) => {
            console.log(`Live view process exited with code ${code}`);
            liveViewProcess = null;
        });

        liveViewProcess.on('error', (err) => {
            console.error('Failed to start live view process:', err);
            liveViewProcess = null;
        });
    } catch (error) {
        console.error('Error starting live view:', error);
        liveViewProcess = null;
    }
}

// Stop the live view process
function stopLiveView() {
    if (liveViewProcess !== null) {
        console.log('Stopping live view stream...');
        liveViewProcess.kill('SIGTERM');
        liveViewProcess = null;
    }
}

// API Endpoints

// Get list of all photos
app.get('/api/photos', (req, res) => {
    fs.readdir(PHOTOS_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to retrieve photos' });
        }

        // Filter for image files
        const photoFiles = files.filter(file =>
            /\.(jpg|jpeg|png)$/i.test(file)
        );

        // Add timestamps and sort by most recent
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

// Take a new photo - with improved error handling and no excessive process killing
app.post('/api/photos/capture', (req, res) => {
    // Prevent multiple simultaneous capture requests
    if (captureInProgress.status) {
        return res.status(429).json({
            success: false,
            error: 'A photo capture is already in progress. Please try again in a moment.'
        });
    }

    captureInProgress.status = true;

    // Generate unique filename based on timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wedding_${timestamp}.jpg`;
    const filepath = path.join(PHOTOS_DIR, filename);

    console.log(`${new Date().toISOString()}: Starting photo capture process...`);

    // Stop live view process if it's running to avoid conflicts
    if (liveViewProcess !== null) {
        stopLiveView();
    }

    // Build the gphoto2 command with necessary parameters
    const captureCommand = `gphoto2 --force-overwrite --capture-image-and-download --filename "${filepath}"`;

    exec(captureCommand, (error, stdout, stderr) => {
        captureInProgress.status = false;

        if (error || stderr.includes('ERROR')) {
            console.error(`${new Date().toISOString()}: Error capturing photo: ${error ? error.message : stderr}`);

            // Check if we should suggest using tethering mode
            if (stderr.includes('Could not claim the USB device')) {
                return res.status(500).json({
                    success: false,
                    error: 'Camera busy or inaccessible. Try disconnecting and reconnecting the camera.'
                });
            }

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
                dark: '#000',  // Points
                light: '#FFF'  // Background
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

// Send print command (placeholder for future implementation)
app.post('/api/photos/print', (req, res) => {
    const { filename } = req.body;

    if (!filename) {
        return res.status(400).json({ error: 'Filename is required' });
    }

    // This is where you would implement the printing logic
    // For now, just return a success message
    console.log(`Print request received for: ${filename}`);

    res.json({
        success: true,
        message: 'Print request received. Printing functionality will be implemented later.'
    });
});

// Server status endpoint - simplified to avoid killing processes unnecessarily
app.get('/api/status', (req, res) => {
    exec('gphoto2 --auto-detect', (error, stdout, stderr) => {
        if (error) {
            return res.json({
                status: 'error',
                camera: false,
                message: 'Camera not detected'
            });
        }

        res.json({
            status: 'ok',
            camera: true,
            message: stdout.trim()
        });
    });
});

// Add API endpoint to check if live view is supported
app.get('/api/liveview/check', (req, res) => {
    exec('gphoto2 --abilities', (error, stdout, stderr) => {
        if (error) {
            return res.json({
                supported: false,
                message: 'Error checking camera capabilities'
            });
        }

        // Check if the camera supports capture-movie (live view)
        const supportsLiveView = stdout.includes('capture-movie');

        res.json({
            supported: supportsLiveView,
            message: supportsLiveView
                ? 'Camera supports live view'
                : 'Camera does not support live view or is not properly connected'
        });
    });
});

// Create HTTP server and attach WebSocket server
const server = http.createServer(app);
setupWebSocketServer(server);

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Photos directory: ${PHOTOS_DIR}`);
    console.log(`QR codes directory: ${QR_DIR}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    stopLiveView();
    process.exit();
});