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
    const [availableOverlays, setAvailableOverlays] = useState([]);

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

    // Fetch available overlays
    useEffect(() => {
        const fetchOverlays = async () => {
            try {
                const response = await fetch(`${API_ENDPOINT}/admin/overlays`);
                if (response.ok) {
                    const data = await response.json();
                    // Filter out standard and instagram overlays
                    const customOverlays = data.filter(overlay =>
                        overlay.name !== 'wedding-frame.png' &&
                        !overlay.name.startsWith('instagram')
                    );
                    setAvailableOverlays(customOverlays);
                }
            } catch (error) {
                console.error('Error fetching overlays:', error);
            }
        };

        fetchOverlays();
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
                    isInstagram: photoId.startsWith('instagram_'),
                    isCustomFrame: photoId.startsWith('frame_')
                };

                setPhoto(photoWithUrls);
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
        if (!photo || !photo.filename) return;

        try {
            // The correct file URL from your backend
            console.log(`Downloading for share${API_BASE_URL}${photo.url}`);
            const imageUrl = `${API_BASE_URL}${photo.url}`;

            // Fetch the image from the server
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error("Failed to fetch image from server.");

            const blob = await response.blob();
            const file = new File([blob], photo.filename, { type: blob.type });

            // Check if the browser supports file sharing
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Wedding Photo',
                    text: 'Check out this photo from Rushel & Sivani\'s wedding! 💕',
                    files: [file],
                });
                setShareSuccess(true);
            } else {
                console.log("File sharing not supported, falling back to link sharing.");
                // Fallback to link sharing
                await navigator.share({
                    title: 'Wedding Photo',
                    text: 'Check out this photo from Rushel & Sivani\'s wedding!',
                    url: window.location.href
                });
                setShareSuccess(true);
            }
        } catch (error) {
            console.error('Error sharing file:', error);
            alert("Sharing failed. Try downloading the photo and sharing manually.");
        }
    };

    // Handle download with success indicator
    const handleDownload = async () => {
        if (!photo || !photo.filename) return;

        try {
            // Fetch the image file from the server
            const imageUrl = `${API_BASE_URL}${photo.url}`;
            const response = await fetch(imageUrl);
            if (!response.ok) throw new Error("Failed to fetch image for download.");

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);

            // Create a temporary download link
            const link = document.createElement('a');
            link.href = url;
            link.download = photo.filename || "wedding-photo.jpg";
            document.body.appendChild(link);
            link.click();

            // Clean up
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            setDownloadSuccess(true);
        } catch (error) {
            console.error('Download failed:', error);
            alert("Download failed. Try again or save manually.");
        }
    };

    // Apply Instagram format
    const handleInstagramFormat = async () => {
        if (!photo) return;

        // Don't reapply if already in Instagram format
        if (photo.isInstagram) {
            setShowVersionOptions(false);
            return;
        }

        try {
            setLoading(true);
            const baseFilename = photo.filename.replace(/^(instagram_|frame_)/, '');

            const response = await fetch(`${API_ENDPOINT}/photos/${baseFilename}/overlay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    overlayName: 'instagram-frame.png',
                    createNewVersion: true
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to apply Instagram format (${response.status})`);
            }

            const result = await response.json();

            if (result.success) {
                // Navigate to the Instagram version
                navigate(`/photo/instagram_${baseFilename}`);
            } else {
                setError(result.error || 'Failed to apply Instagram format');
            }
        } catch (error) {
            console.error('Error applying Instagram format:', error);
            setError(error.message);
        } finally {
            setLoading(false);
            setShowVersionOptions(false);
        }
    };

    // Apply standard frame
    const handleStandardFrame = () => {
        // Don't reapply if already standard frame
        if (!photo.isInstagram && !photo.isCustomFrame) {
            setShowVersionOptions(false);
            return;
        }

        const baseFilename = photo.filename.replace(/^(instagram_|frame_)/, '');
        navigate(`/photo/${baseFilename}`);
        setShowVersionOptions(false);
    };

    // Apply custom frame
    const handleApplyCustomFrame = async (overlayName) => {
        if (!photo) return;

        try {
            setLoading(true);
            const baseFilename = photo.filename.replace(/^(instagram_|frame_)/, '');

            const response = await fetch(`${API_ENDPOINT}/photos/${baseFilename}/overlay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    overlayName: overlayName,
                    createNewVersion: true
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to apply frame (${response.status})`);
            }

            const result = await response.json();

            if (result.success) {
                // Navigate to the custom frame version
                navigate(`/photo/frame_${baseFilename}`);
            } else {
                setError(result.error || 'Failed to apply frame');
            }
        } catch (error) {
            console.error('Error applying frame:', error);
            setError(error.message);
        } finally {
            setLoading(false);
            setShowVersionOptions(false);
        }
    };

    // Format date for display
    const formatDate = (timestamp) => {
        if (!timestamp) return 'Unknown date';
        return new Date(timestamp).toLocaleString();
    };

    // Get current format label
    const getCurrentFormatLabel = () => {
        if (photo.isInstagram) return "Instagram Format";
        if (photo.isCustomFrame) return "Custom Frame";
        return "Standard Frame";
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
                    {/* Format selector */}
                    <div className="mb-2 flex justify-end">
                        <div className="relative">
                            <button
                                onClick={() => setShowVersionOptions(!showVersionOptions)}
                                className="flex items-center text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full"
                            >
                                <Icon path={mdiFile} size={0.8} className="mr-1" />
                                <span>{getCurrentFormatLabel()}</span>
                                <span className="ml-1">▼</span>
                            </button>

                            {/* Format options dropdown */}
                            <AnimatePresence>
                                {showVersionOptions && (
                                    <motion.div
                                        initial={{opacity: 0, y: 10, scale: 0.9}}
                                        animate={{opacity: 1, y: 0, scale: 1}}
                                        exit={{opacity: 0, y: 10, scale: 0.9}}
                                        className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg overflow-hidden z-10 w-56"
                                    >
                                        <div className="p-1">
                                            {/* Standard Frame */}
                                            <button
                                                onClick={handleStandardFrame}
                                                className="flex items-center w-full px-4 py-2 text-left hover:bg-gray-50"
                                            >
                                                <span className="flex-1">Standard Frame</span>
                                                {!photo.isInstagram && !photo.isCustomFrame && (
                                                    <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Current</span>
                                                )}
                                            </button>

                                            {/* Instagram Format */}
                                            <button
                                                onClick={handleInstagramFormat}
                                                className="flex items-center w-full px-4 py-2 text-left hover:bg-gray-50 border-t"
                                            >
                                                <span className="flex-1">Instagram Format</span>
                                                {photo.isInstagram && (
                                                    <span className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Current</span>
                                                )}
                                            </button>

                                            {/* Custom frames section */}
                                            {availableOverlays.length > 0 && (
                                                <div className="border-t pt-1 mt-1">
                                                    <div className="px-4 py-1 text-xs text-gray-500 font-medium">
                                                        Custom Frames
                                                    </div>
                                                    {availableOverlays.map(overlay => (
                                                        <button
                                                            key={overlay.name}
                                                            onClick={() => handleApplyCustomFrame(overlay.name)}
                                                            className="flex items-center w-full px-4 py-2 text-left hover:bg-gray-50"
                                                        >
                                                            <span className="flex-1">
                                                                {overlay.name.split('.')[0].replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Photo in elegant frame */}
                    <div className="mb-6 relative">
                        <div className="relative">
                            {/* Photo Frame with decorative border */}
                            <div className={`${photo.isInstagram ? 'aspect-square' : 'aspect-[1.414/1]'} w-full overflow-hidden rounded-lg shadow-lg relative mb-2`}>
                                {/* Double border effect */}
                                <div className="absolute inset-0 border-8 border-white z-10 rounded-md pointer-events-none"></div>
                                <div className="absolute inset-2 border border-gray-200 z-10 rounded-sm pointer-events-none"></div>

                                {/* Inner mat/background with gradient */}
                                <div className="absolute inset-0 bg-white"></div>

                                {/* Photo itself */}
                                <div className="absolute inset-[16px] flex items-center justify-center overflow-hidden">
                                    <img
                                        src={photo.fullUrl}
                                        alt="Wedding photo"
                                        className="max-w-full max-h-full object-contain"
                                        onError={(e) => {
                                            console.error('Error loading image:', photo.fullUrl);
                                            e.target.src = '/placeholder-image.jpg'; // Fallback image
                                            e.target.alt = 'Image could not be loaded';
                                        }}
                                    />
                                </div>

                                {/* Subtle "corners" overlay to indicate frame */}
                                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/60 rounded-tl-sm pointer-events-none"></div>
                                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/60 rounded-tr-sm pointer-events-none"></div>
                                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/60 rounded-bl-sm pointer-events-none"></div>
                                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/60 rounded-br-sm pointer-events-none"></div>
                            </div>
                        </div>
                    </div>

                    {/* Photo info */}
                    <div className="mb-6 text-center">
                        <p className="text-gray-600 font-display">
                            Taken on {formatDate(photo.timestamp)}
                        </p>

                        {/* Info about choosing formats */}
                        <p className="text-sm text-gray-500 mt-1">
                            {showVersionOptions ? 'Choose format above' : 'Use the format selector for Instagram or special frames'}
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