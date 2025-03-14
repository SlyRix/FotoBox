// server/index.js
const express = require('express');
const cors = require('cors');
const {exec, spawn} = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

// Basic diagnostics
console.log('=== FOTOBOX SERVER DIAGNOSTICS ===');
try {
    exec('gphoto2 --version', (error, stdout) => {
        if (error) {
            console.log(`gphoto2 available: NO - ${error.message}`);
        } else {
            console.log(`gphoto2 available: YES - ${stdout.split('\n')[0]}`);
        }
    });
} catch (err) {
    console.log(`gphoto2 available: NO - ${err.message}`);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Track ongoing captures to prevent conflicts
const captureInProgress = {status: false};

// Directory paths
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');
const QR_DIR = path.join(__dirname, 'public', 'qrcodes');

// Create required directories
[PHOTOS_DIR, QR_DIR].forEach(dir => {
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

// WebSocket server for video streaming
let wsServer;
let videoStreamProcess = null;
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
                if (data.type === 'startStream') {
                    // Start streaming if not already streaming for this client
                    const clientInfo = activeStreams.get(clientId);
                    if (clientInfo && !clientInfo.isStreaming && !captureInProgress.status) {
                        clientInfo.isStreaming = true;
                        activeStreams.set(clientId, clientInfo);
                        startVideoStream(clientId);
                    }
                } else if (data.type === 'stopStream') {
                    // Stop streaming for this client
                    const clientInfo = activeStreams.get(clientId);
                    if (clientInfo && clientInfo.isStreaming) {
                        clientInfo.isStreaming = false;
                        activeStreams.set(clientId, clientInfo);
                        stopVideoStream(clientId);
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
            stopVideoStream(clientId);
            activeStreams.delete(clientId);

            // Check if we need to kill the shared stream
            checkAndKillStream();
        });
    });
}

// Check if any clients are still streaming, and if not, kill the stream
function checkAndKillStream() {
    let hasActiveStreamers = false;

    for (const [_, clientInfo] of activeStreams) {
        if (clientInfo.isStreaming) {
            hasActiveStreamers = true;
            break;
        }
    }

    if (!hasActiveStreamers && videoStreamProcess) {
        console.log('No active streamers, killing video stream process');
        videoStreamProcess.kill();
        videoStreamProcess = null;
    }
}

// Stop video streaming for a client
function stopVideoStream(clientId) {
    const clientInfo = activeStreams.get(clientId);
    if (!clientInfo) return;

    console.log(`Stopping video stream for client ${clientId}`);

    // Mark this client as not streaming
    clientInfo.isStreaming = false;

    // Notify client that their stream is stopping
    if (clientInfo.ws.readyState === WebSocket.OPEN) {
        clientInfo.ws.send(JSON.stringify({
            type: 'streamStatus',
            status: 'stopped',
            message: 'Camera stream stopped'
        }));
    }

    // Check if we need to kill the shared stream process
    checkAndKillStream();
}

// Add a new flag to track if a stream is in the process of starting
let streamStarting = false;

