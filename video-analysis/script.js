// Video Analysis page orchestration
// Handles upload, MediaPipe processing, server analysis, and overlay playback

import VideoProcessor from '../shared/video-processor.js';
import VideoOverlay from '../shared/video-overlay.js';
import MatchCharts from '../shared/match-charts.js';

// DOM refs
const uploadSection = document.getElementById('upload-section');
const processingSection = document.getElementById('processing-section');
const resultsSection = document.getElementById('results-section');

const uploadZone = document.getElementById('upload-zone');
const videoFileInput = document.getElementById('video-file-input');
const browseButton = document.getElementById('browse-button');
const filePreview = document.getElementById('file-preview');
const previewVideo = document.getElementById('preview-video');
const startAnalysisBtn = document.getElementById('start-analysis');
const clearFileBtn = document.getElementById('clear-file');

const progressFill = document.getElementById('progress-fill');
const progressStage = document.getElementById('progress-stage');
const progressPercentage = document.getElementById('progress-percentage');

const resultVideo = document.getElementById('result-video');
const overlayCanvas = document.getElementById('overlay-canvas');
const playPauseBtn = document.getElementById('play-pause-btn');
const videoTimeline = document.getElementById('video-timeline');

let videoProcessor = null;
let videoOverlay = null;
let selectedFile = null;
let analysisData = null;
let landmarksData = null;
let uploadedFileName = null;
let overlayAnimationId = null;
let selectedYouTubeVideo = null;
let lastRawText = null;
let lastGcsUri = null;
let mlResultsData = null;
let matchAnalysisData = null;
let matchCharts = null;
let analysisMode = null; // null = auto-detect, set after triage
let triageResult = null;
let currentGcsUri = null;
const playerAnalysisCache = new Map(); // trackId → technique analysis result

// Focus mode state
let focusMode = false;
let focusTrackId = null;
let focusLastWindowEnd = 0;
let focusInsights = [];
let focusPendingStream = null; // AbortController for current stream
const FOCUS_WINDOW_SECONDS = 15;

// ========================================
// INITIALIZATION
// ========================================

let currentAnalysisId = null; // Track current analysis for URL

function init() {
  setupEventListeners();
  loadConfig();
  // Load library immediately since it's the default tab
  loadVideoLibrary();
  // Handle URL hash routing
  handleHashRoute();
  window.addEventListener('hashchange', handleHashRoute);
}

function setupEventListeners() {
  // Upload zone click & drag
  uploadZone.addEventListener('click', (e) => {
    if (e.target === browseButton || browseButton.contains(e.target)) return;
    videoFileInput.click();
  });
  browseButton.addEventListener('click', () => videoFileInput.click());
  videoFileInput.addEventListener('change', handleFileSelect);

  // Drag & drop
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      selectFile(file);
    }
  });

  // File actions
  startAnalysisBtn.addEventListener('click', processVideo);
  clearFileBtn.addEventListener('click', clearFile);

  // Playback controls
  playPauseBtn.addEventListener('click', togglePlayPause);
  videoTimeline.addEventListener('input', handleTimelineChange);
  resultVideo.addEventListener('timeupdate', updateTimeline);
  resultVideo.addEventListener('play', startOverlayLoop);
  resultVideo.addEventListener('pause', stopOverlayLoop);
  resultVideo.addEventListener('seeked', () => {
    if (videoOverlay) videoOverlay.clearPaths();
    renderOverlayFrame();
    // Focus mode: handle seek
    if (focusMode) {
      const t = resultVideo.currentTime;
      if (t < focusLastWindowEnd) {
        focusLastWindowEnd = Math.max(0, t);
      }
      if (focusPendingStream) {
        focusPendingStream.abort();
        focusPendingStream = null;
      }
    }
  });

  resultVideo.addEventListener('ended', () => {
    // Focus mode: trigger final partial window
    if (focusMode) {
      const remaining = resultVideo.duration - focusLastWindowEnd;
      if (remaining > 5 && !focusPendingStream) {
        triggerFocusAnalysis(focusLastWindowEnd, resultVideo.duration);
      }
      document.getElementById('focus-status').textContent =
        `Completo — ${focusInsights.length} observações`;
    }
  });

  // Overlay mode buttons
  document.querySelectorAll('.btn-overlay').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.btn-overlay').forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      const mode = e.currentTarget.dataset.mode;
      if (videoOverlay) {
        if (mode === 'none') {
          const ctx = overlayCanvas.getContext('2d');
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        } else {
          videoOverlay.setOverlayMode(mode);
          renderOverlayFrame();
        }
      }
    });
  });

  // Result actions
  document.getElementById('download-report').addEventListener('click', downloadReport);
  document.getElementById('analyze-another').addEventListener('click', resetAll);

  // Match result tabs
  document.querySelectorAll('.match-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.match-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.match-tab-content').forEach((c) => c.classList.remove('active'));
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Source tabs (Upload File / Search YouTube / Previous Videos)
  document.querySelectorAll('.source-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.source-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      const youtubePanel = document.getElementById('youtube-panel');
      const libraryPanel = document.getElementById('library-panel');

      // Hide all panels
      youtubePanel.classList.add('hidden');
      libraryPanel.classList.add('hidden');
      uploadZone.classList.add('hidden');
      filePreview.classList.add('hidden');
      document.querySelector('.upload-config').style.display = 'none';

      if (tabName === 'youtube') {
        youtubePanel.classList.remove('hidden');
      } else if (tabName === 'library') {
        libraryPanel.classList.remove('hidden');
        loadVideoLibrary();
      } else {
        // upload tab
        document.querySelector('.upload-config').style.display = '';
        if (!selectedFile) {
          uploadZone.classList.remove('hidden');
        }
        if (selectedFile) {
          filePreview.classList.remove('hidden');
        }
      }
    });
  });

  // YouTube direct URL/ID
  const youtubeDirectBtn = document.getElementById('youtube-direct-btn');
  const youtubeUrlInput = document.getElementById('youtube-url');
  youtubeDirectBtn.addEventListener('click', () => loadYouTubeByUrl(youtubeUrlInput.value));
  youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadYouTubeByUrl(youtubeUrlInput.value);
  });

  // YouTube search
  const youtubeSearchBtn = document.getElementById('youtube-search-btn');
  const youtubeQueryInput = document.getElementById('youtube-query');
  youtubeSearchBtn.addEventListener('click', () => searchYouTube(youtubeQueryInput.value));
  youtubeQueryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchYouTube(youtubeQueryInput.value);
  });

  // YouTube import & clear
  document.getElementById('youtube-import-btn').addEventListener('click', importYouTubeVideo);
  document.getElementById('youtube-clear-btn').addEventListener('click', clearYouTubeSelection);
}

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      document.getElementById('max-size').textContent = config.maxVideoSizeMB || 100;
    }
  } catch (e) {
    // Config endpoint not available (local dev) — use defaults
  }
}

// ========================================
// FILE HANDLING
// ========================================

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) selectFile(file);
}

function selectFile(file) {
  selectedFile = file;
  previewVideo.src = URL.createObjectURL(file);
  document.getElementById('file-name').textContent = file.name;
  document.getElementById('file-size').textContent = formatFileSize(file.size);
  filePreview.classList.remove('hidden');
  uploadZone.classList.add('hidden');
}

function clearFile() {
  selectedFile = null;
  previewVideo.src = '';
  videoFileInput.value = '';
  filePreview.classList.add('hidden');
  uploadZone.classList.remove('hidden');
}

// ========================================
// YOUTUBE SEARCH & IMPORT
// ========================================

function parseYouTubeVideoId(input) {
  if (!input) return null;
  input = input.trim();
  // Bare video ID (11 chars, alphanumeric + - + _)
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    // youtube.com/watch?v=ID
    if (url.searchParams.has('v')) return url.searchParams.get('v');
    // youtu.be/ID
    if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0];
    // youtube.com/embed/ID or youtube.com/v/ID
    const embedMatch = url.pathname.match(/\/(embed|v|shorts)\/([A-Za-z0-9_-]{11})/);
    if (embedMatch) return embedMatch[2];
  } catch {
    // Not a URL — check if it contains a video ID pattern
    const idMatch = input.match(/[A-Za-z0-9_-]{11}/);
    if (idMatch) return idMatch[0];
  }
  return null;
}

