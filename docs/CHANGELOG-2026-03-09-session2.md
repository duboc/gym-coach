# 2026-03-09 Session 2: P1 Features, Performance Optimizations & YouTube Direct Input

## 1. P1 Feature Implementations (ml_pipeline.py)

All P1 features from the comparison matrix are now implemented.

### Camera Movement Compensation
- `estimate_camera_movement()` — Lucas-Kanade optical flow on frame edge regions (left/right 20px strips)
- Tracks static background features (stadium boards) to isolate camera pan from player movement
- Uses median displacement with 2px noise threshold
- Returns per-frame `{dx, dy}` normalized to 0-1 coordinates

### Camera Cut Detection
- `detect_camera_cuts()` — HSV histogram correlation between consecutive frames
- Correlation below 0.6 threshold = camera cut
- Prevents interpolation across cuts (players teleport between angles)

### Speed & Distance Estimation
- `compute_speed_distance()` — camera-compensated positions mapped to pitch dimensions (105x68m)
- Sliding window speed calculation with sanity filters (max 40 km/h, max 15m per frame jump)
- Adds `avgSpeedKmh`, `topSpeedKmh`, `totalDistanceM` to player stats

### Team Classification Inertia
- `apply_team_classification_inertia()` — sliding window mode of last 10 frames per track
- Prevents team assignment flickering when player orientation changes

### Possession Inertia
- `compute_possession_timeline()` rewritten with state machine requiring 5 consecutive frames before switching possession team
- Uses bottom-center of bbox (feet) for distance calculation

### Pass Detection
- `detect_passes()` — classifies ball transfers as passes (same team) or turnovers (different team)
- Results displayed in events distribution chart and new pass stats panel

---

## 2. Player Tracking Smoothness

### Cubic Hermite Spline Interpolation (video-overlay.js)
- `findMlFrameInterpolated()` rewritten — replaces linear lerp with cubic Hermite spline
- Uses velocity from previous frame for smoother curves through direction changes
- Hermite basis functions: h00, h10, h01, h11 for position + velocity continuity
- Camera cut protection: snaps to nearest frame instead of interpolating across cuts

### ML Pipeline FPS Increase
- `ML_ANALYSIS_FPS`: 2 → 4 (halves the interpolation gap from 0.5s to 0.25s)
- `--max-crops`: 150 → 300 (more samples for fingerprinting)

---

## 3. Client-Side Performance

### Skip MediaPipe for Match Videos (script.js)
- Match-mode or videos >5min skip client-side MediaPipe entirely
- Server-side ML pipeline already does pose estimation
- Prevents blocking main thread with 89,000+ frames for a 99-min match

---

## 4. Large File Support

### Server Changes
- `MAX_VIDEO_SIZE_MB`: 100 → 2000 (in code default and .env)
- `MAX_VIDEO_DURATION_SECONDS`: 300 → 7200 (2 hours)
- multer: `memoryStorage()` → `diskStorage()` with streaming GCS upload
- Resumable upload for files >5MB
- `execSync maxBuffer`: 10MB → 200MB
- yt-dlp: added `--no-progress` to prevent stdout buffer overflow

### Nginx / Deployment
- `client_max_body_size`: 100M → 2000M
- proxy timeouts: 300s → 1800s
- Cloud Run timeout: 300s → 1800s

---

## 5. YouTube Direct URL/ID Input

### New Server Endpoint
- `GET /api/youtube/info/:videoId` — fetches video metadata (title, channel, duration, thumbnail, views) from YouTube Data API by video ID

### Client Changes (script.js)
- `parseYouTubeVideoId(input)` — extracts video ID from multiple formats:
  - Bare ID: `CGFgHjeEkbY`
  - Full URL: `youtube.com/watch?v=ID`
  - Short URL: `youtu.be/ID`
  - Embed/shorts: `youtube.com/embed/ID`, `youtube.com/shorts/ID`
- `loadYouTubeByUrl()` — fetches video info from server, populates selection UI
- Event listeners for Load button and Enter key

### UI (index.html + styles.css)
- Direct URL input bar above search bar with "or search" divider
- `.youtube-direct-bar` and `.youtube-divider` styling
- Responsive stacking on small screens

---

## 6. Overlay Enhancements (video-overlay.js)

- Gold inverted triangle above possessing player (from possessionTimeline)
- Speed label at player feet (green `avgSpeedKmh km/h`)
- Red "CAMERA CUT" overlay when `mlFrame.cameraCut` is true

---

## 7. Match Charts (match-charts.js)

- `renderEventsDistribution()` — pass/turnover events added to bins
- `renderPassStats()` — new panel: total passes, turnovers, per-team breakdown with percentage bars
- `renderProcessingStats()` — shows ball interpolation and camera cut counts
- `renderPlayerComparison()` — bar labels include `totalDistanceM` and `topSpeedKmh`

---

## Files Modified

| File | Changes |
|------|---------|
| `ml_pipeline.py` | Camera compensation, cuts, speed/distance, team inertia, possession inertia, passes |
| `shared/video-overlay.js` | Cubic Hermite spline interpolation, possession indicator, speed labels, camera cut overlay |
| `shared/match-charts.js` | Pass stats, processing stats, distance/speed in player comparison |
| `video-analysis/script.js` | Skip MediaPipe for matches, YouTube direct URL, pass data to charts |
| `video-analysis/index.html` | YouTube direct URL input bar, pass stats container |
| `video-analysis/styles.css` | Direct bar, divider, pass stats styling |
| `server.js` | YouTube info endpoint, large file support, --no-progress, disk storage |
| `nginx.conf` | 2000M upload, 1800s timeouts |
| `deploy-to-cloud-run.sh` | 1800s timeout |
| `.env` | MAX_VIDEO_SIZE_MB=2000, MAX_VIDEO_DURATION_SECONDS=7200 |