function startVideoStream(clientId) {
    const clientInfo = activeStreams.get(clientId);
    if (!clientInfo) return;

    console.log(`Starting video stream for client ${clientId}`);

    // Notify client that stream is starting
    clientInfo.ws.send(JSON.stringify({
        type: 'streamStatus',
        status: 'starting',
        message: 'Starting camera stream...'
    }));

    // If a stream is already running, just mark this client as streaming
    if (videoStreamProcess) {
        console.log(`Stream already running, adding client ${clientId} to existing stream`);
        clientInfo.ws.send(JSON.stringify({
            type: 'streamStatus',
            status: 'active',
            message: 'Camera stream active'
        }));
        return;
    }

    // If a stream is currently in the process of starting, don't try to start another one
    if (streamStarting) {
        console.log(`Stream is already starting, waiting for it to initialize`);
        // Mark client as streaming so they'll receive frames once the stream is ready
        return;
    }

    // Set flag to prevent multiple simultaneous starts
    streamStarting = true;

    // Create a temporary directory for the image files if needed
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
        fs.mkdirSync(tmpDir, { recursive: true });
    }

    // Try an alternative approach: save frames to disk first
    try {
        console.log('Starting camera stream using file-based approach...');

        // First generate a unique identifier for this stream session
        const streamId = Date.now().toString();
        const outputPath = path.join(tmpDir, `stream_${streamId}_%04d.jpg`);

        // Run gphoto2 to capture frames to files instead of trying to pipe directly
        const gphoto2Process = spawn('gphoto2', [
            '--capture-movie',
            '--filename', outputPath,
            '--frames', '9999'  // High number that will be interrupted later
        ]);

        // Set up error handlers for gphoto2
        gphoto2Process.on('error', (err) => {
            console.error(`Error starting gphoto2: ${err.message}`);
            broadcastStreamError(`Failed to start camera: ${err.message}`);
            streamStarting = false;
        });

        gphoto2Process.stderr.on('data', (data) => {
            const stderr = data.toString();
            console.log(`gphoto2 stderr: ${stderr}`);

            // Check for common errors
            if (stderr.includes('ERROR') && !stderr.includes('select timeout')) {
                broadcastStreamError(`Camera error: ${stderr}`);
            }

            // When we see this message, we know gphoto2 has started capturing
            if (stderr.includes('Capturing preview frames')) {
                console.log('gphoto2 has started capturing frames');

                // Give it a moment to capture at least one frame
                setTimeout(() => {
                    // Start the ffmpeg process to read the images
                    const ffmpegProcess = spawn('ffmpeg', [
                        '-pattern_type', 'glob',
                        '-i', path.join(tmpDir, `stream_${streamId}_*.jpg`),
                        '-f', 'mjpeg',
                        '-c:v', 'mjpeg',
                        '-q:v', '5',
                        '-r', '15',
                        '-fflags', 'nobuffer',
                        '-flags', 'low_delay',
                        '-tune', 'zerolatency',
                        'pipe:1'
                    ]);

                    // Store the combined process for later cleanup
                    videoStreamProcess = {
                        gphoto2: gphoto2Process,
                        ffmpeg: ffmpegProcess,
                        streamId: streamId,
                        kill: function() {
                            gphoto2Process.kill();
                            ffmpegProcess.kill();
                            // Clean up temporary files
                            try {
                                const files = fs.readdirSync(tmpDir);
                                files.filter(file => file.startsWith(`stream_${streamId}_`))
                                    .forEach(file => fs.unlinkSync(path.join(tmpDir, file)));
                            } catch (err) {
                                console.error(`Error cleaning up stream files: ${err}`);
                            }
                        }
                    };

                    // Handle ffmpeg error and exit
                    ffmpegProcess.on('error', (err) => {
                        console.error(`Error starting ffmpeg: ${err.message}`);
                        broadcastStreamError(`Failed to process video stream: ${err.message}`);
                        if (videoStreamProcess) {
                            videoStreamProcess.kill();
                            videoStreamProcess = null;
                        }
                        streamStarting = false;
                    });

                    ffmpegProcess.on('exit', (code, signal) => {
                        if (code !== 0 && code !== null) {
                            console.error(`ffmpeg process exited with code ${code}`);
                        }
                        if (videoStreamProcess) {
                            videoStreamProcess = null;
                        }
                        streamStarting = false;
                    });

                    // More detailed logging for ffmpeg stderr
                    ffmpegProcess.stderr.on('data', (data) => {
                        const stderrText = data.toString();
                        // Log errors but not all the usual ffmpeg output
                        if (stderrText.includes('Error') || stderrText.includes('error') ||
                            stderrText.includes('Invalid') || stderrText.includes('Failed')) {
                            console.error(`ffmpeg error: ${stderrText}`);
                        } else if (Math.random() < 0.01) { // Log occasional info
                            console.log(`ffmpeg info: ${stderrText.substring(0, 100)}...`);
                        }
                    });

                    // Process video frames from ffmpeg stdout
                    ffmpegProcess.stdout.on('data', (data) => {
                        // Send frames to all active streaming clients
                        for (const [id, client] of activeStreams) {
                            if (client.isStreaming && client.ws.readyState === WebSocket.OPEN) {
                                try {
                                    client.ws.send(data);
                                } catch (err) {
                                    console.error(`Error sending frame to client ${id}: ${err.message}`);
                                }
                            }
                        }
                    });

                    // Stream is now active
                    streamStarting = false;

                    // Notify all streaming clients that stream is active
                    for (const [id, client] of activeStreams) {
                        if (client.isStreaming && client.ws.readyState === WebSocket.OPEN) {
                            client.ws.send(JSON.stringify({
                                type: 'streamStatus',
                                status: 'active',
                                message: 'Camera stream active'
                            }));
                        }
                    }
                }, 2000); // Wait 2 seconds for some files to be created
            }
        });

        gphoto2Process.on('exit', (code, signal) => {
            if (code !== 0 && code !== null) {
                console.error(`gphoto2 process exited with code ${code}`);
                broadcastStreamError(`Camera stream ended unexpectedly (code ${code})`);
            }
            if (videoStreamProcess) {
                videoStreamProcess.kill();
                videoStreamProcess = null;
            }
            streamStarting = false;
        });

        // Timeout in case gphoto2 never initializes
        setTimeout(() => {
            if (streamStarting) {
                console.error('Camera stream initialization timed out');
                broadcastStreamError('Camera failed to initialize within expected time');
                if (gphoto2Process) {
                    gphoto2Process.kill();
                }
                streamStarting = false;
            }
        }, 15000); // 15 second timeout

    } catch (error) {
        console.error(`Failed to start video stream: ${error.message}`);
        broadcastStreamError(`Failed to start camera stream: ${error.message}`);
        streamStarting = false;
    }
}
// Broadcast stream error to all connected clients
function broadcastStreamError(message) {
    for (const [_, client] of activeStreams) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify({
                type: 'streamError',
                message: message
            }));
        }
    }
}

