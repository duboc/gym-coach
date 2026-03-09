# Comparison: Our Platform vs Khushal-gupta22/Football-Analysis

> Reference repo: https://github.com/Khushal-gupta22/Football-Analysis
> Analysis date: 2026-03-09

## Overview

| Aspect | Football-Analysis (Reference) | Our Platform |
|--------|-------------------------------|-------------|
| Architecture | Offline Python script, CLI-only | Web app (Express + browser) with API |
| Output | Annotated `.avi` video file | Interactive browser playback with overlays |
| Detection | YOLOv8 (custom-trained `best.pt`) | YOLOv8n (pretrained) |
| Tracking | supervision ByteTrack | ultralytics ByteTrack |
| Team Assignment | KMeans on RGB jersey pixels | SigLIP embeddings + UMAP/KMeans |
| Re-identification | None (relies on ByteTrack persistence only) | Multi-signal: SigLIP + HSV histogram + spatial continuity |
| Ball tracking | Pandas interpolation + backfill | Nearest-player possession per frame |
| Camera movement | Lucas-Kanade optical flow + homography | Not implemented |
| View transform | Perspective transform (pixel → meters) | Not implemented |
| Speed/distance | Euclidean on transformed coords (km/h, meters) | Not implemented |
| AI analysis | None | Gemini biomechanics, tactical, per-player, events, possession |
| Pose estimation | None | MediaPipe 33-point (browser + ML pipeline) |
| Real-time | None | Camera-based technique coaching with audio |
| Storage | Local filesystem + pickle stubs | GCS + Firestore + browser localStorage |

---

## What They Have That We Don't

### 1. Camera Movement Compensation

**What it does:** Uses Lucas-Kanade optical flow to estimate how much the camera pans between frames. Subtracts camera movement from player positions so that speed/distance calculations reflect actual player movement, not camera movement.

**Their implementation:**
- `CameraMovementEstimator` class
- Tracks corner features in edge regions of the frame (columns 0-20 and 900-1050)
- Uses `cv2.calcOpticalFlowPyrLK()` (sparse optical flow) between consecutive frames
- Computes max displacement vector per frame
- Applies 5px minimum distance threshold to filter noise
- Adjusts all player positions: `position_adjusted = position - camera_movement`

**Why we need it:** Without camera compensation, our player paths and speed estimates are corrupted by camera panning. A pan of 50px looks like every player sprinted sideways. This is critical for accurate speed/distance metrics and for the pitch map visualization.

**Effort to add:** Medium. Core algorithm is ~60 lines of OpenCV. Main work is integrating it into `ml_pipeline.py` after YOLO detection and before stats computation.

---

### 2. Perspective View Transform (Pixel → Real-World Coordinates)

**What it does:** Converts pixel coordinates to real-world meters using a 4-point perspective transform. Maps the visible pitch trapezoid to a rectangular field coordinate system.

**Their implementation:**
- `ViewTransformer` class
- Hardcoded 4 pixel vertices (corners of visible pitch area)
- Maps to real court dimensions (68m wide × 23.32m visible length)
- Uses `cv2.getPerspectiveTransform()` to compute homography matrix
- `cv2.pointPolygonTest()` to reject points outside the visible pitch
- `cv2.perspectiveTransform()` to map individual points

**Limitations of their approach:**
- Pixel vertices are hardcoded for one specific video/camera angle
- No auto-detection of pitch lines
- `court_length = 2.32` appears to be a typo (should be 23.2m or similar)

**Why we need it:** Our pitch map currently uses normalized 0-1 coordinates from YOLO bounding boxes. This means distances are in "frame fractions" not meters, making speed calculations meaningless and pitch maps distorted by camera perspective.

**Effort to add:** Medium-High. The core transform is simple (~40 lines), but auto-detecting pitch corner points from the video is the hard part. Could use Gemini to identify pitch landmarks, or require user to mark 4 corners in the UI.

---

### 3. Speed and Distance Estimation

