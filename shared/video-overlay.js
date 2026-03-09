// Advanced overlay system for video analysis playback
// Supports multiple visualization modes: skeleton, angles, paths, tactical, full
// Includes: timestamp-based sync, comet-trail trajectories, color-coded angles,
// form quality timeline, and body schematic minimap

import { calculateAngle } from './pose-utils.js';

class VideoOverlay {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.analysis = null;
    this.landmarks = [];
    this.currentFrame = 0;
    this.currentTime = 0;
    this.overlayMode = 'skeleton';
    this.movementPaths = {
      leftWrist: [], rightWrist: [],
      leftAnkle: [], rightAnkle: [],
    };
    this.maxPathLength = 30; // 2 seconds at 15fps

    // Pre-computed form timeline (quality per frame)
    this.formTimeline = [];

    // ML detection data (YOLOv8 + team clustering + tracking)
    this.mlResults = null;

    // Player selection state
    this.selectedPlayerId = null;
    this._onPlayerSelect = null; // external callback
    this._playerSelectionEnabled = false;

    // Team colors for ML detections
    this.teamColors = [
      'rgba(255, 58, 94, 0.8)',   // Team 0: red
      'rgba(58, 134, 255, 0.8)',  // Team 1: blue
    ];
    this.teamColorsRgb = [
      [255, 58, 94],
      [58, 134, 255],
    ];
    this.ballColor = 'rgba(255, 215, 0, 0.9)';
    this.unknownTeamColor = 'rgba(180, 180, 180, 0.6)';
    this.selectedHighlightColor = 'rgba(255, 215, 0, 0.9)';

    this.colors = {
      skeleton: '#30c39e',
      joints: '#3a86ff',
      angles: '#ffc107',
      pathLeft: 'rgba(255, 58, 94, 0.8)',
      pathRight: 'rgba(58, 134, 255, 0.8)',
      good: '#30c39e',
      warning: '#ffc107',
      error: '#ff3a5e',
      hud: 'rgba(0, 0, 0, 0.7)',
    };

    // Estimated keypoint positions within a bbox (proportional: [xRatio, yRatio])
    // Based on standard human body proportions for standing/running pose
    // 0:head, 1:neck, 2:rShoulder, 3:lShoulder, 4:rElbow, 5:lElbow,
    // 6:rWrist, 7:lWrist, 8:rHip, 9:lHip, 10:rKnee, 11:lKnee, 12:rAnkle, 13:lAnkle
    this.estimatedKeypoints = [
      [0.50, 0.08], // 0: head
      [0.50, 0.18], // 1: neck
      [0.38, 0.22], // 2: right shoulder
      [0.62, 0.22], // 3: left shoulder
      [0.30, 0.38], // 4: right elbow
      [0.70, 0.38], // 5: left elbow
      [0.26, 0.50], // 6: right wrist
      [0.74, 0.50], // 7: left wrist
      [0.40, 0.52], // 8: right hip
      [0.60, 0.52], // 9: left hip
      [0.38, 0.72], // 10: right knee
      [0.62, 0.72], // 11: left knee
      [0.36, 0.94], // 12: right ankle
      [0.64, 0.94], // 13: left ankle
    ];

    // Skeleton connections for estimated keypoints
    this.estimatedConnections = [
      [0, 1],   // head -> neck
      [1, 2],   // neck -> rShoulder
      [1, 3],   // neck -> lShoulder
      [2, 4],   // rShoulder -> rElbow
      [4, 6],   // rElbow -> rWrist
      [3, 5],   // lShoulder -> lElbow
      [5, 7],   // lElbow -> lWrist
      [2, 8],   // rShoulder -> rHip
      [3, 9],   // lShoulder -> lHip
      [8, 9],   // rHip -> lHip
      [8, 10],  // rHip -> rKnee
      [10, 12], // rKnee -> rAnkle
      [9, 11],  // lHip -> lKnee
      [11, 13], // lKnee -> lAnkle
    ];

    // MediaPipe pose connection pairs
    this.connections = [
      [11, 12], [11, 23], [12, 24], [23, 24], // torso
      [12, 14], [14, 16],                       // right arm
      [11, 13], [13, 15],                       // left arm
      [24, 26], [26, 28],                       // right leg
      [23, 25], [25, 27],                       // left leg
      [28, 30], [28, 32],                       // right foot
      [27, 29], [27, 31],                       // left foot
    ];

