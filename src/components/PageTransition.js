import React from 'react';
import { motion } from 'framer-motion';

// Common transition variants
export const pageVariants = {
    initial: {
        opacity: 0,
        y: 20
    },
    in: {
        opacity: 1,
        y: 0
    },
    out: {
        opacity: 0,
        y: -20
    }
};

export const pageTransition = {
    type: 'tween',
    ease: 'anticipate',
    duration: 0.3
};

// Reusable page transition component
const PageTransition = ({ children, className = "", variants = pageVariants, transition = pageTransition }) => {
    return (
        <motion.div
            className={`w-full min-h-screen flex flex-col ${className}`}
            initial="initial"
            animate="in"
            exit="out"
            variants={variants}
            transition={transition}
        >
            {children}
        </motion.div>
    );
};

// Animation for shared elements across pages
export const sharedElementVariants = {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 }
};

// Shared element transition component
export const SharedElement = ({ layoutId, children, className = "", ...props }) => {
    return (
        <motion.div
            layoutId={layoutId}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={sharedElementVariants}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={className}
            {...props}
        >
            {children}
        </motion.div>
    );
};

export default PageTransition;