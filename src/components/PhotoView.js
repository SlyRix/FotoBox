import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL, API_ENDPOINT } from '../App';
import ProgressiveImage from './ProgressiveImage';
import PhotoFilters, { FilteredImage, FILTERS } from './PhotoFilters';
import { useSound } from '../contexts/SoundContext';
import Icon from '@mdi/react';
import {
    mdiDownload, mdiShareVariant, mdiClose, mdiInstagram, mdiFacebook,
    mdiWhatsapp, mdiEmail, mdiHeartOutline, mdiCheck, mdiFile,
    mdiMagicStaff, mdiArrowLeftRight, mdiChevronLeft,
    mdiImageFilterBlackWhite, mdiImageFilterVintage, mdiTwitter
} from '@mdi/js';
import HeartSpinner from './HeartSpinner';

const PhotoView = () => {
    const { photoId } = useParams();
    const navigate = useNavigate();
    const { playClickSound, playSuccessSound } = useSound();

    const photoRef = useRef(null);

    const [photo, setPhoto] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
    const [isMobile, setIsMobile] = useState(false);
    const [showShareOptions, setShowShareOptions] = useState(false);
    const [shareSuccess, setShareSuccess] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState(false);
    const [showVersionOptions, setShowVersionOptions] = useState(false);
    const [availableOverlays, setAvailableOverlays] = useState([]);
    const [savingFilter, setSavingFilter] = useState(false);
    const [isNavigating, setIsNavigating] = useState(false);

    // Simple touch-based zoom
    const [scale, setScale] = useState(1);
    const [lastTapTime, setLastTapTime] = useState(0);

    // Filter state
    const [selectedFilter, setSelectedFilter] = useState('original');
    const [showFilters, setShowFilters] = useState(false);

    // Detect device and orientation
    useEffect(() => {
        const handleResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
            const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
            setIsMobile(mobileCheck);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        // Initial check
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);

    // Add double-tap zoom for touch devices
    useEffect(() => {
        const handleDoubleTap = (e) => {
            if (!isMobile) return;

            const now = Date.now();
            if (now - lastTapTime < 300) { // 300ms threshold for double-tap
                e.preventDefault();
                // Toggle zoom on double tap
                setScale(scale === 1 ? 2 : 1);
            }
            setLastTapTime(now);
        };

        const element = photoRef.current;
        if (element) {
            element.addEventListener('touchend', handleDoubleTap);

            return () => {
                element.removeEventListener('touchend', handleDoubleTap);
            };
        }
    }, [isMobile, lastTapTime, scale]);

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
                setLoading(true);

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

                // Reset zoom and filter when loading a new photo
                setScale(1);
                setSelectedFilter('original');
            } catch (error) {
                console.error('Error fetching photo:', error);
                setError(error.message);
            } finally {
                setLoading(false);
                setIsNavigating(false);
            }
        };

        // Reset any previous errors when photoId changes
        setError(null);
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

    // Handle safe navigation
    const navigateSafely = (path) => {
        setIsNavigating(true);
        // Short delay to allow state to update
        setTimeout(() => {
            navigate(path);
        }, 50);
    };

    // Go back to previous page
    const handleGoBack = () => {
        if (playClickSound) playClickSound();
        navigateSafely('/gallery');
    };

    // Handle share functionality for mobile devices
    const handleShareImage = async () => {
        if (playClickSound) playClickSound();

        if (!photo || !photo.filename) return;

        try {
            // Check if Web Share API is available (mobile devices)
            if (navigator.share) {
                await navigator.share({
                    title: 'Wedding Photo',
                    text: 'Check out this photo from Rushel & Sivani\'s wedding! 💕',
                    url: window.location.href
                });
                if (playSuccessSound) playSuccessSound();
                setShareSuccess(true);
                return;
            }

            // For desktop or devices without Web Share API support
            setShowShareOptions(!showShareOptions);
        } catch (error) {
            console.error('Error sharing:', error);
            // Fallback to showing share options
            setShowShareOptions(!showShareOptions);
        }
    };

    // Handle download with success indicator
    const handleDownload = async () => {
        if (playClickSound) playClickSound();

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

            if (playSuccessSound) playSuccessSound();
            setDownloadSuccess(true);
        } catch (error) {
            console.error('Download failed:', error);
            alert("Download failed. Try again or save manually.");
        }
    };

    // Apply Instagram format
    const handleInstagramFormat = async () => {
        if (playClickSound) playClickSound();
        setShowVersionOptions(false);

        if (!photo) return;

        // Don't reapply if already in Instagram format
        if (photo.isInstagram) {
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
                if (playSuccessSound) playSuccessSound();

                // Use the safe navigation method
                navigateSafely(`/photo/instagram_${baseFilename}`);
            } else {
                setError(result.error || 'Failed to apply Instagram format');
                setLoading(false);
            }
        } catch (error) {
            console.error('Error applying Instagram format:', error);
            setError(error.message);
            setLoading(false);
        }
    };

    // Apply standard frame
    const handleStandardFrame = () => {
        if (playClickSound) playClickSound();
        setShowVersionOptions(false);

        // Don't reapply if already standard frame
        if (!photo.isInstagram && !photo.isCustomFrame) {
            return;
        }

        const baseFilename = photo.filename.replace(/^(instagram_|frame_)/, '');

        // Use the safe navigation method
        navigateSafely(`/photo/${baseFilename}`);
    };

    // Apply custom frame
    const handleApplyCustomFrame = async (overlayName) => {
        if (playClickSound) playClickSound();
        setShowVersionOptions(false);

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
                if (playSuccessSound) playSuccessSound();

                // Use the safe navigation method
                navigateSafely(`/photo/frame_${baseFilename}`);
            } else {
                setError(result.error || 'Failed to apply frame');
                setLoading(false);
            }
        } catch (error) {
            console.error('Error applying frame:', error);
            setError(error.message);
            setLoading(false);
        }
    };

    // Toggle filter panel
    const handleToggleFilters = () => {
        if (playClickSound) playClickSound();
        setShowFilters(!showFilters);
    };

    // Apply filter change
    const handleFilterChange = (filter) => {
        if (playClickSound) playClickSound();
        setSelectedFilter(filter.id);
    };

    // Save photo with filter applied
    const handleSaveWithFilter = async () => {
        if (selectedFilter === 'original' || !photo) return;

        if (playClickSound) playClickSound();

        try {
            setSavingFilter(true);
            // Example API endpoint for saving a filtered version
            const response = await fetch(`${API_ENDPOINT}/photos/${photo.filename}/filter`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filter: selectedFilter })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    if (playSuccessSound) playSuccessSound();
                    // Ideally, update the current photo with the new filtered version
                    setPhoto(prev => ({
                        ...prev,
                        fullUrl: `${result.photoUrl}?t=${Date.now()}` // Add timestamp to prevent caching
                    }));
                    // Reset to original filter after successful save
                    setSelectedFilter('original');
                    // Close filter panel
                    setShowFilters(false);
                } else {
                    throw new Error(result.error || 'Failed to save filtered photo');
                }
            } else {
                throw new Error(`Server responded with status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error saving filtered photo:', error);
            alert('Failed to save filtered photo. Please try again.');
        } finally {
            setSavingFilter(false);
        }
    };

    // Reset zoom
    const resetZoom = () => {
        if (playClickSound) playClickSound();
        setScale(1);
    };

    // Format date for display
    const formatDate = (timestamp) => {
        if (!timestamp) return 'Unknown date';
        return new Date(timestamp).toLocaleString();
    };

    // Get current format label
    const getCurrentFormatLabel = () => {
        if (!photo) return "Loading...";
        if (photo.isInstagram) return "Instagram Format";
        if (photo.isCustomFrame) return "Custom Frame";
        return "Standard Frame";
    };

    // Show spinner during loading or navigation
    if (loading || isNavigating) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
                <HeartSpinner />
            </div>
        );
    }

    // Show error state
    if (error || !photo) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
                <div className="bg-white rounded-xl shadow-elegant p-6 max-w-lg w-full text-center">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0.5 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.5 }}
                        className="text-5xl text-wedding-love mb-6"
                    >
                        <Icon path={mdiHeartOutline} size={3} />
                    </motion.div>
                    <h2 className="text-xl font-display font-bold text-gray-800 mb-4">Photo Not Found</h2>
                    <p className="text-gray-600 mb-6">{error || "We couldn't find the requested photo."}</p>
                    <button
                        onClick={() => {
                            if (playClickSound) playClickSound();
                            navigateSafely('/');
                        }}
                        className="btn btn-primary btn-christian text-lg py-3 px-8 w-full sm:w-auto"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
            {/* Mobile-friendly header with back button */}
            <div className="bg-gradient-to-r from-hindu-secondary to-hindu-accent text-white p-3 flex items-center justify-between shadow-md">
                <button
                    onClick={handleGoBack}
                    className="p-2 rounded-full hover:bg-white/20 active:bg-white/30 transition-colors"
                >
                    <Icon path={mdiChevronLeft} size={1.2} />
                </button>

                <h2 className="text-xl font-script">Wedding Photo</h2>

                <div className="w-8"></div> {/* Spacer to balance layout */}
            </div>

            <div className="flex-1 p-3 sm:p-4 overflow-auto">
                <motion.div
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    transition={{duration: 0.5}}
                    className="bg-white rounded-xl shadow-elegant overflow-hidden mx-auto"
                    style={{maxWidth: isMobile ? '100%' : '800px'}}
                >
                    {/* Format and Filter Controls - Always visible for easy access */}
                    <div className="px-4 py-3 flex justify-between items-center border-b border-gray-100">
                        {/* Format selector */}
                        <div className="relative flex-1">
                            <button
                                onClick={() => {
                                    if (playClickSound) playClickSound();
                                    setShowVersionOptions(!showVersionOptions);
                                }}
                                className="flex items-center text-sm bg-gray-100 hover:bg-gray-200 active:bg-gray-300 px-3 py-2 rounded-full transition-colors"
                            >
                                <Icon path={mdiFile} size={0.8} className="mr-1"/>
                                <span>{getCurrentFormatLabel()}</span>
                                <Icon path={showVersionOptions ? mdiClose : mdiFile} size={0.8} className="ml-1" />
                            </button>

                            {/* Format options dropdown */}
                            <AnimatePresence>
                                {showVersionOptions && (
                                    <motion.div
                                        initial={{opacity: 0, y: 10, scale: 0.9}}
                                        animate={{opacity: 1, y: 0, scale: 1}}
                                        exit={{opacity: 0, y: 10, scale: 0.9}}
                                        className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg overflow-hidden z-50 w-56"
                                    >
                                        <div className="p-1">
                                            {/* Standard Frame */}
                                            <button
                                                onClick={handleStandardFrame}
                                                className="flex items-center w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 rounded-lg"
                                            >
                                                <span className="flex-1">Standard Frame</span>
                                                {!photo.isInstagram && !photo.isCustomFrame && (
                                                    <span
                                                        className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Current</span>
                                                )}
                                            </button>

                                            {/* Instagram Format */}
                                            <button
                                                onClick={handleInstagramFormat}
                                                className="flex items-center w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 rounded-lg"
                                            >
                                                <span className="flex-1">Instagram Format</span>
                                                {photo.isInstagram && (
                                                    <span
                                                        className="ml-2 text-xs bg-gray-100 px-2 py-0.5 rounded">Current</span>
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
                                                            className="flex items-center w-full px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 rounded-lg"
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

                        {/* Filter toggle button */}
                        <div className="ml-2">
                            <button
                                onClick={handleToggleFilters}
                                className={`flex items-center text-sm ${
                                    showFilters || selectedFilter !== 'original'
                                        ? 'bg-wedding-love text-white'
                                        : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700'
                                } px-3 py-2 rounded-full transition-colors`}
                            >
                                <Icon
                                    path={selectedFilter === 'grayscale' ? mdiImageFilterBlackWhite :
                                        selectedFilter === 'sepia' ? mdiImageFilterVintage :
                                            mdiMagicStaff}
                                    size={0.8}
                                    className="mr-1"
                                />
                                <span>{selectedFilter === 'original' ? 'Filters' :
                                    FILTERS.find(f => f.id === selectedFilter)?.name}</span>
                                <Icon path={showFilters ? mdiClose : mdiMagicStaff} size={0.8} className="ml-1" />
                            </button>
                        </div>
                    </div>

                    {/* Filter panel */}
                    <AnimatePresence>
                        {showFilters && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden border-b border-gray-100"
                            >
                                <div className="p-3 bg-gray-50">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-sm font-medium text-gray-700">Photo Filters</h3>

                                        {selectedFilter !== 'original' && (
                                            <button
                                                onClick={handleSaveWithFilter}
                                                disabled={savingFilter}
                                                className={`flex items-center text-xs px-3 py-1 bg-wedding-love text-white rounded-full ${
                                                    savingFilter ? 'opacity-50' : 'hover:bg-wedding-love/90 active:bg-wedding-love/80'
                                                }`}
                                            >
                                                {savingFilter ? (
                                                    <motion.div
                                                        animate={{ rotate: 360 }}
                                                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                                        className="mr-1"
                                                    >
                                                        <Icon path={mdiArrowLeftRight} size={0.6} />
                                                    </motion.div>
                                                ) : (
                                                    <span>Save with Filter</span>
                                                )}
                                            </button>
                                        )}
                                    </div>

                                    <PhotoFilters
                                        onFilterChange={handleFilterChange}
                                        currentFilter={selectedFilter}
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Photo display - enables double tap zoom for mobile */}
                    <div
                        ref={photoRef}
                        className="p-3 flex items-center justify-center overflow-hidden"
                        style={{ touchAction: "manipulation" }}
                        onDoubleClick={resetZoom}
                    >
                        {/* Photo in elegant frame */}
                        <motion.div
                            className={`${photo.isInstagram ? 'aspect-[9/16] max-w-sm mx-auto' : 'aspect-[1.414/1]'} 
                                        w-full rounded-lg shadow-lg relative mb-2`}
                        >
                            {/* Instagram format indicator */}
                            {photo.isInstagram && (
                                <div
                                    className="absolute top-0 left-0 bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs px-3 py-1 rounded-br z-20 font-medium shadow-sm">
                                    Instagram Format
                                </div>
                            )}

                            {/* Double border effect */}
                            <div
                                className="absolute inset-0 border-8 border-white z-10 rounded-md pointer-events-none"></div>
                            <div
                                className="absolute inset-2 border border-gray-200 z-10 rounded-sm pointer-events-none"></div>

                            {/* Photo with filter applied */}
                            <motion.div
                                className="absolute inset-[16px] flex items-center justify-center overflow-hidden"
                                animate={{ scale }}
                                transition={{ type: "spring", damping: 20 }}
                            >
                                <FilteredImage
                                    src={photo.fullUrl}
                                    filter={selectedFilter}
                                    className={`${photo.isInstagram ? 'w-full h-full object-cover' : 'max-w-full max-h-full object-contain'}`}
                                />
                            </motion.div>

                            {/* Subtle "corners" overlay */}
                            <div
                                className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/60 rounded-tl-sm pointer-events-none"></div>
                            <div
                                className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/60 rounded-tr-sm pointer-events-none"></div>
                            <div
                                className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/60 rounded-bl-sm pointer-events-none"></div>
                            <div
                                className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/60 rounded-br-sm pointer-events-none"></div>
                        </motion.div>
                    </div>

                    {/* Action buttons for sharing and download */}
                    <div className="p-4 flex flex-col sm:flex-row justify-center gap-3">
                        {/* Download button with success indicator */}
                        <motion.button
                            onClick={handleDownload}
                            className="relative btn btn-outline btn-christian-outline flex items-center justify-center w-full sm:w-auto text-base py-3 px-6"
                            whileHover={{scale: 1.02}}
                            whileTap={{scale: 0.98}}
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
                                        <Icon path={mdiCheck} size={0.9}/>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="download"
                                        initial={{scale: 0.5, opacity: 0}}
                                        animate={{scale: 1, opacity: 1}}
                                        exit={{scale: 0.5, opacity: 0}}
                                        className="mr-2"
                                    >
                                        <Icon path={mdiDownload} size={0.9}/>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <span>
                                {downloadSuccess ? "Downloaded!" : "Download Photo"}
                            </span>
                        </motion.button>

                        {/* Share button */}
                        <div className="relative w-full sm:w-auto">
                            <motion.button
                                onClick={handleShareImage}
                                className="btn btn-primary btn-hindu flex items-center justify-center w-full text-base py-3 px-6"
                                whileHover={{scale: 1.02}}
                                whileTap={{scale: 0.98}}
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
                                            <Icon path={mdiCheck} size={0.9}/>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="share"
                                            initial={{scale: 0.5, opacity: 0}}
                                            animate={{scale: 1, opacity: 1}}
                                            exit={{scale: 0.5, opacity: 0}}
                                            className="mr-2"
                                        >
                                            <Icon path={mdiShareVariant} size={0.9}/>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <span>
                                    {shareSuccess ? "Shared!" : "Share Photo"}
                                </span>
                            </motion.button>

                            {/* Share options popup - only shown when share button clicked on desktop */}
                            <AnimatePresence>
                                {showShareOptions && !isMobile && (
                                    <motion.div
                                        initial={{opacity: 0, y: 10, scale: 0.9}}
                                        animate={{opacity: 1, y: 0, scale: 1}}
                                        exit={{opacity: 0, y: 10, scale: 0.9}}
                                        className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-lg overflow-hidden z-10 w-56"
                                    >
                                        <div
                                            className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b">
                                            <span className="text-sm font-medium">Share via</span>
                                            <button
                                                onClick={() => {
                                                    if (playClickSound) playClickSound();
                                                    setShowShareOptions(false);
                                                }}
                                                className="text-gray-500 hover:text-gray-700 p-1"
                                            >
                                                <Icon path={mdiClose} size={0.8}/>
                                            </button>
                                        </div>

                                        <div className="py-1">
                                            {/* Common share options */}
                                            {[
                                                {
                                                    name: 'Facebook',
                                                    icon: mdiFacebook,
                                                    color: '#1877F2',
                                                    url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`
                                                },
                                                {
                                                    name: 'Twitter',
                                                    icon: mdiTwitter,
                                                    color: '#1DA1F2',
                                                    url: `https://twitter.com/intent/tweet?text=${encodeURIComponent('Check out this photo from Rushel & Sivani\'s wedding! ' + window.location.href)}`
                                                },
                                                {
                                                    name: 'WhatsApp',
                                                    icon: mdiWhatsapp,
                                                    color: '#25D366',
                                                    url: `https://wa.me/?text=${encodeURIComponent('Check out this photo from Rushel & Sivani\'s wedding! ' + window.location.href)}`
                                                },
                                                {
                                                    name: 'Email',
                                                    icon: mdiEmail,
                                                    color: '#D44638',
                                                    url: `mailto:?subject=Wedding Photo&body=${encodeURIComponent('Check out this photo from Rushel & Sivani\'s wedding!\n\n' + window.location.href)}`
                                                }
                                            ].map((option) => (
                                                <a
                                                    key={option.name}
                                                    href={option.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center px-4 py-2 hover:bg-gray-50"
                                                    onClick={() => {
                                                        if (playClickSound) playClickSound();
                                                        setShareSuccess(true);
                                                        setShowShareOptions(false);
                                                    }}
                                                >
                                                    <Icon
                                                        path={option.icon}
                                                        size={1}
                                                        className="mr-3"
                                                        style={{ color: option.color }}
                                                    />
                                                    <span>{option.name}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Mobile touch instruction - show briefly */}
                    {isMobile && (
                        <motion.div
                            className="text-center text-xs text-gray-500 pb-2"
                            initial={{ opacity: 1 }}
                            animate={{ opacity: 0 }}
                            transition={{ delay: 3, duration: 1 }}
                        >
                            Double-tap image to zoom
                        </motion.div>
                    )}
                </motion.div>

                {/* Wedding hashtag for footer */}
                <div className="mt-6 text-center">
                    <p className="text-sm text-wedding-love font-script">
                        #RushelAndSivani2026
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PhotoView;