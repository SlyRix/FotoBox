// Updated CameraView.js with fixed stream URL
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';

const CameraView = () => {
    const {
        takePhoto,
        loading,
        error,
        cameraInfo
    } = useCamera();

    const navigate = useNavigate();
    const [countdown, setCountdown] = useState(null);
    const [isReady, setIsReady] = useState(true);
    const [streamActive, setStreamActive] = useState(false);

    // Hard-coded stream URL that we know works
    const STREAM_URL = "https://fotobox-sh.slyrix.com//?action=stream";
    const SNAPSHOT_URL = "https://fotobox-sh.slyrix.com/?action=snapshot";

    // Check if webcam stream is available on mount
    useEffect(() => {
        // We'll use a simple image load test to see if the stream is active
        const img = new Image();
        img.onload = () => {
            console.log("Stream connection successful!");
            setStreamActive(true);
        };
        img.onerror = () => {
            console.error("Failed to connect to stream");
            setStreamActive(false);
        };

        // Add timestamp to avoid caching
        img.src = `${SNAPSHOT_URL}&t=${Date.now()}`;

        // Poll every 5 seconds to check if stream becomes available
        const interval = setInterval(() => {
            const newImg = new Image();
            newImg.onload = () => setStreamActive(true);
            newImg.onerror = () => setStreamActive(false);
            newImg.src = `${SNAPSHOT_URL}&t=${Date.now()}`;
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    // Handle taking a photo with countdown
    const handleTakePhoto = () => {
        setIsReady(false);
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
                    // Camera view with mjpeg stream
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center"
                    >
                        <div className="bg-black p-4 rounded-lg w-full max-w-xl aspect-[4/3] mb-8 border-2 border-gray-800 flex items-center justify-center overflow-hidden relative">
                            {streamActive ? (
                                // MJPEG Stream - using direct IP address
                                <img
                                    src={STREAM_URL}
                                    alt="Webcam stream"
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                // Display message if stream is not available
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
                                    <div className="w-20 h-20 mb-4 rounded-full bg-white/20 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-10 h-10">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                        </svg>
                                    </div>
                                    <p className="text-lg">
                                        Webcam stream not available
                                    </p>
                                    <p className="text-sm mt-2">
                                        Please make sure the webcam server is running
                                    </p>
                                </div>
                            )}

                            {/* Live indicator when stream is active */}
                            {streamActive && (
                                <div className="absolute top-2 right-2 flex items-center">
                                    <span className="animate-pulse w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                                    <span className="text-xs text-white/70">LIVE</span>
                                </div>
                            )}

                            {/* DSLR indicator when camera is available */}
                            {cameraInfo.cameraAvailable && streamActive && (
                                <div className="absolute bottom-2 left-2 flex items-center bg-black/50 rounded-full px-2 py-1">
                                    <span className="text-xs text-green-400">DSLR Ready</span>
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
                            disabled={!isReady || loading || !streamActive}
                            className={`btn btn-primary btn-christian w-64 text-center text-xl ${
                                !isReady || loading || !streamActive ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            {loading ? 'Processing...' : 'Take Photo'}
                        </button>

                        {!streamActive && (
                            <p className="mt-2 text-sm text-red-500">
                                Please start the webcam stream server
                            </p>
                        )}

                        {/* Camera info message */}
                        <p className="mt-2 text-sm text-gray-500">
                            {cameraInfo.statusMessage}
                        </p>
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default CameraView;