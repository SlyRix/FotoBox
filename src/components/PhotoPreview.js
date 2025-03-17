// Fixed PhotoPreview.js (removed frame toggle feature)
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL, API_ENDPOINT } from '../App';
import Icon from '@mdi/react';
import { mdiCamera, mdiCheck, mdiLoading ,mdiImage} from '@mdi/js';

const PhotoPreview = () => {
    const { currentPhoto, loading, setCurrentPhoto } = useCamera();
    const navigate = useNavigate();
    const [imageError, setImageError] = useState(false);
    const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
    const [isApplyingOverlay, setIsApplyingOverlay] = useState(false);
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
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [currentPhoto, loading, navigate]);

    // Check if overlay is already applied (from server-side processing)
    useEffect(() => {
        if (currentPhoto && currentPhoto.overlayApplied) {
            setStatusMessage("Perfect! Love the wedding frame!");
        }
    }, [currentPhoto]);

    // Handle retaking the photo
    const handleRetake = () => {
        navigate('/camera');
    };

    // Handle applying overlay via server
    const handleApplyOverlay = async () => {
        if (!currentPhoto || !currentPhoto.filename) {
            return;
        }

        setIsApplyingOverlay(true);
        setStatusMessage("Adding wedding frame...");

        try {
            // Call server endpoint to apply overlay
            const response = await fetch(`${API_ENDPOINT}/photos/${currentPhoto.filename}/overlay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    overlayName: 'wedding-frame.png'
                })
            });

            const result = await response.json();

            if (result.success) {
                // Update the current photo with the new overlay URL
                // Add a cache-busting timestamp to force reload of the image
                const timestamp = Date.now();
                setCurrentPhoto({
                    ...currentPhoto,
                    url: `${result.url}?t=${timestamp}`,
                    fullUrl: `${API_BASE_URL}${result.url}?t=${timestamp}`,
                    overlayApplied: true
                });

                setStatusMessage("Perfect! Love the wedding frame!");
            } else {
                console.error('Failed to apply overlay:', result.error);
                setStatusMessage("Couldn't add frame, but your photo still looks great!");
            }
        } catch (error) {
            console.error('Error applying overlay:', error);
            setStatusMessage("Couldn't add frame, but your photo still looks great!");
        } finally {
            setIsApplyingOverlay(false);
        }
    };

    // Handle keeping the photo
    const handleKeep = () => {
        // If overlay is not applied and not currently applying, apply it
        if (!currentPhoto.overlayApplied && !isApplyingOverlay) {
            handleApplyOverlay();
            return;
        }

        // Otherwise, proceed to QR code
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

    // Determine which image URL to display
    const displayUrl = currentPhoto.fullUrl || `${API_BASE_URL}${currentPhoto.url}`;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <motion.div
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
                transition={{duration: 0.5}}
                className={`w-full ${isLandscape ? 'max-w-6xl' : 'max-w-4xl'} bg-white rounded-xl shadow-elegant overflow-hidden`}
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
                <div className={`p-6 ${isLandscape ? 'flex items-center' : 'block'}`}>
                    {/* Photo container - adjusted for landscape */}
                    <div
                        className={`
                            ${isLandscape ? 'w-2/3 pr-6' : 'w-full mb-6'} 
                            relative
                        `}
                    >
                        <div className="aspect-[4/3] w-full overflow-hidden rounded-lg shadow-card relative">
                            {imageError ? (
                                <div
                                    className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 text-gray-500">
                                    <Icon path={mdiImage} size={4} className="mb-4"/>
                                    <p className="text-xl">Image could not be loaded</p>
                                </div>
                            ) : (
                                <>
                                    <img
                                        src={displayUrl}
                                        alt="Your photo"
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            console.error("Image failed to load:", displayUrl);
                                            e.target.onerror = null;
                                            setImageError(true);
                                        }}
                                    />
                                    {isApplyingOverlay && (
                                        <div
                                            className="absolute inset-0 bg-white/70 backdrop-blur-sm flex items-center justify-center">
                                            <div className="text-center">
                                                <motion.div
                                                    animate={{rotate: 360}}
                                                    transition={{repeat: Infinity, duration: 1.5, ease: "linear"}}
                                                    className="mb-4 text-hindu-accent"
                                                >
                                                    <Icon path={mdiLoading} size={3}/>
                                                </motion.div>
                                                <p className="text-xl font-medium text-hindu-accent">
                                                    Adding wedding frame...
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
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
                                {statusMessage}
                            </motion.p>
                        </AnimatePresence>

                        <div
                            className={`flex ${isLandscape ? 'flex-col space-y-4' : 'flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4'}`}>
                            {/* Retake button */}
                            <button
                                onClick={handleRetake}
                                disabled={isApplyingOverlay}
                                className="flex items-center justify-center btn btn-outline btn-hindu-outline text-lg py-3 px-6 w-full"
                            >
                                <Icon path={mdiCamera} size={1} className="mr-2"/>
                                Retake Photo
                            </button>

                            {/* Keep/Continue button */}
                            <button
                                onClick={handleKeep}
                                disabled={isApplyingOverlay}
                                className="flex items-center justify-center btn btn-primary btn-hindu text-lg py-3 px-6 w-full"
                            >
                                <Icon path={mdiCheck} size={1} className="mr-2"/>
                                {currentPhoto.overlayApplied ? "Perfect! Continue" : "Add Wedding Frame"}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default PhotoPreview;