# YouTube API Integration

## Overview

The YouTube integration allows users to search for videos, paste a direct URL/ID, preview results, and import videos into the analysis pipeline. Imported videos are downloaded via `yt-dlp`, uploaded to Google Cloud Storage (GCS), and then processed through the same analysis pipeline as file uploads.

## Architecture

```
User Input (search query or URL/ID)
        |
        v
Client (video-analysis/script.js)
        |
        v
Server (server.js) --- googleapis (YouTube Data API v3)
        |
        v
yt-dlp download --> GCS upload --> Analysis pipeline
```

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `YOUTUBE_API_KEY` | YouTube Data API v3 key | Yes (for YouTube features) |
| `MAX_VIDEO_SIZE_MB` | Max download size for yt-dlp (default: `100`) | No |
| `MAX_VIDEO_DURATION_SECONDS` | Max allowed duration (default: `7200`) | No |

When `YOUTUBE_API_KEY` is not set, the server reports `hasYouTube: false` via `/api/config` and all YouTube endpoints return a 400 error.

## Server Endpoints

All YouTube endpoints are in `server.js`.

### `POST /api/youtube/search`

Search YouTube for videos.

**Location:** `server.js:550`

**Request:**
```json
{
  "query": "Flamengo vs Palmeiras",
  "maxResults": 8
}
```

**Behavior:**
1. Calls `youtube.search.list()` with `type: 'video'`, `videoDuration: 'short'` (< 4 min), `videoEmbeddable: true`
2. Fetches video details (`contentDetails`, `statistics`) in a second call to `youtube.videos.list()` for duration and view count
3. Merges results

**Response:**
```json
{
  "results": [
    {
      "videoId": "CGFgHjeEkbY",
      "title": "Video Title",
      "channelTitle": "Channel Name",
      "thumbnail": "https://i.ytimg.com/vi/.../mqdefault.jpg",
      "publishedAt": "2025-01-15T10:00:00Z",
      "duration": "3:42",
      "durationSeconds": 222,
      "viewCount": "150000"
    }
  ]
}
```

### `GET /api/youtube/info/:videoId`

Get details for a single video by ID.

**Location:** `server.js:610`

**Response:** Same shape as a single item from the search results.

### `POST /api/youtube/import`

Download a YouTube video and upload it to GCS.

**Location:** `server.js:646`

**Request:**
```json
{
  "videoId": "CGFgHjeEkbY",
  "title": "Optional title for filename"
}
```

**Behavior:**
1. Downloads via `yt-dlp` with format `best[height<=720][ext=mp4]`, max file size enforced, 10-minute timeout
2. Uploads the file to GCS under `videos/yt-{safe-title}-{uuid}.mp4`
3. Deletes the temp file

**Response:**
```json
{
  "fileName": "videos/yt-Video_Title-a1b2c3d4.mp4",
  "gcsUri": "gs://bucket-name/videos/yt-Video_Title-a1b2c3d4.mp4",
  "size": 52428800,
  "videoId": "CGFgHjeEkbY"
}
```

## Server Helpers

**Location:** `server.js:835-851`

| Function | Purpose |
|----------|---------|
| `getYouTube()` | Lazy-initializes the `googleapis` YouTube v3 client with `YOUTUBE_API_KEY` |
| `formatYouTubeDuration(iso)` | Converts ISO 8601 duration (`PT1H2M3S`) to human-readable (`1:02:03`) |
| `parseYouTubeDuration(iso)` | Converts ISO 8601 duration to total seconds |

## Client-Side Code

All client code is in `video-analysis/script.js`. The UI is defined in `video-analysis/index.html:46-78`.

### UI Flow

1. User clicks the "Buscar no YouTube" tab
2. Two input modes:
   - **Direct URL/ID** — paste a YouTube URL or 11-char video ID, click load button
   - **Search** — type a query, see a grid of result cards
3. User selects a video from results (or loads by URL)
4. Selected video preview appears with "Import & Analyze" and "Clear" buttons
5. On import: download -> upload to GCS -> run analysis -> show overlay playback

### Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `parseYouTubeVideoId(input)` | `script.js:256` | Extracts video ID from various URL formats or raw ID |
| `loadYouTubeByUrl(input)` | `script.js:278` | Fetches video info by ID and selects it |
| `searchYouTube(query)` | `script.js:305` | Calls `/api/youtube/search` and renders results |
| `renderYouTubeResults(results)` | `script.js:330` | Builds the result card grid |
| `selectYouTubeVideo(video)` | `script.js:367` | Shows the selected video preview |
| `clearYouTubeSelection()` | `script.js:378` | Resets selection |
| `importYouTubeVideo()` | `script.js:383` | Full import + analysis pipeline |

### URL Parsing

`parseYouTubeVideoId()` supports these formats:
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://www.youtube.com/v/VIDEO_ID`
- Raw 11-character video ID

## Dependencies

- **Server:** `googleapis` (npm), `yt-dlp` (CLI, must be installed on the system/container)
- **Client:** No external dependencies beyond the app's existing setup

## Error Handling

- Missing API key: 400 with descriptive message
- Download failure: 500, temp file cleaned up
- Search failure: 500, error displayed in UI with icon
- No results: empty state message in UI
