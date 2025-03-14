// client/src/components/CameraView.js
import React, { useState, useEffect, useRef } from 'react';
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

    const canvasRef = useRef(null);
    const wsRef = useRef(null);
    const imageRef = useRef(new Image());

    // Check if the camera supports live view
    useEffect(() => {
        fetch(`${API_ENDPOINT}/liveview/check`)
            .then(response => response.json())
            .then(data => {
                setLiveViewSupported(data.supported);
                if (!data.supported) {
                    setLiveViewError(data.message);
                }
            })
            .catch(err => {
                console.error('Error checking live view support:', err);
                setLiveViewError('Failed to check live view support');
            });
    }, []);

    // Initialize WebSocket connection for live view
    useEffect(() => {
        // Only attempt to connect if live view is supported and not already connected
        if (liveViewSupported && !liveViewConnected && !countdown) {
            // Clean up previous connection if it exists
            if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
                wsRef.current.close();
            }

            // Create WebSocket URL (use wss for https, ws for http)
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${API_BASE_URL.replace(/^https?:\/\//, '')}/liveview`;

            try {
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log('Live view WebSocket connected');
                    setLiveViewConnected(true);
                    setLiveViewError(null);
                };

                ws.onclose = () => {
                    console.log('Live view WebSocket disconnected');
                    setLiveViewConnected(false);
                };

                ws.onerror = (error) => {
                    console.error('Live view WebSocket error:', error);
                    setLiveViewError('Failed to connect to live view stream');
                    setLiveViewConnected(false);
                };

                // Handle incoming live view frames
                ws.onmessage = (event) => {
                    // Convert binary data to a base64 string
                    const reader = new FileReader();
                    reader.onload = () => {
                        // Set the image source with the received data
                        imageRef.current.src = reader.result;

                        // When the image is loaded, draw it to the canvas
                        imageRef.current.onload = () => {
                            const canvas = canvasRef.current;
                            if (canvas) {
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
                            }
                        };
                    };
                    reader.readAsDataURL(event.data);
                };
            } catch (error) {
                console.error('Error setting up WebSocket connection:', error);
                setLiveViewError('Failed to set up live view connection');
            }
        }

        // Cleanup WebSocket on component unmount or during countdown
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [liveViewSupported, liveViewConnected, countdown, API_BASE_URL]);

    // Handle taking a photo with countdown
    const handleTakePhoto = () => {
        setIsReady(false);

        // Disconnect live view during countdown to avoid conflicts
        if (wsRef.current) {
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
                    const photo = await takePhoto();
                    if (photo) {
                        // Navigate to preview page
                        navigate('/preview');
                    } else {
                        // Reset if there was an error
                        setIsReady(true);
                        setCountdown(null);
                    }
                } catch (err) {
                    console.error('Failed to take photo:', err);
                    setIsReady(true);
                    setCountdown(null);
                }
            };

            // Short delay to show the "SMILEEE!" message before taking the photo
            setTimeout(capturePhoto, 500);
        }

        return () => clearTimeout(timer);
    }, [countdown, takePhoto, navigate]);

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
                        <div className="bg-black/10 p-4 rounded-lg w-full max-w-xl h-80 mb-8 border-4 border-dashed border-white/50 flex items-center justify-center overflow-hidden">
                            {liveViewSupported && !liveViewError ? (
                                // Live view canvas
                                <canvas
                                    ref={canvasRef}
                                    width="640"
                                    height="480"
                                    className="max-w-full max-h-full object-contain bg-black"
                                />
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
                                            ? liveViewError
                                            : "Stand here and press the button when you're ready!"}
                                    </p>
                                </div>
                            )}
                        </div>

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
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default CameraView;