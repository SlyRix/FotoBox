// client/src/components/HomePage.js
import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion } from 'framer-motion';

const HomePage = () => {
    const { fetchPhotos } = useCamera();

    useEffect(() => {
        // Fetch photos when component mounts
        fetchPhotos();
    }, [fetchPhotos]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10">
            {/* Decorative elements matching wedding theme */}
            <motion.div
                className="absolute left-1/4 top-1/4 w-32 h-32 rounded-full bg-christian-accent opacity-10"
                animate={{
                    y: [0, -30, 0],
                    scale: [1, 1.1, 1],
                    opacity: [0.1, 0.15, 0.1]
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
            />

            <motion.div
                className="absolute right-1/4 bottom-1/4 w-40 h-40 rounded-full bg-hindu-secondary opacity-10"
                animate={{
                    y: [0, 40, 0],
                    scale: [1, 0.9, 1],
                    opacity: [0.1, 0.2, 0.1]
                }}
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 2
                }}
            />

            <div className="z-10">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    className="text-center mb-16"
                >
                    <h1 className="text-5xl md:text-6xl font-script text-wedding-love mb-4">Rushel & Sivani</h1>
                    <p className="text-2xl md:text-3xl font-display text-gray-800">Wedding FotoBox</p>
                    <p className="mt-4 text-gray-600 max-w-md mx-auto">
                        Capture beautiful memories from our special day. Take photos, get a QR code to view them, and have fun!
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="flex flex-col space-y-4 items-center"
                >
                    <Link
                        to="/camera"
                        className="btn btn-primary btn-christian w-64 text-center text-xl"
                    >
                        Take a Photo
                    </Link>

                    <Link
                        to="/gallery"
                        className="btn btn-outline btn-christian-outline w-64 text-center"
                    >
                        View Photo Gallery
                    </Link>
                </motion.div>
            </div>

            <footer className="absolute bottom-4 text-center text-sm text-gray-500">
                <p>Rushel & Sivani Wedding • {new Date().getFullYear()}</p>
            </footer>
        </div>
    );
};

export default HomePage;