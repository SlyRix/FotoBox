// client/src/contexts/CameraContext.js
import React, { createContext, useState, useContext } from 'react';

const CameraContext = createContext();

export const useCamera = () => useContext(CameraContext);

export const CameraProvider = ({ children }) => {
    const [currentPhoto, setCurrentPhoto] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const apiUrl = 'http://192.168.1.70:5000/api';

    // Fetch all photos
    const fetchPhotos = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${apiUrl}/photos`);
            const data = await response.json();

            setPhotos(data);
            setLoading(false);
            return data;
        } catch (error) {
            console.error('Error fetching photos:', error);
            setError('Failed to load photos');
            setLoading(false);
            return [];
        }
    };

    // Take a new photo
    const takePhoto = async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${apiUrl}/photos/capture`, {
                method: 'POST',
            });

            const result = await response.json();

            if (result.success) {
                setCurrentPhoto(result.photo);
                setLoading(false);
                return result.photo;
            } else {
                throw new Error(result.error || 'Failed to capture photo');
            }
        } catch (error) {
            console.error('Error taking photo:', error);
            setError(error.message || 'An error occurred while taking the photo');
            setLoading(false);
            return null;
        }
    };

    // Delete a photo
    const deletePhoto = async (filename) => {
        setLoading(true);

        try {
            const response = await fetch(`${apiUrl}/photos/${filename}`, {
                method: 'DELETE',
            });

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
    };

    // Send print request
    const printPhoto = async (filename) => {
        try {
            const response = await fetch(`${apiUrl}/photos/print`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ filename }),
            });

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error printing photo:', error);
            return { success: false, error: error.message };
        }
    };

    const value = {
        currentPhoto,
        setCurrentPhoto,
        photos,
        loading,
        error,
        fetchPhotos,
        takePhoto,
        deletePhoto,
        printPhoto
    };

    return (
        <CameraContext.Provider value={value}>
            {children}
        </CameraContext.Provider>
    );
};