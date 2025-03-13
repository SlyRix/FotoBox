// client/src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import CameraView from './components/CameraView';
import PhotoPreview from './components/PhotoPreview';
import QRCodeView from './components/QRCodeView';
import GalleryView from './components/GalleryView';
import { CameraProvider } from './contexts/CameraContext';
import './styles/tailwind.css';

// Global config for API URL - accessible throughout the app
export const API_BASE_URL = 'http://192.168.1.70:5000';
export const API_ENDPOINT = `${API_BASE_URL}/api`;

function App() {
  const [cameraStatus, setCameraStatus] = useState({
    status: 'unknown',
    camera: false,
    message: 'Checking camera status...'
  });

  useEffect(() => {
    // Check camera status when app loads
    fetch(`${API_ENDPOINT}/status`)
        .then(response => response.json())
        .then(data => {
          setCameraStatus(data);
        })
        .catch(error => {
          console.error('Error checking camera status:', error);
          setCameraStatus({
            status: 'error',
            camera: false,
            message: 'Failed to connect to server'
          });
        });
  }, []);

  return (
      <CameraProvider apiBaseUrl={API_BASE_URL} apiEndpoint={API_ENDPOINT}>
        <Router>
          <div className="min-h-screen bg-wedding-background">
            {/* Camera status indicator */}
            <div className={`fixed top-0 left-0 right-0 p-2 text-center text-sm ${
                cameraStatus.camera ? 'bg-green-500' : 'bg-red-500'
            } text-white z-50`}>
              {cameraStatus.message}
            </div>

            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/camera" element={<CameraView />} />
              <Route path="/preview" element={<PhotoPreview />} />
              <Route path="/qrcode" element={<QRCodeView />} />
              <Route path="/gallery" element={<GalleryView />} />
            </Routes>
          </div>
        </Router>
      </CameraProvider>
  );
}

export default App;