// server/index.js
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 5000;

// Track ongoing captures to prevent conflicts
const captureInProgress = { status: false };

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

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

// Take a new photo - with improved error handling and device locking
app.post('/api/photos/capture', (req, res) => {
    // Prevent multiple simultaneous capture requests
    if (captureInProgress.status) {
        return res.status(429).json({
            error: 'A photo capture is already in progress. Please try again in a moment.'
        });
    }

    captureInProgress.status = true;

    // Generate unique filename based on timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `wedding_${timestamp}.jpg`;
    const filepath = path.join(PHOTOS_DIR, filename);

    console.log(`${new Date().toISOString()}: Starting photo capture process...`);

    // More aggressive process killing approach
    const killCommands = [
        // Kill common processes that might be using the camera
        'pkill -f gvfs-gphoto2-volume-monitor || true',
        'pkill -f gvfsd-gphoto2 || true',
        'pkill -f gphoto2 || true',

        // Reset USB device if needed (first find the device)
        'for i in $(lsusb | grep -i canon | cut -d " " -f 2,4 | sed "s/ /\//g"); do \
            if [ -n "$i" ]; then \
                echo "Resetting USB device: $i"; \
                sudo usbreset /dev/bus/usb/$i || true; \
            fi \
        done || true',

        // Additional command to unbind/rebind the USB driver for camera
        'echo "Attempting to unbind/rebind USB device..." || true'
    ].join('; ');

    console.log(`${new Date().toISOString()}: Releasing camera and resetting USB devices...`);

    exec(killCommands, (killError, killStdout, killStderr) => {
        if (killError) {
            console.log(`${new Date().toISOString()}: Kill command error: ${killError.message}`);
            console.log(`${new Date().toISOString()}: Kill command stderr: ${killStderr}`);
        } else {
            console.log(`${new Date().toISOString()}: Successfully killed processes: ${killStdout}`);
        }

        // Add a longer delay to ensure USB device is completely released
        console.log(`${new Date().toISOString()}: Waiting for USB device to stabilize...`);

        setTimeout(() => {
            console.log(`${new Date().toISOString()}: Attempting to capture photo...`);

            // Build the gphoto2 command with additional parameters for reliability
            const captureCommand = `gphoto2 --force-overwrite --set-config viewfinder=0 --capture-image-and-download --filename "${filepath}"`;

            exec(captureCommand, (error, stdout, stderr) => {
                captureInProgress.status = false;

                if (error || stderr.includes('ERROR')) {
                    console.error(`${new Date().toISOString()}: Error capturing photo: ${error ? error.message : stderr}`);

                    // Check if we should suggest using tethering mode
                    if (stderr.includes('Could not claim the USB device')) {
                        return res.status(500).json({
                            error: 'Camera busy or inaccessible. Try disconnecting and reconnecting the camera, or rebooting the system.'
                        });
                    }

                    return res.status(500).json({ error: 'Failed to capture photo' });
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
        }, 2000); // Increased delay to 2 seconds
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

// Server status endpoint
app.get('/api/status', (req, res) => {
    // Command to kill any processes that might be using the camera
    const killCommand = 'pkill -f gvfs-gphoto2-volume-monitor || pkill -f gvfsd-gphoto2 || true';

    // First kill competing processes, then check camera status
    exec(killCommand, () => {
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
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Photos directory: ${PHOTOS_DIR}`);
    console.log(`QR codes directory: ${QR_DIR}`);
});