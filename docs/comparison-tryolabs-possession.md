# Comparison: Our Platform vs Tryolabs Soccer Possession System

> Reference: https://tryolabs.com/blog/2022/10/17/measuring-soccer-ball-possession-ai-video-analytics
> Authors: Alan Descoins, Diego Marvid (Tryolabs)
> Analysis date: 2026-03-09

## Their Approach Summary

Tryolabs built an open-source demo that computes ball possession from soccer match video using classical CV + deep learning. The system breaks the problem into 4 sequential steps.

### Pipeline

```
Video → YOLOv5 (player detection) + YOLOv5-finetuned (ball detection)
  → Norfair tracking (link detections across frames)
  → HSV color filtering on jersey crops (team classification)
  → Classification inertia (stabilize team assignment over N frames)
  → Closest-foot-to-ball distance (possession assignment)
  → Possession inertia (require K consecutive frames to change possession)
  → Scoreboard overlay + ball trail + pass detection
```

### Key Technical Insights

#### 1. Two Definitions of Ball Possession
- **Pass-based**: possession = team passes / total passes. Simple but ignores dwell time.
- **Time-based**: track a clock per team. More accurate (used by FIFA). Their system implements time-based.
- Statistical backing: teams with more possession won 49.2% of 625 UEFA Champions League matches.

#### 2. HSV Color Filtering for Team Assignment
Instead of clustering (KMeans on RGB like the Khushal repo), they use predefined HSV ranges:
- Crop the player bbox to jersey region only (specific percentage of height)
- Apply HSV color filter per team (hue selects color type independent of brightness)
- Median blur to remove noise
- Count non-black pixels per filter
- Highest count wins

**Pros:** Very fast, no model needed, works when jersey colors are distinct.
**Cons:** Requires manual HSV range configuration per match. Fails with similar colors.

#### 3. Classification Inertia (Temporal Smoothing)
A player's team assignment uses the **mode of the last N classifications** instead of per-frame voting:
- If inertia = 20 at 25 FPS, uses ~0.8s history
- Prevents flickering from occlusions or bbox noise
- But can't be infinite — tracker ID swaps need correction time
- Principle: "a player can't change teams during a match"

**This is something we should adopt.** Our SigLIP-based team assignment is per-crop, with majority vote per track, but no temporal smoothing within the track.

#### 4. Possession Inertia (State Machine)
Ball possession doesn't change on a single frame — requires **K consecutive frames** where the other team's player is closest:
- Prevents false possession changes during rebounds
- Prevents possession flickering when ball passes near opponents
- Requires consecutive frames (interrupted sequences reset the counter)

**This is a significant improvement over our approach.** Our `compute_possession_timeline()` assigns possession frame-by-frame to the nearest player — no inertia. A ball rolling past a defender gets momentarily "assigned" to them even though they never touched it.

#### 5. Ball Trail with Camera Compensation
They use Norfair's camera motion estimation to draw ball trails that stay anchored to pitch positions even when the camera pans. Without this, trails would be drawn in pixel coordinates and shift with camera movement.

#### 6. Pass Detection
They define a pass as: ball changes from one player to another **on the same team**. Since they track who has the ball at each frame and know each player's team, pass detection falls out naturally. They draw arrow overlays for each detected pass.

**We don't have pass detection.** This would be a straightforward addition given our existing data.

#### 7. Separate Ball Detection Model
They found generic COCO "sports ball" class insufficient for small, fast-moving soccer balls. They finetuned YOLOv5 on a custom dataset of soccer match footage created with LabelImg.

**Same issue we face.** Our `yolov8n.pt` uses COCO class 32 (sports ball) which often misses the ball at broadcast distances.

### Their Acknowledged Limitations
- Ball detection model not robust enough
- Player detection fails in tight groups / occlusions
- Team classification needs improvement
- **Breaks if camera vantage point changes** (close-ups, replays)
- Doesn't detect special events (corners, free kicks, injuries) — clock should pause
- Not suitable for production use without significant improvements

---

## Feature Comparison

| Feature | Tryolabs | Our Platform |
|---------|----------|-------------|
| Player detection | YOLOv5 (COCO) | YOLOv8n (COCO) |
| Ball detection | YOLOv5 finetuned on soccer footage | YOLOv8n generic (COCO class 32) |
| Tracking | Norfair | ByteTrack (ultralytics) |
| Team assignment | HSV color filtering + inertia | SigLIP embeddings + HSV histograms + UMAP/KMeans |
| Classification stabilization | Temporal mode over last N frames | Track-level majority vote (no temporal smoothing) |
| Possession method | Time-based with inertia (K consecutive frames) | Frame-by-frame nearest player (no inertia) |
| Possession display | Live scoreboard overlay | Percentage bar + possession flow chart |
| Ball interpolation | Not mentioned | Not implemented |
| Pass detection | Yes (ball changes player, same team) | Not implemented |
| Ball trail | Yes (camera-compensated) | Yes (not camera-compensated) |
| Camera compensation | Norfair motion estimation | Not implemented |
| AI analysis | None | Gemini (tactical, per-player, biomechanics) |
| Pose estimation | None | MediaPipe 33-point |
| Long video support | Manual trimming | Not implemented (to be added) |
| Camera cut detection | Not handled (acknowledged limitation) | Not implemented |

---

## Improvements to Adopt

### P0 — Possession Inertia
**Problem:** Our possession flickers. Ball rolling past a defender = momentary false possession change.

**Solution:** Require K consecutive frames (e.g., K=10 at 2fps = 5 seconds) where the other team is closest before switching possession. Reset counter on interruption.

### P0 — Pass Detection
**Problem:** We detect ball contacts but don't classify them as passes.

**Solution:** When ball goes from Player A (Team X) → Player B (Team X), that's a completed pass. When Player A (Team X) → Player B (Team Y), that's a turnover. We have all the data — just need the logic.

### P1 — Team Classification Inertia
**Problem:** Our track-level majority vote assigns team once based on sampled crops. If a track gets a bad sample, it's wrong for the entire track.

**Solution:** Per-frame team classification with temporal smoothing (mode of last N). This also handles the edge case where a track merge reassigns an ID — the inertia system would self-correct.

### P1 — Camera Cut Detection
**Problem:** Both Tryolabs and our system break on camera angle changes (close-ups, replays). For long videos (full matches), this is critical.

**Solution:** Detect camera cuts by measuring frame-to-frame histogram difference. When a cut is detected: pause possession clock, don't track across the cut, skip close-up segments. This is essential for long video support.

### P2 — Custom Ball Detection Model
**Problem:** Generic COCO "sports ball" class misses small, fast-moving soccer balls at broadcast distances.

**Solution:** Finetune YOLOv8 on soccer ball dataset. Could use Roboflow's public football datasets.

---

## Key Takeaway

The Tryolabs article reinforces that **inertia/temporal smoothing is crucial** at every stage:
1. Team classification inertia (don't let one bad frame change a player's team)
2. Possession inertia (don't let a ball rolling past change possession)
3. Pass detection needs both (ball must cleanly transfer between players)

Our system is more sophisticated in detection (SigLIP embeddings, multi-signal merging) but lacks the temporal reasoning that makes the outputs stable and meaningful. Adding inertia to possession + team classification would significantly improve our match analysis quality.
