// Enhanced photoUploader.js with better error handling and retry logic
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('./config');
const { createLogger } = require('./logger');

const logger = createLogger('PhotoUploader');

// Directory for tracking uploads
const UPLOAD_TRACKING_DIR = path.join(__dirname, 'data', 'upload-tracking');
// Create directory if it doesn't exist
if (!fs.existsSync(UPLOAD_TRACKING_DIR)) {
    fs.mkdirSync(UPLOAD_TRACKING_DIR, { recursive: true });
}

class PhotoUploader {
    constructor() {
        this.homeServerUrl = config.homeServer.url || 'https://photo-view.slyrix.com';
        this.uploadEndpoint = `${this.homeServerUrl}/api/upload-photo`;
        this.apiKey = config.homeServer.apiKey || 'your-secret-api-key';
        this.pendingUploads = new Map(); // Map to track in-progress uploads
        this.isOnline = false;
        this.checkIntervalId = null;
        this.retryTimeoutId = null;
        this.maxRetries = config.upload.maxRetries || 5;
        this.retryDelay = config.upload.retryDelay || 30000; // 30 seconds
        this.checkInterval = config.upload.checkInterval || 300000; // 5 minutes

        // Enhanced axios instance with better error handling
        this.api = axios.create({
            baseURL: this.homeServerUrl,
            timeout: 30000, // 30 seconds
            headers: {
                'X-API-Key': this.apiKey
            }
        });

        // Set up response interceptor for better error logging
        this.api.interceptors.response.use(
            response => response,
            error => {
                logger.error(`API Error: ${error.message}`);
                if (error.response) {
                    logger.error(`Status: ${error.response.status}`);
                    logger.error(`Data: ${JSON.stringify(error.response.data)}`);
                }
                return Promise.reject(error);
            }
        );

        // Load any pending uploads from disk
        this.loadPendingUploads();

        // Start connection checker
        this.startConnectionChecker();
    }

    /**
     * Check if we can connect to the home server
     * @returns {Promise<boolean>} True if online
     */
    async checkConnection() {
        try {
            logger.info(`Checking connection to ${this.homeServerUrl}/api/status`);
            const response = await this.api.get('/api/status', { timeout: 5000 });
            const wasOnline = this.isOnline;
            this.isOnline = response.status === 200;

            logger.info(`Connection status: ${this.isOnline ? 'ONLINE' : 'OFFLINE'}`);

            // If we just came online, trigger upload of pending photos
            if (!wasOnline && this.isOnline) {
                logger.info('Connection restored! Starting upload of pending photos');
                this.processQueue();
            }

            return this.isOnline;
        } catch (error) {
            logger.error(`Connection check failed: ${error.message}`);
            this.isOnline = false;
            return false;
        }
    }

    /**
     * Start periodic connection checker
     */
    startConnectionChecker() {
        // Clear any existing interval
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
        }

        // Check connection immediately
        this.checkConnection();

        // Set up periodic checking
        this.checkIntervalId = setInterval(() => {
            this.checkConnection();
        }, this.checkInterval);

