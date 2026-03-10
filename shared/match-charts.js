// Match Charts — SVG-based temporal data visualizations for match analysis
// All rendering uses inline SVG via innerHTML — no external chart libraries

const TEAM_A_COLOR = '#d93025';
const TEAM_A_COLOR_LIGHT = 'rgba(217, 48, 37, 0.25)';
const TEAM_B_COLOR = '#1a73e8';
const TEAM_B_COLOR_LIGHT = 'rgba(26, 115, 232, 0.25)';
const BALL_COLOR = '#f9ab00';
const EVENT_COLORS = {
  ball_contact: '#f9ab00',
  direction_change: '#9334e6',
  gemini: '#e8710a',
  pass: '#1e8e3e',
  turnover: '#d93025',
};
const TEXT_COLOR = '#5f6368';
const LINE_COLOR = '#dadce0';

export default class MatchCharts {
  constructor({ seekVideo, duration }) {
    this.seekVideo = seekVideo;
    this.duration = duration || 1;
  }

  // ─── Processing Stats Dashboard ───────────────────────────────────
  renderProcessingStats(container, { processingMeta }) {
    if (!container) return;
    if (!processingMeta) {
      container.innerHTML = '';
      return;
    }

    const stats = [
      { icon: 'fas fa-images', value: processingMeta.framesProcessed ?? processingMeta.totalFrames ?? '—', label: 'Frames' },
      { icon: 'fas fa-users', value: processingMeta.uniquePlayersTracked ?? processingMeta.totalPlayers ?? '—', label: 'Unique Players' },
      { icon: 'fas fa-futbol', value: processingMeta.ballDetections ?? '—', label: 'Ball Detected' },
      { icon: 'fas fa-bezier-curve', value: processingMeta.ballInterpolated ?? '—', label: 'Ball Interpolated' },
      { icon: 'fas fa-project-diagram', value: processingMeta.tracksMerged ?? '—', label: 'Tracks Merged' },
      { icon: 'fas fa-cut', value: processingMeta.cameraCutsDetected ?? '—', label: 'Camera Cuts' },
    ];

    container.innerHTML = stats.map((s) => `
      <div class="match-stat-card">
        <i class="${s.icon}"></i>
        <span class="match-stat-value">${s.value}</span>
        <span class="match-stat-label">${s.label}</span>
      </div>
    `).join('');
  }

