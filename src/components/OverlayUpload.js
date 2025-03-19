import React, { useState, useEffect } from 'react';
import { API_ENDPOINT, API_BASE_URL } from '../App';
import Icon from '@mdi/react';
import { mdiDelete, mdiPencil, mdiImageOutline, mdiInstagram } from '@mdi/js';

const OverlayUpload = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [overlayName, setOverlayName] = useState('wedding-frame.png');
    const [overlayType, setOverlayType] = useState('standard'); // standard, instagram, special
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [availableOverlays, setAvailableOverlays] = useState([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editingOverlay, setEditingOverlay] = useState(null);

    // Fetch existing overlays when component mounts
    useEffect(() => {
        fetchOverlays();
    }, []);

    // Fetch all available overlays
    const fetchOverlays = async () => {
        try {
            setLoading(true);
            const response = await fetch(`${API_ENDPOINT}/admin/overlays`);

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();
            setAvailableOverlays(data);
        } catch (error) {
            console.error('Error fetching overlays:', error);
            setMessage({ text: 'Failed to load existing overlays', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

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

    // Generate a filename based on the selected type
    const generateFilename = () => {
        const timestamp = Date.now();
        const baseName = overlayName.split('.')[0].toLowerCase().replace(/\s+/g, '-');

        switch (overlayType) {
            case 'instagram':
                return `instagram-${baseName}-${timestamp}.png`;
            case 'special':
                return `${baseName}-${timestamp}.png`;
            case 'standard':
            default:
                return 'wedding-frame.png'; // Always replace the standard frame
        }
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

        const finalOverlayName = isEditing ? editingOverlay.name : generateFilename();

        const formData = new FormData();
        formData.append('overlay', selectedFile);
        formData.append('name', finalOverlayName);
        formData.append('type', overlayType);

        try {
            const response = await fetch(`${API_ENDPOINT}/admin/overlays`, {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setMessage({
                    text: isEditing
                        ? 'Overlay updated successfully!'
                        : 'New overlay uploaded successfully!',
                    type: 'success'
                });

                // Clear form and refresh overlays list
                setSelectedFile(null);
                setPreviewUrl('');
                setIsEditing(false);
                setEditingOverlay(null);
                fetchOverlays();
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

    // Start editing an existing overlay
    const handleEdit = (overlay) => {
        setIsEditing(true);
        setEditingOverlay(overlay);
        setOverlayName(overlay.name);

        // Determine overlay type based on name
        if (overlay.name.startsWith('instagram')) {
            setOverlayType('instagram');
        } else if (overlay.name === 'wedding-frame.png') {
            setOverlayType('standard');
        } else {
            setOverlayType('special');
        }

        // Clear any previous upload
        setSelectedFile(null);
        setPreviewUrl('');
    };

    // Delete an overlay
    const handleDelete = async (overlay) => {
        if (!window.confirm(`Are you sure you want to delete the "${overlay.name}" overlay?`)) {
            return;
        }

        try {
            setLoading(true);

            // Don't allow deleting the standard wedding frame
            if (overlay.name === 'wedding-frame.png') {
                setMessage({
                    text: 'Cannot delete the standard wedding frame. You can only replace it.',
                    type: 'error'
                });
                setLoading(false);
                return;
            }

            const response = await fetch(`${API_ENDPOINT}/admin/overlays/${overlay.name}`, {
                method: 'DELETE',
            });

            const result = await response.json();

            if (result.success) {
                setMessage({ text: 'Overlay deleted successfully!', type: 'success' });
                fetchOverlays();
            } else {
                setMessage({ text: result.error || 'Error deleting overlay', type: 'error' });
            }
        } catch (error) {
            console.error('Error deleting overlay:', error);
            setMessage({ text: 'Error deleting overlay: ' + error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    // Cancel editing mode
    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditingOverlay(null);
        setSelectedFile(null);
        setPreviewUrl('');
        setOverlayName('wedding-frame.png');
        setOverlayType('standard');
    };

    // Get icon for overlay type
    const getOverlayTypeIcon = (name) => {
        if (name === 'wedding-frame.png') {
            return <Icon path={mdiImageOutline} size={1} className="text-christian-accent" />;
        } else if (name.startsWith('instagram')) {
            return <Icon path={mdiInstagram} size={1} className="text-pink-600" />;
        } else {
            return <Icon path={mdiImageOutline} size={1} className="text-hindu-accent" />;
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Photo Frame Overlays</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Existing overlays list */}
                <div>
                    <h3 className="text-md font-medium mb-3">Available Frames</h3>

                    {loading && availableOverlays.length === 0 ? (
                        <div className="flex justify-center items-center h-40 bg-gray-50 rounded-lg">
                            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-christian-accent"></div>
                        </div>
                    ) : availableOverlays.length === 0 ? (
                        <div className="bg-gray-50 rounded-lg p-4 text-center text-gray-500">
                            <p>No custom frames available yet.</p>
                            <p className="text-sm mt-1">Upload your first frame!</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto pr-2">
                            {availableOverlays.map((overlay) => (
                                <div key={overlay.name} className="flex items-center bg-gray-50 rounded-lg p-3 border border-gray-100">
                                    <div className="flex-shrink-0 mr-3">
                                        {getOverlayTypeIcon(overlay.name)}
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <p className="font-medium text-gray-700 truncate" title={overlay.name}>
                                            {overlay.name === 'wedding-frame.png'
                                                ? 'Standard Wedding Frame'
                                                : overlay.name.split('.')[0].replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {new Date(overlay.timestamp).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex-shrink-0 ml-2">
                                        <button
                                            onClick={() => handleEdit(overlay)}
                                            className="p-1 text-gray-500 hover:text-christian-accent mr-1"
                                        >
                                            <Icon path={mdiPencil} size={0.8} />
                                        </button>
                                        {overlay.name !== 'wedding-frame.png' && (
                                            <button
                                                onClick={() => handleDelete(overlay)}
                                                className="p-1 text-gray-500 hover:text-red-500"
                                            >
                                                <Icon path={mdiDelete} size={0.8} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Upload form */}
                <div>
                    <h3 className="text-md font-medium mb-3">
                        {isEditing ? 'Update Frame' : 'Upload New Frame'}
                    </h3>
                    <form onSubmit={handleSubmit}>
                        {!isEditing && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Frame Type
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setOverlayType('standard')}
                                        className={`flex flex-col items-center justify-center p-3 rounded border ${
                                            overlayType === 'standard'
                                                ? 'bg-christian-accent/10 border-christian-accent'
                                                : 'border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon path={mdiImageOutline} size={1} className="mb-1 text-christian-accent" />
                                        <span className="text-xs font-medium">Standard</span>
                                        <span className="text-xs text-gray-500">Main wedding frame</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setOverlayType('instagram')}
                                        className={`flex flex-col items-center justify-center p-3 rounded border ${
                                            overlayType === 'instagram'
                                                ? 'bg-pink-100 border-pink-400'
                                                : 'border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon path={mdiInstagram} size={1} className="mb-1 text-pink-600" />
                                        <span className="text-xs font-medium">Instagram</span>
                                        <span className="text-xs text-gray-500">Square format</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setOverlayType('special')}
                                        className={`flex flex-col items-center justify-center p-3 rounded border ${
                                            overlayType === 'special'
                                                ? 'bg-hindu-accent/10 border-hindu-accent'
                                                : 'border-gray-200 hover:bg-gray-50'
                                        }`}
                                    >
                                        <Icon path={mdiImageOutline} size={1} className="mb-1 text-hindu-accent" />
                                        <span className="text-xs font-medium">Special</span>
                                        <span className="text-xs text-gray-500">Other styles</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {(!isEditing || (isEditing && overlayType !== 'standard')) && (
                            <div className="mb-4">
                                <label htmlFor="overlayName" className="block text-sm font-medium text-gray-700 mb-1">
                                    {overlayType === 'standard' ? 'Frame Name' : 'Custom Name'}
                                </label>
                                <input
                                    type="text"
                                    id="overlayName"
                                    value={isEditing ? overlayName : overlayName.split('.')[0]}
                                    onChange={(e) => {
                                        // Only update name if not editing the standard frame
                                        if (!(isEditing && editingOverlay?.name === 'wedding-frame.png')) {
                                            setOverlayName(e.target.value + (e.target.value.endsWith('.png') ? '' : '.png'));
                                        }
                                    }}
                                    placeholder={overlayType === 'instagram' ? 'instagram-frame' : 'special-frame'}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-christian-accent"
                                    required
                                    disabled={isEditing && editingOverlay?.name === 'wedding-frame.png'}
                                />
                                {isEditing && editingOverlay?.name === 'wedding-frame.png' && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        The standard frame name cannot be changed
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="mb-4">
                            <label htmlFor="overlayFile" className="block text-sm font-medium text-gray-700 mb-1">
                                {isEditing ? 'Replace with New Image' : 'Overlay Image (PNG recommended)'}
                            </label>
                            <input
                                type="file"
                                id="overlayFile"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-christian-accent"
                                required={!isEditing}
                            />
                            {isEditing && (
                                <p className="text-xs text-gray-500 mt-1">
                                    Leave empty to keep current image
                                </p>
                            )}
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

                        {isEditing && (
                            <div className="mb-4">
                                <p className="block text-sm font-medium text-gray-700 mb-1">Current Image</p>
                                <div className="border rounded-lg overflow-hidden bg-gray-50 p-2">
                                    <img
                                        src={`${API_BASE_URL}${editingOverlay?.url}?t=${Date.now()}`}
                                        alt="Current overlay"
                                        className="max-w-full h-auto max-h-40 mx-auto"
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = '/placeholder-image.jpg';
                                        }}
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

                        <div className="flex justify-between">
                            {isEditing && (
                                <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    className="btn btn-outline text-gray-500 border-gray-300 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className={`btn btn-primary btn-christian ${
                                    loading ? 'opacity-70 cursor-not-allowed' : ''
                                } ${isEditing ? '' : 'w-full'}`}
                            >
                                {loading ? (
                                    <span className="flex items-center justify-center">
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {isEditing ? 'Updating...' : 'Uploading...'}
                                    </span>
                                ) : isEditing ? 'Update Frame' : 'Upload Frame'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div className="mt-4">
                <p className="text-sm text-gray-500">
                    For best results, use a transparent PNG with a frame design. Each frame type serves a specific purpose:
                </p>
                <ul className="text-sm text-gray-500 mt-1 list-disc pl-5">
                    <li><span className="font-medium">Standard</span>: The main wedding frame used for all photos by default</li>
                    <li><span className="font-medium">Instagram</span>: Optimized for Instagram with square format</li>
                    <li><span className="font-medium">Special</span>: Alternative frames for guests to choose from</li>
                </ul>
            </div>
        </div>
    );
};

export default OverlayUpload;