        logger.info('Connection checker started');
    }

    /**
     * Load pending uploads from disk
     */
    loadPendingUploads() {
        try {
            const files = fs.readdirSync(UPLOAD_TRACKING_DIR);

            files.forEach(file => {
                if (file.endsWith('.json')) {
                    try {
                        const filePath = path.join(UPLOAD_TRACKING_DIR, file);
                        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                        // Only add to queue if files still exist
                        if (this.validateFilesPaths(data)) {
                            const photoId = file.replace('.json', '');
                            this.pendingUploads.set(photoId, {
                                ...data,
                                retries: 0
                            });
                            logger.info(`Loaded pending upload: ${photoId}`);
                        } else {
                            // Files are missing, remove tracking file
                            fs.unlinkSync(filePath);
                            logger.warn(`Removed tracking for missing files: ${file}`);
                        }
                    } catch (err) {
                        logger.error(`Error loading pending upload ${file}: ${err.message}`);
                    }
                }
            });

            logger.info(`Loaded ${this.pendingUploads.size} pending uploads`);

            // Process queue if we have pending uploads
            if (this.pendingUploads.size > 0) {
                this.processQueue();
            }
        } catch (error) {
            logger.error(`Error loading pending uploads: ${error.message}`);
        }
    }

    /**
     * Validate that all file paths in the upload data exist
     * @param {Object} data Upload data
     * @returns {boolean} True if all files exist
     */
    validateFilesPaths(data) {
        const { photoPath, thumbnailPath } = data;

        const photoExists = photoPath && fs.existsSync(photoPath);
        const thumbnailExists = !thumbnailPath || fs.existsSync(thumbnailPath);

        return photoExists && thumbnailExists;
    }

    /**
     * Save upload info to disk for persistence
     * @param {string} photoId Photo ID
     * @param {Object} uploadData Upload data
     */
    saveUploadInfo(photoId, uploadData) {
        try {
            const filePath = path.join(UPLOAD_TRACKING_DIR, `${photoId}.json`);
            fs.writeFileSync(filePath, JSON.stringify(uploadData, null, 2));
        } catch (error) {
            logger.error(`Error saving upload info for ${photoId}: ${error.message}`);
        }
    }

    /**
     * Remove upload info from disk after successful upload
     * @param {string} photoId Photo ID
     */
    removeUploadInfo(photoId) {
        try {
            const filePath = path.join(UPLOAD_TRACKING_DIR, `${photoId}.json`);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            logger.error(`Error removing upload info for ${photoId}: ${error.message}`);
        }
    }

    /**
     * Queue a photo for upload
     * @param {string} photoPath Path to the photo file
     * @param {Object} metadata Photo metadata
     * @param {string} thumbnailPath Path to the thumbnail file (optional)
     * @returns {Promise<Object>} Upload result
     */
    async queuePhotoForUpload(photoPath, metadata, thumbnailPath = null) {
        const photoId = metadata.filename || path.basename(photoPath);

        logger.info(`Queueing photo for upload: ${photoId}`);

        // Verify the photo file exists
        if (!fs.existsSync(photoPath)) {
            logger.error(`Photo file does not exist: ${photoPath}`);
            return {
                success: false,
                pending: false,
                message: `Photo file does not exist: ${photoPath}`
            };
        }

        // Create upload data
        const uploadData = {
            photoPath,
            thumbnailPath,
            metadata,
            timestamp: Date.now(),
            uploadedUrl: null,
            status: 'pending',
        };

        // Add to pending uploads
        this.pendingUploads.set(photoId, {
            ...uploadData,
            retries: 0
        });

        // Save to disk for persistence
        this.saveUploadInfo(photoId, uploadData);

        // Try to upload immediately if we're online
        if (this.isOnline) {
            this.processQueue();
        } else {
            logger.info('Offline mode - photo queued for later upload');

            // If the original uploadData contains photoViewUrl, return it
            const photoViewUrl = metadata.photoViewUrl || `https://photo-view.slyrix.com/photo/${photoId}`;

            // Return the prospective URL even though upload is pending
            return {
                success: true,
                pending: true,
                photoId,
                photoUrl: photoViewUrl,
                message: 'Photo queued for upload when connection is available'
            };
        }
    }

    /**
     * Process the upload queue
     */
    async processQueue() {
        // If no connection or queue is empty, do nothing
        if (!this.isOnline || this.pendingUploads.size === 0) {
            return;
        }

        logger.info(`Processing upload queue (${this.pendingUploads.size} pending)`);

        // Process each pending upload
        for (const [photoId, uploadData] of this.pendingUploads.entries()) {
            const { photoPath, thumbnailPath, metadata, retries } = uploadData;

            // Skip if exceeded max retries
            if (retries >= this.maxRetries) {
                logger.error(`Upload of ${photoId} failed after ${retries} attempts - giving up`);
                this.pendingUploads.delete(photoId);
                this.removeUploadInfo(photoId);
                continue;
            }

            try {
                // Upload the photo
                const result = await this.uploadPhoto(photoPath, metadata, thumbnailPath);

                if (result.success) {
                    // Upload successful - remove from pending uploads
                    logger.info(`Successfully uploaded ${photoId}`);
                    this.pendingUploads.delete(photoId);
                    this.removeUploadInfo(photoId);

                    // TODO: Optionally clean up local files if storage is a concern
                    // But probably best to keep local copies as backup
                }
            } catch (error) {
                // Update retry count
                this.pendingUploads.set(photoId, {
                    ...uploadData,
                    retries: retries + 1,
                    lastError: error.message
                });

                // Also update the file on disk
                this.saveUploadInfo(photoId, {
                    ...uploadData,
                    retries: retries + 1,
                    lastError: error.message
                });

                logger.error(`Upload failed for ${photoId} (attempt ${retries + 1}/${this.maxRetries}): ${error.message}`);
            }
        }

        // If we still have pending uploads, schedule retry
        if (this.pendingUploads.size > 0) {
            if (this.retryTimeoutId) {
                clearTimeout(this.retryTimeoutId);
            }

            this.retryTimeoutId = setTimeout(() => {
                this.processQueue();
            }, this.retryDelay);

            logger.info(`Scheduled retry in ${this.retryDelay / 1000} seconds for ${this.pendingUploads.size} pending uploads`);
        }
    }

    /**
     * Upload a photo to the home server
     * @param {string} photoPath Path to the photo file
     * @param {Object} metadata Photo metadata
     * @param {string} thumbnailPath Path to the thumbnail file (optional)
     * @returns {Promise<Object>} Upload result
     */
    async uploadPhoto(photoPath, metadata, thumbnailPath = null) {
        const form = new FormData();

        // Add photo file
        form.append('photo', fs.createReadStream(photoPath));

        // Add thumbnail if available
        if (thumbnailPath && fs.existsSync(thumbnailPath)) {
            form.append('thumbnail', fs.createReadStream(thumbnailPath));
        }

        // Add metadata
        form.append('metadata', JSON.stringify(metadata));

        // Log what we're uploading
        logger.info(`Uploading photo: ${metadata.filename}`);
        logger.info(`Upload endpoint: ${this.uploadEndpoint}`);
        logger.info(`Metadata: ${JSON.stringify({
            ...metadata,
            thumbnailIncluded: !!thumbnailPath && fs.existsSync(thumbnailPath)
        })}`);

        try {
            const response = await axios.post(this.uploadEndpoint, form, {
                headers: {
                    ...form.getHeaders(),
                    'X-API-Key': this.apiKey
                },
                timeout: 30000 // 30 second timeout
            });

            logger.info(`Upload response: ${JSON.stringify(response.data)}`);
            return response.data;
        } catch (error) {
            // Enhanced error logging
            logger.error(`Upload error: ${error.message}`);

            if (error.response) {
                logger.error(`Status: ${error.response.status}`);
                logger.error(`Headers: ${JSON.stringify(error.response.headers)}`);
                logger.error(`Data: ${JSON.stringify(error.response.data || 'No data')}`);
            } else if (error.request) {
                logger.error('No response received from server');
            }

            throw error;
        }
    }

    /**
     * Get upload status for a photo
     * @param {string} photoId Photo ID
     * @returns {Object|null} Upload status or null if not found
     */
    getUploadStatus(photoId) {
        return this.pendingUploads.get(photoId) || null;
    }

    /**
     * Get all pending uploads
     * @returns {Array} Array of pending uploads
     */
    getAllPendingUploads() {
        return Array.from(this.pendingUploads.entries()).map(([photoId, data]) => ({
            photoId,
            ...data
        }));
    }

    /**
     * Cleanup and shutdown
     */
    shutdown() {
        // Clear timers
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
        }

        if (this.retryTimeoutId) {
            clearTimeout(this.retryTimeoutId);
        }

        logger.info('Photo uploader shutdown');
    }
}

// Singleton instance
let uploader = null;

/**
 * Get the photo uploader instance
 * @returns {PhotoUploader} The photo uploader instance
 */
function getPhotoUploader() {
    if (!uploader) {
        uploader = new PhotoUploader();
    }
    return uploader;
}

module.exports = {
    getPhotoUploader
};