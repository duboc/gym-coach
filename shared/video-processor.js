// Client-side video processing with MediaPipe
// Processes uploaded videos frame-by-frame to extract pose landmarks + object detection

class VideoProcessor {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.holistic = null;
    this.objectDetector = null;
    this.landmarks = [];
    this.detections = []; // Per-frame object detections (ball, persons)
    this.currentFrame = 0;
    this.totalFrames = 0;
    this.fps = 15; // 15 FPS recommended for sports analysis
    this.processing = false;
    this._objectDetectorReady = false;
  }

  async initialize(videoElement, canvasElement) {
    this.video = videoElement;
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Initialize MediaPipe Holistic (loaded via CDN in HTML)
    this.holistic = new window.Holistic({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
    });

    this.holistic.setOptions({
      modelComplexity: 2,  // Highest accuracy for sports biomechanics
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    // Initialize MediaPipe Object Detector (EfficientDet-Lite2)
    try {
      if (window.FilesetResolver && window.ObjectDetector) {
        const vision = await window.FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
        );
        this.objectDetector = await window.ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float32/latest/efficientdet_lite2.tflite',
          },
          runningMode: 'VIDEO',
          scoreThreshold: 0.3,
          maxResults: 30, // Football: up to 22 players + ball + staff
        });
        this._objectDetectorReady = true;
        console.log('[VideoProcessor] EfficientDet-Lite2 object detector initialized');
      } else {
        console.warn('[VideoProcessor] MediaPipe Tasks Vision not loaded — object detection disabled');
      }
    } catch (err) {
      console.warn('[VideoProcessor] Object detector init failed, continuing without it:', err.message);
    }

    return new Promise((resolve) => {
      this.holistic.onResults((results) => {
        this._onResults(results);
      });
      resolve();
    });
  }

  _onResults(results) {
    if (results.poseLandmarks) {
      // Extract full 3D landmarks (x, y, z, visibility) — z = depth relative to hip
      const pose3d = results.poseLandmarks.map((lm, i) => {
        const world = results.poseWorldLandmarks?.[i];
        return {
          x: lm.x,
          y: lm.y,
          z: world?.z ?? lm.z ?? 0,  // World z gives real depth in meters
          visibility: lm.visibility ?? 0,
        };
      });

      this.landmarks.push({
        frame: this.currentFrame,
        timestamp: this.video.currentTime,
        pose: pose3d,
        leftHand: results.leftHandLandmarks || null,
        rightHand: results.rightHandLandmarks || null,
      });
    }
  }

  // Run object detection on current canvas frame
  _detectObjects(timestampMs) {
    if (!this._objectDetectorReady || !this.objectDetector) return null;

    try {
      const result = this.objectDetector.detectForVideo(this.canvas, timestampMs);
      if (!result || !result.detections) return null;

      const persons = [];
      let ball = null;

      for (const det of result.detections) {
        if (!det.categories || det.categories.length === 0) continue;
        const cat = det.categories[0];
        const bbox = det.boundingBox;

        const entry = {
          label: cat.categoryName,
          confidence: Math.round(cat.score * 1000) / 1000,
          x: bbox.originX,
          y: bbox.originY,
          width: bbox.width,
          height: bbox.height,
        };

        if (cat.categoryName === 'sports ball') {
          // Keep highest-confidence ball detection
          if (!ball || cat.score > ball.confidence) {
            ball = entry;
          }
        } else if (cat.categoryName === 'person') {
          persons.push(entry);
        }
      }

      // Classify persons as players vs spectators based on position and size
      const classifiedPersons = this._classifyPersons(persons);

      return {
        ball,
        persons: classifiedPersons,
        totalPersons: persons.length,
        playerCount: classifiedPersons.filter((p) => p.role === 'player').length,
        spectatorCount: classifiedPersons.filter((p) => p.role === 'spectator').length,
      };
    } catch (err) {
      return null;
    }
  }

  // Heuristic classification: players vs spectators
  // Players are typically: on the pitch (middle portion of frame), larger bounding boxes,
  // more consistent size. Spectators are at edges, often smaller or in dense groups.
  _classifyPersons(persons) {
    if (persons.length === 0) return [];

    // Compute normalized center-y and bbox area for each person
    const enriched = persons.map((p) => {
      const cx = (p.x + p.width / 2);
      const cy = (p.y + p.height / 2);
      const area = p.width * p.height;
      return { ...p, cx, cy, area };
    });

    // Sort by area descending — larger detections are more likely players
    const sorted = [...enriched].sort((a, b) => b.area - a.area);

    // Calculate median area for reference
    const areas = sorted.map((p) => p.area);
    const medianArea = areas[Math.floor(areas.length / 2)] || 0;

    // Pitch zone: typically the central 70% of the frame vertically
    // and the full width horizontally (camera usually frames the pitch)
    const pitchTop = 0.1;
    const pitchBottom = 0.85;

    return enriched.map((p) => {
      let role = 'player';
      const reasons = [];

      // Very small bounding box compared to median — likely spectator or distant person
      if (medianArea > 0 && p.area < medianArea * 0.15) {
        role = 'spectator';
        reasons.push('small_bbox');
      }

      // Position outside typical pitch zone
      if (p.cy < pitchTop || p.cy > pitchBottom) {
        role = 'spectator';
        reasons.push('outside_pitch');
      }

      // Very low confidence — often partial detections of crowd
      if (p.confidence < 0.35) {
        role = 'spectator';
        reasons.push('low_confidence');
      }

      // Very top of frame often has scoreboard / broadcast overlay detections
      if (p.cy < 0.05) {
        role = 'spectator';
        reasons.push('top_overlay');
      }

      return {
        ...p,
        role,
        classificationReasons: reasons,
      };
    });
  }

  async processVideo(videoFile, progressCallback, completeCallback) {
    this.landmarks = [];
    this.detections = [];
    this.currentFrame = 0;
    this.processing = true;

    const videoUrl = URL.createObjectURL(videoFile);
    this.video.src = videoUrl;

    return new Promise((resolve, reject) => {
      this.video.onloadedmetadata = async () => {
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        this.totalFrames = Math.floor(this.video.duration * this.fps);

        try {
          await this._processFrames(progressCallback);
          if (completeCallback) completeCallback(this.landmarks);
          resolve(this.landmarks);
        } catch (error) {
          reject(error);
        } finally {
          this.processing = false;
          URL.revokeObjectURL(videoUrl);
        }
      };

      this.video.onerror = () => {
        this.processing = false;
        reject(new Error('Failed to load video'));
      };
    });
  }

  async _processFrames(progressCallback) {
    const frameInterval = 1 / this.fps;

    for (let time = 0; time < this.video.duration; time += frameInterval) {
      if (!this.processing) break;

      this.video.currentTime = time;
      await this._waitForSeek();

      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

      // Run pose detection
      await this.holistic.send({ image: this.canvas });

      // Run object detection in parallel (ball + persons)
      const timestampMs = Math.round(time * 1000);
      const frameDetections = this._detectObjects(timestampMs);
      if (frameDetections) {
        frameDetections.frame = this.currentFrame;
        frameDetections.timestamp = time;
        this.detections.push(frameDetections);
      }

      this.currentFrame++;

      if (progressCallback) {
        const progress = (this.currentFrame / this.totalFrames) * 100;
        progressCallback(Math.min(progress, 100), this.currentFrame, this.totalFrames);
      }
    }
  }

  _waitForSeek() {
    return new Promise((resolve) => {
      const onSeeked = () => {
        this.video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      this.video.addEventListener('seeked', onSeeked);
    });
  }

  stop() {
    this.processing = false;
  }

  getLandmarks() {
    return this.landmarks;
  }

  getDetections() {
    return this.detections;
  }

  // Build a detection summary for AI analysis
  getDetectionSummary() {
    if (!this.detections || this.detections.length === 0) return null;

    const ballFrames = this.detections.filter((d) => d.ball);
    const playerCounts = this.detections.map((d) => d.playerCount);
    const spectatorCounts = this.detections.map((d) => d.spectatorCount);

    // Ball trajectory — sample up to 20 positions
    const ballPositions = ballFrames
      .filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 20)) === 0)
      .slice(0, 20)
      .map((d) => ({
        timestamp: Math.round(d.timestamp * 10) / 10,
        x: Math.round(d.ball.x * 1000) / 1000,
        y: Math.round(d.ball.y * 1000) / 1000,
        confidence: d.ball.confidence,
      }));

    // Ball velocity between consecutive detections
    const ballVelocities = [];
    for (let i = 1; i < ballFrames.length; i++) {
      const prev = ballFrames[i - 1];
      const curr = ballFrames[i];
      const dt = curr.timestamp - prev.timestamp;
      if (dt <= 0) continue;
      const dx = curr.ball.x - prev.ball.x;
      const dy = curr.ball.y - prev.ball.y;
      ballVelocities.push(Math.sqrt(dx * dx + dy * dy) / dt);
    }

    const avgPlayers = playerCounts.length > 0
      ? Math.round(playerCounts.reduce((a, b) => a + b, 0) / playerCounts.length)
      : 0;
    const maxPlayers = playerCounts.length > 0 ? Math.max(...playerCounts) : 0;

    return {
      framesWithBall: ballFrames.length,
      totalFrames: this.detections.length,
      ballDetectionRate: Math.round((ballFrames.length / this.detections.length) * 100),
      ballTrajectory: ballPositions,
      ballMaxVelocity: ballVelocities.length > 0 ? Math.round(Math.max(...ballVelocities) * 1000) / 1000 : 0,
      ballAvgVelocity: ballVelocities.length > 0 ? Math.round((ballVelocities.reduce((a, b) => a + b, 0) / ballVelocities.length) * 1000) / 1000 : 0,
      avgPlayersPerFrame: avgPlayers,
      maxPlayersDetected: maxPlayers,
      avgSpectatorsPerFrame: spectatorCounts.length > 0
        ? Math.round(spectatorCounts.reduce((a, b) => a + b, 0) / spectatorCounts.length)
        : 0,
      hasObjectDetection: true,
    };
  }

  getMetadata() {
    return {
      duration: this.video ? this.video.duration : 0,
      fps: this.fps,
      totalFrames: this.totalFrames,
      landmarksCount: this.landmarks.length,
      detectionsCount: this.detections.length,
      width: this.canvas ? this.canvas.width : 0,
      height: this.canvas ? this.canvas.height : 0,
      hasObjectDetection: this._objectDetectorReady,
    };
  }

  // Build a structured biomechanical summary from landmarks for AI analysis
  getBiomechanicalSummary() {
    if (!this.landmarks || this.landmarks.length === 0) return null;

    const _angle = (pose, a, b, c) => {
      const pA = pose[a], pB = pose[b], pC = pose[c];
      if (!pA || !pB || !pC) return null;
      if ((pA.visibility || 0) < 0.3 || (pB.visibility || 0) < 0.3 || (pC.visibility || 0) < 0.3) return null;
      const ab = { x: pA.x - pB.x, y: pA.y - pB.y };
      const cb = { x: pC.x - pB.x, y: pC.y - pB.y };
      const dot = ab.x * cb.x + ab.y * cb.y;
      const magAB = Math.sqrt(ab.x * ab.x + ab.y * ab.y);
      const magCB = Math.sqrt(cb.x * cb.x + cb.y * cb.y);
      if (magAB === 0 || magCB === 0) return null;
      return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / (magAB * magCB)))) * (180 / Math.PI));
    };

    const angleConfigs = [
      { name: 'rightElbow', points: [12, 14, 16] },
      { name: 'leftElbow', points: [11, 13, 15] },
      { name: 'rightKnee', points: [24, 26, 28] },
      { name: 'leftKnee', points: [23, 25, 27] },
      { name: 'rightHip', points: [12, 24, 26] },
      { name: 'leftHip', points: [11, 23, 25] },
      { name: 'rightShoulder', points: [14, 12, 24] },
      { name: 'leftShoulder', points: [13, 11, 23] },
      { name: 'rightAnkle', points: [26, 28, 32] },
      { name: 'leftAnkle', points: [25, 27, 31] },
      { name: 'trunkLean', points: [11, 23, 25] },  // shoulder-hip-knee for trunk
    ];

    // Sample key frames: first, quarter marks, and last
    const n = this.landmarks.length;
    const sampleIndices = [
      0,
      Math.floor(n * 0.25),
      Math.floor(n * 0.5),
      Math.floor(n * 0.75),
      n - 1,
    ].filter((v, i, a) => a.indexOf(v) === i);

    const keyFrameAngles = sampleIndices.map((idx) => {
      const frame = this.landmarks[idx];
      const angles = {};
      for (const ac of angleConfigs) {
        const val = _angle(frame.pose, ac.points[0], ac.points[1], ac.points[2]);
        if (val !== null) angles[ac.name] = val;
      }
      return { timestamp: Math.round(frame.timestamp * 10) / 10, angles };
    });

    // Compute movement velocity from key body points (hips, wrists, ankles)
    const velocityPoints = [23, 24, 15, 16, 27, 28]; // hips, wrists, ankles
    const pointNames = ['leftHip', 'rightHip', 'leftWrist', 'rightWrist', 'leftAnkle', 'rightAnkle'];
    const maxVelocities = {};
    const avgVelocities = {};

    for (let p = 0; p < velocityPoints.length; p++) {
      const idx = velocityPoints[p];
      const name = pointNames[p];
      const vels = [];
      for (let i = 1; i < this.landmarks.length; i++) {
        const prev = this.landmarks[i - 1].pose[idx];
        const curr = this.landmarks[i].pose[idx];
        if (!prev || !curr || (prev.visibility || 0) < 0.3 || (curr.visibility || 0) < 0.3) continue;
        const dt = this.landmarks[i].timestamp - this.landmarks[i - 1].timestamp;
        if (dt <= 0) continue;
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const vel = Math.sqrt(dx * dx + dy * dy) / dt; // normalized units/sec
        vels.push(vel);
      }
      if (vels.length > 0) {
        maxVelocities[name] = Math.round(Math.max(...vels) * 1000) / 1000;
        avgVelocities[name] = Math.round((vels.reduce((a, b) => a + b, 0) / vels.length) * 1000) / 1000;
      }
    }

    // Compute body symmetry: compare left vs right angles at each frame
    const symmetryPairs = [
      ['leftElbow', 'rightElbow'],
      ['leftKnee', 'rightKnee'],
      ['leftHip', 'rightHip'],
      ['leftShoulder', 'rightShoulder'],
    ];
    const symmetryDiffs = {};
    for (const [left, right] of symmetryPairs) {
      const diffs = [];
      for (const kf of keyFrameAngles) {
        if (kf.angles[left] != null && kf.angles[right] != null) {
          diffs.push(Math.abs(kf.angles[left] - kf.angles[right]));
        }
      }
      if (diffs.length > 0) {
        symmetryDiffs[`${left.replace('left', '')}Symmetry`] =
          Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length);
      }
    }

    // Average landmark confidence across all frames
    const visibilityStats = {};
    const bodyParts = {
      face: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      upperBody: [11, 12, 13, 14, 15, 16],
      lowerBody: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32],
    };
    for (const [part, indices] of Object.entries(bodyParts)) {
      const allVis = [];
      for (const frame of this.landmarks) {
        for (const idx of indices) {
          if (frame.pose[idx]) allVis.push(frame.pose[idx].visibility || 0);
        }
      }
      if (allVis.length > 0) {
        visibilityStats[part] = Math.round((allVis.reduce((a, b) => a + b, 0) / allVis.length) * 100);
      }
    }

    return {
      keyFrameAngles,
      maxVelocities,
      avgVelocities,
      symmetryDiffs,
      visibilityStats,
      hasHands: this.landmarks.some((f) => f.leftHand || f.rightHand),
      has3dDepth: this.landmarks.some((f) => f.pose[0]?.z !== 0),
    };
  }
}

export default VideoProcessor;
