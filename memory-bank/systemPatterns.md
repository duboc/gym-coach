# System Patterns: Football Video Analysis

## Architecture Overview

The Football Video Analysis application follows a component-based architecture designed for client-side processing of video files with an optional lightweight backend (Node.js/Express) for YouTube integration.

The architecture is divided into a shared core layer for computer vision and AI, and the football domain module:

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Application                       │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Shared Core Layer                  │  │
│  │                                                       │  │
│  │ ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │  │
│  │ │ MediaPipe    │ │ Gemini API   │ │ Audio Feedback  │ │  │
│  │ │ Integration  │ │ Integration  │ │ System          │ │  │
│  │ └──────────────┘ └──────────────┘ └─────────────────┘ │  │
│  │ ┌──────────────┐ ┌──────────────┐ ┌─────────────────┐ │  │
│  │ │ Pose Utils & │ │ Visualization│ │ Advanced        │ │  │
│  │ │ Math         │ │ Engine       │ │ Analytics       │ │  │
│  │ └──────────────┘ └──────────────┘ └─────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Football Domain Module                │  │
│  │                                                       │  │
│  │ - Video File Upload & Processing                      │  │
│  │ - YouTube Search & Import                             │  │
│  │ - Technique Analysis (e.g., Instep Kick)              │  │
│  │ - Form Review, Metrics & Phase Detection              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Core Design Patterns

### 1. Modular Separation of Concerns

The application is organized into distinct directories:

- **/shared/**: Contains logic used by the core computer vision and AI engine (`pose-utils.js`, `gemini-api.js`, `audio-coach.js`, `visualization.js`).
- **/football/** & **/video-analysis/**: Contains the video-based analysis UI, YouTube integration, and football-specific technique definitions (`script.js`, `techniques.js`, `technique-metrics.js`).

### 2. Observer & Processing Pipeline

The application processes videos using a frame-by-frame extraction pipeline:

- A hidden `<video>` element plays the source file (upload or YouTube).
- Canvas extracts frames and feeds them to the MediaPipe Holistic model.
- The main domain script (`video-analysis/script.js`) observes MediaPipe's output, applies mathematical transformations (via `pose-utils.js`), and stores the frame data.

### 3. Factory/Configuration Pattern

Technique objects are created using a standardized configuration pattern in `football/techniques.js`. An action like a "Football Instep Kick" is defined with properties like:
- Target metrics (e.g., knee angle, hip alignment, torso lean).
- Camera view requirements (Side vs. Front).
- Phase detection strategies (Approach, Plant, Contact, Follow-through).

### 4. Strategy Pattern (Phase Detection)

Different strategies are employed for analyzing different athletic movements:
- The system must identify distinct phases of a movement (e.g., finding the exact frame of ball contact).
- State machines evaluate velocity, joint angles, and foot position relative to the ground to determine current phase.

## Data Flow

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│ Input Source │───▶│ MediaPipe     │───▶│ Pose Detection │
│ (Video/YT)   │    │ Holistic Model│    │ Results        │
└──────────────┘    └───────────────┘    └────────┬───────┘
                                                  │
                                                  ▼
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│ Form         │◀───│ Football      │◀───│ Pose Analysis  │
│ Feedback     │    │ Techniques    │    │ & Processing   │
└──────────────┘    └───────────────┘    └────────────────┘
       │                    │                     │
       ▼                    ▼                     ▼
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│ Visual       │    │ Audio         │    │ Analytics      │
│ Overlays     │    │ Synthesis     │    │ Dashboard      │
└──────────────┘    └───────────────┘    └────────────────┘
                                                  │
                                                  ▼
                                         ┌────────────────┐
                                         │ Gemini API     │
                                         │ Integration    │
                                         └────────────────┘
```

## Key Implementation Patterns

### 1. Dual Pipeline Processing & Triage

- The system runs two analysis pipelines in parallel for every video: 
  1. A backend ML pipeline (YOLOv8 + SigLIP + tracking) for match-level tactical analysis and player tracking.
  2. A client-side MediaPipe pipeline for detailed player pose and technique extraction.
- A **Triage** step happens immediately after upload (sampling a few frames with YOLOv8) to auto-detect if the video is primarily a "match" or a "technique" clip. This determines which analysis tab is presented by default.
- Results from both pipelines are stored and toggleable via UI tabs.

### 2. Autonomous Analysis & On-Demand Deep Dives

- Users no longer manually select the technique being analyzed; the AI auto-detects the action using the Gemini API based on pose data.
- **On-Demand Player Analysis**: By clicking on a specific player tracked in the overlay, users can trigger a deep, player-specific technique analysis via a dedicated `/api/video/analyze-player` endpoint. Results are cached client-side.

### 3. Multi-Modal Feedback System

The application uses multiple channels to provide feedback:
- **Visual**: Canvas overlays highlighting joint angles or bounding boxes, with special styling (dimmed/dashed) to filter out non-players (referees, coaches).
- **AI (Gemini)**: Processes aggregated pose data or tactical tracks to generate comprehensive coaching summaries.

### 4. Local Storage for Persistence

- Video analysis logs, metric data, and AI summaries (including dual pipeline results) are stored in `localStorage`.
- API keys (if not provided via env variables) are securely saved for future sessions.
