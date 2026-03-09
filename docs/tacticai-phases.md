# TacticAI Implementation Phases

Concrete implementation plan for TacticAI integration. Each phase lists files to create/modify, what existing code to reuse, and how to verify.

See `docs/tacticai-implementation-study.md` for detailed code sketches and architecture.

---

## Dependency Graph

```
Phase 1: BEV + Graph Construction
  |
  +---> Phase 2: GNN + Shot Probability
  |       |
  |       +---> Phase 3: D2 Symmetry
  |       |
  |       +---> Phase 5: Retrieval (FAISS)
  |
  +---> Phase 4: CVAE / Optimize Defense (needs Phase 2)
  |
  +---> Phase 6: Brazilian Localization (independent, parallel)
  |
  +---> Phase 7: Interactive UI (needs Phase 2 + 4)
```

---

## Phase 1: BEV Transformation + Tactical Graph Construction

**Goal**: Transform ML pipeline detections (camera-perspective normalized coords) into Bird's Eye View pitch coordinates and build per-frame player graphs.

### Create

| File | What |
|---|---|
| `tactical_ai.py` | Main Python pipeline. Functions: `estimate_homography()`, `fallback_homography()`, `transform_to_bev()`, `build_player_graph()`. CLI interface: reads ML results JSON from stdin or file, writes tactical JSON to stdout |

### Modify

| File | What | Integration Point |
|---|---|---|
| `server.js` | Add `POST /api/tactical/analyze` endpoint | Follow `execFile` pattern at lines 505-541 |
| `requirements.txt` | Add `scipy>=1.11.0` | Needed for homography optimization |

### Reuse

| What | From | How |
|---|---|---|
| ML results JSON schema | `ml_pipeline.py` output | `tactical_ai.py` reads `detections[]`, `playerPaths{}`, `ballTrajectory[]` directly |
| Python subprocess pattern | `server.js` lines 505-541 | Same `execFile` + JSON stdout parsing for `tactical_ai.py` |
| OpenCV (already installed) | `requirements.txt` | `cv2.getPerspectiveTransform()`, `cv2.findHomography()`, `cv2.HoughLinesP()` |

### Input → Output

**Input** (from ML pipeline):
```json
{
  "detections": [{ "timestamp": 0.0, "players": [{ "bbox": [...], "teamId": 0, "trackId": 42 }], "ball": {...} }],
  "playerPaths": { "42": [{ "timestamp": 0.0, "x": 0.2, "y": 0.3 }] },
  "ballTrajectory": [{ "timestamp": 0.0, "x": 0.51, "y": 0.51 }]
}
```

**Output** (new tactical data):
```json
{
  "homography": [[...], [...], [...]],
  "frames": [{
    "timestamp": 0.0,
    "players": [{ "trackId": 42, "bev_x": 75.3, "bev_y": 45.2, "vel_x": 2.1, "vel_y": -0.5, "team_id": 0, "ball_dist": 12.3, "has_ball": false }],
    "ball": { "bev_x": 80.1, "bev_y": 34.0 },
    "graph": {
      "nodes": [0, 1, 2, ...],
      "edges": [[0,1], [0,2], [1,2], ...],
      "node_features": [[...8 floats...], ...],
      "edge_features": [[dist, same_team, angle], ...]
    }
  }]
}
```

### Verify

1. Run `python3 tactical_ai.py < ml_results.json` with a saved ML results file
2. Check BEV coordinates are in range [0-105] x [0-68] meters
3. Check homography matrix is 3x3, non-singular
4. Check graph has correct number of nodes (= number of players) and edges
5. Call `POST /api/tactical/analyze` from browser console with a `fileName` → verify JSON response

---

## Phase 2: GNN Message Passing + Shot Probability

**Goal**: Run GATv2 GNN on the player graph to compute receiver probabilities and shot probability per frame. Visualize GNN edges on the video overlay.

### Create

