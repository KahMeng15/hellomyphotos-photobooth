# Comprehensive PRD: hellomyphoto - Self-Hosted Photo Booth System

You are an expert software architect and full-stack engineer. Build a cross-platform, self-hosted, two-node photo booth system designed for zero-wait guest queuing and production-grade event reliability.

Follow this comprehensive Product Requirements Document (PRD) and Technical Specification exactly.

---

## Part 1: Product Requirements Document (PRD)

### 1.1 Project Objective

To build a zero-lag event photo booth system composed of:

1. **A Capture Client:** Runs on Mac/Windows. Supports Webcams or DSLR cameras via `gphoto2`, captures arrays of photos (1–4 per session) with custom frame overlays and local offline queuing.
2. **An Operator/Server Node:** A self-hosted Docker backend paired with a private, authenticated web dashboard. The operator handles sharing (QR codes, AirDrop, native file sync), asset management, manual controls, and event configuration on a separate device, allowing the next guest to immediately use the capture booth without interruption.

---

### 1.2 Core User Journeys

#### Journey 1: The Guest
- Walks up to the booth kiosk
- Selects a frame from a carousel (or operator pre-selects)
- Hears audio countdown (3…2…1…)
- Sees visual countdown on screen
- Camera captures (single or multi-shot array)
- Sees preview of captured photos
- Optionally confirms or retakes
- Walks away; booth resets for next guest within 2 seconds
- Later receives QR code or AirDrop link for their photos

#### Journey 2: The Operator
- Sits nearby with tablet/laptop loaded with Authenticated Web Dashboard
- Monitors incoming images in real-time via WebSocket
- Can manually override frame selection if needed
- Can trigger manual reshot if guest photo failed
- Shows QR code to guest or uses native AirDrop/QuickShare
- Can switch between multiple events if running same-day sessions
- Can pause/resume the booth during breaks
- Manages frame uploads and event configuration
- Exports session data, photos, and analytics at event end
- Accesses server health diagnostics if issues arise

---

### 1.3 System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EVENT NETWORK (WiFi/Ethernet)                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────┐        ┌──────────────────────────┐  │
│  │   CAPTURE BOOTH (Node 1) │        │  OPERATOR HUB (Node 2)   │  │
│  │   ├─ Electron App        │────────│  ├─ Docker Backend       │  │
│  │   ├─ WebRTC Webcam       │◄──────►│  ├─ Express + WebSocket  │  │
│  │   ├─ gphoto2 Bridge      │  HTTP  │  ├─ Image Pipeline       │  │
│  │   ├─ Local Queue (SQLite)│  /     │  ├─ Web Dashboard        │  │
│  │   └─ Countdown UI        │ WebRTC │  └─ Auth + Frame Storage │  │
│  │                          │        │                          │  │
│  └──────────────────────────┘        └──────────────────────────┘  │
│                                                                       │
│   OPTIONAL: Dual-Booth Failover Configuration                       │
│   ┌──────────────────────────┐                                      │
│   │   CAPTURE BOOTH 2        │                                      │
│   │   (Hot standby or active)├──────────────────────────┐           │
│   └──────────────────────────┘                          │           │
│                                           Shared Server │           │
│                                           (Load balance)│           │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 1.4 Feature Matrix

#### Node 1: Capture Booth (Electron Desktop Client)

##### Core Capture Features
* **Toggleable Input Source:** 
  - **Webcam Mode:** Uses HTML5 WebRTC with direct browser camera access; fallback to standard `getUserMedia()` API
  - **DSLR Mode:** Spawns `gphoto2 --capture-movie --stdout` for live preview; captures via `gphoto2 --capture-image-and-download`
  - **Hardware auto-detect:** On app startup, probe for connected cameras; default to webcam if no DSLR found
  - **Mid-session fallback:** If DSLR disconnects, gracefully revert to webcam with operator notification

##### Session & Frame Configuration
* **Session Configurator:** 
  - Hidden or hotkey-accessible (e.g., `Ctrl+Shift+S` on Windows, `Cmd+Shift+S` on Mac) setup screen
  - Configurable parameters per event:
    - Number of pictures per session (1, 2, 3, or 4)
    - Countdown delay in seconds (3–10 seconds)
    - Photo capture interval (e.g., 500ms between shots for rapid-fire)
    - Auto-retry on failure (yes/no)
    - Audio feedback on/off
  - Settings persist locally in a JSON config file
  - Ability to save/load preset configurations (e.g., "Wedding Setup", "Corporate Event")

* **Frame Selector Carousel:** 
  - On-screen UI overlay with transparent `.png` frame graphics
  - Frames fetched dynamically from server at app startup and cached locally
  - Swipe/arrow-key navigation to browse available frames
  - Large preview of selected frame with countdown timer display
  - Frame metadata (name, dimensions, compatibility) displayed to operator for diagnostics
  - Fallback to "None" (no frame) if server frames unavailable

##### Photo Capture & Processing
* **Live Preview:** 
  - Full-screen preview of what the camera sees before countdown
  - Frame overlay renders in real-time on preview canvas
  - Guest can see themselves in frame before committing
  - Countdown timer displays large and centered
  - Audio beeps: -3s, -2s, -1s, then click/shutter sound at 0s

* **Capture Sequence:**
  - On countdown completion, trigger hardware capture
  - For single-shot: capture 1 photo
  - For multi-shot (2–4): capture with configurable interval (e.g., 500ms apart)
  - Progress indicator shows "Shot 1 of 4… Shot 2 of 4…"
  - Visual + audio confirmation on each shot

* **Photo Preview & Approval:**
  - After capture, display all captured images in a grid
  - Guest can confirm ("Looks good!") or retake ("Try again")
  - If retake: reset carousel, allow new frame selection, restart countdown
  - Maximum retry attempts configurable (e.g., 3 tries per guest)

##### Offline Resilience & Network Handling
* **Offline Queue System:**
  - Capture local SQLite database to persist pending uploads
  - Each captured session stored as JSON metadata + image file paths
  - When network disconnects, booth UI displays "Offline Mode" banner
  - Guest can still capture photos; they queue locally
  - Queued photos show countdown timer for upload retry (exponential backoff: 5s, 10s, 20s, 60s)
  - On reconnect, auto-resume uploads; operator notified of backlog

* **Network Monitoring:**
  - Booth pings server every 10 seconds (lightweight health check endpoint)
  - If unreachable for >30s, display warning UI ("Connecting to server…")
  - If unreachable for >2 minutes, allow operator to manually force "offline capture mode"
  - Display estimated queue size and retry status to guest/operator

