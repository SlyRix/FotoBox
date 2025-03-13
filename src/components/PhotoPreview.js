
// client/src/components/PhotoPreview.js
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';

const PhotoPreview = () => {
    const { currentPhoto, takePhoto, loading } = useCamera();
    const navigate = useNavigate();
    const API = "http://192.168.1.70:5000";
    //TODO: Add Global API URL for all files

    // If no photo is available, redirect to camera
    if (!currentPhoto && !loading) {
        navigate('/camera');
        return null;
    }

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

    // Construct the image URL
    const imageUrl = `${API}${currentPhoto.url}`;

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
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border-4 border-wedding-background mb-4">
                        <img
                            src={imageUrl}
                            alt="Your photo"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/placeholder-image.jpg';
                            }}
                        />
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