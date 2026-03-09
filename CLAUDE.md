# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sports Coach — a multi-app monorepo for browser-based fitness and sports coaching. Uses MediaPipe for real-time pose detection and Vertex AI (Gemini) for AI-powered form feedback. Supports both real-time camera analysis and video upload analysis with overlay visualizations.

**Apps:**
- **Gym Coach** (`gym/`) — Dumbbell exercise tracking (8 exercises)
- **Football Coach** (`football/`) — Football technique analysis (8 techniques)
- **Video Analysis** (`video-analysis/`) — Upload videos or search YouTube for AI analysis with overlay playback

## Development Commands

```bash
# Local development (Express server, port 8080)
./run.sh

# Production server (Express + Nginx, port 8080)
npm start

# Deploy to Google Cloud Run
./deploy-to-cloud-run.sh

# Setup Firestore database (one-time)
./setup-firestore.sh
```

There is no build process, linter, or test suite. JavaScript files are ES6 modules loaded directly by the browser.

## Architecture

**Real-time flow:** Camera → MediaPipe Holistic (browser) → Pose Landmarks → Client-side Form Analysis → Server (`/api/realtime/feedback`) → Vertex AI → Multi-modal Feedback

**Video upload flow:** Upload → GCS bucket → Client-side MediaPipe frame extraction → Server (`/api/video/analyze`) → Vertex AI (video + landmarks) → Overlay playback

**YouTube import flow:** Search query → Server (`/api/youtube/search`) → YouTube Data API v3 → User selects video → Server (`/api/youtube/import`) → yt-dlp download → GCS upload → same processing pipeline as file upload

**ML pipeline flow:** Video in GCS → Server downloads to temp file → Python subprocess (`ml_pipeline.py`) → YOLOv8 detection + SigLIP embeddings + UMAP/KMeans clustering → Team detection + ball tracking JSON

### Shared Module Injection Pattern

Shared modules never hardcode exercise/technique names. Each app injects domain-specific behavior at startup:

- `gemini-api.js`: `setExerciseContextProvider(fn)` — app provides prompt context (form criteria, breathing, common errors). `setFrameSnapshotProvider(fn)` — captures canvas for multimodal AI.
- `audio-coach.js`: `registerExercisePhrases(name, phrases)` — app registers exercise-specific voice feedback. Base provides general encouragement/breathing phrases. Cooldowns: form 10s, rep 3s, encouragement 15s.
- `visualization.js`: Receives `exerciseMetricsData` via `update()` parameter, calls `metricImplementations.measure(pose)` dynamically.
- `pose-utils.js`: Pure utility — `calculateAngle()`, `smoothAngle()` (outlier rejection + exponential smoothing, needs 10+ samples), `determineFeedbackSeverity()` (hysteresis to prevent flickering).

### Exercise/Technique State Machines

Each exercise defines a state machine for rep counting. The patterns differ by sport:
- **Gym**: Vertical movements — `waiting → down → up` (e.g., bicep curls track elbow angle)
- **Football**: Rotational/asymmetric — technique-specific states (e.g., `waiting → backswing → follow_through` for kicks)

Don't copy state logic between sports — the biomechanics are fundamentally different.

### Exercise Metrics Pattern

Both `gym/exercise-metrics.js` and `football/technique-metrics.js` export per-exercise objects with:
```javascript
{
  primaryView: "Side" | "Front",
  keyMetrics: ["jointAlignment", "rangeOfMotion", ...],
  metricImplementations: {
    jointAlignment: {
      measure(pose) { /* returns { value, display, status } */ },
      feedback: { good: "...", warning: "...", error: "..." }
    }
  }
}
```

### Video Overlay System

`shared/video-overlay.js` provides 6 visualization modes for the video-analysis app:
- `skeleton` — Basic pose skeleton
- `angles` — Joint angle values on body
- `paths` — Comet trails of limb movement
- `tactical` — Form quality badge + minimap
- `detection` — YOLOv8 player/ball detection (from ML pipeline)
- `full` — All overlays combined

Syncs to video playback via timestamp-based binary search on pre-extracted landmarks.

## Server (`server.js`)

Express server using `@google/genai` SDK with ADC authentication (no API keys on client). YouTube endpoints use `googleapis` + `yt-dlp` CLI. Firestore uses `@google-cloud/firestore` with ADC.

Endpoints:
- `GET /api/config` — Server capabilities
- `POST /api/video/upload` — Upload video to GCS (multer, memory storage)
- `GET /api/video/stream/*` — Proxy video from GCS with range request support (seeking)
- `GET /api/video/list` — List all videos in GCS bucket
- `POST /api/video/analyze` — Analyze video with Vertex AI (GCS URI + landmarks)
- `POST /api/video/ml-analyze` — Run Python ML pipeline (YOLOv8 + SigLIP + UMAP)
- `POST /api/realtime/feedback` — Real-time AI feedback (exercise data + optional frame snapshot)
- `POST /api/youtube/search` — Search YouTube (requires `YOUTUBE_API_KEY`)
- `POST /api/youtube/import` — Download via yt-dlp → GCS
- `POST /api/analysis/save` — Save to Firestore + landmarks/ML results to GCS
- `GET /api/analysis/list` — List saved analyses (lightweight metadata)
- `GET /api/analysis/:id` — Full analysis + landmarks + ML results for replay

## Deployment

- **Docker:** Node 18-slim + Nginx + Python 3 + yt-dlp. Pre-downloads ML models (YOLOv8n, SigLIP) in Docker layer. Static files in `public/`. Nginx proxies `/api/*` to Express, 100MB upload limit, 300s timeout.
- **Cloud Run:** Region `us-central1`, unauthenticated access, 4Gi memory, 2 CPU, 300s timeout. Service account needs `roles/aiplatform.user` + GCS `objectAdmin` + `roles/datastore.user`.

## Environment Variables (.env)

- `GOOGLE_CLOUD_PROJECT` — GCP project ID
- `GOOGLE_CLOUD_LOCATION` — Region (default: `global`)
- `GCS_BUCKET_NAME` — GCS bucket for video storage
- `PORT` — Server port (default: `8080`)
- `GEMINI_MODEL` — Model name (default: `gemini-3.1-flash-lite-preview`)
- `GEMINI_TEMPERATURE` — Temperature (default: `0.15`)
- `MAX_VIDEO_SIZE_MB` — Max upload size (default: `100`)
- `MAX_VIDEO_DURATION_SECONDS` — Max YouTube video duration (default: `300`)
- `YOUTUBE_API_KEY` — YouTube Data API v3 key (optional, enables YouTube search & import)
- `ML_ANALYSIS_FPS` — Frames per second for ML pipeline (default: `2`)
- `ML_ENABLED` — Enable ML analysis features

## External Dependencies (CDN-loaded, not in package.json)

- MediaPipe Holistic, Camera Utils, Drawing Utils
- Font Awesome 6.4.2

## Conventions

- **Color codes:** Green `#30c39e` = good, Yellow `#ffc107` = warning, Red `#ff3a5e` = error
- **Pose landmarks:** MediaPipe 33-point model (0-10 face, 11-32 body). Angles 0-180°.
- **FPS:** Client video processing at 15 FPS, ML pipeline at 2 FPS
- **Timestamps:** Decimal seconds (0.0-n.nnn) for video sync

## Context Documentation

The `memory-bank/` directory contains detailed project context files (architecture decisions, progress, patterns).