* **Server Unreachability Fallback:**
  - If server unavailable, capture client still functions fully offline
  - Photo arrays captured and queued locally
  - Operator can use manual USB/file-sync to transfer photos (documented fallback)

##### Error Handling & Recovery
* **Camera Disconnection:**
  - Detect if USB camera unplugged mid-session
  - Gracefully stop any in-progress capture
  - Notify guest: "Camera disconnected. Please let the operator know."
  - Provide operator button to "Retry with Webcam" or "Check Camera"
  - Auto-retry gphoto2 connection every 5 seconds until camera reconnects

* **Crash Recovery:**
  - On unexpected app crash, SQLite queue persists
  - App restarts; automatically resumes pending uploads
  - Operator dashboard shows: "Resumed 3 queued sessions"

* **User Interruption:**
  - If guest walks away mid-countdown, timer stops; booth resets after 30s idle
  - If operator force-closes app, queued photos persist and resume on restart

##### Zero-Lag Handoff
* **Submission Pipeline:**
  - Once photo array is completed and approved by guest, immediately pack images into buffer
  - Trigger background `POST /api/upload` request (non-blocking)
  - Display "Uploading… (2 of 3 photos)" progress bar
  - UI resets to idle screen + frame carousel within 1–2 seconds
  - Next guest can select frame while upload completes in background
  - If upload fails, falls back to offline queue

* **Performance Target:**
  - Reset to ready state in <2 seconds for webcam
  - Reset to ready state in <3 seconds for DSLR (accounts for file transfer)

---

#### Node 2: Server & Operator Hub (Self-Hosted Docker Stack)

##### Authentication & Access Control
* **Auth Wall:** 
  - Entire web UI gated behind secure authentication
  - Unauthenticated visitors to root URL redirected to `/login`
  - Login page accepts `OPERATOR_PASSWORD` (environment variable)
  - Password stored as bcrypt hash in server config
  - Session management via secure HTTP-only cookies OR JWT tokens (specify approach)
  - Session timeout: 4 hours of inactivity; auto-logout with warning at 3:50
  - Multiple simultaneous operators supported (separate sessions)

##### Real-Time Operator Dashboard
* **Live Media Feed:**
  - WebSocket-powered real-time display of incoming photos
  - New images appear instantly as they're processed
  - Grid layout: most recent photo largest; previous photos in timeline below
  - Operator can click any photo to expand and inspect quality
  - Shows metadata: timestamp, frame used, capture mode (webcam/DSLR), session ID

* **Operator Control Panel:**
  - **Manual Frame Override:** Dropdown to force a different frame on the booth client for next session (overrides guest selection)
  - **Manual Reshot Button:** "Trigger Reshot" button that sends signal to booth client to restart countdown without guest interaction
  - **Offline Queue Monitor:** Visual indicator if booth is offline; shows queued items awaiting upload
  - **Session Pause/Resume:** Pause booth to prevent new captures during breaks; resume when ready
  - **Event Selector:** Dropdown to switch between multiple concurrent events (if running same-day sessions)
  - **Booth Status Indicator:** Green (ready), Yellow (uploading/processing), Red (offline/error)

##### Image Processing Pipeline
* **Automated Editing Sequence:**
  1. Receive raw image(s) from booth client
  2. Auto-orient using EXIF metadata (handles DSLR rotations)
  3. Resize to match chosen frame canvas dimensions
  4. Composite frame PNG graphic as overlay layer
  5. Apply optional watermark/branding (if configured per event)
  6. Transcode to optimized `.webp` format (75% quality, effort: 4)
  7. Generate derivative formats (thumbnail, social-media sizes)
  8. Commit all outputs to persistent storage (`./storage/photos/`)
  9. Emit WebSocket event to operator dashboard with final URLs

* **Processing Queue:**
  - Async job queue (use Bull/RabbitMQ if high volume expected; simple in-memory queue for small events)
  - Max concurrent processing jobs: 3 (configurable)
  - Queue depth displayed in operator dashboard
  - Processing time logged for analytics

##### Dynamic Layout Engines
* **Photo Strip (Vertical Layout):**
  - Automatically stitches 3 or 4 pictures vertically with clean borders
  - Configurable spacing between photos (e.g., 20px padding)
  - Configurable strip background (white, transparent, branded color)
  - Output size: 1200×3600px (standard photo strip dimensions)
  - Format: `.webp` (75% quality)
  - Accessible via unique URL and QR code

* **GIF Builder (Animated Loop):**
  - Stitches frames into animated `.gif` loop
  - Frame delay: 500ms per image (adjustable)
  - Looping behavior: infinite loop
  - Output size: matches individual photo dimensions (e.g., 600×800px)
  - Optimization: reduce color palette if needed to keep file <5MB
  - Accessible via unique URL and QR code
  - Alternative: WebP animated format for better compression

* **Single Photo View:**
  - Individual photo without frame (raw capture)
  - Framed photo (with overlay applied)
  - Thumbnail version (for dashboard grid)
  - Full-resolution version (for download)

##### Real-Time Broadcast Hub
* **WebSocket Server:**
  - Uses Socket.io or standard WS library
  - Emits events:
    - `new-media` – Fresh photo/strip/GIF generated; includes URL, type, metadata
    - `booth-status` – Booth online/offline/processing status
    - `queue-update` – Offline queue depth changed
    - `error` – Processing or capture error occurred
  - Clients: operator dashboard and (optionally) guest public viewing page
  - Connection pooling: supports 5+ simultaneous operator sessions

##### Native Share Hooks
* **Web Share API Integration:**
  - "Share" button on operator dashboard triggers system-level sharing:
    - **macOS:** Uses Web Share API → Apple Share Sheet → AirDrop to nearby devices
    - **iOS:** Uses Web Share API → iOS Share Sheet → Messages, Mail, etc.
    - **Android:** Uses Web Share API → Android Share Sheet → Google Drive, Messenger, etc.
    - **Windows:** Falls back to "Copy Link" + manual paste (Windows Web Share API limited)
  - **Share Metadata:**
    - Title: "Your Booth Photo – [Event Name]"
    - Text: "Here's your photo from the photo booth!"
    - URL: Short-link or full QR-encoded URL
    - Optionally attach thumbnail image

* **Alternative Share Methods:**
  - **QR Code Display:** Operator taps "Show QR" → full-screen QR code for guest to scan
  - **Email Link:** Operator enters guest email → auto-sends link (requires SMTP server configuration)
  - **Direct File Download:** "Download as ZIP" → packages all photos for event (batch export)
  - **Bluetooth/NFC:** Optional: if booth device has NFC, guest taps to receive link

