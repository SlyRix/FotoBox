import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiImage } from '@mdi/js';

// Skeleton loader component for images
export const ImageSkeleton = ({ className = '' }) => (
    <div className={`animate-pulse ${className}`}>
        <div className="aspect-[1.414/1] w-full bg-gray-200 rounded-lg">
            <div className="h-full w-full flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                          d="M4 8h16M4 12h16" />
                </svg>
            </div>
        </div>
    </div>
);

// Image loading error state component
export const ImageError = ({ className = '', message = "Image could not be loaded" }) => (
    <div className={`aspect-[1.414/1] w-full bg-gray-100 rounded-lg flex flex-col items-center justify-center ${className}`}>
        <Icon path={mdiImage} size={3} className="text-gray-400 mb-3" />
        <p className="text-gray-500 font-medium">{message}</p>
        <p className="text-sm text-gray-400 mt-1">Please try again later</p>
    </div>
);

// Progressive loading with blur-up technique
const ProgressiveImage = ({
                              src,
                              alt,
                              className = "",
                              containerClassName = "",
                              placeholderSrc = "",
                              onLoad = () => {},
                              onError = () => {},
                              enableTransitions = true
                          }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState(false);

    // Handle image load completion
    const handleImageLoaded = () => {
        setIsLoaded(true);
        onLoad();
    };

    // Handle image loading error
    const handleImageError = (e) => {
        console.error("Error loading image:", src);
        setError(true);
        onError(e);
    };

    return (
        <div className={`relative overflow-hidden ${containerClassName}`}>
            {/* Show skeleton loader while image is loading */}
            {!isLoaded && !error && <ImageSkeleton className={className} />}

            {/* Show error state if image failed to load */}
            {error ? (
                <ImageError className={className} />
            ) : (
                <motion.div
                    initial={enableTransitions ? { opacity: 0 } : { opacity: 1 }}
                    animate={isLoaded ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full h-full"
                >
                    {/* Low-resolution placeholder (optional) */}
                    {placeholderSrc && !isLoaded && (
                        <img
                            src={placeholderSrc}
                            alt={`Loading ${alt}`}
                            className={`${className} absolute inset-0 blur-sm scale-105`}
                            style={{ filter: 'blur(10px)' }}
                        />
                    )}

                    {/* Main image */}
                    <img
                        src={src}
                        alt={alt}
                        className={`${className} ${isLoaded ? '' : 'opacity-0'}`}
                        onLoad={handleImageLoaded}
                        onError={handleImageError}
                    />
                </motion.div>
            )}

            {/* Loading indicator overlay */}
            {!isLoaded && !error && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-10 h-10 border-4 border-wedding-love border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
        </div>
    );
};

export default ProgressiveImage;