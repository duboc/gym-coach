# Changelog — 2026-03-04

## Autonomous Analysis Pipeline + Player Fingerprinting + Non-Player Filtering

### Summary

Removed all manual mode and technique selection from the video analysis workflow. The system now automatically detects whether a video is a match or a single-player technique clip, identifies the technique being performed, merges duplicate player tracks, and filters out non-players (referees, spectators, coaches) from analysis.

---

### Changes by File

#### `ml_pipeline.py` — ML Pipeline Enhancements

| Change | Why |
|--------|-----|
| Added `triage_video()` — quick 5-frame YOLOv8 scan | Determines match vs technique mode in <5 seconds without running the full pipeline. Uses person count heuristic: avg >= 3 or max >= 4 → match. |
| Replaced `crop_players()` with track-aware version | Old version sampled 50 random crops. New version guarantees min 3 crops per unique trackId (budget 150), ensuring every player gets enough SigLIP embeddings for reliable fingerprinting and team assignment. |
| Added `fingerprint_and_merge_tracks()` | ByteTrack assigns new IDs when a player leaves and re-enters the frame. This function computes mean SigLIP embeddings per track and merges tracks with cosine similarity >= 0.82 that don't overlap temporally, giving players consistent IDs throughout the video. |
| Added `filter_non_players()` | Referees, spectators, and coaches were contaminating team clustering (KMeans k=2) and inflating stats. This function marks embedding outliers (distance > 0.65 from both team cluster centers) and edge-dwelling short-lived tracks as non-players. |
| Updated `compute_player_stats()` and `compute_possession_timeline()` | Skip `isPlayer=False` entries so non-players don't appear in stats or possession calculations. |
| Added `--triage` CLI flag and bumped `--max-crops` default to 150 | Supports the new triage endpoint and provides enough crops for reliable fingerprinting. |

#### `server.js` — New Endpoint + Prompt Changes

| Change | Why |
|--------|-----|
| Added `POST /api/video/triage` endpoint | Frontend calls this after upload to auto-detect video type before committing to the full pipeline. Downloads from GCS, runs `ml_pipeline.py --triage`, returns JSON with suggested mode. |
| Updated `createVideoAnalysisPrompt()` for auto-detect | When `exerciseType` is `'auto-detect'` or missing, adds a `DETECTED_TECHNIQUE:` section asking Gemini to identify the technique being performed, removing the need for manual selection. |
| Changed `--max-crops` from `'50'` to `'150'` | Matches the pipeline default for better track-aware coverage. |

#### `video-analysis/index.html` — UI Simplification

| Change | Why |
|--------|-----|
| Replaced mode selector (Match/Technique toggle + technique dropdown) with auto-detect info | Users no longer need to manually choose — the system detects everything automatically. Shows "Video type and exercise auto-detected" with a magic wand icon. |
| Added triage pipeline step | Visual feedback during processing: "Detect Video Type" step appears between Upload and Extract steps so users see the auto-detection happening. |
| Hidden exercise-select kept for backward compat | Saved analyses that stored exerciseType can still be loaded without errors. |

#### `video-analysis/styles.css` — Minor Additions

| Change | Why |
|--------|-----|
| Added `.auto-detect-info` styles | Flex row with icon + text, muted color, for the new auto-detect indicator replacing the old mode selector. |

#### `video-analysis/script.js` — Autonomous Flow

| Change | Why |
|--------|-----|
| Removed `techniques` array, `exerciseSelect` ref, `populateTechniques()` | No longer needed — technique is auto-detected by Gemini. |
| Changed `analysisMode` from `'match'` to `null`, added `triageResult` | Mode is now determined at runtime by triage, not pre-set by the user. |
| Removed `.mode-btn` event listener block | No more manual mode toggle buttons. |
| Added `runTriage()` function | Calls `/api/video/triage` after upload to get the suggested mode. |
| Rewrote `processVideo()` as unified autonomous flow | Single entry point: upload → triage → branch to `processAsMatch()` or `processAsTechnique()` based on triage result. No user decision needed. |
| Rewrote `importYouTubeVideo()` and `analyzeFromLibrary()` | Both now call triage before branching, making YouTube import and library replay equally autonomous. |
| Updated `displayResults()` to show `DETECTED_TECHNIQUE` | When Gemini identifies the technique, it's displayed as a badge above the Overall Performance card. |
| Updated `saveAnalysis()` and `downloadReport()` | Use the detected technique name from Gemini's response instead of the old manual dropdown value. |
| Removed unused `getVideoDuration()` function | Triage result now provides video duration; the old client-side metadata extraction was redundant. |

