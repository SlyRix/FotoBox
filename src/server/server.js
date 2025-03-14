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
app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (like mobile apps, curl requests)
        if (!origin) return callback(null, true);

        // List of allowed origins
        const allowedOrigins = [
            'http://localhost:3000',
            'https://localhost:3000',
            'http://fotobox.slyrix.com',
            'https://fotobox.slyrix.com'
        ];

        if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
            callback(null, true);
        } else {
            console.log('CORS blocked request from:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create photos directory if it doesn't exist
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');
if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true });
}
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    next();
});
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
// Replace your WebSocket server setup with this:
function setupWebSocketServer(server) {
    console.log('=== SETTING UP WEBSOCKET SERVER ===');

    // Create WebSocket server
    wsServer = new WebSocket.Server({
        server: server,
        // Don't specify a path to use root level connection
    });

    console.log(`WebSocket server created on port ${PORT}: ${wsServer ? 'YES' : 'NO'}`);

    // Log server events
    wsServer.on('listening', () => {
        console.log(`WebSocket server now listening on port ${PORT}`);
    });

    wsServer.on('error', (error) => {
        console.error('⚠️ WebSocket SERVER ERROR:', error.message);
    });

    // Handle client connections
    wsServer.on('connection', (ws, req) => {
        // Enhanced connection logging
        const clientIp = req.socket.remoteAddress;
        const origin = req.headers.origin || 'Unknown';

        console.log(`➕ NEW WebSocket connection from ${clientIp} (Origin: ${origin})`);
        console.log(`Headers: ${JSON.stringify(req.headers)}`);

        activeConnections++;
        console.log(`Active connections: ${activeConnections}`);

        // Start live view if needed
        if (liveViewProcess === null) {
            console.log('Starting live view due to new connection');
            resetLiveViewRetries(); // Reset retries on new connection
            startLiveView();
        }

        // Send welcome message to confirm connection
        try {
            ws.send(JSON.stringify({
                type: 'info',
                message: 'Connection established successfully',
                timestamp: Date.now()
            }));
            console.log('Sent welcome message to client');
        } catch (e) {
            console.error('Error sending welcome message:', e.message);
        }

        // Handle client messages
        ws.on('message', (message) => {
            try {
                const parsedMessage = JSON.parse(message);
                console.log(`Received client message: ${JSON.stringify(parsedMessage)}`);

                // Handle ping messages to keep connection alive
                if (parsedMessage.type === 'ping') {
                    ws.send(JSON.stringify({
                        type: 'pong',
                        timestamp: Date.now()
                    }));
                }
            } catch (e) {
                console.log(`Received raw message: ${message}`);
            }
        });

        // Handle disconnection
        ws.on('close', (code, reason) => {
            console.log(`➖ Client disconnected with code ${code}, reason: ${reason || 'none provided'}`);
            activeConnections--;
            console.log(`Active connections: ${activeConnections}`);

            // Stop live view if no clients connected
            if (activeConnections === 0 && liveViewProcess !== null) {
                console.log('No active connections, stopping live view');
                stopLiveView();
            }
        });

        // Handle errors
        ws.on('error', (error) => {
            console.error('WebSocket client error:', error.message);
        });
    });
}

function stopLiveView() {
    if (liveViewProcess) {
        console.log('Stopping live view process...');

        // Send a termination signal
        liveViewProcess.kill('SIGINT');  // You can use 'SIGTERM' or 'SIGKILL' if necessary

        // Wait for the process to exit or timeout
        liveViewProcess.on('exit', (code) => {
            if (code === 0) {
                console.log('Live view process ended successfully.');
            } else {
                console.log(`Live view process ended with error code: ${code}`);
            }
        });

        liveViewProcess = null;  // Clean up after killing the process
    } else {
        console.log('No live view process to stop.');
    }
}

// Start the live view process

let liveViewRetries = 0;
const maxLiveViewRetries = 5;
const liveViewCooldown = 3000;

