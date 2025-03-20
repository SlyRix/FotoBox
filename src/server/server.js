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
let photoCounter = 0;
const MOSAIC_PHOTO_INTERVAL = 3; // Regenerate every 3rd photo

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
// Directory paths for dual-format photos
const PRINT_PHOTOS_DIR = path.join(__dirname, 'public', 'photos', 'print');
const ORIGINALS_DIR = path.join(__dirname, 'public', 'photos', 'originals');

// Enhanced directory creation function with proper error handling
function createRequiredDirectories() {
    const directories = [
        PHOTOS_DIR,
        QR_DIR,
        PREVIEW_DIR,
        THUMBNAILS_DIR,
        OVERLAYS_DIR,
        PRINT_PHOTOS_DIR,
        ORIGINALS_DIR
    ];

    let success = true;

    for (const dir of directories) {
        try {
            if (!fs.existsSync(dir)) {
                console.log(`Creating directory: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            }
        } catch (err) {
            console.error(`Failed to create directory ${dir}:`, err);
            success = false;
        }
    }

    return success;
}

// Create required directories
createRequiredDirectories();

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

// Process photos in two formats - with A5 LANDSCAPE (1.414:1 aspect ratio)
async function processPhotoWithDualFormats(sourceFilePath, filename) {
    // Paths for different versions
    const originalFilename = `original_${filename}`;
    const printFilename = `print_${filename}`;
    const originalPath = path.join(ORIGINALS_DIR, originalFilename);
    const printPath = path.join(PRINT_PHOTOS_DIR, printFilename);
    const publicPath = path.join(PHOTOS_DIR, filename); // Publicly visible version

    try {
        // Verify source file exists before proceeding
        if (!fs.existsSync(sourceFilePath)) {
            console.error(`Source file does not exist: ${sourceFilePath}`);
            return {
                publicPath: sourceFilePath,
                publicUrl: `/photos/${filename}`,
                thumbnailUrl: null,
                overlayApplied: false
            };
        }

        // Ensure all required directories exist
        createRequiredDirectories();

        // 1. Original image save (unmodified)
        try {
            await fs.promises.copyFile(sourceFilePath, originalPath);
            console.log(`Original saved: ${originalPath}`);
        } catch (copyError) {
            console.error(`Failed to save original: ${copyError.message}`);
            // Continue processing even if original save fails
        }

        // 2. A5-Format version for print - LANDSCAPE (1.414:1 aspect ratio)
        try {
            await sharp(sourceFilePath)
                .resize({
                    width: 2480,         // ~A5 at 300dpi
                    height: 1748,        // A5-landscape (1.414:1)
                    fit: 'contain',      // Fit image in frame without cropping
                    background: { r: 255, g: 255, b: 255 } // White background
                })
                .jpeg({ quality: 90 })
                .toFile(printPath);
            console.log(`Print version saved: ${printPath}`);
        } catch (printError) {
            console.error(`Failed to create print version: ${printError.message}`);
            // Copy the original as fallback if print version fails
            try {
                await fs.promises.copyFile(sourceFilePath, printPath);
            } catch (fallbackError) {
                console.error(`Failed to create fallback print version: ${fallbackError.message}`);
            }
        }

        // 3. Create main version with standard frame
        let overlayApplied = false;
        const defaultOverlayPath = path.join(OVERLAYS_DIR, 'wedding-frame.png');

        if (fs.existsSync(defaultOverlayPath)) {
            try {
                // Apply frame to the print version and save as public version
                const success = await applyOverlayToImage(printPath, defaultOverlayPath, publicPath);
                overlayApplied = success;
                console.log(`Frame applied to photo: ${success ? 'Success' : 'Failed'}`);
            } catch (overlayError) {
                console.error('Error applying default overlay:', overlayError);
                // If frame application fails, copy print version as fallback
                try {
                    await fs.promises.copyFile(printPath, publicPath);
                } catch (fallbackError) {
                    console.error(`Failed to create fallback public version: ${fallbackError.message}`);
                    // Final fallback - copy original if all else fails
                    try {
                        await fs.promises.copyFile(sourceFilePath, publicPath);
                    } catch (finalFallbackError) {
                        console.error(`Final fallback copy failed: ${finalFallbackError.message}`);
                    }
                }
            }
        } else {
            console.warn('No wedding frame overlay found. Using print version without frame.');
            // No overlay available, copy print version as public version
            try {
                await fs.promises.copyFile(printPath, publicPath);
            } catch (copyError) {
                console.error(`Failed to copy print version to public: ${copyError.message}`);
                // Last resort - copy original if all else fails
                try {
                    await fs.promises.copyFile(sourceFilePath, publicPath);
                } catch (finalCopyError) {
                    console.error(`Final copy attempt failed: ${finalCopyError.message}`);
                }
            }
        }

        // 4. Generate thumbnail for gallery view
        let thumbnailUrl = null;
        try {
            thumbnailUrl = await generateThumbnail(publicPath, filename);
            console.log(`Thumbnail created: ${thumbnailUrl}`);
        } catch (thumbnailError) {
            console.error(`Thumbnail generation failed: ${thumbnailError.message}`);
        }

        return {
            originalPath: originalPath,
            originalUrl: `/photos/originals/${originalFilename}`,
            printPath: printPath,
            printUrl: `/photos/print/${printFilename}`,
            publicPath: publicPath,
            publicUrl: `/photos/${filename}`,
            thumbnailUrl: thumbnailUrl,
            overlayApplied: overlayApplied
        };
    } catch (error) {
        console.error('Error processing photo with dual formats:', error);
        // Return what we can even if processing failed
        return {
            publicPath: sourceFilePath,
            publicUrl: `/photos/${filename}`,
            thumbnailUrl: null,
            overlayApplied: false
        };
    }
}

// Improved overlay application function
async function applyOverlayToImage(sourceImagePath, overlayImagePath, outputPath) {
    try {
        // Check if this is an Instagram overlay
        const overlayFilename = path.basename(overlayImagePath);
        if (overlayFilename.startsWith('instagram')) {
            return processInstagramPhoto(sourceImagePath, overlayImagePath, outputPath);
        }

        // Ensure source image exists
        if (!fs.existsSync(sourceImagePath)) {
            console.error(`Source image not found: ${sourceImagePath}`);
            return false;
        }

        // Ensure overlay exists
        if (!fs.existsSync(overlayImagePath)) {
            console.error(`Overlay not found: ${overlayImagePath}`);
            return false;
        }

        // Standard overlay process
        const metadata = await sharp(sourceImagePath).metadata();

        // Resize overlay to match source image dimensions
        const resizedOverlay = await sharp(overlayImagePath)
            .resize(metadata.width, metadata.height, {
                fit: 'fill'
            })
            .toBuffer();

        // Composite them together
        await sharp(sourceImagePath)
            .composite([
                { input: resizedOverlay, gravity: 'center' }
            ])
            .jpeg({ quality: 95 })
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error applying overlay:', error);
        return false;
    }
}

// Updated thumbnail generation function
async function generateThumbnail(sourceFilePath, filename) {
    // Ensure thumbnail directory exists
    if (!fs.existsSync(THUMBNAILS_DIR)) {
        fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);

    // Skip if thumbnail already exists
    if (fs.existsSync(thumbnailPath)) {
        return `/thumbnails/thumb_${filename}`;
    }

    // Ensure source file exists
    if (!fs.existsSync(sourceFilePath)) {
        console.error(`Input file is missing: ${sourceFilePath}`);
        return null;
    }

    try {
        await sharp(sourceFilePath)
            .resize({
                width: 424,         // A5-landscape (1.414:1)
                height: 300,
                fit: 'contain',     // Don't crop image
                background: { r: 255, g: 255, b: 255 } // White background
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

// Process Instagram photos (9:16 aspect ratio)
async function processInstagramPhoto(sourceImagePath, overlayImagePath, outputPath) {
    try {
        // Ensure source image exists
        if (!fs.existsSync(sourceImagePath)) {
            console.error(`Source image for Instagram format not found: ${sourceImagePath}`);
            return false;
        }

        // Ensure overlay exists
        if (!fs.existsSync(overlayImagePath)) {
            console.error(`Instagram overlay not found: ${overlayImagePath}`);
            return false;
        }

        // Instagram uses 9:16 aspect ratio
        const targetWidth = 1080;  // Instagram recommended width
        const targetHeight = 1920; // 9:16 ratio for stories

        // First, create a white background canvas with Instagram dimensions
        const canvas = await sharp({
            create: {
                width: targetWidth,
                height: targetHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
            }
        })
            .jpeg()
            .toBuffer();

        // Get metadata of source image to determine resizing approach
        const imageMetadata = await sharp(sourceImagePath).metadata();

        // Determine if image is portrait or landscape to adapt filling strategy
        const isPortrait = imageMetadata.height > imageMetadata.width;

        // Resize source image to fit Instagram dimensions while preserving aspect ratio
        // For portrait (vertical) images, fit by height
        // For landscape (horizontal) images, fit by width
        const resizedImage = await sharp(sourceImagePath)
            .resize({
                width: isPortrait ? null : targetWidth,
                height: isPortrait ? targetHeight : null,
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .toBuffer();

        // Composite resized image centered on the white canvas
        const withPhotoComposite = await sharp(canvas)
            .composite([
                {
                    input: resizedImage,
                    gravity: 'center'
                }
            ])
            .toBuffer();

        // Now apply the Instagram overlay on top
        // The overlay should cover the entire image
        // Resize overlay to exactly match target dimensions
        const resizedOverlay = await sharp(overlayImagePath)
            .resize({
                width: targetWidth,
                height: targetHeight,
                fit: 'cover'  // Fill entire space
            })
            .toBuffer();

        // Final composite with the overlay on top
        await sharp(withPhotoComposite)
            .composite([
                {
                    input: resizedOverlay,
                    gravity: 'center',
                    // Use 'overlay' blend mode to preserve transparent areas in overlay
                    blend: 'over'
                }
            ])
            .jpeg({ quality: 95 })
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error processing Instagram photo:', error);
        return false;
    }
}

// Ensure Instagram frame exists or create a default one
async function ensureInstagramFrameExists() {
    const instagramFramePath = path.join(OVERLAYS_DIR, 'instagram-frame.png');

    // Check if Instagram frame exists
    if (!fs.existsSync(instagramFramePath)) {
        console.log('Instagram frame not found, creating a default one...');

        try {
            // Create a simple default Instagram frame with 9:16 aspect ratio
            const width = 1080;
            const height = 1920;

            // Inner transparent area dimensions
            const innerWidth = Math.floor(width * 0.8);
            const innerHeight = Math.floor(height * 0.6);

            // Create a gradient frame around the transparent area
            const canvas = sharp({
                create: {
                    width: width,
                    height: height,
                    channels: 4,
                    background: { r: 176, g: 137, b: 104, alpha: 1 }  // wedding-love color
                }
            });

            // Create a transparent rectangle for the center
            const transparentCenter = Buffer.from(
                `<svg width="${width}" height="${height}">
                    <rect x="${(width - innerWidth) / 2}" y="${(height - innerHeight) / 2}" 
                          width="${innerWidth}" height="${innerHeight}" 
                          fill="rgba(0,0,0,0)" />
                </svg>`
            );

            // Apply the transparent center to the canvas
            await canvas
                .composite([
                    {
                        input: transparentCenter,
                        blend: 'dest-out'  // Cut out the transparent center
                    }
                ])
                .png()
                .toFile(instagramFramePath);

            console.log('Default Instagram frame created successfully.');
            return true;
        } catch (error) {
            console.error('Error creating default Instagram frame:', error);
            return false;
        }
    }

    return true;
}

// API Endpoints

// Serve photo files with proper headers
app.get('/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    let filepath;

    // Determine which directory contains the photo
    if (filename.startsWith('original_')) {
        filepath = path.join(ORIGINALS_DIR, filename);
    } else if (filename.startsWith('print_')) {
        filepath = path.join(PRINT_PHOTOS_DIR, filename);
    } else {
        filepath = path.join(PHOTOS_DIR, filename);
    }

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('Photo not found');
    }

    // Set proper headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'image/jpeg');

    // Send the file
    res.sendFile(filepath);
});

// Serve QR codes with proper cache control
app.get('/qrcodes/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(QR_DIR, filename);

    if (!fs.existsSync(filepath)) {
        return res.status(404).send('QR code not found');
    }

    // Set proper headers to prevent caching issues with QR codes
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Type', 'image/png');

    // Send the file
    res.sendFile(filepath);
});

// Get camera and webcam status
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
    const type = req.query.type || 'framed'; // 'framed', 'original', 'print'

    // Select directory based on type
    let dirToScan;
    switch (type) {
        case 'original':
            dirToScan = ORIGINALS_DIR;
            break;
        case 'print':
            dirToScan = PRINT_PHOTOS_DIR;
            break;
        case 'framed':
        default:
            dirToScan = PHOTOS_DIR;
            break;
    }

    // Ensure directory exists
    if (!fs.existsSync(dirToScan)) {
        return res.json([]);
    }

    fs.readdir(dirToScan, (err, files) => {
        if (err) {
            return res.status(500).json({error: 'Error retrieving photos'});
        }

        // Filter for image files
        const photoFiles = files.filter(file =>
            /\.(jpg|jpeg|png)$/i.test(file)
        );

        // Add metadata and sort by newest first
        const photos = photoFiles.map(file => {
            try {
                const stats = fs.statSync(path.join(dirToScan, file));
                const baseFilename = file.replace(/^(original_|print_|instagram_|frame_)/, '');

                return {
                    filename: file,
                    baseFilename: baseFilename,
                    url: type === 'original'
                        ? `/photos/originals/${file}`
                        : (type === 'print' ? `/photos/print/${file}` : `/photos/${file}`),
                    originalUrl: `/photos/originals/original_${baseFilename}`,
                    printUrl: `/photos/print/print_${baseFilename}`,
                    thumbnailUrl: `/thumbnails/thumb_${baseFilename}`,
                    qrUrl: `/qrcodes/qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`,
                    timestamp: stats.mtime.getTime()
                };
            } catch (error) {
                console.error(`Error processing photo ${file}:`, error);
                return null;
            }
        }).filter(photo => photo !== null).sort((a, b) => b.timestamp - a.timestamp);

        res.json(photos);
    });
});

// Get a single photo by ID
app.get('/api/photos/:photoId', (req, res) => {
    const photoId = req.params.photoId;

    // Input validation
    if (!photoId || typeof photoId !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Invalid photo ID'
        });
    }

    // Determine which version this is
    let filepath;
    let isOriginal = false;
    let isInstagram = false;
    let isCustomFrame = false;

    if (photoId.startsWith('original_')) {
        filepath = path.join(ORIGINALS_DIR, photoId);
        isOriginal = true;
    } else if (photoId.startsWith('print_')) {
        filepath = path.join(PRINT_PHOTOS_DIR, photoId);
    } else if (photoId.startsWith('instagram_')) {
        filepath = path.join(PHOTOS_DIR, photoId);
        isInstagram = true;
    } else if (photoId.startsWith('frame_')) {
        filepath = path.join(PHOTOS_DIR, photoId);
        isCustomFrame = true;
    } else {
        filepath = path.join(PHOTOS_DIR, photoId);
    }

    // Check if file exists
    if (!fs.existsSync(filepath)) {
        console.log(`Photo not found: ${photoId}`);

        // Try to find in other directories if this is not a special version
        if (!photoId.startsWith('original_') && !photoId.startsWith('print_') &&
            !photoId.startsWith('instagram_') && !photoId.startsWith('frame_')) {

            const baseId = photoId;
            const originalPath = path.join(ORIGINALS_DIR, `original_${baseId}`);
            const printPath = path.join(PRINT_PHOTOS_DIR, `print_${baseId}`);

            if (fs.existsSync(originalPath)) {
                filepath = originalPath;
                isOriginal = true;
            } else if (fs.existsSync(printPath)) {
                filepath = printPath;
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

        // Get base filename (without prefixes)
        const baseFilename = photoId.replace(/^(original_|print_|instagram_|frame_)/, '');

        // Generate QR code filename
        const qrFilename = `qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`;

        // Check if thumbnail exists
        const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${baseFilename}`);
        const hasThumbnail = fs.existsSync(thumbnailPath);

        // Get client domain for photo view URL
        const clientDomain = req.headers.host || 'fotobox.slyrix.com';

        // Different URLs for different versions
        let normalUrl = `/photos/${baseFilename}`;
        let originalUrl = `/photos/originals/original_${baseFilename}`;
        let printUrl = `/photos/print/print_${baseFilename}`;
        let instagramUrl = `/photos/instagram_${baseFilename}`;

        // Create the correct photo view URL
        let photoViewUrl;
        if (isOriginal) {
            photoViewUrl = `https://${clientDomain}/photo/original_${baseFilename}`;
        } else if (isInstagram) {
            photoViewUrl = `https://${clientDomain}/photo/instagram_${baseFilename}`;
        } else if (isCustomFrame) {
            photoViewUrl = `https://${clientDomain}/photo/${photoId}`;
        } else {
            photoViewUrl = `https://${clientDomain}/photo/${baseFilename}`;
        }

        // Return photo data
        res.json({
            success: true,
            filename: photoId,
            url: isOriginal ? originalUrl : (isInstagram ? instagramUrl : `/photos/${photoId}`),
            originalUrl: originalUrl,
            printUrl: printUrl,
            thumbnailUrl: hasThumbnail ? `/thumbnails/thumb_${baseFilename}` : null,
            qrUrl: `/qrcodes/${qrFilename}`,
            photoViewUrl: photoViewUrl,
            isOriginal: isOriginal,
            isInstagram: isInstagram,
            isCustomFrame: isCustomFrame,
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

        if (error || (stderr && stderr.includes('ERROR'))) {
            console.error(`Error taking photo: ${error ? error.message : stderr}`);

            // Fall back to webcam as backup
            const fallbackCommand = `fswebcam -d /dev/video0 -r 1920x1080 --fps 30 --no-banner -S 3 -F 3 --jpeg 95 "${filepath}"`;

            exec(fallbackCommand, async (fbError, fbStdout, fbStderr) => {
                captureInProgress.status = false;

                if (fbError) {
                    return res.status(500).json({
                        success: false,
                        error: 'Photo capture failed with both camera and webcam'
                    });
                }

                console.log(`Photo taken with webcam fallback`);

                try {
                    // Process dual-format photo from webcam capture
                    const processedPhotos = await processPhotoWithDualFormats(filepath, filename);

                    // Increment photo counter for mosaic generation
                    photoCounter++;
                    console.log(`Photo counter: ${photoCounter}`);

                    // Regenerate mosaic on schedule
                    if (photoCounter % MOSAIC_PHOTO_INTERVAL === 0) {
                        console.log(`Captured ${photoCounter} photos. Regenerating mosaic.`);
                        regenerateMosaicInBackground();
                    }

                    // Generate QR code and respond
                    generateQRAndRespond(req, res, filename, timestamp, processedPhotos);
                } catch (err) {
                    console.error('Error in dual-format processing:', err);
                    // Try standard processing as fallback
                    generateQRAndRespond(req, res, filename, timestamp);
                }
            });

            return;
        }

        captureInProgress.status = false;
        console.log(`Photo successfully taken with camera: ${filename}`);

        // Process dual-format for camera capture
        processPhotoWithDualFormats(filepath, filename)
            .then(processedPhotos => {
                // Increment photo counter for mosaic generation
                photoCounter++;
                console.log(`Photo counter: ${photoCounter}`);

                // Regenerate mosaic on schedule
                if (photoCounter % MOSAIC_PHOTO_INTERVAL === 0) {
                    console.log(`Regenerating mosaic`);
                    regenerateMosaicInBackground();
                }

                // Generate QR code and respond
                generateQRAndRespond(req, res, filename, timestamp, processedPhotos);
            })
            .catch(err => {
                console.error('Error in dual-format processing:', err);
                // Try standard processing as fallback
                generateQRAndRespond(req, res, filename, timestamp);
            });
    });
});

// Helper function to regenerate mosaic in background
function regenerateMosaicInBackground() {
    try {
        // Check if we have enough photos for a mosaic
        if (!fs.existsSync(THUMBNAILS_DIR)) {
            console.log('Thumbnail directory not found, skipping mosaic generation');
            return;
        }

        const files = fs.readdirSync(THUMBNAILS_DIR);
        const photoCount = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file)).length;

        if (photoCount >= 10) {
            // Use the internal URL for the server to call itself
            const serverUrl = `http://localhost:${PORT}/api/mosaic?t=${Date.now()}`;
            console.log('Triggering mosaic regeneration');

            // Make the request without waiting for response
            fetch(serverUrl)
                .then(response => {
                    if (response.ok) {
                        console.log('Mosaic regenerated successfully');
                    } else {
                        console.log('Mosaic regeneration returned status:', response.status);
                    }
                })
                .catch(err => console.error('Error regenerating mosaic:', err));
        } else {
            console.log(`Not enough photos for mosaic (${photoCount}/10)`);
        }
    } catch (error) {
        console.error('Error in regenerateMosaicInBackground:', error);
    }
}

