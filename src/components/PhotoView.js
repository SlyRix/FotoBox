import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL, API_ENDPOINT } from '../App';
import Icon from '@mdi/react';
import { mdiDownload, mdiShareVariant, mdiClose, mdiInstagram, mdiFacebook, mdiWhatsapp, mdiEmail, mdiHeartOutline, mdiLoading, mdiCheck, mdiFile } from '@mdi/js';

const PhotoView = () => {
    const { photoId } = useParams();
    const navigate = useNavigate();
    const [photo, setPhoto] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth <= 1024);
    const [isMobile, setIsMobile] = useState(false);
    const [isIOS, setIsIOS] = useState(false);
    const [showShareOptions, setShowShareOptions] = useState(false);
    const [shareSuccess, setShareSuccess] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState(false);
    const [showVersionOptions, setShowVersionOptions] = useState(false);
    const [selectedVersion, setSelectedVersion] = useState('standard'); // 'standard', 'instagram', 'wedding'

    // Detect mobile and iOS devices and screen orientation
    useEffect(() => {
        const handleResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
            setIsTablet(window.innerWidth >= 768 && window.innerWidth <= 1024);
        };

        const userAgent = navigator.userAgent.toLowerCase();
        setIsMobile(/android|iphone|ipad|ipod/.test(userAgent));
        setIsIOS(/iphone|ipad|ipod/.test(userAgent));

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        // Initial check
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);

    // Fetch the specific photo data
    useEffect(() => {
        const fetchPhoto = async () => {
            // Validate photoId to prevent unnecessary API calls
            if (!photoId) {
                setError('No photo ID provided');
                setLoading(false);
                return;
            }

            try {
                console.log(`Fetching photo with ID: ${photoId}`);
                const response = await fetch(`${API_ENDPOINT}/photos/${photoId}`);

                if (!response.ok) {
                    throw new Error(`Photo not found (Status: ${response.status})`);
                }

                const data = await response.json();

                // Add full URLs
                const photoWithUrls = {
                    ...data,
                    fullUrl: `${API_BASE_URL}${data.url}`,
                    fullThumbnailUrl: `${API_BASE_URL}${data.thumbnailUrl || data.url}`,
                    fullInstagramUrl: data.instagramUrl ? `${API_BASE_URL}${data.instagramUrl}` : null,
                    fullWeddingUrl: data.weddingUrl ? `${API_BASE_URL}${data.weddingUrl}` : data.fullUrl,
                    // Default version is the main one (with standard frame)
                    currentVersion: 'standard'
                };

                setPhoto(photoWithUrls);
                // Set selected version based on URL
                if (photoId.startsWith('instagram_')) {
                    setSelectedVersion('instagram');
                } else if (photoId.startsWith('wedding_')) {
                    setSelectedVersion('wedding');
                } else {
                    setSelectedVersion('standard');
                }
            } catch (error) {
                console.error('Error fetching photo:', error);
                setError(error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchPhoto();
    }, [photoId]);

    // Reset success indicators after 3 seconds
    useEffect(() => {
        if (shareSuccess) {
            const timer = setTimeout(() => setShareSuccess(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [shareSuccess]);

    useEffect(() => {
        if (downloadSuccess) {
            const timer = setTimeout(() => setDownloadSuccess(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [downloadSuccess]);

    // Handle share functionality for mobile devices
    const handleShareImage = async () => {
        if (navigator.share) {
            try {
                // Try to share the URL first as it's most compatible
                await navigator.share({
                    title: 'Wedding Photo',
                    text: 'Check out this photo from Rushel & Sivani\'s wedding!',
                    url: window.location.href
                });
                setShareSuccess(true);
            } catch (error) {
                console.error('Error sharing:', error);
                // On error, try to fetch and share the actual file
                try {
                    // Get the appropriate URL for sharing based on selected version
                    const imageUrl = getVersionUrl();

                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    const file = new File([blob], photo.filename, { type: blob.type });

                    await navigator.share({
                        files: [file],
                        title: 'Wedding Photo',
                    });
                    setShareSuccess(true);
                } catch (innerError) {
                    console.error('Error sharing file:', innerError);
                    // Fallback to opening in new tab
                    window.open(getVersionUrl(), '_blank');
                }
            }
        } else {
            // Show share options if Web Share API is not available
            setShowShareOptions(!showShareOptions);
        }
    };

    // Get URL for the current selected version
    const getVersionUrl = () => {
        if (!photo) return '';

        switch (selectedVersion) {
            case 'instagram':
                // Use Instagram version if available, otherwise use standard
                return photo.fullInstagramUrl || photo.fullUrl;
            case 'wedding':
                // Wedding frame version
                return photo.fullWeddingUrl || photo.fullUrl;
            default:
                // Default to standard framed version
                return photo.fullUrl;
        }
    };

    // Handle download with success indicator
    const handleDownload = () => {
        // Get the URL for the current selected version
        const downloadUrl = getVersionUrl();

        // Create a temporary link element
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `${selectedVersion}_${photo.filename || "wedding-photo.jpg"}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Show success indicator
        setDownloadSuccess(true);
    };

    // Handle switching between photo versions
    const handleSwitchVersion = (version) => {
        setSelectedVersion(version);
        setShowVersionOptions(false);
    };

    // Format date for display
    const formatDate = (timestamp) => {
        if (!timestamp) return 'Unknown date';
        return new Date(timestamp).toLocaleString();
    };

    // Generate a version name for display
    const getVersionLabel = (versionKey) => {
        switch (versionKey) {
            case 'instagram':
                return 'Instagram';
            case 'wedding':
                return 'Wedding Frame';
            default:
                return 'Standard';
        }
    };

    if (loading) {
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
                    <p className="text-xl font-display text-gray-700">Loading photo...</p>
                </div>
            </div>
        );
    }

    if (error || !photo) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
                <div className="bg-white rounded-xl shadow-elegant p-8 max-w-lg w-full text-center">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5 }}
                        className="text-5xl text-wedding-love mb-6"
                    >
                        <Icon path={mdiHeartOutline} size={3} />
                    </motion.div>
                    <h2 className="text-2xl font-display font-bold text-gray-800 mb-4">Photo Not Found</h2>
                    <p className="text-gray-600 mb-8">{error || "We couldn't find the requested photo."}</p>
                    <button
                        onClick={() => window.close()}
                        className="btn btn-primary btn-christian"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

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
                {/* Elegant header */}
                <div className="relative">
                    <div className="p-4 bg-gradient-to-r from-hindu-secondary to-hindu-accent text-white">
                        <h2 className="text-3xl font-script text-center text-shadow">Rushel & Sivani's Wedding</h2>
                    </div>

                    {/* Decorative element */}
                    <div className="absolute -bottom-3 left-0 right-0 flex justify-center">
                        <div className="flex space-x-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white"></div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Photo display */}
                <div className="p-6">
                    {/* Version selector tag */}
                    <div className="mb-2 flex justify-end">
                        <div className="relative">
                            <button
                                onClick={() => setShowVersionOptions(!showVersionOptions)}
                                className="flex items-center text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full"
                            >
                                <Icon path={mdiFile} size={0.8} className="mr-1" />
                                <span>{getVersionLabel(selectedVersion)}</span>
                                <span className="ml-1">▼</span>
                            </button>

                            {/* Version options dropdown - SIMPLIFIED */}
                            <AnimatePresence>
                                {showVersionOptions && (
                                    <motion.div
                                        initial={{opacity: 0, y: 10, scale: 0.9}}
                                        animate={{opacity: 1, y: 0, scale: 1}}
                                        exit={{opacity: 0, y: 10, scale: 0.9}}
                                        className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg overflow-hidden z-10 w-56"
                                    >
                                        <div className="p-1">
                                            {/* Standard Version - Main photo with frame */}
                                            <button
                                                onClick={() => handleSwitchVersion('standard')}
                                                className="flex items-center w-full px-4 py-2 text-left hover:bg-gray-50"
                                            >
                                                <span className="flex-1">Standard</span>
                                                {selectedVersion === 'standard' && (
                                                    <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Current</span>
                                                )}
                                            </button>

                                            {/* Instagram Version */}
                                            {photo.fullInstagramUrl && (
                                                <button
                                                    onClick={() => handleSwitchVersion('instagram')}
                                                    className="flex items-center w-full px-4 py-2 text-left hover:bg-gray-50 border-t"
                                                >
                                                    <span className="flex-1">Instagram</span>
                                                    {selectedVersion === 'instagram' && (
                                                        <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Current</span>
                                                    )}
                                                </button>
                                            )}

                                            {/* Wedding Frame Version */}
                                            {photo.fullWeddingUrl && (
                                                <button
                                                    onClick={() => handleSwitchVersion('wedding')}
                                                    className="flex items-center w-full px-4 py-2 text-left hover:bg-gray-50 border-t"
                                                >
                                                    <span className="flex-1">Wedding Frame</span>
                                                    {selectedVersion === 'wedding' && (
                                                        <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Current</span>
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Photo in elegant frame */}
                    <div className="mb-6 relative">
                        <div className="rounded-lg overflow-hidden shadow-card">
                            <img
                                src={getVersionUrl()}
                                alt="Wedding photo"
                                className="w-full h-auto"
                                onError={(e) => {
                                    console.error('Error loading image:', getVersionUrl());
                                    e.target.src = '/placeholder-image.jpg'; // Fallback image
                                    e.target.alt = 'Image could not be loaded';
                                }}
                            />
                        </div>
                    </div>

                    {/* Photo info */}
                    <div className="mb-6 text-center">
                        <p className="text-gray-600 font-display">
                            Taken on {formatDate(photo.timestamp)}
                        </p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex justify-center space-x-4">
                        {/* Download button with success indicator */}
                        <motion.button
                            onClick={handleDownload}
                            className="relative btn btn-outline btn-christian-outline flex items-center"
                            whileHover={{scale: 1.05}}
                            whileTap={{scale: 0.95}}
                        >
                            <AnimatePresence mode="wait">
                                {downloadSuccess ? (
                                    <motion.div
                                        key="success"
                                        initial={{scale: 0.5, opacity: 0}}
                                        animate={{scale: 1, opacity: 1}}
                                        exit={{scale: 0.5, opacity: 0}}
                                        className="mr-2 text-green-500"
                                    >
                                        <Icon path={mdiCheck} size={1}/>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="download"
                                        initial={{scale: 0.5, opacity: 0}}
                                        animate={{scale: 1, opacity: 1}}
                                        exit={{scale: 0.5, opacity: 0}}
                                        className="mr-2"
                                    >
                                        <Icon path={mdiDownload} size={1}/>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            {downloadSuccess ? "Downloaded!" : "Download Photo"}
                        </motion.button>

                        {/* Share button with options */}
                        <div className="relative">
                            <motion.button
                                onClick={handleShareImage}
                                className="btn btn-primary btn-hindu flex items-center"
                                whileHover={{scale: 1.05}}
                                whileTap={{scale: 0.95}}
                            >
                                <AnimatePresence mode="wait">
                                    {shareSuccess ? (
                                        <motion.div
                                            key="success"
                                            initial={{scale: 0.5, opacity: 0}}
                                            animate={{scale: 1, opacity: 1}}
                                            exit={{scale: 0.5, opacity: 0}}
                                            className="mr-2"
                                        >
                                            <Icon path={mdiCheck} size={1}/>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="share"
                                            initial={{scale: 0.5, opacity: 0}}
                                            animate={{scale: 1, opacity: 1}}
                                            exit={{scale: 0.5, opacity: 0}}
                                            className="mr-2"
                                        >
                                            <Icon path={mdiShareVariant} size={1}/>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                {shareSuccess ? "Shared!" : "Share Photo"}
                            </motion.button>

                            {/* Share options popup */}
                            <AnimatePresence>
                                {showShareOptions && (
                                    <motion.div
                                        initial={{opacity: 0, y: 10, scale: 0.9}}
                                        animate={{opacity: 1, y: 0, scale: 1}}
                                        exit={{opacity: 0, y: 10, scale: 0.9}}
                                        className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-elegant overflow-hidden z-10"
                                    >
                                        <div
                                            className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b">
                                            <span className="text-sm font-medium">Share via</span>
                                            <button
                                                onClick={() => setShowShareOptions(false)}
                                                className="text-gray-500 hover:text-gray-700"
                                            >
                                                <Icon path={mdiClose} size={0.8}/>
                                            </button>
                                        </div>
                                        <div className="p-1">
                                            {/* Instagram */}
                                            <a
                                                href={`https://www.instagram.com/?url=${encodeURIComponent(window.location.href)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center px-4 py-3 hover:bg-gray-50"
                                                onClick={() => setShareSuccess(true)}
                                            >
                                                <Icon path={mdiInstagram} size={1.2} className="text-pink-600 mr-3"/>
                                                <span>Instagram</span>
                                            </a>

                                            {/* Facebook */}
                                            <a
                                                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center px-4 py-3 hover:bg-gray-50 border-t"
                                                onClick={() => setShareSuccess(true)}
                                            >
                                                <Icon path={mdiFacebook} size={1.2} className="text-blue-600 mr-3"/>
                                                <span>Facebook</span>
                                            </a>

                                            {/* WhatsApp */}
                                            <a
                                                href={`https://wa.me/?text=${encodeURIComponent('Check out this photo from Rushel & Sivani\'s wedding! ' + window.location.href)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center px-4 py-3 hover:bg-gray-50 border-t"
                                                onClick={() => setShareSuccess(true)}
                                            >
                                                <Icon path={mdiWhatsapp} size={1.2} className="text-green-600 mr-3"/>
                                                <span>WhatsApp</span>
                                            </a>

                                            {/* Email */}
                                            <a
                                                href={`mailto:?subject=Wedding Photo&body=${encodeURIComponent('Check out this photo from Rushel & Sivani\'s wedding!\n\n' + window.location.href)}`}
                                                className="flex items-center px-4 py-3 hover:bg-gray-50 border-t"
                                                onClick={() => setShareSuccess(true)}
                                            >
                                                <Icon path={mdiEmail} size={1.2} className="text-gray-600 mr-3"/>
                                                <span>Email</span>
                                            </a>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Wedding info and social tags */}
                    <div className="mt-10 text-center">
                        <div className="fancy-divider my-6"></div>
                        <p className="text-gray-500 mb-2">Thank you for celebrating with us!</p>
                        <p className="text-sm text-wedding-love font-script text-lg">
                            #RushelAndSivani2026
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default PhotoView;