##### Asset Management Portal
* **Frame Upload & Management:**
  - Admin screen accessible from operator dashboard (gated by same auth)
  - Upload new transparent `.png` graphic frames (drag-and-drop)
  - Specify frame metadata: name, width, height, category (e.g., "Wedding", "Birthday")
  - Preview frame on sample photo before saving
  - Delete unused frames with confirmation
  - Version history: keep previous frames for past events
  - Storage: persistent Docker volume `./storage/frames/`

* **Event Configuration:**
  - Create/edit events: name, date, default photo count, frame set, operator notes
  - Enable/disable specific frames per event
  - Set watermark text or logo per event
  - Configure share message template ("Your photo from [EventName]!")
  - Schedule events: booth auto-activates at start time, optional auto-pause at end time

* **Branding Management:**
  - Upload custom logo/watermark PNG
  - Set default background color for photo strips
  - Configure footer text ("Happy [Event Name] 2026!")
  - Test rendering on sample photo before applying to all

##### Analytics & Reporting
* **Session Logging:**
  - Log every capture session: timestamp, frame used, photo count, capture mode, duration
  - Log every upload: success/failure, processing time, file sizes
  - Log every share action: method (QR, AirDrop, email), timestamp
  - Store logs in persistent database (SQLite or PostgreSQL)

* **Operator Dashboard Stats:**
  - Total photos captured (session)
  - Total photos shared (broken down by method: QR, AirDrop, email, download)
  - Error count + error details
  - Average processing time per photo
  - Booth uptime % during event
  - Peak capture rate (photos per minute)

* **Post-Event Summary Report:**
  - Exportable PDF or JSON
  - Total guests served (estimated by session count)
  - Popular frames (chart)
  - Share method breakdown (pie chart)
  - Processing performance metrics
  - Estimated engagement rate (shares / captures)
  - Timeline of captures (graph)

##### Server Health & Diagnostics
* **Health Check Endpoint:**
  - `/api/health` – Returns JSON: `{ status: "ok", uptime: 3600, storage: "85% full", memory: "1.2GB/4GB" }`
  - Booth client polls this to determine server connectivity

* **Operator Diagnostics Panel:**
  - Server uptime and last restart time
  - Available disk space in storage volumes
  - Memory/CPU usage (if Docker stats exposed)
  - Active WebSocket connections
  - Image processing queue depth
  - Recent errors + logs (searchable, filterable)
  - Database size and last backup timestamp (if backups configured)

##### Server Failover & Redundancy (Optional Advanced Feature)
* **Multi-Booth Support:**
  - Server can accept uploads from multiple booth clients simultaneously
  - Each booth identified by unique `BOOTH_ID` (MAC address or UUID)
  - Dashboard shows status of each active booth
  - Can load-balance image processing across multiple server instances (if scaled deployment)

* **Dual-Booth Setup:**
  - Two physical capture booths feed into same server
  - Operator dashboard shows dual feeds side-by-side OR tabs for each booth
  - Shared frame library and event configuration
  - Each booth has independent offline queue if one goes offline
  - Automatic failover: if Booth A offline, guests directed to Booth B

---

### 1.5 Hardware & Network Requirements

#### Minimum Hardware Specifications

