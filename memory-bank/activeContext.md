# Active Context: Football Video Analysis

## Current Focus

The project is currently focused exclusively on the **Football Video Analysis** module. The application is designed to help football players and coaches analyze athletic techniques (like kicking, dribbling) by uploading videos or importing them from YouTube, extracting pose data via MediaPipe, and generating AI-driven coaching feedback using Gemini.

The current focus is on:
- Refining the Football video analysis UI located in `/video-analysis/`.
- Perfecting the technique metrics and phase detection (e.g., identifying the exact moment of ball contact) in `/football/`.
- Stabilizing the YouTube search and import pipeline handled by the Node.js backend.
- Ensuring the AI prompts sent to Gemini accurately interpret fast-motion sports biomechanics.

## Recent Changes

- **Autonomous Analysis Pipeline**: Removed manual selection of "Match" vs "Technique" mode and manual technique dropdowns. The system now automatically identifies the video type (via a rapid YOLOv8 triage) and detects the exact technique being performed.
- **Dual Pipeline Processing**: Modified the workflow to always run both the ML tactical pipeline and the MediaPipe technique pipeline in parallel for every video. Both results are now presented in tabbed views.
- **Deep Per-Player Analysis**: Added an on-demand `/api/video/analyze-player` endpoint. Clicking a tracked player triggers a deep dive into that specific player's technique, cached locally in a slide-out panel.
- **Advanced Track Management**: Added track fingerprinting (SigLIP embeddings) to merge broken player tracks, and added non-player filtering to dim referees and coaches in the visual overlay.
- **YouTube Integration**: Node.js backend handles search, proxying, and downloading YouTube videos to bypass CORS for MediaPipe analysis.

## Active Decisions

### Autonomous Dual Pipeline

**Decision**: Instead of making the user choose the analysis mode upfront, process both match and technique data in parallel. Use a 5-frame YOLOv8 triage to auto-detect the video context, determining which tab to display first.

### On-Demand Compute

**Decision**: Running full Gemini analysis for every single player in a match would be too slow/expensive. Thus, per-player technique analysis is strictly on-demand. Only when a user clicks "Analyze Technique" on a specific player does the server request the player-specific LLM analysis.

### Video Source Handling

**Decision**: Instead of processing live webcam data, the system processes pre-recorded video files or downloaded YouTube clips. This allows for the analysis of high-speed athletic movements where pausing, scrubbing, and phase detection (e.g., the plant foot phase) are critical.

### CORS and YouTube Proxying

**Decision**: Because HTML5 Canvas cannot extract pixel data from cross-origin video streams (like YouTube embedded players) without tainting the canvas, the Node.js backend must download the video and serve it locally to the client.

### AI Feedback Context

**Decision**: The Gemini prompt includes specific domain context (e.g., "This is a football instep kick. Evaluate the plant foot distance, knee over ball, and torso lean.") so the LLM can tailor its coaching cues to sports biomechanics rather than general fitness.

## Next Steps

### Short-term

1. Fix missing detailed contexts for specific techniques (Outside Foot Pass, Heading, Volley Kick, Throw-In) in the client provider which currently fall back to generic defaults.
2. Update `createVideoAnalysisPrompt` and `createPlayerTechniquePrompt` to include rigorous biomechanics criteria (angles, phases, body positions) so Gemini can provide better technique assessment.
3. Review and refine the Football technique metrics (`football/technique-metrics.js`) to ensure they capture the nuances of high-speed kicking mechanics accurately.
4. Stabilize the YouTube video import pipeline in `server.js` to handle different video formats, resolutions, and potential copyright/age-restriction errors gracefully.
5. Polish the UI for the `/video-analysis/` dashboard to make scrubbing the video timeline and viewing frame-by-frame data intuitive.

### Medium-term

1. Expand the Football module to include more techniques (e.g., heading, goalkeeper stances, passing).
2. Implement side-by-side video comparison (e.g., comparing user form to a professional player's form imported from YouTube).
3. Enhance the phase detection algorithms to automatically trim videos to just the relevant athletic action.

## Current Challenges

1. **Video Frame Dropping (Motion Blur)**: Fast movements in football kicks often cause motion blur in standard 30fps videos, which can cause MediaPipe to drop or misplace landmarks.
2. **Backend Video Download**: YouTube import occasionally fails or takes too long depending on the length and quality of the source video.
3. **Phase Detection Accuracy**: Automatically detecting the exact frame of "ball contact" without tracking the ball itself relies heavily on identifying peak foot velocity and sudden deceleration, which requires fine-tuning.
