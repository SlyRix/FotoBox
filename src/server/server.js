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
const compression = require('compression'); // Add compression
const sharp = require('sharp'); // Add sharp for image processing
const multer = require('multer');
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

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
const THUMBNAILS_DIR = path.join(__dirname, 'public', 'thumbnails');
const OVERLAYS_DIR = path.join(__dirname, 'public', 'overlays');

// Create required directories
[PHOTOS_DIR, QR_DIR, PREVIEW_DIR, THUMBNAILS_DIR, OVERLAYS_DIR].forEach(dir => {
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

// Add compression middleware
app.use(compression());

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

// Update the stopWebcamPreview function to handle new structure
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
function sendFrameToClients(base64Image) {
    let activeClientCount = 0;
    for (const [_, client] of activeStreams) {
        if (client.isStreaming && client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify({
                    type: 'previewFrame',
                    imageData: `data:image/jpeg;base64,${base64Image}`,
                    timestamp: Date.now()
                }));
                activeClientCount++;
            } catch (err) {
                console.error(`Error sending frame to client: ${err.message}`);
            }
        }
    }

    // If no active clients, stop preview
    if (activeClientCount === 0 && previewInterval) {
        previewInterval.stop();
    }
}

function startLegacyWebcamPreview() {
    console.log('Using legacy preview method');

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
                sendFrameToClients(imageData.toString('base64'));

                // Delete the preview file to save space
                fs.unlink(previewPath, () => {});
            });
        });
    };

    // Send initial preview status
    broadcastToStreamingClients({
        type: 'previewStatus',
        status: 'active',
        message: 'Webcam preview active (legacy mode)'
    });

    // Start the preview interval with a shorter interval for smoother preview
    previewInterval = setInterval(capturePreviewFrame, 200); // 5 fps

    // Capture first frame immediately
    capturePreviewFrame();
}