**Capture Booth PC (Node 1):**
- **macOS:** Mac Mini M1+ or MacBook Air M1+ (8GB RAM min, 16GB recommended) running macOS 11+
- **Windows:** Intel i5 (8th gen) or AMD Ryzen 5 (2nd gen), 8GB RAM min, 16GB recommended, Windows 10 21H2+
- **Network:** WiFi 5 (802.11ac) or Gigabit Ethernet; target: >10 Mbps upload for seamless upload
- **Camera:** Any USB webcam, OR DSLR with USB support (Canon, Nikon, Sony, Fujifilm; gphoto2 compatibility list)
- **Storage:** 256GB SSD min (for local queue if offline)
- **Display:** 1080p min for booth kiosk (21–27" recommended for guest visibility)

**Operator Hub Server:**
- **Platform:** Any x86_64 or ARM64 machine capable of running Docker (Mac, Windows, Linux)
  - Mac: Mac Mini M1+ or MacBook Pro M1+ (16GB RAM min)
  - Windows: Windows Server 2019+ or Windows 10 Pro with Docker Desktop
  - Linux: Ubuntu 20.04 LTS, Debian 11+ (recommended for production; cheapest option)
- **CPU:** 2+ cores (4 recommended)
- **RAM:** 8GB min, 16GB recommended
- **Storage:** 500GB SSD (ext4 or NTFS); more if archiving events long-term
- **Network:** Gigabit Ethernet or WiFi 5+; target: >50 Mbps for multiple simultaneous booths

#### Network Requirements
- **Local Network:** Booth and server on same LAN (WiFi or Ethernet)
- **Bandwidth:** 
  - Booth → Server upload: 4 photos × 2–4 MB = 8–16 MB per session; target: 10 Mbps min
  - Real-time WebSocket updates: <100 KB/s
  - Fallback: Booth supports offline queuing if bandwidth limited
- **Latency:** <100ms round-trip time target (LAN typical: <10ms)
- **Stability:** Graceful recovery from brief disconnects (<30s); offline queue handles longer outages

#### Camera Compatibility
- **USB Webcams:** All standard USB 2.0+ webcams (Logitech C920, C930e, Razer Kiyo, etc.)
- **DSLR via gphoto2:**
  - Canon: EOS 5D, 6D, 7D, 80D, M50, etc. (most models supported)
  - Nikon: D3000–D6, Z5, Z6, etc. (most models supported)
  - Sony: A6000+, A7 series, RX100 series
  - Fujifilm: X-T2+, X-S10, GFX series
  - See: `gphoto2 --list-cameras` for full compatibility list
- **Unsupported:** iPhones, GoPros, Smartphones (not USB-accessible via gphoto2)

---

### 1.6 Event Workflows & Use Cases

#### Single Session (1 Operator, 1 Booth)
- Operator starts server + booth client
- Frames configured ahead of time
- Guests queue naturally; booth resets between each
- Operator shares via QR or AirDrop as guests depart
- End of event: operator exports all photos + analytics

#### Multi-Event Same Day (1 Server, 2+ Separate Booths)
- Server runs continuously
- Booth A: Wedding reception (10am–12pm)
- Booth B: Corporate party (2pm–5pm)
- Operator switches event context in dashboard
- Shared server + storage; independent frame sets per event
- Post-event: separate reports for each event

#### Dual-Booth Failover
- Booth A + Booth B both active, feeding one server
- If Booth A camera fails, guests directed to Booth B
- Booth A offline queue persists; auto-resumes when camera reconnected
- Operator notified: "Booth A camera offline. Booth B active."

---

## Part 2: Technical Specifications & Implementation Guidelines

### 2.1 File Structure Layout

```text
photobooth/
│
├── photobooth-server/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   ├── package-lock.json
│   ├── server.js                    # Express + WebSocket server, auth, routing
│   ├── pipeline.js                  # Image processing: Sharp + GIFEncoder
│   ├── queue.js                     # Job queue for async image processing
│   ├── health-check.js              # Server health & diagnostics
│   ├── config.js                    # Centralized config (env variables)
│   ├── middleware/
│   │   ├── auth.js                  # JWT/session validation middleware
│   │   ├── errorHandler.js          # Centralized error handling
│   │   └── requestLogger.js         # Request logging + diagnostics
│   ├── routes/
│   │   ├── api.js                   # /api/* routes (upload, share, etc.)
│   │   └── admin.js                 # /admin/* routes (frame mgmt, config)
│   ├── public/
│   │   ├── index.html               # Public guest viewing page (displays QR + latest photo)
│   │   ├── operator.html            # Operator dashboard (secure, auth-gated)
│   │   ├── login.html               # Login page
│   │   ├── css/
│   │   │   ├── operator.css
│   │   │   ├── guest.css
│   │   │   └── login.css
│   │   └── js/
│   │       ├── operator.js          # Operator dashboard logic (WebSocket listener)
│   │       ├── guest.js             # Guest page logic
│   │       ├── login.js             # Login form handling
│   │       └── shared.js            # Utilities (QR generation, formatters)
│   ├── storage/
│   │   ├── photos/                  # Persistent volume: output photos/strips/GIFs
│   │   ├── frames/                  # Persistent volume: frame PNG overlays
│   │   ├── logs/                    # Session + error logs
│   │   └── db/                      # SQLite database (if local storage used)
│   ├── docker-compose.yml           # Define services + volumes
│   └── .env.example                 # Example environment variables
│
└── photobooth-client/
    ├── package.json                 # Electron + dependencies
    ├── forge.config.js              # Electron Forge build config
    ├── main.js                      # Electron main process, gphoto2 bridge, IPC
    ├── preload.js                   # Preload script for IPC security
    ├── renderer/
    │   ├── index.html               # Booth UI layout
    │   ├── app.js                   # Main booth logic (countdown, capture)
    │   ├── camera.js                # WebRTC camera handler
    │   ├── hardware.js              # gphoto2 integration + DSLR live preview
    │   ├── offline-queue.js         # SQLite offline queue management
    │   ├── network.js               # Server connectivity monitoring
    │   ├── audio.js                 # Audio feedback system
    │   └── ui.js                    # UI state management
    ├── styles/
    │   ├── booth.css                # Main booth styles
    │   ├── countdown.css            # Countdown timer styles
    │   └── error.css                # Error modal styles
    ├── db/
    │   └── queue.db                 # SQLite database (created at runtime)
    ├── config.json                  # Local session configuration (persisted)
    └── assets/
        ├── audio/
        │   ├── beep-3s.mp3
        │   ├── beep-2s.mp3
        │   ├── beep-1s.mp3
        │   └── shutter-click.mp3
        └── icons/
            ├── error.png
            ├── success.png
            └── loading.gif
```

---

### 2.2 Core Node.js Docker Image Pipeline (`pipeline.js`)

Use the native C-backed performance library `sharp` and `gifencoder`. Ensure auto-orientation, framing, watermarking, and optimization. Implement using this standard template:

```javascript
const sharp = require('sharp');
const GIFEncoder = require('gifencoder');
const path = require('path');
const fs = require('fs').promises;
const { promisify } = require('util');

/**
 * Process a single photo:
 * - Auto-orient from EXIF
 * - Resize to frame dimensions
 * - Composite frame overlay
 * - Apply watermark (optional)
 * - Transcode to WebP
 */
async function processSinglePhoto(rawPath, frameName, outputName, watermarkText = null) {
  try {
    const framePath = path.join(__dirname, 'storage', 'frames', frameName);
    const outputPath = path.join(__dirname, 'storage', 'photos', outputName);
    
    // Validate inputs
    if (!await fileExists(rawPath)) throw new Error(`Raw photo not found: ${rawPath}`);
    if (!await fileExists(framePath)) throw new Error(`Frame not found: ${framePath}`);
    
    // Get frame dimensions to know target size
    const frameMetadata = await sharp(framePath).metadata();
    const targetWidth = frameMetadata.width || 1200;
    const targetHeight = frameMetadata.height || 1800;

    // Build processing pipeline
    let pipeline = sharp(rawPath)
      .rotate() // Auto-orient from EXIF
      .resize(targetWidth, targetHeight, { fit: 'cover', position: 'center' })
      .composite([{ input: framePath, blend: 'over' }]);

    // Optional: add watermark text overlay
    if (watermarkText) {
      pipeline = pipeline.composite([
        {
          input: Buffer.from(
            `<svg width="${targetWidth}" height="${targetHeight}">
              <text x="20" y="${targetHeight - 20}" font-size="24" fill="white" opacity="0.8">
                ${watermarkText}
              </text>
            </svg>`
          ),
          blend: 'over'
        }
      ]);
    }

    // Transcode to WebP
    await pipeline
      .webp({ quality: 75, effort: 4 })
      .toFile(outputPath);
    
    console.log(`✓ Processed: ${outputName}`);
    return { success: true, path: outputPath, size: (await fs.stat(outputPath)).size };
  } catch (error) {
    console.error(`✗ Error processing ${outputName}:`, error.message);
    throw error;
  }
}

/**
 * Compile vertical photo strip (2, 3, or 4 photos)
 */
async function compileVerticalStrip(imagePaths, photoCount, outputName) {
  try {
    const outputPath = path.join(__dirname, 'storage', 'photos', outputName);
    
    if (imagePaths.length !== photoCount) {
      throw new Error(`Expected ${photoCount} photos, got ${imagePaths.length}`);
    }

    // Strip dimensions
    const photoWidth = 1000;
    const photoHeight = 1200;
    const padding = 50;
    const stripHeight = photoHeight * photoCount + padding * (photoCount + 1);
    const stripWidth = photoWidth + padding * 2;

    // Build composite array
    const composites = [];
    imagePaths.forEach((imgPath, idx) => {
      composites.push({
        input: imgPath,
        top: padding + idx * (photoHeight + padding),
        left: padding
      });
    });

    // Create white canvas + composite photos
    const strip = await sharp({
      create: {
        width: stripWidth,
        height: stripHeight,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
      .composite(composites)
      .webp({ quality: 80, effort: 4 })
      .toFile(outputPath);

    console.log(`✓ Strip compiled: ${outputName}`);
    return { success: true, path: outputPath, size: strip.size };
  } catch (error) {
    console.error(`✗ Error compiling strip ${outputName}:`, error.message);
    throw error;
  }
}

/**
 * Build animated GIF from photo array
 */
async function buildAnimatedGif(imagePaths, outputName, frameDelayMs = 500) {
  try {
    const outputPath = path.join(__dirname, 'storage', 'photos', outputName);
    
    // GIFEncoder setup
    const firstImg = await sharp(imagePaths[0]).metadata();
    const encoder = new GIFEncoder(firstImg.width, firstImg.height);
    
    const gifStream = fs.createWriteStream(outputPath);
    encoder.pipe(gifStream);
    encoder.setDelay(frameDelayMs);
    encoder.setRepeat(0); // Infinite loop
    encoder.start();

    // Add each frame
    for (const imgPath of imagePaths) {
      const frameBuffer = await sharp(imgPath)
        .raw()
        .toBuffer({ resolveWithObject: true });
      encoder.addFrame(frameBuffer.data);
    }

    encoder.finish();
    
    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      gifStream.on('finish', resolve);
      gifStream.on('error', reject);
    });

    console.log(`✓ GIF created: ${outputName}`);
    return { success: true, path: outputPath, size: (await fs.stat(outputPath)).size };
  } catch (error) {
    console.error(`✗ Error building GIF ${outputName}:`, error.message);
    throw error;
  }
}

/**
 * Generate thumbnail (for dashboard preview)
 */
async function generateThumbnail(inputPath, outputName, maxWidth = 400) {
  try {
    const outputPath = path.join(__dirname, 'storage', 'photos', outputName);
    
    await sharp(inputPath)
      .resize(maxWidth, maxWidth, { fit: 'cover', position: 'center' })
      .webp({ quality: 70, effort: 3 })
      .toFile(outputPath);

    console.log(`✓ Thumbnail generated: ${outputName}`);
    return { success: true, path: outputPath };
  } catch (error) {
    console.error(`✗ Error generating thumbnail ${outputName}:`, error.message);
    throw error;
  }
}

/**
 * Helper: check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  processSinglePhoto,
  compileVerticalStrip,
  buildAnimatedGif,
  generateThumbnail
};
```

---

### 2.3 Async Job Queue (`queue.js`)

Implement a simple in-memory job queue for small to medium events. For large-scale deployments, integrate Bull or RabbitMQ.

```javascript
const EventEmitter = require('events');

/**
 * Simple async job queue with max concurrent workers
 */
class PhotoProcessingQueue extends EventEmitter {
  constructor(maxConcurrent = 3) {
    super();
    this.maxConcurrent = maxConcurrent;
    this.activeJobs = 0;
    this.queue = [];
    this.processed = 0;
    this.failed = 0;
  }

  /**
   * Enqueue a job (async function)
   */
  async enqueue(jobId, jobFunction) {
    return new Promise((resolve, reject) => {
      this.queue.push({ jobId, jobFunction, resolve, reject });
      this.emit('queue-update', { depth: this.queue.length, active: this.activeJobs });
      this._processQueue();
    });
  }

  /**
   * Process queue: spawn workers up to max concurrent
   */
  async _processQueue() {
    while (this.activeJobs < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.activeJobs++;
      this.emit('job-started', job.jobId);

      try {
        const result = await job.jobFunction();
        this.activeJobs--;
        this.processed++;
        this.emit('job-completed', { jobId: job.jobId, result });
        job.resolve(result);
      } catch (error) {
        this.activeJobs--;
        this.failed++;
        this.emit('job-failed', { jobId: job.jobId, error: error.message });
        job.reject(error);
      }

      // Continue processing
      this._processQueue();
    }

    // Notify queue update
    this.emit('queue-update', { depth: this.queue.length, active: this.activeJobs });
  }

  getStatus() {
    return {
      queueDepth: this.queue.length,
      activeJobs: this.activeJobs,
      processed: this.processed,
      failed: this.failed
    };
  }
}

module.exports = PhotoProcessingQueue;
```

---

### 2.4 Electron Hardware-Tethering Subprocess Bridge (`main.js`)

Cross-platform integration with `gphoto2` for DSLR control. Designed to be robust and handle camera disconnections gracefully.

```javascript
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const Database = require('better-sqlite3');

let mainWindow;
let gphoto2Process = null;
let dslrConnected = false;
let offlineQueue = null; // SQLite queue reference

/**
 * Main app initialization
 */
app.on('ready', () => {
  // Initialize offline queue
  const dbPath = path.join(app.getPath('userData'), 'queue.db');
  offlineQueue = new Database(dbPath);
  initOfflineQueue();

  // Create main window
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true
    },
    fullscreen: false, // Set to true for kiosk mode
    kiosk: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  mainWindow.webContents.openDevTools(); // Remove in production

  // Start hardware detection
  detectDslr();
  startNetworkMonitoring();
});

/**
 * Initialize SQLite offline queue schema
 */
function initOfflineQueue() {
  try {
    offlineQueue.exec(`
      CREATE TABLE IF NOT EXISTS pending_uploads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE,
        metadata TEXT,
        image_paths TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        retry_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending'
      );
    `);
    console.log('Offline queue initialized');
  } catch (error) {
    console.error('Failed to initialize queue:', error);
  }
}

/**
 * Detect DSLR availability
 */
async function detectDslr() {
  try {
    const detect = spawn('gphoto2', ['--auto-detect']);
    let output = '';

    detect.stdout.on('data', (data) => {
      output += data.toString();
    });

    detect.on('close', (code) => {
      if (code === 0 && output.includes('usb:')) {
        dslrConnected = true;
        mainWindow.webContents.send('hardware-status', { dslrConnected: true });
        console.log('✓ DSLR detected');
      } else {
        dslrConnected = false;
        mainWindow.webContents.send('hardware-status', { dslrConnected: false });
        console.log('✗ No DSLR detected; using webcam');
      }
    });
  } catch (error) {
    console.error('DSLR detection error:', error);
    dslrConnected = false;
  }
}

/**
 * IPC: Capture single photo via DSLR
 */
ipcMain.handle('capture-hardware', async (event, targetPath) => {
  return new Promise((resolve, reject) => {
    if (!dslrConnected) {
      reject(new Error('DSLR not connected'));
      return;
    }

    const capture = spawn('gphoto2', [
      '--capture-image-and-download',
      `--filename=${targetPath}`,
      '--force-overwrite'
    ]);

    let errorOutput = '';
    capture.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    capture.on('close', (code) => {
      if (code === 0) {
        console.log(`✓ Captured: ${targetPath}`);
        resolve({ success: true, path: targetPath });
      } else {
        console.error('Capture failed:', errorOutput);
        dslrConnected = false;
        mainWindow.webContents.send('hardware-status', { dslrConnected: false });
        reject(new Error(`gphoto2 failed: ${errorOutput}`));
      }
    });

    // Timeout after 30s
    setTimeout(() => {
      capture.kill();
      reject(new Error('Capture timeout'));
    }, 30000);
  });
});

/**
 * IPC: Toggle live view from DSLR
 */
ipcMain.handle('toggle-hardware-liveview', async (event, enable) => {
  return new Promise((resolve) => {
    if (!enable) {
      if (gphoto2Process) {
        gphoto2Process.kill();
        gphoto2Process = null;
      }
      resolve({ streaming: false });
      return;
    }

    if (!dslrConnected) {
      resolve({ streaming: false, error: 'DSLR not connected' });
      return;
    }

    // Spawn live view (MJPEG stream)
    gphoto2Process = spawn('gphoto2', ['--capture-movie', '--stdout']);
    let frameCount = 0;

    gphoto2Process.stdout.on('data', (chunk) => {
      frameCount++;
      // Send frame data to renderer every 10th frame (to reduce overhead)
      if (frameCount % 10 === 0) {
        mainWindow.webContents.send('hardware-frame', { chunk: chunk.toString('base64') });
      }
    });

    gphoto2Process.on('error', (error) => {
      console.error('Live view error:', error);
      dslrConnected = false;
      mainWindow.webContents.send('hardware-status', { dslrConnected: false });
    });

    resolve({ streaming: true });
  });
});

/**
 * Monitor network connectivity
 */
function startNetworkMonitoring() {
  const axios = require('axios');
  setInterval(async () => {
    try {
      const response = await axios.get('http://localhost:3000/api/health', { timeout: 5000 });
      mainWindow.webContents.send('network-status', { online: true });
    } catch (error) {
      mainWindow.webContents.send('network-status', { online: false });
      console.warn('Server unreachable');
    }
  }, 10000); // Check every 10s
}

/**
 * IPC: Queue offline upload (called by renderer)
 */
ipcMain.handle('queue-offline-upload', async (event, sessionData) => {
  try {
    const stmt = offlineQueue.prepare(`
      INSERT INTO pending_uploads (session_id, metadata, image_paths)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(
      sessionData.sessionId,
      JSON.stringify(sessionData.metadata),
      JSON.stringify(sessionData.imagePaths)
    );

    console.log(`✓ Queued: ${sessionData.sessionId}`);
    return { success: true };
  } catch (error) {
    console.error('Queue error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * IPC: Get offline queue status
 */
ipcMain.handle('get-queue-status', async () => {
  try {
    const pending = offlineQueue.prepare('SELECT COUNT(*) as count FROM pending_uploads WHERE status = ?').get('pending');
    return { queueDepth: pending.count };
  } catch (error) {
    console.error('Queue status error:', error);
    return { queueDepth: 0, error: error.message };
  }
});

/**
 * Graceful shutdown
 */
app.on('window-all-closed', () => {
  if (gphoto2Process) gphoto2Process.kill();
  if (offlineQueue) offlineQueue.close();
  app.quit();
});

module.exports = { mainWindow, offlineQueue };
```

---

### 2.5 Server Real-Time Push Mechanism (Express + WebSockets)

The backend Express server manages authentication, image uploads, processing, and real-time WebSocket broadcasts.

```javascript
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Queue = require('./queue');
const pipeline = require('./pipeline');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Configuration
const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: path.join(__dirname, 'storage/uploads/') });
const processingQueue = new Queue(3); // Max 3 concurrent image processing jobs

