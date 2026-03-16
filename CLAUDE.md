# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a production-ready wedding photo booth web application running on a Raspberry Pi 5. It's a full-stack system with React frontend, Express backend, dual camera support (DSLR via gphoto2 and webcam), real-time WebSocket streaming, photo processing with filters/overlays, cloud synchronization, and optional thermal printing.

## Common Development Commands

### Frontend (React SPA)
```bash
# From project root: /var/www/wedding-fotobox
npm install          # Install client dependencies
npm start            # Start development server (port 3000)
npm run build        # Build production bundle
npm test             # Run tests
```

### Backend (Express Server)
```bash
# From: /var/www/wedding-fotobox/src/server
npm install          # Install server dependencies
npm start            # Start production server (node index.js)
npm run dev          # Start development server with nodemon
```

### Process Management (Production)
```bash
pm2 list                    # List all PM2 processes
pm2 restart wedding-server  # Restart backend server
pm2 logs wedding-server     # View server logs
pm2 stop wedding-server     # Stop server
pm2 start ecosystem.config.js  # Start from PM2 config
```

### Camera & Streaming
```bash
# Test camera detection
gphoto2 --auto-detect

# Capture test photo
gphoto2 --capture-image-and-download

# Check webcam
ls -l /dev/video*

# Test webcam stream (Python)
python3 ~/webcam_stream.py

# mjpg-streamer service
sudo systemctl status mjpg_streamer@
sudo systemctl restart mjpg_streamer@
```

### WiFi Management
```bash
# NetworkManager WiFi UI (Python Flask)
python3 ~/nm-wifi-manager.py

# NetworkManager CLI
nmcli device wifi list
nmcli device status
```

## Architecture

### Tech Stack
- **Frontend**: React 18.2 + Tailwind CSS 3.4 + Framer Motion
- **Backend**: Express 4.18 + Node.js 18.x
- **Real-time**: WebSocket (ws library) for camera preview streaming
- **Image Processing**: Sharp 0.33 (filters, overlays, resizing)
- **Camera**: gphoto2 (DSLR capture) + fswebcam (webcam preview)
- **Security**: JWT auth, Helmet, rate limiting, express-validator
- **Process Manager**: PM2
- **Printing**: CUPS + Canon Selphy CP1500 (optional)

### Port Configuration
- **5000**: Express backend API
- **3000**: React development server
- **8080**: NetworkManager WiFi manager UI
- **8081**: Python OpenCV webcam stream
- **8000-8001**: mjpg-streamer (alternative streaming)

### Key Backend Files (`/var/www/wedding-fotobox/src/server/`)
- **server.js** (3046 lines): Main Express server - all API endpoints, WebSocket, photo processing logic
- **config.js**: Centralized environment variable configuration
- **photoUploader.js**: Cloud upload with retry logic and offline queueing
- **ecosystem.config.js**: PM2 process configuration
- **.env**: Environment variables (secrets, API keys, configuration)
- **middleware/auth.js**: JWT authentication, admin verification
- **middleware/security.js**: Input validation, rate limiting, file upload security

### Key Frontend Components (`/var/www/wedding-fotobox/src/`)
- **CameraView.js**: Camera preview interface with WebSocket streaming
- **PhotoPreview.js**: Post-capture preview with filter/overlay controls
- **GalleryView.js**: Photo gallery display
- **AdminDashboard.js**: Admin panel (auth required)
- **PhotoFilters.js**: Filter application (grayscale, sepia, dream, romance, forever)
- **OverlayUpload.js**: Custom frame/overlay management
- **CameraContext.js**: Camera state management
- **SoundContext.js**: Sound effects (shutter sounds, etc.)

### Directory Structure
```
/var/www/wedding-fotobox/src/server/public/
├── photos/
│   ├── originals/        # Raw captures from camera
│   ├── print/            # A5 landscape (1.414:1) for thermal printer
│   └── [processed]       # Final photos (1920x1440)
├── qrcodes/              # Generated QR codes per photo
├── overlays/             # Custom frames/overlays
├── thumbnails/           # 400x300 WebP thumbnails
└── preview/              # Preview images

/var/www/wedding-fotobox/src/server/
├── data/
│   ├── templates/        # Frame template configs (JSON)
│   └── upload-tracking/  # Cloud upload status tracking
└── logs/                 # Server logs (rotated, max 30 files)
```

## Photo Processing Workflow

When a photo is captured (`POST /api/photos/capture`):

1. **Capture**: gphoto2 executes, saves to `originals/`
2. **Dual Format Processing** (`processPhotoWithDualFormats`):
   - Standard: Resized to 1920x1440 for gallery/social
   - Print: Resized to A5 landscape (1.414:1) for Selphy printer
