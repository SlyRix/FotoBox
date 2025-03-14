// client/src/components/CameraView.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';

const CameraView = () => {
    const {
        takePhoto,
        loading,
        error,
        previewImage,
        previewStatus,
        startPreview,
        stopPreview
    } = useCamera();

    const navigate = useNavigate();
    const [countdown, setCountdown] = useState(null);
    const [isReady, setIsReady] = useState(true);

    // Start webcam preview when component mounts
    useEffect(() => {
        startPreview();

        // Stop preview when unmounting
        return () => {
            stopPreview();
        };
    }, [startPreview, stopPreview]);

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

    // Get status message based on preview status
    const getStatusMessage = () => {
        switch (previewStatus) {
            case 'connecting':
                return 'Connecting to camera...';
            case 'active':
                return 'Camera connected';
            case 'error':
                return 'Camera error. Please try again.';
            default:
                return 'Camera not connected';
        }
    };

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
                    // Camera view with webcam preview
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center"
                    >
                        <div className="bg-black p-4 rounded-lg w-full max-w-xl aspect-[4/3] mb-8 border-2 border-gray-800 flex items-center justify-center overflow-hidden relative">
                            {/* Webcam preview image */}
                            {previewImage && previewStatus === 'active' && (
                                <img
                                    src={previewImage}
                                    alt="Webcam preview"
                                    className="w-full h-full object-contain"
                                />
                            )}

                            {/* Preview status and indicators */}
                            {(!previewImage || previewStatus !== 'active') && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80">
                                    <div className="w-20 h-20 mb-4 rounded-full bg-white/20 flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-10 h-10">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                                        </svg>
                                    </div>

                                    {previewStatus === 'connecting' && (
                                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mb-2"></div>
                                    )}

                                    <p className="text-lg">
                                        {getStatusMessage()}
                                    </p>

                                    {previewStatus === 'error' && (
                                        <button
                                            onClick={startPreview}
                                            className="mt-4 py-2 px-4 bg-white/20 hover:bg-white/30 rounded text-sm"
                                        >
                                            Reconnect Camera
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Live indicator when preview is active */}
                            {previewStatus === 'active' && (
                                <div className="absolute top-2 right-2 flex items-center">
                                    <span className="animate-pulse w-3 h-3 bg-red-500 rounded-full mr-2"></span>
                                    <span className="text-xs text-white/70">LIVE</span>
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
                            disabled={!isReady || loading || previewStatus !== 'active'}
                            className={`btn btn-primary btn-christian w-64 text-center text-xl ${
                                !isReady || loading || previewStatus !== 'active' ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        >
                            {loading ? 'Processing...' : 'Take Photo'}
                        </button>

                        {previewStatus !== 'active' && (
                            <p className="mt-2 text-sm text-gray-500">
                                {previewStatus === 'connecting'
                                    ? 'Please wait for camera to connect...'
                                    : 'Camera must be connected to take a photo'
                                }
                            </p>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
};

export default CameraView;