| File | What |
|---|---|
| `shared/tactical-overlay.js` | New module with rendering methods: `drawGnnEdges()`, `drawShotProbBadges()`, `drawShotProbHud()`. Imported by `video-overlay.js` |

### Modify

| File | What | Integration Point |
|---|---|---|
| `tactical_ai.py` | Add `TacticAIGNN` class (PyTorch Geometric GATv2), `compute_shot_probability()`, `message_passing()` | After graph construction in Phase 1 |
| `shared/video-overlay.js` | Extend `tactical` mode in `render()` switch to call `tactical-overlay.js` methods. Add `setTacticalData()`, `findTacticalFrame()` | Lines 429-434 (tactical case), add new methods |
| `video-analysis/index.html` | Add TacticAI tab in match results (5th tab) | After line 321 (possession tab) |
| `video-analysis/script.js` | Wire TacticAI tab, call `/api/tactical/analyze` after ML analysis, display shot probabilities | After `displayMatchResults()` at line 1006 |
| `video-analysis/styles.css` | Styles for GNN edges, shot prob badges, TacticAI tab panel | Follow existing match-tab pattern |
| `requirements.txt` | Add `torch-geometric>=2.4.0`, `torch-scatter`, `torch-sparse` | |

### Reuse

| What | From | How |
|---|---|---|
| Formation line rendering | `video-overlay.js` `_drawFormationLines()` lines 1107-1158 | GNN edges extend this — same nearest-neighbor structure but with learned weights and thickness |
| Player center calculation | `video-overlay.js` `_drawMlDetections()` | `(bbox[0]+bbox[2])/2 * canvas.width` pattern |
| HUD badge rendering | `video-overlay.js` `_drawTeamLegend()` lines 1050-1077 | Same background/font pattern for shot prob HUD |
| Tab switching pattern | `video-analysis/index.html` lines 261-321 | `match-tab[data-tab="tacticai"]` follows existing structure |
| Multi-Gemini for narration | `server.js` lines 562-697 | Add tactical narration as another parallel Gemini call |

### Output additions to tactical JSON

Each frame gains:
```json
{
  "edges": [{ "from_track": 42, "to_track": 17, "weight": 0.85, "same_team": true, "distance": 8.3 }],
  "shot_probs": {
    "total_shot_prob": 0.18,
    "per_player": { "42": { "receive_prob": 0.35, "shot_given_receive": 0.22, "contribution": 0.077 } }
  },
  "embedding": [0.12, -0.34, ...]
}
```

### Verify

1. Overlay mode "tactical" shows faint white/colored lines between players (GNN edges)
2. Shot probability percentage appears as HUD badge (top-right, below possession)
3. Per-player shot contribution badges appear above high-threat players
4. Line thickness varies with edge weight
5. Teammate edges solid, opponent edges dashed
6. TacticAI tab in results panel shows shot probability timeline

---

## Phase 3: D2 Symmetry Transformations

**Goal**: Add symmetry toggle buttons that flip the tactical view (horizontal, vertical, both), demonstrating how plays can be mirrored and remain strategically equivalent.

### Create

| File | What |
|---|---|
| `shared/tactical-ui.js` | `TacticalUI` class with `setSymmetryMode()`, `_applySymmetry()`. Pure client-side coordinate flips — no server call needed |

### Modify

| File | What | Integration Point |
|---|---|---|
| `video-analysis/index.html` | Add symmetry button group inside TacticAI tab panel | Inside new TacticAI tab content |
| `video-analysis/script.js` | Wire symmetry buttons to `TacticalUI.setSymmetryMode()`, trigger overlay re-render | After TacticAI tab setup |
| `video-analysis/styles.css` | `.btn-symmetry` active/inactive states | Follow existing `.btn-overlay` pattern |
| `tactical_ai.py` | Add `apply_d2_symmetry()` for server-side transforms (used when re-computing shot prob after flip) | Standalone function |

### Reuse