**What it does:** Calculates each player's instantaneous speed (km/h) and total distance covered (meters) using camera-compensated, perspective-transformed positions.

**Their implementation:**
- `SpeedAndDistanceEstimator` class
- Sliding window of 5 frames (at 24fps ≈ 0.2s windows)
- Distance: Euclidean between transformed positions (in meters)
- Speed: `distance / time_elapsed * 3.6` (m/s → km/h)
- Accumulates total distance per player across all windows
- Renders speed/distance text at each player's foot position

**Dependency chain:** Requires camera compensation + view transform first.

**Why we need it:** Speed and distance are the most intuitive physical metrics for coaches. "Player X covered 10.2km" and "top speed 32 km/h" are standard match stats. Our `playerStats` currently only tracks `framesVisible` and `possessionFrames` — no physical performance data.

**Effort to add:** Low (once camera + view transform are in place). The calculation itself is ~30 lines.

---

### 4. Ball Position Interpolation Through Occlusions

**What it does:** When the ball is not detected in a frame (occluded by player, out of frame, etc.), it fills in the missing positions using interpolation.

**Their implementation:**
- Collects all ball bbox positions into a Pandas DataFrame
- Uses `df.interpolate()` for linear interpolation between known positions
- Uses `df.bfill()` to backfill any remaining NaN at the start
- Result: continuous ball position for every frame

**Our current approach:** We only store ball positions when YOLOv8 detects the ball. Gaps in `ballTrajectory` mean no ball rendering and broken possession tracking for those frames.

**Why we need it:** Ball visibility is typically 40-60% of frames. Without interpolation, our possession timeline has large gaps, and the ball trail overlay is fragmented.

**Effort to add:** Low. ~10 lines. Can use numpy interp or a simple linear fill on our existing `ballTrajectory` array.

---

### 5. Custom-Trained YOLO Model

**What it does:** They trained YOLOv8 on football-specific datasets (Kaggle DFL Bundesliga + Roboflow) to detect `player`, `goalkeeper`, `referee`, and `ball` as separate classes.

**Their implementation:**
- Custom `best.pt` model (not the generic `yolov8n.pt`)
- Separate class for goalkeeper (merged with player in tracking)
- Separate class for referee (drawn differently, excluded from stats)
- Trained with confidence threshold 0.1 (aggressive detection)

**Our current approach:** We use generic `yolov8n.pt` which detects COCO class 0 (person) and class 32 (sports ball). We can't distinguish players from referees or goalkeepers natively — we rely on SigLIP embedding outlier detection to filter non-players.

**Why we could benefit:** A custom model would give us referee detection directly (instead of our heuristic filtering), better ball detection (sports ball is often missed at small sizes), and goalkeeper identification.

**Effort to add:** High. Requires dataset preparation, training infrastructure, and model hosting. Our SigLIP-based filtering is a reasonable workaround for now.

---

### 6. Ball Possession Indicator (Per-Player)

**What it does:** Marks which specific player has the ball in each frame, and draws a triangle marker above that player.

**Their implementation:**
- `PlayerBallAssigner` class
- Measures distance from ball center to both bottom corners of each player bbox
- Takes minimum of left/right foot distances
- Assigns to nearest player within 70px threshold
- Draws inverted triangle above possessing player
- Tracks cumulative team possession percentage

**Our current approach:** We compute possession in `compute_possession_timeline()` using nearest player to ball, but:
- We don't visually mark the possessing player in the overlay
- We don't show per-frame "who has the ball" — only aggregate stats

**Why we need it:** Visual ball possession is immediately useful for coaches reviewing footage. "Who had the ball at this moment?" is a fundamental question.

**Effort to add:** Low. We already compute nearest player — just need to add the visual indicator to `video-overlay.js`.

---

## What We Have That They Don't