#### `shared/video-overlay.js` — Non-Player Dimming

| Change | Why |
|--------|-----|
| Added non-player check in `_drawMlDetections()` | Non-players render with 25% opacity, dashed gray border, and "Non-player" label instead of team-colored boxes. This makes it visually clear who was filtered without hiding them entirely. |
| Added non-player skip in `_drawPlayerSkeletons()` | Skeletons aren't drawn for non-players since their pose data isn't relevant to the analysis. |

---

---

## Dual Pipeline + On-Demand Player Technique Analysis

### Summary

Changed the pipeline from running either match OR technique analysis to **always running both** on every video. Triage still detects video type but now only controls which tab is shown first. Added on-demand per-player technique analysis: clicking a player in the overlay shows an "Analyze Technique" button that triggers a deep Gemini analysis of that specific player, with results shown in a slide-out panel.

---

### Changes by File

#### `server.js` — Per-Player Technique Endpoint

| Change | Why |
|--------|-----|
| Added `POST /api/video/analyze-player` endpoint | On-demand technique analysis for a single player. Takes trackId, keypoints, stats, and player path data. Sends the full video + player-specific prompt to Gemini. Returns per-player technique assessment, physical analysis, movement quality, tactical contribution, strengths, improvement areas, and an overall 1-10 rating. |
| Added `createPlayerTechniquePrompt()` function | Detailed prompt that identifies the specific player by bounding box positions and keypoints, asking Gemini to focus exclusively on that player and provide a 7-section technique analysis. |

#### `video-analysis/script.js` — Dual Pipeline + Player Analysis

| Change | Why |
|--------|-----|
| Replaced `processAsMatch()` + `processAsTechnique()` with `runFullPipeline()` | Instead of branching, both ML pipeline and MediaPipe extraction run in parallel. When ML completes → match Gemini analysis starts. When MediaPipe completes → technique Gemini analysis starts. Both sets of results are saved. |
| Updated `processVideo()`, `importYouTubeVideo()`, `analyzeFromLibrary()` | All three entry points now call `runFullPipeline()` instead of branching. YouTube and library flows download the video blob inside `runFullPipeline()` if no file is provided. |
| Rewrote `displayResults()` with view tabs | Shows both match and technique results when both exist. A tab bar ("Match Analysis" / "Technique Analysis") toggles between them. Triage determines which tab is shown first. |
| Added `analyzePlayerTechnique()`, `extractPlayerKeypoints()`, `showPlayerAnalysisPanel()` | On-demand per-player analysis: extracts player keypoints from ML data, calls `/api/video/analyze-player`, displays results in slide-out panel. |
| Added `playerAnalysisCache` (Map) | Caches per-player analysis so re-selecting a previously analyzed player shows results instantly without re-fetching. |
| Added `showPlayerAnalyzeButton()`, `hidePlayerAnalyzeButton()`, `closePlayerAnalysisPanel()` | UI helpers for the player analyze button and slide-out panel. |
| Updated `saveAnalysis()` and `downloadReport()` | Now save both `analysis` and `matchAnalysis`. New `analysisType: 'both'` when both exist. |
| Updated `viewSavedAnalysis()` | Handles `analysisType: 'both'` from saved data, restoring both result sets. |
| Updated `resetAll()` | Clears player analysis cache, closes panel, hides analyze button, hides view tabs. |

#### `video-analysis/index.html` — Dual Results UI

| Change | Why |
|--------|-----|
| Added `results-view-tabs` | Tab bar with "Match Analysis" and "Technique Analysis" buttons above the results layout. Toggles which result section is visible. Hidden when only one analysis type is available. |
| Added `player-analyze-action` button in Players tab | "Analyze Player Technique" button appears when a player is selected in the overlay. Changes to "View Player Analysis" after results are cached. |
| Added `player-analysis-panel` slide-out panel | Fixed-position panel that slides in from the right with player technique analysis results (rating badge, 7 analysis sections). Includes loading state and close button. |

#### `video-analysis/styles.css` — New Styles

| Change | Why |
|--------|-----|
| Added `.results-view-tabs` and `.results-view-tab` | Styled tab bar with active state (green underline), hover state, and badge support. |
| Added `.player-analyze-action` | Centered button area with top border separator. |
| Added `.player-analysis-panel` | Fixed right-side panel (420px) with slide animation, sticky header, analysis sections, loading state, and player rating badge styling. |

---

