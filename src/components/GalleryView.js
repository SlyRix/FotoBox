// client/src/components/GalleryView.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../App';

const GalleryView = () => {
    const { photos, fetchPhotos, loading } = useCamera();
    const navigate = useNavigate();
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [photosPerPage] = useState(16); // Showing 16 photos per page (4x4 grid)

    // Calculate pagination
    const indexOfLastPhoto = currentPage * photosPerPage;
    const indexOfFirstPhoto = indexOfLastPhoto - photosPerPage;
    const currentPhotos = photos.slice(indexOfFirstPhoto, indexOfLastPhoto);
    const totalPages = Math.ceil(photos.length / photosPerPage);

    // Function to change page
    const paginate = (pageNumber) => {
        setCurrentPage(pageNumber);
        // Scroll to top when changing pages
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    useEffect(() => {
        // Fetch photos when component mounts
        fetchPhotos();
    }, [fetchPhotos]);

    // Handle selecting a photo for the lightbox
    const openLightbox = (photo) => {
        setSelectedPhoto(photo);
    };

    // Handle closing the lightbox
    const closeLightbox = () => {
        setSelectedPhoto(null);
    };

    // Format date for display
    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <div className="container mx-auto max-w-6xl">
                {/* Header */}
                <div className="my-8 text-center">
                    <button
                        onClick={() => navigate('/')}
                        className="absolute top-8 left-8 text-christian-accent hover:text-wedding-love transition-colors"
                    >
                        ← Back to Home
                    </button>

                    <h1 className="text-3xl md:text-4xl font-bold mb-2">Wedding Photo Gallery</h1>
                    <p className="text-gray-600">All the beautiful moments captured at our wedding</p>
                </div>

                {/* Loading state */}
                {loading && (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-wedding-love mx-auto mb-4"></div>
                        <p>Loading photos...</p>
                    </div>
                )}

                {/* Empty state */}
                {!loading && photos.length === 0 && (
                    <div className="text-center py-12 bg-white/70 rounded-lg shadow">
                        <div className="mb-4 text-5xl">📷</div>
                        <h3 className="text-xl font-bold mb-2">No Photos Yet</h3>
                        <p className="text-gray-600 mb-6">Be the first to capture a memory!</p>
                        <button
                            onClick={() => navigate('/camera')}
                            className="btn btn-primary btn-christian"
                        >
                            Take a Photo
                        </button>
                    </div>
                )}

                {/* Photo grid using thumbnails */}
                {!loading && photos.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {currentPhotos.map((photo) => (
                            <motion.div
                                key={photo.filename}
                                whileHover={{ scale: 1.02 }}
                                className="bg-white rounded-lg shadow-md overflow-hidden cursor-pointer"
                                onClick={() => openLightbox(photo)}
                            >
                                <div className="aspect-[4/3] w-full overflow-hidden">
                                    <img
                                        src={`${API_BASE_URL}${photo.thumbnailUrl || photo.url}`}
                                        alt={`Wedding photo ${photo.filename}`}
                                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
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
                {!loading && photos.length > photosPerPage && (
                    <div className="mt-8 flex justify-center">
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

                {/* Take another photo button */}
                {!loading && photos.length > 0 && (
                    <div className="mt-8 text-center">
                        <button
                            onClick={() => navigate('/camera')}
                            className="btn btn-primary btn-christian"
                        >
                            Take Another Photo
                        </button>
                    </div>
                )}

                {/* Lightbox - use original image */}
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
                                <h3 className="text-lg font-medium">Photo Details</h3>
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

                                        <button
                                            onClick={() => {
                                                navigate('/qrcode');
                                                closeLightbox();
                                            }}
                                            className="btn btn-primary btn-hindu text-sm py-2"
                                        >
                                            Get QR Code
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GalleryView;