// API Endpoints
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

// Take a new photo - with improved error handling
app.post('/api/photos/capture', (req, res) => {
    // Prevent multiple simultaneous capture requests
    if (captureInProgress.status) {
        return res.status(429).json({
            success: false,
            error: 'A photo capture is already in progress. Please try again in a moment.'
        });
    }

    captureInProgress.status = true;

    // Stop video streaming during photo capture
    const wasStreaming = videoStreamProcess !== null;
    if (wasStreaming) {
        console.log('Stopping video stream for photo capture');
        videoStreamProcess.kill();
        videoStreamProcess = null;

        // Notify all clients that stream is paused for photo capture
        for (const [_, client] of activeStreams) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                    type: 'streamStatus',
                    status: 'paused',
                    message: 'Camera stream paused for photo capture'
                }));
            }
        }
    }

    // Generate unique filename based on timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wedding_${timestamp}.jpg`;
    const filepath = path.join(PHOTOS_DIR, filename);

    console.log(`Taking photo: ${filename}`);

    // Build the gphoto2 command
    const captureCommand = `gphoto2 --force-overwrite --capture-image-and-download --filename "${filepath}"`;

    exec(captureCommand, (error, stdout, stderr) => {
        captureInProgress.status = false;

        if (error || stderr.includes('ERROR')) {
            console.error(`Error capturing photo: ${error ? error.message : stderr}`);

            // Don't automatically restart streaming
            // We'll let the client decide when to restart the stream

            return res.status(500).json({
                success: false,
                error: 'Failed to capture photo'
            });
        }

        console.log(`Photo captured successfully: ${filename}`);

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

            // Don't automatically restart streaming
            // We'll let the client decide when to restart the stream

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

// Helper function to restart video stream after photo capture
function restartVideoStream() {
    console.log('Restarting video stream after photo capture');

    // Find any client that was streaming before
    let restartForClientId = null;
    for (const [id, client] of activeStreams) {
        if (client.isStreaming) {
            restartForClientId = id;
            break;
        }
    }

    // If we found a client, restart the stream
    if (restartForClientId) {
        setTimeout(() => {
            startVideoStream(restartForClientId);
        }, 1000); // Short delay to let the camera recover
    }
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
    if (videoStreamProcess) {
        videoStreamProcess.kill();
    }
    process.exit();
});