/**
 * Authentication middleware
 */
function authMiddleware(req, res, next) {
  const token = req.cookies.authToken || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Route: Login
 */
app.post('/api/login', async (req, res) => {
  const { password } = req.body;

  if (!password || password !== OPERATOR_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  const token = jwt.sign({ role: 'operator' }, JWT_SECRET, { expiresIn: '4h' });
  res.json({ token, expiresIn: 14400 });
});

/**
 * Route: Health check (no auth required)
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * Route: Upload photos from booth client
 */
app.post('/api/upload', upload.array('photos'), authMiddleware, async (req, res) => {
  try {
    const { sessionId, frameName, photoCount } = req.body;
    const uploadedFiles = req.files;

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }

    console.log(`📸 Received ${uploadedFiles.length} photos for session ${sessionId}`);

    // Queue image processing jobs
    const processedPaths = [];

    for (let i = 0; i < uploadedFiles.length; i++) {
      const outputName = `${sessionId}-photo-${i}.webp`;
      
      await processingQueue.enqueue(
        `${sessionId}-photo-${i}`,
        async () => {
          const result = await pipeline.processSinglePhoto(
            uploadedFiles[i].path,
            frameName || 'none.png',
            outputName
          );
          processedPaths.push(result.path);
          return result;
        }
      );
    }

    // After all photos processed, create strip/GIF
    if (photoCount >= 2) {
      await processingQueue.enqueue(
        `${sessionId}-strip`,
        async () => {
          return await pipeline.compileVerticalStrip(
            processedPaths,
            photoCount,
            `${sessionId}-strip.webp`
          );
        }
      );

      await processingQueue.enqueue(
        `${sessionId}-gif`,
        async () => {
          return await pipeline.buildAnimatedGif(
            processedPaths,
            `${sessionId}-animated.gif`
          );
        }
      );
    }

    // Emit WebSocket event to operator
    io.emit('new-media', {
      sessionId,
      photos: processedPaths.map(p => `/photos/${path.basename(p)}`),
      strip: `/photos/${sessionId}-strip.webp`,
      gif: `/photos/${sessionId}-animated.gif`,
      timestamp: new Date().toISOString()
    });

    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * WebSocket events
 */
io.on('connection', (socket) => {
  console.log('✓ Operator connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('✗ Operator disconnected:', socket.id);
  });

  // Operator requests queue status
  socket.on('get-queue-status', () => {
    socket.emit('queue-status', processingQueue.getStatus());
  });
});

/**
 * Start server
 */
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = { app, server, io };
```

---

### 2.6 Electron Renderer: Booth UI (`renderer/app.js`)

The main capture booth UI logic running in the Electron renderer process.

```javascript
const { ipcRenderer } = require('electron');

let state = {
  mode: 'webcam', // 'webcam' or 'dslr'
  isCountingDown: false,
  isCapturing: false,
  serverOnline: true,
  dslrConnected: false,
  photoCount: 4,
  countdownDuration: 5,
  capturedPhotos: [],
  selectedFrame: 'frame-1.png',
  sessionId: generateSessionId()
};

const ui = {
  countdownDisplay: document.getElementById('countdown'),
  frameCarousel: document.getElementById('frame-carousel'),
  startButton: document.getElementById('start-button'),
  previewContainer: document.getElementById('preview-container'),
  offlineIndicator: document.getElementById('offline-indicator')
};

/**
 * Initialize booth on load
 */
window.addEventListener('load', async () => {
  console.log('🎥 Booth UI initialized');
  
  // Check hardware
  ipcRenderer.invoke('get-hardware-status').then((status) => {
    state.dslrConnected = status.dslrConnected;
    state.mode = status.dslrConnected ? 'dslr' : 'webcam';
    updateHardwareUI();
  });

  // Load config
  loadConfig();

  // Setup camera
  if (state.mode === 'webcam') {
    setupWebcam();
  } else {
    setupDslrLiveView();
  }

  // Start button
  ui.startButton.addEventListener('click', () => startCountdown());

  // Listen for hardware/network updates
  ipcRenderer.on('hardware-status', (event, status) => {
    state.dslrConnected = status.dslrConnected;
    updateHardwareUI();
  });

  ipcRenderer.on('network-status', (event, status) => {
    state.serverOnline = status.online;
    updateNetworkUI();
  });

  ipcRenderer.on('hardware-frame', (event, data) => {
    // Display live DSLR preview (if needed)
  });
});

/**
 * Setup webcam live preview
 */
async function setupWebcam() {
  const video = document.getElementById('video-preview');
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1920, height: 1080 },
      audio: false
    });
    video.srcObject = stream;
    console.log('✓ Webcam ready');
  } catch (error) {
    console.error('Webcam access denied:', error);
    showError('Unable to access camera. Please check permissions.');
  }
}