3. **Overlay Application** (if configured):
   - `applyOverlayToImage()`: Applies frame to both formats
   - `applyTemplatedOverlay()`: Template-based positioning
   - `processInstagramPhoto()`: Instagram-style frames
4. **Filter Application** (optional via `POST /api/photos/:filename/filter`):
   - grayscale, sepia, dream, romance, forever
5. **Thumbnail Generation**: 400x300 WebP for gallery
6. **QR Code Generation**: Unique QR per photo for sharing
7. **Mosaic Generation**: Every 3rd photo, creates composite image
8. **Cloud Upload**: Queued to HOME_SERVER_URL with retry (5 attempts)
9. **Printing** (optional): Queued via CUPS to Selphy printer

## Critical API Endpoints

### Photo Operations
- `POST /api/photos/capture` - Trigger camera capture
- `GET /api/photos` - List all photos with metadata
- `DELETE /api/photos/:filename` - Delete photo
- `POST /api/photos/:filename/filter` - Apply filter
- `POST /api/photos/:photoId/overlay` - Apply frame/overlay

### Admin (Protected - JWT Required)
- `POST /api/auth/login` - Admin login (returns JWT)
- `POST /api/admin/overlays` - Upload custom overlay
- `GET /api/admin/overlays` - List overlays
- `POST /api/admin/frame-templates` - Save frame template config
- `DELETE /api/admin/frame-templates/:overlayName` - Delete template

### Printing
- `POST /api/photos/print` - Queue photo for printing
- `GET /api/print-status/:jobId` - Check print job status
- `GET /api/printer-status` - Get printer availability

### System
- `GET /api/status` - Camera/system status
- `GET /api/mosaic` - Get current mosaic image
- `GET /qrcodes/:filename` - Serve QR code

## WebSocket Communication

**Server Setup**: `setupWebSocketServer()` in server.js
**Client Connection**: Socket.io-client in CameraView.js

**Commands**:
- `startPreview` - Client requests camera preview stream
- `stopPreview` - Stop streaming
- `ping` - Keep-alive

**Server Broadcasts**:
- `previewStatus` - Stream status updates
- Frame data - Base64 JPEG frames (~100-200ms intervals)

**Preview Process**: fswebcam captures frame → converts to base64 → broadcasts via WebSocket → client displays in `<img>`

## Environment Configuration (.env)

Required variables in `/var/www/wedding-fotobox/src/server/.env`:

```bash
# Server
PORT=5000
NODE_ENV=production
BASE_URL=http://your-domain:5000
CLIENT_URL=http://your-domain

# Security
JWT_SECRET=<secure-random-key>
ADMIN_PASSWORD_HASH=<bcrypt-hash>
SESSION_SECRET=<secure-random-key>

# Camera
WEBCAM_DEVICE=/dev/video0

# Printing (optional)
PRINTING_ENABLED=true
PRINTER_NAME=SelphyCP1500

# Cloud Upload (optional)
HOME_SERVER_ENABLED=true
HOME_SERVER_URL=https://photo-server.com
HOME_SERVER_API_KEY=your-api-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_PHOTO_CAPTURE_MAX=10

# Logging
LOG_LEVEL=info
```

## Security Architecture

### Authentication
- JWT tokens for admin routes (all `/api/admin/*`)
- bcrypt password hashing (admin login)
- Token verification middleware: `verifyToken`, `isAdmin`

### Input Validation
- express-validator for all inputs
- `sanitizeFilename()` prevents path traversal
- File type validation (MIME checking)
- `validatePhotoId()` ensures format compliance

### Rate Limiting
- General API: 100 req/min
- Photo capture: 10 captures/min (prevents abuse)
- Login: Brute force protection via `loginLimiter`

### HTTP Security
- Helmet.js security headers (HSTS, CSP, X-Frame-Options)
- CORS whitelist configuration
- 10MB file upload limit

## Photo Uploader System

**PhotoUploader Class** (`photoUploader.js`) manages cloud synchronization:

- **Offline Queue**: Photos queued locally if server unavailable
- **Retry Logic**: 5 retries with 30-second intervals
- **Persistence**: JSON tracking files survive restarts
- **Connection Checking**: Periodic connectivity verification
- **Status Tracking**: Upload status via `/api/upload-status`

## PM2 Configuration

**Config**: `/var/www/wedding-fotobox/src/server/ecosystem.config.js`
**Process**: `wedding-server`
- Script: `src/server/server.js`
- Memory limit: 500MB
- Auto-restart: enabled
- Mode: fork

## Diagnostics & Logging

