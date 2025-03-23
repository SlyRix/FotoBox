import React from 'react';
import { motion } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiImageFilterBlackWhite, mdiImageFilterVintage, mdiImage, mdiHeartMultiple, mdiCreationOutline  } from '@mdi/js';

// Updated filter definitions with CSS filter properties
export const FILTERS = [
    {
        id: 'original',
        name: 'Original',
        icon: mdiImage,
        style: {}
    },
    {
        id: 'sepia',
        name: 'Vintage',
        icon: mdiImageFilterVintage,
        style: { filter: 'sepia(0.7) contrast(1.05)' }
    },
    {
        id: 'grayscale',
        name: 'B&W',
        icon: mdiImageFilterBlackWhite,
        style: { filter: 'grayscale(1)' }
    },
    {
        id: 'dream',
        name: 'Dream',
        style: { filter: 'brightness(1.1) contrast(0.85) saturate(1.2) blur(0.5px)' }
    },
    {
        id: 'romance',
        name: 'Romance',
        icon: mdiHeartMultiple,
        style: { filter: 'brightness(1.05) contrast(0.95) saturate(1.15) sepia(0.2) hue-rotate(330deg)' }
    },
    {
        id: 'forever',
        name: 'Forever',
        icon: mdiCreationOutline ,
        style: {
            filter: 'contrast(1.15) brightness(1.1) saturate(1.05)',
            // Add vignette effect with box-shadow
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)'
        }
    }
];

// Component for filter selection
const PhotoFilters = ({ onFilterChange, currentFilter = 'original' }) => {
    // Animation for filter items
    const filterItemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: i => ({
            opacity: 1,
            y: 0,
            transition: {
                delay: i * 0.05,
                duration: 0.3
            }
        })
    };

    return (
        <div className="w-full overflow-x-auto pb-2">
            <div className="flex space-x-3 min-w-max px-1 py-2">
                {FILTERS.map((filter, index) => (
                    <motion.button
                        key={filter.id}
                        custom={index}
                        initial="hidden"
                        animate="visible"
                        variants={filterItemVariants}
                        onClick={() => onFilterChange(filter)}
                        className={`flex flex-col items-center p-2 rounded transition-all duration-300 ${
                            currentFilter === filter.id
                                ? 'bg-wedding-love/10 ring-2 ring-wedding-love shadow-md'
                                : 'bg-white hover:bg-gray-50'
                        }`}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <div
                            className="w-16 h-16 rounded-lg overflow-hidden mb-2 bg-gray-100 flex items-center justify-center shadow-sm relative"
                        >
                            {/* Filter preview image */}
                            <div
                                className="absolute inset-0 bg-cover bg-center"
                                style={{
                                    backgroundImage: "url('/filter-preview.jpg')",
                                    ...filter.style
                                }}
                            ></div>

                            {/* Icon overlay */}
                            {filter.icon && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                                    <Icon
                                        path={filter.icon}
                                        size={1.5}
                                        className={`text-white drop-shadow-md ${
                                            currentFilter === filter.id ? 'opacity-100' : 'opacity-70'
                                        }`}
                                    />
                                </div>
                            )}
                        </div>
                        <span className={`text-xs font-medium ${currentFilter === filter.id ? 'text-wedding-love' : 'text-gray-700'}`}>
                            {filter.name}
                        </span>
                    </motion.button>
                ))}
            </div>
        </div>
    );
};

// Component for rendering an image with a filter applied
export const FilteredImage = ({
                                  src,
                                  filter = 'original',
                                  className = "",
                                  containerClassName = "",
                                  ...props
                              }) => {
    const selectedFilter = FILTERS.find(f => f.id === filter) || FILTERS[0];

    // Special handling for the Forever filter with vignette effect
    if (filter === 'forever') {
        return (
            <div className={`overflow-hidden relative ${containerClassName}`}>
                <motion.div
                    className="relative w-full h-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <img
                        src={src}
                        className={`w-full h-full object-contain ${className}`}
                        style={{ filter: selectedFilter.style.filter }}
                        {...props}
                    />
                    {/* Add vignette overlay */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ boxShadow: 'inset 0 0 80px rgba(0,0,0,0.5)' }}
                    ></div>
                </motion.div>
            </div>
        );
    }

    // Standard filter rendering
    return (
        <div className={`overflow-hidden ${containerClassName}`}>
            <motion.img
                src={src}
                className={`w-full h-full object-contain ${className}`}
                style={selectedFilter.style}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                {...props}
            />
        </div>
    );
};

export default PhotoFilters;