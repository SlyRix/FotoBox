// Enhanced photoUploader.js with better offline handling

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('./config');
const { createLogger } = require('./logger');

const logger = createLogger('PhotoUploader');

// Directory for tracking uploads and offline photos
const UPLOAD_TRACKING_DIR = path.join(__dirname, 'data', 'upload-tracking');
const OFFLINE_PHOTOS_DIR = path.join(__dirname, 'data', 'offline-photos');

// Create directories if they don't exist
[UPLOAD_TRACKING_DIR, OFFLINE_PHOTOS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

class PhotoUploader {
    constructor() {
        this.homeServerUrl = config.homeServer.url || 'https://photo-view.slyrix.com';
        this.uploadEndpoint = `${this.homeServerUrl}/api/upload-photo`;
        this.apiKey = config.homeServer.apiKey || 'xP9dR7tK2mB5vZ3q';
        this.pendingUploads = new Map();
        this.isOnline = false;
        this.checkIntervalId = null;
        this.retryTimeoutId = null;
        this.maxRetries = config.upload.maxRetries || 5;
        this.retryDelay = config.upload.retryDelay || 30000; // 30 seconds
        this.checkInterval = config.upload.checkInterval || 300000; // 5 minutes
        this.backoffFactor = 1.5; // For exponential backoff

        // Enhanced API instance with better error handling
        this.api = axios.create({
            baseURL: this.homeServerUrl,
            timeout: 30000,
            headers: {
                'X-API-Key': this.apiKey
            }
        });

        // Response interceptor for better error logging
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
     * Enhanced connection checker with better error handling
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

            // Emit status change event for the server to broadcast to clients
            if (wasOnline !== this.isOnline) {
                this.emitConnectionStatusChange(this.isOnline);
            }

            return this.isOnline;
        } catch (error) {
            logger.error(`Connection check failed: ${error.message}`);
            this.isOnline = false;
            return false;
        }
    }

    /**
     * Emit connection status change for server to broadcast
     */
    emitConnectionStatusChange(isOnline) {
        // This can be implemented to emit events to the server
        // For now, just log it
        logger.info(`Connection status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

        // Create a status file that other processes can check
        const statusFile = path.join(__dirname, 'data', 'connection-status.json');
        try {
            fs.writeFileSync(statusFile, JSON.stringify({
                isOnline,
                timestamp: Date.now(),
                pendingUploads: this.pendingUploads.size
            }));
        } catch (error) {
            logger.error(`Failed to write connection status file: ${error.message}`);
        }
    }

    /**
     * Make a backup copy of photos taken while offline
     */
    backupOfflinePhoto(photoPath, metadata) {
        try {
            const filename = metadata.filename || path.basename(photoPath);
            const backupPath = path.join(OFFLINE_PHOTOS_DIR, filename);

            // Copy the file to offline backup directory
            fs.copyFileSync(photoPath, backupPath);

            // Save metadata alongside the photo
            const metadataPath = path.join(OFFLINE_PHOTOS_DIR, `${filename}.json`);
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

            logger.info(`Backed up offline photo: ${filename}`);
            return true;
        } catch (error) {
            logger.error(`Failed to backup offline photo: ${error.message}`);
            return false;
        }
    }

    /**
     * Process the upload queue with exponential backoff
     */
    async processQueue() {
        if (!this.isOnline || this.pendingUploads.size === 0) {
            return;
        }

        logger.info(`Processing upload queue (${this.pendingUploads.size} pending)`);

        // Sort uploads by priority and timestamp
        const sortedUploads = Array.from(this.pendingUploads.entries())
            .sort((a, b) => {
                // First by priority (higher priority first)
                const priorityDiff = (b[1].priority || 0) - (a[1].priority || 0);
                if (priorityDiff !== 0) return priorityDiff;

                // Then by timestamp (oldest first)
                return (a[1].timestamp || 0) - (b[1].timestamp || 0);
            });

        // Process each pending upload with backoff
        for (const [photoId, uploadData] of sortedUploads) {
            const { photoPath, thumbnailPath, metadata, retries, lastRetry } = uploadData;

            // Skip if exceeded max retries
            if (retries >= this.maxRetries) {
                logger.error(`Upload of ${photoId} failed after ${retries} attempts - giving up`);
                this.pendingUploads.delete(photoId);
                this.removeUploadInfo(photoId);
                continue;
            }

            // Apply exponential backoff for retries
            if (retries > 0 && lastRetry) {
                // Calculate delay based on retry count
                const currentTime = Date.now();
                const backoffTime = (this.retryDelay * Math.pow(this.backoffFactor, retries - 1));
                const waitUntil = lastRetry + backoffTime;

                // Skip if we need to wait longer
                if (currentTime < waitUntil) {
                    const waitTime = Math.ceil((waitUntil - currentTime) / 1000);
                    logger.info(`Skipping ${photoId} - retrying in ${waitTime} seconds (retry ${retries + 1})`);
                    continue;
                }
            }

            try {
                // Check if files still exist before attempting upload
                if (!this.validateFilesPaths(uploadData)) {
                    logger.error(`Files missing for ${photoId} - removing from queue`);
                    this.pendingUploads.delete(photoId);
                    this.removeUploadInfo(photoId);
                    continue;
                }

                // Upload the photo
                logger.info(`Attempting upload for ${photoId} (retry ${retries + 1}/${this.maxRetries})`);
                const result = await this.uploadPhoto(photoPath, metadata, thumbnailPath);

                if (result.success) {
                    // Upload successful - remove from pending uploads
                    logger.info(`Successfully uploaded ${photoId}`);
                    this.pendingUploads.delete(photoId);
                    this.removeUploadInfo(photoId);

                    // Optionally remove from offline backup if enabled in config
                    if (config.upload.deleteBackupAfterUpload) {
                        this.removeOfflineBackup(photoId);
                    }
                }
            } catch (error) {
                // Categorize error to determine if it's retriable
                const isRetriable = this.isRetriableError(error);

                if (isRetriable) {
                    // Update retry count and timestamp
                    this.pendingUploads.set(photoId, {
                        ...uploadData,
                        retries: retries + 1,
                        lastRetry: Date.now(),
                        lastError: error.message
                    });

                    // Also update the file on disk
                    this.saveUploadInfo(photoId, {
                        ...uploadData,
                        retries: retries + 1,
                        lastRetry: Date.now(),
                        lastError: error.message
                    });

                    logger.error(`Retriable error uploading ${photoId} (attempt ${retries + 1}/${this.maxRetries}): ${error.message}`);
                } else {
                    // Non-retriable error - remove from queue
                    logger.error(`Non-retriable error uploading ${photoId} - giving up: ${error.message}`);
                    this.pendingUploads.delete(photoId);
                    this.removeUploadInfo(photoId);
                }
            }
        }

        // If we still have pending uploads, schedule retry
        if (this.pendingUploads.size > 0) {
            if (this.retryTimeoutId) {
                clearTimeout(this.retryTimeoutId);
            }

            // Use a shorter delay for next attempt to check the queue
            this.retryTimeoutId = setTimeout(() => {
                this.processQueue();
            }, 60000); // Check again in 1 minute

            logger.info(`Scheduled queue check in 60 seconds for ${this.pendingUploads.size} pending uploads`);
        }
    }

    /**
     * Determine if an error is retriable
     */
    isRetriableError(error) {
        // Network related errors are usually retriable
        if (!error.response && (error.code === 'ECONNABORTED' || error.code === 'ECONNREFUSED' ||
            error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH')) {
            return true;
        }

        // Server errors (5xx) are usually retriable
        if (error.response && error.response.status >= 500 && error.response.status < 600) {
            return true;
        }

        // Too many requests (429) is retriable
        if (error.response && error.response.status === 429) {
            return true;
        }

        // Other errors are generally not retriable
        return false;
    }

    /**
     * Remove offline backup after successful upload
     */
    removeOfflineBackup(photoId) {
        try {
            const backupPath = path.join(OFFLINE_PHOTOS_DIR, photoId);
            const metadataPath = path.join(OFFLINE_PHOTOS_DIR, `${photoId}.json`);

            if (fs.existsSync(backupPath)) {
                fs.unlinkSync(backupPath);
            }

            if (fs.existsSync(metadataPath)) {
                fs.unlinkSync(metadataPath);
            }

            logger.info(`Removed offline backup for ${photoId}`);
        } catch (error) {
            logger.error(`Failed to remove offline backup for ${photoId}: ${error.message}`);
        }
    }

    /**
     * Enhanced queue photo for upload with offline support
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

        // Always create an offline backup regardless of connection status
        this.backupOfflinePhoto(photoPath, metadata);

        // Create upload data
        const uploadData = {
            photoPath,
            thumbnailPath,
            metadata,
            timestamp: Date.now(),
            retries: 0,
            priority: metadata.priority || 0, // Allow priority setting
            uploadedUrl: null,
            status: 'pending',
        };

        // Add to pending uploads
        this.pendingUploads.set(photoId, uploadData);

        // Save to disk for persistence
        this.saveUploadInfo(photoId, uploadData);

        // Try to upload immediately if we're online
        if (this.isOnline) {
            // Start upload process, but don't wait for it to complete
            this.processQueue();

            // Return with pending status
            return {
                success: true,
                pending: true,
                photoId,
                photoViewUrl: metadata.photoViewUrl || `https://photo-view.slyrix.com/photo/original_${photoId}`,
                message: 'Photo queued for upload and will be processed shortly'
            };
        } else {
            logger.info('Offline mode - photo queued for later upload');

            // Create the photoViewUrl even though upload is pending
            const photoViewUrl = metadata.photoViewUrl || `https://photo-view.slyrix.com/photo/original_${photoId}`;

            // Return the prospective URL even though upload is pending
            return {
                success: true,
                pending: true,
                offline: true,
                photoId,
                photoViewUrl,
                message: 'Photo saved offline and will be uploaded when connection is available'
            };
        }
    }

    // ... other methods unchanged ...
}
function getPhotoUploader(config) {
    if (!uploader) {
        uploader = new PhotoUploader(config);
    }
    return uploader;
}

module.exports = {
    getPhotoUploader
};
