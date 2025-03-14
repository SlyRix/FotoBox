// client/src/components/CameraView.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';
import { API_BASE_URL, API_ENDPOINT } from '../App';

const CameraView = () => {
    const { takePhoto, loading, error } = useCamera();
    const navigate = useNavigate();
    const [countdown, setCountdown] = useState(null);
    const [isReady, setIsReady] = useState(true);
    const [liveViewSupported, setLiveViewSupported] = useState(false);
    const [liveViewConnected, setLiveViewConnected] = useState(false);
    const [liveViewError, setLiveViewError] = useState(null);
    const [frameCount, setFrameCount] = useState(0);
    const [lastFrameTime, setLastFrameTime] = useState(null);
    const [showDebug, setShowDebug] = useState(false); // Toggle for debug info
    const [connectionAttempts, setConnectionAttempts] = useState(0);
    const [reconnecting, setReconnecting] = useState(false);

    const canvasRef = useRef(null);
    const wsRef = useRef(null);
    const imageRef = useRef(new Image());
    const reconnectTimeoutRef = useRef(null);

    // Helper function to decode WebSocket close codes
    const getWebSocketCloseReason = (code) => {
        const reasons = {
            1000: "Normal closure",
            1001: "Going away",
            1002: "Protocol error",
            1003: "Unsupported data",
            1004: "Reserved",
            1005: "No status received",
            1006: "Abnormal closure - connection failed",
            1007: "Invalid frame payload data",
            1008: "Policy violation",
            1009: "Message too big",
            1010: "Missing extension",
            1011: "Internal server error",
            1012: "Service restart",
            1013: "Try again later",
            1014: "Bad gateway",
            1015: "TLS handshake error"
        };
        return reasons[code] || `Unknown reason (${code})`;
    };

    // Check if the camera supports live view
    useEffect(() => {
        console.log("%c[Camera] Checking if camera supports live view...", "color: purple; font-weight: bold");
        // Set loading state while we check
        setLiveViewError("Checking camera capabilities...");

        fetch(`${API_ENDPOINT}/liveview/check`)
            .then(response => response.json())
            .then(data => {
                console.log("%c[Camera] Live view support check result:", "color: purple", data);

                if (data.supported) {
                    console.log("%c[Camera] Live view is supported!", "color: green; font-weight: bold");
                    setLiveViewSupported(true);
                    setLiveViewError(null);

                    // Since we know it's supported, attempt to connect right away
                    initializeWebSocket();
                } else {
                    console.log("%c[Camera] Live view is not supported", "color: orange; font-weight: bold");
                    setLiveViewSupported(false);
                    setLiveViewError(data.message || "Camera doesn't support live view");
                }
            })
            .catch(err => {
                console.error('%c[Camera] Error checking live view support:', "color: red", err);
                setLiveViewError('Failed to check live view support. Server might be unavailable.');
                setLiveViewSupported(false);
            });
    }, [API_ENDPOINT]);

    // Improved WebSocket initialization function
    const initializeWebSocket = useCallback(() => {
        // Don't attempt connection during countdown
        if (countdown !== null) return;

        // Track connection attempts
        setConnectionAttempts(prev => prev + 1);

        if (reconnecting) {
            console.log(`[WebSocket] Reconnection attempt #${connectionAttempts}...`);
        } else {
            console.log("%c[WebSocket] Initializing connection...", "color: blue; font-weight: bold");
        }

        // Clean up previous connection if it exists
        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            console.log("[WebSocket] Closing existing connection");
            wsRef.current.close();
        }

        // Clear any pending reconnect timeouts
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }

        // IMPORTANT: Always use WSS with HTTPS sites
        const wsProtocol = 'wss:';
        const wsHost = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api$/, '');
        const wsUrl = `${wsProtocol}//${wsHost}`;

        console.log(`[WebSocket] Connecting to: ${wsUrl}`);

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            // Set binary type explicitly
            ws.binaryType = 'arraybuffer';
            console.log(`[WebSocket] Binary type set to: ${ws.binaryType}`);

            // Connection opened
            ws.onopen = () => {
                console.log("%c[WebSocket] Connection OPENED successfully!", "color: green; font-weight: bold");
                setLiveViewConnected(true);
                setLiveViewError(null);
                setReconnecting(false);
                // Reset frame count on new connection
                setFrameCount(0);
                setLastFrameTime(Date.now());
            };

            // Connection closed
            ws.onclose = (event) => {
                console.log(`%c[WebSocket] Connection CLOSED: Code=${event.code}, Reason="${event.reason || 'none'}"`,
                    "color: orange; font-weight: bold");
                console.log(`[WebSocket] Close code meaning: ${getWebSocketCloseReason(event.code)}`);

                // Only update UI state if we were previously connected
                // This prevents flickering during initial connection attempts
                if (liveViewConnected) {
                    setLiveViewConnected(false);
                }

                // On first connection attempt with code 1005/1006, try reconnecting immediately
                // These codes often happen during initial proxy negotiation
                const isInitialConnectionIssue =
                    (connectionAttempts <= 2) && (event.code === 1005 || event.code === 1006);

                // Try to reconnect unless we're in countdown mode
                if (!countdown) {
                    if (isInitialConnectionIssue) {
                        // Immediate reconnect for first attempt with common proxy error
                        console.log("[WebSocket] Initial connection closed, reconnecting immediately...");
                        initializeWebSocket();
                    } else {
                        // For other errors or subsequent attempts, use exponential backoff
                        const delay = Math.min(1000 * Math.pow(1.5, Math.min(connectionAttempts, 5)), 10000);
                        console.log(`[WebSocket] Scheduling reconnection in ${delay}ms...`);
                        setReconnecting(true);

                        reconnectTimeoutRef.current = setTimeout(() => {
                            console.log("[WebSocket] Attempting to reconnect...");
                            initializeWebSocket();
                        }, delay);
                    }
                }
            };

            // Connection error
            ws.onerror = (error) => {
                console.error("%c[WebSocket] ERROR occurred!", "color: red; font-weight: bold");
                console.error("[WebSocket] Error details:", error);

                setLiveViewError('Connection error. Check browser console for details.');
            };

            // Handle incoming messages
            ws.onmessage = (event) => {
                // Process frames and update UI
                // Check if it's a text message (like the welcome message) or binary frame data
                if (typeof event.data === 'string') {
                    try {
                        const data = JSON.parse(event.data);
                        console.log("[WebSocket] Received text message:", data);
                    } catch (e) {
                        console.log("[WebSocket] Received string data (not JSON):", event.data);
                    }
                } else {
                    // This is binary frame data
                    setFrameCount(prev => prev + 1);
                    setLastFrameTime(Date.now());

                    // Log frame data occasionally
                    if (frameCount % 30 === 0) {
                        console.log(`[WebSocket] Received frame #${frameCount}: ${event.data.byteLength} bytes`);
                    }

                    try {
                        // Process the binary data
                        const blob = new Blob([event.data], { type: 'image/jpeg' });
                        const url = URL.createObjectURL(blob);

                        imageRef.current.onload = () => {
                            const canvas = canvasRef.current;
                            if (canvas) {
                                const ctx = canvas.getContext('2d');
                                ctx.clearRect(0, 0, canvas.width, canvas.height);

                                // Calculate scaling to maintain aspect ratio while filling canvas
                                const hRatio = canvas.width / imageRef.current.width;
                                const vRatio = canvas.height / imageRef.current.height;
                                const ratio = Math.min(hRatio, vRatio);

                                // Center the image
                                const centerX = (canvas.width - imageRef.current.width * ratio) / 2;
                                const centerY = (canvas.height - imageRef.current.height * ratio) / 2;

                                // Draw the image with proper scaling
                                ctx.drawImage(
                                    imageRef.current,
                                    0, 0, imageRef.current.width, imageRef.current.height,
                                    centerX, centerY, imageRef.current.width * ratio, imageRef.current.height * ratio
                                );

                                // Clean up the blob URL to avoid memory leaks
                                URL.revokeObjectURL(url);
                            }
                        };

                        imageRef.current.onerror = (imgError) => {
                            console.error("[WebSocket] Error loading image:", imgError);
                            URL.revokeObjectURL(url);
                        };

                        imageRef.current.src = url;
                    } catch (error) {
                        console.error('[WebSocket] Error processing frame:', error);
                    }
                }
            };
        } catch (error) {
            console.error('[WebSocket] Setup error:', error);
            setLiveViewError(`Failed to set up WebSocket: ${error.message}`);
        }
    }, [API_BASE_URL, countdown, connectionAttempts, liveViewConnected, reconnecting]);

    // Add cleanup on component unmount
    useEffect(() => {
        return () => {
            // Clean up WebSocket
            if (wsRef.current) {
                wsRef.current.close();
            }

            // Clean up any pending timeouts
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, []);

    // Handle taking a photo with countdown
    const handleTakePhoto = () => {
        setIsReady(false);

        // Disconnect live view during countdown to avoid conflicts
        if (wsRef.current) {
            console.log('[WebSocket] Closing WebSocket before taking photo');
            wsRef.current.close();
            setLiveViewConnected(false);
        }

        // Start countdown from 5
        setCountdown(5);
    };

    // Handle countdown and photo capture
    useEffect(() => {
        let timer;
        if (countdown === null) return;

        if (countdown > 0) {
            // Continue countdown
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        } else if (countdown === 0) {
            // Show "SMILEEE!" message
            setCountdown("SMILEEE!");

            // Take photo after showing the smile message
            const capturePhoto = async () => {
                try {
                    console.log('Taking photo...');
                    const photo = await takePhoto();
                    if (photo) {
                        // Navigate to preview page
                        navigate('/preview');
                    } else {
                        // Reset if there was an error
                        setIsReady(true);
                        setCountdown(null);
                        // Restart WebSocket connection after photo error
                        initializeWebSocket();
                    }
                } catch (err) {
                    console.error('Failed to take photo:', err);
                    setIsReady(true);
                    setCountdown(null);
                    // Restart WebSocket connection after photo error
                    initializeWebSocket();
                }
            };

            // Short delay to show the "SMILEEE!" message before taking the photo
            setTimeout(capturePhoto, 500);
        }

        return () => clearTimeout(timer);
    }, [countdown, takePhoto, navigate, initializeWebSocket]);

    // Calculate FPS (when frames are being received)
    const getFps = () => {
        if (!lastFrameTime || frameCount === 0) return 'N/A';
        const secondsActive = (Date.now() - lastFrameTime) / 1000;
        // Only show FPS if we received a frame in the last 3 seconds
        if (secondsActive > 3) return 'Inactive';
        return (frameCount / secondsActive).toFixed(1);
    };

    // Early return for loading state
    if (loading && countdown === null) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-wedding-love mx-auto mb-4"></div>
                    <p className="text-xl text-gray-700">Loading camera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
            {/* Back button */}
            <button
                onClick={() => navigate('/')}
                className="absolute top-8 left-8 text-christian-accent hover:text-wedding-love transition-colors"
            >
                ← Back
            </button>

            {/* Debug toggle */}
            <button
                onClick={() => setShowDebug(!showDebug)}
                className="absolute top-8 right-8 text-sm text-gray-500 hover:text-gray-700"
            >
                {showDebug ? 'Hide Debug' : 'Show Debug'}
            </button>

            <div className="z-10 text-center">
                {countdown !== null ? (
                    // Countdown display
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="flex flex-col items-center"
                    >
                        <div className="bg-white/90 p-8 rounded-full w-64 h-64 flex items-center justify-center mb-8 shadow-lg">
                            {typeof countdown === 'string' ? (
                                // "SMILEEE!" display
                                <motion.div
                                    key="smile"
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center"
                                >
                                    <span className="text-5xl font-bold text-wedding-love">
                                        SMILEEE!
                                    </span>
                                    <span className="text-3xl mt-2">
                                        😊📸
                                    </span>
                                </motion.div>
                            ) : (
                                // Number countdown display
                                <motion.span
                                    key={countdown}
                                    initial={{ scale: 2, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    className="text-8xl font-bold text-wedding-love"
                                >
                                    {countdown}
                                </motion.span>
                            )}
                        </div>

                        {typeof countdown !== 'string' && (
                            <h2 className="text-2xl font-bold">Get ready to smile!</h2>
                        )}
                    </motion.div>
                ) : (
                    // Camera ready state with live view if available
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center"
                    >
                        <div className="bg-black p-4 rounded-lg w-full max-w-xl h-80 mb-8 border-2 border-gray-800 flex items-center justify-center overflow-hidden relative">
                            {liveViewSupported && !liveViewError ? (
                                liveViewConnected ? (
                                    <>
                                        {/* Live view canvas */}
                                        <canvas
                                            ref={canvasRef}
                                            width="640"
                                            height="480"
                                            className="max-w-full max-h-full object-contain bg-black"
                                        />

                                        {/* FPS Counter */}
                                        {showDebug && (
                                            <div className="absolute top-2 right-2 text-white bg-black/50 px-2 py-1 rounded text-xs">
                                                FPS: {getFps()} | Frames: {frameCount}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    // Show connecting message
                                    <div className="text-center text-white/80">
                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mx-auto mb-4"></div>
                                        <p>{reconnecting ? 'Reconnecting to camera...' : 'Connecting to camera live view...'}</p>
                                        <p className="text-xs mt-1 text-white/50">Attempt #{connectionAttempts}</p>
                                        {liveViewError && (
                                            <p className="text-red-300 mt-2 text-sm">{liveViewError}</p>
                                        )}
                                    </div>
                                )
                            ) : (
                                // Fallback when live view is not available
                                <div className="text-center text-white/80">
                                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-10 h-10">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                        </svg>
                                    </div>
                                    <p className="text-lg">Camera View</p>
                                    <p className="text-sm opacity-70 mt-2">
                                        {liveViewError
                                            ? `Live view not available: ${liveViewError}`
                                            : "Stand here and press the button when you're ready!"}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Debug info */}
                        {showDebug && (
                            <div className="mb-4 p-3 bg-gray-100 text-gray-700 rounded-lg text-sm text-left w-full max-w-xl">
                                <h3 className="font-bold">Debug Info:</h3>
                                <ul className="list-disc pl-5 mt-1">
                                    <li>Live view supported: {liveViewSupported ? 'Yes' : 'No'}</li>
                                    <li>WebSocket connected: {liveViewConnected ? 'Yes' : 'No'}</li>
                                    <li>Connection attempts: {connectionAttempts}</li>
                                    <li>Reconnecting: {reconnecting ? 'Yes' : 'No'}</li>
                                    <li>Frames received: {frameCount}</li>
                                    <li>FPS: {getFps()}</li>
                                    <li>WebSocket URL: wss://{API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api$/, '')}</li>
                                    {liveViewError && <li className="text-red-500">Error: {liveViewError}</li>}
                                </ul>
                            </div>
                        )}

                        {error && (
                            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={handleTakePhoto}
                            disabled={!isReady || loading}
                            className={`btn btn-primary btn-christian w-64 text-center text-xl ${!isReady || loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? 'Processing...' : 'Take Photo'}
                        </button>

                        {/* Manual reconnect button for troubleshooting */}
                        {showDebug && liveViewSupported && (
                            <button
                                onClick={initializeWebSocket}
                                className="mt-4 text-sm underline text-gray-500 hover:text-gray-700"
                            >
                                Manually reconnect WebSocket
                            </button>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default CameraView;