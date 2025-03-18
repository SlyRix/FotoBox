import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL, API_ENDPOINT } from '../App';
import Icon from '@mdi/react';
import { mdiCamera, mdiHome, mdiShareVariant, mdiDownload, mdiImage, mdiInstagram, mdiDelete, mdiPencil, mdiLoading, mdiCheck, mdiUpload, mdiClose } from '@mdi/js';

const AdminDashboard = () => {
    const { photos, fetchPhotos, loading, error, deletePhoto } = useCamera();
    const [selectedPhoto, setSelectedPhoto] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [cameraStatus, setCameraStatus] = useState('Loading...');
    const navigate = useNavigate();

    // Frame management state
    const [frames, setFrames] = useState({
        standard: [],
        instagram: [],
        wedding: []
    });
    const [isLoadingFrames, setIsLoadingFrames] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);
    const [framePreviewUrl, setFramePreviewUrl] = useState('');
    const [frameName, setFrameName] = useState('');
    const [frameType, setFrameType] = useState('standard'); // 'standard', 'instagram', 'wedding'
    const [frameMessage, setFrameMessage] = useState({ text: '', type: '' });
    const [uploadingFrame, setUploadingFrame] = useState(false);

    // Confirmation dialog state
    const [confirmDialog, setConfirmDialog] = useState({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: null
    });

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

    // Fetch photos and camera status on mount
    useEffect(() => {
        fetchPhotos();

        // Check camera status
        fetch(`${API_ENDPOINT}/status`)
            .then(response => response.json())
            .then(data => {
                setCameraStatus(data.message);
            })
            .catch(error => {
                console.error('Error checking camera status:', error);
                setCameraStatus('Error checking camera status');
            });

        // Fetch available frames
        fetchFrames();
    }, [fetchPhotos]);

    // Fetch available frames
    const fetchFrames = async () => {
        try {
            setIsLoadingFrames(true);
            const response = await fetch(`${API_ENDPOINT}/frames`);

            if (!response.ok) {
                throw new Error('Failed to fetch frames');
            }

            const allFrames = await response.json();

            // Sort frames by type
            const sortedFrames = {
                standard: allFrames.filter(frame =>
                    frame.type === 'standard' || (!frame.name.startsWith('instagram-') && !frame.name.startsWith('wedding-'))),
                instagram: allFrames.filter(frame =>
                    frame.type === 'instagram' || frame.name.startsWith('instagram-')),
                wedding: allFrames.filter(frame =>
                    frame.type === 'wedding' || frame.name.startsWith('wedding-'))
            };

            setFrames(sortedFrames);
        } catch (error) {
            console.error('Error fetching frames:', error);
            setFrameMessage({
                text: 'Failed to load frames: ' + error.message,
                type: 'error'
            });
        } finally {
            setIsLoadingFrames(false);
        }
    };

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
        setConfirmDialog({
            isOpen: true,
            title: 'Regenerate Thumbnails',
            message: 'This will regenerate thumbnails for all photos and may take some time. Continue?',
            onConfirm: () => {
                fetch(`${API_ENDPOINT}/admin/generate-thumbnails`)
                    .then(response => response.json())
                    .then(data => {
                        alert(data.message || "Thumbnail generation started.");
                    })
                    .catch(error => {
                        console.error('Error starting thumbnail generation:', error);
                        alert("Error starting thumbnail generation.");
                    });
            }
        });
    };

    // Handle frame selection
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.match('image.*')) {
            setFrameMessage({ text: 'Please select an image file (PNG, JPG)', type: 'error' });
            return;
        }

        setSelectedFile(file);
        setFramePreviewUrl(URL.createObjectURL(file));

        // Auto-generate name based on type
        if (frameType === 'instagram') {
            setFrameName(`instagram-frame-${Date.now()}.png`);
        } else if (frameType === 'wedding') {
            setFrameName(`wedding-frame-${Date.now()}.png`);
        } else {
            setFrameName(`standard-frame-${Date.now()}.png`);
        }
    };

    // Handle frame upload
    const handleFrameUpload = async (e) => {
        e.preventDefault();

        if (!selectedFile) {
            setFrameMessage({ text: 'Please select an image file', type: 'error' });
            return;
        }

        // Ensure correct prefix based on type
        let finalFrameName = frameName;
        if (frameType === 'instagram' && !finalFrameName.startsWith('instagram-')) {
            finalFrameName = `instagram-${finalFrameName}`;
        } else if (frameType === 'wedding' && !finalFrameName.startsWith('wedding-')) {
            finalFrameName = `wedding-${finalFrameName}`;
        }

        setUploadingFrame(true);
        setFrameMessage({ text: '', type: '' });

        const formData = new FormData();
        formData.append('overlay', selectedFile);
        formData.append('name', finalFrameName);

        try {
            const response = await fetch(`${API_ENDPOINT}/admin/overlays`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setFrameMessage({
                    text: `${frameType.charAt(0).toUpperCase() + frameType.slice(1)} frame uploaded successfully!`,
                    type: 'success'
                });

                // Reset form
                setSelectedFile(null);
                setFramePreviewUrl('');
                setFrameName('');

                // Refresh frames list
                fetchFrames();
            } else {
                setFrameMessage({ text: result.error || 'Error uploading frame', type: 'error' });
            }
        } catch (error) {
            console.error('Error uploading frame:', error);
            setFrameMessage({ text: 'Error uploading frame: ' + error.message, type: 'error' });
        } finally {
            setUploadingFrame(false);
        }
    };

    // Handle frame deletion
    const handleDeleteFrame = async (frameName) => {
        setConfirmDialog({
            isOpen: true,
            title: 'Delete Frame',
            message: `Are you sure you want to delete the frame "${frameName}"?`,
            onConfirm: async () => {
                try {
                    setUploadingFrame(true);
                    const response = await fetch(`${API_ENDPOINT}/admin/overlays/${frameName}`, {
                        method: 'DELETE',
                    });

                    const result = await response.json();

                    if (result.success) {
                        setFrameMessage({ text: 'Frame deleted successfully!', type: 'success' });
                        fetchFrames();
                    } else {
                        setFrameMessage({ text: result.error || 'Error deleting frame', type: 'error' });
                    }
                } catch (error) {
                    console.error('Error deleting frame:', error);
                    setFrameMessage({ text: 'Error deleting frame: ' + error.message, type: 'error' });
                } finally {
                    setUploadingFrame(false);
                }
            }
        });
    };

    // Format date for display
    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    // Close confirmation dialog
    const handleCloseConfirmDialog = () => {
        setConfirmDialog({
            ...confirmDialog,
            isOpen: false
        });
    };

    // Handle confirmation
    const handleConfirm = () => {
        if (confirmDialog.onConfirm) {
            confirmDialog.onConfirm();
        }
        handleCloseConfirmDialog();
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

                {/* Frame Management Section */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                    <h2 className="text-lg font-semibold mb-4">Frame Management</h2>

                    {/* Tabs for frame types */}
                    <div className="border-b border-gray-200 mb-4">
                        <ul className="flex flex-wrap -mb-px">
                            <li className="mr-2">
                                <button
                                    onClick={() => setFrameType('standard')}
                                    className={`inline-block p-4 ${frameType === 'standard'
                                        ? 'text-christian-accent border-b-2 border-christian-accent'
                                        : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
                                    }`}
                                >
                                    Standard Frames
                                </button>
                            </li>
                            <li className="mr-2">
                                <button
                                    onClick={() => setFrameType('instagram')}
                                    className={`inline-block p-4 ${frameType === 'instagram'
                                        ? 'text-christian-accent border-b-2 border-christian-accent'
                                        : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
                                    }`}
                                >
                                    Instagram Frames
                                </button>
                            </li>
                            <li>
                                <button
                                    onClick={() => setFrameType('wedding')}
                                    className={`inline-block p-4 ${frameType === 'wedding'
                                        ? 'text-christian-accent border-b-2 border-christian-accent'
                                        : 'text-gray-500 hover:text-gray-700 border-b-2 border-transparent'
                                    }`}
                                >
                                    Wedding Frames
                                </button>
                            </li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                        {/* Current Frames */}
                        <div>
                            <h3 className="text-md font-medium mb-2">Available {frameType.charAt(0).toUpperCase() + frameType.slice(1)} Frames</h3>

                            {isLoadingFrames ? (
                                <div className="flex justify-center items-center h-40 bg-gray-50 rounded-lg">
                                    <Icon path={mdiLoading} size={2} className="animate-spin text-gray-400" />
                                </div>
                            ) : frames[frameType].length === 0 ? (
                                <div className="flex flex-col justify-center items-center h-40 bg-gray-50 rounded-lg text-gray-500">
                                    <p>No frames available</p>
                                    <p className="text-sm mt-2">Upload your first frame using the form</p>
                                </div>
                            ) : (
                                <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                                    {frames[frameType].map((frame) => (
                                        <div
                                            key={frame.name}
                                            className="border rounded-lg overflow-hidden bg-gray-50 flex"
                                        >
                                            <div className="w-24 h-24 p-2 flex-shrink-0">
                                                <img
                                                    src={`${API_BASE_URL}${frame.url}?t=${frame.timestamp}`}
                                                    alt={frame.name}
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <div className="flex-grow p-3 flex flex-col justify-between">
                                                <div>
                                                    <h4 className="font-medium text-sm truncate">
                                                        {frame.displayName}
                                                    </h4>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        {new Date(frame.timestamp).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <div className="flex space-x-2 mt-2">
                                                    <button
                                                        onClick={() => handleDeleteFrame(frame.name)}
                                                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                                        title="Delete this frame"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Upload Form */}
                        <div>
                            <h3 className="text-md font-medium mb-2">Upload New {frameType.charAt(0).toUpperCase() + frameType.slice(1)} Frame</h3>
                            <form onSubmit={handleFrameUpload}>
                                <div className="mb-4">
                                    <label htmlFor="frameName" className="block text-sm font-medium text-gray-700 mb-1">
                                        Frame Name
                                    </label>
                                    <input
                                        type="text"
                                        id="frameName"
                                        value={frameName}
                                        onChange={(e) => setFrameName(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-christian-accent"
                                        required
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Name will be prefixed with "{frameType}-" if not already
                                    </p>
                                </div>

                                <div className="mb-4">
                                    <label htmlFor="frameFile" className="block text-sm font-medium text-gray-700 mb-1">
                                        Frame Image (PNG with transparency recommended)
                                    </label>
                                    <input
                                        type="file"
                                        id="frameFile"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-christian-accent"
                                        required
                                    />
                                </div>

                                {framePreviewUrl && (
                                    <div className="mb-4">
                                        <p className="block text-sm font-medium text-gray-700 mb-1">Preview</p>
                                        <div className="border rounded-lg overflow-hidden bg-gray-50 p-2">
                                            <img
                                                src={framePreviewUrl}
                                                alt="Preview"
                                                className="max-w-full h-auto max-h-40 mx-auto"
                                            />
                                        </div>
                                    </div>
                                )}

                                {frameMessage.text && (
                                    <div className={`mb-4 p-3 rounded-md ${
                                        frameMessage.type === 'success' ? 'bg-green-100 text-green-700' :
                                            frameMessage.type === 'info' ? 'bg-blue-100 text-blue-700' :
                                                'bg-red-100 text-red-700'
                                    }`}>
                                        {frameMessage.text}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={uploadingFrame}
                                    className={`btn btn-primary flex items-center justify-center w-full ${
                                        frameType === 'instagram' ? 'btn-hindu' : 'btn-christian'
                                    } ${uploadingFrame ? 'opacity-70 cursor-not-allowed' : ''}`}
                                >
                                    {uploadingFrame ? (
                                        <>
                                            <Icon path={mdiLoading} size={1} className="animate-spin mr-2" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Icon path={mdiUpload} size={1} className="mr-2" />
                                            Upload Frame
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Format Guidelines */}
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-600">
                                {frameType === 'instagram' ? (
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>Instagram frames should be square (1:1 aspect ratio)</li>
                                        <li>Recommended resolution: 1080×1080 pixels</li>
                                        <li>Transparent PNG format works best</li>
                                    </ul>
                                ) : frameType === 'wedding' ? (
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>Wedding frames should be 16:9 aspect ratio</li>
                                        <li>Recommended resolution: 1920×1080 pixels</li>
                                        <li>Transparent PNG format works best</li>
                                    </ul>
                                ) : (
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>Standard frames should be 16:9 aspect ratio</li>
                                        <li>Recommended resolution: 1920×1080 pixels</li>
                                        <li>Transparent PNG format works best</li>
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
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

                                    {/* Available formats */}
                                    <div className="mt-2">
                                        <p className="font-medium">Available Formats:</p>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {selectedPhoto.standardUrl && (
                                                <span className="px-2 py-1 bg-gray-100 text-xs rounded">Standard</span>
                                            )}
                                            {selectedPhoto.instagramUrl && (
                                                <span className="px-2 py-1 bg-pink-100 text-xs rounded">Instagram</span>
                                            )}
                                            {selectedPhoto.weddingUrl && (
                                                <span className="px-2 py-1 bg-christian-accent/20 text-xs rounded">Wedding</span>
                                            )}
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

            {/* Confirmation Dialog */}
            {confirmDialog.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-lg max-w-md w-full overflow-hidden">
                        <div className="p-4 bg-gray-50 border-b border-gray-200">
                            <h3 className="text-lg font-medium">{confirmDialog.title}</h3>
                        </div>
                        <div className="p-6">
                            <p className="text-gray-700">{confirmDialog.message}</p>
                        </div>
                        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={handleCloseConfirmDialog}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-md text-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-md text-white"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;