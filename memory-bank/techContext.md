# Technical Context: Football Video Analysis

## Technology Stack

### Core Client Technologies

| Technology | Purpose | Implementation |
|------------|---------|----------------|
| **HTML5/CSS3** | Structure, styling, layout | Standard semantic HTML with custom CSS. |
| **JavaScript (ES6+)** | Application logic | Modular JS with ES6 modules for client-side processing. |
| **MediaPipe** | Pose detection | Holistic model for full-body tracking (via CDN). |
| **Canvas API** | Visualization | Drawing pose landmarks, extracting video frames, and visual feedback overlays. |
| **Web Speech API** | Audio feedback | Speech synthesis for voice coaching. |
| **LocalStorage API** | Data persistence | Storing user preferences, API keys, and analysis history. |

### Backend / API Integrations

| Technology | Purpose |
|------------|---------|
| **Google Gemini API** | AI-powered multimodal coaching feedback (used for match strategy, technique identification, and deep per-player analysis). |
| **Node.js / Express** | Backend server (`server.js`) serving static files, proxying YouTube videos, routing to the ML pipeline, and handling Gemini API calls (e.g. `/api/video/analyze-player`, `/api/video/triage`). |
| **Python ML Pipeline** | A Python script (`ml_pipeline.py`) leveraging YOLOv8, ByteTrack, and SigLIP for player detection, tracking, tracking deduplication (fingerprinting), and non-player filtering. |
| **YouTube Data API** | Searching and importing football technique videos from YouTube for analysis. |

## Application Structure

The application is structured around the football video analysis domain and shared core logic:

```text
/
├── index.html           # Main entry point (redirects to /video-analysis/)
├── server.js            # Node.js Express server (handles API endpoints, YouTube, and ML routing)
├── ml_pipeline.py       # Python script handling YOLOv8 tracking, SigLIP fingerprinting, and non-player filtering
├── run.sh               # Helper script to start the server
├── shared/              # Core logic for computer vision and AI
│   ├── gemini-api.js
│   ├── pose-utils.js
│   ├── audio-coach.js
│   └── video-overlay.js # Renders bounding boxes and dims non-players
├── football/            # Football technique definitions and metrics
│   ├── techniques.js
│   └── technique-metrics.js
└── video-analysis/      # Video upload and YouTube analysis UI module
    ├── index.html       # Includes dual-view tabs and player-analysis slide-out panel
    └── script.js        # Orchestrates the parallel pipelines (ML + MediaPipe)
```

## Technical Constraints & Decisions

### Dual Pipeline Architecture

- **Decision:** Rather than having the user manually select "Match" or "Technique" mode, the application runs both a backend ML pipeline (for bounding boxes, tracking, and team clustering) and a frontend MediaPipe pipeline (for pose keypoints) simultaneously. 
- **Implementation:** Both pipelines run in parallel. A quick "triage" step (`/api/video/triage`) determines the default view (match vs technique), but data for both is always extracted and Gemini is prompted for both.

### Client-Side vs Server-Side Processing

- **MediaPipe (Client-Side):** Pose detection is computationally intensive. Running this directly in the browser ensures maximum privacy for technique analysis.
- **YOLOv8 & SigLIP (Server-Side):** The Python ML pipeline runs server-side to handle complex object tracking, track fingerprinting (merging tracks of the same player), and non-player filtering (dimming refs and coaches).

### Video Analysis vs. Real-Time Webcam

- **Decision:** This branch focuses exclusively on analyzing pre-recorded videos (local uploads or YouTube imports) rather than live webcam feeds.
- **Implementation:** The system uses a hidden `<video>` element, plays it, and extracts frames to a `<canvas>` to pass to MediaPipe. The data is aggregated into a timeline so the user can review specific phases (e.g., ball contact) interactively.

### Backend Proxy for YouTube

- **Why?** Fetching video frames from YouTube directly in the browser via Canvas triggers strict CORS (Cross-Origin Resource Sharing) security violations.
- **Implementation:** The `server.js` Node backend acts as a proxy, safely downloading the YouTube video and serving it to the client as a clean, local-origin asset that the Canvas API can read.

### Gemini API Integration

- Used to turn raw pose data, joint angles, and phase information into human-readable coaching cues.
- Generates structured output by providing explicit prompt instructions and passing frame-by-frame metric summaries of the football technique.

## Deployment Environment

- **Target:** Google Cloud Run (via Docker).
- **Environment Variables:** `gemini-apikey` and YouTube API keys for the backend.
- `deploy-to-cloud-run.sh` script automates the Docker build and Cloud Run deployment process.
