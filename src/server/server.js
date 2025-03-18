// server.js - Complete implementation for the FotoBox server

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');
const compression = require('compression');
const sharp = require('sharp');
const multer = require('multer');
const url = require('url');
const os = require('os');

// Configure multer for file uploads
const upload = multer({
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Photo counter for mosaic regeneration
let photoCounter = 0;
const MOSAIC_PHOTO_INTERVAL = 10; // Regenerate mosaic every 10 photos

// Flag to track ongoing photo captures
const captureInProgress = { status: false };

// Create express app
const app = express();
const PORT = process.env.PORT || 5000;

// Define directory paths
const PHOTOS_DIR = path.join(__dirname, 'public', 'photos');
const QR_DIR = path.join(__dirname, 'public', 'qrcodes');
const PREVIEW_DIR = path.join(__dirname, 'public', 'preview');
const THUMBNAILS_DIR = path.join(__dirname, 'public', 'thumbnails');
const OVERLAYS_DIR = path.join(__dirname, 'public', 'overlays');
const INSTAGRAM_DIR = path.join(PHOTOS_DIR, 'instagram');
const WEDDING_DIR = path.join(PHOTOS_DIR, 'wedding');
const TMP_DIR = path.join(os.tmpdir(), 'fotobox');

// Create required directories
[PHOTOS_DIR, QR_DIR, PREVIEW_DIR, THUMBNAILS_DIR, OVERLAYS_DIR, INSTAGRAM_DIR, WEDDING_DIR, TMP_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Basic diagnostics on startup
console.log('=== FOTOBOX SERVER DIAGNOSTICS ===');
try {
    // Check if fswebcam is available
    exec('fswebcam --version', (error, stdout) => {
        if (error) {
            console.log(`fswebcam available: NO - ${error.message}`);
        } else {
            console.log(`fswebcam available: YES - ${stdout.split('\n')[0]}`);
        }
    });

    // Check for webcam devices
    exec('v4l2-ctl --list-devices', (error, stdout) => {
        if (error) {
            console.log(`Webcam detection: FAILED - ${error.message}`);
        } else {
            console.log(`Webcam detection: SUCCESS`);
            console.log(stdout);
        }
    });

    // Check if gphoto2 is available for DSLR camera support
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

// Configure middleware
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (e.g., mobile apps, curl)
        if (!origin) return callback(null, true);

        // Allow specific origins
        const allowedOrigins = [
            'http://localhost:3000',
            'https://localhost:3000',
            'http://fotobox.slyrix.com',
            'https://fotobox.slyrix.com'
        ];

        if (allowedOrigins.indexOf(origin) !== -1) {
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

// Enable compression for responses
app.use(compression());

// Parse JSON request bodies
app.use(bodyParser.json());

// Serve static files with caching
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static assets for 1 day
    setHeaders: (res, path) => {
        // Set longer cache for photos and thumbnails
        if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png')) {
            res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
        }
    }
}));

// Set CORS headers for all responses
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin);
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    next();
});

// WebSocket server variables
let wsServer;
let previewInterval = null;
let activeStreams = new Map(); // Track active streaming clients

// Initialize WebSocket server for real-time communication
function setupWebSocketServer(server) {
    console.log('=== SETTING UP WEBSOCKET SERVER ===');

    wsServer = new WebSocket.Server({ server });
    console.log(`WebSocket server created: ${wsServer ? 'YES' : 'NO'}`);

    wsServer.on('connection', (ws, req) => {
        const clientId = Date.now().toString();
        const clientIp = req.socket.remoteAddress;
        console.log(`New WebSocket connection from ${clientIp} (ID: ${clientId})`);

        // Store client in map with streaming status
        activeStreams.set(clientId, { ws, isStreaming: false });

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'info',
            message: 'Connection established to FotoBox server',
            timestamp: Date.now()
        }));

        // Handle messages from client
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);

                // Handle ping/keepalive
                if (data.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    return;
                }

                // Handle preview streaming requests
                if (data.type === 'startPreview') {
                    const clientInfo = activeStreams.get(clientId);
                    if (clientInfo && !clientInfo.isStreaming) {
                        clientInfo.isStreaming = true;
                        activeStreams.set(clientId, clientInfo);
                        startWebcamPreview();
                    }
                } else if (data.type === 'stopPreview') {
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

            // Clean up client's streaming state
            const clientInfo = activeStreams.get(clientId);
            if (clientInfo && clientInfo.isStreaming) {
                clientInfo.isStreaming = false;
                stopWebcamPreview();
            }

            activeStreams.delete(clientId);
        });

        // Handle client errors
        ws.on('error', (error) => {
            console.error(`WebSocket error for client ${clientId}:`, error);
        });
    });
}

// Broadcast message to all streaming clients
function broadcastToStreamingClients(message) {
    for (const [_, client] of activeStreams) {
        if (client.isStreaming && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify(message));
            } catch (error) {
                console.error('Error broadcasting to client:', error);
            }
        }
    }
}