// Fixed QR code generation function
async function generateQRAndRespond(req, res, filename, timestamp, processedPhotos = null) {
    try {
        // Get the base filename WITHOUT removing file extension (keep the .jpg)
        const baseFilename = filename;

        // Get the client domain
        const clientDomain = 'fotobox.slyrix.com';

        // Create the correct photo URL - exactly matching the format shown in admin dashboard
        const photoViewUrl = `https://${clientDomain}/photo/${baseFilename}`;

        console.log(`Generating QR code for URL: ${photoViewUrl}`);

        const qrFilename = `qr_${timestamp}.png`;
        const qrFilepath = path.join(QR_DIR, qrFilename);

        // Ensure QR directory exists
        if (!fs.existsSync(QR_DIR)) {
            fs.mkdirSync(QR_DIR, { recursive: true });
        }

        // Generate or get thumbnail URL
        let thumbnailUrl = null;
        if (processedPhotos && processedPhotos.thumbnailUrl) {
            thumbnailUrl = processedPhotos.thumbnailUrl;
        } else {
            const photoPath = path.join(PHOTOS_DIR, filename);
            if (fs.existsSync(photoPath)) {
                thumbnailUrl = await generateThumbnail(photoPath, filename);
            }
        }

        // Generate QR code
        QRCode.toFile(qrFilepath, photoViewUrl, {
            color: {
                dark: '#000',  // QR points
                light: '#FFF'  // Background
            },
            margin: 1,
            width: 300  // Larger QR for better scanning
        }, (qrErr) => {
            if (qrErr) {
                console.error(`Error generating QR code: ${qrErr.message}`);
            }

            // Send response with all URLs
            res.json({
                success: true,
                photo: {
                    filename: filename,
                    url: processedPhotos ? processedPhotos.publicUrl : `/photos/${filename}`,
                    thumbnailUrl: thumbnailUrl || `/photos/${filename}`, // Fallback to original if thumbnail fails
                    qrUrl: `/qrcodes/${qrFilename}`,
                    photoViewUrl: photoViewUrl,  // Include the actual URL the QR code points to
                    timestamp: Date.now()
                }
            });
        });
    } catch (error) {
        console.error('Error in generateQRAndRespond:', error);
        // Send a basic response in case of error
        res.json({
            success: true,
            photo: {
                filename: filename,
                url: `/photos/${filename}`,
                thumbnailUrl: null,
                qrUrl: null,
                timestamp: Date.now()
            }
        });
    }
}