    // Key angles to display with ideal ranges for color-coding
    this.angleDefinitions = [
      { name: 'R.Elbow', points: [12, 14, 16], idealRange: [30, 160] },
      { name: 'L.Elbow', points: [11, 13, 15], idealRange: [30, 160] },
      { name: 'R.Knee', points: [24, 26, 28], idealRange: [60, 170] },
      { name: 'L.Knee', points: [23, 25, 27], idealRange: [60, 170] },
      { name: 'R.Hip', points: [12, 24, 26], idealRange: [80, 170] },
      { name: 'L.Hip', points: [11, 23, 25], idealRange: [80, 170] },
    ];
  }

  setAnalysis(analysis) {
    this.analysis = analysis;
  }

  setLandmarks(landmarks) {
    this.landmarks = landmarks;
    this._computeFormTimeline();
  }

  setFrame(frameNumber) {
    this.currentFrame = frameNumber;
  }

  // Binary search to find the closest frame by timestamp
  findFrameByTime(time) {
    if (!this.landmarks || this.landmarks.length === 0) return 0;

    let lo = 0;
    let hi = this.landmarks.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const midTime = this.landmarks[mid].timestamp || 0;
      if (midTime < time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // Check if the previous frame is closer
    if (lo > 0) {
      const prevDiff = Math.abs((this.landmarks[lo - 1].timestamp || 0) - time);
      const currDiff = Math.abs((this.landmarks[lo].timestamp || 0) - time);
      if (prevDiff < currDiff) return lo - 1;
    }

    return lo;
  }

  // Convenience: set frame by video time using binary search
  setFrameByTime(time) {
    this.currentTime = time;
    this.currentFrame = this.findFrameByTime(time);
  }

  setMlResults(mlResults) {
    this.mlResults = mlResults;
  }

  setSelectedPlayer(trackId) {
    this.selectedPlayerId = trackId;
  }

  onPlayerSelect(callback) {
    this._onPlayerSelect = callback;
  }

  // Enable click-to-select on overlay canvas for detection mode
  enablePlayerSelection() {
    this._playerSelectionEnabled = true;
    this.canvas.style.cursor = 'pointer';
    // Only enable pointer-events if current mode needs it
    const needsPointer = this.overlayMode === 'detection' || this.overlayMode === 'full';
    this.canvas.style.pointerEvents = needsPointer ? 'auto' : 'none';
    this.canvas.addEventListener('click', (e) => this._handleCanvasClick(e));
  }

  disablePlayerSelection() {
    this._playerSelectionEnabled = false;
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.cursor = 'default';
  }

  _handleCanvasClick(e) {
    if (!this.mlResults) return;

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX / this.canvas.width;
    const clickY = (e.clientY - rect.top) * scaleY / this.canvas.height;

    // Find which ML frame we're on
    const currentTime = this._getCurrentTime();
    const mlFrame = this.findMlFrameInterpolated(currentTime);
    if (!mlFrame || !mlFrame.players) return;

    // Check if click is inside any player bbox
    for (const player of mlFrame.players) {
      const [x1, y1, x2, y2] = player.bbox;
      if (clickX >= x1 && clickX <= x2 && clickY >= y1 && clickY <= y2) {
        const trackId = player.trackId;
        if (trackId != null && trackId >= 0) {
          // Toggle selection
          if (this.selectedPlayerId === trackId) {
            this.selectedPlayerId = null;
          } else {
            this.selectedPlayerId = trackId;
          }
          if (this._onPlayerSelect) {
            this._onPlayerSelect(this.selectedPlayerId);
          }
          this.render();
          return;
        }
      }
    }

    // Clicked outside any player — deselect
    this.selectedPlayerId = null;
    if (this._onPlayerSelect) {
      this._onPlayerSelect(null);
    }
    this.render();
  }

  _getCurrentTime() {
    if (this.landmarks && this.currentFrame < this.landmarks.length) {
      return this.landmarks[this.currentFrame]?.timestamp || this.currentTime;
    }
    return this.currentTime;
  }

  // Binary search on ML detection timestamps
  findMlFrameByTime(time) {
    if (!this.mlResults || !this.mlResults.detections || this.mlResults.detections.length === 0) {
      return null;
    }

    const dets = this.mlResults.detections;
    let lo = 0;
    let hi = dets.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((dets[mid].timestamp || 0) < time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo > 0) {
      const prevDiff = Math.abs((dets[lo - 1].timestamp || 0) - time);
      const currDiff = Math.abs((dets[lo].timestamp || 0) - time);
      if (prevDiff < currDiff) return dets[lo - 1];
    }

    return dets[lo];
  }

  // Interpolate between two ML keyframes for smooth bbox transitions
  findMlFrameInterpolated(time) {
    if (!this.mlResults || !this.mlResults.detections || this.mlResults.detections.length === 0) {
      return null;
    }

    const dets = this.mlResults.detections;

    // Find the two frames bracketing `time`
    let lo = 0;
    let hi = dets.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((dets[mid].timestamp || 0) < time) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    // lo is the first frame at or after `time`
    const afterIdx = lo;
    const beforeIdx = lo > 0 ? lo - 1 : 0;

    const before = dets[beforeIdx];
    const after = dets[afterIdx];

    // If same frame or at exact boundary, return as-is
    if (beforeIdx === afterIdx || !before || !after) {
      return dets[Math.min(afterIdx, dets.length - 1)];
    }

    const t0 = before.timestamp || 0;
    const t1 = after.timestamp || 0;
    if (t1 <= t0) return before;

    const t = Math.max(0, Math.min(1, (time - t0) / (t1 - t0)));

    // Lerp helper for bbox arrays
    const lerpBbox = (a, b) => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
      a[3] + (b[3] - a[3]) * t,
    ];

    // Interpolate players by trackId
    const interpolatedPlayers = [];
    const afterPlayersMap = {};
    if (after.players) {
      for (const p of after.players) {
        if (p.trackId != null && p.trackId >= 0) afterPlayersMap[p.trackId] = p;
      }
    }

    const seenTrackIds = new Set();
    if (before.players) {
      for (const p of before.players) {
        const tid = p.trackId;
        if (tid != null && tid >= 0 && afterPlayersMap[tid]) {
          // Present in both frames — lerp
          seenTrackIds.add(tid);
          const afterP = afterPlayersMap[tid];
          const lerped = {
            ...p,
            bbox: lerpBbox(p.bbox, afterP.bbox),
          };
          // Lerp keypoints if both frames have them
          if (p.keypoints && afterP.keypoints && p.keypoints.length === afterP.keypoints.length) {
            lerped.keypoints = p.keypoints.map((kp, i) => [
              kp[0] + (afterP.keypoints[i][0] - kp[0]) * t,
              kp[1] + (afterP.keypoints[i][1] - kp[1]) * t,
              Math.min(kp[2] || 1, afterP.keypoints[i][2] || 1),
            ]);
          }
          interpolatedPlayers.push(lerped);
        } else {
          // Only in before frame — use as-is (will fade out naturally)
          interpolatedPlayers.push(p);
          if (tid != null) seenTrackIds.add(tid);
        }
      }
    }

    // Add players only in after frame
    if (after.players) {
      for (const p of after.players) {
        if (p.trackId != null && !seenTrackIds.has(p.trackId)) {
          interpolatedPlayers.push(p);
        }
      }
    }

    // Interpolate ball
    let interpolatedBall = null;
    if (before.ball && after.ball) {
      interpolatedBall = {
        ...before.ball,
        bbox: lerpBbox(before.ball.bbox, after.ball.bbox),
      };
    } else {
      interpolatedBall = before.ball || after.ball || null;
    }

    return {
      timestamp: time,
      players: interpolatedPlayers,
      ball: interpolatedBall,
      referees: before.referees || [],
    };
  }

  setOverlayMode(mode) {
    this.overlayMode = mode;
    if (mode !== 'paths' && mode !== 'full') {
      this.movementPaths = {
        leftWrist: [], rightWrist: [],
        leftAnkle: [], rightAnkle: [],
      };
    }
    // Toggle pointer-events: only detection/full need click-through for player selection
    if (this._playerSelectionEnabled) {
      this.canvas.style.pointerEvents =
        (mode === 'detection' || mode === 'full') ? 'auto' : 'none';
    }
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const hasLandmarks = this.landmarks && this.currentFrame < this.landmarks.length;
    const frame = hasLandmarks ? this.landmarks[this.currentFrame] : null;
    const pose = frame && frame.pose ? frame.pose : null;

    // Get current ML detection frame by timestamp (interpolated for smooth bboxes)
    // Use stored currentTime (set by setFrameByTime) for when there are no landmarks
    const currentTime = frame ? (frame.timestamp || 0) : this.currentTime;
    const mlFrame = this.findMlFrameInterpolated(currentTime);

    switch (this.overlayMode) {
      case 'skeleton':
        if (pose) this._drawSkeleton(pose);
        break;
      case 'angles':
        if (pose) {
          this._drawSkeleton(pose);
          this._drawJointAngles(pose);
        }
        break;
      case 'paths':
        if (pose) {
          this._updateMovementPaths(pose);
          this._drawMovementPaths();
          this._drawSkeleton(pose);
        }
        break;
      case 'tactical':
        if (pose) {
          this._drawSkeleton(pose);
          this._drawFormIndicators(pose);
          this._drawMinimap(pose);
        }
        break;
      case 'detection':
        this._drawFormationLines(mlFrame);
        this._drawMlDetections(mlFrame);
        this._drawPlayerSkeletons(mlFrame);
        this._drawPlayerTrails(currentTime);
        this._drawBallTrail(currentTime);
        this._drawTeamLegend();
        this._drawPossessionIndicator(currentTime);
        break;
      case 'full':
        if (pose) {
          this._updateMovementPaths(pose);
          this._drawMovementPaths();
          this._drawSkeleton(pose);
          this._drawJointAngles(pose);
          this._drawFormIndicators(pose);
        }
        this._drawFormationLines(mlFrame);
        this._drawMlDetections(mlFrame);
        this._drawPlayerSkeletons(mlFrame);
        this._drawPlayerTrails(currentTime);
        this._drawBallTrail(currentTime);
        this._drawTeamLegend();
        this._drawPossessionIndicator(currentTime);
        if (pose) this._drawMinimap(pose);
        break;
    }

    this._drawFormTimeline();
    if (hasLandmarks || this.mlResults) this._drawTimestamp();
  }

  _drawSkeleton(pose) {
    this.ctx.save();

    // Draw connections
    this.ctx.strokeStyle = this.colors.skeleton;
    this.ctx.lineWidth = 3;
    this.ctx.lineCap = 'round';

    for (const [start, end] of this.connections) {
      if (pose[start] && pose[end] &&
          pose[start].visibility > 0.3 && pose[end].visibility > 0.3) {
        this.ctx.beginPath();
        this.ctx.moveTo(
          pose[start].x * this.canvas.width,
          pose[start].y * this.canvas.height
        );
        this.ctx.lineTo(
          pose[end].x * this.canvas.width,
          pose[end].y * this.canvas.height
        );
        this.ctx.stroke();
      }
    }

    // Draw joint dots
    this.ctx.fillStyle = this.colors.joints;
    for (let i = 11; i < 33; i++) { // skip face landmarks (0-10)
      if (pose[i] && pose[i].visibility > 0.3) {
        this.ctx.beginPath();
        this.ctx.arc(
          pose[i].x * this.canvas.width,
          pose[i].y * this.canvas.height,
          5, 0, 2 * Math.PI
        );
        this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  _getAngleColor(angle, idealRange) {
    const [min, max] = idealRange;
    const warningMargin = 15;

    if (angle >= min && angle <= max) {
      return this.colors.good;
    } else if (angle >= min - warningMargin && angle <= max + warningMargin) {
      return this.colors.warning;
    }
    return this.colors.error;
  }

  _drawJointAngles(pose) {
    this.ctx.save();
    this.ctx.font = 'bold 13px Arial';
    this.ctx.textBaseline = 'middle';

    for (const { name, points, idealRange } of this.angleDefinitions) {
      const [a, b, c] = points;
      if (!pose[a] || !pose[b] || !pose[c]) continue;
      if (pose[a].visibility < 0.3 || pose[b].visibility < 0.3 || pose[c].visibility < 0.3) continue;

      const angle = calculateAngle(pose[a], pose[b], pose[c]);
      const bx = pose[b].x * this.canvas.width;
      const by = pose[b].y * this.canvas.height;
      const angleColor = this._getAngleColor(angle, idealRange);

      // Draw angle arc
      const radius = 20;
      const startAngle = Math.atan2(
        pose[a].y * this.canvas.height - by,
        pose[a].x * this.canvas.width - bx
      );
      const endAngle = Math.atan2(
        pose[c].y * this.canvas.height - by,
        pose[c].x * this.canvas.width - bx
      );

      this.ctx.strokeStyle = angleColor;
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.arc(bx, by, radius, startAngle, endAngle);
      this.ctx.stroke();

      // Draw label background
      const labelX = bx + 18;
      const labelY = by - 14;
      const label = `${Math.round(angle)}°`;
      const textWidth = this.ctx.measureText(label).width;

      this.ctx.fillStyle = this.colors.hud;
      this.ctx.fillRect(labelX - 2, labelY - 9, textWidth + 4, 18);

      this.ctx.fillStyle = angleColor;
      this.ctx.fillText(label, labelX, labelY);
    }

    this.ctx.restore();
  }

  _updateMovementPaths(pose) {
    // Track wrist positions (15=left wrist, 16=right wrist)
    if (pose[15] && pose[15].visibility > 0.3) {
      this.movementPaths.leftWrist.push({ x: pose[15].x, y: pose[15].y });
      if (this.movementPaths.leftWrist.length > this.maxPathLength) {
        this.movementPaths.leftWrist.shift();
      }
    }
    if (pose[16] && pose[16].visibility > 0.3) {
      this.movementPaths.rightWrist.push({ x: pose[16].x, y: pose[16].y });
      if (this.movementPaths.rightWrist.length > this.maxPathLength) {
        this.movementPaths.rightWrist.shift();
      }
    }
    // Track ankle positions (27=left ankle, 28=right ankle)
    if (pose[27] && pose[27].visibility > 0.3) {
      this.movementPaths.leftAnkle.push({ x: pose[27].x, y: pose[27].y });
      if (this.movementPaths.leftAnkle.length > this.maxPathLength) {
        this.movementPaths.leftAnkle.shift();
      }
    }
    if (pose[28] && pose[28].visibility > 0.3) {
      this.movementPaths.rightAnkle.push({ x: pose[28].x, y: pose[28].y });
      if (this.movementPaths.rightAnkle.length > this.maxPathLength) {
        this.movementPaths.rightAnkle.shift();
      }
    }
  }

  _drawMovementPaths() {
    this.ctx.save();

    // Left side (wrist + ankle) — red comet trails
    this._drawCometTrail(this.movementPaths.leftWrist, 255, 58, 94);
    this._drawCometTrail(this.movementPaths.leftAnkle, 255, 100, 130);

    // Right side (wrist + ankle) — blue comet trails
    this._drawCometTrail(this.movementPaths.rightWrist, 58, 134, 255);
    this._drawCometTrail(this.movementPaths.rightAnkle, 80, 160, 255);

    this.ctx.restore();
  }

  _drawCometTrail(points, r, g, b) {
    if (!points || points.length < 2) return;

    const len = points.length;
    for (let i = 0; i < len; i++) {
      const t = i / (len - 1); // 0 = oldest, 1 = newest
      const alpha = 0.1 + t * 0.8; // alpha gradient: 0.1 -> 0.9
      const radius = 2 + t * 6; // dot size: 2px -> 8px

      this.ctx.beginPath();
      this.ctx.arc(
        points[i].x * this.canvas.width,
        points[i].y * this.canvas.height,
        radius, 0, 2 * Math.PI
      );
      this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      this.ctx.fill();
    }
  }

  _drawFormIndicators(pose) {
    if (!this.analysis || !this.analysis.sections) return;

    // Draw a form quality badge
    const quality = this._estimateFrameQuality(pose);
    const badgeColor = quality === 'good' ? this.colors.good
      : quality === 'warning' ? this.colors.warning
      : this.colors.error;

    this.ctx.save();
    this.ctx.fillStyle = this.colors.hud;
    this.ctx.fillRect(this.canvas.width - 150, 20, 130, 35);
    this.ctx.fillStyle = badgeColor;
    this.ctx.font = 'bold 14px Arial';
    this.ctx.fillText(`Form: ${quality}`, this.canvas.width - 140, 42);
    this.ctx.restore();
  }

  _estimateFrameQuality(pose) {
    if (!pose[11] || !pose[12] || !pose[23] || !pose[24]) return 'warning';

    let score = 0;
    let checks = 0;

    // Check shoulder alignment
    const shoulderDiff = Math.abs(pose[11].y - pose[12].y);
    checks++;
    if (shoulderDiff < 0.04) score++;
    else if (shoulderDiff < 0.08) score += 0.5;

    // Check hip alignment
    const hipDiff = Math.abs(pose[23].y - pose[24].y);
    checks++;
    if (hipDiff < 0.04) score++;
    else if (hipDiff < 0.08) score += 0.5;

    // Check key angles against ideal ranges
    for (const { points, idealRange } of this.angleDefinitions) {
      const [a, b, c] = points;
      if (!pose[a] || !pose[b] || !pose[c]) continue;
      if (pose[a].visibility < 0.3 || pose[b].visibility < 0.3 || pose[c].visibility < 0.3) continue;

      const angle = calculateAngle(pose[a], pose[b], pose[c]);
      const color = this._getAngleColor(angle, idealRange);
      checks++;
      if (color === this.colors.good) score++;
      else if (color === this.colors.warning) score += 0.5;
    }

    const ratio = checks > 0 ? score / checks : 0;
    if (ratio >= 0.7) return 'good';
    if (ratio >= 0.4) return 'warning';
    return 'error';
  }

  // Pre-compute form quality for every frame (called once when landmarks are set)
  _computeFormTimeline() {
    this.formTimeline = [];
    if (!this.landmarks || this.landmarks.length === 0) return;

    for (const frame of this.landmarks) {
      if (!frame || !frame.pose) {
        this.formTimeline.push('warning');
        continue;
      }
      this.formTimeline.push(this._estimateFrameQuality(frame.pose));
    }
  }

  // Draw a horizontal color bar at the bottom showing form quality over time
  _drawFormTimeline() {
    if (!this.formTimeline || this.formTimeline.length === 0) return;

    const barHeight = 8;
    const barY = this.canvas.height - barHeight;
    const barWidth = this.canvas.width;
    const segmentWidth = barWidth / this.formTimeline.length;

    this.ctx.save();

    // Draw segments
    for (let i = 0; i < this.formTimeline.length; i++) {
      const q = this.formTimeline[i];
      this.ctx.fillStyle = q === 'good' ? this.colors.good
        : q === 'warning' ? this.colors.warning
        : this.colors.error;
      this.ctx.fillRect(i * segmentWidth, barY, Math.ceil(segmentWidth) + 1, barHeight);
    }

    // Draw playhead marker
    const playheadX = (this.currentFrame / this.formTimeline.length) * barWidth;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(playheadX - 1.5, barY - 3, 3, barHeight + 6);

    // Small triangle above playhead
    this.ctx.beginPath();
    this.ctx.moveTo(playheadX - 4, barY - 3);
    this.ctx.lineTo(playheadX + 4, barY - 3);
    this.ctx.lineTo(playheadX, barY - 7);
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  // Body schematic minimap — normalized stick figure in bottom-right corner
  _drawMinimap(pose) {
    const mapW = 120;
    const mapH = 160;
    const padding = 12;
    const mapX = this.canvas.width - mapW - padding;
    const mapY = this.canvas.height - mapH - padding - 14; // above timeline bar

    this.ctx.save();

    // Semi-transparent background
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    this.ctx.beginPath();
    this.ctx.roundRect(mapX, mapY, mapW, mapH, 8);
    this.ctx.fill();

    // Find body bounding box to normalize landmarks into minimap
    let minX = 1, maxX = 0, minY = 1, maxY = 0;
    const bodyIndices = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    let validCount = 0;
    for (const i of bodyIndices) {
      if (pose[i] && pose[i].visibility > 0.3) {
        minX = Math.min(minX, pose[i].x);
        maxX = Math.max(maxX, pose[i].x);
        minY = Math.min(minY, pose[i].y);
        maxY = Math.max(maxY, pose[i].y);
        validCount++;
      }
    }
    if (validCount < 4) { this.ctx.restore(); return; }

    const bodyW = maxX - minX || 0.01;
    const bodyH = maxY - minY || 0.01;
    const innerPad = 15;
    const innerW = mapW - innerPad * 2;
    const innerH = mapH - innerPad * 2;
    const scale = Math.min(innerW / bodyW, innerH / bodyH);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const toMapX = (x) => mapX + mapW / 2 + (x - centerX) * scale;
    const toMapY = (y) => mapY + mapH / 2 + (y - centerY) * scale;

    // Draw connections
    this.ctx.strokeStyle = 'rgba(48, 195, 158, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = 'round';
    for (const [start, end] of this.connections) {
      if (pose[start] && pose[end] &&
          pose[start].visibility > 0.3 && pose[end].visibility > 0.3) {
        this.ctx.beginPath();
        this.ctx.moveTo(toMapX(pose[start].x), toMapY(pose[start].y));
        this.ctx.lineTo(toMapX(pose[end].x), toMapY(pose[end].y));
        this.ctx.stroke();
      }
    }

    // Draw joints
    this.ctx.fillStyle = '#3a86ff';
    for (const i of bodyIndices) {
      if (pose[i] && pose[i].visibility > 0.3) {
        this.ctx.beginPath();
        this.ctx.arc(toMapX(pose[i].x), toMapY(pose[i].y), 3, 0, 2 * Math.PI);
        this.ctx.fill();
      }
    }

    // Draw angle labels at key joints
    this.ctx.font = 'bold 9px Arial';
    this.ctx.textBaseline = 'middle';
    for (const { points, idealRange } of this.angleDefinitions) {
      const [a, b, c] = points;
      if (!pose[a] || !pose[b] || !pose[c]) continue;
      if (pose[a].visibility < 0.3 || pose[b].visibility < 0.3 || pose[c].visibility < 0.3) continue;

      const angle = calculateAngle(pose[a], pose[b], pose[c]);
      const jx = toMapX(pose[b].x);
      const jy = toMapY(pose[b].y);
      const color = this._getAngleColor(angle, idealRange);
      const label = `${Math.round(angle)}`;

      this.ctx.fillStyle = color;
      this.ctx.fillText(label, jx + 4, jy - 4);
    }

    this.ctx.restore();
  }

  // ========================================
  // ML DETECTION OVERLAYS
  // ========================================

  _drawMlDetections(mlFrame) {
    if (!mlFrame) return;

    this.ctx.save();

    const hasSelection = this.selectedPlayerId != null;

    // Draw player bounding boxes
    if (mlFrame.players) {
      for (const player of mlFrame.players) {
        const [x1, y1, x2, y2] = player.bbox;
        const px = x1 * this.canvas.width;
        const py = y1 * this.canvas.height;
        const pw = (x2 - x1) * this.canvas.width;
        const ph = (y2 - y1) * this.canvas.height;

        // Non-player filtering (refs, spectators, coaches)
        const isPlayer = player.isPlayer !== false;
        if (!isPlayer) {
          this.ctx.globalAlpha = 0.25;
          this.ctx.setLineDash([4, 4]);
          this.ctx.strokeStyle = 'rgba(128, 128, 128, 0.5)';
          this.ctx.strokeRect(px, py, pw, ph);
          this.ctx.setLineDash([]);
          this.ctx.font = '9px Arial';
          this.ctx.fillStyle = 'rgba(128, 128, 128, 0.7)';
          this.ctx.fillText('Non-player', px + 2, py - 3);
          this.ctx.globalAlpha = 1.0;
          continue;
        }

        const teamId = player.teamId;
        const trackId = player.trackId;
        const isSelected = hasSelection && trackId === this.selectedPlayerId;
        const isDimmed = hasSelection && !isSelected;

        const color = teamId >= 0 && teamId < this.teamColors.length
          ? this.teamColors[teamId]
          : this.unknownTeamColor;

        const alpha = isDimmed ? 0.3 : 1.0;
        this.ctx.globalAlpha = alpha;

        // Semi-transparent fill
        this.ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.1)');
        this.ctx.fillRect(px, py, pw, ph);

        // Border — gold highlight if selected
        if (isSelected) {
          this.ctx.strokeStyle = this.selectedHighlightColor;
          this.ctx.lineWidth = 4;
        } else {
          this.ctx.strokeStyle = color;
          this.ctx.lineWidth = 2;
        }
        this.ctx.strokeRect(px, py, pw, ph);

        // Label with trackId
        const teamLabel = teamId >= 0 ? `T${teamId + 1}` : '?';
        const label = trackId != null && trackId >= 0
          ? `${teamLabel} #${trackId}`
          : teamLabel;
        this.ctx.font = 'bold 11px Arial';
        const textW = this.ctx.measureText(label).width;
        this.ctx.fillStyle = isSelected ? this.selectedHighlightColor : color;
        this.ctx.fillRect(px, py - 18, textW + 8, 18);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(label, px + 4, py - 5);

        this.ctx.globalAlpha = 1.0;
      }
    }

    // Draw ball
    if (mlFrame.ball) {
      const [bx1, by1, bx2, by2] = mlFrame.ball.bbox;
      const cx = ((bx1 + bx2) / 2) * this.canvas.width;
      const cy = ((by1 + by2) / 2) * this.canvas.height;
      const r = Math.max(((bx2 - bx1) * this.canvas.width) / 2, 8);

      // Outer glow
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r + 4, 0, 2 * Math.PI);
      this.ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
      this.ctx.fill();

      // Inner circle
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      this.ctx.strokeStyle = this.ballColor;
      this.ctx.lineWidth = 2.5;
      this.ctx.stroke();

      // Ball label
      this.ctx.font = 'bold 10px Arial';
      this.ctx.fillStyle = this.ballColor;
      this.ctx.fillText('BALL', cx + r + 4, cy + 3);
    }

    this.ctx.restore();
  }

  // Draw skeleton for each detected player — uses real MediaPipe keypoints when
  // available (33 points), falls back to estimated proportional keypoints
  _drawPlayerSkeletons(mlFrame) {
    if (!mlFrame || !mlFrame.players) return;

    this.ctx.save();

    const hasSelection = this.selectedPlayerId != null;

    for (const player of mlFrame.players) {
      // Skip non-players (refs, spectators, coaches)
      if (player.isPlayer === false) continue;

      const [x1, y1, x2, y2] = player.bbox;
      const bw = (x2 - x1) * this.canvas.width;
      const bh = (y2 - y1) * this.canvas.height;
      const bx = x1 * this.canvas.width;
      const by = y1 * this.canvas.height;

      // Skip very small bboxes (too distant)
      if (bw < 15 || bh < 25) continue;

      const trackId = player.trackId;
      const teamId = player.teamId;
      const isSelected = hasSelection && trackId === this.selectedPlayerId;
      const isDimmed = hasSelection && !isSelected;

      // Determine keypoint source and connection set
      let points;
      let conns;
      let jointStart; // index to start drawing joint dots from

      if (player.keypoints && player.keypoints.length >= 33) {
        // Real MediaPipe 33-point data — use MediaPipe connections (body only, skip face 0-10)
        points = player.keypoints.map((kp) => ({
          x: kp[0] * this.canvas.width,
          y: kp[1] * this.canvas.height,
          v: kp[2] || 0,
        }));
        conns = this.connections;
        jointStart = 11; // skip face landmarks
      } else if (player.keypoints && player.keypoints.length >= 14) {
        // Some other keypoint format (e.g., COCO 17) — use estimated connections
        points = player.keypoints.map((kp) => ({
          x: kp[0] * this.canvas.width,
          y: kp[1] * this.canvas.height,
          v: kp[2] || 1,
        }));
        conns = this.estimatedConnections;
        jointStart = 0;
      } else {
        // No keypoints — estimate from bbox proportions
        points = this.estimatedKeypoints.map(([rx, ry]) => ({
          x: bx + rx * bw,
          y: by + ry * bh,
          v: 1,
        }));
        conns = this.estimatedConnections;
        jointStart = 0;
      }

      const alpha = isDimmed ? 0.15 : 0.8;
      this.ctx.globalAlpha = alpha;

      // Pick skeleton color by team
      const rgb = teamId >= 0 && teamId < this.teamColorsRgb.length
        ? this.teamColorsRgb[teamId]
        : [180, 180, 180];

      const lineColor = isSelected
        ? this.selectedHighlightColor
        : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.9)`;
      const jointColor = isSelected
        ? this.selectedHighlightColor
        : `rgba(${Math.min(rgb[0] + 40, 255)}, ${Math.min(rgb[1] + 40, 255)}, ${Math.min(rgb[2] + 40, 255)}, 1.0)`;

      // Draw connections
      this.ctx.strokeStyle = lineColor;
      this.ctx.lineWidth = isSelected ? 2.5 : 1.5;
      this.ctx.lineCap = 'round';

      for (const [a, b] of conns) {
        if (a < points.length && b < points.length &&
            points[a].v > 0.3 && points[b].v > 0.3) {
          this.ctx.beginPath();
          this.ctx.moveTo(points[a].x, points[a].y);
          this.ctx.lineTo(points[b].x, points[b].y);
          this.ctx.stroke();
        }
      }

      // Draw joint dots (skip face for MediaPipe)
      this.ctx.fillStyle = jointColor;
      const jointRadius = isSelected ? 3 : 2;
      for (let j = jointStart; j < points.length; j++) {
        if (points[j].v > 0.3) {
          this.ctx.beginPath();
          this.ctx.arc(points[j].x, points[j].y, jointRadius, 0, 2 * Math.PI);
          this.ctx.fill();
        }
      }

      // Head circle — use nose (index 0) for MediaPipe, head (index 0) for estimated
      const headIdx = 0;
      if (points[headIdx] && points[headIdx].v > 0.3) {
        this.ctx.beginPath();
        this.ctx.arc(points[headIdx].x, points[headIdx].y, Math.max(bw * 0.1, 3), 0, 2 * Math.PI);
        this.ctx.strokeStyle = lineColor;
        this.ctx.lineWidth = isSelected ? 2 : 1.5;
        this.ctx.stroke();
      }

      this.ctx.globalAlpha = 1.0;
    }

    this.ctx.restore();
  }

  _drawBallTrail(currentTime) {
    if (!this.mlResults || !this.mlResults.ballTrajectory || this.mlResults.ballTrajectory.length === 0) return;

    const trajectory = this.mlResults.ballTrajectory;
    // Filter points up to currentTime, take last 30
    const visible = [];
    for (const pt of trajectory) {
      if (pt.timestamp <= currentTime + 0.05) {
        visible.push({ x: pt.x, y: pt.y });
      }
    }
    const trailPoints = visible.slice(-30);
    if (trailPoints.length < 2) return;

    this.ctx.save();
    this._drawCometTrail(trailPoints, 255, 215, 0);
    this.ctx.restore();
  }

  _drawTeamLegend() {
    if (!this.mlResults || !this.mlResults.teams) return;

    this.ctx.save();

    const legendX = 15;
    const legendY = 55; // below timestamp
    const rowH = 20;

    // Background
    this.ctx.fillStyle = this.colors.hud;
    this.ctx.fillRect(legendX, legendY, 85, rowH * 2 + 10);

    // Team A
    this.ctx.fillStyle = this.teamColors[0];
    this.ctx.fillRect(legendX + 5, legendY + 5, 12, 12);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 11px Arial';
    this.ctx.fillText('Team A', legendX + 22, legendY + 15);

    // Team B
    this.ctx.fillStyle = this.teamColors[1];
    this.ctx.fillRect(legendX + 5, legendY + 5 + rowH, 12, 12);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText('Team B', legendX + 22, legendY + 15 + rowH);

    this.ctx.restore();
  }

  // Draw movement trail for selected player using playerPaths data
  _drawPlayerTrails(currentTime) {
    if (!this.selectedPlayerId || !this.mlResults?.playerPaths) return;

    const path = this.mlResults.playerPaths[String(this.selectedPlayerId)];
    if (!path || path.length < 2) return;

    // Find points up to currentTime (show trail behind current position)
    const visiblePoints = path.filter((p) => p.timestamp <= currentTime + 0.1);
    if (visiblePoints.length < 2) return;

    // Use last N points for the trail
    const trailLength = Math.min(visiblePoints.length, 60);
    const trailPoints = visiblePoints.slice(-trailLength);

    // Get team color for this player
    const stats = this.mlResults.playerStats?.[String(this.selectedPlayerId)];
    const teamId = stats?.teamId ?? -1;
    const rgb = teamId >= 0 && teamId < this.teamColorsRgb.length
      ? this.teamColorsRgb[teamId]
      : [180, 180, 180];

    this.ctx.save();
    this._drawCometTrail(trailPoints, rgb[0], rgb[1], rgb[2]);
    this.ctx.restore();
  }

  // Draw lines connecting players of the same team to show formation shape
  _drawFormationLines(mlFrame) {
    if (!mlFrame || !mlFrame.players) return;

    this.ctx.save();
    this.ctx.globalAlpha = 0.2;
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);

    // Group players by team
    const teams = {};
    for (const player of mlFrame.players) {
      const teamId = player.teamId;
      if (teamId < 0) continue;
      if (!teams[teamId]) teams[teamId] = [];
      const bbox = player.bbox;
      teams[teamId].push({
        cx: ((bbox[0] + bbox[2]) / 2) * this.canvas.width,
        cy: ((bbox[1] + bbox[3]) / 2) * this.canvas.height,
      });
    }

    // Draw lines between nearest teammates (Delaunay-like connections)
    for (const [teamId, positions] of Object.entries(teams)) {
      const color = parseInt(teamId) < this.teamColors.length
        ? this.teamColors[parseInt(teamId)]
        : this.unknownTeamColor;
      this.ctx.strokeStyle = color;

      // Connect each player to their 2 nearest teammates
      for (let i = 0; i < positions.length; i++) {
        const distances = [];
        for (let j = 0; j < positions.length; j++) {
          if (i === j) continue;
          const dx = positions[i].cx - positions[j].cx;
          const dy = positions[i].cy - positions[j].cy;
          distances.push({ j, dist: Math.sqrt(dx * dx + dy * dy) });
        }
        distances.sort((a, b) => a.dist - b.dist);
        const neighbors = distances.slice(0, 2);

        for (const { j } of neighbors) {
          this.ctx.beginPath();
          this.ctx.moveTo(positions[i].cx, positions[i].cy);
          this.ctx.lineTo(positions[j].cx, positions[j].cy);
          this.ctx.stroke();
        }
      }
    }

    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  // Draw possession indicator HUD badge
  _drawPossessionIndicator(currentTime) {
    if (!this.mlResults?.possessionTimeline || this.mlResults.possessionTimeline.length === 0) return;

    // Find the current possession entry (nearest timestamp)
    const timeline = this.mlResults.possessionTimeline;
    let current = timeline[0];
    for (const entry of timeline) {
      if (entry.timestamp <= currentTime) {
        current = entry;
      } else {
        break;
      }
    }

    const teamId = current.teamId;
    if (teamId < 0) return;

    const teamName = teamId === 0 ? 'Team A' : 'Team B';
    const color = teamId < this.teamColors.length
      ? this.teamColors[teamId]
      : this.unknownTeamColor;

    this.ctx.save();

    // Draw badge in top-right area
    const badgeX = this.canvas.width - 170;
    const badgeY = 15;

    this.ctx.fillStyle = this.colors.hud;
    this.ctx.fillRect(badgeX, badgeY, 155, 30);

    this.ctx.font = 'bold 12px Arial';
    this.ctx.fillStyle = '#aaaaaa';
    this.ctx.fillText('Possession:', badgeX + 8, badgeY + 19);

    this.ctx.fillStyle = color;
    this.ctx.fillText(teamName, badgeX + 90, badgeY + 19);

    // Small color dot
    this.ctx.beginPath();
    this.ctx.arc(badgeX + 145, badgeY + 15, 5, 0, 2 * Math.PI);
    this.ctx.fillStyle = color;
    this.ctx.fill();

    this.ctx.restore();
  }

  _drawTimestamp() {
    let timestamp;
    if (this.landmarks && this.landmarks[this.currentFrame]) {
      timestamp = this.landmarks[this.currentFrame].timestamp || 0;
    } else {
      timestamp = this.currentTime || 0;
    }

    const mins = Math.floor(timestamp / 60);
    const secs = Math.floor(timestamp % 60);
    const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

    this.ctx.save();
    this.ctx.fillStyle = this.colors.hud;
    this.ctx.fillRect(15, 15, 80, 30);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.fillText(timeStr, 25, 35);
    this.ctx.restore();
  }

  clearPaths() {
    this.movementPaths = {
      leftWrist: [], rightWrist: [],
      leftAnkle: [], rightAnkle: [],
    };
  }
}

export default VideoOverlay;
