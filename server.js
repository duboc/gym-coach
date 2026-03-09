const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Load environment variables from .env file if present
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Config
const MAX_VIDEO_SIZE_MB = parseInt(process.env.MAX_VIDEO_SIZE_MB || '100');
const MAX_VIDEO_DURATION = parseInt(process.env.MAX_VIDEO_DURATION_SECONDS || '7200');
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GEMINI_TEMPERATURE = parseFloat(process.env.GEMINI_TEMPERATURE || '0.15');
const ML_ANALYSIS_FPS = parseFloat(process.env.ML_ANALYSIS_FPS || '2');
const ML_ENABLED = process.env.ML_ENABLED !== 'false';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || '';
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || '';

// Enable CORS
app.use(cors());

// Parse JSON bodies (50MB limit for landmarks data)
app.use(express.json({ limit: '50mb' }));

// Serve static files (public/ in Docker, project root for local dev)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// ========================================
// LAZY-LOADED SERVICES
// ========================================

let _gcs = null;
let _bucket = null;
let _genai = null;
let _firestore = null;
let _youtube = null;

function getGCS() {
  if (!_gcs) {
    const { Storage } = require('@google-cloud/storage');
    _gcs = new Storage();
    _bucket = _gcs.bucket(GCS_BUCKET_NAME);
  }
  return { storage: _gcs, bucket: _bucket };
}

function getGenAI() {
  if (!_genai) {
    const { GoogleGenAI } = require('@google/genai');
    _genai = new GoogleGenAI({
      vertexai: true,
      project: GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
  }
  return _genai;
}

function getFirestore() {
  if (!_firestore) {
    const { Firestore } = require('@google-cloud/firestore');
    _firestore = new Firestore({ projectId: GOOGLE_CLOUD_PROJECT });
  }
  return _firestore;
}

function getYouTube() {
  if (!_youtube) {
    const { google } = require('googleapis');
    _youtube = google.youtube({
      version: 'v3',
      auth: YOUTUBE_API_KEY,
    });
  }
  return _youtube;
}

// ========================================
// API ENDPOINTS
// ========================================

// --- Config ---
app.get('/api/config', (req, res) => {
  res.json({
    hasVertexAI: !!GOOGLE_CLOUD_PROJECT,
    hasYouTube: !!YOUTUBE_API_KEY,
    hasGCS: !!GCS_BUCKET_NAME,
    hasML: ML_ENABLED,
    maxVideoSizeMB: MAX_VIDEO_SIZE_MB,
    maxDurationSeconds: MAX_VIDEO_DURATION,
    geminiModel: GEMINI_MODEL,
  });
});

// --- Video Upload ---
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE_MB * 1024 * 1024 },
});

app.post('/api/video/upload', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const { bucket } = getGCS();
    const fileName = `videos/${uuidv4()}-${req.file.originalname}`;
    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      contentType: req.file.mimetype,
      resumable: false,
    });

    const gcsUri = `gs://${GCS_BUCKET_NAME}/${fileName}`;
    res.json({ fileName, gcsUri, size: req.file.size });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed', details: error.message });
  }
});

// --- Video Stream (proxy from GCS with range support) ---
app.get('/api/video/stream/*', async (req, res) => {
  try {
    const fileName = req.params[0];
    const { bucket } = getGCS();
    const file = bucket.file(fileName);

    const [metadata] = await file.getMetadata();
    const fileSize = parseInt(metadata.size);
    const contentType = metadata.contentType || 'video/mp4';

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
      });

      file.createReadStream({ start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
      });
      file.createReadStream().pipe(res);
    }
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Stream failed', details: error.message });
  }
});

// --- Video List ---
app.get('/api/video/list', async (req, res) => {
  try {
    const { bucket } = getGCS();
    const [files] = await bucket.getFiles({ prefix: 'videos/' });
    const videos = files.map((f) => ({
      name: f.name,
      size: f.metadata.size,
      created: f.metadata.timeCreated,
    }));
    res.json({ videos });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: 'List failed', details: error.message });
  }
});