// Delete a photo (all versions)
app.delete('/api/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const baseFilename = filename.replace(/^(original_|print_|instagram_|frame_)/, '');

    const filepaths = [
        path.join(PHOTOS_DIR, baseFilename),                        // Standard version
        path.join(PHOTOS_DIR, `instagram_${baseFilename}`),        // Instagram version
        path.join(PHOTOS_DIR, `frame_${baseFilename}`),            // Custom frame version
        path.join(ORIGINALS_DIR, `original_${baseFilename}`),      // Original version
        path.join(PRINT_PHOTOS_DIR, `print_${baseFilename}`),      // Print version
        path.join(THUMBNAILS_DIR, `thumb_${baseFilename}`)         // Thumbnail
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

    // Also delete QR code
    const qrPath = path.join(QR_DIR, `qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`);
    if (fs.existsSync(qrPath)) {
        try {
            fs.unlinkSync(qrPath);
            console.log(`Deleted QR code: ${qrPath}`);
        } catch (err) {
            console.error(`Error deleting QR code ${qrPath}:`, err);
            // Not treating QR code deletion failure as critical
        }
    }

    if (success) {
        res.json({success: true, message: 'All photo versions deleted successfully'});
    } else {
        res.status(500).json({success: false, error: errorMessage});
    }
});

