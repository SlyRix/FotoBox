// src/components/OfflineStatusBar.js
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiWifiOff, mdiWifi, mdiSync, mdiInformation } from '@mdi/js';
import { API_ENDPOINT } from '../App';

const OfflineStatusBar = () => {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingUploads, setPendingUploads] = useState(0);
    const [showDetails, setShowDetails] = useState(false);

    // Check offline status regularly
    useEffect(() => {
        const checkConnectionStatus = async () => {
            try {
                const response = await fetch(`${API_ENDPOINT}/connection-status`, {
                    // Short timeout to avoid blocking UI
                    signal: AbortSignal.timeout(3000)
                });

                if (response.ok) {
                    const data = await response.json();
                    setIsOnline(data.online);
                    setPendingUploads(data.pendingUploads || 0);
                } else {
                    // If we can't reach the endpoint, we're likely offline
                    setIsOnline(false);
                }
            } catch (error) {
                // Failed to fetch means we're offline
                setIsOnline(false);
            }
        };

        // Also listen to browser's online/offline events
        const handleOnline = () => {
            // Don't immediately set online - wait for real check
            checkConnectionStatus();
        };

        const handleOffline = () => {
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial check
        checkConnectionStatus();

        // Set up interval for regular checks
        const interval = setInterval(checkConnectionStatus, 30000);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    // If we're online and have no pending uploads, don't show anything
    if (isOnline && pendingUploads === 0) {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ y: -100 }}
                animate={{ y: 0 }}
                exit={{ y: -100 }}
                className={`fixed top-0 left-0 right-0 z-50 ${isOnline ? 'bg-yellow-500' : 'bg-red-600'} shadow-md`}
            >
                <div className="container mx-auto px-4 py-2 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <Icon path={isOnline ? mdiWifi : mdiWifiOff} size={1} className="mr-2" />
                            <span className="font-medium">
                                {isOnline
                                    ? `Online - ${pendingUploads} photos waiting to upload`
                                    : 'Offline Mode - Photos saved locally until connection is restored'}
                            </span>
                        </div>

                        <div className="flex items-center space-x-2">
                            {isOnline && pendingUploads > 0 && (
                                <div className="flex items-center animate-pulse">
                                    <Icon path={mdiSync} size={0.8} className="mr-1" />
                                    <span className="text-sm">Uploading...</span>
                                </div>
                            )}

                            <button
                                onClick={() => setShowDetails(!showDetails)}
                                className="p-1 hover:bg-white/20 rounded"
                            >
                                <Icon path={mdiInformation} size={0.8} />
                            </button>
                        </div>
                    </div>

                    {/* Detailed info section */}
                    {showDetails && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="mt-2 pt-2 border-t border-white/30 text-sm"
                        >
                            <p>
                                {isOnline
                                    ? `Your photos are safe and will be uploaded in the background. You can continue using the photo booth normally.`
                                    : `Don't worry! All photos are being saved locally and will be automatically uploaded when the internet connection is restored. QR codes will work once photos are uploaded.`}
                            </p>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default OfflineStatusBar;