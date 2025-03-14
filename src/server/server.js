// server/index.js
const express = require('express');
const cors = require('cors');
const {exec} = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

// Basic diagnostics
console.log('=== FOTOBOX SERVER DIAGNOSTICS ===');
try {
    exec('fswebcam --version', (error, stdout) => {
        if (error) {
            console.log(`fswebcam available: NO - ${error.message}`);
        } else {
            console.log(`fswebcam available: YES - ${stdout.split('\n')[0]}`);
        }
    });

    exec('v4l2-ctl --list-devices', (error, stdout) => {
        if (error) {
            console.log(`Webcam detection: FAILED - ${error.message}`);
        } else {
            console.log(`Webcam detection: SUCCESS`);
            console.log(stdout);
        }
    });

    exec('gphoto2 --version', (error, stdout) => {
        if (error) {
            console.log(`gphoto2 available: NO - ${error.message}`);
        } else {
            console.log(`gphoto2 available: YES - ${stdout.split('\n')[0]}`);
        }
    });
} catch (err) {
    console.log(`Camera diagnostics error: ${err.message}`);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Track ongoing captures to prevent conflicts
const captureInProgress = {status: false};

// Directory paths
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');
const QR_DIR = path.join(__dirname, 'public', 'qrcodes');
const PREVIEW_DIR = path.join(__dirname, 'public', 'preview');

// Create required directories
[PHOTOS_DIR, QR_DIR, PREVIEW_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {recursive: true});
    }
});

// Middleware
app.use(cors({
    origin: function (origin, callback) {
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

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    next();
});

// WebSocket server for webcam preview
let wsServer;
let previewInterval = null;
let activeStreams = new Map(); // Track active streaming clients

// Initialize WebSocket server
function setupWebSocketServer(server) {
    console.log('=== SETTING UP WEBSOCKET SERVER ===');

    wsServer = new WebSocket.Server({server});
    console.log(`WebSocket server created: ${wsServer ? 'YES' : 'NO'}`);

    wsServer.on('connection', (ws, req) => {
        const clientId = Date.now().toString();
        console.log(`New WebSocket connection from ${req.socket.remoteAddress} (ID: ${clientId})`);

        // Store client in our map
        activeStreams.set(clientId, {ws, isStreaming: false});

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'info',
            message: 'Connection established to FotoBox server',
            timestamp: Date.now()
        }));

        // Handle client messages
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                if (data.type === 'ping') {
                    ws.send(JSON.stringify({type: 'pong', timestamp: Date.now()}));
                    return;
                }

                // Handle stream start/stop requests
                if (data.type === 'startPreview') {
                    // Start streaming if not already streaming for this client
                    const clientInfo = activeStreams.get(clientId);
                    if (clientInfo && !clientInfo.isStreaming) {
                        clientInfo.isStreaming = true;
                        activeStreams.set(clientId, clientInfo);
                        startWebcamPreview();
                    }
                } else if (data.type === 'stopPreview') {
                    // Stop streaming for this client
                    const clientInfo = activeStreams.get(clientId);
                    if (clientInfo && clientInfo.isStreaming) {
                        clientInfo.isStreaming = false;
                        activeStreams.set(clientId, clientInfo);
                        stopWebcamPreview();
                    }
                }
            } catch (e) {
                console.log(`Received non-JSON message: ${message}`);
            }
        });

        // Handle client disconnect
        ws.on('close', () => {
            console.log(`Client disconnected (ID: ${clientId})`);

            // Cleanup this client's streams
            const clientInfo = activeStreams.get(clientId);
            if (clientInfo && clientInfo.isStreaming) {
                clientInfo.isStreaming = false;
                stopWebcamPreview();
            }

            activeStreams.delete(clientId);
        });
    });
}

