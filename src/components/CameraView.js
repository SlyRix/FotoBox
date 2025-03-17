// Full CameraView.js for Server-Side Implementation
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';
import HeartSpinner from './HeartSpinner';

const CameraView = () => {
    const { takePhoto, loading } = useCamera();
    const navigate = useNavigate();
    const [countdown, setCountdown] = useState(null);
    const [isReady, setIsReady] = useState(true);
    const [streamActive, setStreamActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

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

            // Show "SMILE!" for 1.5 seconds before showing the HeartSpinner
            setTimeout(() => {
                // Start photo capture process
                capturePhoto();
            }, 1500);
        }

        return () => clearTimeout(timer);
    }, [countdown]);

    // Photo capture function
    const capturePhoto = async () => {
        // Show processing spinner
        setIsProcessing(true);

        try {
            // Take the photo - server handles overlay application during capture
            const photo = await takePhoto();

            if (photo) {
                // Add a short delay to ensure the server has time to process
                setTimeout(() => {
                    // Navigate to preview page
                    navigate('/preview');
                }, 1000);
            } else {
                // Reset if there was an error
                setIsReady(true);
                setCountdown(null);
                setIsProcessing(false);
            }
        } catch (err) {
            console.error('Failed to take photo:', err);
            setIsReady(true);
            setCountdown(null);
            setIsProcessing(false);
        }
    };

    // Early return for loading state
    if (loading && countdown === null && !isProcessing) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-24 w-24 border-t-8 border-b-8 border-wedding-love mx-auto mb-6"></div>
                    <p className="text-3xl text-gray-700">Loading camera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col relative">
            {/* Full-width camera view */}
            <div className="absolute inset-0 bg-black">
                {streamActive ? (
                    <img
                        src={STREAM_URL}
                        alt="Camera preview"
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-white/80 h-full">
                        <div className="text-8xl mb-6">📷</div>
                        <p className="text-4xl">
                            Camera loading...
                        </p>
                    </div>
                )}
            </div>

            {/* Overlay UI elements */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Top left - back button */}
                <div className="absolute top-4 left-4">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center justify-center bg-hindu-secondary text-white hover:bg-hindu-accent transition-colors text-xl py-4 px-6 rounded-full shadow-lg pointer-events-auto"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>

                {/* Title at top */}
                <div className="absolute top-4 left-0 right-0 text-center pointer-events-none">
                    <div className="inline-block bg-hindu-secondary/80 text-white px-6 py-2 rounded-full">
                        <h2 className="text-2xl font-display">Ready for your photo!</h2>
                    </div>
                </div>

                {/* Bottom area - take photo button */}
                <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                    <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={handleTakePhoto}
                        disabled={!isReady || loading || !streamActive || isProcessing}
                        className={`btn btn-primary btn-hindu py-10 px-10 text-center text-4xl font-semibold shadow-xl rounded-full pointer-events-auto w-64 ${
                            !isReady || loading || !streamActive || isProcessing ? 'opacity-70 cursor-not-allowed' : ''
                        }`}
                    >
                        Take Photo
                    </motion.button>
                </div>
            </div>

            {/* Processing overlay - show HeartSpinner when processing */}
            <AnimatePresence>
                {isProcessing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-white z-30 flex items-center justify-center"
                    >
                        <HeartSpinner />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Overlay the countdown on top of everything */}
            <AnimatePresence>
                {countdown !== null && !isProcessing && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center bg-black/30 z-20 pointer-events-none"
                    >
                        <div className="bg-white/90 p-10 rounded-full w-64 h-64 flex items-center justify-center shadow-lg">
                            {typeof countdown === 'string' ? (
                                <motion.span
                                    key="smile"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-6xl font-bold text-wedding-love"
                                >
                                    {countdown}!
                                </motion.span>
                            ) : (
                                <motion.span
                                    key={countdown}
                                    initial={{ scale: 1.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.5, opacity: 0 }}
                                    className="text-9xl font-bold text-wedding-love"
                                >
                                    {countdown}
                                </motion.span>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CameraView;