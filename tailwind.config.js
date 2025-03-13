/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                // Christian theme - elegant soft palette with sufficient contrast
                'christian': {
                    primary: '#f9f7f5',       // Soft cream background
                    secondary: '#e8e6e1',     // Light taupe secondary
                    accent: '#b08968',        // Rich golden brown with good contrast
                    accent2: '#d4c1a9',       // Secondary accent - warm beige
                    text: '#3d3d3d',          // Dark gray text (not pure black)
                },
                // Hindu theme - vibrant celebratory colors with good contrast
                'hindu': {
                    primary: '#fff9e6',       // Warm light gold background
                    secondary: '#bc863c',     // Soft pastel orange
                    accent: '#d93f0b',        // Deep vermilion red - traditional wedding color
                    accent2: '#f0b429',       // Rich gold accent
                    text: '#3d3d3d',          // Dark gray text
                },
                // Shared colors
                'wedding': {
                    background: '#f9f7f7',    // Near-white background
                    love: '#d8315b',          // Love/heart color (deep pink)
                    gold: '#c19a5b',          // Gold for decorative elements
                    cream: '#fff8e7',         // Cream color for sections
                    gray: '#6b7280',          // Neutral gray
                },
            },
            fontFamily: {
                'display': ['Cormorant Garamond', 'Georgia', 'serif'],
                'body': ['Montserrat', 'sans-serif'],
                'script': ['Tangerine', 'cursive'],
            },
            boxShadow: {
                'elegant': '0 4px 20px rgba(0, 0, 0, 0.05)',
                'card': '0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                }
            },
        },
    },
    plugins: [],
}