// Send print request
app.post('/api/photos/print', (req, res) => {
    const {filename} = req.body;

    if (!filename) {
        return res.status(400).json({error: 'Filename is required'});
    }

    // Use print version (A5 landscape) for printing
    const printFilename = filename.startsWith('print_') ? filename : `print_${filename.replace(/^(instagram_|frame_)/, '')}`;

    console.log(`Print request received for: ${printFilename}`);

    res.json({
        success: true,
        message: 'Print request received. Printing functionality will be implemented later.'
    });
});

// Generate thumbnails for all photos
app.get('/api/admin/generate-thumbnails', async (req, res) => {
    try {
        if (!fs.existsSync(PHOTOS_DIR)) {
            return res.json({
                success: true,
                message: 'No photos directory found.'
            });
        }

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

// Apply overlay to a photo
app.post('/api/photos/:photoId/overlay', async (req, res) => {
    const photoId = req.params.photoId;
    const overlayName = req.body.overlayName;
    const createNewVersion = req.body.createNewVersion || false;

    // Validate inputs
    if (!photoId || !overlayName) {
        return res.status(400).json({
            success: false,
            error: 'Photo ID and frame name are required'
        });
    }

    // Determine correct paths
    let baseFilename, sourcePhotoPath, targetPhotoPath;

    // Extract base filename (remove any prefixes)
    if (photoId.startsWith('instagram_') || photoId.startsWith('frame_')) {
        baseFilename = photoId.substring(photoId.indexOf('_') + 1);
    } else {
        baseFilename = photoId;
    }

    // Source is always the original photo (which has no frame)
    const originalPath = path.join(ORIGINALS_DIR, `original_${baseFilename}`);
    const standardPath = path.join(PHOTOS_DIR, baseFilename);

    // Use original if available, otherwise use standard
    if (fs.existsSync(originalPath)) {
        sourcePhotoPath = originalPath;
    } else if (fs.existsSync(standardPath)) {
        sourcePhotoPath = standardPath;
    } else {
        return res.status(404).json({
            success: false,
            error: 'Source photo not found'
        });
    }

    // Determine target filename based on overlay type
    let targetFilename;
    if (overlayName === 'instagram-frame.png') {
        targetFilename = `instagram_${baseFilename}`;
    } else if (overlayName !== 'wedding-frame.png') {
        targetFilename = `frame_${baseFilename}`;
    } else {
        targetFilename = baseFilename; // Standard frame - just use the base filename
    }

    targetPhotoPath = path.join(PHOTOS_DIR, targetFilename);

    // Check if overlay exists
    const overlayPath = path.join(OVERLAYS_DIR, overlayName);
    if (!fs.existsSync(overlayPath)) {
        return res.status(404).json({
            success: false,
            error: 'Frame not found'
        });
    }

    try {
        // Apply overlay to photo
        let success;

        if (overlayName === 'instagram-frame.png') {
            // Process as Instagram format (9:16)
            success = await processInstagramPhoto(sourcePhotoPath, overlayPath, targetPhotoPath);
        } else {
            // Process as standard or custom frame
            success = await applyOverlayToImage(sourcePhotoPath, overlayPath, targetPhotoPath);
        }

        if (success) {
            // Regenerate thumbnail for the new version
            const thumbnailUrl = await generateThumbnail(targetPhotoPath, targetFilename);

            return res.json({
                success: true,
                message: 'Frame applied successfully',
                photoId: targetFilename,
                url: `/photos/${targetFilename}`,
                thumbnailUrl: thumbnailUrl
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Failed to apply frame'
            });
        }
    } catch (error) {
        console.error('Error applying frame:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error applying frame'
        });
    }
});

// Upload a new overlay/frame
app.post('/api/admin/overlays', upload.single('overlay'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            error: 'No frame image uploaded'
        });
    }

    const overlayType = req.body.type || 'custom'; // standard, instagram, custom
    let overlayName;

    // Set the correct name based on type
    if (overlayType === 'standard') {
        overlayName = 'wedding-frame.png';
    } else if (overlayType === 'instagram') {
        overlayName = 'instagram-frame.png';
    } else {
        // Custom frame - use provided name or generate one
        overlayName = req.body.name || `custom-frame-${Date.now()}.png`;
    }

    // Ensure overlays directory exists
    if (!fs.existsSync(OVERLAYS_DIR)) {
        fs.mkdirSync(OVERLAYS_DIR, { recursive: true });
    }

    const overlayPath = path.join(OVERLAYS_DIR, overlayName);

    try {
        // Process the image based on type
        if (overlayType === 'instagram') {
            // For Instagram frames - ensure it has correct 9:16 ratio
            try {
                const instagramOverlay = await sharp(req.file.buffer)
                    .resize({
                        width: 1080,  // Instagram recommended width
                        height: 1920, // 9:16 ratio
                        fit: 'fill'   // Fill the entire space
                    })
                    .png()
                    .toBuffer();

                // Save the processed Instagram overlay
                fs.writeFileSync(overlayPath, instagramOverlay);
            } catch (processError) {
                console.error('Error processing Instagram frame:', processError);
                // Fall back to saving the original if processing fails
                fs.writeFileSync(overlayPath, req.file.buffer);
            }
        } else {
            // Standard and custom frames - save as is
            fs.writeFileSync(overlayPath, req.file.buffer);
        }

        return res.json({
            success: true,
            message: 'Frame uploaded successfully',
            name: overlayName,
            type: overlayType,
            url: `/overlays/${overlayName}`
        });
    } catch (error) {
        console.error('Error saving frame:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error saving frame'
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

// Delete an overlay/frame
app.delete('/api/admin/overlays/:name', async (req, res) => {
    const overlayName = req.params.name;

    // Don't allow deleting the main wedding frame or Instagram frame
    if (overlayName === 'wedding-frame.png' || overlayName === 'instagram-frame.png') {
        return res.status(400).json({
            success: false,
            error: `Cannot delete the ${overlayName === 'wedding-frame.png' ? 'standard' : 'Instagram'} frame. You can only replace it.`
        });
    }

    const overlayPath = path.join(OVERLAYS_DIR, overlayName);

    // Check if overlay exists
    if (!fs.existsSync(overlayPath)) {
        return res.status(404).json({
            success: false,
            error: 'Frame not found'
        });
    }

    try {
        // Delete the overlay file
        fs.unlinkSync(overlayPath);

        return res.json({
            success: true,
            message: 'Frame deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting frame:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error deleting frame'
        });
    }
});

// Generate mosaic from thumbnails
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

        // Determine how many photos to use
        let photoCount = photoFiles.length; // Use all available photos

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

// Get mosaic info
app.get('/api/mosaic/info', async (req, res) => {
    try {
        if (!fs.existsSync(THUMBNAILS_DIR)) {
            return res.json({
                success: true,
                photoCount: 0,
                requiredCount: 10,
                hasMosaic: false
            });
        }

        const files = fs.readdirSync(THUMBNAILS_DIR);
        const photoFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));

        const mosaicFilepath = path.join(PHOTOS_DIR, 'mosaic.png');
        const mosaicExists = fs.existsSync(mosaicFilepath);
        let mosaicStats = null;

        if (mosaicExists) {
            const stats = fs.statSync(mosaicFilepath);
            mosaicStats = {
                lastModified: stats.mtime,
                size: stats.size,
                url: '/photos/mosaic.png'
            };
        }

        res.json({
            success: true,
            photoCount: photoFiles.length,
            requiredCount: 10,
            hasMosaic: mosaicExists,
            mosaic: mosaicStats
        });
    } catch (error) {
        console.error('Error checking mosaic info:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check mosaic info'
        });
    }
});