// Start webcam preview
function startWebcamPreview() {
    // Check if any clients are actively streaming
    let hasActiveStreamers = false;
    for (const [_, client] of activeStreams) {
        if (client.isStreaming) {
            hasActiveStreamers = true;
            break;
        }
    }

    // If preview is already running or no active clients, do nothing
    if (previewInterval || !hasActiveStreamers) return;

    console.log('Starting webcam preview...');

    // Notify clients that preview is starting
    broadcastToStreamingClients({
        type: 'previewStatus',
        status: 'starting',
        message: 'Starting webcam preview...'
    });

    // Function to capture and send preview frame
    const capturePreviewFrame = () => {
        const timestamp = Date.now();
        const previewPath = path.join(PREVIEW_DIR, `preview_${timestamp}.jpg`);

        // Use fswebcam to capture image, optimized for your webcam's capabilities
        // Use 640x480 at higher frame rate for smooth preview
        exec(`fswebcam -d /dev/video0 -r 640x480 --fps 30 --no-banner ${previewPath}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error capturing preview: ${error.message}`);
                return;
            }

            // Check if file exists
            if (!fs.existsSync(previewPath)) {
                console.error('Preview file was not created');
                return;
            }

            // Read the captured image
            fs.readFile(previewPath, (err, imageData) => {
                if (err) {
                    console.error(`Error reading preview file: ${err.message}`);
                    return;
                }

                // Send to all active clients
                let activeClientCount = 0;
                for (const [_, client] of activeStreams) {
                    if (client.isStreaming && client.ws.readyState === WebSocket.OPEN) {
                        try {
                            // Convert to base64 for sending via WebSocket
                            const base64Image = imageData.toString('base64');
                            client.ws.send(JSON.stringify({
                                type: 'previewFrame',
                                imageData: `data:image/jpeg;base64,${base64Image}`,
                                timestamp
                            }));
                            activeClientCount++;
                        } catch (err) {
                            console.error(`Error sending preview to client: ${err.message}`);
                        }
                    }
                }

                // If no active clients, stop preview
                if (activeClientCount === 0) {
                    stopWebcamPreview();
                }

                // Delete the preview file to save space
                fs.unlink(previewPath, () => {});
            });
        });
    };

    // Send initial preview status
    broadcastToStreamingClients({
        type: 'previewStatus',
        status: 'active',
        message: 'Webcam preview active'
    });

    // Start the preview interval (capture every 500ms)
    previewInterval = setInterval(capturePreviewFrame, 500);

    // Capture first frame immediately
    capturePreviewFrame();
}

// Stop webcam preview
function stopWebcamPreview() {
    // Check if any clients are still streaming
    let hasActiveStreamers = false;
    for (const [_, client] of activeStreams) {
        if (client.isStreaming) {
            hasActiveStreamers = true;
            break;
        }
    }

    // If no active streamers and interval is running, stop it
    if (!hasActiveStreamers && previewInterval) {
        console.log('Stopping webcam preview (no active clients)');
        clearInterval(previewInterval);
        previewInterval = null;

        // Cleanup any temporary preview files
        fs.readdir(PREVIEW_DIR, (err, files) => {
            if (err) return;
            for (const file of files) {
                if (file.startsWith('preview_')) {
                    fs.unlink(path.join(PREVIEW_DIR, file), () => {});
                }
            }
        });
    }
}

