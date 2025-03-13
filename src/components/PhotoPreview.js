// client/src/components/PhotoPreview.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';

const PhotoPreview = () => {
    const { currentPhoto, loading, apiBaseUrl } = useCamera();
    const navigate = useNavigate();
    const [imageError, setImageError] = useState(false);

    // Use useEffect for navigation to avoid state updates during render
    useEffect(() => {
        // Only navigate if not loading and no current photo
        if (!loading && !currentPhoto) {
            navigate('/camera');
        }
    }, [currentPhoto, loading, navigate]);

    // Handle retaking the photo
    const handleRetake = () => {
        navigate('/camera');
    };

    // Handle keeping the photo
    const handleKeep = () => {
        navigate('/qrcode');
    };

    // Loading state
    if (loading || !currentPhoto) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-wedding-love mx-auto mb-4"></div>
                    <p className="text-xl text-gray-700">Processing your photo...</p>
                </div>
            </div>
        );
    }

    // First try to use the fullUrl if available, otherwise construct it
    const imageUrl = currentPhoto.fullUrl || `${apiBaseUrl}${currentPhoto.url}`;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-2xl bg-white rounded-lg shadow-lg overflow-hidden"
            >
                <div className="p-4 bg-christian-accent text-white">
                    <h2 className="text-xl font-bold text-center">Your Photo</h2>
                </div>

                <div className="p-4">
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border-4 border-wedding-background mb-4 relative">
                        {imageError ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 text-gray-500">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <p>Image could not be loaded</p>
                                <p className="text-sm mt-2">URL: {imageUrl}</p>
                            </div>
                        ) : (
                            <img
                                src={imageUrl}
                                alt="Your photo"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                    console.error("Image failed to load:", imageUrl);
                                    e.target.onerror = null;
                                    setImageError(true);
                                }}
                            />
                        )}
                    </div>

                    <p className="text-center mb-6 text-lg text-gray-700">
                        How does it look?
                    </p>

                    <div className="flex justify-center space-x-4">
                        <button
                            onClick={handleRetake}
                            className="btn btn-outline btn-hindu-outline"
                        >
                            Retake
                        </button>

                        <button
                            onClick={handleKeep}
                            className="btn btn-primary btn-christian"
                        >
                            Perfect! Keep it
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default PhotoPreview;