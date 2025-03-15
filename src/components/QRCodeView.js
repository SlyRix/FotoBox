
// client/src/components/QRCodeView.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../App';

const QRCodeView = () => {
    const { currentPhoto, printPhoto } = useCamera();
    const navigate = useNavigate();
    const [isPrinting, setIsPrinting] = useState(false);
    const [printMessage, setPrintMessage] = useState('');
    //TODO: Add Global API URL for all files
    // If no photo is available, redirect to camera
    if (!currentPhoto) {
        navigate('/camera');
        return null;
    }

    // Construct the image and QR code URLs
    const imageUrl = `${API_BASE_URL}${currentPhoto.url}`;
    const qrCodeUrl = `${API_BASE_URL}${currentPhoto.qrUrl}`;

    // Handle the print request
    const handlePrint = async () => {
        setIsPrinting(true);
        setPrintMessage('');

        try {
            const result = await printPhoto(currentPhoto.filename);

            if (result.success) {
                setPrintMessage('Your photo will be printed shortly!');
            } else {
                setPrintMessage('Printing is not yet implemented. Check back later!');
            }
        } catch (error) {
            console.error('Error printing photo:', error);
            setPrintMessage('Error printing photo. Please try again later.');
        } finally {
            setIsPrinting(false);
        }
    };

    // Handle taking another photo
    const handleAnotherPhoto = () => {
        navigate('/camera');
    };

    // Handle going back to home
    const handleBackToHome = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-2xl bg-white rounded-lg shadow-lg overflow-hidden"
            >
                <div className="p-4 bg-hindu-secondary text-white">
                    <h2 className="text-xl font-bold text-center">Scan to View Your Photo</h2>
                </div>

                <div className="p-6">
                    <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                        <div className="w-full md:w-1/2">
                            <img
                                src={imageUrl}
                                alt="Your photo"
                                className="w-full h-auto rounded-lg border-2 border-wedding-background"
                            />
                        </div>

                        <div className="w-full md:w-1/2 flex flex-col items-center">
                            <p className="text-center mb-4 text-gray-700">
                                Use your phone to scan this QR code and view your photo:
                            </p>

                            <div className="p-4 bg-white border-4 border-wedding-gold rounded-lg shadow-md mb-4">
                                <img
                                    src={qrCodeUrl}
                                    alt="QR Code"
                                    className="w-48 h-48"
                                />
                            </div>
                        </div>
                    </div>

                    {printMessage && (
                        <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg text-center">
                            {printMessage}
                        </div>
                    )}

                    <div className="mt-6 flex flex-col md:flex-row justify-center gap-4">
                        <button
                            onClick={handlePrint}
                            disabled={isPrinting}
                            className="btn btn-primary btn-hindu w-full md:w-auto"
                        >
                            {isPrinting ? 'Printing...' : 'Print Photo'}
                        </button>

                        <button
                            onClick={handleAnotherPhoto}
                            className="btn btn-outline btn-christian-outline w-full md:w-auto"
                        >
                            Take Another Photo
                        </button>

                        <button
                            onClick={handleBackToHome}
                            className="btn btn-outline btn-hindu-outline w-full md:w-auto"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default QRCodeView;