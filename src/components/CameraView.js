// Enhanced CameraView.js with more design elements
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';
import HeartSpinner from './HeartSpinner';
import Icon from '@mdi/react';
import { mdiCamera, mdiHome, mdiHeartOutline, mdiHeart } from '@mdi/js';

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
            <div className="min-h-screen bg-wedding-background flex flex-col items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-24 w-24 border-t-8 border-b-8 border-wedding-love mx-auto mb-6"></div>
                    <p className="text-3xl font-display text-gray-700">Preparing camera...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col relative bg-black">
            {/* Full-width camera view */}
            <div className="absolute inset-0">
                {streamActive ? (
                    <img
                        src={STREAM_URL}
                        alt="Camera preview"
                        className="w-full h-full object-contain"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-white/80 h-full bg-gradient-to-b from-gray-800 to-black">
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                rotate: [0, 5, 0, -5, 0]
                            }}
                            transition={{
                                duration: 3,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            className="text-8xl mb-6"
                        >
                            <Icon path={mdiCamera} size={6} />
                        </motion.div>
                        <p className="text-4xl font-display">
                            Connecting to camera...
                        </p>
                    </div>
                )}
            </div>

            {/* Overlay UI elements */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Standardized header bar */}
                <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-r from-hindu-secondary to-hindu-accent shadow-md flex items-center justify-between px-4">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center justify-center bg-white/20 backdrop-blur-md text-white hover:bg-white/30 transition-colors text-xl p-3 rounded-full shadow-lg pointer-events-auto"
                    >
                        <Icon path={mdiHome} size={1.2} />
                    </button>

                    <div className="text-white text-xl font-script text-shadow">
                        Rushel & Sivani
                    </div>

                    <div className="w-10"></div> {/* Empty div to balance the layout */}
                </div>

                {/* Photo frame guide overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="relative w-4/5 max-w-2xl aspect-[4/3]">
                        {/* Corner markers for framing */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white/30"></div>
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white/30"></div>
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white/30"></div>
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white/30"></div>

                        {/* Decorative elements */}
                        <motion.div
                            className="absolute -top-4 left-1/2 -translate-x-1/2 text-wedding-love/50"
                            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                            transition={{ duration: 3, repeat: Infinity }}
                        >
                            <Icon path={mdiHeart} size={1.5} />
                        </motion.div>
                    </div>
                </div>

                {/* Bottom area - enhanced camera button */}
                <div className="absolute bottom-0 left-0 right-0">
                    {/* Gradient background for button area */}
                    <div className="h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>

                    {/* Camera button with enhanced styling */}
                    <div className="absolute bottom-12 left-0 right-0 flex justify-center">
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={handleTakePhoto}
                            disabled={!isReady || loading || !streamActive || isProcessing}
                            className={`relative group pointer-events-auto`}
                        >
                            {/* Pulsing glow effect */}
                            <motion.div
                                className={`absolute -inset-6 rounded-full bg-wedding-love opacity-20 blur-md ${
                                    !isReady || loading || !streamActive || isProcessing ? 'hidden' : ''
                                }`}
                                animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.3, 0.1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />

                            {/* Orbit effect */}
                            <motion.div
                                className={`absolute -inset-12 ${
                                    !isReady || loading || !streamActive || isProcessing ? 'hidden' : ''
                                }`}
                                style={{ zIndex: -1 }}
                            >
                                {[...Array(3)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                                        style={{
                                            backgroundColor: '#d93f0b',
                                            opacity: 0.6 - (i * 0.2)
                                        }}
                                        animate={{
                                            scale: [1, 1.5, 1],
                                            rotate: [0, 360],
                                            opacity: [0.1, 0.3, 0.1]
                                        }}
                                        transition={{
                                            duration: 4 + i,
                                            delay: i * 0.5,
                                            repeat: Infinity,
                                            ease: "linear"
                                        }}
                                    />
                                ))}
                            </motion.div>

                            {/* Actual camera button */}
                            <div
                                className={`relative flex items-center justify-center bg-gradient-to-r from-wedding-love to-hindu-accent text-white rounded-full w-32 h-32 shadow-elegant ${
                                    !isReady || loading || !streamActive || isProcessing ? 'opacity-50' : 'opacity-100'
                                }`}
                            >
                                <Icon path={mdiCamera} size={4} />
                            </div>
                        </motion.button>
                    </div>
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
                        className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-20 pointer-events-none"
                    >
                        <motion.div
                            className="bg-white/90 rounded-full w-60 h-60 flex items-center justify-center shadow-lg"
                            animate={{ scale: [0.9, 1] }}
                            transition={{ duration: 0.3 }}
                        >
                            {typeof countdown === 'string' ? (
                                <motion.div
                                    key="smile"
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="flex flex-col items-center"
                                >
                                    <span className="text-6xl font-bold text-wedding-love mb-2">
                                        {countdown}!
                                    </span>
                                    <Icon path={mdiHeartOutline} size={3} className="text-wedding-love" />
                                </motion.div>
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
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CameraView;