// Helper function to broadcast to all streaming clients
function broadcastToStreamingClients(message) {
    for (const [_, client] of activeStreams) {
        if (client.isStreaming && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }
}

// API Endpoints
app.get('/api/status', (req, res) => {
    // Check webcam status
    exec('v4l2-ctl --list-devices', (webcamError, webcamStdout) => {
        let webcamStatus = {
            available: !webcamError,
            message: webcamError ? 'Webcam not detected' : webcamStdout.trim()
        };

        // Check camera status via gphoto2
        exec('gphoto2 --auto-detect', (cameraError, cameraStdout) => {
            let cameraStatus = {
                available: !cameraError && !cameraStdout.includes("There are no cameras"),
                message: cameraError ? 'Camera not detected' : cameraStdout.trim()
            };

            // Determine overall status
            const status = {
                status: 'ok',
                webcam: webcamStatus,
                camera: cameraStatus,
                message: 'Ready for preview and capture',
                preferCamera: true // Signal to client to use camera for final photos
            };

            // If neither are available, status is error
            if (!webcamStatus.available && !cameraStatus.available) {
                status.status = 'error';
                status.message = 'No capture devices available';
            }
            // If only webcam is available
            else if (!cameraStatus.available) {
                status.message = 'Webcam only mode (no camera detected)';
                status.preferCamera = false;
            }
            // If only camera is available
            else if (!webcamStatus.available) {
                status.message = 'Camera detected but no webcam for preview';
            }

            res.json(status);
        });
    });
});

// Get list of all photos
app.get('/api/photos', (req, res) => {
    fs.readdir(PHOTOS_DIR, (err, files) => {
        if (err) {
            return res.status(500).json({error: 'Failed to retrieve photos'});
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

// Take a new photo - using gphoto2 for final capture
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

    console.log(`Taking photo with camera: ${filename}`);

    // Stop preview during capture
    const wasPreviewActive = previewInterval !== null;
    if (wasPreviewActive) {
        clearInterval(previewInterval);
        previewInterval = null;

        // Notify clients that preview is paused for photo capture
        broadcastToStreamingClients({
            type: 'previewStatus',
            status: 'paused',
            message: 'Preview paused while taking photo'
        });
    }

    // Build the gphoto2 command for high quality camera capture
    const captureCommand = `gphoto2 --force-overwrite --capture-image-and-download --filename "${filepath}"`;

    exec(captureCommand, (error, stdout, stderr) => {
        // Resume preview if it was active
        if (wasPreviewActive) {
            setTimeout(() => {
                startWebcamPreview();
                broadcastToStreamingClients({
                    type: 'previewStatus',
                    status: 'active',
                    message: 'Preview resumed'
                });
            }, 1500); // Short delay to allow camera to recover
        }

        captureInProgress.status = false;

        if (error || stderr.includes('ERROR')) {
            console.error(`Error capturing photo: ${error ? error.message : stderr}`);

            // If gphoto2 fails, fall back to webcam as backup
            const fallbackCommand = `fswebcam -d /dev/video0 -r 1920x1080 --fps 30 --no-banner -S 3 -F 3 --jpeg 95 "${filepath}"`;

            exec(fallbackCommand, (fbError, fbStdout, fbStderr) => {
                if (fbError) {
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to capture photo with both camera and webcam'
                    });
                }

                console.log(`Photo captured with webcam as fallback`);
                generateQRAndRespond(req, res, filename, timestamp);
            });

            return;
        }

        console.log(`Photo captured successfully with camera: ${filename}`);
        generateQRAndRespond(req, res, filename, timestamp);
    });
});

// Helper function to generate QR code and send response
function generateQRAndRespond(req, res, filename, timestamp) {
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
            console.error(`Error generating QR code: ${qrErr.message}`);
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
}

// Delete a photo
app.delete('/api/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(PHOTOS_DIR, filename);

    fs.unlink(filepath, (err) => {
        if (err) {
            return res.status(500).json({error: 'Failed to delete photo'});
        }

        res.json({success: true, message: 'Photo deleted successfully'});
    });
});

// Send print command (placeholder for future implementation)
app.post('/api/photos/print', (req, res) => {
    const {filename} = req.body;

    if (!filename) {
        return res.status(400).json({error: 'Filename is required'});
    }

    // This is where you would implement the printing logic
    console.log(`Print request received for: ${filename}`);

    res.json({
        success: true,
        message: 'Print request received. Printing functionality will be implemented later.'
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
    if (previewInterval) {
        clearInterval(previewInterval);
    }
    process.exit();
});