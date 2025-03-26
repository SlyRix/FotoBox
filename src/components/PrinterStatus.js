import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Icon from '@mdi/react';
import { mdiPrinter, mdiPrinterAlert, mdiRefresh, mdiPrinterOff, mdiCheck } from '@mdi/js';
import { API_ENDPOINT } from '../App';

const PrinterStatus = ({ jobId = null, autoRefresh = true, showControls = true }) => {
    const [status, setStatus] = useState({
        loading: true,
        printerName: '',
        status: 'unknown',
        state: 'unknown',
        enabled: false,
        ready: false,
        details: '',
        lastChecked: null
    });

    const [jobStatus, setJobStatus] = useState({
        loading: true,
        status: 'unknown',
        message: '',
        details: ''
    });

    const [error, setError] = useState(null);

    // Fetch printer status
    const checkPrinterStatus = async () => {
        try {
            setStatus(prev => ({ ...prev, loading: true }));
            setError(null);

            const response = await fetch(`${API_ENDPOINT}/printer-status`);

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();

            setStatus({
                loading: false,
                printerName: data.printerName,
                status: data.status,
                state: data.state,
                enabled: data.enabled,
                ready: data.ready,
                details: data.details,
                lastChecked: new Date()
            });
        } catch (err) {
            console.error('Error checking printer status:', err);
            setError('Failed to connect to printer service');
            setStatus(prev => ({ ...prev, loading: false }));
        }
    };

    // Check job status if we have a jobId
    const checkJobStatus = async () => {
        if (!jobId) return;

        try {
            setJobStatus(prev => ({ ...prev, loading: true }));

            const response = await fetch(`${API_ENDPOINT}/print-status/${jobId}`);

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            const data = await response.json();

            setJobStatus({
                loading: false,
                status: data.status,
                message: data.message,
                details: data.details || ''
            });
        } catch (err) {
            console.error('Error checking job status:', err);
            setJobStatus({
                loading: false,
                status: 'error',
                message: 'Failed to check print job status',
                details: err.message
            });
        }
    };

    // Initial fetch
    useEffect(() => {
        checkPrinterStatus();
        if (jobId) {
            checkJobStatus();
        }
    }, [jobId]);

    // Auto-refresh if enabled (every 5 seconds)
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            checkPrinterStatus();
            if (jobId && jobStatus.status !== 'completed') {
                checkJobStatus();
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [autoRefresh, jobId, jobStatus.status]);

    // Get the appropriate icon based on printer state
    const getPrinterIcon = () => {
        if (!status.enabled) return mdiPrinterOff;
        if (status.state !== 'ok' || !status.ready) return mdiPrinterAlert;
        if (status.status === 'ready') return mdiPrinter;
        return mdiPrinter;
    };

    // Get color based on printer state
    const getStateColor = () => {
        if (!status.enabled) return 'text-gray-500';
        if (status.state !== 'ok' || !status.ready) return 'text-red-500';
        if (status.status === 'ready') return 'text-green-500';
        return 'text-blue-500';
    };

    // Helpful message about printer state
    const getPrinterMessage = () => {
        if (!status.enabled) return 'Printing is disabled in system configuration';
        if (status.state === 'out-of-paper') return 'Printer is out of paper';
        if (status.state === 'out-of-ink') return 'Printer is out of ink';
        if (status.state === 'paper-jam') return 'Paper jam detected';
        if (status.state === 'cover-open') return 'Printer cover is open';
        if (!status.ready) return 'Printer is not ready';
        if (status.status === 'ready') return 'Printer is ready';
        if (status.status === 'busy') return 'Printer is busy';
        if (status.status === 'offline') return 'Printer is offline';
        return 'Checking printer status...';
    };

    // Get job status message
    const getJobMessage = () => {
        if (!jobId) return null;
        if (jobStatus.loading) return 'Checking print job status...';
        if (jobStatus.status === 'completed') return 'Print job completed successfully';
        if (jobStatus.status === 'pending') return 'Print job is in progress';
        if (jobStatus.status === 'error') return 'Print job encountered an error';
        return jobStatus.message || 'Unknown job status';
    };

    // Render the component
    return (
        <div className="bg-white rounded-lg shadow-md p-4">
            {/* Printer Status Header */}
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700">Printer Status</h3>
                {showControls && (
                    <button
                        onClick={() => {
                            checkPrinterStatus();
                            if (jobId) checkJobStatus();
                        }}
                        className="text-gray-500 hover:text-gray-700 p-1 rounded-full"
                        title="Refresh printer status"
                    >
                        <Icon path={mdiRefresh} size={0.8} />
                    </button>
                )}
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 text-red-700 p-2 rounded-md mb-2 text-xs">
                    {error}
                </div>
            )}

            {/* Printer Status */}
            <div className="flex items-center mb-2">
                <div className={`mr-3 ${getStateColor()}`}>
                    <motion.div
                        animate={status.status === 'busy' ? { rotate: 360 } : {}}
                        transition={{ repeat: status.status === 'busy' ? Infinity : 0, duration: 2 }}
                    >
                        <Icon path={getPrinterIcon()} size={1.5} />
                    </motion.div>
                </div>

                <div className="flex-1">
                    <div className="font-medium">{status.printerName || 'Canon SELPHY CP1500'}</div>
                    <div className="text-sm text-gray-600">{getPrinterMessage()}</div>

                    {jobId && (
                        <div className="mt-2 flex items-center text-sm">
                            {jobStatus.status === 'completed' ? (
                                <span className="flex items-center text-green-600">
                  <Icon path={mdiCheck} size={0.7} className="mr-1" />
                                    {getJobMessage()}
                </span>
                            ) : (
                                <span className="text-blue-600">{getJobMessage()}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Last checked timestamp */}
            {status.lastChecked && (
                <div className="text-xs text-gray-500 text-right">
                    Last checked: {status.lastChecked.toLocaleTimeString()}
                </div>
            )}
        </div>
    );
};

export default PrinterStatus;