/**
 * Setup DSLR live view
 */
async function setupDslrLiveView() {
  try {
    await ipcRenderer.invoke('toggle-hardware-liveview', true);
    console.log('✓ DSLR live view started');
  } catch (error) {
    console.error('DSLR live view error:', error);
    showError('Failed to start DSLR live view. Falling back to webcam.');
    state.mode = 'webcam';
    setupWebcam();
  }
}

/**
 * Start countdown sequence
 */
async function startCountdown() {
  if (state.isCountingDown || state.isCapturing) return;
  
  state.isCountingDown = true;
  ui.startButton.disabled = true;
  
  // Show countdown
  for (let i = state.countdownDuration; i > 0; i--) {
    ui.countdownDisplay.textContent = i;
    ui.countdownDisplay.style.opacity = '1';
    
    // Play beep sound
    playSound('beep');
    
    await sleep(1000);
  }

  // Flash white + play shutter sound
  ui.countdownDisplay.textContent = '📸';
  playSound('shutter');
  flashCamera();

  // Capture
  await capturePhotos();

  state.isCountingDown = false;
  ui.startButton.disabled = false;
}

/**
 * Capture photos (single or multi-shot)
 */
async function capturePhotos() {
  state.isCapturing = true;
  state.capturedPhotos = [];
  
  try {
    for (let i = 0; i < state.photoCount; i++) {
      let photoPath;
      
      if (state.mode === 'dslr') {
        photoPath = await ipcRenderer.invoke('capture-hardware', 
          `./photos/capture-${state.sessionId}-${i}.jpg`);
      } else {
        photoPath = await captureWebcamPhoto(i);
      }

      state.capturedPhotos.push(photoPath);
      
      // Show progress
      ui.countdownDisplay.textContent = `${i + 1}/${state.photoCount}`;
      
      // Delay between shots (if multi-shot)
      if (i < state.photoCount - 1) {
        await sleep(500);
      }
    }

    // Show preview
    showPhotoPreview();
    
    // Try to upload
    await uploadPhotos();
    
  } catch (error) {
    console.error('Capture error:', error);
    showError(`Capture failed: ${error.message}`);
  } finally {
    state.isCapturing = false;
  }
}

