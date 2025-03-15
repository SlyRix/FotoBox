// Simplified HomePage.js with focused UI
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const HomePage = () => {
    return (
        <div className="min-h-screen bg-wedding-background flex flex-col items-center justify-center">
            {/* Simple wedding decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute left-1/4 top-1/4 w-32 h-32 rounded-full bg-christian-accent opacity-5"
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
                    className="absolute right-1/4 bottom-1/4 w-40 h-40 rounded-full bg-hindu-secondary opacity-5"
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

            {/* Main content */}
            <div className="text-center z-10 px-6">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <h1 className="text-5xl md:text-6xl font-script text-wedding-love mb-3">Rushel & Sivani</h1>
                    <h2 className="text-2xl md:text-3xl font-display text-gray-800 mb-12">Wedding FotoBox</h2>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="flex flex-col items-center"
                >
                    <Link
                        to="/camera"
                        className="btn btn-primary btn-christian w-64 text-center text-xl shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-xl"
                    >
                        Take a Photo
                    </Link>

                    {/* Admin login link - small and subtle */}
                    <Link
                        to="/admin-login"
                        className="mt-12 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        Admin
                    </Link>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 1.2 }}
                    className="mt-16 text-gray-500 text-sm"
                >
                    <p>Tap the button to capture your memories</p>
                </motion.div>
            </div>

            <div className="absolute bottom-4 text-center text-xs text-gray-400">
                <p>Rushel & Sivani Wedding • {new Date().getFullYear()}</p>
            </div>
        </div>
    );
};

export default HomePage;