### Backward Compatibility

- All new output fields (`mergedTracks`, `filteredTracks`, `processingMeta.tracksMerged`, `processingMeta.nonPlayersFiltered`) are additive
- `player.isPlayer` defaults to `true` when absent — old saved analyses render correctly
- Old `/api/video/analyze` calls with an explicit `exerciseType` still work unchanged
- `viewSavedAnalysis()` handles old `analysisType: 'match'` / `'technique'` plus new `'both'`
- Per-player analysis is on-demand and cached client-side only — no extra data persisted
- Saved analyses with only one result type still display correctly (tabs hidden)

### How It Works (End-to-End)

1. User uploads a video (file, YouTube, or library)
2. Video is uploaded to GCS
3. **Triage**: 5 frames sampled with YOLOv8 — determines match vs technique in <5 seconds
4. **Both pipelines run in parallel**:
   - ML pipeline (YOLOv8 + SigLIP + tracking + fingerprinting + non-player filtering)
   - MediaPipe pose extraction (client-side, 15 FPS)
5. **Both Gemini analyses start as prerequisites finish** (also in parallel):
   - ML pipeline done → match Gemini analysis (tactical, per-player, events, possession)
   - MediaPipe done → technique Gemini analysis (auto-detect technique + form analysis)
6. Results displayed with tab toggle ("Match Analysis" / "Technique Analysis")
7. Triage determines which tab is shown first
8. **On-demand player analysis**: click player in overlay → "Analyze Technique" → slide-out panel with deep per-player technique assessment
9. Non-players shown as dimmed gray dashed boxes in detection overlay
10. Players who leave/re-enter frame keep the same canonical track ID

---

---

## Player Focus Mode — Progressive Streaming Analysis During Playback

### Summary

Added a "Focus & Follow" mode that provides progressive, streaming analysis of a selected player as the video plays. Every ~15 seconds, a new insight card appears in a slide-out panel with streaming text from Gemini analyzing what the player did in that time window. By the end of the video, the user has a complete time-segmented analysis. Uses Server-Sent Events (SSE) with `generateContentStream()` for real-time text delivery.

---

### Changes by File

#### `server.js` — SSE Streaming Endpoint

| Change | Why |
|--------|-----|
| Added `POST /api/video/focus-stream` SSE endpoint | Streams Gemini analysis for a specific player in a specific time window. Uses `generateContentStream()` to send text chunks as SSE events. Sends the full video + player-specific prompt scoped to the time window. Returns `{text}` chunks during streaming, `{done: true}` on completion, and `{error}` on failure. |
| Added `createFocusWindowPrompt()` function | Concise prompt asking for exactly 2-3 bullet points about a player's actions in a specific time segment. Includes player position data (bbox samples), ball proximity stats, and the last 2 previous insights to avoid repetition. Uses `maxOutputTokens: 400` and `temperature: 0.15` for focused, consistent output. |

#### `video-analysis/script.js` — Focus Mode State Machine

| Change | Why |
|--------|-----|
| Added focus state variables (`focusMode`, `focusTrackId`, `focusLastWindowEnd`, `focusInsights`, `focusPendingStream`, `FOCUS_WINDOW_SECONDS`) | Track focus mode lifecycle: which player is being followed, where the last analyzed window ended, accumulated insights, and the current streaming request's AbortController. |
| Added `startFocusMode(trackId)` | Opens the focus panel, shows the target player ID, updates button state to "Stop Focus", and auto-plays the video if paused. Resets insights and sets `focusLastWindowEnd` to the current playback position. |
| Added `stopFocusMode()` | Aborts any in-flight streaming request, resets button state to "Focus & Follow", updates status to show total insight count. Panel stays open for review. |
| Added `triggerFocusAnalysis(startTime, endTime)` | Core function: extracts window data for the tracked player, creates a focus card in the panel, then streams the Gemini response via `fetch()` + `ReadableStream`. Parses SSE lines from the response body, progressively updates the card content, and finalizes the card on completion. Skips windows where the player isn't visible. |
| Added `extractWindowData(trackId, startTime, endTime)` | Collects player keypoints, bounding boxes, and ball proximity from `mlResultsData.detections` for the given time range. Returns team ID, keypoint array, and stats (frame count, closest ball distance). |
| Added `createFocusCard()`, `updateFocusCardContent()`, `finalizeFocusCard()` | DOM helpers for insight cards. Cards have a time badge, seek button, and streaming animation. `streaming` class shows a yellow pulsing border; `complete` shows green. Clicking the seek button jumps the video to that time window and highlights the card. |
| Hooked into `updateTimeline()` | When focus mode is active and no stream is pending, checks if 15+ seconds have elapsed since the last window end. If so, triggers `triggerFocusAnalysis()`. |
| Added focus-aware `seeked` event handler | When the user seeks backward, resets `focusLastWindowEnd` so analysis continues from the new position. Aborts any in-flight stream. Existing insight cards remain visible for review. |
| Added focus-aware `ended` event handler | When video ends, triggers a final partial-window analysis if >5 seconds remain unanalyzed. Updates status to "Complete". |
| Wired focus button in `showResults()` | Shows the "Focus & Follow" button when ML data is available. Click toggles between `startFocusMode()` and `stopFocusMode()`. Requires a player to be selected first. |
| Wired close-focus-panel button | Stops focus mode and slides the panel out with a 300ms transition delay. |
| Updated `resetAll()` | Clears all focus state, aborts pending streams, hides and resets the focus panel and button. |