/**
 * Capture single photo from webcam
 */
async function captureWebcamPhoto(index) {
  return new Promise((resolve) => {
    const video = document.getElementById('video-preview');
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      resolve(url);
    }, 'image/jpeg', 0.95);
  });
}

/**
 * Show photo preview + confirm/retake
 */
function showPhotoPreview() {
  const previewHtml = state.capturedPhotos.map((photo, i) => 
    `<img src="${photo}" class="preview-thumb" alt="Photo ${i + 1}">`
  ).join('');
  
  ui.previewContainer.innerHTML = `
    <div class="preview-modal">
      <div class="preview-grid">${previewHtml}</div>
      <button id="confirm-btn">Looks Good!</button>
      <button id="retake-btn">Try Again</button>
    </div>
  `;

  document.getElementById('confirm-btn').addEventListener('click', () => {
    ui.previewContainer.innerHTML = '';
  });

  document.getElementById('retake-btn').addEventListener('click', () => {
    ui.previewContainer.innerHTML = '';
    state.capturedPhotos = [];
    startCountdown();
  });
}

/**
 * Upload photos to server
 */
async function uploadPhotos() {
  if (!state.serverOnline) {
    // Queue locally if offline
    await ipcRenderer.invoke('queue-offline-upload', {
      sessionId: state.sessionId,
      metadata: { selectedFrame: state.selectedFrame, timestamp: new Date() },
      imagePaths: state.capturedPhotos
    });
    
    showMessage('📱 Photos saved locally. Will upload when server is available.');
    return;
  }

  try {
    // Convert photo blobs to FormData
    const formData = new FormData();
    formData.append('sessionId', state.sessionId);
    formData.append('frameName', state.selectedFrame);
    formData.append('photoCount', state.photoCount);

    for (let i = 0; i < state.capturedPhotos.length; i++) {
      const blob = await fetch(state.capturedPhotos[i]).then(r => r.blob());
      formData.append('photos', blob, `photo-${i}.jpg`);
    }

    // Upload
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      console.log('✓ Uploaded:', state.sessionId);
      showMessage('✨ Photos uploaded! Scan the QR code to view.');
      
      // Reset for next guest
      state.sessionId = generateSessionId();
      state.capturedPhotos = [];
      await sleep(2000);
      resetBooth();
    } else {
      throw new Error('Upload failed');
    }
  } catch (error) {
    console.error('Upload error:', error);
    // Fall back to offline queue
    await ipcRenderer.invoke('queue-offline-upload', {
      sessionId: state.sessionId,
      metadata: { selectedFrame: state.selectedFrame },
      imagePaths: state.capturedPhotos
    });
  }
}

/**
 * Reset booth to idle state
 */