| Feature | Details |
|---------|---------|
| **Web-based UI** | Browser app vs CLI script — no installation needed for end users |
| **AI-powered analysis** | Gemini biomechanics, tactical analysis, per-player assessments — they have zero AI |
| **Pose estimation** | MediaPipe 33-point pose per player — they have no skeletal data |
| **Real-time coaching** | Camera-based live technique analysis with audio feedback |
| **YouTube integration** | Search + import videos directly |
| **Player re-identification** | Multi-signal track merging (SigLIP + color + spatial) vs ByteTrack only |
| **6 visualization modes** | Skeleton, angles, paths, tactical, detection, full — they only draw ellipses + triangles |
| **Focus mode** | Progressive SSE-streaming per-player analysis |
| **Persistence** | Save/load analyses with Firestore + GCS |
| **Team color fingerprinting** | HSV histogram on torso region — more robust to lighting than RGB pixel KMeans |
| **Non-player filtering** | SigLIP outlier detection removes refs/spectators automatically |
| **Technique analysis** | 8 football techniques with state machines, metrics, rep counting |
| **Match charts** | Pitch map, possession flow, player comparison, events distribution — pure SVG, no external lib |
| **Events timeline** | Gemini-detected match events with clickable seek |
| **Cloud deployment** | Docker + Cloud Run — they only run locally |

---

## Improvement Priority Matrix

| Improvement | Impact | Effort | Priority |
|------------|--------|--------|----------|
| Ball interpolation through occlusions | High — fixes fragmented possession tracking | Low (~10 lines) | **P0** |
| Ball possession visual indicator | Medium — immediate visual feedback | Low (~20 lines in overlay) | **P0** |
| Camera movement compensation | High — required for accurate speed/distance | Medium (~80 lines + integration) | **P1** |
| Speed and distance estimation | High — fundamental match stats | Low (once camera comp. exists) | **P1** |
| Perspective view transform | High — enables real-world measurements | Medium-High (auto-detection is hard) | **P2** |
| Custom-trained YOLO model | Medium — better referee/GK detection | High (dataset + training) | **P3** |

### Recommended Implementation Order

1. **Ball interpolation** — Quick win, fixes possession gaps
2. **Ball possession visual indicator** — Quick win, draws triangle/circle on possessing player
3. **Camera movement compensation** — Unlocks speed/distance features
4. **Speed and distance estimation** — Natural follow-on from camera comp.
5. **Perspective transform** — Start with manual 4-point calibration, add auto-detection later
6. **Custom YOLO** — Only if detection quality proves insufficient

---

## Technical Notes

### Their Team Assignment vs Ours

**Theirs (RGB KMeans on pixels):**
```
crop top half of player bbox →
flatten to Nx3 RGB array →
KMeans(k=2) to separate jersey from background →
corner pixels vote for background cluster →
remaining cluster center = jersey color →
all jersey colors KMeans(k=2) → team assignment
```
- Pros: Simple, fast, no GPU needed
- Cons: Fails with similar jersey colors, lighting changes, non-frontal views

**Ours (SigLIP + HSV + UMAP):**
```
crop player → SigLIP 768D embedding →
torso-region HSV 48-bin histogram →
UMAP 2D projection → KMeans(k=2) →
multi-signal track merging (embed 45% + color 30% + spatial 25%)
```
- Pros: Robust to pose variation, lighting, partial occlusion
- Cons: Requires GPU for SigLIP, slower processing

### Their Ball Tracking vs Ours

**Theirs:** Pandas DataFrame interpolation (linear between known positions, backfill for start). Simple but effective.

**Ours:** Only raw detections, no interpolation. Ball gaps cause fragmented trails and possession gaps. **Should adopt their approach.**

### Their Camera Compensation

Key insight: they track features only in the **side edges** of the frame (columns 0-20 and 900-1050) — these are typically stadium/advertising boards that are static relative to the pitch. By tracking these static features, they isolate camera pan from player movement.

Parameters: Lucas-Kanade window 15x15, pyramid level 2, goodFeaturesToTrack with quality 0.3. Minimum 5px displacement to count as camera movement.
