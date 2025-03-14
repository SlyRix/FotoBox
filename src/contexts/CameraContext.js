// client/src/contexts/CameraContext.js
import React, { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import { API_BASE_URL, API_ENDPOINT } from '../App';

const CameraContext = createContext();

export const useCamera = () => useContext(CameraContext);

export const CameraProvider = ({ children }) => {
    const [currentPhoto, setCurrentPhoto] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Preview state
    const [previewImage, setPreviewImage] = useState(null);
    const [previewStatus, setPreviewStatus] = useState('inactive'); // inactive, connecting, active, error

    // WebSocket connection
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);

    // Initialize WebSocket connection
    const connectWebSocket = useCallback(() => {
        // Close existing connection if any
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        }

        // Create WebSocket URL from the API base URL, ensuring correct protocol
        const apiUrl = new URL(API_BASE_URL);
        // Always use wss:// if the API is https://
        const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${apiUrl.host}`;

        console.log(`Connecting to WebSocket at ${wsUrl}`);
        setPreviewStatus('connecting');

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connection established');

            // Clear reconnect timer if set
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }

            // Start ping interval to keep connection alive
            const pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
                } else {
                    clearInterval(pingInterval);
                }
            }, 30000); // Ping every 30 seconds
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                // Handle different message types
                switch (message.type) {
                    case 'previewStatus':
                        console.log(`Preview status: ${message.status} - ${message.message}`);
                        setPreviewStatus(message.status);
                        break;

                    case 'previewFrame':
                        // New frame received
                        setPreviewImage(message.imageData);
                        setPreviewStatus('active');
                        break;

                    case 'info':
                        console.log(`Server info: ${message.message}`);
                        break;

                    case 'pong':
                        // Server responded to our ping
                        break;

                    default:
                        console.log(`Unknown message type: ${message.type}`);
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            setError('Connection to camera server lost. Reconnecting...');
            setPreviewStatus('error');
        };

        ws.onclose = (event) => {
            console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
            setPreviewStatus('inactive');

            // Attempt to reconnect after a delay
            reconnectTimerRef.current = setTimeout(() => {
                console.log('Attempting to reconnect...');
                connectWebSocket();
            }, 5000);
        };

        wsRef.current = ws;
    }, []);

    // Connect to WebSocket when the component mounts
    useEffect(() => {
        connectWebSocket();

        // Cleanup WebSocket connection on unmount
        return () => {
            if (wsRef.current) {
                if (wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'stopPreview' }));
                }
                wsRef.current.close();
            }

            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
        };
    }, [connectWebSocket]);

    // Start webcam preview
    const startPreview = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            connectWebSocket();
            return;
        }

        // Request to start the preview
        wsRef.current.send(JSON.stringify({ type: 'startPreview' }));
        setPreviewStatus('connecting');
    }, [connectWebSocket]);

    // Stop webcam preview
    const stopPreview = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        // Request to stop the preview
        wsRef.current.send(JSON.stringify({ type: 'stopPreview' }));
        setPreviewStatus('inactive');
    }, []);

    // Fetch all photos
    const fetchPhotos = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_ENDPOINT}/photos`);

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();

            // Make sure the full URL is set for each photo
            const photosWithFullUrls = data.map(photo => ({
                ...photo,
                fullUrl: `${API_BASE_URL}${photo.url}`
            }));

            setPhotos(photosWithFullUrls);
            setLoading(false);
            return photosWithFullUrls;
        } catch (error) {
            console.error('Error fetching photos:', error);
            setError('Failed to load photos: ' + error.message);
            setLoading(false);
            return [];
        }
    }, []);

    // Take a new photo
    const takePhoto = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_ENDPOINT}/photos/capture`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.photo) {
                // Add the full URL to the photo object
                const photoWithFullUrl = {
                    ...result.photo,
                    fullUrl: `${API_BASE_URL}${result.photo.url}`
                };

                setCurrentPhoto(photoWithFullUrl);
                setLoading(false);
                return photoWithFullUrl;
            } else {
                throw new Error(result.error || 'Failed to capture photo');
            }
        } catch (error) {
            console.error('Error taking photo:', error);
            setError(error.message || 'An error occurred while taking the photo');
            setLoading(false);
            return null;
        }
    }, []);

    // Delete a photo
    const deletePhoto = useCallback(async (filename) => {
        setLoading(true);

        try {
            const response = await fetch(`${API_ENDPOINT}/photos/${filename}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                setPhotos(prevPhotos => prevPhotos.filter(photo => photo.filename !== filename));
                setLoading(false);
                return true;
            } else {
                throw new Error(result.error || 'Failed to delete photo');
            }
        } catch (error) {
            console.error('Error deleting photo:', error);
            setError(error.message);
            setLoading(false);
            return false;
        }
    }, []);

    // Send print request
    const printPhoto = useCallback(async (filename) => {
        try {
            const response = await fetch(`${API_ENDPOINT}/photos/print`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename }),
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error printing photo:', error);
            return { success: false, error: error.message };
        }
    }, []);

    const value = {
        currentPhoto,
        setCurrentPhoto,
        photos,
        loading,
        error,
        fetchPhotos,
        takePhoto,
        deletePhoto,
        printPhoto,
        apiBaseUrl: API_BASE_URL,
        // Preview related values
        previewImage,
        previewStatus,
        startPreview,
        stopPreview
    };

    return (
        <CameraContext.Provider value={value}>
            {children}
        </CameraContext.Provider>
    );
};