function resetBooth() {
  ui.countdownDisplay.textContent = 'Ready';
  ui.countdownDisplay.style.opacity = '0.5';
  ui.startButton.disabled = false;
  state.capturedPhotos = [];
}

/**
 * Utility: Flash camera
 */
function flashCamera() {
  const flash = document.createElement('div');
  flash.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: white; z-index: 9999;';
  document.body.appendChild(flash);
  
  setTimeout(() => flash.remove(), 100);
}

/**
 * Utility: Play sound
 */
function playSound(type) {
  const sounds = {
    beep: new Audio('assets/audio/beep-1s.mp3'),
    shutter: new Audio('assets/audio/shutter-click.mp3')
  };
  
  if (sounds[type]) {
    sounds[type].play().catch(e => console.warn('Audio play failed:', e));
  }
}

/**
 * Utility: Show error message
 */
function showError(message) {
  const modal = document.createElement('div');
  modal.className = 'error-modal';
  modal.innerHTML = `
    <h2>⚠️ Error</h2>
    <p>${message}</p>
    <button onclick="this.parentElement.remove()">OK</button>
  `;
  document.body.appendChild(modal);
}

/**
 * Utility: Show message
 */
function showMessage(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

/**
 * Utility: Generate unique session ID
 */
function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Utility: Sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Update UI based on hardware state
 */
function updateHardwareUI() {
  const indicator = document.getElementById('hardware-indicator');
  if (state.dslrConnected) {
    indicator.textContent = '📷 DSLR Connected';
    indicator.style.color = 'green';
  } else {
    indicator.textContent = '📱 Using Webcam';
    indicator.style.color = 'orange';
  }
}

/**
 * Update UI based on network state
 */
function updateNetworkUI() {
  if (state.serverOnline) {
    ui.offlineIndicator.style.display = 'none';
  } else {
    ui.offlineIndicator.style.display = 'block';
    ui.offlineIndicator.textContent = '🔴 Offline Mode';
  }
}

/**
 * Load configuration from disk
 */
function loadConfig() {
  ipcRenderer.invoke('get-config').then((config) => {
    state.photoCount = config.photoCount || 4;
    state.countdownDuration = config.countdownDuration || 5;
    console.log('✓ Config loaded:', config);
  });
}
```

---

### 2.7 Docker Compose Setup (`docker-compose.yml`)

Production-ready Docker configuration for the server stack.

```yaml
version: '3.8'

services:
  photobooth-server:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: photobooth-server
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      OPERATOR_PASSWORD: ${OPERATOR_PASSWORD:-changeMe123}
      JWT_SECRET: ${JWT_SECRET:-your-secret-key-here}
      PORT: 3000
    volumes:
      - ./storage/photos:/app/storage/photos
      - ./storage/frames:/app/storage/frames
      - ./storage/logs:/app/storage/logs
    networks:
      - photobooth-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  photos:
    driver: local
  frames:
    driver: local
  logs:
    driver: local

networks:
  photobooth-net:
    driver: bridge
```

---

### 2.8 Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm ci --production

# Copy application code
COPY . .

# Create storage directories
RUN mkdir -p storage/{photos,frames,logs,uploads}

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["node", "server.js"]
```

---

### 2.9 Electron Builder Configuration (`forge.config.js`)

Cross-platform packaging configuration for macOS and Windows.

```javascript
module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icons/app',
    extraResource: [
      './assets/audio',
      './assets/icons'
    ]
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'hellomyphoto-booth'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-deb',
      config: {}
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './renderer/index.html',
              js: './renderer/app.js',
              name: 'main_window',
              preload: {
                js: './preload.js'
              }
            }
          ]
        }
      }
    }
  ]
};
```

---

## Part 3: Execution & Deployment Instructions

### 3.1 Development Setup

#### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose
- gphoto2 CLI (install via Homebrew on Mac: `brew install gphoto2`)
- Git

#### Server Setup
```bash
cd photobooth-server
npm install
cp .env.example .env
# Edit .env with your password
docker-compose up -d
# Server runs on http://localhost:3000
```

#### Client Setup
```bash
cd photobooth-client
npm install
npm start
# Electron app opens in development mode
```

### 3.2 Production Deployment

1. **Deploy Server to Production Hardware:**
   - Use Ubuntu 20.04 LTS or Debian 11+ on a dedicated Linux machine
   - Install Docker + Docker Compose
   - Clone repository + configure `.env` with strong password + JWT secret
   - Run: `docker-compose up -d --build`
   - Set up reverse proxy (Nginx) if exposing over internet (not recommended for privacy; keep local network only)

2. **Package Electron Client:**
   ```bash
   npm run make
   # Creates installers in `out/` directory
   # Distribute .exe (Windows) or .dmg (macOS)
   ```

3. **Pre-Event Checklist:**
   - Test webcam + DSLR connectivity
   - Upload event-specific frames to server
   - Verify server + booth on same network
   - Test offline mode by pulling network plug
   - Load-test with dummy sessions

### 3.3 Monitoring & Maintenance

- **Server Logs:** `docker logs photobooth-server` (real-time)
- **Storage:** Monitor `./storage/photos/` size; archive old events monthly
- **Database Backups:** Regular SQLite backups of session logs
- **Updates:** Pin Docker image versions; test new Node LTS releases before upgrading

---

## Part 4: Security Considerations

### 4.1 Network
- **Keep on local LAN only** (never expose directly to internet without VPN)
- **Firewall:** Restrict port 3000 to LAN subnet only
- **HTTPS:** If exposing externally, use reverse proxy with SSL termination

### 4.2 Authentication
- **Strong Password:** Use 12+ character password; store in environment variables (not in code)
- **JWT Expiry:** 4-hour session timeout with inactivity check
- **Multi-Operator:** Use separate operator accounts if scaling (implement role-based access if needed)

### 4.3 File Handling
- **Temp Uploads:** Clean up multer temp files after processing
- **Storage Validation:** Verify file sizes before processing (cap at 10MB per photo)
- **Path Traversal:** Use basename() when serving files; no user-supplied paths in file operations

---

## Summary

This comprehensive PRD provides a complete blueprint for building **hellomyphoto**, a production-grade self-hosted photo booth system. It addresses:

✅ Core UX for guests and operators  
✅ Offline resilience and network failure handling  
✅ Multi-booth failover and scaling  
✅ Real-time WebSocket updates  
✅ Secure authentication and asset management  
✅ Cross-platform (Mac/Windows) client + Docker server  
✅ Complete code templates (not placeholders)  
✅ Hardware integration (webcam + DSLR via gphoto2)  
✅ Analytics and diagnostics  
✅ Error recovery and graceful degradation  

An AI agent can now take this document and begin implementation immediately without ambiguity or incomplete specifications.