// Add this code to your src/server/server.js file

// Object to store frame templates
const frameTemplates = {};

// Save or update a frame template
app.post('/api/admin/frame-templates', (req, res) => {
    const { overlayName, template } = req.body;

    if (!overlayName || !template) {
        return res.status(400).json({
            success: false,
            error: 'Overlay name and template settings are required'
        });
    }

    try {
        // Save the template
        frameTemplates[overlayName] = {
            scale: template.scale || 1,
            rotation: template.rotation || 0,
            positionX: template.positionX || 0,
            positionY: template.positionY || 0,
            timestamp: Date.now()
        };

        return res.json({
            success: true,
            message: 'Frame template saved successfully',
            templateName: overlayName
        });
    } catch (error) {
        console.error('Error saving frame template:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error saving frame template'
        });
    }
});

// Get a specific frame template
app.get('/api/admin/frame-templates/:overlayName', (req, res) => {
    const { overlayName } = req.params;

    if (frameTemplates[overlayName]) {
        return res.json({
            success: true,
            template: frameTemplates[overlayName]
        });
    }

    // Return 404 if template not found
    return res.status(404).json({
        success: false,
        error: 'Template not found for this frame'
    });
});

// Get all frame templates
app.get('/api/admin/frame-templates', (req, res) => {
    try {
        const templates = Object.keys(frameTemplates).map(key => ({
            name: key,
            ...frameTemplates[key]
        }));

        return res.json({
            success: true,
            templates
        });
    } catch (error) {
        console.error('Error fetching frame templates:', error);
        return res.status(500).json({
            success: false,
            error: 'Server error fetching frame templates'
        });
    }
});

