// server/index.js
const express = require('express');
const cors = require('cors');
const { exec, spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

// Setup diagnostics to test WebSocket functionality
console.log('=== FOTOBOX SERVER DIAGNOSTICS ===');

// Check if WebSocket module is properly loaded
console.log(`WebSocket module loaded: ${typeof WebSocket !== 'undefined' ? 'YES' : 'NO'}`);

// Check if gphoto2 is available on the system
try {
    const gphotoVersion = execSync('gphoto2 --version').toString().trim();
    console.log(`gphoto2 available: YES - ${gphotoVersion.split('\n')[0]}`);
} catch (err) {
    console.log(`gphoto2 available: NO - ${err.message}`);
}

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

    console.log(`WebSocket server created successfully: ${wsServer ? 'YES' : 'NO'}`);

    // Log when the server is listening
    wsServer.on('listening', () => {
        console.log('WebSocket server is now listening for connections');
    });

    // Added error handler for WebSocket server
    wsServer.on('error', (error) => {
        console.error('WebSocket SERVER ERROR:', error);
    });

    wsServer.on('connection', (ws, req) => {
        // Log detailed connection info
        console.log(`New WebSocket connection from ${req.socket.remoteAddress}`);
        console.log(`Client headers: ${JSON.stringify(req.headers)}`);
        activeConnections++;
        console.log(`Active connections: ${activeConnections}`);

        // Start live view stream if it's not already running
        if (liveViewProcess === null) {
            console.log('Starting live view process due to new connection');
            startLiveView();
        }

        // Log all incoming messages (might be useful for debugging)
        ws.on('message', (message) => {
            console.log(`Received message from client: ${message}`);
        });

        ws.on('close', (code, reason) => {
            console.log(`Client disconnected with code ${code}, reason: ${reason || 'none provided'}`);
            activeConnections--;
            console.log(`Active connections: ${activeConnections}`);

            // If no clients are connected, stop the live view process
            if (activeConnections === 0 && liveViewProcess !== null) {
                console.log('No active connections, stopping live view');
                stopLiveView();
            }
        });

        ws.on('error', (error) => {
            console.error('WebSocket client error:', error);
        });

        // Send a test message to confirm connection works
        try {
            ws.send(JSON.stringify({ type: 'info', message: 'Connection established successfully' }));
            console.log('Sent welcome message to client');
        } catch (e) {
            console.error('Error sending welcome message:', e);
        }
    });
}

// Start the live view process
function startLiveView() {
    console.log('========================================');
    console.log('Starting live view stream...');


    try {
        // Using the command that works locally
        const captureCommand = 'gphoto2 --stdout --capture-movie --frames=30';
        console.log(`Executing command: ${captureCommand}`);

        liveViewProcess = spawn(captureCommand, {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        console.log(`Process spawned with PID: ${liveViewProcess.pid}`);

        let dataReceived = false;
        let errorOutput = '';

        liveViewProcess.stdout.on('data', (data) => {
            if (!dataReceived) {
                dataReceived = true;
                console.log(`First frame data received! Length: ${data.length} bytes`);
            }

            // Broadcast the frame data to all connected clients
            if (wsServer && wsServer.clients) {
                let clientCount = 0;
                wsServer.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        try {
                            client.send(data, { binary: true });
                            clientCount++;
                        } catch (e) {
                            console.error('Error sending frame to client:', e);
                        }
                    }
                });

                // Only log occasionally to avoid flooding console
                if (Math.random() < 0.01) {
                    console.log(`Sent frame to ${clientCount} clients`);
                }
            } else {
                if (Math.random() < 0.01) {
                    console.log('Frame received but no WebSocket server or clients available');
                }
            }
        });

        liveViewProcess.stderr.on('data', (data) => {
            // Collect error output
            errorOutput += data.toString();

            // Only log after collecting some output to avoid fragmentation
            if (errorOutput.length > 100 || errorOutput.includes('\n')) {
                console.error(`Live view stderr: ${errorOutput}`);
                errorOutput = '';
            }
        });

        liveViewProcess.on('close', (code) => {
            console.log(`Live view process exited with code ${code}`);
            console.log(`Remaining error output: ${errorOutput}`);
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
    console.log('Checking camera live view support with direct test...');

    // Instead of checking abilities, we'll directly test the capture-movie command
    // with a quick check that will timeout if not working
    const testProcess = spawn('gphoto2', ['--stdout', '--capture-movie', '--frames=1'], {
        timeout: 5000 // 5 second timeout
    });

    let dataReceived = false;
    let errorOutput = '';

    // Set a timeout to kill the process if it takes too long
    const timeoutId = setTimeout(() => {
        console.log('Live view check timed out - killing process');
        testProcess.kill();
    }, 5000);

    testProcess.stdout.on('data', (data) => {
        console.log(`Live view test received ${data.length} bytes - camera supports live view!`);
        dataReceived = true;

        // We got data, so live view is working
        clearTimeout(timeoutId);
        testProcess.kill();

        res.json({
            supported: true,
            message: 'Camera supports live view'
        });
    });

    testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    testProcess.on('close', (code) => {
        clearTimeout(timeoutId);

        // If we already sent a response, don't send another
        if (dataReceived) return;

        if (code === 0 || dataReceived) {
            res.json({
                supported: true,
                message: 'Camera supports live view'
            });
        } else {
            console.log(`Live view test exited with code ${code}`);
            console.log(`Error output: ${errorOutput}`);

            res.json({
                supported: false,
                message: 'Camera does not support live view or is not properly connected',
                details: errorOutput
            });
        }
    });

    testProcess.on('error', (err) => {
        clearTimeout(timeoutId);
        console.error('Error testing live view:', err);

        // Only send response if we haven't already
        if (!dataReceived) {
            res.json({
                supported: false,
                message: `Error testing live view: ${err.message}`
            });
        }
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