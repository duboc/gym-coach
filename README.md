# AI Coach Platform (Football Video Analysis)

A web-based AI coaching platform focused on analyzing football (soccer) techniques. It uses MediaPipe's Holistic model to extract pose data from videos and Google's Gemini API to provide intelligent, personalized coaching feedback.

## What It Is

This application allows athletes and coaches to:
1. Upload local videos (`.mp4`) of football techniques (e.g., kicking, dribbling).
2. Search and import professional technique videos directly from YouTube.
3. Extract frame-by-frame biomechanical data (joint angles, posture, plant foot placement).
4. Receive AI-generated coaching summaries outlining strengths and areas for improvement.

## Why It Exists

To provide accessible, high-quality technique analysis without expensive sports science hardware. By combining computer vision (MediaPipe) for pose detection and LLMs (Google Gemini) for reasoning, the platform delivers intelligent, contextual, and actionable guidance specifically tuned for football biomechanics.

## Features

- **Video Processing Pipeline**: Analyzes pre-recorded video files and aggregates data into an interactive timeline, allowing you to scrub through specific phases (Approach, Plant, Contact).
- **YouTube Integration**: Includes a Node.js backend proxy to search and securely import YouTube videos for analysis, bypassing browser CORS restrictions.
- **AI-Powered Insights**: Sends aggregated pose data and phase metrics to the Google Gemini API for personalized coaching cues.
- **Visual Overlays**: Renders color-coded form indicators directly onto the video canvas.
- **Client-Side Heavy**: The core pose detection runs entirely in the browser using vanilla JavaScript, keeping infrastructure costs low and user data private.

## Quick Start (Under 5 Minutes)

### Prerequisites

- Modern web browser (Chrome, Firefox, Edge, etc.)
- Internet connection (for MediaPipe models, YouTube, and Gemini API)
- Node.js installed locally
- A free Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### Setup & Run

1. **Clone this repository:**
   ```bash
   git clone https://github.com/your-username/gym-coach.git
   cd gym-coach
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure your API Key:**
   Create a `.env` file in the root directory:
   ```env
   gemini-apikey=YOUR_API_KEY_HERE
   ```
   *(Note: If you skip this step, the app will prompt you to enter your key in the browser and store it securely in `localStorage`.)*

4. **Start the local server:**
   Use the provided bash script to run the Node.js backend:
   ```bash
   chmod +x run.sh
   ./run.sh
   ```
   *(Alternatively, use `npm start` or `node server.js`)*

5. **Access the platform:**
   Open [http://localhost:8000/](http://localhost:8000/) (This will automatically redirect you to the `/video-analysis/` dashboard).

## Application Structure

- `/video-analysis/` & `/football/`: The core UI and domain logic for the Football video analysis tool, including specific technique definitions and metrics.
- `/shared/`: Core logic for computer vision and AI, including MediaPipe integration (`pose-utils.js`), AI feedback loops (`gemini-api.js`), and visualization.
- `server.js`: The Node.js Express backend that handles YouTube API searching and video proxying.
- `/docs/` & `/memory-bank/`: Detailed architectural documentation and project context.

*(Note: The `/gym/` directory contains legacy code from an earlier webcam-based iteration of this project.)*

## Deployment

The application can be deployed to Google Cloud Run. We provide a deployment script that handles API enablement and building:

```bash
chmod +x deploy-to-cloud-run.sh
./deploy-to-cloud-run.sh
```

See [DEPLOY.md](DEPLOY.md) for detailed deployment instructions, manual options, and environment variable configuration.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

- [MediaPipe](https://mediapipe.dev/) team for their computer vision toolset.
- [Google AI](https://ai.google.dev/) for the Gemini API.
- Sports science experts for form guidance and biomechanical heuristics.