async function loadYouTubeByUrl(input) {
  const videoId = parseYouTubeVideoId(input);
  if (!videoId) {
    alert('Não foi possível identificar o ID do vídeo. Tente uma URL como https://youtube.com/watch?v=... ou um ID de 11 caracteres.');
    return;
  }

  const directBtn = document.getElementById('youtube-direct-btn');
  directBtn.disabled = true;
  directBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';

  try {
    const res = await fetch(`/api/youtube/info/${encodeURIComponent(videoId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to fetch video info');
    }
    const video = await res.json();
    selectYouTubeVideo(video);
  } catch (error) {
    alert(`Error: ${error.message}`);
  } finally {
    directBtn.disabled = false;
    directBtn.innerHTML = '<i class="fas fa-link"></i> Carregar';
  }
}

async function searchYouTube(query) {
  if (!query || !query.trim()) return;

  const resultsContainer = document.getElementById('youtube-results');
  resultsContainer.innerHTML = '<div class="youtube-loading"><i class="fas fa-spinner fa-spin"></i> Buscando no YouTube...</div>';

  try {
    const response = await fetch('/api/youtube/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), maxResults: 8 }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Search failed');
    }

    const data = await response.json();
    renderYouTubeResults(data.results || []);
  } catch (error) {
    resultsContainer.innerHTML = `<div class="youtube-error"><i class="fas fa-exclamation-circle"></i> ${error.message}</div>`;
  }
}

function renderYouTubeResults(results) {
  const container = document.getElementById('youtube-results');

  if (results.length === 0) {
    container.innerHTML = '<div class="youtube-empty">Nenhum resultado encontrado. Tente uma busca diferente.</div>';
    return;
  }

  container.innerHTML = results.map((video) => `
    <div class="youtube-card" data-video-id="${video.videoId}">
      <div class="youtube-card-thumb">
        <img src="${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy">
        <span class="youtube-duration">${video.duration}</span>
      </div>
      <div class="youtube-card-info">
        <h4 class="youtube-card-title">${escapeHtml(video.title)}</h4>
        <p class="youtube-card-channel">${escapeHtml(video.channelTitle)}</p>
        <div class="youtube-card-meta">
          <span><i class="fas fa-eye"></i> ${formatViewCount(video.viewCount)}</span>
          <span><i class="fas fa-calendar"></i> ${formatPublishedDate(video.publishedAt)}</span>
        </div>
        <button class="btn btn-primary btn-sm youtube-select-btn" data-video='${JSON.stringify(video).replace(/'/g, "&#39;")}'>
          <i class="fas fa-check"></i> Select for Analysis
        </button>
      </div>
    </div>
  `).join('');

  // Bind select buttons
  container.querySelectorAll('.youtube-select-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const video = JSON.parse(btn.dataset.video);
      selectYouTubeVideo(video);
    });
  });
}

function selectYouTubeVideo(video) {
  selectedYouTubeVideo = video;
  const selectedEl = document.getElementById('youtube-selected');
  document.getElementById('youtube-selected-thumb').src = video.thumbnail;
  document.getElementById('youtube-selected-title').textContent = video.title;
  document.getElementById('youtube-selected-channel').textContent = video.channelTitle;
  document.getElementById('youtube-selected-meta').textContent = `${video.duration} | ${formatViewCount(video.viewCount)} views`;
  selectedEl.classList.remove('hidden');
  document.getElementById('youtube-results').innerHTML = '';
}

function clearYouTubeSelection() {
  selectedYouTubeVideo = null;
  document.getElementById('youtube-selected').classList.add('hidden');
}

async function importYouTubeVideo() {
  if (!selectedYouTubeVideo) return;

  showSection('processing');

  try {
    // Step 1: Import from YouTube (download + GCS upload)
    setStepState('step-upload', 'active');
    updateProgress('Importando vídeo do YouTube...', 5);

    const importResponse = await fetch('/api/youtube/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: selectedYouTubeVideo.videoId,
        title: selectedYouTubeVideo.title,
      }),
    });

    if (!importResponse.ok) {
      const err = await importResponse.json().catch(() => ({}));
      throw new Error(err.error || 'Import failed');
    }

    const importResult = await importResponse.json();
    uploadedFileName = importResult.fileName;
    lastGcsUri = importResult.gcsUri;
    setStepState('step-upload', 'done');

    // Auto-detect video type
    setStepState('step-triage', 'active');
    updateProgress('Detectando tipo de vídeo...', 8);
    triageResult = await runTriage(importResult.fileName);
    analysisMode = triageResult.suggestedMode;
    document.querySelector('#step-triage .step-status').textContent =
      analysisMode === 'match'
        ? `Match (${triageResult.avgPersonCount} players avg)`
        : `Technique (${triageResult.avgPersonCount} person)`;
    setStepState('step-triage', 'done');

    // Run both pipelines (video blob downloaded inside runFullPipeline if needed)
    await runFullPipeline(importResult);

    saveAnalysis('youtube', selectedYouTubeVideo?.title || '', selectedYouTubeVideo?.videoId || null);
    setTimeout(() => showResults(), 600);
  } catch (error) {
    console.error('YouTube import error:', error);
    alert('Falha ao importar vídeo do YouTube: ' + error.message);
    resetAll();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatViewCount(count) {
  const num = parseInt(count);
  if (isNaN(num)) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function formatPublishedDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ========================================
// PREVIOUS ANALYSES LIBRARY
// ========================================

async function loadVideoLibrary() {
  const container = document.getElementById('library-videos');
  container.innerHTML = '<div class="library-loading"><i class="fas fa-spinner fa-spin"></i> Carregando análises...</div>';

  try {
    const response = await fetch('/api/analysis/list');
    if (!response.ok) throw new Error('Failed to load analyses');

    const data = await response.json();
    renderAnalysisList(data.analyses || []);
  } catch (error) {
    container.innerHTML = `<div class="library-error"><i class="fas fa-exclamation-circle"></i> ${error.message}</div>`;
  }
}

function _fmtDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderAnalysisList(analyses) {
  const container = document.getElementById('library-videos');

  if (analyses.length === 0) {
    container.innerHTML = '<div class="library-empty"><i class="fas fa-folder-open"></i><p>Nenhuma análise ainda. Envie um arquivo ou importe do YouTube para começar.</p></div>';
    return;
  }

  container.innerHTML = analyses.map((item) => {
    const sourceBadge = item.source === 'youtube'
      ? '<span class="source-badge source-youtube"><i class="fab fa-youtube"></i> YouTube</span>'
      : '<span class="source-badge source-upload"><i class="fas fa-upload"></i> Upload</span>';

    const typeBadge = item.analysisType === 'match'
      ? '<span class="source-badge source-match"><i class="fas fa-users"></i> Jogo</span>'
      : '<span class="source-badge source-technique"><i class="fas fa-running"></i> Técnica</span>';

    const dateStr = item.createdAt ? formatPublishedDate(item.createdAt) : '';
    const dur = item.videoMetadata?.duration;
    const durStr = dur ? _fmtDuration(dur) : '';
    const title = item.exerciseType || item.originalName || 'Análise';

    // ML summary stats
    const ml = item.mlSummary || {};
    const hasML = ml.uniquePlayers > 0 || ml.framesProcessed > 0;

    // Build ML stats row
    let mlStatsHtml = '';
    if (hasML) {
      const stats = [];
      if (ml.uniquePlayers) stats.push(`<span><i class="fas fa-users"></i> ${ml.uniquePlayers} jogadores</span>`);
      if (ml.ballDetections) stats.push(`<span><i class="fas fa-futbol"></i> ${ml.ballDetections} detecções de bola</span>`);
      if (ml.passCount) stats.push(`<span><i class="fas fa-exchange-alt"></i> ${ml.passCount} passes</span>`);
      if (ml.keyFrameCount) stats.push(`<span><i class="fas fa-star"></i> ${ml.keyFrameCount} momentos-chave</span>`);
      if (ml.cameraCuts) stats.push(`<span><i class="fas fa-cut"></i> ${ml.cameraCuts} cortes</span>`);
      mlStatsHtml = `<div class="library-card-stats">${stats.join('')}</div>`;
    }

    // Feature badges
    let featureBadges = '';
    if (item.hasMlResults) featureBadges += '<span class="source-badge source-ml"><i class="fas fa-brain"></i> ML</span>';
    if (item.hasMatchAnalysis) featureBadges += '<span class="source-badge source-ai"><i class="fas fa-robot"></i> Gemini</span>';
    if (item.hasLandmarks) featureBadges += '<span class="source-badge source-pose"><i class="fas fa-bone"></i> Pose</span>';

    return `
      <div class="library-card" data-id="${item.id}">
        <div class="library-card-info">
          <div class="library-card-header">
            <h4 class="library-card-title">${escapeHtml(title)}</h4>
          </div>
          <div class="library-card-badges">
            ${sourceBadge}
            ${typeBadge}
            ${featureBadges}
          </div>
          <div class="library-card-meta">
            ${durStr ? `<span><i class="fas fa-clock"></i> ${durStr}</span>` : ''}
            ${dateStr ? `<span><i class="fas fa-calendar"></i> ${dateStr}</span>` : ''}
            ${ml.framesProcessed ? `<span><i class="fas fa-images"></i> ${ml.framesProcessed} quadros</span>` : ''}
          </div>
          ${mlStatsHtml}
        </div>
        <div class="library-card-actions">
          <button class="btn btn-primary library-view-btn" data-id="${item.id}">
            <i class="fas fa-play-circle"></i> Ver Análise
          </button>
          <button class="btn btn-secondary btn-sm library-reanalyze-btn" data-file-name="${escapeHtml(item.fileName)}" data-gcs-uri="${escapeHtml(item.gcsUri || '')}" data-original-name="${escapeHtml(item.originalName || '')}">
            <i class="fas fa-redo"></i> Re-analisar
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Click anywhere on card to view
  container.querySelectorAll('.library-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.library-reanalyze-btn')) return;
      viewSavedAnalysis(card.dataset.id);
    });
  });

  container.querySelectorAll('.library-reanalyze-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      analyzeFromLibrary(btn.dataset.fileName, btn.dataset.gcsUri || '', btn.dataset.originalName);
    });
  });
}