| What | From | How |
|---|---|---|
| Overlay button styling | `video-analysis/styles.css` `.btn-overlay` | Same toggle-group pattern for symmetry buttons |
| `render()` re-trigger | `video-overlay.js` | `setTacticalData(flipped)` + `render()` already handles re-drawing |

### Verify

1. Four buttons appear: Identidade, Horizontal, Vertical, Ambos
2. Clicking "Horizontal" mirrors all player positions left-right on the overlay
3. Clicking "Vertical" mirrors top-bottom
4. "Ambos" rotates 180 degrees
5. "Identidade" restores original
6. Shot probabilities visually match the mirrored positions

---

## Phase 4: CVAE Guided Generation ("Optimize Defense")

**Goal**: "Otimizar Defesa" button generates optimal defender positions using CVAE + GNN evaluation. Ghost players show suggested moves. Gemini narrates the tactical reasoning.

### Modify

| File | What | Integration Point |
|---|---|---|
| `tactical_ai.py` | Add `TacticalCVAE` class, `optimize_defense()` function (CVAE sampling + GNN evaluation). Fallback: `optimize_defense_fallback()` using scipy L-BFGS-B when CVAE not yet trained | After GNN class |
| `shared/tactical-overlay.js` | Add `drawGhostPlayers()` — dashed arrows + translucent circles at suggested positions with displacement labels | New rendering method |
| `shared/tactical-ui.js` | Add optimize button handler, `displayOptimizationResults()` | Extend existing class |
| `server.js` | Add `POST /api/tactical/optimize` endpoint. Calls `tactical_ai.py --optimize` mode. Includes parallel Gemini narration call | Follow existing `execFile` + `geminiCall` patterns |
| `video-analysis/index.html` | Add "Otimizar Defesa" button + results panel inside TacticAI tab | Below symmetry controls |
| `video-analysis/script.js` | Wire button to `/api/tactical/optimize`, display ghost players + Gemini narration | New `optimizeDefense()` async function |

### Reuse

| What | From | How |
|---|---|---|
| Gemini narration call | `server.js` `geminiCall()` pattern (lines 576-590) | Same `ai.models.generateContent()` with video + text prompt |
| `parseAnalysisSections()` | `server.js` line 1126 | Parse Gemini coaching response into structured sections |
| Ghost player color scheme | `video-overlay.js` `selectedHighlightColor` | Green (`rgba(0, 255, 128)`) for suggested positions |

### Verify

1. Click "Otimizar Defesa" → loading state → ghost players appear on overlay
2. Dashed green arrows point from original to suggested defender positions
3. Displacement labels (e.g., "3.2m") appear at ghost positions
4. Shot probability delta shown (e.g., "18% → 5%")
5. Gemini narration streams into TacticAI tab panel in Portuguese
6. Players that need to move most are highlighted ("Fora de Posicao")

---

## Phase 5: Retrieval System (FAISS)

**Goal**: Find strategically similar tactical situations from previously analyzed videos using GNN latent embeddings.

### Modify

| File | What | Integration Point |
|---|---|---|
| `tactical_ai.py` | Add `TacticalRetrieval` class with FAISS-GPU index. Functions: `add_embedding()`, `search()`, `save_index()`, `load_index()` | After GNN and CVAE |
| `server.js` | Add `POST /api/tactical/retrieve` endpoint. Loads FAISS index from GCS, searches, includes Gemini comparison narration | New endpoint |
| `shared/tactical-ui.js` | Add "Busca Tatica" button handler + results display | Extend class |
| `video-analysis/index.html` | Add retrieval results panel inside TacticAI tab | Below optimize section |
| `video-analysis/script.js` | Wire "Find Similar" to `/api/tactical/retrieve`, display results with similarity scores and video links | New function |
| `requirements.txt` | Add `faiss-gpu>=1.7.0` | |

### Reuse

