// src/components/PhotoView.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { API_BASE_URL, API_ENDPOINT } from '../App';

const PhotoView = () => {
    const { photoId } = useParams();
    const navigate = useNavigate();
    const [photo, setPhoto] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Fetch the specific photo data
    useEffect(() => {
        const fetchPhoto = async () => {
            try {
                const response = await fetch(`${API_ENDPOINT}/photos/${photoId}`);

                if (!response.ok) {
                    throw new Error('Photo not found');
                }

                const data = await response.json();

                // Add full URLs
                const photoWithUrls = {
                    ...data,
                    fullUrl: `${API_BASE_URL}${data.url}`,
                    fullThumbnailUrl: `${API_BASE_URL}${data.thumbnailUrl || data.url}`
                };

                setPhoto(photoWithUrls);
                setLoading(false);
            } catch (error) {
                console.error('Error fetching photo:', error);
                setError(error.message);
                setLoading(false);
            }
        };

        if (photoId) {
            fetchPhoto();
        } else {
            setError('No photo ID provided');
            setLoading(false);
        }
    }, [photoId]);

    // Format date for display
    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-wedding-background">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-wedding-love mx-auto mb-4"></div>
                    <p className="text-xl text-gray-700">Loading photo...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-wedding-background p-4">
                <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full text-center">
                    <div className="text-5xl mb-4">😕</div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Photo Not Found</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-primary btn-christian"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    if (!photo) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-wedding-background p-4">
                <div className="bg-white rounded-lg shadow-lg p-6 max-w-lg w-full text-center">
                    <div className="text-5xl mb-4">🔍</div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Photo Not Available</h2>
                    <p className="text-gray-600 mb-6">We couldn't find the requested photo.</p>
                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-primary btn-christian"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-4xl bg-white rounded-lg shadow-lg overflow-hidden"
            >
                {/* Header */}
                <div className="p-4 bg-wedding-gold/90 text-white">
                    <h2 className="text-3xl font-display text-center text-shadow">Rushel & Sivani's Wedding</h2>
                </div>

                {/* Photo display */}
                <div className="p-6">
                    <div className="mb-6">
                        <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border-4 border-wedding-background shadow-md">
                            <img
                                src={photo.fullUrl}
                                alt="Wedding photo"
                                className="w-full h-full object-contain"
                            />
                        </div>
                    </div>

                    {/* Photo info */}
                    <div className="mb-6 text-center">
                        <p className="text-gray-600">
                            Taken on {formatDate(photo.timestamp)}
                        </p>
                    </div>

                    {/* Buttons */}
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <a
                            href={photo.fullUrl}
                            download
                            className="btn btn-primary btn-christian text-center"
                        >
                            Download Photo
                        </a>

                        <a
                            href="/"
                            className="btn btn-outline btn-christian-outline text-center"
                        >
                            Go to Gallery
                        </a>
                    </div>

                    {/* Optional: Social sharing buttons */}
                    <div className="mt-8 text-center text-gray-600">
                        <p className="mb-3">Thank you for celebrating with us!</p>
                        <p className="text-sm">Share your memories with #RushelAndSivani2025</p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default PhotoView;