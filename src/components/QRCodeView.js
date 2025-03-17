// Fixed QRCodeView.js - simplified with no instructions, URL, or share buttons
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';
import { API_BASE_URL } from '../App';
import Icon from '@mdi/react';
import { mdiQrcode, mdiPrinter, mdiCamera, mdiHome } from '@mdi/js';

const QRCodeView = () => {
    const { currentPhoto, printPhoto } = useCamera();
    const navigate = useNavigate();
    const [isPrinting, setIsPrinting] = useState(false);
    const [printMessage, setPrintMessage] = useState('');
    const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

    // Monitor orientation changes
    useEffect(() => {
        const handleResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
                setPrintMessage('Printing is being prepared. Check back later!');
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
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
                transition={{duration: 0.5}}
                className={`w-full ${isLandscape ? 'max-w-6xl' : 'max-w-2xl'} bg-white rounded-xl shadow-elegant overflow-hidden`}
            >
                {/* Header with QR icon */}
                <div className="relative">
                    <div className="p-4 bg-gradient-to-r from-hindu-secondary to-hindu-accent text-white">
                        <div className="flex items-center justify-center">
                            <Icon path={mdiQrcode} size={1.2} className="mr-2"/>
                            <h2 className="text-xl font-bold">Scan to View Your Photo</h2>
                        </div>
                    </div>

                    {/* Decorative element */}
                    <div className="absolute -bottom-3 left-0 right-0 flex justify-center">
                        <div className="flex space-x-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="w-1.5 h-1.5 rounded-full bg-white"></div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <div
                        className={`flex ${isLandscape ? 'flex-row' : 'flex-col md:flex-row'} items-center justify-center gap-6`}>
                        {/* Photo preview */}
                        <div className={`${isLandscape ? 'w-1/2' : 'w-full md:w-1/2'}`}>
                            <img
                                src={imageUrl}
                                alt="Your photo"
                                className="w-full h-auto rounded-lg border-2 border-wedding-background shadow-card"
                            />
                        </div>

                        {/* QR code section - simplified */}
                        <div
                            className={`${isLandscape ? 'w-1/2' : 'w-full md:w-1/2'} flex flex-col items-center justify-center`}>
                            {/* QR Code - larger size now that we removed other elements */}
                            <div className="bg-white border-4 border-wedding-gold rounded-lg shadow-card mb-6 p-4">
                                <img
                                    src={qrCodeUrl}
                                    alt="QR Code"
                                    className="w-64 h-64 mx-auto"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Print message */}
                    <AnimatePresence>
                        {printMessage && (
                            <motion.div
                                initial={{opacity: 0, height: 0}}
                                animate={{opacity: 1, height: 'auto'}}
                                exit={{opacity: 0, height: 0}}
                                className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg text-center"
                            >
                                {printMessage}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Action buttons */}
                    <div
                        className={`mt-6 flex ${isLandscape ? 'flex-row justify-center' : 'flex-col md:flex-row justify-center'} gap-4`}>
                        <button
                            onClick={handlePrint}
                            disabled={isPrinting}
                            className={`btn btn-primary btn-christian ${isLandscape ? '' : 'w-full md:w-auto'} flex items-center justify-center`}
                        >
                            <Icon path={mdiPrinter} size={1} className="mr-2"/>
                            {isPrinting ? 'Printing...' : 'Print Photo'}
                        </button>

                        <button
                            onClick={handleAnotherPhoto}
                            className={`btn btn-outline btn-christian-outline ${isLandscape ? '' : 'w-full md:w-auto'} flex items-center justify-center`}
                        >
                            <Icon path={mdiCamera} size={1} className="mr-2"/>
                            Take Another Photo
                        </button>

                        <button
                            onClick={handleBackToHome}
                            className={`btn btn-outline btn-hindu-outline ${isLandscape ? '' : 'w-full md:w-auto'} flex items-center justify-center`}
                        >
                            <Icon path={mdiHome} size={1} className="mr-2"/>
                            Back to Home
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default QRCodeView;