// --- Video Triage (quick YOLOv8 player count) ---
app.post('/api/video/triage', async (req, res) => {
  try {
    const { fileName } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName required' });

    const { bucket } = getGCS();
    const file = bucket.file(fileName);

    // Download to temp file for Python processing
    const os = require('os');
    const fs = require('fs');
    const tmpPath = path.join(os.tmpdir(), `triage-${uuidv4()}.mp4`);
    await file.download({ destination: tmpPath });

    const { execSync } = require('child_process');
    const result = execSync(
      `python3 ml_pipeline.py "${tmpPath}" --triage`,
      { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    // Clean up
    fs.unlinkSync(tmpPath);

    const triage = JSON.parse(result);
    res.json({ triage });
  } catch (error) {
    console.error('Triage error:', error);
    res.status(500).json({ error: 'Triage failed', details: error.message });
  }
});

// --- Video Analysis (Gemini technique analysis) ---
app.post('/api/video/analyze', async (req, res) => {
  try {
    const { gcsUri, landmarks, exerciseType, metadata } = req.body;
    if (!gcsUri) return res.status(400).json({ error: 'gcsUri required' });

    const prompt = createVideoAnalysisPrompt(exerciseType, landmarks, metadata);
    const genai = getGenAI();

    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: gcsUri, mimeType: 'video/mp4' } },
            { text: prompt },
          ],
        },
      ],
      config: { temperature: GEMINI_TEMPERATURE },
    });

    const text = response.text || '';
    const sections = parseAnalysisSections(text);

    res.json({
      success: true,
      rawText: text,
      analysis: { sections },
    });
  } catch (error) {
    console.error('Video analysis error:', error);
    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

// --- Match Analysis (multi-prompt Gemini analysis) ---
app.post('/api/video/match-analyze', async (req, res) => {
  try {
    const { gcsUri, mlResults, metadata } = req.body;
    if (!gcsUri || !mlResults) {
      return res.status(400).json({ error: 'gcsUri and mlResults required' });
    }

    const genai = getGenAI();
    const geminiCall = async (prompt) => {
      const response = await genai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri: gcsUri, mimeType: 'video/mp4' } },
              { text: prompt },
            ],
          },
        ],
        config: { temperature: GEMINI_TEMPERATURE },
      });
      return response.text || '';
    };

    // Build per-player stats and paths
    const playerStats = mlResults.playerStats || {};
    const playerPaths = mlResults.playerPaths || {};

    // Run analyses in parallel
    const tacticalPromise = geminiCall(createMatchTacticalPrompt(mlResults, metadata))
      .then((text) => ({ tactical: { sections: parseAnalysisSections(text) } }))
      .catch(() => ({ tactical: { sections: {} } }));

    const playerPromises = Object.keys(playerStats).slice(0, 6).map((tid) =>
      geminiCall(
        createPlayerAnalysisPrompt(tid, playerStats[tid], playerPaths[tid], metadata)
      ).then((text) => ({ [tid]: parseAnalysisSections(text) }))
       .catch(() => ({ [tid]: {} }))
    );

    // Key frames for event detection
    const keyFrames = mlResults.keyFrames || [];
    const eventsPromise = keyFrames.length > 0
      ? geminiCall(createEventDetectionPrompt(keyFrames, metadata))
          .then((text) => {
            const sections = parseAnalysisSections(text);
            const timeline = parseEventsTimeline(sections.EVENTS_TIMELINE || '');
            return { events: { sections, timeline } };
          })
          .catch(() => ({ events: { sections: {} } }))
      : Promise.resolve({ events: { sections: {} } });

    // Possession analysis
    const possessionTimeline = mlResults.possessionTimeline || [];
    const ballTrajectory = mlResults.ballTrajectory || [];
    // Compute possession percentages from ML timeline
    const possessionSummary = (() => {
      if (!possessionTimeline.length) return null;
      let t0 = 0, t1 = 0;
      for (const pt of possessionTimeline) {
        if (pt.teamId === 0) t0++;
        else if (pt.teamId === 1) t1++;
      }
      const total = t0 + t1 || 1;
      return { team0Pct: Math.round((t0 / total) * 100), team1Pct: Math.round((t1 / total) * 100) };
    })();

    const possessionPromise = possessionTimeline.length > 0
      ? geminiCall(createPossessionPrompt(possessionTimeline, ballTrajectory, metadata))
          .then((text) => ({ possession: { sections: parseAnalysisSections(text), summary: possessionSummary } }))
          .catch(() => ({ possession: { sections: {}, summary: possessionSummary } }))
      : Promise.resolve({ possession: { sections: {} } });

    const results = await Promise.all([
      tacticalPromise,
      ...playerPromises,
      eventsPromise,
      possessionPromise,
    ]);

    const matchAnalysis = {
      tactical: {},
      players: {},
      events: {},
      possession: {},
    };

    for (const r of results) {
      if (r.tactical) matchAnalysis.tactical = r.tactical;
      else if (r.events) matchAnalysis.events = r.events;
      else if (r.possession) matchAnalysis.possession = r.possession;
      else {
        // Player result — wrap sections with teamId for client
        const tid = Object.keys(r)[0];
        const tidStats = playerStats[tid] || {};
        matchAnalysis.players[tid] = {
          teamId: tidStats.teamId ?? -1,
          sections: r[tid],
        };
      }
    }

    res.json({ success: true, matchAnalysis });
  } catch (error) {
    console.error('Match analysis error:', error);
    res.status(500).json({ error: 'Match analysis failed', details: error.message });
  }
});

// --- ML Analysis (Python pipeline) ---
app.post('/api/video/ml-analyze', async (req, res) => {
  try {
    const { fileName } = req.body;
    if (!fileName) return res.status(400).json({ error: 'fileName required' });
    if (!ML_ENABLED) return res.status(400).json({ error: 'ML analysis is disabled' });

    const { bucket } = getGCS();
    const file = bucket.file(fileName);

    const os = require('os');
    const fs = require('fs');
    const tmpPath = path.join(os.tmpdir(), `ml-${uuidv4()}.mp4`);
    await file.download({ destination: tmpPath });

    console.log('Running ML pipeline on', fileName);
    const { execSync } = require('child_process');
    const result = execSync(
      `python3 ml_pipeline.py "${tmpPath}" --fps ${ML_ANALYSIS_FPS} --max-crops 150`,
      { timeout: 1800000, maxBuffer: 50 * 1024 * 1024 }
    ).toString();

    fs.unlinkSync(tmpPath);

    const mlResults = JSON.parse(result);
    res.json({ success: true, mlResults });
  } catch (error) {
    console.error('ML analysis error:', error);
    res.status(500).json({ error: 'ML analysis failed', details: error.message });
  }
});

// --- Player Technique Analysis (on-demand) ---
app.post('/api/video/analyze-player', async (req, res) => {
  try {
    const { gcsUri, trackId, teamId, keypoints, stats, playerPath } = req.body;
    if (!gcsUri) return res.status(400).json({ error: 'gcsUri required' });

    console.log('Player technique analysis request:', { gcsUri, trackId, teamId, keypointFrames: keypoints?.length });

    const prompt = createPlayerTechniquePrompt(trackId, teamId, keypoints, stats, playerPath);
    const genai = getGenAI();

    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: gcsUri, mimeType: 'video/mp4' } },
            { text: prompt },
          ],
        },
      ],
      config: { temperature: GEMINI_TEMPERATURE },
    });

    const text = response.text || '';
    const sections = parseAnalysisSections(text);

    res.json({ success: true, analysis: { sections, rawText: text } });
  } catch (error) {
    console.error('Player technique analysis error:', error);
    res.status(500).json({ error: 'Player technique analysis failed', details: error.message });
  }
});