  // ─── Possession Flow (stacked area river chart) ───────────────────
  renderPossessionFlow(container, { possessionTimeline, duration }) {
    if (!container) return;
    const dur = duration || this.duration;

    if (!possessionTimeline || possessionTimeline.length === 0) {
      container.innerHTML = '<div class="match-chart-empty">No possession timeline data</div>';
      return;
    }

    const W = 600, H = 180, PAD = { top: 20, right: 20, bottom: 30, left: 20 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Bin possession into 2-second intervals
    const binSize = 2;
    const numBins = Math.max(1, Math.ceil(dur / binSize));
    const bins = Array.from({ length: numBins }, () => ({ a: 0, b: 0, total: 0 }));

    for (const entry of possessionTimeline) {
      const t = entry.timestamp ?? entry.time ?? 0;
      const binIdx = Math.min(Math.floor(t / binSize), numBins - 1);
      if (entry.team === 0 || entry.teamId === 0) {
        bins[binIdx].a++;
      } else if (entry.team === 1 || entry.teamId === 1) {
        bins[binIdx].b++;
      }
      bins[binIdx].total++;
    }

    // Normalize bins to 0–1 ratios
    const ratios = bins.map((bin) => {
      if (bin.total === 0) return { a: 0.5, b: 0.5 };
      return { a: bin.a / bin.total, b: bin.b / bin.total };
    });

    // Build area paths — Team A fills from top, Team B from bottom
    const xScale = (i) => PAD.left + (i / (numBins - 1 || 1)) * plotW;
    const yMid = PAD.top + plotH / 2;

    // Team A: top area (from midline upward)
    let pathA = `M ${xScale(0)} ${yMid}`;
    for (let i = 0; i < numBins; i++) {
      const y = yMid - ratios[i].a * (plotH / 2);
      pathA += ` L ${xScale(i)} ${y}`;
    }
    pathA += ` L ${xScale(numBins - 1)} ${yMid} Z`;

    // Team B: bottom area (from midline downward)
    let pathB = `M ${xScale(0)} ${yMid}`;
    for (let i = 0; i < numBins; i++) {
      const y = yMid + ratios[i].b * (plotH / 2);
      pathB += ` L ${xScale(i)} ${y}`;
    }
    pathB += ` L ${xScale(numBins - 1)} ${yMid} Z`;

    // Time axis labels
    const labelCount = Math.min(6, numBins);
    const labelStep = Math.max(1, Math.floor(numBins / labelCount));
    let timeLabels = '';
    for (let i = 0; i < numBins; i += labelStep) {
      const t = i * binSize;
      const x = xScale(i);
      timeLabels += `<text x="${x}" y="${H - 5}" text-anchor="middle" fill="${TEXT_COLOR}" font-size="11">${this._fmtTime(t)}</text>`;
    }

    container.innerHTML = `
      <div class="match-chart-container">
        <h4><i class="fas fa-water"></i> Possession Flow</h4>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="mc-svg mc-possession-flow" data-duration="${dur}">
          <!-- Midline -->
          <line x1="${PAD.left}" y1="${yMid}" x2="${W - PAD.right}" y2="${yMid}" stroke="${LINE_COLOR}" stroke-width="1" stroke-dasharray="4 3" opacity="0.5"/>
          <!-- Team A area -->
          <path d="${pathA}" fill="${TEAM_A_COLOR_LIGHT}" stroke="${TEAM_A_COLOR}" stroke-width="1.5"/>
          <!-- Team B area -->
          <path d="${pathB}" fill="${TEAM_B_COLOR_LIGHT}" stroke="${TEAM_B_COLOR}" stroke-width="1.5"/>
          <!-- Playhead -->
          <line class="mc-playhead" data-chart="possession" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#202124" stroke-width="1.5" opacity="0.7"/>
          <!-- Click area -->
          <rect x="${PAD.left}" y="${PAD.top}" width="${plotW}" height="${plotH}" fill="transparent" class="mc-click-area" style="cursor:pointer"/>
          ${timeLabels}
          <!-- Legend -->
          <rect x="${PAD.left}" y="4" width="10" height="10" rx="2" fill="${TEAM_A_COLOR}"/>
          <text x="${PAD.left + 14}" y="13" fill="${TEXT_COLOR}" font-size="11">Team A</text>
          <rect x="${PAD.left + 70}" y="4" width="10" height="10" rx="2" fill="${TEAM_B_COLOR}"/>
          <text x="${PAD.left + 84}" y="13" fill="${TEXT_COLOR}" font-size="11">Team B</text>
        </svg>
      </div>
    `;

    // Click-to-seek
    const clickArea = container.querySelector('.mc-click-area');
    if (clickArea) {
      clickArea.addEventListener('click', (e) => {
        const rect = clickArea.closest('svg').getBoundingClientRect();
        const svgW = rect.width;
        const relX = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, (relX - (PAD.left / W) * svgW) / ((plotW / W) * svgW)));
        this.seekVideo(ratio * dur);
      });
    }
  }

  // ─── Player Comparison (horizontal bar chart) ─────────────────────
  renderPlayerComparison(container, { playerStats }) {
    if (!container) return;

    if (!playerStats || Object.keys(playerStats).length === 0) {
      container.innerHTML = '<div class="match-chart-empty">No player data</div>';
      return;
    }

    const players = Object.entries(playerStats)
      .map(([id, s]) => ({
        id,
        team: s.teamId ?? -1,
        framesVisible: s.framesVisible || 0,
        possessionFrames: s.possessionFrames || 0,
        firstSeen: s.firstSeen || 0,
        totalDistanceM: s.totalDistanceM || 0,
        avgSpeedKmh: s.avgSpeedKmh || 0,
        topSpeedKmh: s.topSpeedKmh || 0,
      }))
      .sort((a, b) => b.framesVisible - a.framesVisible);

    const maxFrames = Math.max(1, ...players.map((p) => p.framesVisible));

    const barH = 22, gap = 6;
    const W = 600, PAD = { top: 10, right: 20, bottom: 10, left: 65 };
    const plotW = W - PAD.left - PAD.right;
    const H = PAD.top + players.length * (barH + gap) + PAD.bottom;

    let bars = '';
    players.forEach((p, i) => {
      const y = PAD.top + i * (barH + gap);
      const barW = (p.framesVisible / maxFrames) * plotW;
      const possW = (p.possessionFrames / maxFrames) * plotW;
      const teamColor = p.team === 0 ? TEAM_A_COLOR : p.team === 1 ? TEAM_B_COLOR : 'rgba(180,180,180,0.6)';
      const teamColorLight = p.team === 0 ? TEAM_A_COLOR_LIGHT : p.team === 1 ? TEAM_B_COLOR_LIGHT : 'rgba(180,180,180,0.2)';
      const teamLabel = p.team === 0 ? 'A' : p.team === 1 ? 'B' : '?';

      bars += `
        <g class="mc-player-bar" data-first-seen="${p.firstSeen}" style="cursor:pointer">
          <text x="${PAD.left - 8}" y="${y + barH / 2 + 4}" text-anchor="end" fill="${TEXT_COLOR}" font-size="12" font-weight="600">#${p.id} (${teamLabel})</text>
          <rect x="${PAD.left}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${teamColorLight}"/>
          <rect x="${PAD.left}" y="${y}" width="${possW}" height="${barH}" rx="4" fill="${teamColor}"/>
          <text x="${PAD.left + barW + 6}" y="${y + barH / 2 + 4}" fill="${TEXT_COLOR}" font-size="11">${p.totalDistanceM > 0 ? `${p.totalDistanceM}m · ${p.topSpeedKmh}km/h` : `${p.framesVisible}f`}</text>
          <title>Player #${p.id} — ${p.framesVisible} frames, ${p.possessionFrames} poss, ${p.totalDistanceM}m covered, top ${p.topSpeedKmh}km/h</title>
        </g>
      `;
    });

    container.innerHTML = `
      <div class="match-chart-container">
        <h4><i class="fas fa-chart-bar"></i> Player Visibility</h4>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="mc-svg mc-player-comparison">
          ${bars}
          <!-- Legend -->
          <rect x="${PAD.left}" y="${H - 8}" width="8" height="8" rx="2" fill="${TEAM_A_COLOR}"/>
          <text x="${PAD.left + 12}" y="${H - 1}" fill="${TEXT_COLOR}" font-size="10">possession</text>
          <rect x="${PAD.left + 80}" y="${H - 8}" width="8" height="8" rx="2" fill="${TEAM_A_COLOR_LIGHT}"/>
          <text x="${PAD.left + 92}" y="${H - 1}" fill="${TEXT_COLOR}" font-size="10">visible</text>
        </svg>
      </div>
    `;

    // Click bar → seek to firstSeen
    container.querySelectorAll('.mc-player-bar').forEach((bar) => {
      bar.addEventListener('click', () => {
        const t = parseFloat(bar.dataset.firstSeen) || 0;
        this.seekVideo(t);
      });
    });
  }

  // ─── Pitch Map (player positions + ball trajectory) ───────────────
  renderPitchMap(container, { playerPaths, playerStats, ballTrajectory }) {
    if (!container) return;

    const hasPlayerData = playerStats && Object.keys(playerStats).length > 0;
    const hasBall = ballTrajectory && ballTrajectory.length > 0;

    if (!hasPlayerData && !hasBall) {
      container.innerHTML = '<div class="match-chart-empty">No spatial data</div>';
      return;
    }

    const W = 600, H = 380;
    const pitchPad = 30;
    const pitchW = W - 2 * pitchPad;
    const pitchH = H - 2 * pitchPad - 30; // leave room for legend

    // Pitch markings
    const cx = pitchPad + pitchW / 2;
    const cy = pitchPad + pitchH / 2;

    let pitchLines = `
      <rect x="${pitchPad}" y="${pitchPad}" width="${pitchW}" height="${pitchH}" rx="4" fill="#1a5c2a" stroke="#2d8c4a" stroke-width="1.5"/>
      <!-- Center line -->
      <line x1="${cx}" y1="${pitchPad}" x2="${cx}" y2="${pitchPad + pitchH}" stroke="#2d8c4a" stroke-width="1" stroke-dasharray="5 3"/>
      <!-- Center circle -->
      <circle cx="${cx}" cy="${cy}" r="${pitchH * 0.15}" fill="none" stroke="#2d8c4a" stroke-width="1" stroke-dasharray="5 3"/>
      <!-- Penalty areas -->
      <rect x="${pitchPad}" y="${cy - pitchH * 0.3}" width="${pitchW * 0.15}" height="${pitchH * 0.6}" fill="none" stroke="#2d8c4a" stroke-width="1" stroke-dasharray="4 3"/>
      <rect x="${pitchPad + pitchW - pitchW * 0.15}" y="${cy - pitchH * 0.3}" width="${pitchW * 0.15}" height="${pitchH * 0.6}" fill="none" stroke="#2d8c4a" stroke-width="1" stroke-dasharray="4 3"/>
    `;

    // Player circles — average position from playerPaths or playerStats
    let playerCircles = '';
    if (hasPlayerData) {
      const maxFrames = Math.max(1, ...Object.values(playerStats).map((s) => s.framesVisible || 1));

      for (const [id, stats] of Object.entries(playerStats)) {
        // Use average position from paths if available, else from stats
        let avgX = 0.5, avgY = 0.5;
        const paths = playerPaths?.[id];
        if (paths && paths.length > 0) {
          const sumX = paths.reduce((s, p) => s + (p.x ?? p[0] ?? 0.5), 0);
          const sumY = paths.reduce((s, p) => s + (p.y ?? p[1] ?? 0.5), 0);
          avgX = sumX / paths.length;
          avgY = sumY / paths.length;
        } else if (stats.avgX != null && stats.avgY != null) {
          avgX = stats.avgX;
          avgY = stats.avgY;
        }

        // Map normalized coords to pitch
        const px = pitchPad + avgX * pitchW;
        const py = pitchPad + avgY * pitchH;
        const r = 6 + (stats.framesVisible / maxFrames) * 10;
        const teamColor = stats.teamId === 0 ? TEAM_A_COLOR : stats.teamId === 1 ? TEAM_B_COLOR : 'rgba(180,180,180,0.7)';

        playerCircles += `
          <circle cx="${px}" cy="${py}" r="${r}" fill="${teamColor}" stroke="#fff" stroke-width="1.5" opacity="0.85">
            <title>Player #${id} — ${stats.framesVisible || 0} frames</title>
          </circle>
          <text x="${px}" y="${py + 3}" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">${id}</text>
        `;
      }
    }

    // Ball trajectory polyline
    let ballLine = '';
    if (hasBall) {
      // Sample every Nth point to avoid clutter
      const sampleN = Math.max(1, Math.floor(ballTrajectory.length / 100));
      const points = ballTrajectory
        .filter((_, i) => i % sampleN === 0)
        .map((p) => {
          const bx = pitchPad + (p.x ?? p[0] ?? 0.5) * pitchW;
          const by = pitchPad + (p.y ?? p[1] ?? 0.5) * pitchH;
          return `${bx},${by}`;
        })
        .join(' ');

      if (points) {
        ballLine = `<polyline points="${points}" fill="none" stroke="${BALL_COLOR}" stroke-width="1.5" opacity="0.6" stroke-linejoin="round"/>`;
      }
    }

    // Legend
    const legendY = H - 18;
    const legend = `
      <circle cx="${pitchPad + 6}" cy="${legendY}" r="5" fill="${TEAM_A_COLOR}"/>
      <text x="${pitchPad + 16}" y="${legendY + 4}" fill="${TEXT_COLOR}" font-size="11">Team A</text>
      <circle cx="${pitchPad + 76}" cy="${legendY}" r="5" fill="${TEAM_B_COLOR}"/>
      <text x="${pitchPad + 86}" y="${legendY + 4}" fill="${TEXT_COLOR}" font-size="11">Team B</text>
      ${hasBall ? `
        <line x1="${pitchPad + 146}" y1="${legendY}" x2="${pitchPad + 162}" y2="${legendY}" stroke="${BALL_COLOR}" stroke-width="2"/>
        <text x="${pitchPad + 168}" y="${legendY + 4}" fill="${TEXT_COLOR}" font-size="11">Ball</text>
      ` : ''}
    `;

    container.innerHTML = `
      <div class="match-chart-container">
        <h4><i class="fas fa-map-marked-alt"></i> Pitch Map</h4>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="mc-svg mc-pitch-map">
          ${pitchLines}
          ${ballLine}
          ${playerCircles}
          ${legend}
        </svg>
      </div>
    `;
  }

  // ─── Events Distribution (histogram) ──────────────────────────────
  renderEventsDistribution(container, { keyFrames, matchEvents, passEvents, duration }) {
    if (!container) return;
    const dur = duration || this.duration;

    const allEvents = [];

    // keyFrames from ML pipeline
    if (keyFrames && keyFrames.length > 0) {
      for (const kf of keyFrames) {
        allEvents.push({
          time: kf.timestamp ?? kf.time ?? 0,
          type: kf.type || 'ball_contact',
        });
      }
    }

    // matchEvents from Gemini
    if (matchEvents && matchEvents.length > 0) {
      for (const evt of matchEvents) {
        allEvents.push({
          time: evt.timestamp ?? evt.time ?? 0,
          type: 'gemini',
        });
      }
    }

    // passEvents from ML pipeline
    if (passEvents && passEvents.length > 0) {
      for (const evt of passEvents) {
        allEvents.push({
          time: evt.timestamp ?? 0,
          type: evt.type || 'pass',
        });
      }
    }

    if (allEvents.length === 0) {
      container.innerHTML = '<div class="match-chart-empty">No event data</div>';
      return;
    }

    // Bin size: 10s for long videos, 2s for short
    const binSize = dur > 30 ? 10 : 2;
    const numBins = Math.max(1, Math.ceil(dur / binSize));
    const bins = Array.from({ length: numBins }, () => ({
      ball_contact: 0,
      direction_change: 0,
      gemini: 0,
      pass: 0,
      turnover: 0,
      total: 0,
    }));

    for (const evt of allEvents) {
      const idx = Math.min(Math.floor(evt.time / binSize), numBins - 1);
      const type = EVENT_COLORS[evt.type] ? evt.type : 'ball_contact';
      bins[idx][type]++;
      bins[idx].total++;
    }

    const maxTotal = Math.max(1, ...bins.map((b) => b.total));

    const W = 600, H = 180, PAD = { top: 20, right: 20, bottom: 30, left: 20 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const barW = (plotW / numBins) * 0.8;
    const barGap = (plotW / numBins) * 0.2;

    let barsMarkup = '';
    for (let i = 0; i < numBins; i++) {
      const bin = bins[i];
      const x = PAD.left + (i / numBins) * plotW + barGap / 2;
      const totalH = (bin.total / maxTotal) * plotH;

      // Stack: ball_contact bottom, direction_change middle, gemini top
      let yOff = PAD.top + plotH - totalH;
      const types = ['ball_contact', 'direction_change', 'gemini'];
      for (const type of types) {
        if (bin[type] > 0) {
          const h = (bin[type] / maxTotal) * plotH;
          barsMarkup += `<rect x="${x}" y="${yOff}" width="${barW}" height="${h}" rx="2" fill="${EVENT_COLORS[type]}" opacity="0.8">
            <title>${this._fmtTime(i * binSize)}–${this._fmtTime((i + 1) * binSize)}: ${bin[type]} ${type.replace('_', ' ')}</title>
          </rect>`;
          yOff += h;
        }
      }

      // Invisible click target
      barsMarkup += `<rect x="${x}" y="${PAD.top}" width="${barW}" height="${plotH}" fill="transparent" class="mc-event-bar" data-time="${i * binSize + binSize / 2}" style="cursor:pointer"/>`;
    }

    // Time labels
    const labelCount = Math.min(6, numBins);
    const labelStep = Math.max(1, Math.floor(numBins / labelCount));
    let timeLabels = '';
    for (let i = 0; i < numBins; i += labelStep) {
      const t = i * binSize;
      const x = PAD.left + (i / numBins) * plotW + barW / 2;
      timeLabels += `<text x="${x}" y="${H - 5}" text-anchor="middle" fill="${TEXT_COLOR}" font-size="11">${this._fmtTime(t)}</text>`;
    }

    container.innerHTML = `
      <div class="match-chart-container">
        <h4><i class="fas fa-chart-bar"></i> Events Distribution</h4>
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="mc-svg mc-events-dist" data-duration="${dur}">
          <!-- Baseline -->
          <line x1="${PAD.left}" y1="${PAD.top + plotH}" x2="${W - PAD.right}" y2="${PAD.top + plotH}" stroke="${LINE_COLOR}" stroke-width="1"/>
          ${barsMarkup}
          <!-- Playhead -->
          <line class="mc-playhead" data-chart="events" x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${PAD.top + plotH}" stroke="#202124" stroke-width="1.5" opacity="0.7"/>
          ${timeLabels}
          <!-- Legend -->
          <rect x="${PAD.left}" y="4" width="10" height="10" rx="2" fill="${EVENT_COLORS.ball_contact}"/>
          <text x="${PAD.left + 14}" y="13" fill="${TEXT_COLOR}" font-size="10">ball contact</text>
          <rect x="${PAD.left + 95}" y="4" width="10" height="10" rx="2" fill="${EVENT_COLORS.direction_change}"/>
          <text x="${PAD.left + 109}" y="13" fill="${TEXT_COLOR}" font-size="10">dir change</text>
          <rect x="${PAD.left + 180}" y="4" width="10" height="10" rx="2" fill="${EVENT_COLORS.gemini}"/>
          <text x="${PAD.left + 194}" y="13" fill="${TEXT_COLOR}" font-size="10">AI events</text>
          <rect x="${PAD.left + 255}" y="4" width="10" height="10" rx="2" fill="${EVENT_COLORS.pass}"/>
          <text x="${PAD.left + 269}" y="13" fill="${TEXT_COLOR}" font-size="10">pass</text>
          <rect x="${PAD.left + 305}" y="4" width="10" height="10" rx="2" fill="${EVENT_COLORS.turnover}"/>
          <text x="${PAD.left + 319}" y="13" fill="${TEXT_COLOR}" font-size="10">turnover</text>
        </svg>
      </div>
    `;

    // Click bars → seek
    container.querySelectorAll('.mc-event-bar').forEach((bar) => {
      bar.addEventListener('click', () => {
        const t = parseFloat(bar.dataset.time) || 0;
        this.seekVideo(t);
      });
    });
  }

  // ─── Pass / Turnover Stats ──────────────────────────────────────
  renderPassStats(container, { passEvents, playerStats }) {
    if (!container) return;
    if (!passEvents || passEvents.length === 0) {
      container.innerHTML = '';
      return;
    }

    let team0Passes = 0, team1Passes = 0, turnovers = 0;
    for (const evt of passEvents) {
      if (evt.type === 'pass') {
        if (evt.fromTeam === 0) team0Passes++;
        else team1Passes++;
      } else if (evt.type === 'turnover') {
        turnovers++;
      }
    }

    const totalPasses = team0Passes + team1Passes;
    const t0Pct = totalPasses > 0 ? Math.round((team0Passes / totalPasses) * 100) : 0;
    const t1Pct = totalPasses > 0 ? Math.round((team1Passes / totalPasses) * 100) : 0;

    container.innerHTML = `
      <div class="match-chart-container">
        <h4><i class="fas fa-exchange-alt"></i> Passing Stats</h4>
        <div class="pass-stats-grid">
          <div class="match-stat-card">
            <span class="match-stat-value" style="color: ${EVENT_COLORS.pass}">${totalPasses}</span>
            <span class="match-stat-label">Total Passes</span>
          </div>
          <div class="match-stat-card">
            <span class="match-stat-value" style="color: ${EVENT_COLORS.turnover}">${turnovers}</span>
            <span class="match-stat-label">Turnovers</span>
          </div>
          <div class="match-stat-card">
            <span class="match-stat-value">${team0Passes}</span>
            <span class="match-stat-label">Team A Passes</span>
          </div>
          <div class="match-stat-card">
            <span class="match-stat-value">${team1Passes}</span>
            <span class="match-stat-label">Team B Passes</span>
          </div>
        </div>
        <div class="pass-bar">
          <div class="pass-bar-fill" style="width: ${t0Pct}%; background: rgba(48, 196, 158, 0.7);">
            ${t0Pct > 10 ? `${t0Pct}%` : ''}
          </div>
          <div class="pass-bar-fill" style="width: ${t1Pct}%; background: rgba(108, 92, 231, 0.7);">
            ${t1Pct > 10 ? `${t1Pct}%` : ''}
          </div>
        </div>
      </div>
    `;
  }

  // ─── Update Playhead ──────────────────────────────────────────────
  updatePlayhead(currentTime) {
    document.querySelectorAll('.mc-playhead').forEach((line) => {
      const svg = line.closest('svg');
      if (!svg) return;

      const dur = parseFloat(svg.dataset.duration) || this.duration;
      const viewBox = svg.viewBox.baseVal;
      const padLeft = 20;
      const padRight = 20;
      const plotW = viewBox.width - padLeft - padRight;
      const ratio = Math.max(0, Math.min(1, currentTime / dur));
      const x = padLeft + ratio * plotW;

      line.setAttribute('x1', x);
      line.setAttribute('x2', x);
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────
  _fmtTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
