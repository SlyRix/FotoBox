import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../App';
import Icon from '@mdi/react';
import { mdiCamera, mdiCheck, mdiLoading, mdiImage } from '@mdi/js';

const PhotoPreview = () => {
    const { currentPhoto, loading, setCurrentPhoto } = useCamera();
    const navigate = useNavigate();
    const [imageError, setImageError] = useState(false);
    const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth <= 1024);
    const [statusMessage, setStatusMessage] = useState("How does it look?");

    // Use useEffect for navigation to avoid state updates during render
    useEffect(() => {
        // Only navigate if not loading and no current photo
        if (!loading && !currentPhoto) {
            navigate('/camera');
        }

        // Add resize listener to detect orientation changes
        const handleResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
            setIsTablet(window.innerWidth >= 768 && window.innerWidth <= 1024);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        // Initial check
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, [currentPhoto, loading, navigate]);

    // Handle retaking the photo
    const handleRetake = () => {
        navigate('/camera');
    };

    // Handle keeping the photo - go directly to QR code
    const handleKeep = () => {
        navigate('/qrcode');
    };

    // Loading state
    if (loading || !currentPhoto) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
                <div className="text-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                        className="mb-6 text-wedding-love"
                    >
                        <Icon path={mdiLoading} size={4} />
                    </motion.div>
                    <p className="text-3xl font-display text-gray-700">Processing your photo...</p>
                </div>
            </div>
        );
    }

    // Determine which image URL to display - now using the print version for preview
    // since it has the correct A5 ratio and is optimized for printing
    const displayUrl = currentPhoto.url
        ? `${API_BASE_URL}${currentPhoto.url}`
        : currentPhoto.fullUrl;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <motion.div
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
                transition={{duration: 0.5}}
                className={`w-full ${isTablet
                    ? (isLandscape ? 'max-w-4xl px-8' : 'max-w-2xl px-4')
                    : (isLandscape ? 'max-w-6xl px-6' : 'max-w-xl px-4')
                } bg-white rounded-xl shadow-elegant overflow-hidden`}
            >
                {/* Header with decorative elements */}
                <div className="relative">
                    <div className="p-4 bg-gradient-to-r from-hindu-secondary to-hindu-accent text-white">
                        <div className="flex items-center justify-center">
                            <div className="h-px bg-white/30 w-12 md:w-16"></div>
                            <h2 className="text-2xl md:text-3xl font-display text-center mx-4">Your Moment</h2>
                            <div className="h-px bg-white/30 w-12 md:w-16"></div>
                        </div>
                    </div>

                    {/* Decorative dot pattern */}
                    <div className="absolute -bottom-3 left-0 right-0 flex justify-center">
                        <div className="flex space-x-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white"></div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Main content - optimized for landscape */}
                <div className={`p-${isTablet ? '4' : '6'} ${isLandscape ? 'flex items-center' : 'block'}`}>
                    {/* Photo container - adjusted for landscape and A5 ratio */}
                    <div
                        className={`relative ${
                            isTablet
                                ? (isLandscape ? 'w-3/5 pr-4' : 'w-full mb-4')
                                : (isLandscape ? 'w-2/3 pr-6' : 'w-full mb-6')
                        }`}
                    >
                        {/* Enhanced Photo Frame with improved presentation - UPDATED FOR A5 LANDSCAPE */}
                        <div className="relative">
                            {/* A5 Photo Frame with decorative border - UPDATED ASPECT RATIO FOR LANDSCAPE */}
                            <div className="aspect-[1.414/1] w-full overflow-hidden rounded-lg shadow-lg relative mb-2">
                                {/* Double border effect */}
                                <div className="absolute inset-0 border-8 border-white z-10 rounded-md pointer-events-none"></div>
                                <div className="absolute inset-2 border border-gray-200 z-10 rounded-sm pointer-events-none"></div>

                                {/* Inner mat/background with gradient */}
                                <div className="absolute inset-0 bg-white"></div>


                                {/* Photo itself - positioned to fill available space */}
                                {imageError ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 text-gray-500">
                                        <Icon path={mdiImage} size={4} className="mb-4"/>
                                        <p className="text-xl font-medium">Image could not be loaded</p>
                                        <p className="text-sm text-gray-400 mt-2">Please try taking a new photo</p>
                                    </div>
                                ) : (
                                    <div className="absolute inset-[16px] flex items-center justify-center overflow-hidden">
                                        <img
                                            src={displayUrl}
                                            alt="Your photo"
                                            className="max-w-full max-h-full object-contain"
                                            onError={(e) => {
                                                console.error("Image failed to load:", displayUrl);
                                                e.target.onerror = null;
                                                setImageError(true);
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Subtle "corners" overlay to indicate frame */}
                                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/60 rounded-tl-sm pointer-events-none"></div>
                                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/60 rounded-tr-sm pointer-events-none"></div>
                                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/60 rounded-bl-sm pointer-events-none"></div>
                                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/60 rounded-br-sm pointer-events-none"></div>
                            </div>
                        </div>
                    </div>

                    {/* Controls and text - adjusted for landscape */}
                    <div className={`${isLandscape ? 'w-1/3 pl-6 flex flex-col justify-center' : 'w-full'}`}>
                        <AnimatePresence mode="wait">
                            <motion.p
                                key={statusMessage}
                                initial={{opacity: 0, y: -10}}
                                animate={{opacity: 1, y: 0}}
                                exit={{opacity: 0, y: 10}}
                                className={`text-center ${isLandscape ? 'mb-8' : 'mb-6'} text-2xl text-gray-700 font-display`}
                            >
                                {imageError ? "Would you like to try again?" : "How does it look?"}
                            </motion.p>
                        </AnimatePresence>

                        <div className={`flex ${isLandscape ? 'flex-col space-y-4' : 'flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4'}`}>
                            {/* Retake button */}
                            <button
                                onClick={handleRetake}
                                className={`flex items-center justify-center btn btn-outline btn-hindu-outline text-lg py-3 px-6 w-full`}
                            >
                                <Icon path={mdiCamera} size={1} className="mr-2"/>
                                Retake Photo
                            </button>

                            {/* Continue button - simplified */}
                            {!imageError && (
                                <button
                                    onClick={handleKeep}
                                    className="flex items-center justify-center btn btn-primary btn-hindu text-lg py-3 px-6 w-full"
                                >
                                    <Icon path={mdiCheck} size={1} className="mr-2"/>
                                    Continue
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default PhotoPreview;