// --- Focus Mode (SSE streaming player analysis) ---
app.post('/api/video/focus-stream', async (req, res) => {
  try {
    const { gcsUri, trackId, teamId, timeWindow, keypoints, windowStats, previousInsights } = req.body;
    if (!gcsUri) return res.status(400).json({ error: 'gcsUri required' });

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const prompt = createFocusWindowPrompt(trackId, teamId, timeWindow, keypoints, windowStats, previousInsights);
    const genai = getGenAI();

    const response = await genai.models.generateContentStream({
      model: GEMINI_MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: gcsUri, mimeType: 'video/mp4' } },
            { text: prompt },
          ],
        },
      ],
      config: { temperature: GEMINI_TEMPERATURE },
    });

    for await (const chunk of response) {
      const text = chunk.text || '';
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Focus stream error:', error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// --- Real-time Feedback ---
app.post('/api/realtime/feedback', async (req, res) => {
  try {
    const { exerciseData, exerciseContext, frameSnapshot, exerciseType } = req.body;

    const prompt = createRealtimeFeedbackPrompt(exerciseType, exerciseData, exerciseContext);
    const genai = getGenAI();

    const parts = [{ text: prompt }];

    // Add frame snapshot if available
    if (frameSnapshot) {
      const base64Data = frameSnapshot.replace(/^data:image\/\w+;base64,/, '');
      parts.push({
        inlineData: { mimeType: 'image/jpeg', data: base64Data },
      });
    }

    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: 'user', parts }],
      config: { temperature: GEMINI_TEMPERATURE },
    });

    const text = response.text || '';
    const sections = parseAnalysisSections(text);

    res.json({ success: true, feedback: text, sections });
  } catch (error) {
    console.error('Realtime feedback error:', error);
    res.status(500).json({ error: 'Feedback failed', details: error.message });
  }
});

// --- YouTube Search ---
app.post('/api/youtube/search', async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.status(400).json({ error: 'YouTube API key not configured. Set YOUTUBE_API_KEY in .env' });
    }

    const { query, maxResults = 8 } = req.body;
    if (!query) return res.status(400).json({ error: 'query required' });

    const youtube = getYouTube();

    // Search for videos
    const searchResponse = await youtube.search.list({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: Math.min(maxResults, 20),
      videoDuration: 'short', // < 4 min
      videoEmbeddable: true,
    });

    const videoIds = searchResponse.data.items.map((item) => item.id.videoId);

    // Get video details (duration, view count)
    const detailsResponse = await youtube.videos.list({
      part: 'contentDetails,statistics',
      id: videoIds.join(','),
    });

    const detailsMap = {};
    for (const item of detailsResponse.data.items) {
      detailsMap[item.id] = {
        duration: formatYouTubeDuration(item.contentDetails.duration),
        durationSeconds: parseYouTubeDuration(item.contentDetails.duration),
        viewCount: item.statistics.viewCount || '0',
      };
    }

    const results = searchResponse.data.items.map((item) => {
      const details = detailsMap[item.id.videoId] || {};
      return {
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url,
        publishedAt: item.snippet.publishedAt,
        duration: details.duration || '?:??',
        durationSeconds: details.durationSeconds || 0,
        viewCount: details.viewCount || '0',
      };
    });

    res.json({ results });
  } catch (error) {
    console.error('YouTube search error:', error);
    res.status(500).json({ error: 'YouTube search failed', details: error.message });
  }
});

// --- YouTube Import (download + upload to GCS) ---
app.post('/api/youtube/import', async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      return res.status(400).json({ error: 'YouTube API key not configured' });
    }

    const { videoId, title } = req.body;
    if (!videoId) return res.status(400).json({ error: 'videoId required' });

    const os = require('os');
    const fs = require('fs');
    const { execSync } = require('child_process');

    const tmpPath = path.join(os.tmpdir(), `yt-${videoId}-${uuidv4()}.mp4`);

    console.log(`Downloading YouTube video ${videoId}...`);
    execSync(
      `yt-dlp -f "best[height<=720][ext=mp4]/best[ext=mp4]/best" ` +
      `--max-filesize ${MAX_VIDEO_SIZE_MB}M ` +
      `--socket-timeout 30 -o "${tmpPath}" "https://www.youtube.com/watch?v=${videoId}"`,
      { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }
    );

    if (!fs.existsSync(tmpPath)) {
      throw new Error('Download failed — file not found');
    }

    const fileSize = fs.statSync(tmpPath).size;
    console.log(`Downloaded ${(fileSize / 1024 / 1024).toFixed(1)}MB`);

    // Upload to GCS
    const { bucket } = getGCS();
    const safeName = (title || videoId).replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 80);
    const fileName = `videos/yt-${safeName}-${uuidv4().substring(0, 8)}.mp4`;

    await bucket.upload(tmpPath, {
      destination: fileName,
      contentType: 'video/mp4',
    });

    fs.unlinkSync(tmpPath);

    const gcsUri = `gs://${GCS_BUCKET_NAME}/${fileName}`;
    console.log(`YouTube video uploaded to ${gcsUri}`);

    res.json({ fileName, gcsUri, size: fileSize, videoId });
  } catch (error) {
    console.error('YouTube import error:', error);
    res.status(500).json({ error: 'YouTube import failed', details: error.message });
  }
});