#### `video-analysis/index.html` — Focus Panel UI

| Change | Why |
|--------|-----|
| Added `focus-mode-btn` to overlay controls | "Focus & Follow" button in the overlay control bar, hidden by default (`display:none`), shown when ML data is available. Placed after the overlay mode buttons. |
| Added `focus-panel` slide-out panel | Fixed right-side panel with sticky header showing player ID and status ("Watching..." / "Complete — N insights"), scrollable container for insight cards, and close button. |

#### `video-analysis/styles.css` — Focus Panel Styles

| Change | Why |
|--------|-----|
| Added `.focus-panel` styles | Fixed 440px right-side panel with dark gradient background, green left border, slide-in transition (`translateX`), and overflow scroll. Uses `z-index: 1001` to sit above other panels. |
| Added `.focus-card` styles with `.streaming` and `.complete` states | Cards have subtle background, rounded border. `streaming` state shows yellow pulsing border animation (`focusPulse`). `complete` state shows green border. `.active` state highlights the card when its seek button is clicked. |
| Added `.focus-time-badge`, `.focus-seek-btn`, `.focus-card-content` | Time badge with green pill background, transparent seek button that turns green on hover, and content area with `pre-line` white-space for bullet point formatting. |
| Added `focusPulse` and `focusBlink` keyframe animations | `focusPulse` oscillates border color between yellow-20% and yellow-50% opacity. `focusBlink` fades the "Analyzing..." typing indicator. |

#### `nginx.conf` — SSE Buffering Bypass

| Change | Why |
|--------|-----|
| Added dedicated `location /api/video/focus-stream` block | SSE endpoints require `proxy_buffering off` and `proxy_cache off` to prevent Nginx from holding response chunks until the request completes. Without this, the client wouldn't receive streaming text in real time. Placed before the general `/api/` block so it matches first. |

---

### Backward Compatibility

- Focus mode is entirely additive — no existing behavior is changed
- The focus button is hidden by default and only appears when ML detection data exists
- Focus mode requires a player to be selected via the existing overlay click mechanism
- All new state variables are cleaned up in `resetAll()` so "Analyze Another" works correctly
- The SSE endpoint is a new POST route; existing API routes are unchanged
- `X-Accel-Buffering: no` header ensures streaming works even if the Nginx config isn't updated (belt-and-suspenders approach)

### How It Works (End-to-End)

1. User processes a video → ML pipeline runs → detection data available
2. In results view, user clicks a player in the detection overlay to select them
3. "Focus & Follow" button appears in the overlay control bar
4. User clicks "Focus & Follow" → focus panel slides in from the right
5. Video starts playing (auto-plays if paused)
6. Every ~15 seconds of playback, `updateTimeline()` detects the threshold has passed
7. `triggerFocusAnalysis()` extracts the player's bounding boxes and ball proximity from `mlResultsData` for that 15-second window
8. POST request sent to `/api/video/focus-stream` with window data + up to 2 previous insights for context
9. Server creates a scoped Gemini prompt and calls `generateContentStream()`
10. SSE chunks stream back → client parses them via `ReadableStream.getReader()` → card text updates progressively
11. Card finalizes (border turns green), status updates ("N insights — Watching...")
12. Process repeats every 15 seconds until video ends
13. On video end, a final partial window is analyzed if >5 seconds remain
14. User can click seek buttons on any card to jump to that moment
15. User can seek backward → `focusLastWindowEnd` resets, new windows analyze from the new position
16. "Stop Focus" ends the mode but keeps all cards visible for review