async function analyzeFromLibrary(fileName, gcsUri, originalName) {
  showSection('processing');

  try {
    // Step 1: Already in GCS — skip upload
    setStepState('step-upload', 'done');
    document.querySelector('#step-upload .step-status').textContent = 'Já na nuvem';
    uploadedFileName = fileName;
    lastGcsUri = gcsUri;

    // Step 2: Auto-detect video type
    setStepState('step-triage', 'active');
    updateProgress('Detectando tipo de vídeo...', 8);
    triageResult = await runTriage(fileName);
    analysisMode = triageResult.suggestedMode;
    document.querySelector('#step-triage .step-status').textContent =
      analysisMode === 'match'
        ? `Match (${triageResult.avgPersonCount} players avg)`
        : `Technique (${triageResult.avgPersonCount} person)`;
    setStepState('step-triage', 'done');

    const uploadResult = { fileName, gcsUri };

    // Run both pipelines (video blob downloaded inside runFullPipeline if needed)
    await runFullPipeline(uploadResult);

    saveAnalysis('upload', originalName || '');
    setTimeout(() => showResults(), 600);
  } catch (error) {
    console.error('Library analysis error:', error);
    alert('Falha ao analisar vídeo: ' + error.message);
    resetAll();
  }
}

// ========================================
// PROCESSING PIPELINE
// ========================================

async function processVideo() {
  if (!selectedFile) return;

  showSection('processing');

  try {
    // Step 1: Upload to GCS
    setStepState('step-upload', 'active');
    updateProgress('Enviando vídeo para a nuvem...', 5);
    const uploadResult = await uploadVideoToServer(selectedFile);
    uploadedFileName = uploadResult.fileName;
    lastGcsUri = uploadResult.gcsUri;
    setStepState('step-upload', 'done');

    // Step 2: Auto-detect video type via triage
    setStepState('step-triage', 'active');
    updateProgress('Detectando tipo de vídeo...', 8);
    triageResult = await runTriage(uploadResult.fileName);
    analysisMode = triageResult.suggestedMode;
    document.querySelector('#step-triage .step-status').textContent =
      analysisMode === 'match'
        ? `Match (${triageResult.avgPersonCount} players avg)`
        : `Technique (${triageResult.avgPersonCount} person)`;
    setStepState('step-triage', 'done');

    // Step 3+: Run both pipelines in parallel
    await runFullPipeline(uploadResult, selectedFile);

    saveAnalysis('upload', selectedFile?.name || '');
    setTimeout(() => showResults(), 600);
  } catch (error) {
    console.error('Video processing error:', error);
    alert('Falha ao processar vídeo: ' + error.message);
    resetAll();
  }
}

async function runFullPipeline(uploadResult, videoFile) {
  const { fileName, gcsUri } = uploadResult;
  currentGcsUri = gcsUri;

  // For match-mode videos (especially long ones), skip client-side MediaPipe.
  // The ML pipeline already extracts pose keypoints server-side at the processing FPS.
  // Client-side MediaPipe at 15fps on a 90-min video would take hours.
  const isMatch = analysisMode === 'match';
  const videoDuration = triageResult?.duration || 0;
  const skipClientPose = isMatch || videoDuration > 300;

  // --- Step 3: ML pipeline + optional MediaPipe extraction ---
  setStepState('step-extract', 'active');
  updateProgress(skipClientPose
    ? 'Executando detecção ML + rastreamento...'
    : 'Executando detecção ML + extração de pose...', 15);

  const mlPromise = runMlAnalysis(fileName).then((ml) => {
    mlResultsData = ml;
    return ml;
  }).catch((err) => {
    console.warn('ML analysis failed (non-fatal):', err.message);
    return null;
  });

  // Only run client-side MediaPipe for short technique videos
  let mediapipePromise;
  if (skipClientPose) {
    mediapipePromise = Promise.resolve(null);
  } else {
    // MediaPipe pose extraction (needs video file for client-side processing)
    let mediapipeFile = videoFile;
    if (!mediapipeFile) {
      const videoBlob = await fetch(`/api/video/stream/${fileName}`).then((r) => r.blob());
      mediapipeFile = new File([videoBlob], 'video.mp4', { type: 'video/mp4' });
    }

    videoProcessor = new VideoProcessor();
    const processingVideo = document.getElementById('processing-video');
    const processingCanvas = document.getElementById('processing-canvas');
    await videoProcessor.initialize(processingVideo, processingCanvas);

    mediapipePromise = videoProcessor.processVideo(
      mediapipeFile,
      (progress) => {
        const overall = 15 + progress * 0.35;
        updateProgress(`Extraindo dados de pose... (quadro ${videoProcessor.currentFrame}/${videoProcessor.totalFrames})`, overall);
      }
    ).then((landmarks) => {
      landmarksData = landmarks;
      return landmarks;
    });
  }

  // --- Step 4 & 5: Gemini analyses start as prerequisites finish ---
  const matchPromise = mlPromise.then(async (ml) => {
    if (!ml) return null;
    const meta = ml.processingMeta || {};
    document.querySelector('#step-extract .step-status').textContent =
      `${meta.uniquePlayersTracked || '?'} players tracked`;
    updateProgress('Executando análise de jogo com IA...', 55);
    const metadata = {
      duration: triageResult?.duration || 0,
      width: triageResult?.width || 0,
      height: triageResult?.height || 0,
    };
    return runMatchAnalysis(gcsUri, ml, metadata);
  }).catch((err) => {
    console.warn('Match analysis failed (non-fatal):', err.message);
    return null;
  });

  let techniquePromise;
  if (skipClientPose) {
    // No client-side landmarks — skip technique analysis for match videos
    techniquePromise = Promise.resolve(null);
  } else {
    techniquePromise = mediapipePromise.then(async (landmarks) => {
      updateProgress('Executando análise técnica com IA...', 65);
      const bioSummary = videoProcessor.getBiomechanicalSummary();
      const detectionSummary = videoProcessor.getDetectionSummary();
      return analyzeVideoOnServer(
        gcsUri,
        landmarks,
        'auto-detect',
        videoProcessor.getMetadata(),
        bioSummary,
        detectionSummary
      );
    }).catch((err) => {
      console.warn('Technique analysis failed (non-fatal):', err.message);
      return null;
    });
  }

  // --- Step 6: Wait for analyses ---
  setStepState('step-analyze', 'active');
  const [matchResult, techniqueResult] = await Promise.all([matchPromise, techniquePromise]);

  if (matchResult) matchAnalysisData = matchResult;
  if (techniqueResult) analysisData = techniqueResult;

  if (!matchResult && !techniqueResult) {
    throw new Error('Both match and technique analyses failed');
  }

  setStepState('step-extract', 'done');
  setStepState('step-analyze', 'done');
  updateProgress('Todas as análises concluídas!', 100);
}