// Start webcam preview via WebSocket
function startWebcamPreview() {
    // Check if any clients are actively streaming
    let hasActiveStreamers = false;
    for (const [_, client] of activeStreams) {
        if (client.isStreaming) {
            hasActiveStreamers = true;
            break;
        }
    }

    // Do nothing if preview is already running or no active clients
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

        // Use fswebcam with optimized settings for smoother preview
        exec(`fswebcam -d /dev/video0 -r 320x240 --fps 30 --no-banner --skip 1 --jpeg 80 ${previewPath}`, (error, stdout, stderr) => {
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

    // Start the preview interval with a shorter interval for smoother preview
    previewInterval = setInterval(capturePreviewFrame, 200); // 5 fps

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

        if (typeof previewInterval === 'object' && previewInterval.stop) {
            previewInterval.stop();
        } else if (typeof previewInterval === 'number') {
            clearInterval(previewInterval);
        }

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

// Apply an overlay to an image
async function applyOverlayToImage(sourceImagePath, overlayImagePath, outputPath) {
    try {
        // Get dimensions of the input image
        const metadata = await sharp(sourceImagePath).metadata();

        // Resize overlay to match the input image dimensions
        const resizedOverlay = await sharp(overlayImagePath)
            .resize(metadata.width, metadata.height, {
                fit: 'fill'
            })
            .toBuffer();

        // Composite the images
        await sharp(sourceImagePath)
            .composite([
                { input: resizedOverlay, gravity: 'center' }
            ])
            .jpeg({ quality: 95 }) // Higher quality for better frame details
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error applying overlay:', error);
        return false;
    }
}

// Generate a thumbnail for a photo
async function generateThumbnail(sourceFilePath, filename) {
    // Create thumbnail directory if it doesn't exist
    if (!fs.existsSync(THUMBNAILS_DIR)) {
        fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);

    // Generate thumbnail only if it doesn't already exist
    if (!fs.existsSync(thumbnailPath)) {
        try {
            await sharp(sourceFilePath)
                .resize({
                    width: 300,
                    height: 200,
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255 }
                })
                .jpeg({ quality: 80, progressive: true })
                .toFile(thumbnailPath);

            console.log(`Thumbnail created: ${thumbnailPath}`);
            return `/thumbnails/thumb_${filename}`;
        } catch (err) {
            console.error(`Error generating thumbnail: ${err.message}`);
            return null;
        }
    }

    return `/thumbnails/thumb_${filename}`;
}

// Process photo with three formats: Standard, Instagram, and Wedding Frame
async function processPhotoWithThreeFormats(sourceFilePath, filename) {
    // Create required directories if they don't exist
    if (!fs.existsSync(INSTAGRAM_DIR)) {
        fs.mkdirSync(INSTAGRAM_DIR, { recursive: true });
    }
    if (!fs.existsSync(WEDDING_DIR)) {
        fs.mkdirSync(WEDDING_DIR, { recursive: true });
    }

    // Set up filenames and paths
    const instagramFilename = `instagram_${filename}`;
    const weddingFilename = `wedding_${filename}`;

    const instagramPath = path.join(INSTAGRAM_DIR, instagramFilename);
    const weddingPath = path.join(WEDDING_DIR, weddingFilename);
    const standardPath = path.join(PHOTOS_DIR, filename);

    try {
        // 1. Create standard version (with standard frame)
        await sharp(sourceFilePath)
            .resize({
                width: 1920, // Standard 16:9 HD resolution
                height: 1080,
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .jpeg({ quality: 90 })
            .toFile(standardPath);

        // 2. Create Instagram version (square 1:1)
        await sharp(sourceFilePath)
            .resize({
                width: 1080, // Instagram standard size
                height: 1080,
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .jpeg({ quality: 90 })
            .toFile(instagramPath);

        // 3. Create wedding frame version (same as standard but with special wedding frame)
        await sharp(sourceFilePath)
            .resize({
                width: 1920,
                height: 1080,
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .jpeg({ quality: 90 })
            .toFile(weddingPath);

        // 4. Apply appropriate frames to each version
        let overlayApplied = {
            standard: false,
            instagram: false,
            wedding: false
        };

        // Standard frame
        const standardOverlayPath = path.join(OVERLAYS_DIR, 'standard-frame.png');
        if (fs.existsSync(standardOverlayPath)) {
            try {
                overlayApplied.standard = await applyOverlayToImage(standardPath, standardOverlayPath, standardPath);
            } catch (error) {
                console.error('Error applying standard overlay:', error);
            }
        }

        // Instagram specific frame
        const instagramOverlayPath = path.join(OVERLAYS_DIR, 'instagram-frame.png');
        if (fs.existsSync(instagramOverlayPath)) {
            try {
                overlayApplied.instagram = await applyOverlayToImage(instagramPath, instagramOverlayPath, instagramPath);
            } catch (error) {
                console.error('Error applying Instagram overlay:', error);
            }
        }

        // Wedding special frame
        const weddingOverlayPath = path.join(OVERLAYS_DIR, 'wedding-frame.png');
        if (fs.existsSync(weddingOverlayPath)) {
            try {
                overlayApplied.wedding = await applyOverlayToImage(weddingPath, weddingOverlayPath, weddingPath);
            } catch (error) {
                console.error('Error applying wedding overlay:', error);
            }
        }

        // 5. Generate thumbnails for gallery view
        const thumbnailUrl = await generateThumbnail(standardPath, filename);

        // Return all paths and URLs
        return {
            standardPath: standardPath,
            standardUrl: `/photos/${filename}`,
            instagramPath: instagramPath,
            instagramUrl: `/photos/instagram/${instagramFilename}`,
            weddingPath: weddingPath,
            weddingUrl: `/photos/wedding/${weddingFilename}`,
            thumbnailUrl: thumbnailUrl,
            overlayApplied: overlayApplied
        };
    } catch (error) {
        console.error('Error processing photo with multiple formats:', error);
        throw error;
    }
}

// Generate QR code and respond to photo capture request
async function generateQRAndRespond(req, res, filename, timestamp, processedPhotos = null) {
    // Generate QR code for the photo viewer page
    const photoId = filename; // Use standard version for QR code
    const clientDomain = req.headers.host || 'fotobox.slyrix.com';
    const photoViewUrl = `https://${clientDomain}/photo/${photoId}`;

    const qrFilename = `qr_${timestamp}.png`;
    const qrFilepath = path.join(QR_DIR, qrFilename);

    // If no processed photos available, generate thumbnail for the main file
    const thumbnailUrl = processedPhotos
        ? processedPhotos.thumbnailUrl
        : await generateThumbnail(path.join(PHOTOS_DIR, filename), filename);

    QRCode.toFile(qrFilepath, photoViewUrl, {
        color: {
            dark: '#000',  // Points
            light: '#FFF'  // Background
        }
    }, (qrErr) => {
        if (qrErr) {
            console.error(`Error generating QR code: ${qrErr.message}`);
        }

        // Respond with all relevant URLs
        res.json({
            success: true,
            photo: {
                filename: filename,
                url: processedPhotos ? processedPhotos.standardUrl : `/photos/${filename}`,
                thumbnailUrl: thumbnailUrl || `/photos/${filename}`, // Fallback to original if thumbnail fails
                qrUrl: `/qrcodes/${qrFilename}`,
                photoViewUrl: photoViewUrl,
                instagramUrl: processedPhotos ? processedPhotos.instagramUrl : null,
                weddingUrl: processedPhotos ? processedPhotos.weddingUrl : null,
                overlayApplied: processedPhotos ? processedPhotos.overlayApplied : false,
                timestamp: Date.now()
            }
        });
    });
}

// Helper function to regenerate mosaic in background
function regenerateMosaicInBackground() {
    // Check if we have enough photos for a mosaic
    const files = fs.readdirSync(THUMBNAILS_DIR);
    const photoCount = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file)).length;

    if (photoCount >= 10) {
        // Use fetch to call our own API endpoint without waiting for response
        try {
            // Use child_process.exec to make a request to our own server
            const serverUrl = `http://localhost:${PORT}/api/mosaic?t=${Date.now()}`;
            exec(`curl "${serverUrl}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error('Error triggering mosaic generation:', error);
                } else {
                    console.log('Mosaic regeneration triggered');
                }
            });
        } catch (error) {
            console.error('Error triggering mosaic regeneration:', error);
        }
    }
}

//==============================
// API ENDPOINTS
//==============================

// Get server and camera status
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
    // Query parameter for type
    const type = req.query.type || 'standard'; // 'standard', 'instagram', 'wedding'
    const limit = parseInt(req.query.limit) || 0; // Optional limit parameter

    // Select directory based on type
    let dirToScan;
    switch (type) {
        case 'instagram':
            dirToScan = INSTAGRAM_DIR;
            break;
        case 'wedding':
            dirToScan = WEDDING_DIR;
            break;
        case 'standard':
        default:
            dirToScan = PHOTOS_DIR;
            break;
    }

    if (!fs.existsSync(dirToScan)) {
        return res.status(404).json({ error: 'Requested photo type directory not found' });
    }

    fs.readdir(dirToScan, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Error retrieving photos' });
        }

        // Filter for image files
        const photoFiles = files.filter(file =>
            /\.(jpg|jpeg|png)$/i.test(file)
        );

        // Add timestamps and sort by newest
        const photos = photoFiles.map(file => {
            try {
                const stats = fs.statSync(path.join(dirToScan, file));
                const baseFilename = file.replace(/^(instagram_|wedding_)/, '');

                // Check which versions exist
                const standardPath = path.join(PHOTOS_DIR, baseFilename);
                const instagramPath = path.join(INSTAGRAM_DIR, `instagram_${baseFilename}`);
                const weddingPath = path.join(WEDDING_DIR, `wedding_${baseFilename}`);

                const standardExists = fs.existsSync(standardPath);
                const instagramExists = fs.existsSync(instagramPath);
                const weddingExists = fs.existsSync(weddingPath);

                return {
                    filename: file,
                    baseFilename: baseFilename,
                    url: type === 'instagram'
                        ? `/photos/instagram/${file}`
                        : (type === 'wedding'
                            ? `/photos/wedding/${file}`
                            : `/photos/${file}`),
                    standardUrl: standardExists ? `/photos/${baseFilename}` : null,
                    instagramUrl: instagramExists ? `/photos/instagram/instagram_${baseFilename}` : null,
                    weddingUrl: weddingExists ? `/photos/wedding/wedding_${baseFilename}` : null,
                    thumbnailUrl: `/thumbnails/thumb_${baseFilename}`,
                    qrUrl: `/qrcodes/qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`,
                    timestamp: stats.mtime.getTime()
                };
            } catch (error) {
                console.error(`Error processing photo ${file}:`, error);
                return null;
            }
        }).filter(photo => photo !== null).sort((a, b) => b.timestamp - a.timestamp);

        // Apply limit if specified
        const limitedPhotos = limit > 0 ? photos.slice(0, limit) : photos;

        res.json(limitedPhotos);
    });
});

// Get specific photo details
app.get('/api/photos/:photoId', (req, res) => {
    const photoId = req.params.photoId;

    // Input validation
    if (!photoId || typeof photoId !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Invalid Photo ID'
        });
    }

    // Determine photo type from ID
    let filepath;
    let photoType = 'standard';

    if (photoId.startsWith('instagram_')) {
        filepath = path.join(INSTAGRAM_DIR, photoId);
        photoType = 'instagram';
    } else if (photoId.startsWith('wedding_')) {
        filepath = path.join(WEDDING_DIR, photoId);
        photoType = 'wedding';
    } else {
        filepath = path.join(PHOTOS_DIR, photoId);
    }

    // Check if file exists
    if (!fs.existsSync(filepath)) {
        console.log(`Photo not found: ${photoId}`);

        // If not a special version, look in other directories
        if (!photoId.startsWith('instagram_') && !photoId.startsWith('wedding_')) {
            // Search for same base ID in other directories
            const baseId = photoId;

            const instagramPath = path.join(INSTAGRAM_DIR, `instagram_${baseId}`);
            const weddingPath = path.join(WEDDING_DIR, `wedding_${baseId}`);

            if (fs.existsSync(instagramPath)) {
                filepath = instagramPath;
                photoType = 'instagram';
            } else if (fs.existsSync(weddingPath)) {
                filepath = weddingPath;
                photoType = 'wedding';
            } else {
                return res.status(404).json({
                    success: false,
                    error: 'Photo not found'
                });
            }
        } else {
            return res.status(404).json({
                success: false,
                error: 'Photo not found'
            });
        }
    }

    try {
        // Get file stats for timestamp
        const stats = fs.statSync(filepath);

        // Generate QR code path
        const baseFilename = photoId.replace(/^(instagram_|wedding_)/, '');
        const qrFilename = `qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`;

        // Check if thumbnail exists
        const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${baseFilename}`);
        const hasThumbnail = fs.existsSync(thumbnailPath);

        // Get client domain from request or config
        const clientDomain = req.headers.host || 'fotobox.slyrix.com';

        // Various URLs for different versions
        let standardUrl = `/photos/${baseFilename}`;
        let instagramUrl = `/photos/instagram/instagram_${baseFilename}`;
        let weddingUrl = `/photos/wedding/wedding_${baseFilename}`;

        // Check which versions actually exist
        const standardExists = fs.existsSync(path.join(PHOTOS_DIR, baseFilename));
        const instagramExists = fs.existsSync(path.join(INSTAGRAM_DIR, `instagram_${baseFilename}`));
        const weddingExists = fs.existsSync(path.join(WEDDING_DIR, `wedding_${baseFilename}`));

        // Create photoViewUrl based on requested type
        const photoViewUrl = `https://${clientDomain}/photo/${photoId}`;

        // Return photo data
        res.json({
            success: true,
            filename: photoId,
            url: photoType === 'instagram'
                ? instagramUrl
                : (photoType === 'wedding'
                    ? weddingUrl
                    : standardUrl),
            standardUrl: standardExists ? standardUrl : null,
            instagramUrl: instagramExists ? instagramUrl : null,
            weddingUrl: weddingExists ? weddingUrl : null,
            thumbnailUrl: hasThumbnail ? `/thumbnails/thumb_${baseFilename}` : null,
            qrUrl: `/qrcodes/${qrFilename}`,
            photoViewUrl: photoViewUrl,
            photoType: photoType,
            timestamp: stats.mtime.getTime()
        });
    } catch (error) {
        console.error(`Error retrieving photo ${photoId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Server error retrieving photo'
        });
    }
});

// Get a specific photo file - for direct file access
app.get('/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(PHOTOS_DIR, filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('Photo not found');
    }

    res.sendFile(filepath);
});

// Get an Instagram format photo
app.get('/photos/instagram/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(INSTAGRAM_DIR, filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('Instagram photo not found');
    }

    res.sendFile(filepath);
});

// Get a Wedding format photo
app.get('/photos/wedding/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(WEDDING_DIR, filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('Wedding photo not found');
    }

    res.sendFile(filepath);
});

// Take a new photo
app.post('/api/photos/capture', async (req, res) => {
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
    const filename = `photo_${timestamp}.jpg`;
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

    exec(captureCommand, async (error, stdout, stderr) => {
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

        if (error || stderr.includes('ERROR')) {
            console.error(`Error taking photo: ${error ? error.message : stderr}`);

            // Fallback to webcam if gphoto2 fails
            const fallbackCommand = `fswebcam -d /dev/video0 -r 1920x1080 --fps 30 --no-banner -S 3 -F 3 --jpeg 95 "${filepath}"`;

            exec(fallbackCommand, async (fbError, fbStdout, fbStderr) => {
                captureInProgress.status = false;

                if (fbError) {
                    return res.status(500).json({
                        success: false,
                        error: 'Photo capture failed with both camera and webcam'
                    });
                }

                console.log(`Photo taken with webcam as fallback`);

                try {
                    // Process photo with three formats
                    const processedPhotos = await processPhotoWithThreeFormats(filepath, filename);

                    // Increment photo counter for mosaic generation
                    photoCounter++;

                    // Check if we should regenerate mosaic (every 10th photo)
                    if (photoCounter % MOSAIC_PHOTO_INTERVAL === 0) {
                        console.log(`Captured ${photoCounter} photos. Regenerating mosaic.`);
                        regenerateMosaicInBackground();
                    }

                    generateQRAndRespond(req, res, filename, timestamp, processedPhotos);
                } catch (err) {
                    console.error('Error in multi-format processing:', err);
                    // Try to continue with standard processing
                    generateQRAndRespond(req, res, filename, timestamp);
                }
            });

            return;
        }

        captureInProgress.status = false;
        console.log(`Photo successfully taken with camera: ${filename}`);

        // Process photo with multiple formats
        processPhotoWithThreeFormats(filepath, filename)
            .then(processedPhotos => {
                // Increment photo counter for mosaic generation
                photoCounter++;

                // Check if we should regenerate mosaic (every 10th photo)
                if (photoCounter % MOSAIC_PHOTO_INTERVAL === 0) {
                    console.log(`Captured ${photoCounter} photos. Regenerating mosaic.`);
                    regenerateMosaicInBackground();
                }

                generateQRAndRespond(req, res, filename, timestamp, processedPhotos);
            })
            .catch(err => {
                console.error('Error in multi-format processing:', err);
                // Try to continue with standard processing
                generateQRAndRespond(req, res, filename, timestamp);
            });
    });
});

// Delete a photo (all versions)
app.delete('/api/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const baseFilename = filename.replace(/^(instagram_|wedding_)/, '');

    const filepaths = [
        path.join(PHOTOS_DIR, baseFilename),                    // Standard version
        path.join(INSTAGRAM_DIR, `instagram_${baseFilename}`),  // Instagram version
        path.join(WEDDING_DIR, `wedding_${baseFilename}`),      // Wedding version
        path.join(THUMBNAILS_DIR, `thumb_${baseFilename}`)      // Thumbnail
    ];

    let success = true;
    let errorMessage = '';

    // Delete all versions
    for (const filepath of filepaths) {
        if (fs.existsSync(filepath)) {
            try {
                fs.unlinkSync(filepath);
                console.log(`Deleted: ${filepath}`);
            } catch (err) {
                success = false;
                errorMessage += `Failed to delete ${filepath}: ${err.message}. `;
                console.error(`Error deleting ${filepath}:`, err);
            }
        }
    }

    // Delete QR code
    const qrPath = path.join(QR_DIR, `qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`);
    if (fs.existsSync(qrPath)) {
        try {
            fs.unlinkSync(qrPath);
            console.log(`Deleted QR code: ${qrPath}`);
        } catch (err) {
            console.error(`Error deleting QR code ${qrPath}:`, err);
            // Not considering QR code deletion failure as critical
        }
    }

    if (success) {
        res.json({success: true, message: 'All photo versions deleted successfully'});
    } else {
        res.status(500).json({success: false, error: errorMessage});
    }
});

// Get list of available frames
app.get('/api/frames', (req, res) => {
    try {
        if (!fs.existsSync(OVERLAYS_DIR)) {
            return res.json([]);
        }

        const files = fs.readdirSync(OVERLAYS_DIR);
        const overlays = files
            .filter(file => /\.(png|jpg|jpeg)$/i.test(file))
            .map(file => {
                const stats = fs.statSync(path.join(OVERLAYS_DIR, file));

                // Determine frame type based on filename prefix
                let frameType = 'standard';
                if (file.startsWith('instagram-')) {
                    frameType = 'instagram';
                } else if (file.startsWith('wedding-')) {
                    frameType = 'wedding';
                }

                return {
                    name: file,
                    displayName: file.replace(/\.(png|jpg|jpeg)$/i, '').replace(/^(instagram-|wedding-)/, ''),
                    url: `/overlays/${file}`,
                    timestamp: stats.mtime.getTime(),
                    size: stats.size,
                    type: frameType
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp);

        return res.json(overlays);
    } catch (error) {
        console.error('Error listing frames:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error listing frames'
        });
    }
});

// Upload a new frame overlay
app.post('/api/admin/overlays', upload.single('overlay'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No overlay file uploaded'
        });
    }

    const overlayName = req.body.name || `overlay-${Date.now()}.png`;
    const overlayPath = path.join(OVERLAYS_DIR, overlayName);

    try {
        // Save the uploaded overlay
        fs.writeFileSync(overlayPath, req.file.buffer);

        return res.json({
            success: true,
            message: 'Overlay uploaded successfully',
            name: overlayName,
            url: `/overlays/${overlayName}`
        });
    } catch (error) {
        console.error('Error saving overlay:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error saving overlay'
        });
    }
});

// Delete a frame overlay
app.delete('/api/admin/overlays/:name', (req, res) => {
    const overlayName = req.params.name;
    const overlayPath = path.join(OVERLAYS_DIR, overlayName);

    if (!fs.existsSync(overlayPath)) {
        return res.status(404).json({
            success: false,
            error: 'Overlay not found'
        });
    }

    try {
        fs.unlinkSync(overlayPath);
        return res.json({
            success: true,
            message: 'Overlay deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting overlay:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error deleting overlay'
        });
    }
});

// Apply a frame to an existing photo
app.post('/api/photos/:photoId/apply-frame', async (req, res) => {
    const photoId = req.params.photoId;
    const { frameName, photoType = 'standard' } = req.body;

    if (!photoId || !frameName) {
        return res.status(400).json({
            success: false,
            error: 'Photo ID and frame name are required'
        });
    }

    try {
        // Determine source path based on photo type
        let sourcePhotoPath;
        let baseFilename = photoId.replace(/^(instagram_|wedding_)/, '');

        switch (photoType) {
            case 'instagram':
                sourcePhotoPath = path.join(INSTAGRAM_DIR, `instagram_${baseFilename}`);
                break;
            case 'wedding':
                sourcePhotoPath = path.join(WEDDING_DIR, `wedding_${baseFilename}`);
                break;
            default:
                sourcePhotoPath = path.join(PHOTOS_DIR, baseFilename);
        }

        const overlayPath = path.join(OVERLAYS_DIR, frameName);

        if (!fs.existsSync(sourcePhotoPath)) {
            return res.status(404).json({
                success: false,
                error: `Source photo not found: ${photoType} version of ${baseFilename}`
            });
        }

        if (!fs.existsSync(overlayPath)) {
            return res.status(404).json({
                success: false,
                error: `Frame overlay not found: ${frameName}`
            });
        }

        // Apply the overlay
        const success = await applyOverlayToImage(sourcePhotoPath, overlayPath, sourcePhotoPath);

        if (success) {
            // If this is the standard version, regenerate the thumbnail
            if (photoType === 'standard') {
                await generateThumbnail(sourcePhotoPath, baseFilename);
            }

            return res.json({
                success: true,
                message: `Applied frame '${frameName}' to ${photoType} version of photo`,
                photoId: photoId,
                type: photoType
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to apply frame to photo'
            });
        }
    } catch (error) {
        console.error('Error applying frame:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error applying frame to photo'
        });
    }
});

// Generate Instagram version for an existing photo
app.post('/api/photos/:photoId/instagram', async (req, res) => {
    const photoId = req.params.photoId;
    const { frameName } = req.body;

    if (!photoId) {
        return res.status(400).json({
            success: false,
            error: 'Photo ID is required'
        });
    }

    try {
        // Get the base filename
        const baseFilename = photoId.replace(/^(instagram_|wedding_)/, '');

        // Find the source photo (prefer standard version)
        const standardPath = path.join(PHOTOS_DIR, baseFilename);

        if (!fs.existsSync(standardPath)) {
            return res.status(404).json({
                success: false,
                error: 'Source photo not found'
            });
        }

        // Create Instagram directory if needed
        if (!fs.existsSync(INSTAGRAM_DIR)) {
            fs.mkdirSync(INSTAGRAM_DIR, { recursive: true });
        }

        // Generate Instagram version
        const instagramFilename = `instagram_${baseFilename}`;
        const instagramPath = path.join(INSTAGRAM_DIR, instagramFilename);

        // Create square Instagram version
        await sharp(standardPath)
            .resize({
                width: 1080,
                height: 1080,
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .jpeg({ quality: 90 })
            .toFile(instagramPath);

        // Apply frame if specified
        let overlayApplied = false;
        if (frameName) {
            const overlayPath = path.join(OVERLAYS_DIR, frameName);
            if (fs.existsSync(overlayPath)) {
                overlayApplied = await applyOverlayToImage(instagramPath, overlayPath, instagramPath);
            }
        } else {
            // Try to use default Instagram frame
            const defaultInstagramFrame = path.join(OVERLAYS_DIR, 'instagram-frame.png');
            if (fs.existsSync(defaultInstagramFrame)) {
                overlayApplied = await applyOverlayToImage(instagramPath, defaultInstagramFrame, instagramPath);
            }
        }

        return res.json({
            success: true,
            message: 'Instagram version generated successfully',
            photoId: instagramFilename,
            url: `/photos/instagram/${instagramFilename}`,
            overlayApplied
        });
    } catch (error) {
        console.error('Error generating Instagram version:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error generating Instagram version'
        });
    }
});

// Generate Wedding version for an existing photo
app.post('/api/photos/:photoId/wedding', async (req, res) => {
    const photoId = req.params.photoId;
    const { frameName } = req.body;

    if (!photoId) {
        return res.status(400).json({
            success: false,
            error: 'Photo ID is required'
        });
    }

    try {
        // Get the base filename
        const baseFilename = photoId.replace(/^(instagram_|wedding_)/, '');

        // Find the source photo (prefer standard version)
        const standardPath = path.join(PHOTOS_DIR, baseFilename);

        if (!fs.existsSync(standardPath)) {
            return res.status(404).json({
                success: false,
                error: 'Source photo not found'
            });
        }

        // Create Wedding directory if needed
        if (!fs.existsSync(WEDDING_DIR)) {
            fs.mkdirSync(WEDDING_DIR, { recursive: true });
        }

        // Generate Wedding version
        const weddingFilename = `wedding_${baseFilename}`;
        const weddingPath = path.join(WEDDING_DIR, weddingFilename);

        // Create wedding version (16:9 aspect ratio)
        await sharp(standardPath)
            .resize({
                width: 1920,
                height: 1080,
                fit: 'contain',
                background: { r: 255, g: 255, b: 255 }
            })
            .jpeg({ quality: 90 })
            .toFile(weddingPath);

        // Apply frame if specified
        let overlayApplied = false;
        if (frameName) {
            const overlayPath = path.join(OVERLAYS_DIR, frameName);
            if (fs.existsSync(overlayPath)) {
                overlayApplied = await applyOverlayToImage(weddingPath, overlayPath, weddingPath);
            }
        } else {
            // Try to use default Wedding frame
            const defaultWeddingFrame = path.join(OVERLAYS_DIR, 'wedding-frame.png');
            if (fs.existsSync(defaultWeddingFrame)) {
                overlayApplied = await applyOverlayToImage(weddingPath, defaultWeddingFrame, weddingPath);
            }
        }

        return res.json({
            success: true,
            message: 'Wedding version generated successfully',
            photoId: weddingFilename,
            url: `/photos/wedding/${weddingFilename}`,
            overlayApplied
        });
    } catch (error) {
        console.error('Error generating Wedding version:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error generating Wedding version'
        });
    }
});

// Regenerate thumbnails for all photos
app.get('/api/admin/generate-thumbnails', async (req, res) => {
    try {
        const files = fs.readdirSync(PHOTOS_DIR);
        const photoFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));

        // Send immediate response
        res.json({
            success: true,
            message: `Started processing ${photoFiles.length} photos. This may take several minutes.`
        });

        // Process in background
        let processed = 0;
        let failed = 0;

        for (const file of photoFiles) {
            try {
                const filepath = path.join(PHOTOS_DIR, file);
                await generateThumbnail(filepath, file);
                processed++;

                // Log progress every 10 photos
                if (processed % 10 === 0) {
                    console.log(`Thumbnail generation progress: ${processed}/${photoFiles.length}`);
                }
            } catch (err) {
                failed++;
                console.error(`Failed to create thumbnail for ${file}: ${err.message}`);
            }
        }

        console.log(`Thumbnail generation complete. Processed: ${processed}, Failed: ${failed}`);
    } catch (error) {
        console.error(`Error in thumbnail generation: ${error.message}`);
        // Response already sent, so just log the error
    }
});

// Generate photo mosaic
app.get('/api/mosaic', async (req, res) => {
    try {
        // Get all photos (using thumbnails for better performance)
        const files = fs.readdirSync(THUMBNAILS_DIR);
        const photoFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file))
            .sort(() => 0.5 - Math.random()); // Randomize order

        // Check if we have enough photos (minimum 10)
        if (photoFiles.length < 10) {
            return res.status(404).json({
                success: false,
                error: 'Not enough photos for mosaic',
                count: photoFiles.length,
                required: 10
            });
        }

        // Calculate the best grid size to fill the canvas nicely
        // Use a 16:9 aspect ratio for wide displays
        const targetWidth = 1920;
        const targetHeight = 1080;

        // Limit to 100 photos max
        let photoCount = Math.min(photoFiles.length, 100);

        // Try to determine optimal grid dimensions
        let cols = Math.ceil(Math.sqrt(photoCount * targetWidth / targetHeight));
        let rows = Math.ceil(photoCount / cols);

        // Ensure we completely fill the grid by repeating photos if necessary
        let photosToUse = [];
        let requiredPhotos = cols * rows;

        // Loop through our photos, repeating if needed to fill the grid
        for (let i = 0; i < requiredPhotos; i++) {
            photosToUse.push(photoFiles[i % photoFiles.length]);
        }

        // Calculate the size of each tile to fill the target dimensions exactly
        const tileWidth = Math.floor(targetWidth / cols);
        const tileHeight = Math.floor(targetHeight / rows);

        // Create mosaic canvas - use integer values for dimensions
        const mosaicWidth = tileWidth * cols;
        const mosaicHeight = tileHeight * rows;

        // Create a blank canvas
        const mosaic = sharp({
            create: {
                width: mosaicWidth,
                height: mosaicHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 0.2 } // Translucent background
            }
        });

        // Prepare composite array
        const composites = [];
        let successCount = 0;

        for (let i = 0; i < photosToUse.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);

            // Use integer values for tile positions
            const left = col * tileWidth;
            const top = row * tileHeight;

            // Process each thumbnail
            try {
                const thumbnailPath = path.join(THUMBNAILS_DIR, photosToUse[i]);

                // Check if file exists and is accessible
                if (!fs.existsSync(thumbnailPath)) {
                    console.log(`Thumbnail not found: ${photosToUse[i]}`);
                    continue;
                }

                // Resize to exactly fit the tile size
                const resizedBuffer = await sharp(thumbnailPath)
                    .resize({
                        width: tileWidth,
                        height: tileHeight,
                        fit: 'cover',   // This ensures the image covers the entire tile
                        position: 'center'
                    })
                    .toBuffer();

                composites.push({
                    input: resizedBuffer,
                    top: top,
                    left: left
                });

                successCount++;
            } catch (err) {
                console.error(`Error processing thumbnail ${photosToUse[i]}:`, err);
                // Continue with other photos
            }
        }

        // Ensure we have at least some photos successfully processed
        if (successCount === 0) {
            return res.status(500).json({
                success: false,
                error: 'Failed to process any photos for mosaic'
            });
        }

        console.log(`Successfully processed ${successCount} photos for mosaic`);

        try {
            // Create mosaic
            const mosaicBuffer = await mosaic.composite(composites).png().toBuffer();

            // Save mosaic to file for caching
            const mosaicFilepath = path.join(PHOTOS_DIR, 'mosaic.png');
            await fs.promises.writeFile(mosaicFilepath, mosaicBuffer);

            // Send response
            res.set('Content-Type', 'image/png');
            res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
            res.send(mosaicBuffer);
        } catch (error) {
            console.error('Error creating final mosaic:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create final mosaic image',
                message: error.message
            });
        }
    } catch (error) {
        console.error('Error creating mosaic:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create photo mosaic',
            message: error.message
        });
    }
});

// Create HTTP server and attach WebSocket server
const server = http.createServer(app);
setupWebSocketServer(server);

// Start the server
server.listen(PORT, () => {
    console.log(`=== FOTOBOX SERVER STARTED ===`);
    console.log(`Server running on port ${PORT}`);
    console.log(`Photos directory: ${PHOTOS_DIR}`);
    console.log(`QR codes directory: ${QR_DIR}`);
    console.log(`Overlays directory: ${OVERLAYS_DIR}`);
    console.log(`Instagram photos directory: ${INSTAGRAM_DIR}`);
    console.log(`Wedding frame photos directory: ${WEDDING_DIR}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    console.log('Server shutting down...');
    if (previewInterval) {
        clearInterval(previewInterval);
    }

    // Close any open WebSocket connections
    if (wsServer) {
        wsServer.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.close(1000, 'Server shutting down');
            }
        });
    }

    console.log('Cleanup complete');
    process.exit(0);
});

module.exports = app;