// Delete a frame template
app.delete('/api/admin/frame-templates/:overlayName', (req, res) => {
    const { overlayName } = req.params;

    if (frameTemplates[overlayName]) {
        delete frameTemplates[overlayName];

        return res.json({
            success: true,
            message: 'Frame template deleted successfully'
        });
    }

    return res.status(404).json({
        success: false,
        error: 'Template not found for this frame'
    });
});

// Modify the existing applyOverlayToImage function to use templates
async function applyOverlayToImage(sourceImagePath, overlayImagePath, outputPath) {
    try {
        // Check if this is an Instagram overlay
        const overlayFilename = path.basename(overlayImagePath);

        // Check if there's a template for this overlay
        const template = frameTemplates[overlayFilename];

        if (template) {
            // Use the template to apply adjustments
            return await applyTemplatedOverlay(
                sourceImagePath,
                overlayImagePath,
                outputPath,
                template,
                overlayFilename
            );
        }

        // If no template exists, use the original function with default settings
        if (overlayFilename.startsWith('instagram')) {
            return processInstagramPhoto(sourceImagePath, overlayImagePath, outputPath);
        }

        // Ensure source image exists
        if (!fs.existsSync(sourceImagePath)) {
            console.error(`Source image not found: ${sourceImagePath}`);
            return false;
        }

        // Ensure overlay exists
        if (!fs.existsSync(overlayImagePath)) {
            console.error(`Overlay not found: ${overlayImagePath}`);
            return false;
        }

        // Standard overlay process
        const metadata = await sharp(sourceImagePath).metadata();

        // Resize overlay to match source image dimensions
        const resizedOverlay = await sharp(overlayImagePath)
            .resize(metadata.width, metadata.height, {
                fit: 'fill'
            })
            .toBuffer();

        // Composite them together
        await sharp(sourceImagePath)
            .composite([
                { input: resizedOverlay, gravity: 'center' }
            ])
            .jpeg({ quality: 95 })
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error applying overlay:', error);
        return false;
    }
}

