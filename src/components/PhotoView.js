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
    const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

    // Monitor orientation changes
    useEffect(() => {
        const handleResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Fetch the photo details when component mounts
    useEffect(() => {
        if (!photoId) {
            setError('No photo ID provided');
            setLoading(false);
            return;
        }

        const fetchPhoto = async () => {
            try {
                // First try to get photo details from API
                const response = await fetch(`${API_ENDPOINT}/photos/${photoId}`);

                if (!response.ok) {
                    // If specific photo endpoint fails, try to create photo info from filename
                    console.log('Specific photo endpoint failed, creating photo info from filename');
                    setPhoto({
                        filename: photoId,
                        url: `/photos/${photoId}`,
                        thumbnailUrl: `/thumbnails/thumb_${photoId}`,
                        timestamp: new Date().getTime()
                    });
                } else {
                    const data = await response.json();
                    setPhoto(data);
                }

                setLoading(false);
            } catch (err) {
                console.error('Error fetching photo:', err);
                // Even if there's an error with the API, still create basic info
                setPhoto({
                    filename: photoId,
                    url: `/photos/${photoId}`,
                    thumbnailUrl: `/thumbnails/thumb_${photoId}`,
                    timestamp: new Date().getTime()
                });
                setLoading(false);
            }
        };

        fetchPhoto();
    }, [photoId]);

    // Format date for display
    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-wedding-background">
                <div className="text-center p-8">
                    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-wedding-love mx-auto mb-6"></div>
                    <p className="text-xl text-gray-600">Loading your photo...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-wedding-background p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg overflow-hidden">
                    <div className="p-4 bg-red-500 text-white">
                        <h2 className="text-xl font-bold text-center">Error</h2>
                    </div>
                    <div className="p-6 text-center">
                        <p className="mb-6">{error}</p>
                        <button
                            onClick={() => navigate('/')}
                            className="btn btn-primary btn-christian"
                        >
                            Return to Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Make sure URLs are fully qualified
    const imageUrl = photo.url.startsWith('http')
        ? photo.url
        : `${API_BASE_URL}${photo.url}`;

    const thumbnailUrl = photo.thumbnailUrl && photo.thumbnailUrl.startsWith('http')
        ? photo.thumbnailUrl
        : `${API_BASE_URL}${photo.thumbnailUrl || photo.url}`;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className={`w-full ${isLandscape ? 'max-w-5xl' : 'max-w-xl'} bg-white rounded-lg shadow-lg overflow-hidden`}
            >
                <div className="p-4 bg-christian-accent text-white">
                    <h2 className="text-2xl font-display text-center">Rushel & Sivani's Wedding</h2>
                </div>

                <div className="p-6">
                    <div className="flex flex-col items-center">
                        <div className="w-full max-w-2xl">
                            <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border-4 border-wedding-background shadow-md mb-4">
                                <img
                                    src={imageUrl}
                                    alt="Wedding memory"
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        console.error("Primary image failed to load, trying thumbnail");
                                        e.target.onerror = null; // Prevent infinite loop
                                        e.target.src = thumbnailUrl;
                                    }}
                                />
                            </div>
                        </div>

                        <div className="w-full max-w-2xl">
                            <div className="text-center mb-6">
                                <h3 className="text-xl font-display text-christian-text mb-2">Thank you for celebrating with us!</h3>
                                <p className="text-sm text-gray-500">
                                    Photo taken: {formatDate(photo.timestamp)}
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-center gap-4">
                                <a
                                    href={imageUrl}
                                    download={photo.filename}
                                    className="btn btn-primary btn-christian text-center"
                                >
                                    Download Photo
                                </a>

                                <button
                                    onClick={() => navigate('/')}
                                    className="btn btn-outline btn-christian-outline"
                                >
                                    Return to Gallery
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 text-center">
                    <p className="text-sm text-gray-500">
                        © {new Date().getFullYear()} • Rushel & Sivani Wedding
                    </p>
                </div>
            </motion.div>
        </div>
    );
};

export default PhotoView;