# Next Phase — Pickup Document

> Last updated: 2026-03-09
> Branch: `football-only`

## Current State

The platform has a complete video analysis pipeline:
1. Upload video or import from YouTube (direct URL or search)
2. Server-side ML pipeline: YOLOv8 detection + ByteTrack + SigLIP embeddings + UMAP/KMeans team clustering
3. Camera compensation, speed/distance, ball interpolation, possession tracking with inertia
4. Gemini AI analysis: tactical, per-player, events, possession
5. Interactive overlay playback with 6 visualization modes
6. Save/load analyses with Firestore + GCS

All P0 and P1 improvements from the Tryolabs/Football-Analysis comparisons are implemented.

---

## What's Been Tested

- Short technique videos (< 5 min): full pipeline including client-side MediaPipe
- YouTube search + import: working for short videos
- YouTube direct URL/ID input: endpoint working, UI wired up
- 90-minute match import (CGFgHjeEkbY): download works (~279MB), import endpoint fixed (was hitting 100MB limit from .env + stdout buffer overflow)

## What Needs Testing

- **Full 90-minute match through the complete pipeline** — the CGFgHjeEkbY Chelsea v Man City video has not yet been processed end-to-end. Expected: ~20s download, ~15-30min ML pipeline at 4fps on ~14,000 frames
- **Cubic Hermite spline smoothness** — visually verify bounding boxes track players smoothly during fast movement
- **Speed/distance accuracy** — sanity check that player speeds are realistic (8-12 km/h average, 25-35 km/h sprint)
- **Camera cut detection** — verify overlay correctly snaps instead of interpolating across angle changes
- **Pass detection accuracy** — verify pass/turnover classification makes sense
- **Save/load with new ML fields** — ensure `passEvents`, `speedDistance`, `cameraCuts` round-trip through Firestore

---

## Remaining Improvements (P2+)

### P2: Perspective View Transform
- **What:** Convert pixel coordinates to real-world meters using 4-point homography
- **Why:** Current speed/distance uses normalized coordinates mapped to assumed pitch dimensions. A proper perspective transform would give accurate real-world measurements regardless of camera angle
- **Approach options:**
  1. Manual: user marks 4 pitch corners in UI → `cv2.getPerspectiveTransform()`
  2. Semi-auto: Gemini identifies pitch line intersections from a frame → compute homography
  3. Auto: Hough line detection on pitch markings → intersect to find corners
- **Effort:** Medium-High (the transform is easy, auto-detecting corners is hard)
- **Files:** `ml_pipeline.py` (add transform step), `video-analysis/index.html` (corner picker UI if manual)

### P3: Custom YOLO Model
- **What:** Train YOLOv8 on football-specific datasets to detect `player`, `goalkeeper`, `referee`, `ball` as separate classes
- **Why:** Better referee filtering (currently using SigLIP outlier detection), better ball detection (COCO sports_ball misses small balls), goalkeeper identification
- **Datasets:** Kaggle DFL Bundesliga, Roboflow football datasets
- **Effort:** High (dataset prep, training, model hosting)

### P2: Tactical Heatmaps
- **What:** Per-player spatial heatmaps showing where they spent time on the pitch
- **Implementation:** 2D histogram of camera-compensated positions, rendered as colored grid on pitch diagram
- **Files:** `shared/match-charts.js` (new `renderPlayerHeatmap()`), `video-analysis/index.html` (container)

### P2: Formation Detection Over Time
- **What:** Detect team formation (4-3-3, 4-4-2, etc.) and how it changes during the match
- **Implementation:** Cluster player positions by team at regular intervals, classify geometric arrangement
- **Approach:** Could use Gemini to classify formation from position snapshots, or geometric heuristics
- **Files:** `ml_pipeline.py` or `server.js` (Gemini prompt)

### P2: Event Clips / Highlights
- **What:** Auto-extract short video clips around key events (goals, shots, fouls)
- **Implementation:** Use Gemini event timestamps to ffmpeg-cut clips, serve as downloadable segments
- **Files:** `server.js` (new endpoint), `video-analysis/script.js` (download buttons on events)

### P1: Improved Ball Detection
- **What:** Ball is only detected ~40-60% of frames even after interpolation. Improve raw detection rate
- **Approaches:**
  1. Lower YOLO confidence threshold for ball class (currently using default)
  2. Multi-scale detection: run YOLO at multiple resolutions
  3. Temporal: predict ball position from trajectory when YOLO misses
- **Effort:** Low-Medium

---

## Architecture Notes for Next Session

### Key File Locations
```
ml_pipeline.py              — Python ML pipeline (YOLO + SigLIP + all analytics)
server.js                   — Express API server (Gemini, YouTube, GCS, Firestore)
video-analysis/script.js    — Client pipeline orchestration
shared/video-overlay.js     — 6 overlay visualization modes
shared/match-charts.js      — SVG charts (pitch map, possession, events, players)
shared/pose-utils.js        — Angle calculation, smoothing utilities
football/script.js          — Real-time camera coaching app
football/technique-metrics.js — 8 technique state machines + metrics
```

### Processing Pipeline Order (ml_pipeline.py)
```
Video → Camera cuts → Camera movement → YOLO detection + ByteTrack →
MediaPipe pose → Player cropping → SigLIP embeddings → UMAP + KMeans →
Team assignment → Team inertia → Fingerprinting + track merging →
Non-player filtering → Ball interpolation → Player stats →
Speed/distance → Possession timeline → Pass detection → Key frames → JSON output
```

### Environment (.env)
```
GOOGLE_CLOUD_PROJECT=riojucu
GCS_BUCKET_NAME=riojucu-assets
MAX_VIDEO_SIZE_MB=2000
MAX_VIDEO_DURATION_SECONDS=7200
ML_ANALYSIS_FPS=4  (set in server.js default)
YOUTUBE_API_KEY=<set>
GEMINI_MODEL=gemini-3.1-flash-lite-preview
```

### Running Locally
```bash
./run.sh          # Express on port 8080
# or
node server.js    # Direct
```

### Known Issues / Quirks
- yt-dlp warns about missing JavaScript runtime (deno) — downloads still work via android VR player API fallback but may lose some format options
- `execSync` for yt-dlp and ml_pipeline.py blocks the Express event loop during processing — consider child_process.spawn with streaming for long videos
- ML pipeline at 4fps on a 99-min video = ~24,000 frames — expect 15-30 min processing time
- SigLIP model download happens on first run (~350MB), cached after that
- YOLOv8n model is pre-downloaded in Docker layer but needs manual download for local dev (`yolov8n.pt` in repo root)