**Startup Diagnostics** (`runDiagnostics()` in server.js):
- Camera availability (gphoto2)
- Webcam device presence
- mjpg-streamer service status
- Directory permissions
- Printer availability (CUPS)
- Network connectivity

**Logging**:
- Levels: info, warn, error, debug
- Format: Timestamp + level + component + message
- Rotation: Max 30 files, 10MB per file
- Location: `/var/www/wedding-fotobox/src/server/logs/`

## Important Implementation Notes

### Photo Capture Concurrency
- Server uses `captureInProgress` flag to prevent concurrent captures
- Only one photo can be captured at a time
- **Camera cooldown**: `CAMERA_COOLDOWN_MS = 4000` — after gphoto2 exits, a 4-second cooldown is enforced before the next capture is allowed. Prevents `PTP Device Busy (0x2019)` errors on rapid consecutive shots. Returns HTTP 429 with `"Camera is cooling down. Please wait X seconds."` if triggered. `lastCaptureTime` is stamped inside the gphoto2 exec callback (not before), so the 4 seconds start from when the camera USB is actually free.

### Filter Effects
- **grayscale**: Standard desaturation
- **sepia**: Warm vintage tone
- **dream**: High brightness, low contrast, high saturation
- **romance**: Warm sepia with color adjustments
- **forever**: High contrast + vignette effect

### Overlay System
- Supports PNG overlays with transparency
- Template-based positioning (x, y, rotation, scale)
- Applied to both standard and print formats
- Instagram-style frames via `processInstagramPhoto()`

### Mosaic Generation
- Triggered every 3rd photo capture
- Tiles all photos in grid layout
- Saved as `composite.jpg`
- Endpoint: `GET /api/mosaic`

### Print Format
- A5 landscape (1.414:1 aspect ratio)
- Optimized for Canon Selphy CP1500
- Separate processing pipeline from gallery photos
- Stored in `photos/print/` directory
- **Resize uses `fit: 'cover'`, NOT `fit: 'contain'`** — `cover` fills the full A5 frame and crops the small aspect-ratio difference (Canon 3:2 vs A5 ~1.41:1) from centre. `contain` would add white bars at top/bottom (landscape) or left/right (portrait). Do not change this back.
- Thumbnails (`generateThumbnail()`) also use `fit: 'cover'` for the same reason — do not change to `contain`.
- **Frame overlay is intentionally disabled** in `processPhotoWithDualFormats()` (`if (false)` block). The overlay IS applied at print time (`POST /api/photos/print`). Public/gallery photos are intentionally unframed — they are a plain copy of the print version. Active frame config: `data/active-frame.json`, frame file at `public/overlays/`.

### Countdown UI — SMILE! Text
- Font size: `clamp(36px, 7vw, 80px)` — deliberately smaller than the number countdown. `7vw` keeps it within the narrow portrait viewfinder (2:3 aspect ratio). Do not increase to `10vw` or above — it will overflow and get clipped on small displays.
- Letter spacing animates from `0em` → `0.18em`. Do not increase to `0.3em` — causes clipping in portrait mode on small screens.
- Has `maxWidth: 100%`, `padding: 0 12px`, `box-sizing: border-box` as overflow guards.

## Troubleshooting

### Camera Issues
1. Check detection: `gphoto2 --auto-detect`
2. Verify no other process is using camera: `ps aux | grep gphoto`
3. Check server logs: `pm2 logs wedding-server`
4. Restart PM2 process: `pm2 restart wedding-server`
5. **PTP Device Busy (0x2019)**: Camera was triggered again too quickly. The 4-second cooldown (`CAMERA_COOLDOWN_MS`) prevents this in normal use. If it still happens, check if another process is using gphoto2 or USB. System falls back to webcam snapshot automatically if gphoto2 fails.

### WebSocket Preview Not Working
1. Check webcam device: `ls -l /dev/video0`
2. Verify fswebcam installed: `which fswebcam`
3. Test manual capture: `fswebcam test.jpg`
4. Check browser console for WebSocket errors

### Printing Issues
1. Check printer status: `lpstat -p -d`
2. Verify CUPS running: `systemctl status cups`
3. Check printer name matches .env: `lpstat -a`
4. View print queue: `lpstat -o`

### Cloud Upload Failures
1. Check HOME_SERVER_URL reachability
2. Verify API key in .env
3. Check upload tracking: `ls src/server/data/upload-tracking/`
4. Review logs for retry attempts

### Permission Errors
1. Ensure directories writable: `ls -la src/server/public/`
2. Check ownership: `chown -R rushel:rushel /var/www/wedding-fotobox`
3. Verify PM2 running as correct user: `pm2 list`