async function runTriage(fileName) {
  const response = await fetch('/api/video/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Triage failed');
  }
  return (await response.json()).triage;
}

async function runMatchAnalysis(gcsUri, mlResults, metadata) {
  const response = await fetch('/api/video/match-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gcsUri, mlResults, metadata, fileName: uploadedFileName }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Match analysis failed');
  }

  const result = await response.json();
  return result.matchAnalysis || null;
}

async function uploadVideoToServer(file) {
  const formData = new FormData();
  formData.append('video', file);
  formData.append('sport', 'football');

  const response = await fetch('/api/video/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed');
  }

  return response.json();
}

async function analyzeVideoOnServer(gcsUri, landmarks, exerciseType, metadata, biomechanicalSummary, detectionSummary) {
  const response = await fetch('/api/video/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gcsUri, landmarks, exerciseType, metadata, fileName: uploadedFileName, biomechanicalSummary, detectionSummary }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Analysis failed');
  }

  const result = await response.json();
  lastRawText = result.rawText || '';
  lastGcsUri = gcsUri;
  return result.analysis;
}

async function runMlAnalysis(fileName) {
  const response = await fetch('/api/video/ml-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'ML analysis failed');
  }

  const result = await response.json();
  return result.mlResults || null;
}

// ========================================
// ANALYSIS PERSISTENCE
// ========================================

async function saveAnalysis(source, originalName, youtubeVideoId) {
  try {
    const metadata = videoProcessor ? videoProcessor.getMetadata() : {};
    const hasMatch = !!matchAnalysisData;
    const hasTechnique = !!(analysisData && analysisData.sections);
    let analysisType = 'technique';
    if (hasMatch && hasTechnique) analysisType = 'both';
    else if (hasMatch) analysisType = 'match';

    const detectionSummary = videoProcessor ? videoProcessor.getDetectionSummary() : null;

    const payload = {
      exerciseType: analysisData?.sections?.DETECTED_TECHNIQUE?.trim() || (hasMatch ? 'Análise de Jogo' : 'Detecção automática'),
      sport: 'football',
      source: source || 'upload',
      fileName: uploadedFileName || '',
      gcsUri: lastGcsUri || '',
      originalName: originalName || '',
      youtubeVideoId: youtubeVideoId || null,
      videoMetadata: metadata,
      analysis: analysisData || {},
      rawText: lastRawText || '',
      landmarks: landmarksData || [],
      mlResults: mlResultsData || null,
      detectionSummary: detectionSummary || null,
      analysisType,
      matchAnalysis: matchAnalysisData || null,
      triageResult: triageResult || null,
    };

    const response = await fetch('/api/analysis/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const result = await response.json();
      currentAnalysisId = result.analysisId;
      setUrlHash(`analysis/${result.analysisId}`);
      updateBreadcrumbs('results');
      console.log('Analysis saved:', result.analysisId);
    }
  } catch (error) {
    console.error('Failed to save analysis:', error);
  }
}

async function viewSavedAnalysis(id) {
  currentAnalysisId = id;
  setUrlHash(`analysis/${id}`);
  showSection('processing');
  setStepState('step-upload', 'done');
  document.querySelector('#step-upload .step-status').textContent = 'Salvo anteriormente';
  setStepState('step-triage', 'done');
  document.querySelector('#step-triage .step-status').textContent = 'Salvo anteriormente';
  setStepState('step-extract', 'done');
  document.querySelector('#step-extract .step-status').textContent = 'Salvo anteriormente';
  setStepState('step-analyze', 'done');
  document.querySelector('#step-analyze .step-status').textContent = 'Salvo anteriormente';
  updateProgress('Carregando análise salva...', 90);

  try {
    const response = await fetch(`/api/analysis/${id}`);
    if (!response.ok) throw new Error('Failed to load analysis');

    const data = await response.json();

    analysisData = data.analysis;
    landmarksData = data.landmarks || [];
    mlResultsData = data.mlResults || null;
    matchAnalysisData = data.matchAnalysis || null;
    uploadedFileName = data.fileName;
    lastRawText = data.rawText || '';
    lastGcsUri = data.gcsUri || '';

    // Set mode based on saved analysis type
    if (data.analysisType === 'both') {
      analysisMode = matchAnalysisData ? 'match' : 'technique';
    } else if (data.analysisType === 'match' || data.hasMatchAnalysis) {
      analysisMode = 'match';
    } else {
      analysisMode = 'technique';
    }

    updateProgress('Análise carregada!', 100);
    setTimeout(() => showResults(), 400);
  } catch (error) {
    console.error('Failed to load saved analysis:', error);
    alert('Falha ao carregar análise: ' + error.message);
    resetAll();
  }
}

// ========================================
// RESULTS & PLAYBACK
// ========================================

function showResults() {
  showSection('results');

  // Stream video from GCS via server proxy (ADC auth, no signed URLs)
  resultVideo.src = `/api/video/stream/${uploadedFileName}`;

  resultVideo.onloadedmetadata = () => {
    overlayCanvas.width = resultVideo.videoWidth;
    overlayCanvas.height = resultVideo.videoHeight;

    // Initialize overlay
    videoOverlay = new VideoOverlay(overlayCanvas);
    videoOverlay.setLandmarks(landmarksData);
    if (analysisData) {
      videoOverlay.setAnalysis(analysisData);
    }
    if (mlResultsData) {
      videoOverlay.setMlResults(mlResultsData);
    }

    // Show/hide overlay buttons based on available data
    updateOverlayButtons();

    // Enable player selection when ML data is available
    if (mlResultsData) {
      videoOverlay.enablePlayerSelection();
      videoOverlay.onPlayerSelect((trackId) => {
        highlightPlayerCard(trackId);
        showPlayerAnalyzeButton(trackId);
      });

      // Wire up the analyze player button
      const analyzePlayerBtn = document.getElementById('analyze-player-btn');
      analyzePlayerBtn.onclick = () => {
        const trackId = videoOverlay.selectedPlayerId;
        if (trackId != null) analyzePlayerTechnique(trackId);
      };

      // Wire up close panel button
      document.getElementById('close-player-panel').onclick = closePlayerAnalysisPanel;

      // Show focus mode button
      document.getElementById('focus-mode-btn').style.display = '';

      // Wire up focus mode button
      document.getElementById('focus-mode-btn').onclick = () => {
        if (focusMode) {
          stopFocusMode();
        } else {
          const trackId = videoOverlay.selectedPlayerId;
          if (trackId == null) return;
          startFocusMode(trackId);
        }
      };

      // Wire up close focus panel button
      document.getElementById('close-focus-panel').onclick = () => {
        stopFocusMode();
        const panel = document.getElementById('focus-panel');
        panel.classList.remove('visible');
        setTimeout(() => panel.classList.add('hidden'), 300);
      };

      // Default to detection overlay when we have ML data
      document.querySelectorAll('.btn-overlay').forEach((b) => b.classList.remove('active'));
      const detectionBtn = document.querySelector('.btn-overlay[data-mode="detection"]');
      if (detectionBtn) {
        detectionBtn.classList.add('active');
        videoOverlay.setOverlayMode('detection');
      }
    }

    document.getElementById('total-time').textContent = formatTime(resultVideo.duration);

    // Render temporal data charts (needs duration from video metadata)
    renderMatchCharts();
  };

  // Display analysis results based on mode
  displayResults();
}

function updateOverlayButtons() {
  const hasLandmarks = landmarksData && landmarksData.length > 0;
  const hasMlResults = !!mlResultsData;

  // Buttons that require MediaPipe landmarks
  const landmarkModes = ['skeleton', 'angles', 'paths', 'tactical'];
  // Buttons that require ML detection data
  const mlModes = ['detection'];

  document.querySelectorAll('.btn-overlay').forEach((btn) => {
    const mode = btn.dataset.mode;

    if (landmarkModes.includes(mode)) {
      btn.style.display = hasLandmarks ? '' : 'none';
    } else if (mlModes.includes(mode)) {
      btn.style.display = hasMlResults ? '' : 'none';
    }
    // 'full' and 'none' are always visible
  });
}