// Helper function to broadcast to all streaming clients
function broadcastToStreamingClients(message) {
    for (const [_, client] of activeStreams) {
        if (client.isStreaming && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }
}

// Thumbnail generation function
async function generateThumbnail(sourceFilePath, filename) {
    // Create thumbnails directory if it doesn't exist
    if (!fs.existsSync(THUMBNAILS_DIR)) {
        fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);

    // Generate thumbnail only if it doesn't already exist
    if (!fs.existsSync(thumbnailPath)) {
        try {
            await sharp(sourceFilePath)
                .resize(300, 225, { // 4:3 aspect ratio thumbnail
                    fit: 'cover',
                    position: 'center'
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

// Helper function to apply overlay to an image
async function applyOverlayToImage(sourceImagePath, overlayImagePath, outputPath) {
    try {
        // Get dimensions of the input image
        const metadata = await sharp(sourceImagePath).metadata();

        // Resize the overlay to match the input image dimensions
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
            .jpeg({ quality: 90 })
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error applying overlay:', error);
        return false;
    }
}

app.get('/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(PHOTOS_DIR, filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('Photo not found');
    }

    // Set proper headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'image/jpeg');

    // Send the file
    res.sendFile(filepath);
});

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
                thumbnailUrl: `/thumbnails/thumb_${file}`, // Add thumbnail URL
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
async function generateQRAndRespond(req, res, filename, timestamp) {
    // Generate QR code for the photo view page, not directly to the image
    const photoId = filename; // Using the filename as the ID for simplicity
    const clientDomain = 'fotobox.slyrix.com'; // Using the specified domain
    const photoViewUrl = `https://${clientDomain}/photo/${photoId}`;

    const qrFilename = `qr_${timestamp}.png`;
    const qrFilepath = path.join(QR_DIR, qrFilename);

    // Generate thumbnail
    const filepath = path.join(PHOTOS_DIR, filename);
    const thumbnailUrl = await generateThumbnail(filepath, filename);

    // Check if default overlay exists and apply it
    const defaultOverlayPath = path.join(OVERLAYS_DIR, 'wedding-frame.png');
    let overlayApplied = false;

    if (fs.existsSync(defaultOverlayPath)) {
        try {
            // Create a temporary path for the processed file
            const processedPath = path.join(PHOTOS_DIR, `temp_${filename}`);

            // Apply the overlay
            const success = await applyOverlayToImage(filepath, defaultOverlayPath, processedPath);

            if (success) {
                // Replace the original with the overlaid version
                fs.renameSync(processedPath, filepath);
                overlayApplied = true;

                // Regenerate thumbnail with the overlay
                await generateThumbnail(filepath, filename);
            }
        } catch (error) {
            console.error('Error applying default overlay:', error);
            // Continue without overlay if there's an error
        }
    }

    QRCode.toFile(qrFilepath, photoViewUrl, {
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
                thumbnailUrl: thumbnailUrl || `/photos/${filename}`, // Fallback to original if thumbnail fails
                qrUrl: `/qrcodes/${qrFilename}`,
                photoViewUrl: photoViewUrl, // Add the photo view URL to response
                overlayApplied: overlayApplied, // Indicate if overlay was applied
                timestamp: Date.now()
            }
        });
    });
}

// Now let's add an endpoint to get a specific photo by ID
app.get('/api/photos/:photoId', (req, res) => {
    const photoId = req.params.photoId;

    // Input validation
    if (!photoId || typeof photoId !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Invalid photo ID'
        });
    }

    // In this implementation, the photoId is the filename
    const filepath = path.join(PHOTOS_DIR, photoId);

    // Check if the file exists
    if (!fs.existsSync(filepath)) {
        console.log(`Photo not found: ${photoId}`);
        return res.status(404).json({
            success: false,
            error: 'Photo not found'
        });
    }

    try {
        // Get file stats for timestamp
        const stats = fs.statSync(filepath);

        // Generate QR code path
        const qrFilename = `qr_${photoId.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`;

        // Check if thumbnail exists
        const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${photoId}`);
        const hasThumbnail = fs.existsSync(thumbnailPath);

        // Get client domain from request or config
        const clientDomain = req.headers.host || 'fotobox.slyrix.com';
        const photoViewUrl = `https://${clientDomain}/photo/${photoId}`;

        // Return photo data
        res.json({
            success: true,
            filename: photoId,
            url: `/photos/${photoId}`,
            thumbnailUrl: hasThumbnail ? `/thumbnails/thumb_${photoId}` : null,
            qrUrl: `/qrcodes/${qrFilename}`,
            photoViewUrl: photoViewUrl,
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

// Delete a photo
app.delete('/api/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(PHOTOS_DIR, filename);
    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);

    // Delete the original photo
    fs.unlink(filepath, (err) => {
        if (err) {
            return res.status(500).json({error: 'Failed to delete photo'});
        }

        // Also try to delete the thumbnail if it exists
        if (fs.existsSync(thumbnailPath)) {
            fs.unlink(thumbnailPath, (thumbErr) => {
                if (thumbErr) {
                    console.error(`Failed to delete thumbnail: ${thumbErr}`);
                }
            });
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

// Route to generate thumbnails for all existing photos
app.get('/api/admin/generate-thumbnails', async (req, res) => {
    // In a real app, check admin authentication here

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

// Endpoint to apply overlay to a photo
app.post('/api/photos/:photoId/overlay', upload.single('processedImage'), async (req, res) => {
    const photoId = req.params.photoId;
    const overlayName = req.body.overlayName || 'wedding-frame.png';

    // Validate inputs
    if (!photoId) {
        return res.status(400).json({
            success: false,
            error: 'Photo ID is required'
        });
    }

    // Source paths
    const sourcePhotoPath = path.join(PHOTOS_DIR, photoId);
    const overlayPath = path.join(OVERLAYS_DIR, overlayName);

    // Check if both files exist
    if (!fs.existsSync(sourcePhotoPath)) {
        return res.status(404).json({
            success: false,
            error: 'Source photo not found'
        });
    }

    if (!fs.existsSync(overlayPath)) {
        return res.status(404).json({
            success: false,
            error: 'Overlay image not found'
        });
    }

    try {
        // If client uploaded a processed image
        if (req.file) {
            // Save the uploaded processed image
            fs.writeFileSync(sourcePhotoPath, req.file.buffer);

            // Regenerate thumbnail for the updated image
            await generateThumbnail(sourcePhotoPath, photoId);

            return res.json({
                success: true,
                message: 'Processed image saved successfully',
                url: `/photos/${photoId}`
            });
        } else {
            // Process the overlay on the server
            const outputPath = sourcePhotoPath; // Overwrite original
            const success = await applyOverlayToImage(sourcePhotoPath, overlayPath, outputPath);

            if (success) {
                // Regenerate thumbnail
                await generateThumbnail(sourcePhotoPath, photoId);

                return res.json({
                    success: true,
                    message: 'Overlay applied successfully',
                    url: `/photos/${photoId}`
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to apply overlay'
                });
            }
        }
    } catch (error) {
        console.error('Error in overlay processing:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error during overlay processing'
        });
    }
});

// Endpoint to upload a new overlay template
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

// Get list of available overlays
app.get('/api/admin/overlays', (req, res) => {
    try {
        if (!fs.existsSync(OVERLAYS_DIR)) {
            return res.json([]);
        }

        const files = fs.readdirSync(OVERLAYS_DIR);
        const overlays = files
            .filter(file => /\.(png|jpg|jpeg)$/i.test(file))
            .map(file => {
                const stats = fs.statSync(path.join(OVERLAYS_DIR, file));
                return {
                    name: file,
                    url: `/overlays/${file}`,
                    timestamp: stats.mtime.getTime(),
                    size: stats.size
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp);

        return res.json(overlays);
    } catch (error) {
        console.error('Error listing overlays:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error listing overlays'
        });
    }
});

// Create HTTP server and attach WebSocket server
const server = http.createServer(app);
setupWebSocketServer(server);

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Photos directory: ${PHOTOS_DIR}`);
    console.log(`QR codes directory: ${QR_DIR}`);
    console.log(`Overlays directory: ${OVERLAYS_DIR}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    if (previewInterval) {
        clearInterval(previewInterval);
    }
    process.exit();
});