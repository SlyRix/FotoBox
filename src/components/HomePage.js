// Updated HomePage.js with cleaner card background and styling improvements
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiCamera, mdiHeart, mdiImage } from '@mdi/js';
import { API_ENDPOINT, API_BASE_URL } from '../App';

const HomePage = () => {
    // State for mosaic background
    const [mosaicStatus, setMosaicStatus] = useState({
        available: false,
        loading: true,
        url: null,
        photoCount: 0,
        requiredCount: 10
    });

    // Check if there are enough photos for a mosaic when component mounts
    useEffect(() => {
        const checkMosaicStatus = async () => {
            try {
                const response = await fetch(`${API_ENDPOINT}/mosaic/info`);
                if (!response.ok) throw new Error('Failed to fetch mosaic info');

                const data = await response.json();

                setMosaicStatus({
                    available: data.photoCount >= data.requiredCount,
                    loading: false,
                    url: data.hasMosaic ? `${API_BASE_URL}${data.mosaic.url}?t=${Date.now()}` : null,
                    photoCount: data.photoCount,
                    requiredCount: data.requiredCount
                });

                // If mosaic doesn't exist but we have enough photos, trigger mosaic generation
                if (!data.hasMosaic && data.photoCount >= data.requiredCount) {
                    generateMosaic();
                }
            } catch (error) {
                console.error("Error checking mosaic status:", error);
                setMosaicStatus(prev => ({
                    ...prev,
                    loading: false
                }));
            }
        };

        checkMosaicStatus();
    }, []);

    // Function to trigger mosaic generation
    const generateMosaic = async () => {
        try {
            // Set loading state
            setMosaicStatus(prev => ({
                ...prev,
                loading: true
            }));

            // Request mosaic generation
            const response = await fetch(`${API_ENDPOINT}/mosaic?t=${Date.now()}`);

            if (response.ok) {
                // If successful, update the mosaic URL
                setMosaicStatus(prev => ({
                    ...prev,
                    available: true,
                    loading: false,
                    url: `${API_BASE_URL}/photos/mosaic.png?t=${Date.now()}`
                }));
            } else {
                // If failed, just update loading state
                setMosaicStatus(prev => ({
                    ...prev,
                    loading: false
                }));
            }
        } catch (error) {
            console.error("Error generating mosaic:", error);
            setMosaicStatus(prev => ({
                ...prev,
                loading: false
            }));
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Enhanced mosaic background with improved overlay */}
            <AnimatePresence>
                {mosaicStatus.available && mosaicStatus.url && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.8 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5 }}
                        className="absolute inset-0 overflow-hidden pointer-events-none"
                    >
                        <img
                            src={mosaicStatus.url}
                            alt="Wedding photo mosaic"
                            className="w-full h-full object-cover"
                            style={{ filter: 'blur(2px)' }}
                        />
                        {/* Lighter gradient overlay for better clarity */}
                        {/* Wedding-themed gradient overlay with reduced opacity */}
                        <div className="absolute inset-0 bg-gradient-to-br from-hindu-accent/40 via-black/10 to-hindu-accent/40"></div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Original animated background elements - shown if mosaic is not available */}
            {(!mosaicStatus.available || mosaicStatus.loading) && (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Floating hearts */}
                    {[...Array(12)].map((_, i) => (
                        <motion.div
                            key={i}
                            className={`absolute opacity-10 text-wedding-love`}
                            initial={{
                                x: Math.random() * 100 - 50,
                                y: Math.random() * 100 - 50,
                                scale: 0.5 + Math.random() * 1.5
                            }}
                            animate={{
                                y: [0, -15, 0],
                                rotate: [0, 5, 0, -5, 0],
                                scale: [1, 1.05, 1],
                            }}
                            transition={{
                                duration: 4 + Math.random() * 6,
                                repeat: Infinity,
                                delay: Math.random() * 4,
                                ease: "easeInOut"
                            }}
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                            }}
                        >
                            <Icon path={mdiHeart} size={1 + Math.random() * 2} />
                        </motion.div>
                    ))}

                    {/* Large decorative circles */}
                    <motion.div
                        className="absolute left-1/4 top-1/4 w-64 h-64 rounded-full bg-christian-accent opacity-5"
                        animate={{
                            y: [0, -20, 0],
                            scale: [1, 1.05, 1],
                        }}
                        transition={{
                            duration: 8,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                    />
                    <motion.div
                        className="absolute right-1/4 bottom-1/4 w-80 h-80 rounded-full bg-hindu-secondary opacity-5"
                        animate={{
                            y: [0, 20, 0],
                            scale: [1, 0.95, 1],
                        }}
                        transition={{
                            duration: 10,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 2
                        }}
                    />
                </div>
            )}

            {/* Main content - NOW WRAPPED IN ELEGANT CARD - REDUCED BLUR */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="relative z-10 bg-white/60 backdrop-blur-sm rounded-2xl shadow-xl px-6 py-8 md:px-12 md:py-10 max-w-2xl border border-white/50"
            >
                <div className="text-center relative">
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                        className="relative"
                    >
                        {/* Enhanced main heading with stronger shadow and backdrop */}
                        <div className="relative z-10">
                            <h1 className="text-7xl md:text-8xl font-script text-wedding-love mb-4 tracking-wide text-shadow-lg drop-shadow-md font-bold">
                                Rushel & Sivani
                            </h1>
                        </div>

                        <motion.div
                            className="flex justify-center items-center mb-6"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                        >
                            <div className="h-px bg-wedding-gold/70 w-16 md:w-24 shadow-sm"></div>
                            <Icon path={mdiHeart} size={1.5} className="mx-4 text-wedding-love drop-shadow-md" />
                            <div className="h-px bg-wedding-gold/70 w-16 md:w-24 shadow-sm"></div>
                        </motion.div>

                        {/* Sub-heading with enhanced readability */}
                        <h2 className="text-3xl md:text-4xl font-display text-gray-800 mb-12 font-bold text-shadow drop-shadow-md">
                            Wedding FotoBox
                        </h2>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5, delay: 0.7 }}
                        className="flex flex-col items-center space-y-6"
                    >
                        {/* Take a Photo button */}
                        <Link
                            to="/camera"
                            className="relative group"
                        >
                            <motion.div
                                className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-christian-accent to-hindu-accent blur opacity-70 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"
                                animate={{
                                    opacity: [0.5, 0.7, 0.5],
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "easeInOut"
                                }}
                            />
                            <div className="relative flex items-center bg-gradient-to-r from-hindu-accent to-hindu-accent/90 text-white text-center text-3xl py-6 px-10 md:py-8 md:px-12 shadow-elegant transform transition-all duration-300 hover:scale-105 btn-hover-glow rounded-full">
                                <Icon path={mdiCamera} size={1.5} className="mr-4" />
                                Take a Photo
                            </div>
                        </Link>

                        {/* Gallery button removed as requested */}
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 1 }}
                        className="mt-12 text-lg font-medium"
                    >
                        <p className="text-black font-semibold">Tap to begin</p>
                    </motion.div>
                </div>
            </motion.div>

            {/* Decorative footer with hidden admin link */}
            <motion.div
                className="absolute bottom-6 w-full text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
            >
                <div className="flex justify-center items-center">
                    <div className="h-px bg-wedding-gold/70 w-16"></div>
                    <p className="mx-4 text-base text-black font-medium">
                        {new Date().getFullYear()}
                    </p>
                    <div className="h-px bg-wedding-gold/70 w-16"></div>
                </div>

                {/* Hidden admin link - only visible if you know where to click */}
                <Link
                    to="/admin-login"
                    className="absolute right-0 bottom-0 w-8 h-8 opacity-0"
                    aria-hidden="true"
                />
            </motion.div>
        </div>
    );
};

export default HomePage;