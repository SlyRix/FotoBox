# Implementation Plan: Adding Offline Mode to Your PhotoBox

This plan outlines how to enhance your existing PhotoBox app with offline capabilities while minimizing code changes.

## Phase 1: Raspberry Pi Hotspot Setup

1. **Configure Automatic Hotspot**:
   ```bash
   # SSH into your venue Raspberry Pi
   ssh pi@your-raspberry-pi-ip
   
   # Download and run the hotspot setup script
   wget -O setup-hotspot.sh https://raw.githubusercontent.com/yourusername/wedding-fotobox/main/setup-hotspot.sh
   chmod +x setup-hotspot.sh
   sudo ./setup-hotspot.sh
   ```

2. **Customize Hotspot Settings**:
   Edit `/etc/hostapd/hostapd.conf` to set your preferred:
    - Network name (SSID): Change from `WeddingPhotoBox` to your preferred name
    - Password: Change from `yourweddingdate` to something secure but memorable
    - Channel: Use channel 1, 6, or 11 for best performance

3. **Test Hotspot Functionality**:
   ```bash
   # Manually switch to hotspot mode
   sudo /usr/local/bin/toggle-network-mode.sh hotspot
   
   # Check if hotspot is active
   sudo systemctl status hostapd
   ```

## Phase 2: Backend Modifications