function displayResults() {
  const techniqueResults = document.getElementById('technique-results');
  const matchResults = document.getElementById('match-results');
  const viewTabs = document.getElementById('results-view-tabs');
  const hasBoth = !!(matchAnalysisData && analysisData);

  // Show technique results
  if (analysisData && analysisData.sections) {
    techniqueResults.classList.remove('hidden');
    const s = analysisData.sections;
    if (s.DETECTED_TECHNIQUE) {
      const header = document.querySelector('#technique-results .analysis-card:first-child h3');
      if (header) {
        header.innerHTML = `<i class="fas fa-chart-line"></i> ${escapeHtml(s.DETECTED_TECHNIQUE.trim())}`;
      }
    }
    setResultContent('result-overall', s.OVERALL_PERFORMANCE);
    setResultContent('result-form', s.FORM_QUALITY || s.PHASE_BREAKDOWN);
    setResultContent('result-moments', s.KEY_MOMENTS);
    setResultContent('result-progression', s.PROGRESSION);
    setResultContent('result-improvement', s.IMPROVEMENT_PLAN);

    // Biomechanics sections from parallel analysis
    if (s.JOINT_ANGLE_ANALYSIS || s.SYMMETRY_ASSESSMENT || s.MOVEMENT_VELOCITY || s.INJURY_RISK) {
      const bioContainer = document.getElementById('technique-results');
      const bioCards = [];
      if (s.JOINT_ANGLE_ANALYSIS) bioCards.push({ icon: 'fas fa-ruler-combined', title: 'Análise de Ângulos Articulares', content: s.JOINT_ANGLE_ANALYSIS });
      if (s.SYMMETRY_ASSESSMENT) bioCards.push({ icon: 'fas fa-balance-scale', title: 'Avaliação de Simetria', content: s.SYMMETRY_ASSESSMENT });
      if (s.MOVEMENT_VELOCITY) bioCards.push({ icon: 'fas fa-tachometer-alt', title: 'Velocidade de Movimento', content: s.MOVEMENT_VELOCITY });
      if (s.INJURY_RISK) bioCards.push({ icon: 'fas fa-exclamation-triangle', title: 'Risco de Lesão', content: s.INJURY_RISK });

      for (const card of bioCards) {
        const div = document.createElement('div');
        div.className = 'analysis-card';
        const h3 = document.createElement('h3');
        h3.innerHTML = `<i class="${card.icon}"></i> ${card.title}`;
        const content = document.createElement('div');
        content.className = 'card-content';
        content.textContent = card.content;
        div.appendChild(h3);
        div.appendChild(content);
        bioContainer.appendChild(div);
      }
    }

    // Object detection stats card (EfficientDet-Lite2)
    const detSummary = videoProcessor ? videoProcessor.getDetectionSummary() : null;
    if (detSummary && detSummary.hasObjectDetection) {
      const detDiv = document.createElement('div');
      detDiv.className = 'analysis-card';
      detDiv.innerHTML = `
        <h3><i class="fas fa-crosshairs"></i> Detecção de Objetos (EfficientDet-Lite2)</h3>
        <div class="card-content detection-stats-grid">
          <div class="det-stat">
            <span class="det-stat-value">${detSummary.ballDetectionRate}%</span>
            <span class="det-stat-label">Detecção da bola</span>
          </div>
          <div class="det-stat">
            <span class="det-stat-value">${detSummary.framesWithBall}/${detSummary.totalFrames}</span>
            <span class="det-stat-label">Quadros com bola</span>
          </div>
          <div class="det-stat">
            <span class="det-stat-value">${detSummary.avgPlayersPerFrame}</span>
            <span class="det-stat-label">Jogadores (média)</span>
          </div>
          <div class="det-stat">
            <span class="det-stat-value">${detSummary.maxPlayersDetected}</span>
            <span class="det-stat-label">Jogadores (máx)</span>
          </div>
          <div class="det-stat">
            <span class="det-stat-value">${detSummary.avgSpectatorsPerFrame}</span>
            <span class="det-stat-label">Espectadores (média)</span>
          </div>
          <div class="det-stat">
            <span class="det-stat-value">${detSummary.ballMaxVelocity}</span>
            <span class="det-stat-label">Vel. máx. bola</span>
          </div>
        </div>`;
      document.getElementById('technique-results').appendChild(detDiv);
    }
  } else {
    techniqueResults.classList.add('hidden');
  }

  // Show match results
  if (matchAnalysisData) {
    matchResults.classList.remove('hidden');
    displayMatchResults();
  } else {
    matchResults.classList.add('hidden');
  }

  // Show view tabs when both analyses are available
  if (hasBoth) {
    viewTabs.classList.remove('hidden');
    setupResultViewTabs();
    // Set primary tab based on triage
    const primaryView = analysisMode === 'match' ? 'match' : 'technique';
    switchResultView(primaryView);
  } else {
    viewTabs.classList.add('hidden');
  }
}

function setupResultViewTabs() {
  const tabs = document.querySelectorAll('.results-view-tab');
  tabs.forEach((tab) => {
    // Remove old listeners by cloning
    const newTab = tab.cloneNode(true);
    tab.parentNode.replaceChild(newTab, tab);
    newTab.addEventListener('click', () => {
      switchResultView(newTab.dataset.view);
    });
  });
}

function switchResultView(view) {
  const techniqueResults = document.getElementById('technique-results');
  const matchResults = document.getElementById('match-results');
  const tabs = document.querySelectorAll('.results-view-tab');

  tabs.forEach((t) => t.classList.toggle('active', t.dataset.view === view));

  if (view === 'match') {
    matchResults.classList.remove('hidden');
    techniqueResults.classList.add('hidden');
  } else {
    techniqueResults.classList.remove('hidden');
    matchResults.classList.add('hidden');
  }
}

