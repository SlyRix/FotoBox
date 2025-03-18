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
// Neue Verzeichnispfade für Dual-Format-Fotos
const PRINT_PHOTOS_DIR = path.join(__dirname, 'public', 'photos', 'print');
const ORIGINALS_DIR = path.join(__dirname, 'public', 'photos', 'originals');

// Create required directories
[PHOTOS_DIR, QR_DIR, PREVIEW_DIR, THUMBNAILS_DIR, OVERLAYS_DIR, PRINT_PHOTOS_DIR, ORIGINALS_DIR].forEach(dir => {
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

// Neue Funktion zur Verarbeitung von Fotos in zwei Formaten - mit A5 QUERFORMAT
async function processPhotoWithDualFormats(sourceFilePath, filename) {
    // Pfade für verschiedene Versionen
    const originalFilename = `original_${filename}`;
    const printFilename = `print_${filename}`;
    const originalPath = path.join(ORIGINALS_DIR, originalFilename);
    const printPath = path.join(PRINT_PHOTOS_DIR, printFilename);
    const publicPath = path.join(PHOTOS_DIR, filename); // Öffentlich sichtbare Version

    try {
        // 1. Originalbild speichern (unverändert)
        await fs.promises.copyFile(sourceFilePath, originalPath);

        // 2. A5-Format-Version für den Druck erstellen - QUERFORMAT (1.414:1 Seitenverhältnis)
        await sharp(sourceFilePath)
            .resize({
                width: 2480,         // ~A5 bei 300dpi
                height: 1748,        // A5-Querformat (1.414:1)
                fit: 'contain',      // Bild in den Rahmen einpassen ohne Beschneiden
                background: { r: 255, g: 255, b: 255 } // Weißer Hintergrund statt schwarz
            })
            .jpeg({ quality: 90 })
            .toFile(printPath);

        // 3. Hauptversion (mit Rahmen) erstellen - diese wird in der App angezeigt
        // Overlay prüfen und anwenden
        const defaultOverlayPath = path.join(OVERLAYS_DIR, 'wedding-frame.png');
        let overlayApplied = false;

        if (fs.existsSync(defaultOverlayPath)) {
            try {
                // Rahmen auf die A5-Version anwenden
                const success = await applyOverlayToImage(printPath, defaultOverlayPath, publicPath);
                overlayApplied = success;
            } catch (error) {
                console.error('Error applying default overlay:', error);
                // Bei Fehler A5-Version ohne Rahmen kopieren
                await fs.promises.copyFile(printPath, publicPath);
            }
        } else {
            // Kein Overlay verfügbar, A5-Version kopieren
            await fs.promises.copyFile(printPath, publicPath);
        }

        // 4. Thumbnail für Galerie-Ansicht erstellen
        const thumbnailUrl = await generateThumbnail(publicPath, filename);

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
        throw error;
    }
}

// Überarbeitete applyOverlayToImage-Funktion
async function applyOverlayToImage(sourceImagePath, overlayImagePath, outputPath) {
    try {
        // Dimensionen des Eingangsbilds abrufen
        const metadata = await sharp(sourceImagePath).metadata();

        // Overlay auf die Größe des Eingangsbilds anpassen
        const resizedOverlay = await sharp(overlayImagePath)
            .resize(metadata.width, metadata.height, {
                fit: 'fill'
            })
            .toBuffer();

        // Bilder übereinanderlegen
        await sharp(sourceImagePath)
            .composite([
                { input: resizedOverlay, gravity: 'center' }
            ])
            .jpeg({ quality: 95 }) // Höhere Qualität für bessere Rahmendetails
            .toFile(outputPath);

        return true;
    } catch (error) {
        console.error('Error applying overlay:', error);
        return false;
    }
}

// Aktualisierte Thumbnail-Generierungsfunktion - mit A5 QUERFORMAT
async function generateThumbnail(sourceFilePath, filename) {
    // Thumbnail-Verzeichnis erstellen, wenn es nicht existiert
    if (!fs.existsSync(THUMBNAILS_DIR)) {
        fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    }

    const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${filename}`);

    // Thumbnail nur generieren, wenn es noch nicht existiert
    if (!fs.existsSync(thumbnailPath)) {
        try {
            await sharp(sourceFilePath)
                .resize({
                    width: 424,         // A5-Querformat (1.414:1)
                    height: 300,
                    fit: 'contain',     // Bild nicht beschneiden
                    background: { r: 255, g: 255, b: 255 } // Weißer Hintergrund statt schwarz
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

app.get('/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    let filepath;

    // Bestimmen, in welchem Verzeichnis das Foto zu finden ist
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

// Get list of all photos - with Type-Parameter
app.get('/api/photos', (req, res) => {
    // Abfrageparameter für Typ abrufen (Standard: mit Rahmen)
    const type = req.query.type || 'framed'; // 'framed', 'original', 'print'

    // Verzeichnis basierend auf Typ auswählen
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

    fs.readdir(dirToScan, (err, files) => {
        if (err) {
            return res.status(500).json({error: 'Fehler beim Abrufen der Fotos'});
        }

        // Nach Bilddateien filtern
        const photoFiles = files.filter(file =>
            /\.(jpg|jpeg|png)$/i.test(file)
        );

        // Zeitstempel hinzufügen und nach neuesten sortieren
        const photos = photoFiles.map(file => {
            try {
                const stats = fs.statSync(path.join(dirToScan, file));
                const baseFilename = file.replace(/^(original_|print_)/, '');

                return {
                    filename: file,
                    baseFilename: baseFilename,
                    url: type === 'original'
                        ? `/photos/originals/${file}`
                        : (type === 'print' ? `/photos/print/${file}` : `/photos/${file}`),
                    originalUrl: `/photos/originals/original_${baseFilename}`,
                    printUrl: `/photos/print/print_${baseFilename}`,
                    thumbnailUrl: `/thumbnails/thumb_${baseFilename}`, // Thumbnail-URL hinzufügen
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

// Take a new photo - using gphoto2 for final capture - mit Dual-Format
app.post('/api/photos/capture', (req, res) => {
    // Prevent multiple simultaneous capture requests
    if (captureInProgress.status) {
        return res.status(429).json({
            success: false,
            error: 'Eine Fotoaufnahme ist bereits im Gange. Bitte versuche es in einem Moment noch einmal.'
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

        if (error || stderr.includes('ERROR')) {
            console.error(`Fehler bei der Fotoaufnahme: ${error ? error.message : stderr}`);

            // Bei gphoto2-Fehler auf Webcam als Backup zurückgreifen
            const fallbackCommand = `fswebcam -d /dev/video0 -r 1920x1080 --fps 30 --no-banner -S 3 -F 3 --jpeg 95 "${filepath}"`;

            exec(fallbackCommand, async (fbError, fbStdout, fbStderr) => {
                captureInProgress.status = false;

                if (fbError) {
                    return res.status(500).json({
                        success: false,
                        error: 'Fotoaufnahme sowohl mit Kamera als auch mit Webcam fehlgeschlagen'
                    });
                }

                console.log(`Foto mit Webcam als Fallback aufgenommen`);

                try {
                    // Dual-Format-Verarbeitung für das Webcam-Foto
                    const processedPhotos = await processPhotoWithDualFormats(filepath, filename);
                    generateQRAndRespond(req, res, filename, timestamp, processedPhotos);
                } catch (err) {
                    console.error('Fehler bei der Dual-Format-Verarbeitung:', err);
                    // Versuchen, mit Standardverarbeitung fortzufahren
                    generateQRAndRespond(req, res, filename, timestamp);
                }
            });

            return;
        }

        captureInProgress.status = false;
        console.log(`Foto erfolgreich mit Kamera aufgenommen: ${filename}`);

        // Dual-Format-Verarbeitung für die Kameraaufnahme
        processPhotoWithDualFormats(filepath, filename)
            .then(processedPhotos => {
                generateQRAndRespond(req, res, filename, timestamp, processedPhotos);
            })
            .catch(err => {
                console.error('Fehler bei der Dual-Format-Verarbeitung:', err);
                // Versuchen, mit Standardverarbeitung fortzufahren
                generateQRAndRespond(req, res, filename, timestamp);
            });
    });
});

// API-Endpunkt zum Abrufen eines einzelnen Fotos nach ID - mit allen Versionen
app.get('/api/photos/:photoId', (req, res) => {
    const photoId = req.params.photoId;

    // Eingabevalidierung
    if (!photoId || typeof photoId !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Ungültige Foto-ID'
        });
    }

    // Bestimmen, ob dies ein Original oder eine andere Variante ist
    let filepath;
    let isOriginal = false;

    if (photoId.startsWith('original_')) {
        // Original-Version angefordert
        filepath = path.join(ORIGINALS_DIR, photoId);
        isOriginal = true;
    } else if (photoId.startsWith('print_')) {
        // Druckbare Version angefordert
        filepath = path.join(PRINT_PHOTOS_DIR, photoId);
    } else {
        // Standard-Version (mit Rahmen) angefordert
        filepath = path.join(PHOTOS_DIR, photoId);
    }

    // Prüfen, ob die Datei existiert
    if (!fs.existsSync(filepath)) {
        console.log(`Foto nicht gefunden: ${photoId}`);

        // Wenn es sich um keine spezielle Version handelt, in anderen Ordnern suchen
        if (!photoId.startsWith('original_') && !photoId.startsWith('print_')) {
            // Nach gleicher Basis-ID in anderen Ordnern suchen
            const baseId = photoId.replace(/^(original_|print_)/, '');

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
                    error: 'Foto nicht gefunden'
                });
            }
        } else {
            return res.status(404).json({
                success: false,
                error: 'Foto nicht gefunden'
            });
        }
    }

    try {
        // Dateieigenschaften für Zeitstempel abrufen
        const stats = fs.statSync(filepath);

        // QR-Code-Pfad generieren
        const baseFilename = photoId.replace(/^(original_|print_)/, '');
        const qrFilename = `qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`;

        // Prüfen, ob Thumbnail existiert
        const thumbnailPath = path.join(THUMBNAILS_DIR, `thumb_${baseFilename}`);
        const hasThumbnail = fs.existsSync(thumbnailPath);

        // Client-Domain aus Anfrage oder Konfiguration ermitteln
        const clientDomain = req.headers.host || 'fotobox.slyrix.com';

        // Verschiedene URLs für verschiedene Versionen zusammenstellen
        let normalUrl = `/photos/${baseFilename}`;
        let originalUrl = `/photos/originals/original_${baseFilename}`;
        let printUrl = `/photos/print/print_${baseFilename}`;

        // Basierend auf angeforderten Bild-Typ die korrekte photoViewUrl erstellen
        const photoViewUrl = isOriginal
            ? `https://${clientDomain}/photo/original_${baseFilename}`
            : `https://${clientDomain}/photo/${baseFilename}`;

        // Fotodaten zurückgeben
        res.json({
            success: true,
            filename: photoId,
            url: isOriginal ? originalUrl : normalUrl,
            originalUrl: originalUrl,
            printUrl: printUrl,
            thumbnailUrl: hasThumbnail ? `/thumbnails/thumb_${baseFilename}` : null,
            qrUrl: `/qrcodes/${qrFilename}`,
            photoViewUrl: photoViewUrl,
            isOriginal: isOriginal,
            timestamp: stats.mtime.getTime()
        });
    } catch (error) {
        console.error(`Fehler beim Abrufen des Fotos ${photoId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Serverfehler beim Abrufen des Fotos'
        });
    }
});

// Hilfsfunktion für QR-Code-Generierung und Antwort
async function generateQRAndRespond(req, res, filename, timestamp, processedPhotos = null) {
    // QR-Code für die Foto-Ansichtsseite generieren, nicht direkt für das Bild
    const photoId = processedPhotos ? path.basename(processedPhotos.originalUrl) : filename; // Original-ID für QR-Code verwenden
    const clientDomain = 'fotobox.slyrix.com'; // Angegebene Domain verwenden
    const photoViewUrl = `https://${clientDomain}/photo/${photoId}`;

    const qrFilename = `qr_${timestamp}.png`;
    const qrFilepath = path.join(QR_DIR, qrFilename);

    // Wenn keine verarbeiteten Fotos vorliegen, Thumbnail für die Hauptdatei erstellen
    const thumbnailUrl = processedPhotos
        ? processedPhotos.thumbnailUrl
        : await generateThumbnail(path.join(PHOTOS_DIR, filename), filename);

    QRCode.toFile(qrFilepath, photoViewUrl, {
        color: {
            dark: '#000',  // Punkte
            light: '#FFF'  // Hintergrund
        }
    }, (qrErr) => {
        if (qrErr) {
            console.error(`Fehler beim Generieren des QR-Codes: ${qrErr.message}`);
        }

        // Antwort mit allen relevanten URLs
        res.json({
            success: true,
            photo: {
                filename: filename,
                url: processedPhotos ? processedPhotos.publicUrl : `/photos/${filename}`,
                thumbnailUrl: thumbnailUrl || `/photos/${filename}`, // Fallback auf Original, wenn Thumbnail fehlschlägt
                qrUrl: `/qrcodes/${qrFilename}`,
                photoViewUrl: photoViewUrl,
                originalUrl: processedPhotos ? processedPhotos.originalUrl : null,
                printUrl: processedPhotos ? processedPhotos.printUrl : null,
                overlayApplied: processedPhotos ? processedPhotos.overlayApplied : false,
                timestamp: Date.now()
            }
        });
    });
}

// Delete a photo - alle Versionen
app.delete('/api/photos/:filename', (req, res) => {
    const filename = req.params.filename;
    const baseFilename = filename.replace(/^(original_|print_)/, '');

    const filepaths = [
        path.join(PHOTOS_DIR, baseFilename),                        // Standard-Version
        path.join(ORIGINALS_DIR, `original_${baseFilename}`),       // Original-Version
        path.join(PRINT_PHOTOS_DIR, `print_${baseFilename}`),       // Druck-Version
        path.join(THUMBNAILS_DIR, `thumb_${baseFilename}`)          // Thumbnail
    ];

    let success = true;
    let errorMessage = '';

    // Alle Versionen löschen
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

    // QR-Code auch löschen
    const qrPath = path.join(QR_DIR, `qr_${baseFilename.replace(/^wedding_/, '').replace(/\.[^.]+$/, '.png')}`);
    if (fs.existsSync(qrPath)) {
        try {
            fs.unlinkSync(qrPath);
            console.log(`Deleted QR code: ${qrPath}`);
        } catch (err) {
            console.error(`Error deleting QR code ${qrPath}:`, err);
            // QR-Code-Löschfehler nicht als kritisch betrachten
        }
    }

    if (success) {
        res.json({success: true, message: 'All photo versions deleted successfully'});
    } else {
        res.status(500).json({success: false, error: errorMessage});
    }
});

// Send print command (placeholder for future implementation)
app.post('/api/photos/print', (req, res) => {
    const {filename} = req.body;

    if (!filename) {
        return res.status(400).json({error: 'Filename is required'});
    }

    // This is where you would implement the printing logic
    // Für A5-Druck sollten wir die print_-Version verwenden
    const printFilename = filename.startsWith('print_') ? filename : `print_${filename}`;

    console.log(`Print request received for: ${printFilename}`);

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

    // Source paths - determine correct path based on photo ID
    let sourcePhotoPath;
    if (photoId.startsWith('original_')) {
        sourcePhotoPath = path.join(ORIGINALS_DIR, photoId);
    } else if (photoId.startsWith('print_')) {
        sourcePhotoPath = path.join(PRINT_PHOTOS_DIR, photoId);
    } else {
        sourcePhotoPath = path.join(PHOTOS_DIR, photoId);
    }

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
            const baseFilename = photoId.replace(/^(original_|print_)/, '');
            await generateThumbnail(sourcePhotoPath, baseFilename);

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
                const baseFilename = photoId.replace(/^(original_|print_)/, '');
                await generateThumbnail(sourcePhotoPath, baseFilename);

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

        // Limit to a reasonable number for performance (max 50 photos)
        const photosToUse = photoFiles.slice(0, 50);

        // Calculate grid size - make it wider than tall for most displays
        const total = photosToUse.length;
        const cols = Math.ceil(Math.sqrt(total * 1.5));
        const rows = Math.ceil(total / cols);

        // Create mosaic canvas - use integer values for dimensions
        const tileSize = 200; // px
        const mosaicWidth = cols * tileSize;
        const mosaicHeight = rows * tileSize;

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
            const left = col * tileSize;
            const top = row * tileSize;

            // Resize each thumbnail to fit tile with a slight overlap for a more continuous look
            try {
                // Use integer values for dimensions to avoid floating point errors
                const resizeWidth = Math.floor(tileSize * 1.1);
                const resizeHeight = Math.floor(tileSize * 1.1);

                const thumbnailPath = path.join(THUMBNAILS_DIR, photosToUse[i]);

                // Check if file exists and is accessible
                if (!fs.existsSync(thumbnailPath)) {
                    console.log(`Thumbnail not found: ${photosToUse[i]}`);
                    continue;
                }

                const resizedBuffer = await sharp(thumbnailPath)
                    .resize(resizeWidth, resizeHeight, {
                        fit: 'cover',
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

// Add an info endpoint to check mosaic status
app.get('/api/mosaic/info', async (req, res) => {
    try {
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

// Create HTTP server and attach WebSocket server
const server = http.createServer(app);
setupWebSocketServer(server);

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Photos directory: ${PHOTOS_DIR}`);
    console.log(`QR codes directory: ${QR_DIR}`);
    console.log(`Overlays directory: ${OVERLAYS_DIR}`);
    console.log(`Print versions directory: ${PRINT_PHOTOS_DIR}`);
    console.log(`Original photos directory: ${ORIGINALS_DIR}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    if (previewInterval) {
        clearInterval(previewInterval);
    }
    process.exit();
});