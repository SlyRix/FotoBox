// Updated App.js with transition animations and sound provider
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

// Import enhanced components
import HomePage from './components/HomePage';
import CameraView from './components/CameraView';
import PhotoPreview from './components/PhotoPreview';
import QRCodeView from './components/QRCodeView';
import PhotoView from './components/PhotoView';
import GalleryView from './components/GalleryView';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import HeartSpinner from './components/HeartSpinner';
import KioskMode from './components/KioskMode';
import { CameraProvider } from './contexts/CameraContext';
import { SoundProvider } from './contexts/SoundContext';
import './styles/tailwind.css';

// Global config for API URL - accessible throughout the app
export const API_BASE_URL = 'https://fotobox-api.slyrix.com';
export const API_ENDPOINT = `${API_BASE_URL}/api`;

// Simple admin route guard component
const AdminRoute = ({ children }) => {
    const isAdmin = sessionStorage.getItem('isAdmin') === 'true';

    if (!isAdmin) {
        return <Navigate to="/admin-login" replace />;
    }

    return children;
};

// Animated routes wrapper
const AnimatedRoutes = () => {
    const location = useLocation();

    return (
        <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
                {/* Main routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/camera" element={<CameraView />} />
                <Route path="/preview" element={<PhotoPreview />} />
                <Route path="/qrcode" element={<QRCodeView />} />
                <Route path="/gallery" element={<GalleryView />} />

                {/* Photo viewing route with explicit path parameter to prevent loops */}
                <Route path="/photo/:photoId" element={<PhotoView />} />

                {/* Admin routes */}
                <Route path="/admin-login" element={<AdminLogin />} />
                <Route
                    path="/admin"
                    element={
                        <AdminRoute>
                            <AdminDashboard />
                        </AdminRoute>
                    }
                />

                {/* Catch all route - redirect to home */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </AnimatePresence>
    );
};

function App() {
    return (
        <SoundProvider>
            <CameraProvider apiBaseUrl={API_BASE_URL} apiEndpoint={API_ENDPOINT}>
                <KioskMode />

                <Router>
                    <div className="min-h-screen bg-wedding-background">
                        <AnimatedRoutes />
                    </div>
                </Router>
            </CameraProvider>
        </SoundProvider>
    );
}

export default App;