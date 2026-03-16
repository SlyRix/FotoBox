// CameraView.js - Tablet-optimised viewfinder with portrait/landscape picker
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCamera } from '../contexts/CameraContext';
import { motion, AnimatePresence } from 'framer-motion';
import HeartSpinner from './HeartSpinner';
import PageTransition from './PageTransition';
import { useSound } from '../contexts/SoundContext';
import Icon from '@mdi/react';
import { mdiArrowLeft, mdiVolumeHigh, mdiVolumeMute, mdiScreenRotation } from '@mdi/js';

const VIEW_CONFIG = {
    portrait:  { aspectRatio: '2/3', objectPosition: 'center center' },
    landscape: { aspectRatio: '3/2', objectPosition: 'center top' },
};

// Fixed chrome sizes — identical in portrait and landscape photo modes
const TOP_H      = 80;
const BOTTOM_H   = 140;
const BTN_SIZE   = 52;
const SHUTTER_O  = 106;
const SHUTTER_I  = 82;
const BTN_GAP    = 32;

const CameraView = () => {
    const { takePhoto, loading, orientation, setOrientation } = useCamera();
    const { playCountdownBeep, playFinalBeep, playShutterSound, playClickSound, muted, toggleMute } = useSound();
    const navigate = useNavigate();

    const [countdown, setCountdown]                         = useState(null);
    const [isReady, setIsReady]                             = useState(true);
    const [streamActive, setStreamActive]                   = useState(false);
    const [isProcessing, setIsProcessing]                   = useState(false);
    const [showFlash, setShowFlash]                         = useState(false);
    const [showOrientationPicker, setShowOrientationPicker] = useState(true);
    const [webcamZoom, setWebcamZoom]                       = useState(1.0);

    const STREAM_URL   = `/webcam/stream`;
    const SNAPSHOT_URL = `/webcam/snapshot`;

    useEffect(() => {
        fetch('/api/webcam-config')
            .then(r => r.json())
            .then(d => { if (d.zoom) setWebcamZoom(d.zoom); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        let intervalId, cancelled = false;
        const check = () => {
            const img = new Image();
            let timedOut = false;
            const t = setTimeout(() => { timedOut = true; img.src = ''; if (!cancelled) setStreamActive(false); }, 2500);
            img.onload  = () => { clearTimeout(t); if (!cancelled && !timedOut) setStreamActive(true); };
            img.onerror = () => { clearTimeout(t); if (!cancelled) setStreamActive(false); };
            img.src = `${SNAPSHOT_URL}?t=${Date.now()}`;
        };
        check();
        intervalId = setInterval(check, streamActive ? 6000 : 2000);
        return () => { cancelled = true; clearInterval(intervalId); };
    }, [streamActive]);

    const handleSelectOrientation = (selected) => {
        setOrientation(selected);
        playClickSound();
        setShowOrientationPicker(false);
    };

    const handleTakePhoto = () => { setIsReady(false); playClickSound(); setCountdown(5); };

    useEffect(() => {
        let timer;
        if (countdown === null) return;
        if (countdown > 0) {
            playCountdownBeep({ volume: 0.7, rate: 1 + ((5 - countdown) * 0.1) });
            if (countdown === 1) {
                // Pre-focus on last tick so shutter fires immediately on SMILE
                fetch('/api/autofocus', { method: 'POST' }).catch(() => {});
            }
            timer = setTimeout(() => setCountdown(countdown - 1), 1000);
        } else if (countdown === 0) {
            playFinalBeep({ volume: 0.8 });
            setCountdown('SMILE');
            setTimeout(() => {
                setShowFlash(true);
                setTimeout(() => setShowFlash(false), 200);
                playShutterSound();
                capturePhoto();
            }, 1500);
        }
        return () => clearTimeout(timer);
    }, [countdown, playCountdownBeep, playFinalBeep, playShutterSound]);

    const capturePhoto = async () => {
        setIsProcessing(true);
        try {
            const photo = await takePhoto();
            if (photo) { setTimeout(() => navigate('/preview'), 800); }
            else { setIsReady(true); setCountdown(null); setIsProcessing(false); }
        } catch (err) {
            console.error('Failed to take photo:', err);
            setIsReady(true); setCountdown(null); setIsProcessing(false);
        }
    };

    if (loading && countdown === null && !isProcessing) {
        return (
            <PageTransition>
                <div className="min-h-screen flex items-center justify-center" style={{ background: '#080808' }}>
                    <HeartSpinner />
                </div>
            </PageTransition>
        );
    }

    const canCapture = isReady && !loading && streamActive && !isProcessing;
    const view       = VIEW_CONFIG[orientation] || VIEW_CONFIG.landscape;

    // Camera box sizing — no isLandscape conditionals, pure CSS constraints
    const cameraBoxStyle = orientation === 'portrait'
        ? { height: '100%', width: 'auto', maxWidth: '100%' }
        : { width: '75%', height: 'auto', maxHeight: '100%' };

    // Horizontal padding aligns viewfinder with top-bar buttons in landscape
    const cameraPad = orientation === 'landscape' ? '6px 76px' : '8px 16px';

    return (
        <PageTransition>
            <div className="relative w-full flex flex-col overflow-hidden"
                style={{ background: '#080808', height: '100vh', height: '100dvh' }}>

                {/* TOP BAR */}
                <motion.div
                    initial={{ y: -80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center justify-between flex-shrink-0"
                    style={{ height: `${TOP_H}px`, paddingLeft: '20px', paddingRight: '20px', zIndex: 20 }}>

                    <button onClick={() => { playClickSound(); navigate('/'); }}
                        className="icon-circle-btn"
                        style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px`, flexShrink: 0 }}>
                        <Icon path={mdiArrowLeft} size={1.1} />
                    </button>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '22px', fontWeight: 700, color: 'white', letterSpacing: '0.14em', lineHeight: 1 }}>
                            Rushel &amp; Sivani
                        </span>
                        <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '12px', fontStyle: 'italic', color: 'rgba(250,204,21,0.65)', letterSpacing: '0.22em' }}>
                            A Celebration of Love
                        </span>
                    </div>

                    <button onClick={toggleMute}
                        className="icon-circle-btn"
                        style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px`, flexShrink: 0 }}>
                        <Icon path={muted ? mdiVolumeMute : mdiVolumeHigh} size={1.1} />
                    </button>
                </motion.div>

                {/* CAMERA VIEWFINDER */}
                <div className="flex-1 flex items-center justify-center"
                    style={{ padding: cameraPad, minHeight: 0, overflow: 'hidden' }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        style={{
                            position: 'relative',
                            ...cameraBoxStyle,
                            aspectRatio: view.aspectRatio,
                            borderRadius: '20px', overflow: 'hidden', background: '#111',
                            boxShadow: streamActive
                                ? '0 0 0 2px rgba(250,204,21,0.4), 0 0 60px rgba(250,204,21,0.14), 0 12px 60px rgba(0,0,0,0.8)'
                                : '0 0 0 1.5px rgba(255,255,255,0.07), 0 12px 60px rgba(0,0,0,0.8)',
                            transition: 'box-shadow 0.5s ease',
                        }}>

                        {streamActive ? (
                            <div style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
                                <motion.img key="stream" src={STREAM_URL} alt="Camera preview"
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
                                    onError={() => setStreamActive(false)}
                                    style={{
                                        width: '100%', height: '100%',
                                        objectFit: 'cover', objectPosition: view.objectPosition,
                                        display: 'block', background: '#080808',
                                        transform: `scale(${webcamZoom})`,
                                        transformOrigin: 'center center',
                                    }} />
                            </div>
                        ) : (
                            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg,#0f0f0f 0%,#1a0a0a 50%,#0a0a0f 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <motion.div animate={{ scale: [1,1.07,1], opacity: [0.4,0.75,0.4] }} transition={{ duration: 3, repeat: Infinity }}
                                    style={{ color: 'rgba(250,204,21,0.6)', marginBottom: '24px' }}>
                                    <svg width="72" height="72" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7zm7.92-9.45L18.5 4.5H16l-1-2H9L8 4.5H5.5L4.08 6.05A2.94 2.94 0 0 0 3 8.26V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.26a2.94 2.94 0 0 0-1.08-2.21z" />
                                    </svg>
                                </motion.div>
                                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(18px,3vw,26px)', color: 'rgba(255,255,255,0.4)', margin: '0 0 24px' }}>
                                    Connecting to camera...
                                </p>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    {[0,1,2].map(i => (
                                        <motion.div key={i} className="rounded-full"
                                            style={{ width: '10px', height: '10px', background: '#facc15' }}
                                            animate={{ opacity: [0.3,1,0.3], scale: [1,1.4,1] }}
                                            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.22 }} />
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Viewfinder corners */}
                        <AnimatePresence>
                            {streamActive && !showOrientationPicker && countdown === null && !isProcessing && (
                                <motion.div key={orientation} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="absolute pointer-events-none" style={{ inset: '20px' }}>
                                    {['vf-corner vf-corner-tl','vf-corner vf-corner-tr','vf-corner vf-corner-bl','vf-corner vf-corner-br'].map((cls,i) => (
                                        <div key={i} className={cls} />
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Inset vignette */}
                        {streamActive && (
                            <div className="absolute inset-0 pointer-events-none"
                                style={{ boxShadow: 'inset 0 0 50px rgba(0,0,0,0.45)', borderRadius: '20px' }} />
                        )}

                        {/* Countdown overlay */}
                        <AnimatePresence>
                            {countdown !== null && !isProcessing && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                    style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>
                                    <AnimatePresence mode="wait">
                                        {countdown === 'SMILE' ? (
                                            <motion.div key="smile"
                                                initial={{ scale: 0.6, opacity: 0, letterSpacing: '0em' }}
                                                animate={{ scale: 1, opacity: 1, letterSpacing: '0.18em' }}
                                                exit={{ scale: 1.2, opacity: 0 }}
                                                transition={{ type: 'spring', damping: 16, stiffness: 110 }}
                                                style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(36px,7vw,80px)', fontWeight: 700, color: '#facc15', textShadow: '0 0 80px rgba(250,204,21,0.8)', maxWidth: '100%', textAlign: 'center', padding: '0 12px', boxSizing: 'border-box' }}>
                                                SMILE!
                                            </motion.div>
                                        ) : (
                                            <motion.span key={countdown}
                                                initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }}
                                                transition={{ type: 'spring', damping: 20, stiffness: 120 }}
                                                style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(120px,25vw,220px)', fontWeight: 700, lineHeight: 1, color: countdown === 1 ? '#facc15' : 'white', textShadow: countdown === 1 ? '0 0 120px rgba(250,204,21,0.8)' : '0 0 60px rgba(255,255,255,0.35)' }}>
                                                {countdown}
                                            </motion.span>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </div>

                {/* BOTTOM CONTROLS */}
                <motion.div
                    initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.55, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="flex-shrink-0 flex flex-col items-center justify-center"
                    style={{ height: `${BOTTOM_H}px`, gap: '10px' }}>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: `${BTN_GAP}px` }}>

                        {/* Rotate button */}
                        <motion.button
                            onClick={() => { playClickSound(); setOrientation(o => o === 'portrait' ? 'landscape' : 'portrait'); }}
                            whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.08 }}
                            disabled={showOrientationPicker}
                            style={{
                                width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px`, borderRadius: '9999px',
                                background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.18)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: showOrientationPicker ? 'not-allowed' : 'pointer',
                                opacity: showOrientationPicker ? 0.3 : 1,
                                backdropFilter: 'blur(8px)', flexShrink: 0, padding: 0, outline: 'none',
                            }}>
                            <Icon path={mdiScreenRotation} size={0.95} color="rgba(255,255,255,0.85)" />
                        </motion.button>

                        {/* Shutter */}
                        <motion.button
                            onClick={canCapture && !showOrientationPicker ? handleTakePhoto : undefined}
                            disabled={!canCapture || showOrientationPicker}
                            whileTap={canCapture && !showOrientationPicker ? { scale: 0.87 } : {}}
                            style={{
                                position: 'relative', width: `${SHUTTER_O}px`, height: `${SHUTTER_O}px`,
                                background: 'none', border: 'none', padding: 0, flexShrink: 0,
                                cursor: canCapture && !showOrientationPicker ? 'pointer' : 'not-allowed',
                                opacity: canCapture && !showOrientationPicker ? 1 : 0.35,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                            <motion.div style={{
                                position: 'absolute', width: `${SHUTTER_O}px`, height: `${SHUTTER_O}px`, borderRadius: '9999px',
                                border: '2.5px dashed',
                                borderColor: canCapture && !showOrientationPicker ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.15)',
                            }}
                                animate={canCapture && !showOrientationPicker ? { rotate: 360 } : {}}
                                transition={{ duration: 10, repeat: Infinity, ease: 'linear' }} />
                            <div style={{
                                width: `${SHUTTER_I}px`, height: `${SHUTTER_I}px`, borderRadius: '9999px',
                                background: canCapture && !showOrientationPicker ? 'white' : 'rgba(255,255,255,0.4)',
                                boxShadow: canCapture && !showOrientationPicker ? '0 0 40px rgba(255,255,255,0.55),0 0 80px rgba(255,255,255,0.2)' : 'none',
                                transition: 'all 0.3s ease',
                            }} />
                        </motion.button>

                        {/* Balance spacer */}
                        <div style={{ width: `${BTN_SIZE}px`, height: `${BTN_SIZE}px`, flexShrink: 0 }} />
                    </div>

                    {/* Hint text — always shown, always same size */}
                    <AnimatePresence mode="wait">
                        {showOrientationPicker ? (
                            <motion.p key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '17px', fontStyle: 'italic', color: 'rgba(250,204,21,0.6)', letterSpacing: '0.12em', margin: 0 }}>
                                choose your format above
                            </motion.p>
                        ) : canCapture ? (
                            <motion.p key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: 0.4 }}
                                style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '17px', fontStyle: 'italic', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', margin: 0 }}>
                                tap to capture your moment
                            </motion.p>
                        ) : (
                            <motion.p key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontStyle: 'italic', color: 'rgba(255,255,255,0.22)', letterSpacing: '0.1em', margin: 0 }}>
                                waiting for camera…
                            </motion.p>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* FLASH */}
                <AnimatePresence>
                    {showFlash && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.95 }} exit={{ opacity: 0 }} transition={{ duration: 0.07 }}
                            className="absolute inset-0 z-40 pointer-events-none" style={{ background: 'white' }} />
                    )}
                </AnimatePresence>

                {/* PROCESSING */}
                <AnimatePresence>
                    {isProcessing && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                            className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: '#080808' }}>
                            <HeartSpinner />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ORIENTATION PICKER */}
                <AnimatePresence>
                    {showOrientationPicker && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}
                            className="absolute inset-0 z-30 flex items-center justify-center"
                            style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                            <motion.div
                                initial={{ scale: 0.92, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '32px', padding: '48px 36px', maxWidth: '480px', width: '90%' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '14px', fontStyle: 'italic', color: 'rgba(250,204,21,0.6)', letterSpacing: '0.2em', margin: '0 0 10px' }}>
                                        choose your format
                                    </p>
                                    <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,5vw,32px)', fontWeight: 700, color: 'white', letterSpacing: '0.04em', margin: 0 }}>
                                        How would you like your photo?
                                    </h2>
                                </div>
                                <div style={{ display: 'flex', gap: '20px', width: '100%' }}>
                                    {[
                                        { id: 'portrait',  label: 'Portrait',  w: '44px', h: '72px' },
                                        { id: 'landscape', label: 'Landscape', w: '72px', h: '44px' },
                                    ].map(({ id, label, w, h }) => (
                                        <motion.button key={id} onClick={() => handleSelectOrientation(id)}
                                            whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(250,204,21,0.2)' }}
                                            whileTap={{ scale: 0.97 }}
                                            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '28px 16px', background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: '20px', cursor: 'pointer' }}>
                                            <div style={{ width: w, height: h, border: '2.5px solid rgba(250,204,21,0.75)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(250,204,21,0.06)' }}>
                                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(250,204,21,0.3)' }} />
                                            </div>
                                            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 600, color: 'white', margin: 0 }}>
                                                {label}
                                            </p>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        </PageTransition>
    );
};

export default CameraView;
