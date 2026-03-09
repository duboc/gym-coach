# TacticAI Implementation Study

Study document for integrating TacticAI-inspired tactical football analysis into the Sports Coach app. Based on DeepMind's TacticAI paper (2024) leveraging GPU compute, Gemini multimodal AI, and our existing ML pipeline.

---

## Table of Contents

1. [TacticAI Paper Concepts](#1-tacticai-paper-concepts)
2. [Existing Codebase Integration Map](#2-existing-codebase-integration-map)
3. [Architecture Overview](#3-architecture-overview)
4. [Phase 1: BEV Transformation and Graph Construction](#4-phase-1-bev-transformation-and-graph-construction)
5. [Phase 2: GNN Message Passing and Shot Probability](#5-phase-2-gnn-message-passing-and-shot-probability)
6. [Phase 3: D2 Symmetry Transformations](#6-phase-3-d2-symmetry-transformations)
7. [Phase 4: CVAE Guided Generation ("Optimize Defense")](#7-phase-4-cvae-guided-generation-optimize-defense)
8. [Phase 5: Retrieval System and Similarity Search](#8-phase-5-retrieval-system-and-similarity-search)
9. [Phase 6: Brazilian Coach Adaptations](#9-phase-6-brazilian-coach-adaptations)
10. [Phase 7: Interactive UI (Drag Players, Toggles)](#10-phase-7-interactive-ui)
11. [New Files Inventory](#11-new-files-inventory)
12. [API Endpoints](#12-api-endpoints)
13. [Data Structures](#13-data-structures)
14. [Memory and Performance Strategy](#14-memory-and-performance-strategy)
15. [Deployment Changes](#15-deployment-changes)
16. [Implementation Sequencing](#16-implementation-sequencing)

---

## 1. TacticAI Paper Concepts

TacticAI (DeepMind, 2024) applies geometric deep learning to football set pieces, specifically corner kicks. The core innovations are:

**Graph Neural Network (GNN) with Equivariance**: Players are nodes in a graph. The GNN uses message passing where each player aggregates information from nearby players. The model respects D2 symmetry (the dihedral group of order 4: identity, horizontal flip, vertical flip, and combined flip), meaning a corner from the left is equivalent to a mirror of one from the right.

**Three Tasks**: (1) Receiver prediction -- which player receives the corner kick, (2) Shot prediction -- probability the play leads to a shot, (3) Guided generation -- using a Conditional Variational Autoencoder (CVAE) to suggest repositioning defenders to prevent shots.

**Retrieval**: The GNN encoder produces latent representations. Finding nearest neighbors in this latent space identifies strategically similar set pieces, which outperforms naive coordinate-based matching.

**Practical constraint**: The original paper uses a proprietary 8000+ corner kick dataset from Liverpool FC. We do not have this data. Our implementation works with the existing ML pipeline output (YOLO detections + ByteTrack trajectories) from arbitrary football video clips. However, with GPU available and Gemini multimodal AI, we can build a real GNN (PyTorch Geometric with CUDA), use Gemini for tactical interpretation and natural-language coaching insights, and train/fine-tune models on collected match data over time.

---

## 2. Existing Codebase — What We Can Leverage

### ML Pipeline Output (`ml_pipeline.py` — 707 lines)

The existing ML pipeline already produces all the raw data TacticAI needs as input. The complete JSON output schema:

```json
{
  "detections": [{
    "timestamp": 0.0,
    "players": [{
      "bbox": [0.1, 0.2, 0.3, 0.4],
      "confidence": 0.95,
      "teamId": 0,
      "trackId": 42,
      "keypoints": [[0.15, 0.25, 0.8], ...]
    }],
    "ball": { "bbox": [0.5, 0.5, 0.52, 0.52], "confidence": 0.87 },
    "referees": []
  }],
  "ballTrajectory": [{ "timestamp": 0.0, "x": 0.51, "y": 0.51 }],
  "playerPaths": { "42": [{ "timestamp": 0.0, "x": 0.2, "y": 0.3 }] },
  "playerStats": {
    "42": {
      "teamId": 0, "firstSeen": 0.0, "lastSeen": 50.0,
      "framesVisible": 100, "avgBallDistance": 0.25,
      "minBallDistance": 0.05, "possessionFrames": 15
    }
  },
  "possessionTimeline": [{ "timestamp": 0.0, "teamId": 0, "playerId": 42, "distance": 0.05 }],
  "keyFrames": [{ "timestamp": 2.5, "type": "ball_contact", "playerId": 42 }],
  "teams": { "count": 2, "labels": ["Team A", "Team B"] },
  "processingMeta": { "fps": 2, "framesProcessed": 150, "uniquePlayersTracked": 22, "poseEstimation": true }
}
```

Key assets for TacticAI:
- **33-point MediaPipe keypoints per player** (not just bboxes) — enables body orientation and facing direction analysis
- **Persistent track IDs** via ByteTrack — same player ID across frames, essential for graph node identity
- **Team assignment** via SigLIP + KMeans — graph edges already know teammate vs opponent
- **Ball trajectory + possession timeline** — shot/pass event detection ready to use
- **Player paths** — velocity/acceleration can be computed from consecutive positions
- All coordinates **normalized [0,1]** — ready for homography transformation to BEV

### Video Overlay System (`shared/video-overlay.js` — ~1230 lines)

Already-implemented rendering primitives we can extend:

| Primitive | Method | Lines | Reuse For |
|---|---|---|---|
| Player bboxes with team colors | `_drawMlDetections()` | 829-914 | Base for GNN node rendering |
| Formation lines (2 nearest teammates) | `_drawFormationLines()` | 1107-1158 | Extend with GNN edge weights |
| Ball trail (comet effect) | `_drawBallTrail()` | 1031-1048 | Ball trajectory overlay |
| Player movement trail | `_drawPlayerTrails()` | 1080-1104 | Selected player path viz |
| Team legend HUD | `_drawTeamLegend()` | 1050-1077 | Add shot probability HUD |
| Possession indicator HUD | `_drawPossessionIndicator()` | 1161-1206 | Extend with tactical metrics |
| Minimap (stick figure) | `_drawMinimap()` | 738-823 | Adapt to BEV pitch view |
| Click-to-select player | `_handleCanvasClick()` | 194-235 | Extend to drag-to-reposition |
| Frame interpolation (smooth playback) | `findMlFrameInterpolated()` | 272-362 | Sync tactical data to video |
| Overlay mode switching | `setOverlayMode()` / `render()` | 385-462 | Add `tactical-gnn` mode |

The `tactical` overlay mode already exists as a switch case but is minimal — it can be expanded for TacticAI without adding a new mode name.

### Server Multi-Gemini Pattern (`server.js` — lines 562-697)

The `/api/video/match-analyze` endpoint already runs **4 parallel Gemini calls** with structured output. This is directly reusable for TacticAI narration:

```javascript
// Existing pattern (server.js lines 562-697):
const geminiCall = async (prompt) => {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts: [
      { fileData: { mimeType: 'video/mp4', fileUri: gcsUri } },
      { text: prompt },
    ]}],
    config: { temperature: GEMINI_TEMPERATURE, maxOutputTokens: 2048 },
  });
  return response.text;
};

// Run in parallel:
const [tactical, events, possession, ...players] = await Promise.all([
  geminiCall(createMatchTacticalPrompt(mlResults, metadata)),
  geminiCall(createEventDetectionPrompt(keyFrames, metadata)),
  geminiCall(createPossessionPrompt(possessionTimeline, ballTrajectory, metadata)),
  ...trackIds.map(tid => geminiCall(createPlayerAnalysisPrompt(tid, ...))),
]);
```

**For TacticAI**: Add tactical narration prompts to this same parallel pattern. The existing `parseAnalysisSections()` (line 1126) already parses section-header formatted responses.

### Match Analysis UI (`video-analysis/`)

The match results UI already has a 4-tab structure. TacticAI adds a 5th tab:

```
Existing tabs:  [Tactical] [Players] [Events] [Possession]
With TacticAI:  [Tactical] [Players] [Events] [Possession] [TacticAI]
```

Existing patterns to reuse:
- **Player cards** (`.player-card .team-a .team-b`) — click-to-highlight in video
- **Event timeline** — seekable timestamps in video
- **Possession bar** — split-fill visualization
- **Tab switching** — `match-tab[data-tab]` / `match-tab-content[data-tab]` pattern

### Audio Coach (`shared/audio-coach.js`)

Portuguese voice support is already built in (line 84: filters `pt` voices). TacticAI can register tactical phrases:

```javascript
audioCoach.registerExercisePhrases("TacticAI", {
  form: ["Boa posicao. Mantenha a distancia.", "Mova-se para dar apoio."],
  corrections: {
    positioning: ["Ajuste o espacamento.", "Abra mais."],
    formation: ["Volte para a formacao.", "Mantenha a forma."]
  }
});
```

### Python Subprocess Pattern (`server.js` lines 505-541)

```javascript
// Existing pattern for invoking Python ML:
const result = await new Promise((resolve, reject) => {
  execFile('python3', [path.join(__dirname, 'ml_pipeline.py'), tmpPath, '--fps', '2'],
    { timeout: 300000, maxBuffer: 50 * 1024 * 1024 },
    (error, stdout, stderr) => {
      // Parse last JSON line from stdout (handles ultralytics warnings)
      const lines = stdout.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('{')) {
          resolve(JSON.parse(lines[i].trim()));
          return;
        }
      }
    }
  );
});
```

`tactical_ai.py` follows this same pattern: receive ML results as stdin/file, emit JSON to stdout, progress to stderr.

### What Needs to Be Created

| New File | Purpose |
|---|---|
| `tactical_ai.py` | BEV homography, GNN (PyTorch Geometric), CVAE, FAISS retrieval, D2 symmetry |
| `shared/tactical-overlay.js` | GNN edge rendering, ghost players, triangulation, compactness heatmap |
| `shared/tactical-ui.js` | Symmetry toggles, drag-to-reposition, optimize button wiring |
| `shared/brazilian-tactics.js` | PT-BR terminology dictionary, locale toggle |

| Modified File | Changes |
|---|---|
| `shared/video-overlay.js` | Extend `tactical` mode, add setter methods, delegate to `tactical-overlay.js` |
| `video-analysis/script.js` | Add TacticAI tab workflow, optimize defense button, symmetry toggles, retrieval |
| `video-analysis/index.html` | Add TacticAI tab panel with controls |
| `video-analysis/styles.css` | Styles for GNN edges, ghost players, symmetry buttons, heatmap |
| `server.js` | Add 3 new endpoints: `/api/tactical/analyze`, `/api/tactical/optimize`, `/api/tactical/retrieve` |
| `requirements.txt` | Add `torch-geometric`, `faiss-gpu`, `scipy` |
| `Dockerfile` | GPU base image, copy `tactical_ai.py`, pre-cache GNN model weights |
| `.env.example` | Add `TACTICAL_AI_ENABLED`, `GNN_MODEL_PATH`, `CVAE_MODEL_PATH`, `FAISS_INDEX_PATH` |

---

## 3. Architecture Overview

```
                     EXISTING                          NEW
                  +------------------+            +-------------------+
   Video Upload   |  ml_pipeline.py  |  detections |  tactical_ai.py   |
   =============> |  YOLOv8 + Track  | ==========> |  Homography(BEV)  |
                  |  SigLIP + UMAP   |  (GPU)     |  GNN (PyG + CUDA) |
                  +------------------+            |  CVAE generation  |
                         |                        |  Retrieval (FAISS)|
                         | JSON stdout            |  Symmetry xforms  |
                         v                        +-------------------+
                  +------------------+                    |
                  |  server.js       |                    | JSON stdout
                  |  /api/video/     |<-------------------+
                  |   ml-analyze     |
                  |   tactical-ai    | <-- NEW endpoint
                  +------------------+
                         |
                         +---------> Gemini API (Vertex AI)
                         |           - Tactical narration from GNN output
                         |           - Natural-language coaching insights
                         |           - Video + graph context multimodal analysis
                         v
                  +------------------+
                  | video-overlay.js | <-- Extended with tactical-gnn mode
                  | tactical-ui.js   | <-- NEW: drag, symmetry, optimize
                  +------------------+
                         |
                         v
                  +------------------+
                  | video-analysis/  |
                  |  script.js       | <-- Extended with TacticAI tab
                  |  index.html      |
                  +------------------+
```

### Key Design Decisions

**1. PyTorch Geometric with GPU (not heuristic approximation)**

With GPU available and no tight memory constraints, we use the real GNN stack:
- **PyTorch Geometric** (`torch-geometric`) for GATv2 message passing with D2 equivariance
- **CUDA acceleration** for GNN forward pass (~5ms per frame vs ~50ms CPU)
- **CVAE** (Conditional Variational Autoencoder) for guided defense generation -- a real generative model, not constrained optimization
- **FAISS-GPU** for fast nearest-neighbor retrieval on tactical fingerprints

This gives us the full TacticAI model architecture as described in the paper, rather than a heuristic approximation.

**2. Gemini for Tactical Intelligence**

Gemini (Vertex AI) adds a layer the original TacticAI paper didn't have -- natural language coaching:
- **Post-GNN interpretation**: Feed GNN outputs (shot probabilities, edge weights, optimization deltas) to Gemini to generate coaching narratives in Portuguese
- **Multimodal context**: Send video frames + BEV diagram + GNN graph to Gemini for richer tactical analysis
- **"Why" explanations**: GNN gives numbers (P(shot) = 18%), Gemini explains *why* ("O zagueiro #5 deixou espaco entre ele e o lateral, criando uma linha de passe direta ao pivô")
- **Historical comparison**: When retrieval finds similar plays, Gemini narrates the tactical similarities and differences

**3. Training Pipeline**

With GPU, we can actually train the GNN on collected data:
- Start with heuristic weights (geometric features)
- Collect labeled data from analyzed videos (user marks outcomes: goal, save, clearance)
- Fine-tune GATv2 + CVAE on accumulated match data
- Model improves over time as more videos are analyzed

---

## 4. Phase 1: BEV Transformation and Graph Construction

### Goal
Transform YOLO detections (in camera-perspective pixel coordinates) into a Bird's Eye View (BEV) pitch coordinate system.

### Why This Matters
The GNN and all tactical analysis require normalized pitch coordinates, not perspective-distorted pixel coordinates. A corner kick from the camera's far side appears smaller than one from the near side. Homography corrects this.

### Implementation

#### New file: `tactical_ai.py`

This is the main Python pipeline, following the same pattern as `ml_pipeline.py` (takes JSON stdin or file path, writes JSON to stdout, progress to stderr).

```python
def estimate_homography(detections, video_meta):
    """
    Estimate a perspective transform from camera view to BEV.

    Strategy (no manual calibration):
    1. Detect pitch lines using Hough transform on edge-detected frames
    2. If lines are found: use 4-point correspondence to compute homography
    3. Fallback: use the bounding box of all player positions as an
       approximate affine transform (assumes camera is roughly centered)

    Returns: 3x3 homography matrix H such that BEV_point = H @ camera_point
    """

def transform_to_bev(detections, H, pitch_dims=(105, 68)):
    """
    Apply homography H to all player/ball positions.
    Adds 'bev_x' and 'bev_y' fields (in meters, 0-105 x 0-68).
    Returns modified detections with BEV coordinates.
    """

def build_player_graph(bev_frame, radius_m=15.0):
    """
    Construct a graph from one frame of BEV player positions.

    Nodes: Each player (identified by trackId).
      Node features: [bev_x, bev_y, team_id_onehot(2), velocity_x, velocity_y,
                      ball_distance, is_ball_carrier]

    Edges: Connect players within `radius_m` meters of each other.
      Edge features: [distance, angle, same_team(bool)]

    Returns: dict with 'nodes', 'edges', 'node_features', 'edge_features'
    """
```

**Homography estimation detail**: The fallback approach (when pitch lines are not detected) uses the observation that in most broadcast footage, the visible player positions roughly define a convex hull that maps to a rectangular pitch region. We compute the minimum bounding rectangle of all player positions across the entire video and map it to a standard pitch (105m x 68m).

```python
def fallback_homography(all_positions, pitch_dims=(105, 68)):
    """
    Given all (x, y) player positions in normalized camera coords [0,1],
    compute an affine transform to pitch coords.
    """
    import cv2
    points = np.array(all_positions, dtype=np.float32)
    rect = cv2.minAreaRect(points)
    box = cv2.boxPoints(rect).astype(np.float32)

    # Sort box points: top-left, top-right, bottom-right, bottom-left
    dst = np.array([
        [0, 0],
        [pitch_dims[0], 0],
        [pitch_dims[0], pitch_dims[1]],
        [0, pitch_dims[1]]
    ], dtype=np.float32)

    H = cv2.getPerspectiveTransform(box, dst)
    return H
```

**Integration with existing `ml_pipeline.py`**: Rather than modifying `ml_pipeline.py`, the new `tactical_ai.py` takes its output as input. The server calls them in sequence (or reads from GCS if ML results are already saved).

### Node Feature Vector (per player, per frame)

```
[bev_x,        # 0-105 meters
 bev_y,        # 0-68 meters
 vel_x,        # meters/second (computed from consecutive frames)
 vel_y,        # meters/second
 team_0,       # one-hot: 1 if team 0
 team_1,       # one-hot: 1 if team 1
 ball_dist,    # meters to ball
 has_ball]     # 1 if nearest to ball and within 2m
```

8-dimensional feature vector per node, matching TacticAI's input structure.

---

## 5. Phase 2: GNN Message Passing and Shot Probability

### Goal
Implement the GATv2 (Graph Attention Network v2) from the TacticAI paper using PyTorch Geometric with GPU acceleration, producing per-player and team-level tactical scores.

### GNN Architecture (PyTorch Geometric)

```python
import torch
import torch.nn as nn
from torch_geometric.nn import GATv2Conv
from torch_geometric.data import Data

class TacticAIGNN(nn.Module):
    """
    GATv2-based GNN following the TacticAI architecture.

    - 4 layers of multi-head GATv2 attention
    - D2-equivariant by design (input transforms propagate through)
    - Dual heads: receiver prediction + shot probability
    """
    def __init__(self, node_features=8, edge_features=3, hidden_dim=64, heads=4, num_layers=4):
        super().__init__()

        self.node_encoder = nn.Linear(node_features, hidden_dim)
        self.edge_encoder = nn.Linear(edge_features, hidden_dim)

        self.gat_layers = nn.ModuleList([
            GATv2Conv(
                in_channels=hidden_dim,
                out_channels=hidden_dim // heads,
                heads=heads,
                edge_dim=hidden_dim,
                concat=True,
                dropout=0.1,
            )
            for _ in range(num_layers)
        ])

        self.layer_norms = nn.ModuleList([
            nn.LayerNorm(hidden_dim) for _ in range(num_layers)
        ])

        # Receiver prediction head
        self.receiver_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
        )

        # Shot probability head (graph-level)
        self.shot_head = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid(),
        )

    def forward(self, data):
        x = self.node_encoder(data.x)              # (N, hidden_dim)
        edge_attr = self.edge_encoder(data.edge_attr)  # (E, hidden_dim)

        # Message passing layers with residual connections
        for i, (gat, norm) in enumerate(zip(self.gat_layers, self.layer_norms)):
            x_res = x
            x = gat(x, data.edge_index, edge_attr=edge_attr)
            x = norm(x + x_res)  # residual + layer norm
            if i < len(self.gat_layers) - 1:
                x = torch.relu(x)

        # Per-node receiver probability
        receiver_logits = self.receiver_head(x).squeeze(-1)  # (N,)

        # Graph-level shot probability
        # Pool over attacking team nodes only
        attacking_mask = data.x[:, 4] == 1  # team_0 one-hot
        if attacking_mask.any():
            graph_repr = x[attacking_mask].mean(dim=0)
        else:
            graph_repr = x.mean(dim=0)
        shot_prob = self.shot_head(graph_repr)  # scalar

        return {
            'node_embeddings': x,                    # (N, hidden_dim) -- latent space for retrieval
            'receiver_logits': receiver_logits,       # (N,) -- softmax for P(receiver=i)
            'shot_prob': shot_prob,                   # scalar -- P(shot)
        }

def build_pyg_graph(bev_frame, device='cuda'):
    """
    Convert a BEV frame dict into a PyTorch Geometric Data object.
    """
    players = bev_frame['players']
    ball = bev_frame.get('ball', {'bev_x': 52.5, 'bev_y': 34.0})

    # Node features: [bev_x, bev_y, vel_x, vel_y, team_0, team_1, ball_dist, has_ball]
    node_features = []
    for p in players:
        ball_dist = np.sqrt((p['bev_x'] - ball['bev_x'])**2 + (p['bev_y'] - ball['bev_y'])**2)
        node_features.append([
            p['bev_x'] / 105.0,  # normalize to [0, 1]
            p['bev_y'] / 68.0,
            p.get('vel_x', 0) / 10.0,  # normalize velocity
            p.get('vel_y', 0) / 10.0,
            1.0 if p['team_id'] == 0 else 0.0,
            1.0 if p['team_id'] == 1 else 0.0,
            ball_dist / 105.0,
            1.0 if ball_dist < 2.0 else 0.0,
        ])

    x = torch.tensor(node_features, dtype=torch.float32, device=device)

    # Fully connected edges (as in TacticAI paper)
    N = len(players)
    edge_index = []
    edge_attr = []
    for i in range(N):
        for j in range(N):
            if i == j:
                continue
            edge_index.append([i, j])
            dist = np.sqrt(
                (players[i]['bev_x'] - players[j]['bev_x'])**2 +
                (players[i]['bev_y'] - players[j]['bev_y'])**2
            )
            same_team = 1.0 if players[i]['team_id'] == players[j]['team_id'] else 0.0
            angle = np.arctan2(
                players[j]['bev_y'] - players[i]['bev_y'],
                players[j]['bev_x'] - players[i]['bev_x']
            )
            edge_attr.append([dist / 105.0, same_team, angle / np.pi])

    edge_index = torch.tensor(edge_index, dtype=torch.long, device=device).t()
    edge_attr = torch.tensor(edge_attr, dtype=torch.float32, device=device)

    return Data(x=x, edge_index=edge_index, edge_attr=edge_attr)
```

### Heuristic Initialization (Before Training Data)

Until we have labeled match data for training, the GNN starts with **heuristic weights** that encode geometric football knowledge. This gives reasonable shot probabilities from day one, improving as labeled data accumulates:

```python
def heuristic_shot_probability(graph, enriched_nodes, ball_pos, attacking_team_id):
    """
    Fallback when no trained GNN weights are available.
    Uses geometric heuristics matching the GNN's output format.
    """
    # ... (same factored estimation as before, but output format
    # matches GNN so the UI code doesn't need to change)
```

### Shot Probability Computation

Following TacticAI's factored shot probability:

```
P(shot) = sum_i P(shot | receiver=i) * P(receiver=i)
```

```python
def compute_shot_probability(graph, enriched_nodes, ball_pos, attacking_team_id):
    """
    Compute shot probability using factored estimation.

    P(receiver=i): Based on proximity to ball, passing lane clearness,
                    and momentum toward ball.
    P(shot|receiver=i): Based on distance to goal, angle to goal,
                         number of defenders between player and goal,
                         and player's velocity toward goal.

    Returns: {
        'total_shot_prob': float 0-1,
        'per_player': {trackId: {
            'receive_prob': float,
            'shot_given_receive': float,
            'contribution': float
        }}
    }
    """
    goal_pos = np.array([105.0, 34.0])  # center of goal

    # Identify attacking players
    attacking = [i for i in range(len(enriched_nodes))
                 if enriched_nodes[i, 4 + attacking_team_id] == 1]
    defending = [i for i in range(len(enriched_nodes))
                 if i not in attacking]

    # P(receiver=i) -- softmax of proximity + lane quality
    receive_scores = []
    for i in attacking:
        dist_to_ball = enriched_nodes[i, 6]  # ball_dist
        lane_clear = compute_passing_lane_quality(
            ball_pos, enriched_nodes[i, :2],
            [enriched_nodes[d, :2] for d in defending]
        )
        score = lane_clear / (dist_to_ball + 1.0)
        receive_scores.append((i, score))

    # Softmax normalization
    scores = np.array([s for _, s in receive_scores])
    exp_scores = np.exp(scores - scores.max())
    receive_probs = exp_scores / exp_scores.sum()

    # P(shot|receiver=i) -- heuristic based on position + defenders
    total_shot = 0.0
    per_player = {}
    for idx, (i, _) in enumerate(receive_scores):
        pos = enriched_nodes[i, :2]
        dist_to_goal = np.linalg.norm(pos - goal_pos)
        angle_to_goal = compute_goal_angle(pos)
        defenders_blocking = count_defenders_in_cone(
            pos, goal_pos, [enriched_nodes[d, :2] for d in defending]
        )

        dist_factor = np.exp(-dist_to_goal / 30.0)
        angle_factor = angle_to_goal / 180.0
        blocking_factor = 1.0 / (1.0 + defenders_blocking)

        shot_given_receive = dist_factor * angle_factor * blocking_factor
        shot_given_receive = np.clip(shot_given_receive, 0, 1)

        contribution = receive_probs[idx] * shot_given_receive
        total_shot += contribution

        track_id = graph['track_ids'][i]
        per_player[str(track_id)] = {
            'receive_prob': float(receive_probs[idx]),
            'shot_given_receive': float(shot_given_receive),
            'contribution': float(contribution),
        }

    return {
        'total_shot_prob': float(np.clip(total_shot, 0, 1)),
        'per_player': per_player,
    }
```

### Visualization (in video-overlay.js)

The GNN message passing will be visualized as lines connecting players, with line thickness proportional to message weight:

```javascript
// New method in VideoOverlay class

_drawTacticalGnn(mlFrame, tacticalData) {
    if (!tacticalData || !mlFrame) return;

    this.ctx.save();

    const frameData = this._findTacticalFrame(tacticalData, mlFrame.timestamp);
    if (!frameData) { this.ctx.restore(); return; }

    // Draw message passing edges
    if (frameData.edges) {
        for (const edge of frameData.edges) {
            const from = this._getPlayerCenter(mlFrame, edge.from_track);
            const to = this._getPlayerCenter(mlFrame, edge.to_track);
            if (!from || !to) continue;

            const weight = edge.weight || 0.5;
            this.ctx.strokeStyle = edge.same_team
                ? `rgba(48, 195, 158, ${weight * 0.8})`   // green for teammates
                : `rgba(255, 58, 94, ${weight * 0.6})`;    // red for opponents
            this.ctx.lineWidth = 1 + weight * 4;
            this.ctx.setLineDash(edge.same_team ? [] : [4, 4]);

            this.ctx.beginPath();
            this.ctx.moveTo(from.x, from.y);
            this.ctx.lineTo(to.x, to.y);
            this.ctx.stroke();
        }
    }

    // Draw shot probability badge per player
    if (frameData.shot_probs?.per_player) {
        for (const [trackId, probs] of Object.entries(frameData.shot_probs.per_player)) {
            const center = this._getPlayerCenter(mlFrame, parseInt(trackId));
            if (!center) continue;

            const contrib = probs.contribution;
            if (contrib < 0.01) continue;

            // Shot threat circle (size = contribution)
            const radius = 8 + contrib * 40;
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y - 25, radius, 0, 2 * Math.PI);
            this.ctx.fillStyle = `rgba(255, 69, 0, ${0.2 + contrib * 0.6})`;
            this.ctx.fill();

            // Percentage label
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`${Math.round(contrib * 100)}%`, center.x, center.y - 22);
        }
    }

    // Total shot probability HUD
    if (frameData.shot_probs?.total_shot_prob != null) {
        this._drawShotProbHud(frameData.shot_probs.total_shot_prob);
    }

    this.ctx.restore();
}
```

---

## 6. Phase 3: D2 Symmetry Transformations

### Goal
Allow the user to toggle symmetry transformations that flip the tactical view, demonstrating how plays can be mirrored and still be strategically equivalent.

### D2 Group Elements

The dihedral group D2 has four elements:
1. **Identity (e)**: No transformation
2. **Horizontal flip (h)**: Mirror across the midfield line (x -> 105 - x)
3. **Vertical flip (v)**: Mirror across the center line (y -> 68 - y)
4. **Both (hv)**: Apply both flips (rotation by 180 degrees)

### Python Implementation

```python
def apply_d2_symmetry(bev_data, transform='identity', pitch_dims=(105, 68)):
    """
    Apply D2 symmetry transformation to BEV coordinates.

    For ball curve (efeito) analysis:
      horizontal flip also negates lateral velocity (vy -> -vy)
      vertical flip negates longitudinal velocity (vx -> -vx)
    """
    import copy
    result = copy.deepcopy(bev_data)
    L, W = pitch_dims

    for player in result['players']:
        if transform in ('horizontal', 'both'):
            player['bev_x'] = L - player['bev_x']
            player['vel_x'] = -player.get('vel_x', 0)
        if transform in ('vertical', 'both'):
            player['bev_y'] = W - player['bev_y']
            player['vel_y'] = -player.get('vel_y', 0)

    if result.get('ball'):
        if transform in ('horizontal', 'both'):
            result['ball']['bev_x'] = L - result['ball']['bev_x']
        if transform in ('vertical', 'both'):
            result['ball']['bev_y'] = W - result['ball']['bev_y']

    return result
```

### Client-Side Symmetry Toggle

D2 transforms are pure coordinate flips -- they run client-side with no server call needed:

```javascript
// In shared/tactical-ui.js

class TacticalUI {
    constructor(overlay, container) {
        this.overlay = overlay;
        this.symmetryMode = 'identity';
        this.tacticalData = null;
        this.originalTacticalData = null;
    }

    setSymmetryMode(mode) {
        this.symmetryMode = mode;
        if (mode === 'identity') {
            this.tacticalData = this.originalTacticalData;
        } else {
            this.tacticalData = this._applySymmetry(this.originalTacticalData, mode);
        }
        this.overlay.setTacticalData(this.tacticalData);
        this.overlay.render();
    }

    _applySymmetry(data, transform) {
        const pitchL = 105, pitchW = 68;
        const result = JSON.parse(JSON.stringify(data)); // deep clone

        for (const frame of result.frames) {
            for (const player of frame.players) {
                if (transform === 'horizontal' || transform === 'both') {
                    player.bev_x = pitchL - player.bev_x;
                }
                if (transform === 'vertical' || transform === 'both') {
                    player.bev_y = pitchW - player.bev_y;
                }
            }
            if (frame.ball) {
                if (transform === 'horizontal' || transform === 'both') {
                    frame.ball.bev_x = pitchL - frame.ball.bev_x;
                }
                if (transform === 'vertical' || transform === 'both') {
                    frame.ball.bev_y = pitchW - frame.ball.bev_y;
                }
            }
        }
        return result;
    }
}
```

### UI Controls

```html
<!-- Inside the TacticAI tab panel -->
<div class="symmetry-controls">
    <span class="control-label">Invariancia D2 (Simetria):</span>
    <button class="btn btn-sm btn-symmetry active" data-symmetry="identity">
        <i class="fas fa-equals"></i> Identidade
    </button>
    <button class="btn btn-sm btn-symmetry" data-symmetry="horizontal">
        <i class="fas fa-arrows-alt-h"></i> Horizontal
    </button>
    <button class="btn btn-sm btn-symmetry" data-symmetry="vertical">
        <i class="fas fa-arrows-alt-v"></i> Vertical
    </button>
    <button class="btn btn-sm btn-symmetry" data-symmetry="both">
        <i class="fas fa-sync-alt"></i> Ambos
    </button>
</div>
```

---

## 7. Phase 4: CVAE Guided Generation ("Optimize Defense")

### Goal
Given the current player positions and ball position, suggest how to reposition defenders to minimize shot probability. Uses a real Conditional VAE (as in the TacticAI paper) plus Gemini for coaching narration.

### Approach: CVAE + GNN + Gemini

With GPU available, we implement the full TacticAI generative pipeline:

1. **CVAE** encodes current positions, conditions on target outcome (P(shot) -> 0), decodes suggested positions
2. **GNN** evaluates the suggested positions to verify improvement
3. **Gemini** explains the tactical rationale in natural language (Portuguese)

```python
class TacticalCVAE(nn.Module):
    """
    Conditional Variational Autoencoder for guided defense generation.

    Encoder: Current graph state -> latent z
    Decoder: z + condition (target_shot_prob) -> adjusted defender positions

    Following TacticAI: only decoder positions for the defending team are generated.
    Attacking team positions and ball remain fixed.
    """
    def __init__(self, node_dim=64, latent_dim=32, condition_dim=1):
        super().__init__()
        self.latent_dim = latent_dim

        # Encoder: graph embedding -> mu, log_var
        self.encoder_mu = nn.Linear(node_dim, latent_dim)
        self.encoder_logvar = nn.Linear(node_dim, latent_dim)

        # Decoder: z + condition -> defender positions (x, y per defender)
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim + condition_dim, 128),
            nn.ReLU(),
            nn.Linear(128, 128),
            nn.ReLU(),
            nn.Linear(128, 22),  # max 11 defenders * 2 coords
            nn.Sigmoid(),  # output in [0, 1], scale to pitch dims
        )

    def encode(self, graph_embedding):
        mu = self.encoder_mu(graph_embedding)
        logvar = self.encoder_logvar(graph_embedding)
        return mu, logvar

    def reparameterize(self, mu, logvar):
        std = torch.exp(0.5 * logvar)
        eps = torch.randn_like(std)
        return mu + eps * std

    def decode(self, z, condition):
        combined = torch.cat([z, condition], dim=-1)
        return self.decoder(combined)

    def forward(self, graph_embedding, condition):
        mu, logvar = self.encode(graph_embedding)
        z = self.reparameterize(mu, logvar)
        positions = self.decode(z, condition)
        return positions, mu, logvar


def optimize_defense(gnn_model, cvae_model, graph_data, attacking_team_id,
                     target_shot_prob=0.05, num_samples=10, device='cuda'):
    """
    Generate optimal defender positions using CVAE + GNN evaluation.

    1. Encode current state with CVAE
    2. Decode multiple candidate positions conditioned on low shot probability
    3. Evaluate each candidate with GNN
    4. Return the best candidate

    Returns: {
        'original_positions': {trackId: [x, y]},
        'suggested_positions': {trackId: [x, y]},
        'displacement_m': {trackId: float},
        'original_shot_prob': float,
        'optimized_shot_prob': float,
        'improvement_pct': float,
        'out_of_position': [trackId, ...],
    }
    """
    gnn_model.eval()
    cvae_model.eval()

    with torch.no_grad():
        # Get current GNN embedding
        gnn_output = gnn_model(graph_data)
        graph_embedding = gnn_output['node_embeddings'].mean(dim=0)
        original_shot = gnn_output['shot_prob'].item()

        # Generate candidate positions
        condition = torch.tensor([[target_shot_prob]], device=device)
        best_shot = original_shot
        best_positions = None

        for _ in range(num_samples):
            positions, _, _ = cvae_model(graph_embedding.unsqueeze(0), condition)
            # Apply positions to graph, re-evaluate
            modified_data = apply_positions_to_graph(graph_data, positions, attacking_team_id)
            new_output = gnn_model(modified_data)
            new_shot = new_output['shot_prob'].item()

            if new_shot < best_shot:
                best_shot = new_shot
                best_positions = positions

    # Build output dict with displacement analysis
    return build_optimization_output(
        graph_data, best_positions, original_shot, best_shot, attacking_team_id
    )
```

### Gemini Coaching Narration

After optimization, we send the results to Gemini for natural-language explanation:

```python
async def generate_tactical_narration(optimization_result, frame_context):
    """
    Use Gemini to explain WHY defenders are out of position and
    WHAT the suggested movement achieves tactically.

    Sends: optimization deltas, shot probability change, player positions
    Returns: coaching narrative in Portuguese
    """
    prompt = f"""Voce e um analista tatico de futebol profissional.

Situacao atual:
- Probabilidade de chute: {optimization_result['original_shot_prob']:.0%}
- Apos otimizacao: {optimization_result['optimized_shot_prob']:.0%}

Jogadores fora de posicao:
{format_out_of_position(optimization_result)}

Explique em 3-4 frases:
1. Por que a defesa esta vulneravel nesta configuracao
2. O que cada movimento sugerido resolve taticamente
3. Uma instrucao direta que o treinador pode gritar da beira do campo

Use terminologia brasileira (zagueiro, volante, lateral, marcacao, cobertura).
"""
    # Call Vertex AI Gemini via existing server pattern
    response = await gemini_generate(prompt)
    return response
```

### Fallback: Scipy Optimization (When CVAE Not Yet Trained)

Before enough labeled data exists to train the CVAE, we fall back to scipy L-BFGS-B optimization. The GNN's differentiable shot probability is used as the objective function:

```python
def optimize_defense_fallback(gnn_model, graph_data, attacking_team_id):
    """
    Gradient-based optimization using GNN shot probability as objective.
    Requires GNN but not CVAE. Bridges the gap until CVAE is trained.
    """
    from scipy.optimize import minimize
    # ... optimize defender (x,y) to minimize gnn shot_prob
    # Same output format as CVAE version
```

### Visualization: Ghost Players

```javascript
// In video-overlay.js

_drawOptimizedPositions(mlFrame, optimizeResult) {
    if (!optimizeResult?.suggested_positions) return;

    this.ctx.save();

    for (const [trackId, suggestedBev] of Object.entries(optimizeResult.suggested_positions)) {
        const originalBev = optimizeResult.original_positions[trackId];
        if (!originalBev) continue;

        const displacement = optimizeResult.displacement_m[trackId];
        if (displacement < 0.5) continue;

        // Convert BEV back to camera coordinates for rendering
        const suggested_cam = this._bevToCamera(suggestedBev);
        const original_cam = this._bevToCamera(originalBev);
        if (!suggested_cam || !original_cam) continue;

        const sx = suggested_cam.x * this.canvas.width;
        const sy = suggested_cam.y * this.canvas.height;
        const ox = original_cam.x * this.canvas.width;
        const oy = original_cam.y * this.canvas.height;

        // Dashed arrow from original to suggested position
        this.ctx.strokeStyle = 'rgba(0, 255, 128, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([6, 4]);
        this.ctx.beginPath();
        this.ctx.moveTo(ox, oy);
        this.ctx.lineTo(sx, sy);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Ghost player circle at suggested position
        this.ctx.beginPath();
        this.ctx.arc(sx, sy, 12, 0, 2 * Math.PI);
        this.ctx.strokeStyle = 'rgba(0, 255, 128, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.fillStyle = 'rgba(0, 255, 128, 0.2)';
        this.ctx.fill();

        // Displacement label
        this.ctx.fillStyle = 'rgba(0, 255, 128, 0.9)';
        this.ctx.font = 'bold 9px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${displacement.toFixed(1)}m`, sx, sy + 20);
    }

    this.ctx.restore();
}
```

### Coach-Facing Output (GNN + Gemini)

When a Brazilian coach clicks "Otimizar Defesa", the UI shows GNN results immediately, then Gemini narration streams in:

**Instant (GNN, ~10ms):**
> **Probabilidade de Chute: 18% -> 5%** (melhoria de 72%)
>
> Jogadores fora de posicao:
> - Marcador #3: mover 3.2m para a esquerda
> - Zagueiro #5: mover 1.8m para frente

**Streamed (Gemini, ~3s):**
> "O zagueiro #5 esta deixando um espaco de cobertura entre ele e o lateral direito. Isso cria uma linha de passe direta para o pivo adversario na area. Se o #5 fecha 1.8m para dentro, a linha de passe e cortada e o pivo fica isolado sem opcao de giro. Instrucao: 'Cinco, fecha por dentro! Lateral cobre o fundo!'"

This combines the GNN's mathematical precision with Gemini's tactical vocabulary and coaching communication style.

---

## 8. Phase 5: Retrieval System and Similarity Search

### Goal
Find strategically similar tactical situations across previously analyzed videos using latent space embedding.

### Approach: Tactical Fingerprint

Since we do not have a trained GNN encoder, we build a **structured tactical fingerprint** from the heuristic features:

```python
def compute_tactical_fingerprint(graph, enriched_nodes, shot_probs):
    """
    Compute a fixed-size tactical fingerprint vector for a given frame.
    This serves as the "latent representation" for retrieval.

    Components (total: 32 dimensions):
    - Team A centroid (2): mean BEV position of team A
    - Team B centroid (2): mean BEV position of team B
    - Team A spread (2): std of BEV positions
    - Team B spread (2): std of BEV positions
    - Ball position (2): BEV coordinates
    - Formation compactness A (1): avg inter-player distance
    - Formation compactness B (1): avg inter-player distance
    - Defensive line height A (1): mean x of deepest 4 players
    - Defensive line height B (1): mean x of deepest 4 players
    - Width usage A (1): y-range of team A
    - Width usage B (1): y-range of team B
    - Total shot probability (1): from shot_probs
    - Top 3 player shot contributions (3): sorted desc
    - Possession indicator (1): which team has ball
    - Ball velocity magnitude (1): speed of ball
    - Ball velocity angle (1): direction of ball movement
    - Passing lane density A (1): avg clear lanes per player
    - Passing lane density B (1): avg clear lanes per player
    - Triangulation score A (1): Delaunay triangle quality
    - Triangulation score B (1): Delaunay triangle quality
    - Pressing intensity (1): num opponents within 3m of ball
    - Counter-attack potential (1): space behind defensive line
    - Reserved (4): zero-padded for future use

    Returns: np.array of shape (32,), L2-normalized
    """
```

### Storage and Retrieval

With GPU available, we use **FAISS-GPU** for fast nearest-neighbor retrieval instead of brute-force cosine similarity. The GNN's learned latent space (64-dim node embeddings, pooled to graph-level) produces better similarity than hand-crafted fingerprints.

```python
import faiss

class TacticalRetrieval:
    """
    FAISS-GPU index for tactical similarity search.

    Uses GNN latent embeddings (64-dim) rather than hand-crafted fingerprints.
    The GNN encoder learns to represent tactical structure, making
    retrieval quality improve as the model trains on more data.
    """
    def __init__(self, embedding_dim=64, use_gpu=True):
        self.embedding_dim = embedding_dim
        self.index = faiss.IndexFlatIP(embedding_dim)  # inner product (cosine on L2-normed)
        if use_gpu:
            res = faiss.StandardGpuResources()
            self.index = faiss.index_cpu_to_gpu(res, 0, self.index)
        self.metadata = []  # parallel list of {analysisId, timestamp, video_name}

    def add(self, embedding, metadata):
        """Add a tactical embedding to the index."""
        embedding = np.array(embedding, dtype=np.float32).reshape(1, -1)
        faiss.normalize_L2(embedding)
        self.index.add(embedding)
        self.metadata.append(metadata)

    def search(self, query_embedding, top_k=5):
        """Find top_k most similar tactical situations."""
        query = np.array(query_embedding, dtype=np.float32).reshape(1, -1)
        faiss.normalize_L2(query)
        scores, indices = self.index.search(query, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.metadata):
                continue
            results.append({
                'similarity': float(score),
                **self.metadata[idx],
            })
        return results

    def save(self, path):
        """Save index + metadata to GCS."""
        cpu_index = faiss.index_gpu_to_cpu(self.index) if hasattr(self.index, 'getDevice') else self.index
        faiss.write_index(cpu_index, f"{path}/index.faiss")
        # Save metadata as JSON

    def load(self, path):
        """Load index + metadata from GCS."""
        cpu_index = faiss.read_index(f"{path}/index.faiss")
        # ... gpu transfer + metadata load
```

### Gemini-Enhanced Retrieval Results

When similar plays are found, Gemini narrates the tactical comparison:

```python
async def narrate_retrieval(query_frame, similar_results):
    """
    Use Gemini to explain WHY two tactical situations are similar
    and what the coach can learn from the historical example.
    """
    prompt = f"""Voce e um analista tatico. Compare estas duas jogadas:

JOGADA ATUAL: {format_frame(query_frame)}
JOGADA SIMILAR ({similar_results[0]['video_name']}, {similar_results[0]['similarity']:.0%} similaridade):
{format_frame(similar_results[0]['frame_data'])}

Explique:
1. O que torna estas jogadas taticamente similares
2. O que aconteceu na jogada historica e o que o treinador pode aprender
3. Se a defesa atual esta melhor ou pior posicionada que na jogada historica

Use terminologia brasileira."""
    return await gemini_generate(prompt)
```

### UI: "Busca Tatica" Panel

The retrieval results panel shows historical matches:

```
Busca Tatica - Situacoes Similares

1. FLA vs PAL 2024 (96% similaridade)
   Timestamp: 23:45 | Prob. Chute: 15%
   [Ver Video]

2. GRE vs INT 2024 (89% similaridade)
   Timestamp: 67:12 | Prob. Chute: 22%
   [Ver Video]
```

---

## 9. Phase 6: Brazilian Coach Adaptations

### Goal
Add Portuguese football terminology and Brazilian-specific tactical concepts as a localization and analysis layer.

### Brazilian Terminology Module

#### New file: `shared/brazilian-tactics.js`

```javascript
const BRAZILIAN_TERMS = {
    // Player roles
    roles: {
        'Goleiro': { en: 'Goalkeeper', position: 'GK' },
        'Zagueiro': { en: 'Center Back', position: 'CB' },
        'Lateral': { en: 'Full Back', position: 'FB' },
        'Volante': { en: 'Defensive Midfielder', position: 'CDM' },
        'Meia': { en: 'Midfielder', position: 'CM' },
        'Ponta': { en: 'Winger', position: 'W' },
        'Centroavante': { en: 'Striker', position: 'ST' },
        'Pivo': { en: 'Target Man / Pivot', position: 'ST' },
    },

    // Tactical concepts
    concepts: {
        'Triangulacao': {
            en: 'Triangulation',
            description: 'Forming triangles between 3 nearby teammates for passing options',
            visualization: 'triangle',
        },
        'Pequenos Espacos': {
            en: 'Small Spaces / Compactness',
            description: 'Team compactness heatmap showing density of players',
            visualization: 'heatmap',
        },
        'Infiltracao': {
            en: 'Infiltration Run',
            description: 'A player running into space behind the defense',
            visualization: 'arrow',
        },
        'Tabela': {
            en: 'Wall Pass / One-Two',
            description: 'Quick pass exchange between two players',
            visualization: 'double_arrow',
        },
        'Batedor': {
            en: 'Set-Piece Taker',
            description: 'Player responsible for taking set pieces',
            visualization: 'highlight',
        },
        'Efeito': {
            en: 'Ball Curve / Spin',
            description: 'Curved ball trajectory analysis',
            visualization: 'curve',
        },
        'Busca Tatica': {
            en: 'Tactical Search',
            description: 'Find similar tactical situations in history',
            visualization: 'search',
        },
    },

    // UI labels
    ui: {
        'shot_probability': 'Probabilidade de Chute',
        'optimize_defense': 'Otimizar Defesa',
        'symmetry': 'Simetria',
        'identity': 'Identidade',
        'horizontal': 'Horizontal',
        'vertical': 'Vertical',
        'both': 'Ambos',
        'tactical_search': 'Busca Tatica',
        'similarity': 'Similaridade',
        'compactness': 'Compacidade',
        'triangulation': 'Triangulacao',
        'formation': 'Formacao',
        'pressing': 'Pressao',
        'counter_attack': 'Contra-Ataque',
        'possession': 'Posse de Bola',
        'out_of_position': 'Fora de Posicao',
        'suggested_move': 'Movimento Sugerido',
    }
};

export default BRAZILIAN_TERMS;
```

### Triangulation Visualization ("Triangulacoes")

```javascript
// In video-overlay.js

_drawTriangulacao(mlFrame, teamId) {
    if (!mlFrame?.players) return;

    const teamPlayers = mlFrame.players.filter(p => p.teamId === teamId);
    if (teamPlayers.length < 3) return;

    const positions = teamPlayers.map(p => ({
        cx: ((p.bbox[0] + p.bbox[2]) / 2) * this.canvas.width,
        cy: ((p.bbox[1] + p.bbox[3]) / 2) * this.canvas.height,
        trackId: p.trackId,
    }));

    const color = teamId < this.teamColorsRgb.length
        ? this.teamColorsRgb[teamId]
        : [180, 180, 180];

    this.ctx.save();

    // For each player, connect to 2 nearest teammates
    const drawn = new Set();
    for (let i = 0; i < positions.length; i++) {
        const distances = positions.map((p, j) => ({
            j,
            dist: Math.hypot(p.cx - positions[i].cx, p.cy - positions[i].cy),
        })).filter(d => d.j !== i).sort((a, b) => a.dist - b.dist);

        const nearest2 = distances.slice(0, 2);
        const triKey = [i, nearest2[0].j, nearest2[1].j].sort().join('-');
        if (drawn.has(triKey)) continue;
        drawn.add(triKey);

        // Draw filled triangle
        const p1 = positions[i];
        const p2 = positions[nearest2[0].j];
        const p3 = positions[nearest2[1].j];

        this.ctx.beginPath();
        this.ctx.moveTo(p1.cx, p1.cy);
        this.ctx.lineTo(p2.cx, p2.cy);
        this.ctx.lineTo(p3.cx, p3.cy);
        this.ctx.closePath();
        this.ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.12)`;
        this.ctx.fill();
        this.ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.5)`;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
    }

    this.ctx.restore();
}
```

### Compactness Heatmap ("Pequenos Espacos")

```javascript
_drawCompactnessHeatmap(mlFrame, teamId) {
    if (!mlFrame?.players) return;

    const teamPlayers = mlFrame.players.filter(p => p.teamId === teamId);
    if (teamPlayers.length < 2) return;

    this.ctx.save();

    // Gaussian kernel density estimation on a 20x20 grid
    const gridSize = 20;
    const cellW = this.canvas.width / gridSize;
    const cellH = this.canvas.height / gridSize;
    const sigma = 3;

    const grid = Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));

    for (const player of teamPlayers) {
        const px = ((player.bbox[0] + player.bbox[2]) / 2) * gridSize;
        const py = ((player.bbox[1] + player.bbox[3]) / 2) * gridSize;

        for (let gx = 0; gx < gridSize; gx++) {
            for (let gy = 0; gy < gridSize; gy++) {
                const dist2 = (gx - px) ** 2 + (gy - py) ** 2;
                grid[gx][gy] += Math.exp(-dist2 / (2 * sigma * sigma));
            }
        }
    }

    // Normalize and render
    let maxVal = 0;
    for (const row of grid) for (const v of row) if (v > maxVal) maxVal = v;
    if (maxVal === 0) { this.ctx.restore(); return; }

    const color = teamId < this.teamColorsRgb.length
        ? this.teamColorsRgb[teamId] : [180, 180, 180];

    for (let gx = 0; gx < gridSize; gx++) {
        for (let gy = 0; gy < gridSize; gy++) {
            const intensity = grid[gx][gy] / maxVal;
            if (intensity < 0.1) continue;

            this.ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${intensity * 0.35})`;
            this.ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
        }
    }

    this.ctx.restore();
}
```

### D2 Symmetry for "Efeito" (Ball Curve)

The D2 symmetry toggle is especially useful for Brazilian coaches analyzing set pieces:
- **Horizontal flip**: See how defensive zonal marking responds when an "escanteio fechado" (inswinging corner) comes from the left vs right
- **Vertical flip**: Mirror the "efeito" applied by left vs right-footed players
- Allows coaches to quickly evaluate: "Does our defensive zone hold up when the curve direction is mirrored?"

---

## 10. Phase 7: Interactive UI

### Goal
Allow users to drag player positions on the canvas, then re-run shot probability computation and see updated results in real-time.

### Drag-to-Reposition

```javascript
// In shared/tactical-ui.js

class TacticalInteraction {
    constructor(overlay, canvas) {
        this.overlay = overlay;
        this.canvas = canvas;
        this.isDragging = false;
        this.dragTrackId = null;
        this.modifiedPositions = {};  // trackId -> {x, y} overrides
        this._onPositionChange = null;
        this._bindEvents();
    }

    onPositionChange(callback) {
        this._onPositionChange = callback;
    }

    _bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this._onMouseUp());
    }

    _onMouseDown(e) {
        const player = this._findPlayerAtPoint(e);
        if (player && player.trackId >= 0) {
            this.isDragging = true;
            this.dragTrackId = player.trackId;
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    _onMouseMove(e) {
        if (!this.isDragging) {
            const player = this._findPlayerAtPoint(e);
            this.canvas.style.cursor = player ? 'grab' : 'default';
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        this.modifiedPositions[this.dragTrackId] = { x, y };
        this.overlay.setModifiedPositions(this.modifiedPositions);
        this.overlay.render();
    }

    _onMouseUp() {
        if (this.isDragging && this.dragTrackId != null) {
            this.isDragging = false;
            this.canvas.style.cursor = 'default';

            if (this._onPositionChange) {
                this._onPositionChange(this.modifiedPositions);
            }
            this.dragTrackId = null;
        }
    }

    resetPositions() {
        this.modifiedPositions = {};
        this.overlay.setModifiedPositions({});
        this.overlay.render();
    }
}
```

### "Otimizar Defesa" Button Flow

```javascript
// In video-analysis/script.js

async function optimizeDefense() {
    const currentTime = resultVideo.currentTime;
    const mlFrame = videoOverlay.findMlFrameByTime(currentTime);
    if (!mlFrame) {
        alert('Sem dados de jogadores neste momento');
        return;
    }

    const modifiedPositions = tacticalInteraction?.modifiedPositions || {};

    const response = await fetch('/api/tactical/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mlFrame,
            modifiedPositions,
            attackingTeamId: 0,
            homography: tacticalData?.homography || null,
        }),
    });

    const result = await response.json();

    // 1. Show GNN results immediately (ghost players + shot prob delta)
    videoOverlay.setOptimizeResult(result.optimization);
    videoOverlay.render();
    displayOptimizationResults(result.optimization);

    // 2. Stream Gemini coaching narration (arrives ~3s later)
    if (result.narration) {
        displayCoachingNarration(result.narration);
    }
}
```

---

## 11. New Files Inventory

| File Path | Purpose | Lines (est.) |
|---|---|---|
| `tactical_ai.py` | Python pipeline: BEV, GNN heuristic, optimizer, fingerprints, retrieval | ~600 |
| `shared/tactical-ui.js` | TacticalUI (symmetry, drag, optimize), TacticalInteraction class | ~350 |
| `shared/brazilian-tactics.js` | Brazilian terminology dictionary, locale helper functions | ~150 |
| `shared/tactical-overlay.js` | Tactical rendering methods (GNN edges, ghost players, triangulation, heatmap) | ~500 |

**Modified existing files:**

| File Path | Changes |
|---|---|
| `shared/video-overlay.js` | Import and delegate to `tactical-overlay.js`; add `tactical-gnn` mode; add setter methods |
| `video-analysis/script.js` | Wire TacticAI tab, optimize button, symmetry toggles, retrieval display |
| `video-analysis/index.html` | Add TacticAI tab panel with controls |
| `video-analysis/styles.css` | Styles for new UI elements |
| `server.js` | Add 3 new endpoints |
| `requirements.txt` | Add `torch-geometric`, `faiss-gpu`, `scipy` |
| `Dockerfile` | Copy `tactical_ai.py` |
| `.env.example` | Add `TACTICAL_AI_ENABLED=true` |

---

## 12. API Endpoints

### `POST /api/tactical/analyze`

Runs the full tactical analysis pipeline on existing ML results.

```
Request:  { fileName: string, mlResults: object | null, analysisId?: string }
Response: {
    success: boolean,
    tacticalResults: {
        homography: number[3][3],
        frames: [{
            timestamp: number,
            players: [{ trackId, bev_x, bev_y, vel_x, vel_y, team_id }],
            ball: { bev_x, bev_y },
            edges: [{ from_track, to_track, weight, same_team }],
            shot_probs: { total_shot_prob, per_player: {...} },
            fingerprint: number[32],
        }],
        team_stats: {
            compactness: [number, number],
            avg_defensive_line_height: [number, number],
            triangulation_quality: [number, number],
        }
    }
}
```

### `POST /api/tactical/optimize`

Runs CVAE defense optimization + Gemini coaching narration for a single frame.

```
Request:  { mlFrame: object, modifiedPositions?: object, attackingTeamId: number, homography?: number[][] }
Response: {
    success: boolean,
    optimization: {
        original_positions: { trackId: [x, y] },
        suggested_positions: { trackId: [x, y] },
        displacement_m: { trackId: number },
        original_shot_prob: number,
        optimized_shot_prob: number,
        improvement_pct: number,
        out_of_position: string[],
    },
    narration: string  // Gemini-generated coaching insight in Portuguese
}
```

### `POST /api/tactical/retrieve`

Finds similar tactical situations via FAISS-GPU + Gemini comparison narration.

```
Request:  { embedding: number[64], topK?: number }
Response: {
    success: boolean,
    results: [{
        similarity: number,
        analysisId: string,
        frame_timestamp: number,
        video_name: string,
    }],
    narration: string  // Gemini comparison of current vs historical situations
}
```

---

## 13. Data Structures

### Tactical Frame (per timestamp)

```typescript
interface TacticalFrame {
    timestamp: number;
    players: TacticalPlayer[];
    ball: { bev_x: number; bev_y: number } | null;
    edges: TacticalEdge[];
    shot_probs: {
        total_shot_prob: number;
        per_player: Record<string, {
            receive_prob: number;
            shot_given_receive: number;
            contribution: number;
        }>;
    };
    embedding: number[];    // 64-dim GNN latent representation (for retrieval)
    fingerprint: number[];  // 32-dim hand-crafted features (fallback)
}

interface TacticalPlayer {
    trackId: number;
    bev_x: number;     // meters, 0-105
    bev_y: number;     // meters, 0-68
    vel_x: number;     // m/s
    vel_y: number;     // m/s
    team_id: number;   // 0 or 1
    ball_dist: number; // meters
    has_ball: boolean;
}

interface TacticalEdge {
    from_track: number;
    to_track: number;
    weight: number;      // 0-1, attention weight
    same_team: boolean;
    distance: number;    // meters
}
```

### GCS Storage Layout

```
gs://bucket/
  tactical-results/{analysisId}.json    # Full tactical analysis
  faiss/index.faiss                     # FAISS index file (binary)
  faiss/metadata.json                   # Parallel metadata for index entries
  models/gnn.pt                         # Trained GNN weights
  models/cvae.pt                        # Trained CVAE weights
  training-labels/{analysisId}.json     # User-provided outcome labels
```

---

## 14. Performance Strategy

### GPU-Accelerated Pipeline

With GPU available, the bottleneck shifts from compute to I/O:

| Component | Time (GPU) | Time (CPU) | Notes |
|---|---|---|---|
| YOLOv8 detection (600 frames) | ~3s | ~30s | Already GPU-optimized |
| SigLIP embeddings (50 crops) | ~1s | ~8s | Batch CUDA inference |
| GATv2 GNN (600 frames, 23 nodes) | ~1s | ~15s | PyG CUDA |
| CVAE generation (10 samples) | <0.1s | ~1s | Small model |
| FAISS-GPU retrieval | <0.01s | ~0.1s | Index search |
| Gemini API call | ~3-5s | ~3-5s | Network-bound |
| **Total tactical pipeline** | **~8-10s** | **~55s** | |

### Strategy

1. **GPU for all ML**: YOLOv8, SigLIP, GNN, and CVAE all run on CUDA. The GNN processes all 600 frames in a single batched forward pass.

2. **Gemini for intelligence**: After GNN produces numbers, a single Gemini call generates coaching narration (~3-5s). This runs in parallel with fingerprint storage.

3. **FAISS-GPU for retrieval**: Sub-millisecond similarity search even with 100K+ stored fingerprints. The FAISS index is loaded once at server startup.

4. **Client-side symmetry**: D2 transformations are pure coordinate flips, done in browser JavaScript. No server round-trip needed.

5. **Client-side drag preview**: After drag-to-reposition, only the "optimize defense" action needs a server call. Visual preview during drag uses cached data with modified positions applied client-side.

6. **Model caching**: GNN and CVAE models loaded once at server startup (~200MB VRAM), kept in memory for instant inference on subsequent requests.

### Training Pipeline

With GPU, we can continuously improve the models:

```
1. User analyzes video -> GNN produces predictions
2. User marks outcome (goal / save / clearance / no shot)
3. Label stored in Firestore alongside tactical data
4. Nightly training job:
   - Load all labeled data
   - Fine-tune GATv2 on receiver + shot prediction
   - Train CVAE on successful defensive formations
   - Update FAISS index with new embeddings
5. Deploy updated weights (hot-reload, no restart)
```

---

## 15. Deployment Changes

### Dockerfile Additions

```dockerfile
# GPU base image (CUDA 12.x + Python 3.11)
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Install Node.js 18 + Nginx
RUN apt-get update && apt-get install -y nodejs npm nginx

# Python ML dependencies (GPU-enabled)
COPY requirements.txt ./
RUN pip3 install -r requirements.txt

# Pre-download models into Docker layer (cached)
RUN python3 -c "
from ultralytics import YOLO
YOLO('yolov8n.pt')  # YOLOv8 nano
from transformers import AutoModel
AutoModel.from_pretrained('google/siglip-base-patch16-224')  # SigLIP
"

# Copy tactical AI pipeline
COPY tactical_ai.py ./

# Copy GNN/CVAE model weights (if trained)
COPY models/ ./models/ 2>/dev/null || true
```

### Updated requirements.txt

```
# Existing
ultralytics>=8.0.0
transformers>=4.30.0
torch>=2.0.0
umap-learn>=0.5.0
scikit-learn>=1.3.0
opencv-python-headless>=4.8.0
numpy>=1.24.0
Pillow>=10.0.0

# New for TacticAI
torch-geometric>=2.4.0
torch-scatter>=2.1.0
torch-sparse>=0.6.0
faiss-gpu>=1.7.0
scipy>=1.11.0
```

### Environment Variables

```
TACTICAL_AI_ENABLED=true       # Feature flag
GNN_MODEL_PATH=models/gnn.pt   # Trained GNN weights (optional, uses heuristic if missing)
CVAE_MODEL_PATH=models/cvae.pt # Trained CVAE weights (optional, uses scipy fallback)
FAISS_INDEX_PATH=faiss/         # GCS path for FAISS index
```

### Cloud Run with GPU

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

Alternatively, for heavier workloads, deploy the tactical AI pipeline as a separate Cloud Run service with GPU, and have the main service call it via internal HTTP.

---

## 16. Implementation Sequencing

### Dependency Graph

```
Phase 1: BEV + Graph Construction
  |
  +--> Phase 2: GNN Message Passing + Shot Probability
  |       |
  |       +--> Phase 3: D2 Symmetry (depends on BEV coords)
  |       |
  |       +--> Phase 5: Retrieval System (depends on fingerprints)
  |
  +--> Phase 4: CVAE/Optimizer (depends on GNN + shot prob)
  |
  +--> Phase 6: Brazilian Localization (can start in parallel)
  |
  +--> Phase 7: Interactive UI (depends on Phase 2 + Phase 4)
```

### Week-by-Week Plan

**Week 1 -- Foundation (Phase 1)**
- Create `tactical_ai.py` with `estimate_homography()`, `transform_to_bev()`, `build_player_graph()`
- Add `/api/tactical/analyze` endpoint to `server.js`
- Verify with existing ML pipeline output
- Deliverable: BEV coordinates appearing in API response

**Week 2 -- Core Analysis (Phase 2)**
- Add `message_passing()`, `compute_shot_probability()`, `compute_tactical_fingerprint()` to `tactical_ai.py`
- Add `tactical-gnn` overlay mode to `video-overlay.js`
- Add TacticAI tab to `video-analysis/index.html`
- Wire shot probability display in `video-analysis/script.js`
- Deliverable: Shot probability overlays working on video playback

**Week 2-3 -- Symmetry (Phase 3)**
- Add `apply_d2_symmetry()` to `tactical_ai.py`
- Create `shared/tactical-ui.js` with symmetry toggle
- Add symmetry button group to HTML
- Deliverable: Four symmetry modes toggling in the UI

**Week 3 -- Defense Optimization (Phase 4)**
- Add `optimize_defense()` to `tactical_ai.py`
- Add `/api/tactical/optimize` endpoint to `server.js`
- Add ghost player rendering to `video-overlay.js`
- Add "Otimizar Defesa" button and results display
- Deliverable: Green ghost players showing suggested positions

**Week 3-4 -- Retrieval (Phase 5)**
- Add `store_fingerprint()`, `retrieve_similar()` to `tactical_ai.py`
- Add `/api/tactical/retrieve` endpoint to `server.js`
- Add "Busca Tatica" results panel to HTML
- Deliverable: Similarity search returning results from saved analyses

**Week 2-4 (parallel) -- Brazilian Localization (Phase 6)**
- Create `shared/brazilian-tactics.js`
- Add `_drawTriangulacao()`, `_drawCompactnessHeatmap()` to overlay
- Add locale toggle (PT/EN) to UI
- Deliverable: Portuguese labels and Brazilian tactical concepts visible

**Week 4 -- Interactive UI (Phase 7)**
- Add drag-to-reposition to `shared/tactical-ui.js`
- Wire drag completion to server optimization call
- Add position reset button
- Deliverable: Full interactive drag-optimize-view cycle

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Homography estimation fails on non-broadcast footage | BEV coordinates are wrong | Fallback to affine transform using player convex hull; label as "approximate" |
| Not enough labeled data to train GNN/CVAE | Models underperform | Start with heuristic weights (geometric features); GNN still gives structure. Collect labels via UI outcome marking. Quality improves over time |
| Gemini API latency adds delay | User waits for narration | Run Gemini calls async; show GNN numbers immediately, narration appears when ready |
| FAISS-GPU memory for large index | GPU memory pressure | FAISS index is small (~10MB for 100K embeddings). Use `index_cpu_to_gpu` only at search time |
| GPU not available in all deployment targets | Pipeline fails | Feature flag `TACTICAL_AI_ENABLED`; graceful fallback to CPU heuristic mode |
| Canvas rendering performance with many overlays | Dropped frames during playback | Use `requestAnimationFrame` throttling; skip complex overlays when FPS < 15 |
| CVAE generates unrealistic positions | Coach gets bad advice | Constrain decoder output to pitch bounds + max displacement from original; GNN validates each candidate before presenting |

---

## Critical Files Reference

| File | Role in TacticAI Integration |
|---|---|
| `shared/video-overlay.js` | Core rendering engine -- extend with tactical-gnn mode, ghost players, triangulation, heatmap, GNN edges |
| `server.js` | Add 3 new tactical endpoints following existing `execFile` subprocess pattern |
| `ml_pipeline.py` | Output consumed by `tactical_ai.py`; provides pattern for stderr progress reporting |
| `video-analysis/script.js` | Main orchestrator -- wire TacticAI tab, symmetry, optimize, retrieval |
| `video-analysis/index.html` | Add TacticAI tab panel following existing tab structure |
