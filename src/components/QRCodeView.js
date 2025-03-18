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
    const [isTablet, setIsTablet] = useState(window.innerWidth >= 768 && window.innerWidth <= 1024);

    // Monitor orientation changes
    useEffect(() => {
        const handleResize = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
            setIsTablet(window.innerWidth >= 768 && window.innerWidth <= 1024);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleResize);

        // Initial check
        handleResize();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('orientationchange', handleResize);
        };
    }, []);

    // If no photo is available, redirect to camera
    if (!currentPhoto) {
        navigate('/camera');
        return null;
    }

    // Construct the image URLs - use print version for the display (A5 ratio)
    // but set the QR code to link to the original high-resolution version
    const imageUrl = currentPhoto.url
        ? `${API_BASE_URL}${currentPhoto.url}`
        : (currentPhoto.fullUrl || '');

    const qrCodeUrl = `${API_BASE_URL}${currentPhoto.qrUrl}`;

    // Handle the print request - should use the print version
    const handlePrint = async () => {
        setIsPrinting(true);
        setPrintMessage('');

        try {
            // Use printUrl if available, otherwise fall back to regular filename
            const printFilename = currentPhoto.printUrl
                ? currentPhoto.printUrl.split('/').pop()
                : currentPhoto.filename;

            const result = await printPhoto(printFilename);

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
                className={`w-full ${isTablet
                    ? (isLandscape ? 'max-w-4xl px-8' : 'max-w-2xl px-4')
                    : (isLandscape ? 'max-w-6xl px-6' : 'max-w-xl px-4')
                } bg-white rounded-xl shadow-elegant overflow-hidden`}
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
                        {/* Photo preview - using the enhanced frame from PhotoPreview */}
                        <div className={`${isLandscape ? 'w-1/2' : 'w-full md:w-1/2'}`}>
                            <div className="relative">
                                {/* A5 Photo Frame with decorative border */}
                                <div className="aspect-[1.414/1] w-full overflow-hidden rounded-lg shadow-lg relative mb-2">
                                    {/* Double border effect */}
                                    <div className="absolute inset-0 border-8 border-white z-10 rounded-md pointer-events-none"></div>
                                    <div className="absolute inset-2 border border-gray-200 z-10 rounded-sm pointer-events-none"></div>

                                    {/* Inner mat/background with gradient */}
                                    <div className="absolute inset-0 bg-white"></div>


                                    {/* Photo itself - positioned to fill available space */}
                                    <div className="absolute inset-[16px] flex items-center justify-center overflow-hidden">
                                        <img
                                            src={imageUrl}
                                            alt="Your photo"
                                            className="max-w-full max-h-full object-contain"
                                            onError={(e) => {
                                                console.error("Image failed to load:", imageUrl);
                                                e.target.src = '/placeholder-image.jpg';
                                            }}
                                        />
                                    </div>

                                    {/* Subtle "corners" overlay to indicate frame */}
                                    <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/60 rounded-tl-sm pointer-events-none"></div>
                                    <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/60 rounded-tr-sm pointer-events-none"></div>
                                    <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/60 rounded-bl-sm pointer-events-none"></div>
                                    <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/60 rounded-br-sm pointer-events-none"></div>
                                </div>
                            </div>
                        </div>

                        {/* QR code section - simplified */}
                        <div
                            className={`${isLandscape ? 'w-1/2' : 'w-full md:w-1/2'} flex flex-col items-center justify-center`}
                        >
                            {/* QR Code with note about high resolution */}
                            <div className="bg-white border-4 border-wedding-gold rounded-lg shadow-card mb-4 p-4">
                                <img
                                    src={qrCodeUrl}
                                    alt="QR Code"
                                    className={`${isTablet
                                        ? (isLandscape ? 'w-48 h-48' : 'w-56 h-56')
                                        : 'w-64 h-64'
                                    } mx-auto`}
                                />
                                <p className="text-center text-sm mt-2 text-gray-600">
                                    Scan for high-resolution photo
                                </p>
                            </div>

                            {/* Note about QR code */}
                            <p className="text-center text-sm text-gray-500 mb-4">
                                Share this QR code with guests to let them download your photo
                            </p>
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