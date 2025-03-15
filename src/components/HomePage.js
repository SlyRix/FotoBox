// Improved HomePage.js with consistent styling and large buttons
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const HomePage = () => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 flex flex-col items-center justify-center p-4">
            {/* Simple wedding decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    className="absolute left-1/4 top-1/4 w-48 h-48 rounded-full bg-christian-accent opacity-5"
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
                    className="absolute right-1/4 bottom-1/4 w-64 h-64 rounded-full bg-hindu-secondary opacity-5"
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
                    <h1 className="text-6xl md:text-7xl font-script text-wedding-love mb-4">Rushel & Sivani</h1>
                    <h2 className="text-3xl md:text-4xl font-display text-gray-800 mb-16">Wedding FotoBox</h2>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="flex flex-col items-center"
                >
                    <Link
                        to="/camera"
                        className="btn btn-primary btn-hindu w-80 text-center text-3xl py-8 shadow-lg transform transition-all duration-300 hover:scale-105 hover:shadow-xl rounded-full"
                    >
                        Take a Photo
                    </Link>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 1.2 }}
                    className="mt-16 text-gray-500 text-lg"
                >
                    <p>Tap a button to begin</p>
                </motion.div>
            </div>

            <div className="absolute bottom-6 text-center text-base text-gray-400">
                <p>Rushel & Sivani Wedding • {new Date().getFullYear()}</p>
                {/* Hidden admin link - only visible if you know where to click */}
                <Link
                    to="/admin-login"
                    className="absolute right-0 bottom-0 w-6 h-6 opacity-0"
                    aria-hidden="true"
                />
            </div>
        </div>
    );
};

export default HomePage;