function displayMatchResults() {
  if (!matchAnalysisData) return;

  // Tactical tab
  const tactical = matchAnalysisData.tactical;
  if (tactical?.sections) {
    setResultContent('match-formation', tactical.sections.FORMATION);
    setResultContent('match-attacking', tactical.sections.ATTACKING_PATTERN);
    setResultContent('match-defending', tactical.sections.DEFENDING_PATTERN);
    setResultContent('match-tactical-summary', tactical.sections.TACTICAL_SUMMARY);
  }

  // Players tab
  const playersContainer = document.getElementById('player-cards-container');
  playersContainer.innerHTML = '';
  if (matchAnalysisData.players) {
    const playerEntries = Object.entries(matchAnalysisData.players);
    // Update tab count
    const playersTab = document.querySelector('.match-tab[data-tab="players"]');
    if (playersTab) playersTab.innerHTML = `<i class="fas fa-users"></i> Jogadores (${playerEntries.length})`;

    for (const [trackId, playerData] of playerEntries) {
      const stats = mlResultsData?.playerStats?.[trackId] || {};
      const teamId = playerData.teamId ?? stats.teamId ?? -1;
      const teamName = teamId === 0 ? 'Time A' : teamId === 1 ? 'Time B' : 'Desconhecido';
      const teamClass = teamId === 0 ? 'team-a' : teamId === 1 ? 'team-b' : 'team-unknown';
      const sections = playerData.sections || {};

      const card = document.createElement('div');
      card.className = `player-card ${teamClass}`;
      card.dataset.trackId = trackId;
      card.innerHTML = `
        <div class="player-card-header">
          <span class="player-id">#${trackId}</span>
          <span class="player-team-badge ${teamClass}">${teamName}</span>
          <button class="btn btn-sm player-highlight-btn" data-track-id="${trackId}">
            <i class="fas fa-crosshairs"></i> Destacar
          </button>
        </div>
        <div class="player-card-stats">
          <span><i class="fas fa-clock"></i> ${stats.firstSeen?.toFixed(1) || '?'}s - ${stats.lastSeen?.toFixed(1) || '?'}s</span>
          <span><i class="fas fa-eye"></i> ${stats.framesVisible || 0} frames</span>
          <span><i class="fas fa-futbol"></i> ${stats.possessionFrames || 0} poss.</span>
        </div>
        ${sections.PLAYER_ROLE ? `<div class="player-card-section"><strong>Função:</strong> ${sections.PLAYER_ROLE}</div>` : ''}
        ${sections.PLAYER_ASSESSMENT ? `<div class="player-card-section"><strong>Avaliação:</strong> ${sections.PLAYER_ASSESSMENT}</div>` : ''}
        <details class="player-card-details">
          <summary>Análise Completa</summary>
          ${sections.ACTIONS_PERFORMED ? `<div class="player-card-section"><strong>Ações:</strong><br>${sections.ACTIONS_PERFORMED}</div>` : ''}
          ${sections.MOVEMENT_QUALITY ? `<div class="player-card-section"><strong>Movimentação:</strong><br>${sections.MOVEMENT_QUALITY}</div>` : ''}
        </details>
      `;
      playersContainer.appendChild(card);
    }

    // Bind highlight buttons
    playersContainer.querySelectorAll('.player-highlight-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tid = parseInt(btn.dataset.trackId);
        if (videoOverlay) {
          if (videoOverlay.selectedPlayerId === tid) {
            videoOverlay.setSelectedPlayer(null);
            highlightPlayerCard(null);
          } else {
            videoOverlay.setSelectedPlayer(tid);
            highlightPlayerCard(tid);
          }
          renderOverlayFrame();
        }
      });
    });
  }

  // Events tab
  const events = matchAnalysisData.events;
  if (events?.sections) {
    setResultContent('match-events-timeline', events.sections.EVENTS_TIMELINE);
    setResultContent('match-key-plays', events.sections.KEY_PLAYS);
    setResultContent('match-standout', events.sections.STANDOUT_MOMENTS);
  }

  // Clickable events list
  const eventsList = document.getElementById('events-list');
  eventsList.innerHTML = '';
  if (events?.timeline && events.timeline.length > 0) {
    const eventsTab = document.querySelector('.match-tab[data-tab="events"]');
    if (eventsTab) eventsTab.innerHTML = `<i class="fas fa-flag"></i> Eventos (${events.timeline.length})`;

    for (const evt of events.timeline) {
      const row = document.createElement('div');
      row.className = 'event-row';
      row.innerHTML = `
        <span class="event-time">${formatTime(evt.timestamp)}</span>
        <span class="event-desc">${escapeHtml(evt.description)}</span>
      `;
      row.addEventListener('click', () => {
        resultVideo.currentTime = evt.timestamp;
        renderOverlayFrame();
      });
      eventsList.appendChild(row);
    }

    // Event strip below video
    buildEventStrip(events.timeline);
  }

  // Possession tab
  const possession = matchAnalysisData.possession;
  if (possession?.sections) {
    setResultContent('match-possession-summary', possession.sections.POSSESSION_SUMMARY);
    setResultContent('match-possession-changes', possession.sections.POSSESSION_CHANGES);
    setResultContent('match-territorial', possession.sections.TERRITORIAL_CONTROL);
  }

  // Possession bar
  if (possession?.summary) {
    const barContainer = document.getElementById('possession-bar-container');
    barContainer.innerHTML = `
      <div class="possession-bar-wrapper">
        <div class="possession-label team-a-label">Team A: ${possession.summary.team0Pct}%</div>
        <div class="possession-bar">
          <div class="possession-fill team-a-fill" style="width: ${possession.summary.team0Pct}%"></div>
          <div class="possession-fill team-b-fill" style="width: ${possession.summary.team1Pct}%"></div>
        </div>
        <div class="possession-label team-b-label">Team B: ${possession.summary.team1Pct}%</div>
      </div>
    `;
  }
}

function renderMatchCharts() {
  if (!mlResultsData) return;

  matchCharts = new MatchCharts({
    seekVideo: (t) => {
      resultVideo.currentTime = t;
      renderOverlayFrame();
    },
    duration: resultVideo.duration || 0,
  });

  const ml = mlResultsData;
  const events = matchAnalysisData?.events;

  matchCharts.renderProcessingStats(
    document.getElementById('match-stats-dashboard'),
    { processingMeta: ml.processingMeta || null }
  );

  matchCharts.renderPitchMap(
    document.getElementById('chart-pitch-map'),
    {
      playerPaths: ml.playerPaths || null,
      playerStats: ml.playerStats || null,
      ballTrajectory: ml.ballTrajectory || null,
    }
  );

  matchCharts.renderPlayerComparison(
    document.getElementById('chart-player-comparison'),
    { playerStats: ml.playerStats || null }
  );

  matchCharts.renderEventsDistribution(
    document.getElementById('chart-events-distribution'),
    {
      keyFrames: ml.keyFrames || null,
      matchEvents: events?.timeline || null,
      passEvents: ml.passEvents || null,
      duration: resultVideo.duration || 0,
    }
  );

  matchCharts.renderPassStats(
    document.getElementById('chart-pass-stats'),
    {
      passEvents: ml.passEvents || null,
      playerStats: ml.playerStats || null,
    }
  );

  matchCharts.renderPossessionFlow(
    document.getElementById('chart-possession-flow'),
    {
      possessionTimeline: ml.possessionTimeline || null,
      duration: resultVideo.duration || 0,
    }
  );

  matchCharts.renderPlayerHeatmap(
    document.getElementById('chart-player-heatmap'),
    {
      playerPaths: ml.playerPaths || null,
      playerStats: ml.playerStats || null,
      selectedPlayerId: null,  // show all players
    }
  );

  matchCharts.renderPassNetwork(
    document.getElementById('chart-pass-network'),
    {
      passEvents: ml.passEvents || null,
      playerStats: ml.playerStats || null,
    }
  );
}

// ========================================
// ON-DEMAND PLAYER TECHNIQUE ANALYSIS
// ========================================

function showPlayerAnalyzeButton(trackId) {
  const action = document.getElementById('player-analyze-action');
  if (!action) return;
  if (trackId != null && mlResultsData) {
    action.classList.remove('hidden');
    const btn = document.getElementById('analyze-player-btn');
    if (playerAnalysisCache.has(trackId)) {
      btn.innerHTML = '<i class="fas fa-eye"></i> Ver Análise do Jogador';
    } else {
      btn.innerHTML = '<i class="fas fa-search-plus"></i> Analisar Técnica do Jogador';
    }
  } else {
    action.classList.add('hidden');
  }
}

function hidePlayerAnalyzeButton() {
  const action = document.getElementById('player-analyze-action');
  if (action) action.classList.add('hidden');
}

async function analyzePlayerTechnique(trackId) {
  // Check cache first
  if (playerAnalysisCache.has(trackId)) {
    showPlayerAnalysisPanel(trackId, playerAnalysisCache.get(trackId));
    return;
  }

  // Show panel with loading state
  const panel = document.getElementById('player-analysis-panel');
  const content = document.getElementById('panel-player-content');
  const playerIdSpan = document.getElementById('panel-player-id');
  playerIdSpan.textContent = `#${trackId}`;
  content.innerHTML = '<div class="panel-loading"><i class="fas fa-spinner fa-spin"></i> Analisando técnica do jogador...</div>';
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));

  try {
    const playerKeypoints = extractPlayerKeypoints(mlResultsData, trackId);
    const playerStats = mlResultsData.playerStats?.[trackId];

    const response = await fetch('/api/video/analyze-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gcsUri: currentGcsUri || lastGcsUri,
        fileName: uploadedFileName,
        trackId,
        teamId: playerStats?.teamId ?? -1,
        keypoints: playerKeypoints,
        stats: playerStats,
        playerPath: mlResultsData.playerPaths?.[trackId],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Player analysis failed');
    }

    const result = await response.json();
    playerAnalysisCache.set(trackId, result.analysis);
    showPlayerAnalysisPanel(trackId, result.analysis);

    // Update button text
    const btn = document.getElementById('analyze-player-btn');
    if (btn) btn.innerHTML = '<i class="fas fa-eye"></i> Ver Análise do Jogador';
  } catch (error) {
    console.error('Player technique analysis error:', error);
    content.innerHTML = `<div class="panel-loading"><i class="fas fa-exclamation-circle" style="color: var(--error)"></i> ${escapeHtml(error.message)}</div>`;
  }
}

