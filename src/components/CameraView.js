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
    const [liveViewError, setLiveViewError] = useState(null);
    const [showDebug, setShowDebug] = useState(false);
    const [connectionAttempts, setConnectionAttempts] = useState(0);
    const [reconnecting, setReconnecting] = useState(false);

    const canvasRef = useRef(null);
    const wsRef = useRef(null);

    // Simplified WebSocket initialization
    const maxReconnectAttempts = 5;
    const reconnectCooldown = 3000; // 3 seconds

    const initializeWebSocket = useCallback(() => {
        if (connectionAttempts >= maxReconnectAttempts) {
            console.error(`[WebSocket] Max reconnect attempts reached (${maxReconnectAttempts}).`);
            setLiveViewError('Failed to connect to live view. Please try again later.');
            return;
        }

        console.log(`[WebSocket] Attempting connection (#${connectionAttempts + 1})...`);
        setConnectionAttempts(prev => prev + 1);

        if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
            wsRef.current.close();
        }

        const wsProtocol = 'wss:';
        const wsHost = API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api$/, '');
        const wsUrl = `${wsProtocol}//${wsHost}/liveview`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
            console.log("[WebSocket] Connection OPENED successfully!");
        };

        ws.onclose = (event) => {
            console.log(`[WebSocket] Connection CLOSED: Code=${event.code}, Reason="${event.reason || 'none'}"`);
            if (event.code === 1006 || event.code === 1005) {
                console.warn('[WebSocket] Abnormal closure, retrying...');
                setReconnecting(true);
                setTimeout(initializeWebSocket, reconnectCooldown);
            }
        };

        ws.onerror = (error) => {
            console.error("[WebSocket] ERROR occurred!", error);
            setLiveViewError('Connection error. Retrying...');
        };
    }, [API_BASE_URL, connectionAttempts]);

    // Check if the camera supports live view
    useEffect(() => {
        fetch(`${API_ENDPOINT}/liveview/check`)
            .then(response => response.json())
            .then(data => {
                if (data.supported) {
                    console.log("Live view supported!");
                    initializeWebSocket();
                } else {
                    console.log("Live view is not supported");
                    setLiveViewError(data.message || "Camera doesn't support live view");
                }
            })
            .catch(err => {
                console.error('Error checking live view support:', err);
                setLiveViewError('Failed to check live view support. Server might be unavailable.');
            });
    }, [API_ENDPOINT, initializeWebSocket]);

    // Handle taking a photo with countdown
    const handleTakePhoto = () => {
        setIsReady(false);

        // Start countdown from 5
        setCountdown(5);
    };

    // Countdown and photo capture
    useEffect(() => {
        let timer;
        if (countdown === null) return;

        if (countdown > 0) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        } else if (countdown === 0) {
            setCountdown("SMILEEE!");

            // Take photo after showing the smile message
            const capturePhoto = async () => {
                try {
                    const photo = await takePhoto();
                    if (photo) {
                        navigate('/preview');
                    } else {
                        setIsReady(true);
                        setCountdown(null);
                    }
                } catch (err) {
                    console.error('Failed to take photo:', err);
                    setIsReady(true);
                    setCountdown(null);
                }
            };

            setTimeout(capturePhoto, 500);
        }

        return () => clearTimeout(timer);
    }, [countdown, takePhoto, navigate]);

    // Early return for loading state
    if (loading && countdown === null) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 mx-auto mb-4"></div>
                    <p className="text-xl text-gray-700">Loading camera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center">
            {/* Back button */}
            <button
                onClick={() => navigate('/')}
                className="absolute top-8 left-8 text-accent hover:text-wedding-love transition-colors"
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
                                    <span className="text-5xl font-bold text-accent">
                                        SMILEEE!
                                    </span>
                                    <span className="text-3xl mt-2">
                                        😊📸
                                    </span>
                                </motion.div>
                            ) : (
                                // Countdown number display
                                <motion.span
                                    key={countdown}
                                    initial={{ scale: 2, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    className="text-8xl font-bold text-accent"
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
                    // Camera view state with live view if available
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center"
                    >
                        <div className="bg-black p-4 rounded-lg w-full max-w-xl h-80 mb-8 border-2 border-gray-800 flex items-center justify-center overflow-hidden relative">
                            {liveViewError ? (
                                <div className="text-center text-white/80">
                                    <p className="text-sm opacity-70 mt-2">{liveViewError}</p>
                                </div>
                            ) : (
                                <canvas
                                    ref={canvasRef}
                                    width="640"
                                    height="480"
                                    className="max-w-full max-h-full object-contain bg-black"
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default CameraView;
