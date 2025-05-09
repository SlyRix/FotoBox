// src/components/CaptureErrorRecovery.js
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiAlert, mdiRefresh, mdiCamera, mdiArrowLeft, mdiInformation, mdiClose } from '@mdi/js';

const CaptureErrorRecovery = ({ error, onRetry, onCancel, onGoHome }) => {
    const [showDetails, setShowDetails] = useState(false);

    // Determine if this is a serious or recoverable error
    const isRecoverable = error?.recoverable !== false;

    // Get suggestions if available
    const suggestions = error?.recoverySuggestions || [
        'Check if the camera is properly connected',
        'Make sure the camera is turned on',
        'Ensure there is enough lighting'
    ];

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-white rounded-xl shadow-xl max-w-md w-full relative overflow-hidden"
            >
                {/* Header */}
                <div className={`p-4 ${isRecoverable ? 'bg-yellow-500' : 'bg-red-600'} text-white`}>
                    <div className="flex items-center">
                        <Icon path={mdiAlert} size={1.2} className="mr-2" />
                        <h2 className="text-xl font-bold">
                            {isRecoverable ? 'Photo Capture Issue' : 'Camera Error'}
                        </h2>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <p className="text-lg mb-4">
                        {isRecoverable
                            ? 'We had a problem taking your photo, but we can try again.'
                            : 'There was a serious problem with the camera.'}
                    </p>

                    <div className="mb-6">
                        <h3 className="font-medium mb-2">Try these suggestions:</h3>
                        <ul className="space-y-2">
                            {suggestions.map((suggestion, index) => (
                                <li key={index} className="flex items-start">
                                    <span className="bg-gray-200 text-gray-700 rounded-full w-5 h-5 flex items-center justify-center text-xs mr-2 mt-0.5">
                                        {index + 1}
                                    </span>
                                    <span>{suggestion}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Error details (collapsible) */}
                    <div className="mb-6">
                        <button
                            onClick={() => setShowDetails(!showDetails)}
                            className="text-sm flex items-center text-gray-500 hover:text-gray-700"
                        >
                            <Icon path={showDetails ? mdiClose : mdiInformation} size={0.8} className="mr-1" />
                            {showDetails ? 'Hide technical details' : 'Show technical details'}
                        </button>

                        {showDetails && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-700 overflow-auto max-h-40"
                            >
                                <p>Error: {error?.error || 'Unknown error'}</p>
                                {error?.errorCode && <p>Code: {error.errorCode}</p>}
                                {error?.cameraError && <p>Camera: {error.cameraError}</p>}
                                {error?.systemError && <p>System: {error.systemError}</p>}
                            </motion.div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-3 justify-between">
                        <button
                            onClick={onGoHome}
                            className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                            <Icon path={mdiArrowLeft} size={0.8} className="mr-1" />
                            Back to Home
                        </button>

                        {isRecoverable && (
                            <button
                                onClick={onRetry}
                                className="flex items-center justify-center px-6 py-2 bg-wedding-love text-white rounded-lg font-medium hover:bg-wedding-love/90"
                            >
                                <Icon path={mdiCamera} size={0.8} className="mr-1" />
                                Try Again
                            </button>
                        )}

                        {!isRecoverable && (
                            <button
                                onClick={onCancel}
                                className="flex items-center justify-center px-6 py-2 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700"
                            >
                                <Icon path={mdiRefresh} size={0.8} className="mr-1" />
                                Restart App
                            </button>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default CaptureErrorRecovery;