// New function to apply overlay with template settings
async function applyTemplatedOverlay(sourceImagePath, overlayImagePath, outputPath, template, overlayName) {
    try {
        // Ensure source image exists
        if (!fs.existsSync(sourceImagePath)) {
            throw new Error(`Source image not found: ${sourceImagePath}`);
        }

        // Ensure overlay exists
        if (!fs.existsSync(overlayImagePath)) {
            throw new Error(`Overlay not found: ${overlayImagePath}`);
        }

        // Special handling for Instagram format
        if (overlayName === 'instagram-frame.png') {
            return await applyTemplatedInstagramOverlay(sourceImagePath, overlayImagePath, outputPath, template);
        }

        // Get metadata from the original photo
        const imgMetadata = await sharp(sourceImagePath).metadata();
        const overlayMetadata = await sharp(overlayImagePath).metadata();

        // Determine if the overlay is standard (A5 landscape) or custom
        const isStandardFormat = overlayName === 'wedding-frame.png';

        // Standard format dimensions are fixed at A5 landscape (1.414:1)
        let canvasWidth, canvasHeight;

        if (isStandardFormat) {
            // A5 landscape ratio
            canvasWidth = 2480;  // ~A5 at 300dpi
            canvasHeight = 1748; // A5-landscape (1.414:1)
        } else {
            // Custom frame - use the overlay's dimensions
            canvasWidth = overlayMetadata.width;
            canvasHeight = overlayMetadata.height;
        }

        // Calculate the center point for positioning
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;

        // Calculate scaled dimensions
        const scaledWidth = Math.round(imgMetadata.width * template.scale);
        const scaledHeight = Math.round(imgMetadata.height * template.scale);

        // Create a buffer of the scaled and rotated source image
        const processedImage = await sharp(sourceImagePath)
            .resize({
                width: scaledWidth,
                height: scaledHeight,
                fit: 'fill'
            })
            .rotate(template.rotation, {
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background for rotation
            })
            .toBuffer();

        // Create a white background canvas
        const canvas = await sharp({
            create: {
                width: canvasWidth,
                height: canvasHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
            }
        }).toBuffer();

        // Position the processed image on the canvas according to template
        const withPhotoComposite = await sharp(canvas)
            .composite([
                {
                    input: processedImage,
                    left: Math.round(centerX - (scaledWidth / 2) + template.positionX),
                    top: Math.round(centerY - (scaledHeight / 2) + template.positionY)
                }
            ])
            .toBuffer();

        // Add the overlay on top
        await sharp(withPhotoComposite)
            .composite([
                {
                    input: overlayImagePath,
                    gravity: 'center'
                }
            ])
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error applying templated overlay:', error);
        throw error;
    }
}