function extractPlayerKeypoints(mlResults, trackId) {
  const keypoints = [];
  for (const frame of mlResults.detections || []) {
    for (const player of frame.players || []) {
      if (player.trackId === trackId && player.keypoints) {
        keypoints.push({
          timestamp: frame.timestamp,
          keypoints: player.keypoints,
          bbox: player.bbox,
        });
      }
    }
  }
  return keypoints;
}

function showPlayerAnalysisPanel(trackId, analysis) {
  const panel = document.getElementById('player-analysis-panel');
  const content = document.getElementById('panel-player-content');
  const playerIdSpan = document.getElementById('panel-player-id');

  playerIdSpan.textContent = `#${trackId}`;
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));

  if (!analysis || !analysis.sections) {
    content.innerHTML = '<div class="panel-loading">Nenhum dado de análise disponível.</div>';
    return;
  }

  const s = analysis.sections;
  const sectionOrder = [
    ['OVERALL_RATING', 'Avaliação Geral', 'fas fa-star'],
    ['TECHNIQUE_ASSESSMENT', 'Avaliação Técnica', 'fas fa-futbol'],
    ['PHYSICAL_ANALYSIS', 'Análise Física', 'fas fa-running'],
    ['MOVEMENT_QUALITY', 'Qualidade de Movimento', 'fas fa-route'],
    ['TACTICAL_CONTRIBUTION', 'Contribuição Tática', 'fas fa-chess'],
    ['STRENGTHS', 'Pontos Fortes', 'fas fa-thumbs-up'],
    ['AREAS_FOR_IMPROVEMENT', 'Pontos de Melhoria', 'fas fa-arrow-up'],
  ];

  let html = '';
  for (const [key, label, icon] of sectionOrder) {
    if (s[key]) {
      // Extract rating number if this is the OVERALL_RATING section
      if (key === 'OVERALL_RATING') {
        const ratingMatch = s[key].match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
        if (ratingMatch) {
          html += `<div class="analysis-section"><div class="player-rating"><i class="${icon}"></i> ${ratingMatch[1]}/10</div><p>${escapeHtml(s[key])}</p></div>`;
          continue;
        }
      }
      html += `<div class="analysis-section"><h4><i class="${icon}"></i> ${label}</h4><p>${escapeHtml(s[key])}</p></div>`;
    }
  }

  content.innerHTML = html || '<div class="panel-loading">Nenhuma seção encontrada na análise.</div>';
}

function closePlayerAnalysisPanel() {
  const panel = document.getElementById('player-analysis-panel');
  if (panel) {
    panel.classList.remove('visible');
    setTimeout(() => panel.classList.add('hidden'), 300);
  }
}

function highlightPlayerCard(trackId) {
  document.querySelectorAll('.player-card').forEach((card) => {
    if (trackId != null && card.dataset.trackId === String(trackId)) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

// ========================================
// FOCUS MODE — Progressive Player Analysis
// ========================================

function startFocusMode(trackId) {
  focusMode = true;
  focusTrackId = trackId;
  focusLastWindowEnd = resultVideo.currentTime;
  focusInsights = [];

  // Show focus panel
  const panel = document.getElementById('focus-panel');
  document.getElementById('focus-player-id').textContent = `#${trackId}`;
  document.getElementById('focus-cards').innerHTML = '';
  document.getElementById('focus-status').textContent = 'Observando...';
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('visible'));

  // Update button state
  const btn = document.getElementById('focus-mode-btn');
  btn.classList.add('active');
  btn.innerHTML = '<i class="fas fa-stop"></i> Parar Foco';

  // Start video if paused
  if (resultVideo.paused) resultVideo.play();
}

function stopFocusMode() {
  focusMode = false;
  if (focusPendingStream) {
    focusPendingStream.abort();
    focusPendingStream = null;
  }

  // Update button
  const btn = document.getElementById('focus-mode-btn');
  btn.classList.remove('active');
  btn.innerHTML = '<i class="fas fa-crosshairs"></i> Foco e Rastreio';

  document.getElementById('focus-status').textContent =
    `Completo — ${focusInsights.length} observações`;
}

async function triggerFocusAnalysis(startTime, endTime) {
  if (focusPendingStream) return;

  const windowData = extractWindowData(focusTrackId, startTime, endTime);
  if (windowData.keypoints.length === 0) {
    // Player not visible in this window, skip
    focusLastWindowEnd = endTime;
    return;
  }

  const cardId = `focus-${Date.now()}`;
  const card = createFocusCard(cardId, startTime, endTime);
  document.getElementById('focus-cards').appendChild(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'end' });

  const controller = new AbortController();
  focusPendingStream = controller;

  try {
    const response = await fetch('/api/video/focus-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        gcsUri: currentGcsUri || lastGcsUri,
        fileName: uploadedFileName,
        trackId: focusTrackId,
        teamId: windowData.teamId,
        timeWindow: { start: startTime, end: endTime },
        keypoints: windowData.keypoints,
        windowStats: windowData.stats,
        previousInsights: focusInsights.slice(-2).map((i) => i.text),
      }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // Parse SSE lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.error) throw new Error(data.error);
          if (data.done) break;
          if (data.text) {
            accumulated += data.text;
            updateFocusCardContent(cardId, accumulated);
          }
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.includes('JSON'))
            throw parseErr;
        }
      }
    }

    // Finalize
    focusInsights.push({
      id: cardId,
      timeWindow: { start: startTime, end: endTime },
      text: accumulated,
    });
    finalizeFocusCard(cardId);
    focusLastWindowEnd = endTime;
    document.getElementById('focus-status').textContent =
      `${focusInsights.length} insights — Watching...`;
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Focus stream error:', err);
      updateFocusCardContent(cardId, `Analysis failed: ${err.message}`);
      finalizeFocusCard(cardId);
      focusLastWindowEnd = endTime;
    }
  } finally {
    focusPendingStream = null;
  }
}

function extractWindowData(trackId, startTime, endTime) {
  const keypoints = [];
  let teamId = -1;
  const ballDistances = [];

  for (const frame of mlResultsData?.detections || []) {
    if (frame.timestamp < startTime || frame.timestamp > endTime) continue;
    for (const player of frame.players || []) {
      if (player.trackId !== trackId) continue;
      teamId = player.teamId ?? teamId;
      keypoints.push({
        timestamp: frame.timestamp,
        keypoints: player.keypoints,
        bbox: player.bbox,
      });
      // Ball proximity
      if (frame.ball) {
        const [bx1, by1, bx2, by2] = frame.ball.bbox;
        const ballCx = (bx1 + bx2) / 2;
        const ballCy = (by1 + by2) / 2;
        const [px1, py1, px2, py2] = player.bbox;
        const playerCx = (px1 + px2) / 2;
        const playerCy = (py1 + py2) / 2;
        ballDistances.push(Math.hypot(ballCx - playerCx, ballCy - playerCy));
      }
    }
  }

  return {
    teamId,
    keypoints,
    stats: {
      frameCount: keypoints.length,
      ballProximity:
        ballDistances.length > 0
          ? Math.min(...ballDistances).toFixed(3) + ' (closest)'
          : 'no ball data',
    },
  };
}

function createFocusCard(cardId, startTime, endTime) {
  const card = document.createElement('div');
  card.className = 'focus-card streaming';
  card.id = cardId;
  card.innerHTML = `
    <div class="focus-card-header">
      <span class="focus-time-badge">
        <i class="fas fa-clock"></i> ${formatTime(startTime)} – ${formatTime(endTime)}
      </span>
      <button class="focus-seek-btn" title="Seek to this moment">
        <i class="fas fa-play-circle"></i>
      </button>
    </div>
    <div class="focus-card-content">
      <span class="focus-typing">Analyzing...</span>
    </div>
  `;
  card.querySelector('.focus-seek-btn').addEventListener('click', () => {
    resultVideo.currentTime = startTime;
    renderOverlayFrame();
    // Highlight this card
    document.querySelectorAll('.focus-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
  });
  return card;
}

function updateFocusCardContent(cardId, text) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const content = card.querySelector('.focus-card-content');
  content.textContent = text;
}

function finalizeFocusCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.remove('streaming');
  card.classList.add('complete');
}

