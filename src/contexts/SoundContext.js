import React, { createContext, useContext, useRef, useEffect, useState } from 'react';

// Create the context
const SoundContext = createContext();

// Sound paths - add these sound files to your public/sounds directory
const SOUNDS = {
    countdownBeep: '/sounds/countdown-beep.mp3',
    finalBeep: '/sounds/final-beep.mp3',
    cameraShutter: '/sounds/camera-shutter.mp3',
    successChime: '/sounds/success-chime.mp3',
    clickSound: '/sounds/click-sound.mp3'
};

export const SoundProvider = ({ children }) => {
    // Audio refs to maintain reference to audio objects
    const soundRefs = useRef({});

    // Mute state
    const [muted, setMuted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadedSounds, setLoadedSounds] = useState(0);

    // Initialize audio objects
    useEffect(() => {
        const soundKeys = Object.keys(SOUNDS);
        setLoading(true);

        // Initialize audio objects for each sound
        soundKeys.forEach(key => {
            const audio = new Audio(SOUNDS[key]);
            soundRefs.current[key] = audio;

            // Preload sounds
            audio.addEventListener('canplaythrough', () => {
                setLoadedSounds(prev => {
                    const newCount = prev + 1;
                    if (newCount >= soundKeys.length) {
                        setLoading(false);
                    }
                    return newCount;
                });
            }, { once: true });

            audio.load();
        });

        // Restore mute preference from localStorage
        const savedMute = localStorage.getItem('fotobox_muted');
        if (savedMute === 'true') {
            setMuted(true);
        }

        // Clean up audio objects on unmount
        return () => {
            Object.values(soundRefs.current).forEach(audio => {
                audio.pause();
                audio.src = '';
            });
            soundRefs.current = {};
        };
    }, []);

    // Update all audio elements when mute state changes
    useEffect(() => {
        Object.values(soundRefs.current).forEach(audio => {
            audio.muted = muted;
        });

        // Save mute preference to localStorage
        localStorage.setItem('fotobox_muted', muted);
    }, [muted]);

    // Function to play a sound
    const playSound = (soundName, options = {}) => {
        if (!soundRefs.current[soundName]) {
            console.warn(`Sound '${soundName}' not found`);
            return;
        }

        try {
            const sound = soundRefs.current[soundName];

            // Reset current time to start
            sound.currentTime = 0;

            // Apply volume if specified
            if (options.volume !== undefined) {
                sound.volume = options.volume;
            }

            // Set playback rate if specified
            if (options.rate !== undefined) {
                sound.playbackRate = options.rate;
            }

            // Play the sound
            sound.play().catch(error => {
                console.log(`Sound play failed (${soundName}):`, error);
                // This often happens due to browser autoplay policies
            });
        } catch (error) {
            console.error(`Error playing sound (${soundName}):`, error);
        }
    };

    // Named functions for common sounds
    const playCountdownBeep = (options = {}) => playSound('countdownBeep', options);
    const playFinalBeep = (options = {}) => playSound('finalBeep', options);
    const playShutterSound = (options = {}) => playSound('cameraShutter', options);
    const playSuccessSound = (options = {}) => playSound('successChime', options);
    const playClickSound = (options = {}) => playSound('clickSound', options);

    // Toggle mute state
    const toggleMute = () => setMuted(prev => !prev);

    // Context value
    const value = {
        playSound,
        playCountdownBeep,
        playFinalBeep,
        playShutterSound,
        playSuccessSound,
        playClickSound,
        muted,
        toggleMute,
        loading,
        loadedSounds
    };

    return (
        <SoundContext.Provider value={value}>
            {children}
        </SoundContext.Provider>
    );
};

// Custom hook for using the sound context
export const useSound = () => {
    const context = useContext(SoundContext);
    if (context === undefined) {
        throw new Error('useSound must be used within a SoundProvider');
    }
    return context;
};

export default SoundProvider;