// Special function for applying Instagram templates
async function applyTemplatedInstagramOverlay(sourceImagePath, overlayImagePath, outputPath, template) {
    try {
        // Instagram uses 9:16 aspect ratio
        const targetWidth = 1080;  // Instagram recommended width
        const targetHeight = 1920; // 9:16 ratio for stories

        // Get metadata from the original photo
        const imgMetadata = await sharp(sourceImagePath).metadata();

        // Calculate the center point
        const centerX = targetWidth / 2;
        const centerY = targetHeight / 2;

        // Calculate scaled dimensions
        const scaledWidth = Math.round(imgMetadata.width * template.scale);
        const scaledHeight = Math.round(imgMetadata.height * template.scale);

        // Create a buffer of the scaled and rotated source image
        const processedImage = await sharp(sourceImagePath)
            .resize({
                width: scaledWidth,
                height: scaledHeight,
                fit: 'fill'
            })
            .rotate(template.rotation, {
                background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background for rotation
            })
            .toBuffer();

        // Create a white background canvas with Instagram dimensions
        const canvas = await sharp({
            create: {
                width: targetWidth,
                height: targetHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 1 } // White background
            }
        }).toBuffer();

        // Position the processed image on the canvas according to template
        const withPhotoComposite = await sharp(canvas)
            .composite([
                {
                    input: processedImage,
                    left: Math.round(centerX - (scaledWidth / 2) + template.positionX),
                    top: Math.round(centerY - (scaledHeight / 2) + template.positionY)
                }
            ])
            .toBuffer();

        // Add the Instagram overlay on top
        await sharp(withPhotoComposite)
            .composite([
                {
                    input: overlayImagePath,
                    gravity: 'center'
                }
            ])
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error applying templated Instagram overlay:', error);
        throw error;
    }
}

// Create HTTP server and attach WebSocket server
const server = http.createServer(app);
setupWebSocketServer(server);

// Start the server
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);

    // Create all required directories first
    const directoriesCreated = createRequiredDirectories();
    if (!directoriesCreated) {
        console.error('WARNING: Some directories could not be created. File operations may fail.');
    }

    console.log(`Photos directory: ${PHOTOS_DIR}`);
    console.log(`QR codes directory: ${QR_DIR}`);
    console.log(`Overlays directory: ${OVERLAYS_DIR}`);
    console.log(`Print versions directory: ${PRINT_PHOTOS_DIR}`);
    console.log(`Original photos directory: ${ORIGINALS_DIR}`);

    // Check for required frames
    const weddingFramePath = path.join(OVERLAYS_DIR, 'wedding-frame.png');
    if (!fs.existsSync(weddingFramePath)) {
        console.log('Warning: Standard wedding frame not found at:', weddingFramePath);
        console.log('Please upload a standard wedding frame via the admin interface.');
    }

    // Check and create Instagram frame if needed
    await ensureInstagramFrameExists();
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    if (previewInterval) {
        clearInterval(previewInterval);
    }
    process.exit();
});