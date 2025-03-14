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

    // Video streaming state
    const [streamStatus, setStreamStatus] = useState('inactive'); // inactive, connecting, active, paused, error
    const [streamError, setStreamError] = useState(null);

    // WebSocket connection
    const wsRef = useRef(null);
    const reconnectTimerRef = useRef(null);
    const videoRef = useRef(null);
    const frameParserRef = useRef(null);

    // Initialize WebSocket connection
    const connectWebSocket = useCallback(() => {
        // Close existing connection if any
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.close();
        }

        // Create WebSocket URL from the API base URL
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const apiUrl = new URL(API_BASE_URL);
        const wsUrl = `${wsProtocol}//${apiUrl.host}`;

        console.log(`Connecting to WebSocket at ${wsUrl}`);
        setStreamStatus('connecting');

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

            setStreamError(null);
        };

        ws.onmessage = (event) => {
            // Check if the message is binary data (video frame)
            if (event.data instanceof Blob) {
                handleVideoFrame(event.data);
                return;
            }

            // Handle JSON messages
            try {
                const message = JSON.parse(event.data);

                // Handle different message types
                switch (message.type) {
                    case 'streamStatus':
                        console.log(`Stream status: ${message.status} - ${message.message}`);
                        setStreamStatus(message.status);
                        break;

                    case 'streamError':
                        console.error(`Stream error: ${message.message}`);
                        setStreamError(message.message);
                        setStreamStatus('error');
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
            setStreamStatus('error');
        };

        ws.onclose = (event) => {
            console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
            setStreamStatus('inactive');

            // Attempt to reconnect after a delay
            reconnectTimerRef.current = setTimeout(() => {
                console.log('Attempting to reconnect...');
                connectWebSocket();
            }, 5000);
        };

        wsRef.current = ws;
    }, []);

    // Handle incoming video frames
    const handleVideoFrame = useCallback((frameData) => {
        if (!videoRef.current) return;

        // Convert blob to URL and display in video element
        const frameUrl = URL.createObjectURL(frameData);

        // Clean up previous frame URL if any
        if (frameParserRef.current) {
            URL.revokeObjectURL(frameParserRef.current);
        }

        // Store the current frame URL for cleanup
        frameParserRef.current = frameUrl;

        // Set the frame as source for the video element
        videoRef.current.src = frameUrl;
    }, []);

    // Register video element
    const registerVideoElement = useCallback((element) => {
        videoRef.current = element;
    }, []);

    // Start video stream
    const startVideoStream = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            connectWebSocket();
            return;
        }

        // Request to start the stream
        wsRef.current.send(JSON.stringify({ type: 'startStream' }));
        setStreamStatus('connecting');
    }, [connectWebSocket]);

    // Stop video stream
    const stopVideoStream = useCallback(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        // Request to stop the stream
        wsRef.current.send(JSON.stringify({ type: 'stopStream' }));
        setStreamStatus('inactive');
    }, []);

    // Connect to WebSocket when the component mounts
    useEffect(() => {
        connectWebSocket();

        // Cleanup WebSocket connection on unmount
        return () => {
            if (wsRef.current) {
                if (wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'stopStream' }));
                }
                wsRef.current.close();
            }

            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }

            // Clean up any frame URLs
            if (frameParserRef.current) {
                URL.revokeObjectURL(frameParserRef.current);
            }
        };
    }, [connectWebSocket]);

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

        // Ensure stream is stopped and doesn't restart after photo capture
        stopVideoStream();

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

                // Don't restart the stream after photo capture
                setStreamStatus('inactive');

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
    }, [stopVideoStream]);

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
        // Video streaming related values
        streamStatus,
        streamError,
        startVideoStream,
        stopVideoStream,
        registerVideoElement,
    };

    return (
        <CameraContext.Provider value={value}>
            {children}
        </CameraContext.Provider>
    );
};