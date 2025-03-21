// FrameTemplateEditor.js - Component for setting default photo positions within frames
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiMagnifyPlus, mdiMagnifyMinus, mdiRotateRight, mdiRotateLeft, mdiArrowUp,
    mdiArrowDown, mdiArrowLeft, mdiArrowRight, mdiContentSave, mdiClose,
    mdiImageOutline, mdiRefresh, mdiLoading, mdiChevronLeft, mdiChevronRight } from '@mdi/js';
import { API_BASE_URL, API_ENDPOINT } from '../App';

const FrameTemplateEditor = ({ onClose }) => {
    // State for overlays and preview photos
    const [overlays, setOverlays] = useState([]);
    const [selectedOverlay, setSelectedOverlay] = useState(null);
    const [previewPhotos, setPreviewPhotos] = useState([]); // List of sample photos
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // State for template adjustments
    const [scale, setScale] = useState(0.01);
    const [rotation, setRotation] = useState(0);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [initialTransform, setInitialTransform] = useState({
        scale: 0.01,
        rotation: 0,
        position: { x: 0, y: 0 }
    });

    // Reference to the editor container for positioning calculations
    const editorRef = useRef(null);

    // Fetch overlays and sample photos when component mounts
    useEffect(() => {
        fetchOverlays();
        fetchSamplePhotos();
    }, []);

    // Fetch all frame overlays
    const fetchOverlays = async () => {
        try {
            setLoading(true);

            const response = await fetch(`${API_ENDPOINT}/admin/overlays`);
            if (!response.ok) {
                throw new Error(`Failed to fetch overlays (${response.status})`);
            }

            const data = await response.json();
            setOverlays(data);

            // Default to wedding frame if available
            const weddingFrame = data.find(overlay => overlay.name === 'wedding-frame.png');
            if (weddingFrame) {
                setSelectedOverlay(weddingFrame);
                // Fetch template settings for this overlay
                fetchTemplateSettings(weddingFrame.name);
            } else if (data.length > 0) {
                setSelectedOverlay(data[0]);
                // Fetch template settings for this overlay
                fetchTemplateSettings(data[0].name);
            }
        } catch (error) {
            console.error('Error fetching overlays:', error);
            setError('Failed to load frame overlays. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch sample photos for template testing - specifically get original photos without frames
    const fetchSamplePhotos = async () => {
        try {
            // Specifically request original photos
            const response = await fetch(`${API_ENDPOINT}/photos?type=original&limit=5`);
            if (!response.ok) {
                throw new Error(`Failed to fetch sample photos (${response.status})`);
            }

            const data = await response.json();
            if (data.length > 0) {
                // Make sure we use the originalUrl if available
                const processedData = data.map(photo => ({
                    ...photo,
                    // Prefer the original photo URL if available
                    url: photo.originalUrl || photo.url,
                    filename: photo.filename
                }));

                setPreviewPhotos(processedData);
                setCurrentPhotoIndex(0); // Start with the most recent photo
            } else {
                // If no photos available, create a placeholder
                setPreviewPhotos([{
                    url: '/placeholder-image.jpg',
                    filename: 'placeholder.jpg'
                }]);
            }
        } catch (error) {
            console.error('Error fetching sample photos:', error);
            // Set a placeholder on error
            setPreviewPhotos([{
                url: '/placeholder-image.jpg',
                filename: 'placeholder.jpg'
            }]);
        }
    };

    // Navigate between preview photos
    const goToNextPhoto = () => {
        if (previewPhotos.length > 1) {
            setCurrentPhotoIndex((prevIndex) =>
                prevIndex === previewPhotos.length - 1 ? 0 : prevIndex + 1
            );
        }
    };

    const goToPrevPhoto = () => {
        if (previewPhotos.length > 1) {
            setCurrentPhotoIndex((prevIndex) =>
                prevIndex === 0 ? previewPhotos.length - 1 : prevIndex - 1
            );
        }
    };

    // Get current preview photo
    const currentPreviewPhoto = previewPhotos[currentPhotoIndex] || null;

    // Custom CSS for the range slider
    const rangeSliderStyles = `
        /* Style for the slider track */
        input[type=range] {
          -webkit-appearance: none;
          width: 100%;
          height: 8px;
          border-radius: 4px;
          background: #e5e7eb; /* gray-200 */
          outline: none;
        }

        /* Style for the slider thumb */
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #b08968; /* christian-accent */
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        input[type=range]::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #b08968; /* christian-accent */
          cursor: pointer;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        /* Focus styles */
        input[type=range]:focus {
          outline: none;
        }

        input[type=range]:focus::-webkit-slider-thumb {
          box-shadow: 0 0 0 3px rgba(176,137,104,0.3); /* christian-accent with opacity */
        }

        input[type=range]:focus::-moz-range-thumb {
          box-shadow: 0 0 0 3px rgba(176,137,104,0.3); /* christian-accent with opacity */
        }

        /* Hover effect */
        input[type=range]:hover::-webkit-slider-thumb {
          background: #9a775a; /* darker christian-accent */
        }

        input[type=range]:hover::-moz-range-thumb {
          background: #9a775a; /* darker christian-accent */
        }
    `;

    // Fetch template settings for a specific overlay
    const fetchTemplateSettings = async (overlayName) => {
        try {
            setLoading(true);

            const response = await fetch(`${API_ENDPOINT}/admin/frame-templates/${overlayName}`);
            if (!response.ok) {
                if (response.status === 404) {
                    // Template doesn't exist yet, use defaults
                    resetAdjustments();
                    return;
                }
                throw new Error(`Failed to fetch template settings (${response.status})`);
            }

            const data = await response.json();

            if (data.success && data.template) {
                // Apply the saved template settings
                setScale(data.template.scale || 1);
                setRotation(data.template.rotation || 0);
                setPosition({
                    x: data.template.positionX || 0,
                    y: data.template.positionY || 0
                });
                setInitialTransform({
                    scale: data.template.scale || 1,
                    rotation: data.template.rotation || 0,
                    position: {
                        x: data.template.positionX || 0,
                        y: data.template.positionY || 0
                    }
                });
            } else {
                // No template found, use defaults
                resetAdjustments();
            }
        } catch (error) {
            console.error('Error fetching template settings:', error);
            // Use default settings on error
            resetAdjustments();
        } finally {
            setLoading(false);
        }
    };

    // Handle overlay selection
    const handleSelectOverlay = (overlay) => {
        setSelectedOverlay(overlay);
        // Fetch template settings for this overlay
        fetchTemplateSettings(overlay.name);
    };

    // Reset all adjustments to default
    const resetAdjustments = () => {
        setScale(0.01);
        setRotation(0);
        setPosition({ x: 0, y: 0 });
        setInitialTransform({
            scale: 0.01,
            rotation: 0,
            position: { x: 0, y: 0 }
        });
    };

    // Format scale for display
    const formatScalePercent = (scale) => {
        return `${Math.round(scale * 100)}%`;
    };

    // Adjustment handlers
    const handleZoomChange = (e) => {
        const value = parseFloat(e.target.value);
        setScale(value);
    };

    const handleRotateLeft = () => setRotation(prev => prev - 5);
    const handleRotateRight = () => setRotation(prev => prev + 5);

    const handleMove = (direction) => {
        const step = 10; // pixels to move
        switch(direction) {
            case 'up':
                setPosition(prev => ({ ...prev, y: prev.y - step }));
                break;
            case 'down':
                setPosition(prev => ({ ...prev, y: prev.y + step }));
                break;
            case 'left':
                setPosition(prev => ({ ...prev, x: prev.x - step }));
                break;
            case 'right':
                setPosition(prev => ({ ...prev, x: prev.x + step }));
                break;
            default:
                break;
        }
    };

    // Save the template settings
    const handleSaveTemplate = async () => {
        if (!selectedOverlay) {
            setError('Please select a frame overlay.');
            return;
        }

        try {
            setSaving(true);
            setError(null);
            setSuccess(null);

            // Prepare template data
            const templateData = {
                overlayName: selectedOverlay.name,
                template: {
                    scale,
                    rotation,
                    positionX: position.x,
                    positionY: position.y
                }
            };

            // Send to API endpoint
            const response = await fetch(`${API_ENDPOINT}/admin/frame-templates`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(templateData),
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                setSuccess('Frame template saved successfully! This template will be applied to all photos using this frame.');
            } else {
                throw new Error(result.error || 'Failed to save template');
            }
        } catch (error) {
            console.error('Error saving template:', error);
            setError(error.message || 'Failed to save template. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    // Calculate CSS transform string from current adjustments
    const getTransformStyle = () => {
        return `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`;
    };

    // Get overlay type info for display
    const getOverlayTypeInfo = (name) => {
        if (name === 'wedding-frame.png') {
            return {
                label: 'Standard Wedding Frame',
                type: 'standard'
            };
        } else if (name === 'instagram-frame.png') {
            return {
                label: 'Instagram Format Frame',
                type: 'instagram'
            };
        } else {
            return {
                label: name.split('.')[0].replace(/-/g, ' ').replace(/^\w/, c => c.toUpperCase()),
                type: 'custom'
            };
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 bg-gradient-to-r from-christian-accent to-christian-accent/90 text-white flex justify-between items-center">
                    <h2 className="text-xl font-bold">Frame Template Editor</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-white/20 rounded-full"
                    >
                        <Icon path={mdiClose} size={1.2} />
                    </button>
                </div>

                {/* Main content */}
                <div className="flex flex-col lg:flex-row h-full overflow-hidden">
                    {/* Left sidebar - Frame selection */}
                    <div className="w-full lg:w-1/4 border-r border-gray-200 overflow-y-auto p-4">
                        <h3 className="font-medium mb-2">Select Frame</h3>

                        {loading && overlays.length === 0 ? (
                            <div className="flex justify-center py-8">
                                <Icon path={mdiLoading} size={2} className="animate-spin text-gray-400" />
                            </div>
                        ) : overlays.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                No frame overlays available. Please upload frames first.
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                                {overlays.map((overlay) => {
                                    const typeInfo = getOverlayTypeInfo(overlay.name);
                                    return (
                                        <div
                                            key={overlay.name}
                                            className={`p-2 rounded-lg cursor-pointer transition-all flex flex-col ${
                                                selectedOverlay?.name === overlay.name
                                                    ? 'bg-christian-accent/10 border border-christian-accent'
                                                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-100'
                                            }`}
                                            onClick={() => handleSelectOverlay(overlay)}
                                        >
                                            <div className="flex items-center">
                                                <div className={`${
                                                    overlay.name === 'instagram-frame.png'
                                                        ? 'aspect-[9/16]'
                                                        : 'aspect-[1.414/1]'
                                                } w-12 h-12 mr-3 flex items-center justify-center bg-white rounded overflow-hidden`}
                                                >
                                                    <img
                                                        src={`${API_BASE_URL}${overlay.url}`}
                                                        alt={overlay.name}
                                                        className="max-w-full max-h-full"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium truncate">
                                                        {typeInfo.label}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {typeInfo.type === 'instagram' ? '9:16 Portrait' :
                                                            typeInfo.type === 'standard' ? 'A5 Landscape' : 'Custom'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Center - Editor */}
                    <div className="w-full lg:w-2/4 flex flex-col p-4 overflow-hidden">
                        <div className="mb-4 flex justify-between items-center">
                            <h3 className="font-medium">Template Position Settings</h3>
                            <button
                                onClick={resetAdjustments}
                                className="text-sm flex items-center text-gray-600 hover:text-christian-accent px-2 py-1"
                            >
                                <Icon path={mdiRefresh} size={0.8} className="mr-1" />
                                Reset
                            </button>
                        </div>

                        {/* Editor canvas */}
                        {/* Custom styles for range slider */}
                        <style>{rangeSliderStyles}</style>

                        <div className="flex-grow flex items-center justify-center overflow-hidden bg-gray-100 rounded-lg relative" ref={editorRef}>
                            {currentPreviewPhoto && selectedOverlay ? (
                                <>
                                    {/* Frame container with correct aspect ratio based on overlay type */}
                                    <div className={`relative ${
                                        selectedOverlay.name === 'instagram-frame.png'
                                            ? 'w-auto h-5/6 aspect-[9/16]' // Fixed 9:16 ratio for Instagram
                                            : 'w-5/6 aspect-[1.414/1]'     // A5 landscape ratio for others
                                    }`}>
                                        {/* Photo layer - this is what will change based on template settings */}
                                        <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                                            <motion.img
                                                src={`${API_BASE_URL}${currentPreviewPhoto.url}`}
                                                alt="Preview photo"
                                                className="max-w-none object-cover"
                                                style={{
                                                    transform: getTransformStyle()
                                                }}
                                                initial={initialTransform}
                                                animate={{
                                                    scale,
                                                    rotate: rotation,
                                                    x: position.x,
                                                    y: position.y
                                                }}
                                                transition={{ type: 'spring', damping: 15 }}
                                            />
                                        </div>

                                        {/* Overlay frame layer - this stays fixed */}
                                        <div className="absolute inset-0 pointer-events-none z-10">
                                            <img
                                                src={`${API_BASE_URL}${selectedOverlay.url}`}
                                                alt={selectedOverlay.name}
                                                className="w-full h-full object-contain"
                                            />
                                        </div>
                                    </div>

                                    {/* Preview photo navigation controls */}
                                    {previewPhotos.length > 1 && (
                                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center space-x-4 bg-black/40 backdrop-blur-sm rounded-full px-4 py-2 text-white">
                                            <button
                                                onClick={goToPrevPhoto}
                                                className="p-1 hover:bg-white/20 rounded-full"
                                                title="Previous Photo"
                                            >
                                                <Icon path={mdiChevronLeft} size={1} />
                                            </button>

                                            <span className="text-sm">
                                                Photo {currentPhotoIndex + 1} of {previewPhotos.length}
                                            </span>

                                            <button
                                                onClick={goToNextPhoto}
                                                className="p-1 hover:bg-white/20 rounded-full"
                                                title="Next Photo"
                                            >
                                                <Icon path={mdiChevronRight} size={1} />
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center text-gray-400 flex flex-col items-center">
                                    <Icon path={mdiImageOutline} size={4} className="mb-2" />
                                    <p>
                                        {!selectedOverlay ? "Select a frame" : "Loading preview photo..."}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Guide text */}
                        <div className="mt-2 bg-blue-50 p-2 rounded text-sm text-blue-700">
                            <p>Position the <strong>sample photo</strong> to create a template for this frame. These settings will apply to <strong>all photos</strong> using this frame.</p>
                        </div>

                        {/* Adjustment controls */}
                        {currentPreviewPhoto && selectedOverlay && (
                            <div className="mt-4 grid grid-cols-2 gap-4">
                                {/* Scale controls - with slider */}
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-gray-600">Zoom:</span>
                                        <span className="text-sm font-medium">
                                            {formatScalePercent(scale)}
                                        </span>
                                    </div>
                                    <div className="flex items-center">
                                        <span className="text-xs text-gray-500 mr-2">0%</span>
                                        <input
                                            type="range"
                                            min="0.01"
                                            max="0.2"
                                            step="0.01"
                                            value={scale}
                                            onChange={handleZoomChange}
                                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                        />
                                        <span className="text-xs text-gray-500 ml-2">20%</span>
                                    </div>
                                </div>

                                {/* Rotation controls */}
                                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                                    <span className="text-sm text-gray-600">Rotate:</span>
                                    <div className="flex items-center">
                                        <button
                                            onClick={handleRotateLeft}
                                            className="p-2 rounded hover:bg-gray-200 mr-1"
                                            title="Rotate Left"
                                        >
                                            <Icon path={mdiRotateLeft} size={1} />
                                        </button>
                                        <span className="px-3 min-w-16 text-center text-sm font-medium">
                                            {rotation}°
                                        </span>
                                        <button
                                            onClick={handleRotateRight}
                                            className="p-2 rounded hover:bg-gray-200 ml-1"
                                            title="Rotate Right"
                                        >
                                            <Icon path={mdiRotateRight} size={1} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Position controls */}
                        {currentPreviewPhoto && selectedOverlay && (
                            <div className="mt-4 bg-gray-50 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-gray-600">Position:</span>
                                    <span className="text-xs text-gray-500">
                                        X: {position.x.toFixed(0)}px, Y: {position.y.toFixed(0)}px
                                    </span>
                                </div>
                                <div className="flex justify-center">
                                    <div className="grid grid-cols-3 gap-1 w-36 h-36">
                                        <div></div>
                                        <button
                                            onClick={() => handleMove('up')}
                                            className="flex items-center justify-center p-2 rounded-lg hover:bg-gray-200"
                                            title="Move Up"
                                        >
                                            <Icon path={mdiArrowUp} size={1.2} />
                                        </button>
                                        <div></div>

                                        <button
                                            onClick={() => handleMove('left')}
                                            className="flex items-center justify-center p-2 rounded-lg hover:bg-gray-200"
                                            title="Move Left"
                                        >
                                            <Icon path={mdiArrowLeft} size={1.2} />
                                        </button>

                                        <div className="flex items-center justify-center text-2xl text-gray-300">⊕</div>

                                        <button
                                            onClick={() => handleMove('right')}
                                            className="flex items-center justify-center p-2 rounded-lg hover:bg-gray-200"
                                            title="Move Right"
                                        >
                                            <Icon path={mdiArrowRight} size={1.2} />
                                        </button>

                                        <div></div>
                                        <button
                                            onClick={() => handleMove('down')}
                                            className="flex items-center justify-center p-2 rounded-lg hover:bg-gray-200"
                                            title="Move Down"
                                        >
                                            <Icon path={mdiArrowDown} size={1.2} />
                                        </button>
                                        <div></div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right sidebar - Template info and actions */}
                    <div className="w-full lg:w-1/4 border-l border-gray-200 overflow-y-auto p-4">
                        <h3 className="font-medium mb-4">Template Information</h3>

                        {selectedOverlay ? (
                            <div className="bg-gray-50 p-4 rounded-lg mb-6">
                                <h4 className="font-medium">{getOverlayTypeInfo(selectedOverlay.name).label}</h4>

                                <div className="mt-2 text-sm text-gray-600">
                                    <p><strong>Type:</strong> {getOverlayTypeInfo(selectedOverlay.name).type}</p>
                                    <p><strong>Format:</strong> {selectedOverlay.name === 'instagram-frame.png' ? '9:16 portrait' :
                                        selectedOverlay.name === 'wedding-frame.png' ? 'A5 landscape (1.414:1)' :
                                            'Custom'}</p>
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    <h5 className="font-medium text-sm mb-2">Current Template Settings:</h5>
                                    <ul className="text-sm text-gray-600">
                                        <li><strong>Scale:</strong> {formatScalePercent(scale)}</li>
                                        <li><strong>Rotation:</strong> {rotation}°</li>
                                        <li><strong>Position X:</strong> {position.x.toFixed(0)}px</li>
                                        <li><strong>Position Y:</strong> {position.y.toFixed(0)}px</li>
                                    </ul>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-gray-50 p-4 rounded-lg mb-6 text-gray-500 text-center">
                                No frame selected
                            </div>
                        )}

                        <div className="mb-6">
                            <h4 className="font-medium mb-2">How Templates Work</h4>
                            <div className="text-sm text-gray-600 space-y-2">
                                <p>Templates define how photos will be positioned within each frame. The settings you create here will be applied to <strong>all photos</strong> that use this frame.</p>
                                <p>Guests will see their photos automatically positioned according to these template settings when they select this frame.</p>
                            </div>
                        </div>

                        {/* Action buttons */}
                        <div className="mt-8">
                            {error && (
                                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {success && (
                                <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-lg text-sm">
                                    {success}
                                </div>
                            )}

                            <button
                                onClick={handleSaveTemplate}
                                disabled={!selectedOverlay || saving}
                                className={`w-full btn btn-primary btn-christian flex items-center justify-center mt-2 ${
                                    (!selectedOverlay || saving)
                                        ? 'opacity-50 cursor-not-allowed'
                                        : ''
                                }`}
                            >
                                {saving ? (
                                    <>
                                        <Icon path={mdiLoading} size={1} className="mr-2 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Icon path={mdiContentSave} size={1} className="mr-2" />
                                        Save Template
                                    </>
                                )}
                            </button>

                            <button
                                onClick={onClose}
                                className="w-full btn btn-outline btn-christian-outline flex items-center justify-center mt-2"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FrameTemplateEditor;