// AdminDashboard.js - For photo management and system control
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../App';
import OverlayUpload from './OverlayUpload';

const AdminDashboard = () => {
    const { photos, fetchPhotos, loading, error, deletePhoto } = useCamera();
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [cameraStatus, setCameraStatus] = useState('Loading...');
    const navigate = useNavigate();

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [photosPerPage] = useState(20);

    // Calculate pagination
    const indexOfLastPhoto = currentPage * photosPerPage;
    const indexOfFirstPhoto = indexOfLastPhoto - photosPerPage;
    const currentPhotos = photos.slice(indexOfFirstPhoto, indexOfLastPhoto);
    const totalPages = Math.ceil(photos.length / photosPerPage);

    // Function to change page
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    // Check admin authentication
    useEffect(() => {
        const isAdmin = sessionStorage.getItem('isAdmin') === 'true';
        if (!isAdmin) {
            navigate('/admin-login');
        }
    }, [navigate]);

    useEffect(() => {
        // Fetch photos when component mounts
        fetchPhotos();

        // Check camera status
        fetch(`${API_BASE_URL}/api/status`)
            .then(response => response.json())
            .then(data => {
                setCameraStatus(data.message);
            })
            .catch(error => {
                console.error('Error checking camera status:', error);
                setCameraStatus('Error checking camera status');
            });
    }, [fetchPhotos]);

    const handleLogout = () => {
        sessionStorage.removeItem('isAdmin');
        navigate('/');
    };

    // Handle selecting a photo for the lightbox
    const openLightbox = (photo) => {
        setSelectedPhoto(photo);
        setDeleteConfirm(null);
    };

    // Handle closing the lightbox
    const closeLightbox = () => {
        setSelectedPhoto(null);
        setDeleteConfirm(null);
    };

    // Handle photo deletion
    const handleDeletePhoto = async (filename) => {
        if (deleteConfirm === filename) {
            try {
                await deletePhoto(filename);
                setDeleteConfirm(null);
                setSelectedPhoto(null);
            } catch (err) {
                console.error('Error deleting photo:', err);
            }
        } else {
            setDeleteConfirm(filename);
        }
    };

    // Handle regenerating thumbnails for all photos
    const handleRegenerateThumbnails = () => {
        if (window.confirm("This will regenerate thumbnails for all photos and may take some time. Continue?")) {
            fetch(`${API_BASE_URL}/api/admin/generate-thumbnails`)
                .then(response => response.json())
                .then(data => {
                    alert(data.message || "Thumbnail generation started.");
                })
                .catch(error => {
                    console.error('Error starting thumbnail generation:', error);
                    alert("Error starting thumbnail generation.");
                });
        }
    };

    // Apply overlay to a specific photo
    const handleApplyOverlay = async (photoFilename) => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/photos/${photoFilename}/overlay`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    overlayName: 'wedding-frame.png'
                }),
            });

            const result = await response.json();

            if (result.success) {
                alert("Overlay applied successfully!");
                // Refresh the photos list
                fetchPhotos();
                // Close the lightbox
                closeLightbox();
            } else {
                alert("Error applying overlay: " + (result.error || "Unknown error"));
            }
        } catch (error) {
            console.error('Error applying overlay:', error);
            alert("Error applying overlay. Please try again.");
        }
    };

    // Format date for display
    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="min-h-screen bg-wedding-background">
            <div className="p-4 bg-white shadow-md">
                <div className="container mx-auto flex justify-between items-center">
                    <h1 className="text-2xl font-display text-christian-text">Admin Dashboard</h1>
                    <button
                        onClick={handleLogout}
                        className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 transition-colors text-sm"
                    >
                        Logout
                    </button>
                </div>
            </div>

            <div className="container mx-auto p-4">
                {/* Status panel */}
                <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                    <h2 className="text-lg font-semibold mb-2">System Status</h2>
                    <div className="flex flex-wrap gap-4">
                        <div className="bg-gray-100 rounded-md p-3 flex-1">
                            <span className="text-sm text-gray-500">Camera Status:</span>
                            <div className="font-medium">{cameraStatus}</div>
                        </div>
                        <div className="bg-gray-100 rounded-md p-3 flex-1">
                            <span className="text-sm text-gray-500">Photos Taken:</span>
                            <div className="font-medium">{photos.length}</div>
                        </div>
                        <div className="bg-gray-100 rounded-md p-3 flex-1">
                            <span className="text-sm text-gray-500">Last Photo:</span>
                            <div className="font-medium">
                                {photos.length > 0
                                    ? formatDate(photos[0].timestamp)
                                    : 'No photos yet'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick action buttons */}
                <div className="flex flex-wrap gap-4 mb-6">
                    <button
                        onClick={() => navigate('/camera')}
                        className="btn btn-primary btn-christian"
                    >
                        Take New Photo
                    </button>

                    <button
                        onClick={() => navigate('/')}
                        className="btn btn-outline btn-christian-outline"
                    >
                        Return to Home
                    </button>

                    <button
                        onClick={handleRegenerateThumbnails}
                        className="btn btn-outline btn-hindu-outline"
                    >
                        Regenerate Thumbnails
                    </button>
                </div>

                {/* Overlay Management */}
                <OverlayUpload />

                {/* Photos gallery */}
                <div className="bg-white rounded-lg shadow-md p-4">
                    <h2 className="text-lg font-semibold mb-4">Photo Gallery</h2>

                    {/* Loading state */}
                    {loading && (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-wedding-love mx-auto mb-4"></div>
                            <p>Loading photos...</p>
                        </div>
                    )}

                    {/* Error state */}
                    {error && !loading && (
                        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-4">
                            {error}
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && !error && photos.length === 0 && (
                        <div className="text-center py-12 bg-gray-50 rounded-lg">
                            <div className="mb-4 text-5xl">📷</div>
                            <h3 className="text-xl font-bold mb-2">No Photos Yet</h3>
                            <p className="text-gray-600 mb-6">Take some photos to see them here</p>
                            <button
                                onClick={() => navigate('/camera')}
                                className="btn btn-primary btn-christian"
                            >
                                Take a Photo
                            </button>
                        </div>
                    )}

                    {/* Photo grid with thumbnails */}
                    {!loading && !error && photos.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {currentPhotos.map((photo) => (
                                <motion.div
                                    key={photo.filename}
                                    whileHover={{ scale: 1.03 }}
                                    className="bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer"
                                    onClick={() => openLightbox(photo)}
                                >
                                    <div className="aspect-[4/3] w-full overflow-hidden">
                                        <img
                                            src={`${API_BASE_URL}${photo.thumbnailUrl || photo.url}`}
                                            alt={`Wedding photo ${photo.filename}`}
                                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                                            loading="lazy"
                                        />
                                    </div>
                                    <div className="p-2 text-xs text-gray-500">
                                        {formatDate(photo.timestamp)}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* Pagination controls */}
                    {!loading && !error && photos.length > 0 && (
                        <div className="mt-6 flex justify-center">
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => paginate(currentPage > 1 ? currentPage - 1 : currentPage)}
                                    disabled={currentPage === 1}
                                    className={`px-3 py-1 rounded border ${
                                        currentPage === 1
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    &laquo; Prev
                                </button>

                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter(num => {
                                        // Only show a few page numbers around the current page
                                        const showDirectly = Math.abs(num - currentPage) <= 1;
                                        const isFirstOrLast = num === 1 || num === totalPages;
                                        return showDirectly || isFirstOrLast;
                                    })
                                    .map((number) => {
                                        // If there's a gap, show ellipsis
                                        const prevNum = number - 1;
                                        const showEllipsisBefore =
                                            prevNum > 1 &&
                                            !Array.from({ length: totalPages }, (_, i) => i + 1)
                                                .filter(n => Math.abs(n - currentPage) <= 1 || n === 1 || n === totalPages)
                                                .includes(prevNum);

                                        return (
                                            <React.Fragment key={number}>
                                                {showEllipsisBefore && (
                                                    <span className="px-3 py-1 text-gray-500">...</span>
                                                )}
                                                <button
                                                    onClick={() => paginate(number)}
                                                    className={`px-3 py-1 rounded border ${
                                                        currentPage === number
                                                            ? 'bg-christian-accent text-white'
                                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {number}
                                                </button>
                                            </React.Fragment>
                                        );
                                    })}

                                <button
                                    onClick={() => paginate(currentPage < totalPages ? currentPage + 1 : currentPage)}
                                    disabled={currentPage === totalPages}
                                    className={`px-3 py-1 rounded border ${
                                        currentPage === totalPages
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            : 'bg-white text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    Next &raquo;
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox */}
            {selectedPhoto && (
                <div
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={closeLightbox}
                >
                    <div
                        className="max-w-4xl w-full bg-white rounded-lg overflow-hidden shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-4 bg-gray-800 text-white flex justify-between items-center">
                            <h3 className="text-lg font-medium truncate">
                                {selectedPhoto.filename}
                            </h3>
                            <button
                                onClick={closeLightbox}
                                className="text-white/80 hover:text-white"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-4">
                            <div className="relative">
                                <img
                                    src={`${API_BASE_URL}${selectedPhoto.url}`}
                                    alt={`Wedding photo ${selectedPhoto.filename}`}
                                    className="w-full h-auto max-h-[70vh] object-contain"
                                />
                            </div>

                            <div className="mt-4 flex flex-wrap justify-between items-center">
                                <div className="text-sm text-gray-600">
                                    <p>Taken: {formatDate(selectedPhoto.timestamp)}</p>
                                    <p>Filename: {selectedPhoto.filename}</p>
                                    {/* Display the photo URL */}
                                    <div className="mt-2">
                                        <p className="font-medium mb-1">Photo Link:</p>
                                        <div className="flex items-center">
                                            <input
                                                type="text"
                                                value={`https://fotobox.slyrix.com/photo/${selectedPhoto.filename}`}
                                                readOnly
                                                className="text-xs bg-gray-100 p-2 rounded border border-gray-300 w-full"
                                                onClick={(e) => e.target.select()}
                                            />
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`https://fotobox.slyrix.com/photo/${selectedPhoto.filename}`);
                                                    alert('Link copied to clipboard!');
                                                }}
                                                className="ml-2 p-2 bg-gray-100 rounded border border-gray-300 hover:bg-gray-200"
                                                title="Copy link"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap mt-4 sm:mt-0 gap-3">
                                    <a
                                        href={`${API_BASE_URL}${selectedPhoto.url}`}
                                        download
                                        className="btn btn-outline btn-christian-outline text-sm py-2"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Download
                                    </a>

                                    <a
                                        href={`${API_BASE_URL}${selectedPhoto.qrUrl}`}
                                        download
                                        className="btn btn-outline btn-hindu-outline text-sm py-2"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        Get QR Code
                                    </a>

                                    <button
                                        onClick={() => handleApplyOverlay(selectedPhoto.filename)}
                                        className="btn btn-primary btn-christian text-sm py-2"
                                    >
                                        Apply Frame
                                    </button>

                                    <button
                                        onClick={() => handleDeletePhoto(selectedPhoto.filename)}
                                        className="btn text-sm py-2 bg-red-500 hover:bg-red-600 text-white"
                                    >
                                        {deleteConfirm === selectedPhoto.filename ? 'Confirm Delete' : 'Delete'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;