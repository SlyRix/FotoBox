// server/index.js
const express = require('express');
const cors = require('cors');
const {exec} = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');
const http = require('http');

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

// Create HTTP server
const server = http.createServer(app);

// Start the server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Photos directory: ${PHOTOS_DIR}`);
    console.log(`QR codes directory: ${QR_DIR}`);
});

// Cleanup on server shutdown
process.on('SIGINT', () => {
    process.exit();
});