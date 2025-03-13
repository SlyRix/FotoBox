# Wedding FotoBox 💒 📸

A full-stack photo booth web application for weddings, allowing guests to take photos, view them via QR codes, and access a shared gallery of memories.

![React](https://img.shields.io/badge/React-18.2.0-61DAFB?logo=react)
![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4.17-38B2AC?logo=tailwind-css)
![Express](https://img.shields.io/badge/Express-4.18.2-000000?logo=express)
![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?logo=node.js)

## 🌟 Features

- **Camera Integration**: Captures photos using a connected camera via gphoto2
- **Photo Preview**: Allows users to preview their photos before saving
- **QR Code Generation**: Creates QR codes for each photo for easy mobile viewing
- **Photo Gallery**: Displays all photos taken during the event
- **Responsive Design**: Works on all device sizes for guest convenience
- **Elegant Wedding Theme**: Beautiful UI designed around wedding colors and aesthetics

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- [gphoto2](http://gphoto.org/) installed on your system for camera interaction
- A compatible camera (check gphoto2 documentation for supported devices)

## 🚀 Installation

### Client Setup

1. Clone the repository
   ```
   git clone https://github.com/yourusername/wedding-fotobox.git
   cd wedding-fotobox
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following content:
   ```
   REACT_APP_API_URL=http://localhost:5000/api
   ```

4. Start the development server
   ```
   npm start
   ```

### Server Setup

1. Navigate to the server directory
   ```
   cd src/server
   ```

2. Install server dependencies
   ```
   npm install
   ```

3. Start the server
   ```
   npm start
   ```

## 📁 Project Structure

```
wedding-fotobox/
├── public/                  # Static files
├── src/                     # React source files
│   ├── components/          # React components
│   │   ├── CameraView.js    # Camera interface
│   │   ├── GalleryView.js   # Photo gallery
│   │   ├── HomePage.js      # Landing page
│   │   ├── PhotoPreview.js  # Photo preview
│   │   └── QRCodeView.js    # QR code display
│   ├── contexts/            # React contexts
│   │   └── CameraContext.js # Camera state management
│   ├── server/              # Backend server
│   │   ├── config.js        # Server configuration
│   │   ├── index.js         # Server entry point
│   │   └── package.json     # Server dependencies
│   ├── styles/              # CSS styles
│   │   └── tailwind.css     # Tailwind CSS file
│   ├── App.js               # Main React component
│   └── index.js             # React entry point
├── tailwind.config.js       # Tailwind CSS configuration
├── package.json             # Client dependencies
└── README.md                # This file
```

## 📷 Camera Setup

1. Connect your camera to the computer via USB
2. Ensure gphoto2 can detect your camera by running:
   ```
   gphoto2 --auto-detect
   ```
3. The server will automatically attempt to connect to the camera on startup

## 🎨 Customization

### Wedding Colors and Theme

You can customize the wedding theme by modifying the `tailwind.config.js` file:

```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        'christian': {
          primary: '#f9f7f5',
          secondary: '#e8e6e1',
          accent: '#b08968',
          // ...
        },
        'hindu': {
          primary: '#fff9e6',
          secondary: '#bc863c',
          accent: '#d93f0b',
          // ...
        },
        // ...
      }
    }
  }
}
```

### Wedding Details

Update the names and event details in `HomePage.js`:

```jsx
// src/components/HomePage.js
<h1 className="text-5xl md:text-6xl font-script text-wedding-love mb-4">
  Your Names Here
</h1>
```

## 📱 Usage Instructions

1. **Home Page**: Visitors can choose to take a photo or view the gallery
2. **Camera View**: Users can take a photo with a countdown timer
3. **Preview**: After taking a photo, users can choose to keep or retake it
4. **QR Code**: A QR code is generated for each photo, which users can scan to view or download the photo
5. **Gallery**: All photos are displayed in a gallery, sorted by most recent

## 🛠️ Technical Implementation

- **Frontend**: React with Hooks, Context API for state management
- **Styling**: TailwindCSS for responsive design
- **Animations**: Framer Motion for smooth transitions
- **Backend**: Express.js for API endpoints
- **Camera Control**: gphoto2 for camera integration
- **QR Codes**: Generated with qrcode library

## 🔄 API Endpoints

- `GET /api/photos` - Retrieve all photos
- `POST /api/photos/capture` - Take a new photo
- `DELETE /api/photos/:filename` - Delete a photo
- `POST /api/photos/print` - (Future feature) Send a print request
- `GET /api/status` - Check camera connection status

## 🚧 Future Enhancements

- [ ] Photo printing functionality
- [ ] Photo filters and effects
- [ ] User authentication for admin controls
- [ ] Cloud backup of photos
- [ ] Email/SMS sharing options
- [ ] Custom photo frames and stickers

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 👏 Acknowledgements

- [gphoto2](http://gphoto.org/) for camera interaction
- [TailwindCSS](https://tailwindcss.com/) for styling
- [React](https://reactjs.org/) for the frontend framework
- [Express](https://expressjs.com/) for the backend server
- [QRCode](https://github.com/soldair/node-qrcode) for QR code generation

---

Created with ❤️ for Rushel & Sivani's Wedding