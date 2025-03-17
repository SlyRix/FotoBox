// Updated PhotoPreview.js with overlay functionality
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';
import PhotoOverlay from './PhotoOverlay'; // Import the new component

const PhotoPreview = () => {
    const { currentPhoto, loading, apiBaseUrl, setCurrentPhoto } = useCamera();
    const navigate = useNavigate();
    const [imageError, setImageError] = useState(false);
    const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
    const [overlayApplied, setOverlayApplied] = useState(false);
    const [processedPhoto, setProcessedPhoto] = useState(null);

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

    // Handle retaking the photo
    const handleRetake = () => {
        navigate('/camera');
    };

    // Handle keeping the photo
    const handleKeep = () => {
        // If we have a processed photo with overlay, update the current photo
        if (processedPhoto) {
            // In a real implementation, you'd upload the processed image to the server here
            // For now, we'll just update the UI and proceed
            setCurrentPhoto({
                ...currentPhoto,
                overlayApplied: true,
                // Add a temporary displayUrl for showing the processed image on screen
                displayUrl: processedPhoto.processedImageData || currentPhoto.fullUrl
            });
        }
        navigate('/qrcode');
    };

    // Handle overlay completion
    const handleOverlayComplete = (processedPhotoData) => {
        setProcessedPhoto(processedPhotoData);
        setOverlayApplied(true);
    };

    // Loading state
    if (loading || !currentPhoto) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-24 w-24 border-t-8 border-b-8 border-wedding-love mx-auto mb-6"></div>
                    <p className="text-3xl text-gray-700">Processing your photo...</p>
                </div>
            </div>
        );
    }

    // Determine which image URL to display
    const displayUrl = processedPhoto?.processedImageData ||
        currentPhoto.displayUrl ||
        currentPhoto.fullUrl ||
        `${apiBaseUrl}${currentPhoto.url}`;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            {/* Include the overlay processor component */}
            <PhotoOverlay onComplete={handleOverlayComplete} />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={`w-full ${isLandscape ? 'max-w-6xl' : 'max-w-4xl'} bg-white rounded-lg shadow-lg overflow-hidden`}
            >
                {/* Header */}
                <div className="p-4 bg-hindu-secondary text-white">
                    <h2 className="text-3xl font-bold text-center">Your Photo</h2>
                </div>

                {/* Main content - optimized for landscape */}
                <div className={`p-4 ${isLandscape ? 'flex items-center' : 'block'}`}>
                    {/* Photo container - adjusted for landscape */}
                    <div
                        className={`
                            ${isLandscape ? 'w-2/3 pr-4' : 'w-full mb-4'} 
                            relative
                        `}
                    >
                        <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border-4 border-wedding-background relative">
                            {imageError ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 text-gray-500">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-xl">Image could not be loaded</p>
                                </div>
                            ) : (
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
                            )}
                        </div>
                    </div>

                    {/* Controls and text - adjusted for landscape */}
                    <div className={`${isLandscape ? 'w-1/3 pl-4 flex flex-col justify-center' : 'w-full'}`}>
                        <p className={`text-center ${isLandscape ? 'mb-8' : 'mb-4'} text-2xl text-gray-700`}>
                            {overlayApplied ?
                                "Perfect! Love the wedding frame!" :
                                "How does it look?"}
                        </p>

                        <div className={`flex ${isLandscape ? 'flex-col' : 'flex-col md:flex-row'} justify-center gap-4`}>
                            <button
                                onClick={handleRetake}
                                className="btn btn-outline btn-hindu-outline text-xl py-4 px-6 w-full"
                            >
                                Retake Photo
                            </button>

                            <button
                                onClick={handleKeep}
                                className="btn btn-primary btn-hindu text-xl py-4 px-6 w-full"
                            >
                                {overlayApplied ? "Continue with Frame" : "Perfect! Keep it"}
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default PhotoPreview;