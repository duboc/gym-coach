# 2026-03-09: Biomechanics Prompts, Technique Metrics & Player Fingerprinting

## 1. Gemini Prompts — Biomechanics Tuning

### Problem
- 4 techniques (Outside Foot Pass, Heading, Volley Kick, Throw-In) fell through to a generic default context in the client provider.
- `createVideoAnalysisPrompt` lacked sport-specific biomechanics criteria — Gemini gave generic coaching feedback.
- `createPlayerTechniquePrompt` asked for "technique assessment" without telling Gemini what good football biomechanics looks like.

### Changes

**`server.js`**
- Added `getTechniqueSpecificGuide(technique)` — returns per-technique biomechanics evaluation criteria with exact joint angles, kinetic chain checkpoints, contact surfaces, and common mechanical faults. Covers all 8 techniques: Instep Kick, Inside Foot Pass, Outside Foot Pass, Dribbling Posture, Heading Technique, Volley Kick, Throw-In, Goalkeeper Stance.
- `createVideoAnalysisPrompt` now includes a `BIOMECHANICS EVALUATION FRAMEWORK` (auto-detect mode) or technique-specific guide (known technique). Added a new `PHASE_BREAKDOWN` response section asking Gemini to decompose the movement into biomechanical phases with specific angles and timing.
- `createPlayerTechniquePrompt` now includes a `BIOMECHANICS ANALYSIS GUIDE` instructing Gemini to evaluate kinetic chain, joint angles at contact, plant foot positioning, deceleration mechanics, and landing mechanics. References specific MediaPipe landmark indices (11-12 shoulders, 23-24 hips, 25-26 knees, 27-28 ankles). Responses must include biomechanical evidence rather than generic statements.

**`football/script.js`**
- Added detailed `exerciseContext`, `formCriteria`, `commonErrors`, and `breathingTechnique` for the 4 missing techniques in the `setExerciseContextProvider` mapping.
- Registered `audioCoach.registerExercisePhrases()` for Outside Foot Pass, Heading Technique, Volley Kick, and Throw-In with technique-specific form cues and corrections.

---

## 2. Technique Metrics — Fast Movement Accuracy

### Problem
- `smoothAngle()` used a fixed weight of 0.2 (only 20% of new reading), causing massive lag on fast movements like kicks (~300ms duration). Outlier rejection discarded legitimate rapid angle changes.
- `calculateMovementDynamics()` only tracked upper body (wrists, elbows) — useless for football.
- State machine timeout (3s) was too slow for kicks (300-500ms).
- Forced transition logic referenced gym concepts ("bicep curls", "down/up" states, elbow angles).
- Visualization overlay showed Bicep Curl and Shoulder Press angles instead of football joints.

### Changes

**`shared/pose-utils.js`**
- Added `smoothAngleFast(newAngle, previousAngles, baseWeight)` — adaptive smoothing that increases weight when angular velocity is high. Fast movements (>15°/frame delta) use 60-85% of the new reading and skip outlier rejection. Slow movements fall back to standard filtered smoothing.
- Added `angularVelocity(previousAngles, fps)` — instantaneous angular velocity in °/s from the last 2 samples.
- Added `peakAngularVelocity(previousAngles, fps)` — finds peak angular velocity over the full history window. Key metric for kick power assessment.

**`football/technique-metrics.js`**
- Updated imports and re-exports to include `smoothAngleFast`, `angularVelocity`, `peakAngularVelocity`.

**`football/script.js`**
- Expanded `angleHistory` with lower body joints: `rightHip`, `leftHip`, `rightKnee`, `leftKnee`, `rightAnkle`, `leftAnkle`.
- Reduced state machine `maxDuration` from 3000ms to 1500ms.
- `calculateMovementDynamics()` now tracks lower body landmarks (ankles, knees, hips) plus wrists.
- State machine timeout recovery rewritten: checks hip/knee angles and transitions to `backswing` instead of gym states (`down`/`up`).
- Forced transition logic checks `hipMobility` and `kneeAction` metrics instead of `rightElbow`.
- Visualization overlay replaced: now shows R/L Hip and R/L Knee angles using `smoothAngleFast` with ideal ranges pulled from technique metrics, plus angular velocity (°/s) in the debug overlay.

---

## 3. Player Fingerprinting — Improved Re-Identification

### Problem
- Track merging used only SigLIP embedding mean similarity (single signal), causing:
  - Same-team false merges (players in identical kits score >0.82).
  - Cross-pitch false merges (no spatial plausibility check).
  - Mean embedding flattened pose variation (front vs back views averaged poorly).
- Only 3 crops per track — insufficient for robust fingerprinting.
- Unsampled frames got `teamId=-1` with no fallback.

### Changes

**`ml_pipeline.py`**

- **New `extract_color_histogram(crop_bgr)`** — extracts a 48-bin HSV histogram from the torso region (middle 60% of height, center 60% of width) to capture jersey/shorts color while ignoring head and legs. HSV color space is more robust to lighting changes than RGB.

- **`crop_players()`** — increased `min_per_track` from 3 to 5. Each crop now includes a `color_hist` field alongside the PIL image.

- **Rewritten `fingerprint_and_merge_tracks()`** — multi-signal scoring replaces single-threshold matching:
  - **SigLIP embedding cosine similarity** (45% weight) — deep visual features.
  - **Color histogram intersection** (30% weight) — jersey color is stable across poses, angles, and occlusions. Two players in different jerseys will never falsely merge.
  - **Spatial continuity** (25% weight) — validates that the last known position of track A can physically reach track B's first position given the frame gap. Uses max sprint speed (~0.15 normalized units/frame at 2fps). Teleportation = score 0.
  - **Same-team constraint** — gate: never merges players from different teams.
  - **Minimum per-signal thresholds** — embedding ≥ 0.70, color ≥ 0.25, spatial ≥ 0.1 (before combined score is even checked).
  - **Score-ranked greedy matching** — best-scoring pairs merge first, preventing cascade errors.
  - **Merge chain resolution** — follows `merge_map` chains to canonical IDs when applying merges.
  - Overall threshold lowered from 0.82 to 0.78 since multi-signal scoring is more reliable than single-signal.

- **`assign_team_ids()`** — unsampled frames now inherit the track's majority team vote instead of getting `teamId=-1`. Builds a per-track team vote from sampled crops and propagates to all detections sharing that track ID.

### Impact Summary

| Problem | Before | After |
|---------|--------|-------|
| Same-team false merge | Only embedding similarity | + color histogram distinguishes individuals |
| Cross-pitch false merge | No spatial check | Spatial continuity rejects teleportation |
| Different-team merge | No constraint | Same-team gate blocks it |
| Unsampled frames missing team | `teamId = -1` | Majority vote propagation |
| Too few samples per track | 3 crops | 5 crops |
| Single point of failure | 1 signal (embed ≥ 0.82) | 3 signals weighted + per-signal minimums |

---

## Files Modified

| File | Changes |
|------|---------|
| `server.js` | Added `getTechniqueSpecificGuide()`, enhanced video analysis + player technique prompts |
| `football/script.js` | 4 missing technique contexts, audio phrases, lower body tracking, fast smoothing, fixed state machine |
| `football/technique-metrics.js` | Updated imports/exports for new pose utils |
| `shared/pose-utils.js` | Added `smoothAngleFast`, `angularVelocity`, `peakAngularVelocity` |
| `ml_pipeline.py` | Added color histogram, rewrote fingerprint merging, improved team propagation |
