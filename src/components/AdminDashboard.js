// AdminDashboard.js - For photo management and system control
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../App';

const AdminDashboard = () => {
    const { photos, fetchPhotos, loading, error, deletePhoto } = useCamera();
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [cameraStatus, setCameraStatus] = useState('Loading...');
    const navigate = useNavigate();

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
                </div>

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

                    {/* Photo grid */}
                    {!loading && !error && photos.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {photos.map((photo) => (
                                <motion.div
                                    key={photo.filename}
                                    whileHover={{ scale: 1.03 }}
                                    className="bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer"
                                    onClick={() => openLightbox(photo)}
                                >
                                    <div className="aspect-[4/3] w-full overflow-hidden">
                                        <img
                                            src={`${API_BASE_URL}${photo.url}`}
                                            alt={`Wedding photo ${photo.filename}`}
                                            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                                        />
                                    </div>
                                    <div className="p-2 text-xs text-gray-500">
                                        {formatDate(photo.timestamp)}
                                    </div>
                                </motion.div>
                            ))}
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
                            <img
                                src={`${API_BASE_URL}${selectedPhoto.url}`}
                                alt={`Wedding photo ${selectedPhoto.filename}`}
                                className="w-full h-auto max-h-[70vh] object-contain"
                            />

                            <div className="mt-4 flex flex-wrap justify-between items-center">
                                <div className="text-sm text-gray-600">
                                    <p>Taken: {formatDate(selectedPhoto.timestamp)}</p>
                                    <p>Filename: {selectedPhoto.filename}</p>
                                </div>

                                <div className="flex mt-4 sm:mt-0 space-x-3">
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