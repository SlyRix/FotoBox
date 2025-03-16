// Updated App.js - Added PhotoView component for QR code landing page
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import HomePage from './components/HomePage';
import CameraView from './components/CameraView';
import PhotoPreview from './components/PhotoPreview';
import QRCodeView from './components/QRCodeView';
import PhotoView from './components/PhotoView';
import AdminLogin from './components/AdminLogin';
import AdminDashboard from './components/AdminDashboard';
import { CameraProvider } from './contexts/CameraContext';
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

function App() {
    return (
        <CameraProvider apiBaseUrl={API_BASE_URL} apiEndpoint={API_ENDPOINT}>
            <Router>
                <div className="min-h-screen bg-wedding-background">
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/camera" element={<CameraView />} />
                        <Route path="/preview" element={<PhotoPreview />} />
                        <Route path="/qrcode" element={<QRCodeView />} />
                        <Route path="/photo/:photoId" element={<PhotoView />} />
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
                </div>
            </Router>
        </CameraProvider>
    );
}

export default App;