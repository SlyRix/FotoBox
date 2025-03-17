// src/components/OverlayUpload.js
import React, { useState } from 'react';
import { API_ENDPOINT, API_BASE_URL } from '../App';

const OverlayUpload = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [overlayName, setOverlayName] = useState('wedding-frame.png');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [currentOverlay, setCurrentOverlay] = useState(`${API_BASE_URL}/overlays/wedding-frame.png`);

    // Handle file selection
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.match('image.*')) {
            setMessage({ text: 'Please select an image file (PNG, JPG)', type: 'error' });
            return;
        }

        setSelectedFile(file);
        setPreviewUrl(URL.createObjectURL(file));
    };

    // Handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!selectedFile) {
            setMessage({ text: 'Please select an image file', type: 'error' });
            return;
        }

        setLoading(true);
        setMessage({ text: '', type: '' });

        const formData = new FormData();
        formData.append('overlay', selectedFile);
        formData.append('name', overlayName);

        try {
            const response = await fetch(`${API_ENDPOINT}/admin/overlays`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setMessage({ text: 'Overlay uploaded successfully!', type: 'success' });
                setCurrentOverlay(`${API_BASE_URL}${result.url}?t=${Date.now()}`); // Add timestamp to bust cache
                // Reset form
                setSelectedFile(null);
                setPreviewUrl('');
            } else {
                setMessage({ text: result.error || 'Error uploading overlay', type: 'error' });
            }
        } catch (error) {
            console.error('Error uploading overlay:', error);
            setMessage({ text: 'Error uploading overlay: ' + error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Wedding Photo Frame Overlay</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Current overlay display */}
                <div>
                    <h3 className="text-md font-medium mb-2">Current Overlay</h3>
                    <div className="border rounded-lg overflow-hidden bg-gray-50 aspect-[4/3] flex items-center justify-center">
                        <img
                            src={currentOverlay}
                            alt="Current overlay"
                            className="max-w-full max-h-full object-contain"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/placeholder-image.jpg';
                            }}
                        />
                    </div>
                </div>

                {/* Upload form */}
                <div>
                    <h3 className="text-md font-medium mb-2">Upload New Overlay</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label htmlFor="overlayName" className="block text-sm font-medium text-gray-700 mb-1">
                                Overlay Name
                            </label>
                            <input
                                type="text"
                                id="overlayName"
                                value={overlayName}
                                onChange={(e) => setOverlayName(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-christian-accent"
                                required
                            />
                        </div>

                        <div className="mb-4">
                            <label htmlFor="overlayFile" className="block text-sm font-medium text-gray-700 mb-1">
                                Overlay Image (PNG recommended)
                            </label>
                            <input
                                type="file"
                                id="overlayFile"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-christian-accent"
                                required
                            />
                        </div>

                        {previewUrl && (
                            <div className="mb-4">
                                <p className="block text-sm font-medium text-gray-700 mb-1">Preview</p>
                                <div className="border rounded-lg overflow-hidden bg-gray-50 p-2">
                                    <img
                                        src={previewUrl}
                                        alt="Preview"
                                        className="max-w-full h-auto max-h-40 mx-auto"
                                    />
                                </div>
                            </div>
                        )}

                        {message.text && (
                            <div className={`mb-4 p-3 rounded-md ${
                                message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                                {message.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`btn btn-primary btn-christian w-full ${
                                loading ? 'opacity-70 cursor-not-allowed' : ''
                            }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Uploading...
                                </span>
                            ) : 'Upload Overlay'}
                        </button>
                    </form>
                </div>
            </div>

            <div className="mt-4">
                <p className="text-sm text-gray-500">
                    For best results, use a transparent PNG with a frame design. The overlay will be automatically resized to match each photo.
                </p>
            </div>
        </div>
    );
};

export default OverlayUpload;