// src/components/HeartSpinner.js - Updated to match existing LoadingSpinner style
import React from 'react';
import { motion } from 'framer-motion';
import { mdiHeart } from '@mdi/js';
import Icon from '@mdi/react';

const HeartSpinner = () => {
    return (
        <div className="flex flex-col items-center">
            {/* Heart icon with rotation and scaling */}
            <motion.div
                animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 0, 180, 180, 0],
                }}
                transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "loop"
                }}
                className="text-christian-accent"
            >
                <Icon path={mdiHeart} size={3} />
            </motion.div>

            {/* R & S letters with staggered animation */}
            <motion.div
                className="mt-6 flex space-x-3"
                initial="hidden"
                animate="visible"
                variants={{
                    hidden: { opacity: 0 },
                    visible: {
                        opacity: 1,
                        transition: {
                            staggerChildren: 0.3
                        }
                    }
                }}
            >
                {['R', '&', 'S'].map((letter, index) => (
                    <motion.span
                        key={index}
                        className="text-2xl font-bold"
                        variants={{
                            hidden: { y: 20, opacity: 0 },
                            visible: {
                                y: 0,
                                opacity: 1,
                                transition: {
                                    repeat: Infinity,
                                    repeatType: "reverse",
                                    duration: 0.5
                                }
                            }
                        }}
                        style={{ color: index === 0 ? '#d4b08c' : index === 2 ? '#ff5722' : '#2d3748' }}
                    >
                        {letter}
                    </motion.span>
                ))}
            </motion.div>

            {/* Optional processing text - can be removed if you prefer just the heart and initials */}
            <motion.p
                className="mt-4 text-sm text-gray-600"
                animate={{ opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity }}
            >
                Processing your photo...
            </motion.p>
        </div>
    );
};

export default HeartSpinner;