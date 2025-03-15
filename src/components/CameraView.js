// Simplified CameraView.js with cleaner UI for guests
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';

const CameraView = () => {
    const { takePhoto, loading } = useCamera();
    const navigate = useNavigate();
    const [countdown, setCountdown] = useState(null);
    const [isReady, setIsReady] = useState(true);
    const [streamActive, setStreamActive] = useState(false);

    // Hard-coded stream URL that we know works
    const STREAM_URL = "https://fotobox-sh.slyrix.com//?action=stream";
    const SNAPSHOT_URL = "https://fotobox-sh.slyrix.com/?action=snapshot";

    // Check if webcam stream is available on mount
    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            setStreamActive(true);
        };
        img.onerror = () => {
            setStreamActive(false);
        };
        img.src = `${SNAPSHOT_URL}&t=${Date.now()}`;

        // Poll occasionally to check if stream becomes available
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
            // Show "SMILE!" message
            setCountdown("SMILE!");

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

            // Short delay to show the "SMILE!" message
            setTimeout(capturePhoto, 500);
        }

        return () => clearTimeout(timer);
    }, [countdown, takePhoto, navigate]);

    // Early return for loading state
    if (loading && countdown === null) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-wedding-love mx-auto mb-4"></div>
                    <p className="text-xl text-gray-700">Loading camera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-wedding-background relative">
            {/* Simple back button */}
            <button
                onClick={() => navigate('/')}
                className="absolute top-6 left-6 flex items-center text-christian-accent hover:text-wedding-love transition-colors"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                Back
            </button>

            <div className="z-10 text-center px-4 w-full max-w-2xl">
                <AnimatePresence mode="wait">
                    {countdown !== null ? (
                        // Countdown display
                        <motion.div
                            key="countdown"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            className="flex flex-col items-center"
                        >
                            <div className="bg-white/90 p-8 rounded-full w-48 h-48 flex items-center justify-center mb-8 shadow-lg">
                                {typeof countdown === 'string' ? (
                                    // "SMILE!" display
                                    <motion.span
                                        key="smile"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="text-4xl font-bold text-wedding-love"
                                    >
                                        {countdown}!
                                    </motion.span>
                                ) : (
                                    // Number countdown display
                                    <motion.span
                                        key={countdown}
                                        initial={{ scale: 1.5, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.5, opacity: 0 }}
                                        className="text-7xl font-bold text-wedding-love"
                                    >
                                        {countdown}
                                    </motion.span>
                                )}
                            </div>
                        </motion.div>
                    ) : (
                        // Camera view with mjpeg stream
                        <motion.div
                            key="camera"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center"
                        >
                            <h2 className="text-2xl md:text-3xl font-display text-christian-text mb-6">
                                Ready for your photo!
                            </h2>

                            <div className="w-full max-w-xl aspect-[4/3] mb-8 overflow-hidden rounded-lg border-4 border-wedding-gold/20 shadow-lg relative">
                                {/* Camera view */}
                                <div className="absolute inset-0 bg-black flex items-center justify-center">
                                    {streamActive ? (
                                        // MJPEG Stream
                                        <img
                                            src={STREAM_URL}
                                            alt="Camera preview"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        // Display message if stream is not available
                                        <div className="flex flex-col items-center justify-center text-white/80 h-full">
                                            <div className="text-5xl mb-4">📷</div>
                                            <p className="text-lg">
                                                Camera loading...
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={handleTakePhoto}
                                disabled={!isReady || loading || !streamActive}
                                className={`btn btn-primary btn-christian w-64 text-center text-xl font-semibold shadow-lg ${
                                    !isReady || loading || !streamActive ? 'opacity-70 cursor-not-allowed' : ''
                                }`}
                            >
                                Take Photo
                            </motion.button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default CameraView;