// --- Analysis Save (Firestore) ---
app.post('/api/analysis/save', async (req, res) => {
  try {
    const data = req.body;
    const analysisId = uuidv4();
    const db = getFirestore();

    // Save metadata to Firestore
    const doc = {
      id: analysisId,
      exerciseType: data.exerciseType || 'Unknown',
      sport: data.sport || 'football',
      source: data.source || 'upload',
      fileName: data.fileName || '',
      gcsUri: data.gcsUri || '',
      originalName: data.originalName || '',
      youtubeVideoId: data.youtubeVideoId || null,
      videoMetadata: data.videoMetadata || {},
      analysisType: data.analysisType || 'technique',
      createdAt: new Date().toISOString(),
    };

    await db.collection('analyses').doc(analysisId).set(doc);

    // Save large data (landmarks, ML results) to GCS
    const { bucket } = getGCS();

    if (data.landmarks && data.landmarks.length > 0) {
      const landmarksFile = bucket.file(`analyses/${analysisId}/landmarks.json`);
      await landmarksFile.save(JSON.stringify(data.landmarks), { contentType: 'application/json' });
    }

    if (data.mlResults) {
      const mlFile = bucket.file(`analyses/${analysisId}/ml-results.json`);
      await mlFile.save(JSON.stringify(data.mlResults), { contentType: 'application/json' });
    }

    // Save analysis text and match analysis to Firestore (smaller data)
    const analysisDoc = {
      analysis: data.analysis || {},
      rawText: data.rawText || '',
      matchAnalysis: data.matchAnalysis || null,
      triageResult: data.triageResult || null,
    };
    await db.collection('analyses').doc(analysisId).collection('data').doc('results').set(analysisDoc);

    res.json({ success: true, analysisId });
  } catch (error) {
    console.error('Save analysis error:', error);
    res.status(500).json({ error: 'Save failed', details: error.message });
  }
});

// --- Analysis List ---
app.get('/api/analysis/list', async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('analyses')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const analyses = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      // Return lightweight metadata only (exclude large fields)
      analyses.push({
        id: doc.id,
        exerciseType: data.exerciseType,
        sport: data.sport,
        source: data.source,
        fileName: data.fileName,
        gcsUri: data.gcsUri,
        originalName: data.originalName,
        youtubeVideoId: data.youtubeVideoId,
        videoMetadata: data.videoMetadata,
        analysisType: data.analysisType,
        createdAt: data.createdAt,
        hasLandmarks: data.hasLandmarks,
        hasMlResults: data.hasMlResults,
        hasMatchAnalysis: data.hasMatchAnalysis,
      });
    });

    res.json({ analyses });
  } catch (error) {
    console.error('List analyses error:', error);
    res.status(500).json({ error: 'List failed', details: error.message });
  }
});

// --- Analysis Get (full data) ---
app.get('/api/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getFirestore();

    const metaDoc = await db.collection('analyses').doc(id).get();
    if (!metaDoc.exists) return res.status(404).json({ error: 'Analysis not found' });

    const meta = metaDoc.data();

    // Get analysis results
    const resultsDoc = await db.collection('analyses').doc(id).collection('data').doc('results').get();
    const results = resultsDoc.exists ? resultsDoc.data() : {};

    // Try to load landmarks and ML results from GCS
    const { bucket } = getGCS();
    let landmarks = [];
    let mlResults = null;

    try {
      const [landmarksData] = await bucket.file(`analyses/${id}/landmarks.json`).download();
      landmarks = JSON.parse(landmarksData.toString());
    } catch (e) { /* No landmarks saved */ }

    try {
      const [mlData] = await bucket.file(`analyses/${id}/ml-results.json`).download();
      mlResults = JSON.parse(mlData.toString());
    } catch (e) { /* No ML results saved */ }

    res.json({
      ...meta,
      ...results,
      landmarks,
      mlResults,
    });
  } catch (error) {
    console.error('Get analysis error:', error);
    res.status(500).json({ error: 'Get failed', details: error.message });
  }
});

// ========================================
// YOUTUBE HELPERS
// ========================================