function buildEventStrip(timeline) {
  const strip = document.getElementById('event-strip');
  if (!timeline || timeline.length === 0) {
    strip.classList.add('hidden');
    return;
  }

  strip.classList.remove('hidden');
  strip.innerHTML = '';

  const duration = resultVideo.duration || 1;
  for (const evt of timeline) {
    const dot = document.createElement('div');
    dot.className = 'event-dot';
    dot.style.left = `${(evt.timestamp / duration) * 100}%`;
    dot.title = `${formatTime(evt.timestamp)} - ${evt.description}`;
    dot.addEventListener('click', () => {
      resultVideo.currentTime = evt.timestamp;
      renderOverlayFrame();
    });
    strip.appendChild(dot);
  }
}

function setResultContent(elementId, text) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = text || 'Dados não disponíveis';
  }
}

// Overlay rendering loop
function startOverlayLoop() {
  if (overlayAnimationId) return;
  renderLoop();
}

function stopOverlayLoop() {
  if (overlayAnimationId) {
    cancelAnimationFrame(overlayAnimationId);
    overlayAnimationId = null;
  }
}

function renderLoop() {
  renderOverlayFrame();
  if (!resultVideo.paused) {
    overlayAnimationId = requestAnimationFrame(renderLoop);
  }
}

function renderOverlayFrame() {
  if (!videoOverlay) return;
  // In match mode we may have no landmarks but still have ML data
  if (!landmarksData?.length && !mlResultsData) return;

  const activeMode = document.querySelector('.btn-overlay.active');
  if (activeMode && activeMode.dataset.mode === 'none') return;

  videoOverlay.setFrameByTime(resultVideo.currentTime);
  videoOverlay.render();
}

// Playback controls
function togglePlayPause() {
  if (resultVideo.paused) {
    resultVideo.play();
    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
  } else {
    resultVideo.pause();
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
  }
}

function handleTimelineChange(e) {
  const time = (e.target.value / 1000) * resultVideo.duration;
  resultVideo.currentTime = time;
}

function updateTimeline() {
  if (!resultVideo.duration) return;
  const value = (resultVideo.currentTime / resultVideo.duration) * 1000;
  videoTimeline.value = value;
  document.getElementById('current-time').textContent = formatTime(resultVideo.currentTime);
  if (matchCharts) matchCharts.updatePlayhead(resultVideo.currentTime);

  // Focus mode: trigger analysis when window threshold is reached
  if (focusMode && !focusPendingStream) {
    const currentTime = resultVideo.currentTime;
    if (currentTime >= focusLastWindowEnd + FOCUS_WINDOW_SECONDS) {
      triggerFocusAnalysis(focusLastWindowEnd, currentTime);
    }
  }
}

// ========================================
// DOWNLOAD & RESET
// ========================================

function downloadReport() {
  const hasMatch = !!matchAnalysisData;
  const hasTechnique = !!(analysisData && analysisData.sections);
  const report = {
    exerciseType: analysisData?.sections?.DETECTED_TECHNIQUE?.trim() || (hasMatch ? 'Análise de Jogo' : 'Detecção automática'),
    sport: 'football',
    analysisType: hasMatch && hasTechnique ? 'both' : (hasMatch ? 'match' : 'technique'),
    analysisDate: new Date().toISOString(),
    videoMetadata: videoProcessor ? videoProcessor.getMetadata() : {},
    analysis: analysisData,
    matchAnalysis: matchAnalysisData,
    landmarksCount: landmarksData ? landmarksData.length : 0,
    mlMeta: mlResultsData?.processingMeta || null,
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `analysis-football-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function resetAll() {
  stopOverlayLoop();
  currentAnalysisId = null;
  setUrlHash('');
  selectedFile = null;
  analysisData = null;
  landmarksData = null;
  uploadedFileName = null;
  videoProcessor = null;
  if (videoOverlay) {
    videoOverlay.disablePlayerSelection();
  }
  videoOverlay = null;
  selectedYouTubeVideo = null;
  lastRawText = null;
  lastGcsUri = null;
  mlResultsData = null;
  matchAnalysisData = null;
  matchCharts = null;
  analysisMode = null;
  triageResult = null;
  currentGcsUri = null;
  playerAnalysisCache.clear();
  closePlayerAnalysisPanel();
  hidePlayerAnalyzeButton();
  // Reset focus mode
  focusMode = false;
  focusTrackId = null;
  focusLastWindowEnd = 0;
  focusInsights = [];
  if (focusPendingStream) {
    focusPendingStream.abort();
    focusPendingStream = null;
  }
  const focusPanel = document.getElementById('focus-panel');
  if (focusPanel) {
    focusPanel.classList.remove('visible');
    focusPanel.classList.add('hidden');
  }
  const focusModeBtn = document.getElementById('focus-mode-btn');
  if (focusModeBtn) {
    focusModeBtn.style.display = 'none';
    focusModeBtn.classList.remove('active');
    focusModeBtn.innerHTML = '<i class="fas fa-crosshairs"></i> Foco e Rastreio';
  }
  // Hide view tabs
  const viewTabs = document.getElementById('results-view-tabs');
  if (viewTabs) viewTabs.classList.add('hidden');
  // Clear chart containers
  ['match-stats-dashboard', 'chart-pitch-map', 'chart-player-comparison',
   'chart-events-distribution', 'chart-possession-flow'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  resultVideo.src = '';
  clearFile();
  clearYouTubeSelection();
  document.getElementById('youtube-results').innerHTML = '';

  // Reset pipeline steps
  document.querySelectorAll('.pipeline-step').forEach((step) => {
    step.classList.remove('active', 'done');
    step.querySelector('.step-status').textContent = 'Aguardando...';
  });
  updateProgress('Preparando...', 0);

  showSection('upload');
}

// ========================================
// HELPERS
// ========================================

function showSection(name) {
  [uploadSection, processingSection, resultsSection].forEach((s) => s.classList.remove('active'));
  document.getElementById(`${name}-section`).classList.add('active');
  updateBreadcrumbs(name);
}

// ========================================
// URL HASH ROUTING & BREADCRUMBS
// ========================================

function handleHashRoute() {
  const hash = window.location.hash;
  const match = hash.match(/^#analysis\/(.+)$/);
  if (match) {
    const id = match[1];
    // Only load if we aren't already viewing this analysis
    if (currentAnalysisId !== id) {
      viewSavedAnalysis(id);
    }
  }
}

function setUrlHash(hash) {
  // Use replaceState to avoid polluting history on every nav
  if (hash) {
    history.pushState(null, '', `#${hash}`);
  } else {
    history.pushState(null, '', window.location.pathname);
  }
}

function updateBreadcrumbs(sectionName) {
  const breadcrumbs = document.getElementById('breadcrumbs');
  if (!breadcrumbs) return;

  let crumbs = '<a href="#" class="breadcrumb-link" data-nav="home"><i class="fas fa-home"></i> Início</a>';

  if (sectionName === 'upload') {
    // Home view — no extra crumbs, update URL
    setUrlHash('');
  } else if (sectionName === 'processing') {
    crumbs += '<span class="breadcrumb-separator">›</span>';
    crumbs += '<span class="breadcrumb-current">Processando...</span>';
  } else if (sectionName === 'results') {
    const title = analysisData?.sections?.DETECTED_TECHNIQUE?.trim() || 'Análise';
    const shortTitle = title.length > 40 ? title.substring(0, 40) + '…' : title;
    crumbs += '<span class="breadcrumb-separator">›</span>';
    crumbs += `<span class="breadcrumb-current">${escapeHtml(shortTitle)}</span>`;
    if (currentAnalysisId) {
      crumbs += `<span class="breadcrumb-separator">·</span>`;
      crumbs += `<span class="breadcrumb-id" title="${currentAnalysisId}">${currentAnalysisId.substring(0, 8)}</span>`;
    }
  }

  breadcrumbs.innerHTML = crumbs;

  // Re-bind home click
  breadcrumbs.querySelectorAll('[data-nav="home"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      currentAnalysisId = null;
      setUrlHash('');
      resetAll();
    });
  });
}

function setStepState(stepId, state) {
  const el = document.getElementById(stepId);
  el.classList.remove('active', 'done');
  el.classList.add(state);
  const status = el.querySelector('.step-status');
  if (state === 'active') status.textContent = 'Em andamento...';
  if (state === 'done') status.textContent = 'Concluído';
}

function updateProgress(stage, pct) {
  progressStage.textContent = stage;
  progressPercentage.textContent = `${Math.round(pct)}%`;
  progressFill.style.width = `${pct}%`;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Start
init();
