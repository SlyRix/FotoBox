// server/config.js
const path = require('path');

// Configuration object for the FotoBox server
const config = {
    // Server settings
    server: {
        port: process.env.PORT || 5000,
        host: process.env.HOST || 'localhost'
    },

    // Directories for storing files
    directories: {
        photos: path.join(__dirname, 'public', 'photos'),
        qrCodes: path.join(__dirname, 'public', 'qrcodes')
    },

    // Camera settings
    camera: {
        captureCommand: 'gphoto2 --capture-image-and-download --filename',
        detectCommand: 'gphoto2 --auto-detect'
    },

    // Printing settings (for future implementation)
    printing: {
        enabled: true,
        printerName: 'Canon_SELPHY_CP1500',
        printCommand: 'lp -d',
        paperSize: 'Postcard', // 4x6" (Postcard size)
        printFormat: 'borderless', // Most photo booth setups want borderless
        retryAttempts: 3,
        jobStatusCommand: 'lpstat -o'
    },
    // QR code settings
    qrCode: {
        color: {
            dark: '#000000', // QR code dark color
            light: '#FFFFFF'  // QR code light color
        },
        margin: 1,
        scale: 8
    },

    // Application settings
    app: {
        title: 'Rushel & Sivani Wedding FotoBox',
        baseUrl: process.env.BASE_URL || 'http://localhost:5000',
        clientUrl: process.env.CLIENT_URL || 'http://localhost:3000'
    },
    // Home server configuration for photo upload
    homeServer: {
        enabled: true,              // Set to false to disable uploads (offline mode)
        url: 'https://photo-view.slyrix.com',
        apiKey: 'your-secret-api-key',  // IMPORTANT: Use the same key as on the server!
        uploadEndpoint: '/api/upload-photo',
        statusEndpoint: '/api/status',
        photoViewUrlFormat: 'https://photo-view.slyrix.com/photo/{photoId}'
    },

// Upload settings
    upload: {
        maxRetries: 5,              // Maximum number of upload attempts
        retryDelay: 30000,          // 30 seconds between retries
        checkInterval: 300000,      // 5 minutes between connection checks
        deleteAfterUpload: false,   // Whether to delete local files after successful upload
        batchSize: 5                // Number of photos to upload in parallel
    }
};

module.exports = config;