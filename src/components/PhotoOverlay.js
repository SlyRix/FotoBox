// src/components/PhotoOverlay.js
import React, { useEffect, useState, useRef } from 'react';
import { useCamera } from '../contexts/CameraContext';
import { API_BASE_URL } from '../App';


const PhotoOverlay = ({ onComplete }) => {
    const { currentPhoto } = useCamera();
    const [processedImage, setProcessedImage] = useState(null);
    const [loading, setLoading] = useState(true);
    const canvasRef = useRef(null);
    useEffect(() => {
        if (!currentPhoto || !currentPhoto.fullUrl) {
            return;
        }

        const applyOverlay = async () => {
            setLoading(true);

            try {
                // Load the original photo
                const photo = new Image();
                photo.crossOrigin = "Anonymous";
                photo.src = currentPhoto.fullUrl;

                // Wait for the photo to load
                await new Promise((resolve, reject) => {
                    photo.onload = resolve;
                    photo.onerror = reject;
                });

                // Load the overlay image
                const overlay = new Image();
                overlay.crossOrigin = "Anonymous";
                overlay.src = `${API_BASE_URL}/overlay/wedding-frame.png`; // Path to your overlay image

                // Wait for the overlay to load
                await new Promise((resolve, reject) => {
                    overlay.onload = resolve;
                    overlay.onerror = reject;
                });

                // Set canvas dimensions to match the photo
                const canvas = canvasRef.current;
                canvas.width = photo.width;
                canvas.height = photo.height;

                // Draw the photo first
                const ctx = canvas.getContext('2d');
                ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

                // Then draw the overlay (scaled to fit the canvas)
                ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);

                // Convert canvas to data URL
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                setProcessedImage(dataUrl);

                // Call the callback with the processed image
                if (onComplete) {
                    onComplete({
                        ...currentPhoto,
                        processedImageData: dataUrl
                    });
                }
            } catch (error) {
                console.error('Error applying overlay:', error);
                // Fallback to original image if overlay fails
                if (onComplete) {
                    onComplete(currentPhoto);
                }
            } finally {
                setLoading(false);
            }
        };

        applyOverlay();
    }, [currentPhoto, onComplete]);

    // Hidden canvas for processing
    return (
        <>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {loading && (
                <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg p-6 shadow-xl text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-wedding-love mx-auto mb-4"></div>
                        <p className="text-xl font-medium">Adding wedding frame to your photo...</p>
                    </div>
                </div>
            )}
        </>
    );
};

export default PhotoOverlay;