| What | From | How |
|---|---|---|
| Analysis library UI | `video-analysis/script.js` library tab | Similar card layout for retrieval results (thumbnail + metadata) |
| Analysis loading | `/api/analysis/:id` endpoint | Load full analysis for selected retrieval result |
| GCS storage | `server.js` persistence pattern | FAISS index stored in `gs://bucket/faiss/` |

### GCS Storage Layout

```
gs://bucket/
  faiss/index.faiss           # Binary FAISS index
  faiss/metadata.json         # Parallel metadata (analysisId, timestamp, video_name per entry)
  tactical-results/{id}.json  # Full tactical analysis results
```

### Verify

1. Analyze 2+ videos → FAISS index is populated
2. Click "Busca Tatica" on any frame → retrieval results appear
3. Results show similarity percentage, video name, timestamp
4. Gemini narration explains why plays are similar
5. Clicking a result loads the historical analysis

---

## Phase 6: Brazilian Coach Adaptations (Independent — Can Run in Parallel)

**Goal**: Portuguese localization, Brazilian football terminology, triangulation visualization, compactness heatmap.

### Create

| File | What |
|---|---|
| `shared/brazilian-tactics.js` | `BRAZILIAN_TERMS` dictionary (roles: Goleiro, Zagueiro, Volante, Pivo; concepts: Triangulacao, Pequenos Espacos, Infiltracao, Tabela, Efeito; UI labels in PT-BR). Locale toggle function |

### Modify

| File | What | Integration Point |
|---|---|---|
| `shared/tactical-overlay.js` | Add `drawTriangulacao()` (connect 3 nearest teammates with filled triangles), `drawCompactnessHeatmap()` (Gaussian KDE on 20x20 grid) | New rendering methods |
| `video-analysis/index.html` | Add locale toggle (PT/EN) in TacticAI tab header | Tab header area |
| `video-analysis/script.js` | Wire locale toggle, update all TacticAI UI labels from `BRAZILIAN_TERMS.ui` | New `setLocale()` function |
| `video-analysis/styles.css` | Styles for triangulation overlay, heatmap legend, locale toggle | |

### Reuse

| What | From | How |
|---|---|---|
| Portuguese voice support | `shared/audio-coach.js` line 84 | Already filters `pt` voices. Register TacticAI tactical phrases |
| Team color scheme | `video-overlay.js` `teamColors` | Triangulation uses same team colors with low alpha fill |
| Player center positions | `video-overlay.js` `_drawMlDetections()` | Same bbox center calculation for triangle vertices |

### Verify

1. Locale toggle switches all TacticAI labels between Portuguese and English
2. Triangulation overlay shows filled triangles connecting nearest teammates
3. Compactness heatmap renders team-colored density visualization
4. Audio coach speaks tactical feedback in Portuguese when PT locale is active

---

## Phase 7: Interactive UI (Drag Players, Real-Time Re-Computation)

**Goal**: Allow coaches to drag player positions on the canvas, then re-compute shot probability and see updated GNN edges in real-time.

### Modify

| File | What | Integration Point |
|---|---|---|
| `shared/tactical-ui.js` | Add `TacticalInteraction` class with `mousedown`/`mousemove`/`mouseup` handlers, `modifiedPositions` state, `onPositionChange()` callback, `resetPositions()` | Extend module |
| `shared/video-overlay.js` | Add `setModifiedPositions()` method — overrides player positions in rendering. Modify `_drawMlDetections()` to use modified positions when set | Lines 829-914 |
| `video-analysis/script.js` | Wire `TacticalInteraction` to overlay canvas. On drag complete: call `/api/tactical/optimize` with modified positions | After overlay initialization |
| `video-analysis/index.html` | Add "Reset Positions" button | Next to "Otimizar Defesa" button |

### Reuse