function formatYouTubeDuration(isoDuration) {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';
  const h = parseInt(match[1] || '0');
  const m = parseInt(match[2] || '0');
  const s = parseInt(match[3] || '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function parseYouTubeDuration(isoDuration) {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || '0') * 3600) +
         (parseInt(match[2] || '0') * 60) +
         parseInt(match[3] || '0');
}

// ========================================
// PROMPT TEMPLATES
// ========================================

function getTechniqueSpecificGuide(technique) {
  const guides = {
    "Instep Kick": `BIOMECHANICS FOCUS — INSTEP KICK:
- Plant foot: 15-20cm beside ball, toes pointed at target. Too far = loss of power, too close = shanked contact.
- Hip extension: Should reach 120-170° during backswing. Power originates from hip flexor stretch-shortening cycle.
- Knee snap: Knee extends from ~90° flexion to near-full extension (140-175°) at contact. Late extension = weak strike.
- Ankle lock: Ankle plantarflexed and rigid at contact. Toes pointed down, striking surface = laces (dorsum of foot).
- Torso: Slight forward lean keeps ball low. Leaning back >15° sends ball over the bar.
- Follow-through: Kicking leg should continue 150-180° past contact point, toward the target.`,

    "Inside Foot Pass": `BIOMECHANICS FOCUS — INSIDE FOOT PASS:
- Plant foot: Beside the ball, toes at target. Distance determines accuracy.
- Hip rotation: External rotation opens the kicking foot 90° outward. Insufficient rotation = toe-poke.
- Knee angle: Moderate extension (130-165°) — this is accuracy over power.
- Contact surface: Medial arch of foot, striking center of ball.
- Body position: Center of gravity over the ball for ground passes. Lean back for lofted passes.
- Follow-through: Toward the target, moderate length. Kicking foot stays turned outward.`,

    "Outside Foot Pass": `BIOMECHANICS FOCUS — OUTSIDE FOOT PASS:
- Approach angle: 15-30° to the ball line, allowing room for the across-body swing.
- Ankle inversion: Foot turned inward at contact, striking with the 5th metatarsal area.
- Knee whip: Power from knee snap, not hip swing. Compact, quick motion.
- Deception: Minimal body telegraph — hips face away from pass direction.
- Plant foot: Slightly behind the ball to allow the across-body contact.`,

    "Dribbling Posture": `BIOMECHANICS FOCUS — DRIBBLING POSTURE:
- Knee flexion: 140-165° (20-30° bend) — low center of gravity for agility.
- Torso lean: 5-20° forward lean. Upright = slow reactions. Too bent = limited vision.
- Head position: Upright, eyes scanning forward, not down at the ball.
- Foot contact: Balls of feet (forefoot loading) for quick direction changes.
- Arm position: Arms out from body for balance and shielding.`,

    "Heading Technique": `BIOMECHANICS FOCUS — HEADING:
- Stance: Wide staggered base. One foot forward for anterior-posterior stability.
- Back arch: Torso extends 15-25° posterior, loading the rectus abdominis eccentrically.
- Core drive: Power from concentric contraction of core, NOT from neck flexion alone. Neck injury risk with improper form.
- Contact point: Frontal bone (forehead at hairline). Top of head or temporal area = concussion risk.
- Eyes: Must remain open and on the ball through contact for timing accuracy.
- Arms: Out for balance, elbows down to avoid foul.`,

    "Volley Kick": `BIOMECHANICS FOCUS — VOLLEY KICK:
- Body orientation: Sideways to ball flight for rotational power. Facing the ball head-on limits force generation.
- Knee lift: Kicking knee raised to ~90° hip flexion before the downward strike.
- Timing: Strike at ball's descent apex or slightly after. Early = over the bar, late = into the ground.
- Ankle lock: Rigid plantarflexion, laces contact. Same as instep kick but with aerial timing.
- Balance arms: Spread wide — the non-kicking side arm extends for counterbalance.
- Support leg: Slightly bent, may leave the ground on full-power volleys.`,

    "Throw-In": `BIOMECHANICS FOCUS — THROW-IN:
- Grip: Both hands symmetrically behind ball, fingers spread. Asymmetric grip = spin and foul throw.
- Feet: Both on ground behind touchline throughout. Lifting a heel = foul throw per FIFA Law 15.
- Back arch: Spine extends to load elastic energy. More arch = more distance.
- Core drive: Sequential activation: back extensors → rectus abdominis → shoulder flexors → wrist snap.
- Release point: As ball passes overhead. Early = ball goes backward, late = ball goes into ground.
- Arm symmetry: Both arms deliver equal force — asymmetry is a foul throw.`,

    "Goalkeeper Stance": `BIOMECHANICS FOCUS — GOALKEEPER STANCE:
- Knee flexion: 130-155° (30-40° bend). Too straight = slow first step. Too deep = slow recovery.
- Stance width: Wider than shoulder-width. Narrow = limited lateral reach.
- Weight distribution: On forefoot (balls of feet). Heels down = slow reaction.
- Forward lean: 5-20° from vertical. Ready to spring forward for smothering.
- Hands: At waist-to-chest height, palms forward, fingers spread. Too low = slow to high shots.
- Head: Still, eyes tracking the ball. Head movement = delayed reactions.`
  };

  return guides[technique] || `BIOMECHANICS EVALUATION FRAMEWORK:
Evaluate these sport-specific biomechanical factors:
- KINETIC CHAIN: Does power transfer sequentially from ground → legs → hips → core → striking limb?
- JOINT ANGLES: Measure key joint angles at critical moments (backswing, contact, follow-through).
- BALANCE: Center of gravity over support base. Recovery to ready position.
- PHASE DETECTION: Identify approach, loading, contact, and follow-through phases.
- FOLLOW-THROUGH: Length and direction relative to intended target.`;
}

function createVideoAnalysisPrompt(exerciseType, landmarks, metadata) {
  const isAutoDetect = !exerciseType || exerciseType === 'auto-detect';

  const landmarkSummary = landmarks && landmarks.length > 0
    ? `\nI have extracted ${landmarks.length} frames of MediaPipe pose landmarks from this video.`
    : '';

  const techniqueInstruction = isAutoDetect
    ? `First, identify the specific football technique being performed in this video.
Common techniques include: Instep Kick, Inside Foot Pass, Outside Foot Pass,
Dribbling Posture, Heading Technique, Volley Kick, Throw-In, Goalkeeper Stance.
If none match exactly, describe the technique you observe.`
    : `Exercise/Technique: ${exerciseType}`;

  const introLine = isAutoDetect
    ? 'You are an expert sports biomechanics coach analyzing a football technique video.'
    : `You are an expert sports biomechanics coach analyzing a video recording of "${exerciseType}".`;

  const biomechanicsGuide = isAutoDetect
    ? `BIOMECHANICS EVALUATION FRAMEWORK:
After identifying the technique, evaluate these sport-specific biomechanical factors using the following reference criteria:

${Object.entries({
  "Instep Kick": getTechniqueSpecificGuide("Instep Kick"),
  "Inside Foot Pass": getTechniqueSpecificGuide("Inside Foot Pass"),
  "Outside Foot Pass": getTechniqueSpecificGuide("Outside Foot Pass"),
  "Heading Technique": getTechniqueSpecificGuide("Heading Technique"),
  "Volley Kick": getTechniqueSpecificGuide("Volley Kick"),
  "Throw-In": getTechniqueSpecificGuide("Throw-In"),
  "Dribbling Posture": getTechniqueSpecificGuide("Dribbling Posture"),
  "Goalkeeper Stance": getTechniqueSpecificGuide("Goalkeeper Stance")
}).map(([, v]) => v).join('\n\n')}

GENERAL FACTORS TO ALWAYS EVALUATE:
- KINETIC CHAIN: Does power transfer sequentially from ground → legs → hips → core → striking limb? Identify any chain breaks.
- PLANT FOOT: Position relative to ball (distance, angle, direction). This determines accuracy and power.
- HIP MECHANICS: Hip flexion/extension angle, rotation, and drive. For kicks, the hip should generate primary power.
- KNEE-OVER-BALL: At contact, is the knee over or behind the ball? Forward lean affects trajectory.
- ANKLE LOCK: Is the ankle rigid at contact or floppy? Locked ankle = consistent strike surface.
- TORSO LEAN: Forward lean for driven shots, slight back lean for lofted balls. Excessive lean = loss of control.
- FOLLOW-THROUGH: Length and direction of follow-through relative to intended target.
- PHASE DETECTION: Identify the approach, backswing/loading, contact, and follow-through phases. Note the transition quality between phases.
- BALANCE & RECOVERY: Center of gravity over support base. How quickly does the athlete recover to a ready position?`
    : getTechniqueSpecificGuide(exerciseType);

  return `${introLine}

VIDEO ANALYSIS REQUEST:
- ${techniqueInstruction}
- Duration: ${metadata?.duration || 'unknown'} seconds
- Frame count with pose data: ${landmarks?.length || 'unknown'}
${landmarkSummary}

${biomechanicsGuide}

Analyze the video and provide your assessment in these exact sections:

${isAutoDetect ? `DETECTED_TECHNIQUE:
State the specific technique or exercise being performed (one short line only).

` : ''}OVERALL_PERFORMANCE:
A 2-3 sentence summary of the athlete's overall performance, referencing specific biomechanical observations.

PHASE_BREAKDOWN:
Break down the movement into its biomechanical phases (e.g., approach, plant, backswing, contact, follow-through). For each phase, note body angles, positions, and timing. Identify the strongest and weakest phases.

FORM_QUALITY:
Detailed form assessment focusing on the kinetic chain, joint angles at key moments (especially contact), body alignment, and consistency across repetitions.

KEY_MOMENTS:
Identify 3-5 specific timestamps where notable biomechanical issues or excellent execution occurred. Format each as "- [MM:SS] Description" and reference specific joint angles or body positions.

PROGRESSION:
How does the athlete's biomechanical quality change throughout the video? Note any fatigue-related form breakdown (e.g., reduced hip drive, shorter follow-through, rising plant foot).

IMPROVEMENT_PLAN:
Provide 3-5 specific, actionable recommendations ordered by impact. Each should reference a specific biomechanical correction (e.g., "Increase hip extension to 160°+ before contact" rather than "kick harder").

OVERLAY_ANNOTATIONS:
Suggest 2-3 specific visual overlays that highlight the biomechanical issues found. Reference specific joints, angles, or movement paths (e.g., "Track hip-knee-ankle angle through the kicking arc to show incomplete extension at contact").`;
}

function createRealtimeFeedbackPrompt(exerciseType, exerciseData, exerciseContext) {
  const ctx = exerciseContext || {};

  const jointAnglesText = exerciseData?.jointAngles
    ? Object.entries(exerciseData.jointAngles)
        .map(([joint, angle]) => `- ${joint}: ${Math.round(angle)}°`)
        .join('\n')
    : '';

  return `You are an expert coach providing real-time feedback on "${exerciseType}".

${ctx.exerciseContext ? `EXERCISE CONTEXT:\n${ctx.exerciseContext}\n` : ''}
${ctx.formCriteria ? `PROPER FORM CRITERIA:\n${ctx.formCriteria}\n` : ''}
${ctx.commonErrors ? `COMMON ERRORS:\n${ctx.commonErrors}\n` : ''}

USER'S CURRENT METRICS:
- Exercise: ${exerciseData?.exerciseName || exerciseType}
- Rep count: ${exerciseData?.repCount || 0}${exerciseData?.repGoal ? ` of ${exerciseData.repGoal} target` : ''}
- Form quality: ${exerciseData?.formQuality || 'unknown'}
${exerciseData?.formIssues?.length ? `- Form issues: ${exerciseData.formIssues.join(', ')}` : '- No form issues detected'}
${jointAnglesText ? `\nJOINT ANGLES:\n${jointAnglesText}` : ''}

${ctx.breathingTechnique ? `PROPER BREATHING:\n${ctx.breathingTechnique}\n` : ''}

Provide brief, actionable feedback in these exact sections:

FORM_ASSESSMENT:
2-3 sentences on current form quality, referencing specific joint angles.

IMPROVEMENT_TIP:
One specific, actionable tip to improve right now.

PROGRESS_FEEDBACK:
One sentence on how the current set is going.

BREATHING_REMINDER:
A brief breathing cue appropriate for this exercise phase.

Keep total response under 100 words. Be supportive and precise.`;
}

// ========================================
// MATCH ANALYSIS PROMPT TEMPLATES
// ========================================

function createMatchTacticalPrompt(mlResults, metadata) {
  const meta = mlResults.processingMeta || {};
  const teamStats = {};
  for (const [tid, stats] of Object.entries(mlResults.playerStats || {})) {
    const teamId = stats.teamId;
    if (teamId < 0) continue;
    if (!teamStats[teamId]) teamStats[teamId] = { count: 0, avgBallDist: [] };
    teamStats[teamId].count++;
    if (stats.avgBallDistance != null) teamStats[teamId].avgBallDist.push(stats.avgBallDistance);
  }

  const teamSummary = Object.entries(teamStats)
    .map(([id, s]) => {
      const avgDist = s.avgBallDist.length > 0
        ? (s.avgBallDist.reduce((a, b) => a + b, 0) / s.avgBallDist.length).toFixed(3)
        : 'N/A';
      return `- Team ${parseInt(id) + 1}: ${s.count} players detected, avg ball distance: ${avgDist}`;
    }).join('\n');

  return `You are an expert football tactical analyst. Analyze this match video clip for tactical patterns.

MATCH DATA:
- Duration: ${metadata?.duration || 'unknown'} seconds
- Frames processed: ${meta.framesProcessed || 'unknown'}
- Players tracked: ${meta.uniquePlayersTracked || meta.playersDetected || 'unknown'}
- Ball detections: ${meta.ballDetections || 0}

TEAM BREAKDOWN:
${teamSummary || 'No team data available'}

Provide tactical analysis in these exact sections:

FORMATION:
Describe the apparent formation of each team based on player positions and movement patterns.

ATTACKING_PATTERN:
Identify attacking patterns: build-up play style, width usage, key passing lanes, and offensive transitions.

DEFENDING_PATTERN:
Identify defensive patterns: pressing triggers, defensive line height, compactness, and transition defense.

TACTICAL_SUMMARY:
2-3 sentence summary of the tactical battle and which team has the tactical advantage.`;
}

function createFocusWindowPrompt(trackId, teamId, timeWindow, keypoints, windowStats, previousInsights) {
  const teamLabel = teamId >= 0 ? `Team ${teamId + 1}` : 'Unknown team';
  const prevContext = previousInsights && previousInsights.length > 0
    ? `\nPREVIOUS OBSERVATIONS (for context, do NOT repeat these):\n${previousInsights.slice(-2).join('\n')}`
    : '';

  const bboxSample = (keypoints || []).slice(0, 15).map((k) => ({
    t: typeof k.timestamp === 'number' ? k.timestamp.toFixed(1) : k.timestamp,
    bbox: k.bbox ? k.bbox.map((v) => typeof v === 'number' ? v.toFixed(3) : v) : [],
  }));

  return `You are a football analyst providing live commentary on a specific player.

PLAYER: #${trackId} (${teamLabel})
TIME WINDOW: ${timeWindow.start.toFixed(1)}s – ${timeWindow.end.toFixed(1)}s
FRAMES IN WINDOW: ${keypoints?.length || 0}
BALL PROXIMITY: ${windowStats?.ballProximity ?? 'unknown'}
${prevContext}

PLAYER POSITIONS IN THIS WINDOW:
${JSON.stringify(bboxSample)}

Watch the video from ${timeWindow.start.toFixed(1)}s to ${timeWindow.end.toFixed(1)}s and focus ONLY on player #${trackId}.

Provide exactly 2-3 bullet points about what this player did in THIS specific time segment:
• What specific actions did they perform? (passes, runs, tackles, shots, positioning moves)
• How was their technique and decision-making?
• Any notable moments (good or bad)?

Be specific and reference timestamps when possible. Do NOT repeat observations from previous windows. Keep it concise — max 3 bullet points.`;
}

function createPlayerTechniquePrompt(trackId, teamId, keypoints, stats, playerPath) {
  const teamLabel = teamId >= 0 ? `Team ${teamId + 1}` : 'Unknown team';
  const keypointSummary = keypoints && keypoints.length > 0
    ? `${keypoints.length} pose snapshots across the video`
    : 'No keypoints available';
  const pathSummary = playerPath && playerPath.length > 0
    ? `Movement path: ${playerPath.length} positions from ${playerPath[0].timestamp}s to ${playerPath[playerPath.length - 1].timestamp}s`
    : 'No movement path data';

  const bboxSample = (keypoints || []).slice(0, 30).map(k => ({
    t: typeof k.timestamp === 'number' ? k.timestamp.toFixed(2) : k.timestamp,
    bbox: k.bbox ? k.bbox.map(v => typeof v === 'number' ? v.toFixed(3) : v) : [],
  }));

  const keypointSample = (keypoints || [])
    .filter((_, i) => i % 3 === 0)
    .slice(0, 20)
    .map(k => ({
      t: typeof k.timestamp === 'number' ? k.timestamp.toFixed(2) : k.timestamp,
      kp: k.keypoints,
    }));

  return `You are an expert football biomechanics analyst. Focus on a SPECIFIC player in this video and provide a deep technique analysis grounded in sports science.

PLAYER IDENTIFICATION:
- Track ID: #${trackId}
- Team: ${teamLabel}
- ${keypointSummary}
- Visible for approximately ${stats?.visibilityTime?.toFixed(1) || '?'} seconds
- Ball possession: ${stats?.possessionFrames || 0} frames
- ${pathSummary}

PLAYER BOUNDING BOX POSITIONS (normalized 0-1, use these to identify the player):
${JSON.stringify(bboxSample)}

PLAYER POSE KEYPOINTS (MediaPipe 33-point format, selected frames):
${JSON.stringify(keypointSample)}

BIOMECHANICS ANALYSIS GUIDE:
When analyzing this player's technique, evaluate these factors:
- Kinetic chain efficiency: ground → legs → hips → core → upper body. Is power transferred sequentially or are there chain breaks?
- Joint angles at key moments: hip flexion/extension, knee angle at contact, ankle lock status.
- Plant foot positioning relative to the ball during passes/shots.
- Body lean and center of gravity over the support base.
- Follow-through direction and length after ball contact.
- Deceleration mechanics: how does the player brake and change direction?
- Landing mechanics after aerial actions (knee valgus, ankle stability).

Use the pose keypoints to reference specific joint angles where possible (MediaPipe indices: 11-12 shoulders, 23-24 hips, 25-26 knees, 27-28 ankles).

Watch the video and focus ONLY on this specific player. Provide analysis in these exact sections:

TECHNIQUE_ASSESSMENT:
Evaluate the player's technical ability with specific biomechanical observations. For any ball contact actions (passes, shots, dribbles), describe the kinetic chain, contact surface, and follow-through quality. Reference joint angles from the keypoint data where visible.

PHYSICAL_ANALYSIS:
Assess physical attributes through biomechanical indicators: stride length and frequency (speed), change-of-direction mechanics (agility), deceleration patterns (injury risk), jumping technique (power), and body balance during dynamic movements.

MOVEMENT_QUALITY:
Analyze movement efficiency: running form (arm drive, knee lift, foot strike), off-ball positioning, spatial awareness, and economy of motion. Does the player move efficiently or waste energy?

TACTICAL_CONTRIBUTION:
How does this player contribute to the team's play? Evaluate decision-making, body orientation before receiving the ball, and positioning relative to teammates.

STRENGTHS:
List 3-5 key strengths observed, with specific biomechanical evidence (e.g., "Excellent hip drive generating ~160° extension at contact" rather than "good shooting").

AREAS_FOR_IMPROVEMENT:
List 3-5 areas where the player could improve, with specific biomechanical corrections (e.g., "Plant foot consistently 25cm+ from ball — move it closer to 15cm for better accuracy" rather than "improve passing").

OVERALL_RATING:
Provide an overall performance rating (1-10) with justification referencing specific biomechanical observations.`;
}

function createPlayerAnalysisPrompt(trackId, playerStats, playerPath, metadata) {
  const pathSummary = playerPath && playerPath.length > 0
    ? `Movement path: ${playerPath.length} positions recorded from ${playerPath[0].timestamp}s to ${playerPath[playerPath.length - 1].timestamp}s`
    : 'No movement data';

  return `You are an expert football coach analyzing an individual player in a match video.

PLAYER DATA:
- Track ID: #${trackId}
- Team: ${playerStats?.teamId >= 0 ? `Team ${playerStats.teamId + 1}` : 'Unknown'}
- Visible from: ${playerStats?.firstSeen || 0}s to ${playerStats?.lastSeen || 0}s
- Frames visible: ${playerStats?.framesVisible || 0}
- Average ball distance: ${playerStats?.avgBallDistance ?? 'N/A'}
- Closest ball distance: ${playerStats?.minBallDistance ?? 'N/A'}
- Ball possession frames: ${playerStats?.possessionFrames || 0}
- ${pathSummary}

Focus on player #${trackId} in the video and provide analysis in these exact sections:

PLAYER_ROLE:
What role does this player appear to play (attacker, midfielder, defender, goalkeeper)? What position on the pitch?

ACTIONS_PERFORMED:
List the key actions this player performs: passes, dribbles, shots, tackles, runs, etc. Reference timestamps when visible.

MOVEMENT_QUALITY:
Assess movement quality: positioning, off-the-ball runs, spatial awareness, work rate.

PLAYER_ASSESSMENT:
1-2 sentence overall assessment of this player's contribution to the match.`;
}

function createEventDetectionPrompt(keyFrames, metadata) {
  const contactSummary = keyFrames
    .filter((kf) => kf.type === 'ball_contact')
    .slice(0, 20)
    .map((kf) => `- ${kf.timestamp}s: Player #${kf.playerId} ball contact`)
    .join('\n');

  return `You are an expert football match analyst. Identify key events in this match video.

DETECTED BALL CONTACTS (from ML tracking):
${contactSummary || 'No ball contacts detected by tracking'}

Duration: ${metadata?.duration || 'unknown'} seconds

Watch the video and identify all significant events. Provide analysis in these exact sections:

EVENTS_TIMELINE:
List every significant event chronologically. Format each as:
[MM:SS] - Description of event (e.g., pass, shot, tackle, foul, goal)

KEY_PLAYS:
Describe the 2-3 most significant plays or sequences in detail.

STANDOUT_MOMENTS:
Identify any exceptional individual actions, tactical moves, or turning points.`;
}

function createPossessionPrompt(possessionTimeline, ballTrajectory, metadata) {
  const teamFrames = {};
  for (const entry of possessionTimeline) {
    const tid = entry.teamId;
    if (tid >= 0) teamFrames[tid] = (teamFrames[tid] || 0) + 1;
  }
  const total = possessionTimeline.length || 1;

  const possessionSummary = Object.entries(teamFrames)
    .map(([id, count]) => `- Team ${parseInt(id) + 1}: ${Math.round((count / total) * 100)}% (${count} frames)`)
    .join('\n');

  return `You are an expert football analyst specializing in possession and territorial control.

POSSESSION DATA (from ML tracking):
${possessionSummary || 'No possession data available'}
Total tracked frames: ${total}
Ball trajectory points: ${ballTrajectory.length}

Analyze possession patterns in this video. Provide analysis in these exact sections:

POSSESSION_SUMMARY:
Overall possession breakdown between teams and what it tells us about the match dynamics.

POSSESSION_CHANGES:
Identify key moments where possession changed and what caused the turnovers.

TERRITORIAL_CONTROL:
Which team controls which areas of the pitch? Is play concentrated in one half?`;
}

// ========================================
// RESPONSE PARSING
// ========================================

function parseAnalysisSections(text) {
  const sections = {};
  if (!text) return sections;

  let currentSection = null;
  let currentContent = [];

  const lines = text.split('\n');

  for (const line of lines) {
    // Match section headers like "SECTION_NAME:", "**SECTION_NAME:**", "### SECTION_NAME"
    const sectionMatch = line.match(/^[#*\s]*([A-Z][A-Z_]+)[*:\s]*$/);

    if (sectionMatch) {
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n').trim();
        currentContent = [];
      }
      currentSection = sectionMatch[1];
    } else if (currentSection && line.trim()) {
      currentContent.push(line.trim());
    }
  }

  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }

  return sections;
}

function parseEventsTimeline(text) {
  if (!text) return [];
  const events = [];
  // Match lines like "[00:15] - Description" or "[0:15] - Description"
  const regex = /\[(\d{1,2}):(\d{2})\]\s*[-–—]\s*(.+)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const timestamp = parseInt(m[1]) * 60 + parseInt(m[2]);
    events.push({ timestamp, description: m[3].trim() });
  }
  return events;
}

// ========================================
// START SERVER
// ========================================

// Try to start nginx (production only — will fail silently in local dev)
const { exec } = require('child_process');
exec('nginx -g "daemon off;" &', () => {});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`  Vertex AI: ${GOOGLE_CLOUD_PROJECT ? 'configured' : 'not configured'}`);
  console.log(`  GCS Bucket: ${GCS_BUCKET_NAME || 'not configured'}`);
  console.log(`  YouTube: ${YOUTUBE_API_KEY ? 'configured' : 'not configured'}`);
  console.log(`  ML Pipeline: ${ML_ENABLED ? 'enabled' : 'disabled'}`);
});
