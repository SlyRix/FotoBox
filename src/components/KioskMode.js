import React, { useEffect } from 'react';

const KioskMode = () => {
  useEffect(() => {
    // Verhindert alle Zoom-Methoden
    const preventZoom = (e) => {
      // Verhindert Ctrl + Scroll Zoom
      if (e.ctrlKey && (e.deltaY !== 0 || e.deltaX !== 0)) {
        e.preventDefault();
      }

      // Verhindert Pinch-Zoom
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    // Verhindert Standardzoom-Ereignisse
    const preventDefaultZoom = (e) => {
      if (e.scale !== 1) {
        e.preventDefault();
      }
    };

    // Zusätzliche Zoom-Verhinderung
    const disableZoom = (e) => {
      // Verhindert Zoom-Tastenkombinationen
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
      }
    };

    // Event-Listener für verschiedene Zoom-Methoden
    document.addEventListener('wheel', preventZoom, { passive: false });
    document.addEventListener('touchmove', preventZoom, { passive: false });
    document.addEventListener('gesturestart', preventDefaultZoom, { passive: false });
    document.addEventListener('gesturechange', preventDefaultZoom, { passive: false });
    document.addEventListener('keydown', disableZoom, { passive: false });

    // Verhindert Kontextmenü und Textauswahl
    const preventContextMenu = (e) => e.preventDefault();
    document.addEventListener('contextmenu', preventContextMenu);

    // Viewport-Meta-Tag für Mobile
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (!metaViewport) {
      const meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(meta);
    } else {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }

    // Vollbildmodus erzwingen (wenn unterstützt)
    const enterFullscreen = () => {
      const docElm = document.documentElement;
      if (docElm.requestFullscreen) {
        docElm.requestFullscreen().catch(err => {
          console.warn('Fullscreen failed:', err);
        });
      } else if (docElm.mozRequestFullScreen) { // Firefox
        docElm.mozRequestFullScreen();
      } else if (docElm.webkitRequestFullScreen) { // Chrome, Safari and Opera
        docElm.webkitRequestFullScreen();
      } else if (docElm.msRequestFullscreen) { // IE/Edge
        docElm.msRequestFullscreen();
      }
    };

    // Versuche Vollbildmodus zu aktivieren
    enterFullscreen();

    // Aufräumen bei Komponentenabbau
    return () => {
      document.removeEventListener('wheel', preventZoom);
      document.removeEventListener('touchmove', preventZoom);
      document.removeEventListener('gesturestart', preventDefaultZoom);
      document.removeEventListener('gesturechange', preventDefaultZoom);
      document.removeEventListener('keydown', disableZoom);
      document.removeEventListener('contextmenu', preventContextMenu);
    };
  }, []);

  return null; // Komponente rendert nichts
};

export default KioskMode;