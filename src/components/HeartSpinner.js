// Fixed HeartSpinner.js with centered heart and no bubble
import React from 'react';
import { motion } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiHeart, mdiHeartOutline } from '@mdi/js';

const HeartSpinner = () => {
    // Animation variants for the floating hearts
    const floatingHeartVariants = {
        animate: {
            y: [0, -20, 0],
            opacity: [0, 1, 0],
            scale: [0.5, 1, 0.5],
            transition: {
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
            }
        }
    };

    // Create multiple hearts with staggered animations
    const createHearts = () => {
        return [...Array(12)].map((_, i) => {
            // Calculate position in a circle around the center
            const angle = (i / 12) * Math.PI * 2; // Distribute around the circle
            const radius = 60 + Math.random() * 20; // Vary the distance slightly
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;

            // Randomize delay and duration slightly for natural feel
            const delay = i * 0.1 + Math.random() * 0.2;
            const duration = 1.5 + Math.random() * 1;

            return (
                <motion.div
                    key={i}
                    className="absolute text-wedding-love"
                    initial={{ x, y, opacity: 0, scale: 0.5 }}
                    animate={{
                        y: [y, y - 20, y],
                        opacity: [0, 1, 0],
                        scale: [0.5, 1, 0.5]
                    }}
                    transition={{
                        duration,
                        delay,
                        repeat: Infinity,
                        repeatDelay: Math.random() * 0.5
                    }}
                    style={{ left: "50%", top: "50%", marginLeft: x, marginTop: y }}
                >
                    <Icon path={i % 2 === 0 ? mdiHeart : mdiHeartOutline} size={0.8 + Math.random() * 0.4} />
                </motion.div>
            );
        });
    };

    return (
        <div className="flex flex-col items-center justify-center">
            {/* Container for the floating hearts */}
            <div className="relative w-80 h-80">
                {/* Central pulsing heart - perfectly centered */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex justify-center items-center">
                    <motion.div
                        className="text-wedding-love z-10"
                        animate={{
                            scale: [1, 1.2, 1],
                            rotate: [0, 0, 10, 10, 0],
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            repeatType: "loop"
                        }}
                    >
                        <Icon path={mdiHeart} size={4} />
                    </motion.div>
                </div>

                {/* Floating hearts around the center */}
                {createHearts()}
            </div>

            {/* R & S letters with staggered animation */}
            <motion.div
                className="mt-2 flex space-x-4"
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
                {[
                    { letter: 'R', color: '#b08968' }, // Christian theme accent
                    { letter: '&', color: '#2d3748' },
                    { letter: 'S', color: '#d93f0b' }  // Hindu theme accent
                ].map((item, index) => (
                    <motion.span
                        key={index}
                        className="text-3xl font-display font-bold"
                        variants={{
                            hidden: { y: 20, opacity: 0 },
                            visible: {
                                y: 0,
                                opacity: 1,
                                transition: {
                                    repeat: Infinity,
                                    repeatType: "reverse",
                                    duration: 0.8,
                                    delay: index * 0.2
                                }
                            }
                        }}
                        style={{ color: item.color }}
                    >
                        {item.letter}
                    </motion.span>
                ))}
            </motion.div>

            {/* Processing text with fade animation */}
            <motion.p
                className="mt-6 text-lg text-gray-600 font-display"
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
            >
                Capturing your special moment...
            </motion.p>
        </div>
    );
};

export default HeartSpinner;