# Football Video Analysis

A web-based AI coaching platform for analyzing football (soccer) techniques and match footage. Uses MediaPipe for real-time pose detection, YOLOv8 for player/ball tracking, and Vertex AI (Gemini) for intelligent coaching feedback.

## What It Does

- **Upload or import videos** — local `.mp4` files or YouTube search & import
- **ML pipeline** — YOLOv8 player detection, SigLIP embeddings for re-identification, team clustering, ball tracking
- **AI analysis** — Gemini biomechanics evaluation with per-technique guides, match tactical analysis, per-player assessments
- **Real-time coaching** — Camera-based technique analysis with live pose feedback
- **Visual overlays** — Skeleton, angles, movement paths, tactical minimap, detection boxes

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+ (for ML pipeline)
- Google Cloud project with Vertex AI enabled
- Application Default Credentials configured (`gcloud auth application-default login`)

### Setup & Run

```bash
# Clone and install
git clone https://github.com/duboc/gym-coach.git
cd gym-coach
git checkout football-only
npm install
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your GCP project, GCS bucket, etc.

# Start development server
./run.sh
```

Open [http://localhost:8080/](http://localhost:8080/) — redirects to the video analysis dashboard.

## Application Structure

- `video-analysis/` — Video upload/import UI, match analysis dashboard, overlay playback
- `football/` — Real-time camera technique analysis (8 football techniques)
- `shared/` — Shared modules: pose utilities, audio coach, visualization, video overlay, Gemini API client
- `server.js` — Express backend (16 API endpoints: Vertex AI, GCS, Firestore, YouTube)
- `ml_pipeline.py` — Python ML pipeline (YOLOv8 + SigLIP + UMAP/KMeans)
- `docs/` — Changelogs and design documentation

## Deployment

Deploy to Google Cloud Run:

```bash
./deploy-to-cloud-run.sh
```

Docker image includes Node.js + Nginx + Python 3 + yt-dlp with pre-downloaded ML models.

## License

Apache 2.0 — see [LICENSE](LICENSE).
