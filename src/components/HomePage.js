// Fixed HomePage.js with elegant design and animations
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiCamera, mdiHeart } from '@mdi/js';

const HomePage = () => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Animated background elements */}
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

            {/* Main content */}
            <div className="text-center z-10 px-6">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                >
                    <h1 className="text-7xl md:text-8xl font-script text-wedding-love mb-4 tracking-wide text-shadow-sm">
                        Rushel & Sivani
                    </h1>

                    <motion.div
                        className="flex justify-center items-center mb-6"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        <div className="h-px bg-wedding-gold/40 w-16 md:w-24"></div>
                        <Icon path={mdiHeart} size={1.5} className="mx-4 text-wedding-love" />
                        <div className="h-px bg-wedding-gold/40 w-16 md:w-24"></div>
                    </motion.div>

                    <h2 className="text-3xl md:text-4xl font-display text-gray-800 mb-16">Wedding FotoBox</h2>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.5 }}
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
                        <div className="relative flex items-center bg-gradient-to-r from-hindu-accent to-hindu-accent/90 text-white text-center text-3xl py-8 px-12 shadow-elegant transform transition-all duration-300 hover:scale-105 btn-hover-glow rounded-full">
                            <Icon path={mdiCamera} size={1.5} className="mr-4" />
                            Take a Photo
                        </div>
                    </Link>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 1 }}
                    className="mt-20 text-gray-500 text-lg"
                >
                    <p>Tap to begin</p>
                </motion.div>
            </div>

            {/* Decorative footer with hidden admin link */}
            <motion.div
                className="absolute bottom-6 w-full text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
            >
                <div className="flex justify-center items-center">
                    <div className="h-px bg-wedding-gold/30 w-16"></div>
                    <p className="mx-4 text-base text-gray-400">
                        {new Date().getFullYear()}
                    </p>
                    <div className="h-px bg-wedding-gold/30 w-16"></div>
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