function startLiveView() {
    if (liveViewProcess !== null) {
        console.log('Live view process already running, not starting a new one');
        return;
    }

    if (liveViewRetries >= maxLiveViewRetries) {
        console.log(`Max live view retries reached (${maxLiveViewRetries}). Waiting for manual reset...`);

        // Set a timeout to reset the retry counter after 2 minutes
        setTimeout(() => {
            console.log('Resetting live view retry counter');
            liveViewRetries = 0;
        }, 120000); // 2 minutes cooldown

        return;
    }

    console.log(`Starting live view stream (Attempt #${liveViewRetries + 1})...`);

    try {
        const captureCommand = 'gphoto2 --stdout --capture-movie';
        console.log(`Executing command: ${captureCommand}`);

        liveViewProcess = spawn(captureCommand, {
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        console.log(`Process spawned with PID: ${liveViewProcess.pid}`);
        liveViewRetries++;

        let errorOutput = '';
        let frameBuffer = Buffer.alloc(0);
        let frameStartMarker = false;
        let currentFrameSize = 0;

        liveViewProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            console.log(`Live view stderr: ${data.toString().trim()}`);

            if (errorOutput.includes('Could not claim the USB device')) {
                console.error('Live view failed: Camera is busy. Retrying after cooldown...');
                stopLiveView();

                setTimeout(() => {
                    startLiveView();
                }, liveViewCooldown);
            }
        });

        liveViewProcess.on('close', (code) => {
            console.log(`Live view process exited with code ${code}`);
            liveViewProcess = null;

            if (code !== 0 && liveViewRetries < maxLiveViewRetries) {
                console.log(`Retrying live view in ${liveViewCooldown / 1000} seconds...`);
                setTimeout(startLiveView, liveViewCooldown);
            }
        });

        liveViewProcess.on('error', (err) => {
            console.error('Failed to start live view process:', err);
            liveViewProcess = null;

            if (liveViewRetries < maxLiveViewRetries) {
                console.log(`Retrying live view in ${liveViewCooldown / 1000} seconds...`);
                setTimeout(startLiveView, liveViewCooldown);
            }
        });

        // Improved frame processing using a frame boundary detection approach
        liveViewProcess.stdout.on('data', (data) => {
            try {
                // Add new data to our buffer
                frameBuffer = Buffer.concat([frameBuffer, data]);

                // Simple JPEG frame detection - look for JPEG SOI marker (0xFFD8) and EOI marker (0xFFD9)
                // This is a simple approach - a more robust one would parse the actual JPEG structure
                let frameStart = -1;
                let frameEnd = -1;

                // Look for a JPEG start marker
                for (let i = 0; i < frameBuffer.length - 1; i++) {
                    if (frameBuffer[i] === 0xFF && frameBuffer[i + 1] === 0xD8) {
                        frameStart = i;
                        break;
                    }
                }

                // If we found a start marker, look for an end marker
                if (frameStart !== -1) {
                    for (let i = frameStart + 2; i < frameBuffer.length - 1; i++) {
                        if (frameBuffer[i] === 0xFF && frameBuffer[i + 1] === 0xD9) {
                            frameEnd = i + 2; // Include the end marker
                            break;
                        }
                    }
                }

                // If we found a complete frame, process it
                if (frameStart !== -1 && frameEnd !== -1) {
                    const frameData = frameBuffer.slice(frameStart, frameEnd);

                    // Remove the processed frame from the buffer
                    frameBuffer = frameBuffer.slice(frameEnd);

                    // Send the frame to all connected clients
                    if (wsServer && wsServer.clients.size > 0) {
                        const frame = frameData.toString('base64');

                        wsServer.clients.forEach((client) => {
                            if (client.readyState === WebSocket.OPEN) {
                                try {
                                    client.send(JSON.stringify({
                                        type: 'frame',
                                        data: frame,
                                        timestamp: Date.now()
                                    }));
                                } catch (sendError) {
                                    console.error('Error sending frame to client:', sendError);
                                }
                            }
                        });
                    }

                    // Log occasionally to avoid filling logs
                    if (Math.random() < 0.01) {  // Log roughly 1% of frames
                        console.log(`Sent frame: ${frameData.length} bytes`);
                    }
                }

                // Safety check - if buffer gets too large without finding frames, reset it
                if (frameBuffer.length > 10000000) {  // 10MB limit
                    console.warn('Frame buffer grew too large without finding complete frames, resetting');
                    frameBuffer = Buffer.alloc(0);
                }
            } catch (processError) {
                console.error('Error processing live view frame:', processError);
            }
        });

    } catch (error) {
        console.error('Error starting live view:', error);
        liveViewProcess = null;
    }
}
function resetLiveViewRetries() {
    liveViewRetries = 0;
    console.log('Live view retry counter has been reset');

    // If we have connections but no live view, try starting it now
    if (activeConnections > 0 && liveViewProcess === null) {
        startLiveView();
    }
}


// API Endpoints
app.post('/api/liveview/reset', (req, res) => {
    resetLiveViewRetries();
    res.json({
        success: true,
        message: 'Live view retry counter has been reset'
    });
});

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

    const testProcess = spawn('gphoto2', ['--stdout', '--capture-movie', '--frames=1'], {
        timeout: 5000 // 5 second timeout
    });

    let dataReceived = false;
    let errorOutput = '';
    let responseSent = false;  // Flag to ensure only one response is sent

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

        if (!responseSent) {  // Check if response hasn't been sent yet
            responseSent = true;
            res.json({
                supported: true,
                message: 'Camera supports live view'
            });
        }
    });

    testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
    });

    testProcess.on('close', (code) => {
        clearTimeout(timeoutId);

        if (responseSent) return;  // Prevent response if already sent

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

        if (!responseSent) {  // Only respond if not already sent
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