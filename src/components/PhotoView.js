// src/components/PhotoView.js
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../App';

const PhotoView = () => {
    const { photoId } = useParams();
    const navigate = useNavigate();

    // Just directly construct the photo URL from the filename
    const photoUrl = `${API_BASE_URL}/photos/${photoId}`;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-christian-accent/10 to-hindu-secondary/10 p-4">
            <div className="w-full max-w-4xl bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="p-4 bg-christian-accent text-white">
                    <h2 className="text-2xl font-display text-center">Rushel & Sivani's Wedding</h2>
                </div>

                <div className="p-6">
                    {/* Just directly display the photo */}
                    <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border-4 border-wedding-background shadow-md mb-6">
                        <img
                            src={photoUrl}
                            alt="Wedding memory"
                            className="w-full h-full object-contain"
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-center gap-4">
                        <a
                            href={photoUrl}
                            download
                            className="btn btn-primary btn-christian text-center"
                        >
                            Download Photo
                        </a>

                        <button
                            onClick={() => navigate('/')}
                            className="btn btn-outline btn-christian-outline"
                        >
                            Return to Gallery
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 text-center">
                    <p className="text-sm text-gray-500">
                        © {new Date().getFullYear()} • Rushel & Sivani Wedding
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PhotoView;