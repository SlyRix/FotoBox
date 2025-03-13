// client/src/contexts/CameraContext.js
import React, { createContext, useState, useContext, useCallback } from 'react';
import { API_BASE_URL, API_ENDPOINT } from '../App';

const CameraContext = createContext();

export const useCamera = () => useContext(CameraContext);

export const CameraProvider = ({ children }) => {
    const [currentPhoto, setCurrentPhoto] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch all photos
    const fetchPhotos = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_ENDPOINT}/photos`);

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();

            // Make sure the full URL is set for each photo
            const photosWithFullUrls = data.map(photo => ({
                ...photo,
                fullUrl: `${API_BASE_URL}${photo.url}`
            }));

            setPhotos(photosWithFullUrls);
            setLoading(false);
            return photosWithFullUrls;
        } catch (error) {
            console.error('Error fetching photos:', error);
            setError('Failed to load photos: ' + error.message);
            setLoading(false);
            return [];
        }
    }, []);

    // Take a new photo
    const takePhoto = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${API_ENDPOINT}/photos/capture`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success && result.photo) {
                // Add the full URL to the photo object
                const photoWithFullUrl = {
                    ...result.photo,
                    fullUrl: `${API_BASE_URL}${result.photo.url}`
                };

                setCurrentPhoto(photoWithFullUrl);
                setLoading(false);
                return photoWithFullUrl;
            } else {
                throw new Error(result.error || 'Failed to capture photo');
            }
        } catch (error) {
            console.error('Error taking photo:', error);
            setError(error.message || 'An error occurred while taking the photo');
            setLoading(false);
            return null;
        }
    }, []);

    // Delete a photo
    const deletePhoto = useCallback(async (filename) => {
        setLoading(true);

        try {
            const response = await fetch(`${API_ENDPOINT}/photos/${filename}`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                setPhotos(prevPhotos => prevPhotos.filter(photo => photo.filename !== filename));
                setLoading(false);
                return true;
            } else {
                throw new Error(result.error || 'Failed to delete photo');
            }
        } catch (error) {
            console.error('Error deleting photo:', error);
            setError(error.message);
            setLoading(false);
            return false;
        }
    }, []);

    // Send print request
    const printPhoto = useCallback(async (filename) => {
        try {
            const response = await fetch(`${API_ENDPOINT}/photos/print`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename }),
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error printing photo:', error);
            return { success: false, error: error.message };
        }
    }, []);

    const value = {
        currentPhoto,
        setCurrentPhoto,
        photos,
        loading,
        error,
        fetchPhotos,
        takePhoto,
        deletePhoto,
        printPhoto,
        apiBaseUrl: API_BASE_URL,
    };

    return (
        <CameraContext.Provider value={value}>
            {children}
        </CameraContext.Provider>
    );
};