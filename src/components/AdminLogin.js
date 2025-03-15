// AdminLogin.js - Access for wedding organizers/photographers
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const AdminLogin = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    // Simple password authentication - in a real app, use secure authentication
    const handleLogin = (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Simple timeout to simulate authentication
        setTimeout(() => {
            // Example admin password - in production, use proper authentication
            if (password === 'weddingadmin2025') {
                // Store admin status in sessionStorage
                sessionStorage.setItem('isAdmin', 'true');
                navigate('/admin');
            } else {
                setError('Invalid password');
            }
            setIsLoading(false);
        }, 800);
    };

    const handleBackToHome = () => {
        navigate('/');
    };

    return (
        <div className="min-h-screen bg-wedding-background flex flex-col items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md bg-white rounded-lg shadow-lg overflow-hidden"
            >
                <div className="p-4 bg-christian-accent text-white text-center">
                    <h2 className="text-xl font-bold">Admin Access</h2>
                </div>

                <form onSubmit={handleLogin} className="p-6">
                    <div className="mb-6">
                        <label htmlFor="password" className="block text-gray-700 text-sm font-medium mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-christian-accent"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter admin password"
                            required
                        />
                    </div>

                    {error && (
                        <div className="mb-4 p-2 bg-red-100 text-red-700 rounded text-sm">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-between items-center">
                        <button
                            type="button"
                            onClick={handleBackToHome}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            Back to Home
                        </button>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`btn btn-primary btn-christian px-4 py-2 ${
                                isLoading ? 'opacity-70 cursor-not-allowed' : ''
                            }`}
                        >
                            {isLoading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Logging in...
                                </span>
                            ) : (
                                'Login'
                            )}
                        </button>
                    </div>
                </form>
            </motion.div>

            <p className="mt-8 text-xs text-gray-500">
                This area is restricted to wedding organizers and photographers.
            </p>
        </div>
    );
};

export default AdminLogin;