1. **Add Connection Monitoring to Server**:
   Add this code to your `src/server/index.js` (or server startup file):

   ```javascript
   // Connection state monitoring
   let isOnline = true;
   const checkConnection = () => {
     require('dns').lookup('google.com', (err) => {
       const wasOnline = isOnline;
       isOnline = !err;
       
       if (wasOnline !== isOnline) {
         console.log(`Connection status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
       }
     });
   };
   
   // Check connection every 30 seconds
   setInterval(checkConnection, 30000);
   checkConnection();
   
   // Add endpoint to check connection status
   app.get('/api/connection-status', (req, res) => {
     res.json({ online: isOnline });
   });
   ```

2. **Modify Photo Capture Endpoint** for offline support:
   In your `/api/photos/capture` endpoint:

   ```javascript
   app.post('/api/photos/capture', async (req, res) => {
     // Original camera capture code here...
     
     // After successful capture, save to local storage regardless of connection
     const localFilepath = path.join(PHOTOS_DIR, filename);
     
     // If online, proceed with normal processing (QR code, thumbnails, etc.)
     if (isOnline) {
       // Your existing QR code generation and processing...
       generateQRAndRespond(req, res, filename, timestamp, processedPhotos);
     } else {
       // Offline simplified response without QR code
       res.json({
         success: true,
         offline: true,
         photo: {
           filename: filename,
           url: `/photos/${filename}`,
           timestamp: Date.now()
         }
       });
     }
   });
   ```

3. **Create Offline Photo Sync** for when connection returns:
   Add a new endpoint:

   ```javascript
   // Handle syncing photos taken in offline mode
   app.post('/api/photos/sync', upload.single('photo'), async (req, res) => {
     if (!req.file) {
       return res.status(400).json({
         success: false,
         error: 'No photo file in request'
       });
     }
     
     try {
       const { timestamp, originalFilename } = req.body;
       const syncedFilename = originalFilename || `synced_${Date.now()}.jpg`;
       const filepath = path.join(PHOTOS_DIR, syncedFilename);
       
       // Save the synced file
       fs.writeFileSync(filepath, req.file.buffer);
       
       // Process the photo (add overlays, create thumbnail, QR code)
       const processedPhotos = await processPhotoWithDualFormats(filepath, syncedFilename);
       
       res.json({
         success: true,
         message: 'Photo synced successfully',
         photo: {
           filename: syncedFilename,
           url: processedPhotos.publicUrl,
           thumbnailUrl: processedPhotos.thumbnailUrl,
           qrUrl: `/qrcodes/qr_${syncedFilename.replace(/\.[^.]+$/, '.png')}`,
           timestamp: timestamp || Date.now()
         }
       });
     } catch (error) {
       console.error('Error syncing offline photo:', error);
       res.status(500).json({
         success: false,
         error: 'Failed to sync photo'
       });
     }
   });
   ```

## Phase 3: Frontend Modifications

1. **Add ConnectionContext** for app-wide connection awareness:
   Create a new file `src/contexts/ConnectionContext.js`:

   ```javascript
   import React, { createContext, useState, useContext, useEffect } from 'react';

   const ConnectionContext = createContext();

   export const ConnectionProvider = ({ children }) => {
     const [isOnline, setIsOnline] = useState(navigator.onLine);
     const [offlinePhotos, setOfflinePhotos] = useState([]);
     
     // Listen for browser online/offline events
     useEffect(() => {
       const handleOnline = () => setIsOnline(true);
       const handleOffline = () => setIsOnline(false);
       
       window.addEventListener('online', handleOnline);
       window.addEventListener('offline', handleOffline);
       
       // Check status against server
       const checkServerConnection = async () => {
         try {
           const response = await fetch('/api/connection-status');
           if (response.ok) {
             const { online } = await response.json();
             setIsOnline(online);
           }
         } catch (error) {
           setIsOnline(false);
         }
       };
       
       // Initial check and periodic rechecks
       checkServerConnection();
       const interval = setInterval(checkServerConnection, 30000);
       
       // Load any stored offline photos
       const storedPhotos = localStorage.getItem('offlinePhotos');
       if (storedPhotos) {
         setOfflinePhotos(JSON.parse(storedPhotos));
       }
       
       return () => {
         window.removeEventListener('online', handleOnline);
         window.removeEventListener('offline', handleOffline);
         clearInterval(interval);
       };
     }, []);
     
     // Save offline photos to localStorage whenever they change
     useEffect(() => {
       localStorage.setItem('offlinePhotos', JSON.stringify(offlinePhotos));
     }, [offlinePhotos]);
     
     // Add a new offline photo
     const addOfflinePhoto = (photo) => {
       setOfflinePhotos((prev) => [...prev, photo]);
     };
     
     // Sync offline photos when online
     const syncOfflinePhotos = async () => {
       if (!isOnline || offlinePhotos.length === 0) return;
       
       const photosToSync = [...offlinePhotos];
       let successCount = 0;
       
       for (const photo of photosToSync) {
         try {
           // Sync logic here
           // ... 
           
           // If successful, remove from offline photos
           setOfflinePhotos(prev => prev.filter(p => p.id !== photo.id));
           successCount++;
         } catch (error) {
           console.error('Failed to sync photo:', error);
         }
       }
       
       return { total: photosToSync.length, success: successCount };
     };
     
     // Try to sync whenever we come online
     useEffect(() => {
       if (isOnline && offlinePhotos.length > 0) {
         syncOfflinePhotos();
       }
     }, [isOnline]);
     
     return (
       <ConnectionContext.Provider value={{
         isOnline,
         offlinePhotos,
         addOfflinePhoto,
         syncOfflinePhotos
       }}>
         {children}
       </ConnectionContext.Provider>
     );
   };

   export const useConnection = () => useContext(ConnectionContext);

   export default ConnectionProvider;
   ```

2. **Modify App.js** to include ConnectionProvider:

   ```javascript
   // In App.js
   import ConnectionProvider from './contexts/ConnectionContext';
   
   function App() {
     return (
       <SoundProvider>
         <CameraProvider apiBaseUrl={API_BASE_URL} apiEndpoint={API_ENDPOINT}>
           <ConnectionProvider>
             <KioskMode />
             <Router>
               <div className="min-h-screen bg-wedding-background">
                 {/* Offline mode indicator */}
                 <OfflineModeIndicator />
                 <AnimatedRoutes />
               </div>
             </Router>
           </ConnectionProvider>
         </CameraProvider>
       </SoundProvider>
     );
   }
   ```

3. **Create OfflineModeIndicator** component:

   ```javascript
   // src/components/OfflineModeIndicator.js
   import React from 'react';
   import { useConnection } from '../contexts/ConnectionContext';
   
   const OfflineModeIndicator = () => {
     const { isOnline, offlinePhotos } = useConnection();
     
     if (isOnline) return null;
     
     return (
       <div className="fixed top-0 left-0 right-0 bg-red-600 text-white p-2 z-50">
         <div className="container mx-auto text-center">
           <p className="font-bold">OFFLINE MODE</p>
           <p className="text-sm">QR codes disabled. Photos will sync when connection is restored.</p>
           {offlinePhotos.length > 0 && (
             <p className="text-xs mt-1">{offlinePhotos.length} photos waiting to sync</p>
           )}
         </div>
       </div>
     );
   };
   
   export default OfflineModeIndicator;
   ```

4. **Update CameraView.js** for offline awareness:

   ```javascript
   // In src/components/CameraView.js
   import { useConnection } from '../contexts/ConnectionContext';
   
   const CameraView = () => {
     // Existing code...
     const { isOnline, addOfflinePhoto } = useConnection();
     
     // Modify handleTakePhoto function
     const handleTakePhoto = async () => {
       // Existing countdown code...
       
       try {
         // Take the photo
         const photo = await takePhoto();
         
         if (photo) {
           if (!isOnline) {
             // Store reference in offline storage
             addOfflinePhoto({
               id: `offline_${Date.now()}`,
               ...photo,
               timestamp: Date.now()
             });
           }
           
           // Navigate to preview page
           navigate('/preview');
         } else {
           // Reset if error...
         }
       } catch (err) {
         // Error handling...
       }
     };
     
     // Continue with existing code...
   };
   ```

5. **Modify QRCodeView.js** to handle offline mode:

   ```javascript
   // In src/components/QRCodeView.js
   import { useConnection } from '../contexts/ConnectionContext';
   
   const QRCodeView = () => {
     // Existing code...
     const { isOnline } = useConnection();
     
     // Add conditional rendering for offline mode
     return (
       <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
         <motion.div
           initial={{opacity: 0, y: 20}}
           animate={{opacity: 1, y: 0}}
           transition={{duration: 0.5}}
           className="w-full max-w-xl px-4 bg-white rounded-xl shadow-elegant overflow-hidden"
         >
           {/* Header with QR icon */}
           <div className="relative">
             <div className="p-4 bg-gradient-to-r from-hindu-secondary to-hindu-accent text-white">
               <div className="flex items-center justify-center">
                 <Icon path={mdiQrcode} size={1.2} className="mr-2"/>
                 <h2 className="text-xl font-bold">
                   {isOnline ? "Scan to View Your Photo" : "Offline Mode"}
                 </h2>
               </div>
             </div>
           </div>
           
           <div className="p-6">
             {/* Photo preview */}
             <div className="aspect-[1.414/1] w-full overflow-hidden rounded-lg shadow-lg relative mb-2">
               {/* Photo display... */}
             </div>
             
             {/* QR code or offline message */}
             {isOnline ? (
               <div className="bg-white border-4 border-wedding-gold rounded-lg shadow-card mb-4 p-4">
                 <img
                   src={qrCodeUrl}
                   alt="QR Code"
                   className="w-64 h-64 mx-auto"
                 />
               </div>
             ) : (
               <div className="bg-gray-100 rounded-lg p-4 text-center">
                 <p className="text-gray-700 mb-2 font-medium">Offline Mode - QR Code Unavailable</p>
                 <p className="text-sm text-gray-500">
                   Your photo has been saved locally and will be available for sharing when connection is restored.
                 </p>
               </div>
             )}
             
             {/* Action buttons */}
             <div className="mt-6 flex flex-col md:flex-row justify-center gap-4">
               <button
                 onClick={handlePrint}
                 disabled={isPrinting}
                 className="btn btn-primary btn-christian w-full md:w-auto flex items-center justify-center"
               >
                 <Icon path={mdiPrinter} size={1} className="mr-2"/>
                 {isPrinting ? 'Printing...' : 'Print Photo'}
               </button>
               
               <button
                 onClick={handleAnotherPhoto}
                 className="btn btn-outline btn-christian-outline w-full md:w-auto flex items-center justify-center"
               >
                 <Icon path={mdiCamera} size={1} className="mr-2"/>
                 Take Another Photo
               </button>
               
               <button
                 onClick={handleBackToHome}
                 className="btn btn-outline btn-hindu-outline w-full md:w-auto flex items-center justify-center"
               >
                 <Icon path={mdiHome} size={1} className="mr-2"/>
                 Back to Home
               </button>
             </div>
           </div>
         </motion.div>
       </div>
     );
   };
   ```

## Phase 4: Testing and Deployment

1. **Local Testing**:
    - Test online mode functionality
    - Manually trigger offline mode with network disconnection
    - Test photo capture in offline mode
    - Test reconnection and sync functionality

2. **Pi Configuration**:
    - Ensure your Raspberry Pi starts all services on boot
    - Configure the client app to start automatically
    - Test hotspot creation and switching

3. **Create a Simple Monitoring Dashboard**:
   ```javascript
   // Simple component for admin monitoring
   const AdminStatus = () => {
     const { isOnline, offlinePhotos } = useConnection();
     const [stats, setStats] = useState(null);
     
     useEffect(() => {
       const fetchStats = async () => {
         try {
           const response = await fetch('/api/admin/stats');
           if (response.ok) {
             setStats(await response.json());
           }
         } catch (error) {
           console.error('Failed to fetch stats:', error);
         }
       };
       
       fetchStats();
       const interval = setInterval(fetchStats, 10000);
       return () => clearInterval(interval);
     }, []);
     
     return (
       <div className="admin-panel p-4 bg-white rounded shadow">
         <h2 className="text-xl font-bold mb-4">System Status</h2>
         
         <div className="grid grid-cols-2 gap-4">
           <div className="stat-box p-3 bg-gray-100 rounded">
             <h3>Connection</h3>
             <p className={isOnline ? "text-green-600" : "text-red-600"}>
               {isOnline ? "Online" : "Offline"}
             </p>
           </div>
           
           <div className="stat-box p-3 bg-gray-100 rounded">
             <h3>Pending Photos</h3>
             <p>{offlinePhotos.length}</p>
           </div>
           
           {stats && (
             <>
               <div className="stat-box p-3 bg-gray-100 rounded">
                 <h3>Total Photos</h3>
                 <p>{stats.totalPhotos}</p>
               </div>
               
               <div className="stat-box p-3 bg-gray-100 rounded">
                 <h3>Disk Space</h3>
                 <p>{stats.diskSpace}</p>
               </div>
             </>
           )}
         </div>
         
         <div className="mt-4">
           <button 
             onClick={() => window.location.reload()}
             className="px-4 py-2 bg-blue-500 text-white rounded"
           >
             Refresh
           </button>
         </div>
       </div>
     );
   };
   ```

4. **Final Deployment Checklist**:
    - Update all packages on both Raspberry Pis
    - Configure automatic startup of all services
    - Set up monitoring and alerts for critical issues
    - Create backup SD card image for emergency recovery
    - Document connection instructions for tablet users