| What | From | How |
|---|---|---|
| Canvas click detection | `video-overlay.js` `_handleCanvasClick()` lines 194-235 | Same bbox hit-testing logic, extend with drag state |
| Player selection state | `video-overlay.js` `selectedPlayerId` | Track which player is being dragged |
| Pointer events toggle | `video-overlay.js` `enablePlayerSelection()` / `disablePlayerSelection()` | Control when drag is active |

### Interaction Flow

```
1. User pauses video at interesting moment
2. Enters "TacticAI" overlay mode → sees GNN edges + shot probability
3. Clicks and drags a defender to new position
4. During drag: position updates visually (client-side, instant)
5. On mouse-up: POST /api/tactical/optimize with modifiedPositions
6. Ghost players appear showing model's suggested positions
7. Shot probability updates
8. Gemini narrates the change
9. "Reset" button restores original positions
```

### Verify

1. Cursor changes to "grab" when hovering over a player bbox
2. Dragging a player moves the bbox smoothly
3. On release: loading indicator → ghost players + updated shot prob appear
4. "Reset Positions" clears all modifications
5. Overlay re-renders correctly after reset

---

## Infrastructure Changes (All Phases)

### `requirements.txt` additions

```
# Phase 1
scipy>=1.11.0

# Phase 2
torch-geometric>=2.4.0
torch-scatter>=2.1.0
torch-sparse>=0.6.0

# Phase 5
faiss-gpu>=1.7.0
```

### `Dockerfile` changes

```dockerfile
# Switch to GPU base image
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# ... existing Node.js + Python setup ...

# Pre-cache GNN model weights (if pre-trained)
COPY models/ ./models/ 2>/dev/null || true

# Copy tactical pipeline
COPY tactical_ai.py ./
```

### `.env.example` additions

```
TACTICAL_AI_ENABLED=true
GNN_MODEL_PATH=models/gnn.pt
CVAE_MODEL_PATH=models/cvae.pt
FAISS_INDEX_PATH=faiss/
```

### Cloud Run deployment

```bash
gcloud run deploy sports-coach \
    --source . \
    --region us-central1 \
    --memory 8Gi \
    --cpu 4 \
    --gpu 1 \
    --gpu-type nvidia-l4 \
    --timeout 600 \
    --allow-unauthenticated
```

---

## Training Pipeline (Post-Phase 5)

With GPU and accumulated data, continuously improve models:

```
1. User analyzes video → GNN produces predictions
2. User marks outcome (goal / save / clearance / no shot) via UI checkbox
3. Label stored in Firestore alongside tactical data
4. Training job (manual or scheduled):
   - Load all labeled data from Firestore + GCS
   - Fine-tune GATv2 on receiver + shot prediction
   - Train CVAE on successful defensive formations
   - Rebuild FAISS index with new embeddings
5. Deploy updated weights to GCS → server hot-reloads
```

---

## Summary

| Phase | New Files | Modified Files | Key Dependency |
|---|---|---|---|
| 1. BEV + Graph | `tactical_ai.py` | `server.js`, `requirements.txt` | None |
| 2. GNN + Shot Prob | `shared/tactical-overlay.js` | `tactical_ai.py`, `video-overlay.js`, `video-analysis/*`, `requirements.txt` | Phase 1 |
| 3. D2 Symmetry | `shared/tactical-ui.js` | `tactical_ai.py`, `video-analysis/*` | Phase 2 |
| 4. CVAE / Optimize | — | `tactical_ai.py`, `tactical-overlay.js`, `tactical-ui.js`, `server.js`, `video-analysis/*` | Phase 2 |
| 5. Retrieval (FAISS) | — | `tactical_ai.py`, `tactical-ui.js`, `server.js`, `video-analysis/*`, `requirements.txt` | Phase 2 |
| 6. Brazilian Localization | `shared/brazilian-tactics.js` | `tactical-overlay.js`, `video-analysis/*` | None |
| 7. Interactive UI | — | `tactical-ui.js`, `video-overlay.js`, `video-analysis/*` | Phase 2 + 4 |
