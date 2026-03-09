# Architecture Reference

> Complete documentation of the Football Video Analysis platform as of 2026-03-09.

## Table of Contents

- [System Overview](#system-overview)
- [Application Structure](#application-structure)
- [Server (server.js)](#server-serverjs)
- [Video Analysis App](#video-analysis-app)
- [Football Coach App](#football-coach-app)
- [Shared Modules](#shared-modules)
- [ML Pipeline](#ml-pipeline)
- [Infrastructure](#infrastructure)

---

## System Overview

### Data Flows

**Video Upload Flow:**
```
Upload File → POST /api/video/upload → GCS bucket
  → POST /api/video/triage (YOLOv8 quick scan, 5 frames)
  → Parallel:
    ├─ POST /api/video/ml-analyze (YOLOv8 + SigLIP + UMAP)
    └─ Client-side MediaPipe (15 FPS frame extraction)
  → POST /api/video/analyze (Gemini technique analysis)
  → POST /api/video/match-analyze (4+ parallel Gemini prompts)
  → POST /api/analysis/save (Firestore + GCS)
  → Overlay playback with synced visualizations
```

**YouTube Import Flow:**
```
POST /api/youtube/search → YouTube Data API v3
  → User selects video
  → POST /api/youtube/import → yt-dlp download → GCS upload
  → Same pipeline as file upload
```

**Real-time Camera Flow:**
```
Camera → MediaPipe Holistic (browser, 30 FPS)
  → Client-side angle calculation + state machine
  → POST /api/realtime/feedback (every 30s)
  → Gemini returns form assessment
  → Audio + visual feedback
```

**Focus Mode Flow (Progressive Player Analysis):**
```
User selects player → Focus Mode activated
  → Every 15s of video watched:
    → POST /api/video/focus-stream (SSE)
    → Gemini streams analysis for time window
    → Insight cards appear progressively
```

---

## Application Structure

```
/
├── index.html                 # Landing page (redirects to /video-analysis/)
├── styles.css                 # Root styles
├── server.js                  # Express server (16 endpoints, prompt templates)
├── ml_pipeline.py             # Python ML pipeline (YOLOv8 + SigLIP + UMAP)
├── package.json               # Node.js dependencies
├── requirements.txt           # Python dependencies
├── .env.example               # Environment variable template
├── run.sh                     # Local development launcher
├── deploy-to-cloud-run.sh     # Cloud Run deployment script
├── setup-firestore.sh         # One-time Firestore setup
├── setup-youtube-api-key.sh   # YouTube API key setup
├── Dockerfile                 # Production container
├── nginx.conf                 # Nginx reverse proxy config
├── CLAUDE.md                  # AI assistant instructions
│
├── video-analysis/            # Video upload & match analysis app
│   ├── index.html             # Dashboard UI
│   ├── script.js              # ~1700 lines: pipeline, playback, focus mode
│   └── styles.css             # Dashboard styles
│
├── football/                  # Real-time camera technique analysis
│   ├── index.html             # 3-column layout with camera feed
│   ├── script.js              # ~2600 lines: MediaPipe, state machines, analytics
│   ├── styles.css             # Green/white football theme
│   ├── techniques.js          # 8 technique definitions (metadata)
│   ├── technique-metrics.js   # Metric implementations per technique
│   └── documentation.js       # Interactive documentation modal
│
├── shared/                    # Shared modules (app-agnostic)
│   ├── pose-utils.js          # Angle math, smoothing, severity
│   ├── audio-coach.js         # Voice feedback (Web Speech API)
│   ├── gemini-api.js          # Server-proxied Gemini client
│   ├── visualization.js       # Canvas form overlays
│   ├── video-overlay.js       # 6-mode video playback overlays
│   ├── video-processor.js     # MediaPipe frame extraction
│   ├── match-charts.js        # SVG match data charts
│   └── advanced-analytics.js  # Session tracking & progress reports
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md        # This file
│   ├── CHANGELOG-2026-03-04.md
│   ├── CHANGELOG-2026-03-09.md
│   ├── design-critique/
│   ├── tacticai-implementation-study.md
│   └── tacticai-phases.md
│
└── memory-bank/               # Project context files
    ├── activeContext.md
    ├── productContext.md
    ├── progress.md
    ├── projectbrief.md
    ├── systemPatterns.md
    └── techContext.md
```

---

## Server (server.js)

### Configuration

| Variable | Env Key | Default | Purpose |
|----------|---------|---------|---------|
| PORT | `PORT` | 8080 | Express server port |
| GEMINI_MODEL | `GEMINI_MODEL` | gemini-2.0-flash | Vertex AI model |
| GEMINI_TEMPERATURE | `GEMINI_TEMPERATURE` | 0.15 | Generation temperature |
| MAX_VIDEO_SIZE_MB | `MAX_VIDEO_SIZE_MB` | 100 | Upload limit (MB) |
| MAX_VIDEO_DURATION | `MAX_VIDEO_DURATION_SECONDS` | 300 | YouTube import limit (s) |
| ML_ANALYSIS_FPS | `ML_ANALYSIS_FPS` | 2 | ML pipeline frame rate |
| ML_ENABLED | `ML_ENABLED` | true | Enable ML features |
| YOUTUBE_API_KEY | `YOUTUBE_API_KEY` | (empty) | YouTube Data API key |
| GCS_BUCKET_NAME | `GCS_BUCKET_NAME` | (empty) | GCS bucket name |
| GOOGLE_CLOUD_PROJECT | `GOOGLE_CLOUD_PROJECT` | (empty) | GCP project ID |
| GOOGLE_CLOUD_LOCATION | `GOOGLE_CLOUD_LOCATION` | global | Vertex AI region |

### Lazy-Loaded Services

| Service | SDK | Init Pattern |
|---------|-----|-------------|
| GCS | `@google-cloud/storage` | `getGCS()` → `{ storage, bucket }` |
| Vertex AI | `@google/genai` | `getGenAI()` → `GoogleGenAI({ vertexai: true, project, location })` |
| Firestore | `@google-cloud/firestore` | `getFirestore()` → `Firestore({ projectId })` |
| YouTube | `googleapis` | `getYouTube()` → `google.youtube({ version: 'v3', auth: apiKey })` |

All services use ADC (Application Default Credentials) — no API keys in code.

### API Endpoints (16 total)

#### Config
| Method | Path | Purpose | Parameters |
|--------|------|---------|------------|
| GET | `/api/config` | Server capabilities | — |

#### Video Management
| Method | Path | Purpose | Parameters |
|--------|------|---------|------------|
| POST | `/api/video/upload` | Upload to GCS | multipart `video` file |
| GET | `/api/video/stream/*` | Proxy from GCS (range requests) | path segment |
| GET | `/api/video/list` | List GCS videos | — |

#### Video Analysis
| Method | Path | Purpose | Parameters |
|--------|------|---------|------------|
| POST | `/api/video/triage` | Quick YOLOv8 scan (5 frames) | `fileName` |
| POST | `/api/video/analyze` | Gemini technique analysis | `gcsUri`, `landmarks`, `exerciseType`, `metadata` |
| POST | `/api/video/match-analyze` | Multi-prompt match analysis | `gcsUri`, `mlResults`, `metadata` |
| POST | `/api/video/ml-analyze` | Full ML pipeline | `fileName` |
| POST | `/api/video/analyze-player` | Single player deep analysis | `gcsUri`, `trackId`, `teamId`, `keypoints`, `stats`, `playerPath` |
| POST | `/api/video/focus-stream` | SSE streaming player analysis | `gcsUri`, `trackId`, `teamId`, `timeWindow`, `keypoints`, `windowStats` |

#### Real-time
| Method | Path | Purpose | Parameters |
|--------|------|---------|------------|
| POST | `/api/realtime/feedback` | Live coaching feedback | `exerciseData`, `exerciseContext`, `frameSnapshot`, `exerciseType` |

#### YouTube
| Method | Path | Purpose | Parameters |
|--------|------|---------|------------|
| POST | `/api/youtube/search` | Search YouTube | `query`, `maxResults` (default 8) |
| POST | `/api/youtube/import` | Download via yt-dlp → GCS | `videoId`, `title` |

#### Persistence
| Method | Path | Purpose | Parameters |
|--------|------|---------|------------|
| POST | `/api/analysis/save` | Save to Firestore + GCS | full analysis payload |
| GET | `/api/analysis/list` | List saved analyses (50 most recent) | — |
| GET | `/api/analysis/:id` | Load full analysis | `id` |

### Prompt Templates (8 functions)

| Function | Sections Requested | Used By |
|----------|-------------------|---------|
| `createVideoAnalysisPrompt()` | DETECTED_TECHNIQUE, OVERALL_PERFORMANCE, PHASE_BREAKDOWN, FORM_QUALITY, KEY_MOMENTS, PROGRESSION, IMPROVEMENT_PLAN, OVERLAY_ANNOTATIONS | `/api/video/analyze` |
| `createRealtimeFeedbackPrompt()` | FORM_ASSESSMENT, IMPROVEMENT_TIP, PROGRESS_FEEDBACK, BREATHING_REMINDER | `/api/realtime/feedback` |
| `createMatchTacticalPrompt()` | FORMATION, ATTACKING_PATTERN, DEFENDING_PATTERN, TACTICAL_SUMMARY | `/api/video/match-analyze` |
| `createPlayerAnalysisPrompt()` | PLAYER_ROLE, ACTIONS_PERFORMED, MOVEMENT_QUALITY, PLAYER_ASSESSMENT | `/api/video/match-analyze` |
| `createPlayerTechniquePrompt()` | TECHNIQUE_ASSESSMENT, PHYSICAL_ANALYSIS, MOVEMENT_QUALITY, TACTICAL_CONTRIBUTION, STRENGTHS, AREAS_FOR_IMPROVEMENT, OVERALL_RATING | `/api/video/analyze-player` |
| `createFocusWindowPrompt()` | (2-3 bullet points, unstructured) | `/api/video/focus-stream` |
| `createEventDetectionPrompt()` | EVENTS_TIMELINE, KEY_PLAYS, STANDOUT_MOMENTS | `/api/video/match-analyze` |
| `createPossessionPrompt()` | POSSESSION_SUMMARY, POSSESSION_CHANGES, TERRITORIAL_CONTROL | `/api/video/match-analyze` |

### Biomechanics Guide (`getTechniqueSpecificGuide()`)

Per-technique evaluation criteria for 8 techniques:

| Technique | Key Biomechanics Criteria |
|-----------|--------------------------|
| Instep Kick | Plant foot distance, hip extension, knee snap, ankle lock, torso lean, follow-through |
| Inside Foot Pass | Plant foot, hip rotation, knee angle, contact surface, body position |
| Outside Foot Pass | Approach angle, ankle inversion, knee whip, deception |
| Dribbling Posture | Knee flexion, torso lean, head position, foot contact, arm position |
| Heading Technique | Stance, back arch, core drive, contact point, eyes, arms |
| Volley Kick | Body orientation, knee lift, timing, ankle lock, balance arms |
| Throw-In | Grip, feet position, back arch, core drive, release point, arm symmetry |
| Goalkeeper Stance | Knee flexion, stance width, weight distribution, forward lean, hands |

### Response Parsing

- `parseAnalysisSections(text)` — Regex: `/^[#*\s]*([A-Z][A-Z_]+)[*:\s]*$/` matches `SECTION:`, `**SECTION:**`, `### SECTION`
- `parseEventsTimeline(text)` — Regex: `/\[(\d{1,2}):(\d{2})\]\s*[-–—]\s*(.+)/g` extracts `[MM:SS] - description`

---

## Video Analysis App

### UI Sections

1. **Upload Section** — Three source tabs:
   - **Upload File** — Drag-and-drop zone, file preview, "Start Analysis" button
   - **Search YouTube** — Search input, result cards with thumbnails, "Import & Analyze"
   - **Previous Analyses** — Library of saved analyses with "View Results" / "Re-Analyze"

2. **Processing Section** — 4-step pipeline visualization:
   - Upload to Cloud → Detect Video Type → Extract Pose Data → AI Analysis
   - Progress bar with percentage and stage text

3. **Results Section**:
   - **Video Player** — Playback with overlay canvas, play/pause, timeline slider, time display
   - **Overlay Controls** — 6 modes: Skeleton, Angles, Paths, Detection, Full, None
   - **Focus & Follow** button — Progressive player analysis mode
   - **Event Strip** — Clickable timeline dots below video

4. **Technique Results** — 5 analysis cards:
   - Overall Performance, Form Quality, Key Moments, Progression, Improvement Plan

5. **Match Results** — 4 tabbed panels:
   - **Tactical** — Formation, Attacking/Defending Patterns, Summary; Pitch Map chart
   - **Players** — Player cards (team badge, stats, expandable analysis); Player Comparison chart
   - **Events** — Events Distribution chart, Timeline, Key Plays, Standout Moments; clickable event list
   - **Possession** — Possession bar (Team A vs B %), Possession Flow chart, Summary, Territorial Control

6. **Stats Dashboard** — 4 stat cards: Frames Processed, Unique Players, Ball Frames, Tracks Merged

7. **Player Analysis Panel** — Right slide-out (420px):
   - Overall Rating (X/10), Technique Assessment, Physical Analysis, Movement Quality, Tactical Contribution, Strengths, Areas for Improvement

8. **Focus Mode Panel** — Right slide-out (440px):
   - Progressive insight cards (15s windows), streaming text, seek-to-time buttons

### Key State Variables

```
selectedFile, uploadedFileName, currentGcsUri, lastGcsUri, lastRawText
analysisData            — Gemini technique analysis sections
matchAnalysisData       — Gemini match analysis (tactical, players, events, possession)
landmarksData           — MediaPipe pose landmarks array
mlResultsData           — ML pipeline output (detections, tracks, teams, ball, etc.)
triageResult            — Triage metadata (suggestedMode, avgPersonCount, duration)
analysisMode            — 'match' | 'technique'
playerAnalysisCache     — Map of trackId → cached technique analysis
focusMode, focusTrackId, focusInsights, focusLastWindowEnd
videoProcessor, videoOverlay, matchCharts  — Module instances
```

### Processing Pipeline

1. Upload to GCS (or use existing GCS file)
2. Triage — YOLOv8 quick scan → determine match vs technique mode
3. ML Analysis — Full pipeline (parallel with step 4)
4. MediaPipe Extraction — Client-side frame processing at 15 FPS
5. Gemini Analysis — Technique analysis (always) + Match analysis (if match mode)
6. Save — Firestore metadata + GCS for large data (landmarks, ML results)
7. Display — Render results with synced overlay playback

---

## Football Coach App

### 8 Techniques

| # | Technique | Difficulty | State Machine | Rep Count Trigger | Rep Goal |
|---|-----------|-----------|---------------|-------------------|----------|
| 1 | Instep Kick | Intermediate | waiting → backswing → follow_through | backswing→follow_through | 10 |
| 2 | Inside Foot Pass | Beginner | waiting → backswing → follow_through | backswing→follow_through | 15 |
| 3 | Outside Foot Pass | Advanced | waiting → backswing → follow_through | backswing→follow_through | 10 |
| 4 | Dribbling Posture | Beginner | waiting → active (continuous) | continuous scoring | 30 |
| 5 | Heading Technique | Intermediate | waiting → arch → drive | arch→drive | 10 |
| 6 | Volley Kick | Advanced | waiting → backswing → follow_through | backswing→follow_through | 8 |
| 7 | Throw-In | Beginner | waiting → arms_back → release | arms_back→release | 10 |
| 8 | Goalkeeper Stance | Beginner | waiting → active (continuous) | continuous scoring | 20 |

### Metrics Per Technique

All techniques measure 3-6 of these base metrics:

| Metric | What It Measures | Landmarks Used |
|--------|-----------------|----------------|
| stance | Proper stance/positioning | Knees (25,26), Feet (27,28) |
| balance | Single-leg stability | Shoulders (11,12), Hips (23,24) |
| hipMobility | Hip flexion/extension/rotation | Shoulders (11,12), Hips (23,24), Knees (25,26) |
| kneeAction | Knee flexion/extension | Hips (23,24), Knees (25,26), Ankles (27,28) |
| coreEngagement | Core stability/rotation | Shoulders (11,12), Hips (23,24) |
| followThrough | Post-contact extension | Hips (23,24), Knees (25,26), Ankles (27,28) |

Each metric returns `{ value, idealRange, feedbackText: { good, warning, error } }`.

### Angle Tracking (Lower Body Focus)

History buffers (20 samples each): rightHip, leftHip, rightKnee, leftKnee, rightAnkle, leftAnkle

- Uses `smoothAngleFast()` for fast movements (kicks at ~300ms)
- State machine timeout: 1500ms (prevents stuck states)
- Forced transitions check hip/knee angles (not elbow/bicep)

### UI Features

- **3-column layout** — Technique library | Camera feed | Technique details
- **Camera controls** — Start/Stop, visualization toggles (guides, corrections, heatmap)
- **Audio coach** — Voice toggle, frequency (minimal/normal/detailed), language (EN/ES/PT), volume
- **Rep counter** — Large display, progress bar, form feedback sections
- **AI feedback** — Form Assessment, Improvement Tip, Progress, Breathing (updated every 30s)
- **Advanced insights** — Progress insights + Recommendations (collapsible)
- **Documentation modal** — 4 tabs: Technique Guide, Metrics, Camera Setup, Feedback System
- **Mobile support** — 3-step stepper, floating action button, full-screen workout mode

### Audio Coach Phrases (8 techniques registered)

Each technique registers: form cues (3), breathing cue (1), correction triggers.

---

## Shared Modules

### pose-utils.js — Angle Math & Smoothing

| Function | Purpose |
|----------|---------|
| `calculateAngle(A, B, C)` | Angle at joint B (0-180°) using atan2 |
| `smoothAngle(angle, history, weight=0.2)` | Exponential smoothing with outlier rejection (≥10 samples) |
| `smoothAngleFast(angle, history, baseWeight=0.2)` | Adaptive smoothing — 60-85% weight for fast movements (>15°/frame) |
| `angularVelocity(history, fps=15)` | Instantaneous angular velocity (°/s) from last 2 samples |
| `peakAngularVelocity(history, fps=15)` | Max angular velocity across full history |
| `determineFeedbackSeverity(value, range, threshold=10, prev=null)` | "good"/"warning"/"error" with 3° hysteresis |

### audio-coach.js — Voice Feedback

- `AudioCoach` class using Web Speech API
- Apps register phrases via `registerExercisePhrases(name, phrases)`
- Base phrases: general start/stop/encouragement/breathing
- Cooldowns: form 10s, rep 3s, encouragement 15s
- Priority queue: high=2, normal=1, low=0
- Voice filtering: English, Spanish, Portuguese

### gemini-api.js — Server-Proxied AI Client

- `GeminiAPI` class (singleton)
- Injection: `setExerciseContextProvider(fn)`, `setFrameSnapshotProvider(fn)`
- Calls `POST /api/realtime/feedback` with exercise data + optional frame snapshot
- Parses response into 4 feedback sections
- Historical data stored in localStorage (10-session rolling window)

### visualization.js — Canvas Form Overlays

- `FormVisualizer` class
- Draws: form corrections (red joints), movement guides (dashed lines + arrows), muscle heatmaps (radial gradients)
- Draws: angle arcs with ideal ranges, feedback HUD panel, performance metrics panel
- Generic config properties: `goodFormJoints`, `guideJointPairs`, `heatmapRegions`
- Colors: green (#30c39e), yellow (#ffc107), red (#ff3a5e)

### video-overlay.js — 6-Mode Video Playback Overlays

| Mode | What It Renders |
|------|----------------|
| `skeleton` | MediaPipe 33-point pose (skip face 0-10) |
| `angles` | Joint angles with color-coded arcs (6 key angles) |
| `paths` | Comet trails for wrists + ankles (30-frame history) |
| `tactical` | Form quality badge + minimap stick figure |
| `detection` | YOLOv8 player/ball boxes, team colors, track IDs, player skeletons, formation lines, possession indicator, ball trail, team legend |
| `full` | All overlays combined |

- Binary search sync: `findFrameByTime(t)` on landmarks array
- ML frame interpolation: `findMlFrameInterpolated(t)` for smooth bbox rendering
- Player selection: click-to-select with callback
- Team colors: A=red, B=blue, Ball=gold, Non-player=gray

### video-processor.js — MediaPipe Frame Extraction

- `VideoProcessor` class
- Loads MediaPipe Holistic from CDN (complexity 1, smoothing on)
- Processes video at 15 FPS
- Outputs: `[{ frame, timestamp, pose[33], leftHand[21], rightHand[21] }]`

### match-charts.js — SVG Match Data Charts

| Chart | What It Shows |
|-------|--------------|
| Processing Stats | 4 cards: Frames, Unique Players, Ball Frames, Tracks Merged |
| Possession Flow | Stacked area river chart (2s bins, Team A above / B below midline) |
| Player Comparison | Horizontal bars sorted by visibility (possession highlighted) |
| Pitch Map | Green pitch with player positions, ball trajectory, team legend |
| Events Distribution | Stacked histogram (ball_contact, direction_change, gemini events) |

All charts: pure SVG (no external library), clickable to seek video, synced playhead.

### advanced-analytics.js — Session Tracking

- `AdvancedAnalytics` class
- Tracks per-session: reps (with form quality, joint angles, velocity), rest periods, form consistency
- Stores to localStorage (rolling window)
- `generateProgressReport()`: total sessions/reps, form improvement trend, consistency score, personalized recommendations

---

## ML Pipeline (ml_pipeline.py)

### Models

| Model | Purpose | Size |
|-------|---------|------|
| YOLOv8n | Person + ball detection | ~6MB |
| SigLIP (siglip-base-patch16-224) | Visual embeddings for re-ID | ~350MB |
| MediaPipe Pose Landmarker Lite | Per-player 33-point pose | ~4MB |
| UMAP + KMeans | Team clustering | (scikit-learn) |

### Processing Steps

| Step | Function | Output |
|------|----------|--------|
| 1 | `extract_frames()` | Video frames at target FPS |
| 2 | `run_yolo_detection()` | Player/ball detections with ByteTrack IDs |
| 3 | `run_pose_estimation()` | 33-point keypoints per player crop |
| 4 | `crop_players()` | Player image crops + HSV color histograms |
| 5 | `extract_siglip_embeddings()` | 768D L2-normalized embeddings |
| 6 | `cluster_teams()` | UMAP 2D projection → KMeans (k=2) |
| 7 | `assign_team_ids()` | Team IDs propagated to all detections |
| 8 | `fingerprint_and_merge_tracks()` | Multi-signal track merging |
| 9 | `filter_non_players()` | Remove refs/spectators |
| 10 | `compute_player_stats()` | Per-player metrics + paths |
| 11 | `compute_possession_timeline()` | Ball possession per frame |
| 12 | `extract_key_frames()` | Ball contacts + direction changes |

### Track Merging (Multi-Signal)

| Signal | Weight | Threshold |
|--------|--------|-----------|
| SigLIP embedding cosine similarity | 45% | ≥ 0.70 |
| HSV color histogram intersection | 30% | ≥ 0.25 |
| Spatial continuity (sprint speed check) | 25% | ≥ 0.10 |

Combined threshold: 0.78. Same-team constraint. Score-ranked greedy matching.

### Triage Mode (`--triage`)

- Samples 5 frames, YOLOv8 only
- Returns: avgPersonCount, hasBall, suggestedMode ("match" if avg≥3 or max≥4)

### Output JSON Structure

```json
{
  "detections": [{ "timestamp", "players": [{ "bbox", "confidence", "teamId", "trackId", "isPlayer", "keypoints" }], "ball", "referees" }],
  "ballTrajectory": [{ "timestamp", "x", "y" }],
  "teams": { "count": 2, "labels": ["Team A", "Team B"] },
  "playerPaths": { "trackId": [{ "timestamp", "x", "y" }] },
  "playerStats": { "trackId": { "teamId", "firstSeen", "lastSeen", "framesVisible", "avgBallDistance", "minBallDistance", "possessionFrames" } },
  "possessionTimeline": [{ "timestamp", "teamId", "playerId", "distance" }],
  "keyFrames": [{ "timestamp", "type", "playerId" }],
  "mergedTracks": { "oldId": "newId" },
  "filteredTracks": [nonPlayerIds],
  "processingMeta": { "fps", "framesProcessed", "uniquePlayersTracked", "ballDetections", "tracksMerged", "nonPlayersFiltered", ... }
}
```

---

## Infrastructure

### Docker (Production)

- **Base**: node:18-slim
- **System packages**: nginx, python3, python3-pip, yt-dlp
- **ML models pre-downloaded**: YOLOv8n, SigLIP, MediaPipe Pose Lite
- **Static files**: Copied to `/app/public/` (shared/, video-analysis/)
- **Port**: 8080

### Nginx

- Port 80 → proxies `/api/*` to Express (localhost:8080)
- Static files from `/app/public/`
- SPA fallbacks for `/` and `/video-analysis/`
- SSE support for `/api/video/focus-stream` (buffering disabled)
- Upload limit: 100MB
- Timeouts: 300s for API proxy

### Cloud Run Deployment

- Region: us-central1
- Resources: 4Gi memory, 2 CPU, 300s timeout
- Access: Unauthenticated
- IAM roles: `roles/aiplatform.user`, GCS `objectAdmin`, `roles/datastore.user`

### Dependencies

**Node.js (package.json):**
- `express`, `cors`, `dotenv`, `multer`, `uuid`
- `@google/genai` (Vertex AI)
- `@google-cloud/storage`, `@google-cloud/firestore`
- `googleapis` (YouTube)

**Python (requirements.txt):**
- `ultralytics` (YOLOv8), `transformers` + `torch` (SigLIP)
- `umap-learn`, `scikit-learn` (clustering)
- `opencv-python-headless`, `mediapipe` (computer vision)
- `numpy`, `Pillow`

**CDN (browser, no bundling):**
- MediaPipe Holistic, Camera Utils, Drawing Utils
- Font Awesome 6.4.2
