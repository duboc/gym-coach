#!/usr/bin/env python3
"""
ML Pipeline for Football Video Analysis
Runs YOLOv8 player/ball detection, SigLIP embeddings, UMAP + KMeans team clustering.
Outputs JSON to stdout for Node.js consumption.
"""

import sys
import os
import json
import argparse
import warnings
import logging
import io

# Suppress all warnings before any imports that might emit them
warnings.filterwarnings("ignore")
os.environ["YOLO_VERBOSE"] = "false"
logging.getLogger("ultralytics").setLevel(logging.CRITICAL)
logging.getLogger("ultralytics.utils").setLevel(logging.CRITICAL)

import cv2
import numpy as np
from PIL import Image

# Lazy-loaded models (loaded once on first use)
_yolo_model = None
_siglip_model = None
_siglip_processor = None
_mediapipe_pose = None


def get_yolo_model():
    global _yolo_model
    if _yolo_model is None:
        from ultralytics import YOLO
        _yolo_model = YOLO("yolov8n.pt")
    return _yolo_model


def get_siglip(device="cpu"):
    global _siglip_model, _siglip_processor
    if _siglip_model is None:
        from transformers import AutoModel, AutoImageProcessor
        model_name = "google/siglip-base-patch16-224"
        _siglip_processor = AutoImageProcessor.from_pretrained(model_name)
        _siglip_model = AutoModel.from_pretrained(model_name).to(device).eval()
    return _siglip_model, _siglip_processor


def get_mediapipe_pose():
    global _mediapipe_pose
    if _mediapipe_pose is None:
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions

        # Model path — check common locations
        model_path = _find_pose_model()
        if model_path is None:
            print("Warning: pose_landmarker_lite.task not found, downloading...",
                  file=sys.stderr)
            model_path = _download_pose_model()

        options = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=model_path),
            num_poses=1,
            min_pose_detection_confidence=0.3,
            min_pose_presence_confidence=0.3,
        )
        _mediapipe_pose = vision.PoseLandmarker.create_from_options(options)
    return _mediapipe_pose


def _find_pose_model():
    """Look for pose_landmarker_lite.task in common locations."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "pose_landmarker_lite.task"),
        "/app/pose_landmarker_lite.task",
        os.path.expanduser("~/.mediapipe/pose_landmarker_lite.task"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def _download_pose_model():
    """Download the lite pose landmarker model."""
    import urllib.request
    import ssl

    url = ("https://storage.googleapis.com/mediapipe-models/"
           "pose_landmarker/pose_landmarker_lite/float16/latest/"
           "pose_landmarker_lite.task")
    dest_dir = os.path.expanduser("~/.mediapipe")
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, "pose_landmarker_lite.task")

    # Allow unverified SSL for environments without certs configured
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx)
    )
    with opener.open(url) as resp, open(dest, "wb") as f:
        f.write(resp.read())
    return dest


def run_pose_estimation(frames, detections, video_meta):
    """Run MediaPipe Pose on each detected player crop to get 33 keypoints.
    Stores keypoints as [x, y, visibility] arrays in normalized full-frame coords.
    """
    import mediapipe as mp

    pose = get_mediapipe_pose()
    w, h = video_meta["width"], video_meta["height"]

    for i, det in enumerate(detections):
        frame = frames[i]["frame"]

        for player in det["players"]:
            bbox = player["bbox"]
            # Convert normalized bbox to pixel coords
            px1 = max(0, int(bbox[0] * w))
            py1 = max(0, int(bbox[1] * h))
            px2 = min(w, int(bbox[2] * w))
            py2 = min(h, int(bbox[3] * h))

            crop_w = px2 - px1
            crop_h = py2 - py1

            # Skip very small crops — too small for meaningful pose
            if crop_w < 20 or crop_h < 30:
                continue

            # Crop and convert BGR -> RGB for MediaPipe
            crop = frame[py1:py2, px1:px2]
            crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)

            # MediaPipe Tasks API
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=crop_rgb)
            results = pose.detect(mp_image)

            if results.pose_landmarks and len(results.pose_landmarks) > 0:
                keypoints = []
                for lm in results.pose_landmarks[0]:
                    # Map from crop-normalized (0-1) to full-frame-normalized (0-1)
                    full_x = round(bbox[0] + lm.x * (bbox[2] - bbox[0]), 4)
                    full_y = round(bbox[1] + lm.y * (bbox[3] - bbox[1]), 4)
                    vis = round(lm.visibility, 3)
                    keypoints.append([full_x, full_y, vis])
                player["keypoints"] = keypoints


def triage_video(video_path, sample_frames=5):
    """Quick triage: sample a few frames with YOLOv8 only (no tracking, no SigLIP).
    Determines if video is a multi-player match or single-player technique.
    Returns dict with person count stats and suggested mode.
    """
    model = get_yolo_model()
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return {"error": "Cannot open video", "suggestedMode": "technique"}

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / video_fps if video_fps > 0 else 0

    frame_indices = np.linspace(0, max(0, total_frames - 1), sample_frames, dtype=int)
    person_counts = []
    has_ball = False

    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ret, frame = cap.read()
        if not ret:
            continue

        _real_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            results = model(frame, classes=[0, 32], verbose=False)[0]
        finally:
            sys.stdout = _real_stdout

        persons = 0
        for box in results.boxes:
            cls = int(box.cls[0])
            if cls == 0:
                persons += 1
            elif cls == 32:
                has_ball = True
        person_counts.append(persons)

    cap.release()

    avg_persons = sum(person_counts) / len(person_counts) if person_counts else 0
    max_persons = max(person_counts) if person_counts else 0

    if avg_persons >= 3 or max_persons >= 4:
        suggested_mode = "match"
    else:
        suggested_mode = "technique"

    return {
        "avgPersonCount": round(avg_persons, 1),
        "maxPersonCount": max_persons,
        "personCountPerFrame": person_counts,
        "hasBall": has_ball,
        "suggestedMode": suggested_mode,
        "duration": round(duration, 2),
        "width": width,
        "height": height,
        "framesAnalyzed": len(person_counts),
    }


def get_video_meta(video_path):
    """Get video metadata without loading frames."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    meta = {
        "fps": cap.get(cv2.CAP_PROP_FPS) or 30,
        "totalFrames": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
        "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
        "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
    }
    meta["duration"] = meta["totalFrames"] / meta["fps"] if meta["fps"] > 0 else 0
    cap.release()
    return meta


def extract_frames_chunked(video_path, fps=2, chunk_seconds=300):
    """Generator that yields chunks of frames to avoid loading entire video into RAM.
    Each chunk covers approximately chunk_seconds of video.
    Yields: (frames_list, is_last_chunk)
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    frame_interval = max(1, int(video_fps / fps))
    chunk_frame_limit = int(chunk_seconds * fps)  # frames per chunk at target fps

    chunk = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % frame_interval == 0:
            timestamp = frame_idx / video_fps
            chunk.append({
                "frame": frame,
                "timestamp": round(timestamp, 3),
                "index": frame_idx,
            })

            if len(chunk) >= chunk_frame_limit:
                yield chunk, False
                chunk = []

        frame_idx += 1

    cap.release()

    if chunk:
        yield chunk, True
    else:
        yield [], True


def extract_frames(video_path, fps=2):
    """Extract all frames from video at the specified FPS. Loads entire video into RAM.
    For long videos (>10 min), use extract_frames_chunked() instead.
    """
    meta = get_video_meta(video_path)
    all_frames = []
    for chunk, _is_last in extract_frames_chunked(video_path, fps=fps, chunk_seconds=9999):
        all_frames.extend(chunk)
    return all_frames, meta


def run_yolo_detection(frames, video_meta):
    """Run YOLOv8 on each frame, detecting persons (0) and sports balls (32)."""
    model = get_yolo_model()
    w, h = video_meta["width"], video_meta["height"]

    detections = []
    ball_trajectory = []

    for frame_data in frames:
        frame = frame_data["frame"]
        timestamp = frame_data["timestamp"]

        # Redirect stdout during track() to suppress ultralytics warnings
        _real_stdout = sys.stdout
        sys.stdout = io.StringIO()
        try:
            results = model.track(frame, classes=[0, 32], persist=True, verbose=False)[0]
        finally:
            sys.stdout = _real_stdout

        players = []
        ball = None
        referees = []

        for box in results.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = box.xyxy[0].tolist()

            # Get persistent track ID (ByteTrack)
            track_id = int(box.id[0]) if box.id is not None else -1

            # Normalize to 0-1 range
            bbox = [
                round(x1 / w, 4),
                round(y1 / h, 4),
                round(x2 / w, 4),
                round(y2 / h, 4),
            ]

            if cls == 0:  # person
                players.append({
                    "bbox": bbox,
                    "confidence": round(conf, 3),
                    "teamId": -1,  # assigned later by clustering
                    "trackId": track_id,
                })
            elif cls == 32:  # sports ball
                ball = {
                    "bbox": bbox,
                    "confidence": round(conf, 3),
                }
                # Track ball center for trajectory
                cx = round((bbox[0] + bbox[2]) / 2, 4)
                cy = round((bbox[1] + bbox[3]) / 2, 4)
                ball_trajectory.append({
                    "timestamp": timestamp,
                    "x": cx,
                    "y": cy,
                })

        detections.append({
            "timestamp": timestamp,
            "players": players,
            "ball": ball,
            "referees": referees,
        })

    return detections, ball_trajectory


def interpolate_ball_trajectory(detections, ball_trajectory):
    """Fill gaps in ball trajectory using linear interpolation.
    Ball is typically detected in only 40-60% of frames. This fills the gaps
    so possession tracking and ball trail rendering are continuous.
    """
    if len(ball_trajectory) < 2:
        return ball_trajectory

    # Build lookup of existing ball positions
    ball_by_time = {b["timestamp"]: (b["x"], b["y"]) for b in ball_trajectory}

    # Get all frame timestamps
    all_timestamps = sorted(det["timestamp"] for det in detections)
    if not all_timestamps:
        return ball_trajectory

    # Build arrays of known positions for interpolation
    known_times = sorted(ball_by_time.keys())
    known_x = [ball_by_time[t][0] for t in known_times]
    known_y = [ball_by_time[t][1] for t in known_times]

    # Interpolate for all frame timestamps within the range of known positions
    min_t, max_t = known_times[0], known_times[-1]
    interpolated = []
    for t in all_timestamps:
        if t in ball_by_time:
            interpolated.append({"timestamp": t, "x": ball_by_time[t][0], "y": ball_by_time[t][1]})
        elif min_t < t < max_t:
            # Linear interpolation
            x = round(float(np.interp(t, known_times, known_x)), 4)
            y = round(float(np.interp(t, known_times, known_y)), 4)
            interpolated.append({"timestamp": t, "x": x, "y": y, "interpolated": True})

    return interpolated


def extract_color_histogram(crop_bgr):
    """Extract a color histogram fingerprint from a player crop.
    Focuses on the torso region (middle 60% height) to capture jersey color,
    ignoring the head and legs which vary more with pose.
    Uses HSV color space which is more robust to lighting changes.
    Returns a normalized 48-bin histogram (16 hue x 3 saturation buckets).
    """
    h, w = crop_bgr.shape[:2]
    # Focus on torso region (20%-80% of height, center 60% of width)
    y_start = max(0, int(h * 0.2))
    y_end = min(h, int(h * 0.8))
    x_start = max(0, int(w * 0.2))
    x_end = min(w, int(w * 0.8))
    torso = crop_bgr[y_start:y_end, x_start:x_end]

    if torso.size == 0:
        return np.zeros(48, dtype=np.float32)

    hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)
    # 16 hue bins, 3 saturation bins — captures jersey color compactly
    hist = cv2.calcHist([hsv], [0, 1], None, [16, 3],
                        [0, 180, 0, 256])
    hist = hist.flatten().astype(np.float32)
    total = hist.sum()
    if total > 0:
        hist = hist / total
    return hist


def crop_players(frames, detections, max_crops=150, min_per_track=5):
    """Crop player regions with track-aware sampling.
    Ensures every tracked player gets at least min_per_track crops
    for reliable fingerprinting and team assignment.
    Remaining budget distributed proportionally.
    Also extracts color histograms for each crop.
    """
    # Group by trackId
    track_refs = {}  # trackId -> [(frame_idx, player_idx)]
    untracked = []
    for i, det in enumerate(detections):
        for j, player in enumerate(det["players"]):
            tid = player.get("trackId", -1)
            if tid >= 0:
                if tid not in track_refs:
                    track_refs[tid] = []
                track_refs[tid].append((i, j))
            else:
                untracked.append((i, j))

    if not track_refs and not untracked:
        return []

    selected = set()

    # Guarantee min_per_track per track
    for tid, refs in track_refs.items():
        if len(refs) <= min_per_track:
            for r in refs:
                selected.add(r)
        else:
            indices = np.linspace(0, len(refs) - 1, min_per_track, dtype=int)
            for idx in indices:
                selected.add(refs[idx])

    # Fill remaining budget proportionally from all tracks
    remaining_budget = max_crops - len(selected)
    if remaining_budget > 0:
        extra_pool = []
        for tid, refs in track_refs.items():
            for r in refs:
                if r not in selected:
                    extra_pool.append(r)
        # Add untracked refs too
        for r in untracked:
            if r not in selected:
                extra_pool.append(r)

        if len(extra_pool) > remaining_budget:
            indices = np.linspace(0, len(extra_pool) - 1,
                                  remaining_budget, dtype=int)
            extra_pool = [extra_pool[i] for i in indices]
        for r in extra_pool:
            selected.add(r)

    # Convert to crops
    crops = []
    for frame_idx, player_idx in sorted(selected):
        frame = frames[frame_idx]["frame"]
        h, w = frame.shape[:2]
        bbox = detections[frame_idx]["players"][player_idx]["bbox"]

        x1 = max(0, int(bbox[0] * w))
        y1 = max(0, int(bbox[1] * h))
        x2 = min(w, int(bbox[2] * w))
        y2 = min(h, int(bbox[3] * h))

        if x2 - x1 < 10 or y2 - y1 < 10:
            continue

        crop = frame[y1:y2, x1:x2]
        crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(crop_rgb)

        # Extract color histogram from the BGR crop
        color_hist = extract_color_histogram(crop)

        crops.append({
            "image": pil_img,
            "frame_idx": frame_idx,
            "player_idx": player_idx,
            "color_hist": color_hist,
        })

    return crops


def extract_siglip_embeddings(crops, device="cpu"):
    """Extract SigLIP vision embeddings from player crops."""
    if not crops:
        return np.array([])

    import torch

    model, processor = get_siglip(device)
    embeddings = []

    # Process in batches of 8
    batch_size = 8
    for i in range(0, len(crops), batch_size):
        batch_images = [c["image"] for c in crops[i:i + batch_size]]
        inputs = processor(images=batch_images, return_tensors="pt")
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = model.vision_model(**inputs)

        # Extract pooled output (CLS token embedding)
        batch_embeddings = outputs.pooler_output.cpu().numpy()
        # L2 normalize
        norms = np.linalg.norm(batch_embeddings, axis=1, keepdims=True)
        norms = np.where(norms == 0, 1, norms)
        batch_embeddings = batch_embeddings / norms
        embeddings.append(batch_embeddings)

    return np.vstack(embeddings) if embeddings else np.array([])


def cluster_teams(embeddings, n_teams=2):
    """UMAP reduce + KMeans cluster to assign team IDs."""
    if len(embeddings) < n_teams:
        return np.zeros(len(embeddings), dtype=int)

    from umap import UMAP
    from sklearn.cluster import KMeans

    # UMAP reduce to 2D
    n_neighbors = min(15, len(embeddings) - 1)
    if n_neighbors < 2:
        n_neighbors = 2

    reducer = UMAP(n_components=2, n_neighbors=n_neighbors, random_state=42)
    reduced = reducer.fit_transform(embeddings)

    # KMeans cluster
    kmeans = KMeans(n_clusters=n_teams, random_state=42, n_init=10)
    labels = kmeans.fit_predict(reduced)

    return labels


def assign_team_ids(detections, crops, team_labels):
    """Propagate team IDs from clustered crops back to all detections.
    For players not in the crop sample, propagate team ID from the same
    trackId's majority vote across sampled frames.
    """
    if len(crops) == 0:
        return detections

    # Build a map of (frame_idx, player_idx) -> teamId from crops
    crop_team_map = {}
    for i, crop in enumerate(crops):
        team_id = int(team_labels[i]) if i < len(team_labels) else -1
        crop_team_map[(crop["frame_idx"], crop["player_idx"])] = team_id

    # Build per-track majority team vote from sampled crops
    track_team_votes = {}  # trackId -> {teamId: count}
    for i, crop in enumerate(crops):
        fi, pi = crop["frame_idx"], crop["player_idx"]
        if fi < len(detections) and pi < len(detections[fi]["players"]):
            tid = detections[fi]["players"][pi].get("trackId", -1)
            team_id = int(team_labels[i]) if i < len(team_labels) else -1
            if tid >= 0 and team_id >= 0:
                if tid not in track_team_votes:
                    track_team_votes[tid] = {}
                track_team_votes[tid][team_id] = (
                    track_team_votes[tid].get(team_id, 0) + 1
                )

    track_team = {}
    for tid, votes in track_team_votes.items():
        track_team[tid] = max(votes, key=votes.get)

    # Assign team IDs: use direct crop mapping first, then track majority
    for frame_idx, det in enumerate(detections):
        for player_idx, player in enumerate(det["players"]):
            key = (frame_idx, player_idx)
            if key in crop_team_map:
                player["teamId"] = crop_team_map[key]
            else:
                # Not sampled — use track's majority team
                tid = player.get("trackId", -1)
                player["teamId"] = track_team.get(tid, -1)

    return detections


def fingerprint_and_merge_tracks(detections, crops, embeddings,
                                  similarity_threshold=0.78):
    """Merge tracks that represent the same player re-entering the frame.

    Uses a multi-signal approach for robust re-identification:
    1. SigLIP embedding similarity (deep visual features)
    2. Color histogram similarity (jersey color — stable across poses)
    3. Spatial continuity (last-known position must be reachable)
    4. Same-team constraint (only merge players on the same team)

    Returns:
        detections: modified in-place with remapped trackIds
        merge_map: dict mapping old trackId -> canonical trackId
    """
    if len(crops) == 0 or len(embeddings) < 2:
        return detections, {}

    # Step 1: Map crop index -> trackId
    crop_to_track = {}
    for i, crop in enumerate(crops):
        fi, pi = crop["frame_idx"], crop["player_idx"]
        if fi < len(detections) and pi < len(detections[fi]["players"]):
            tid = detections[fi]["players"][pi].get("trackId", -1)
            if tid >= 0:
                crop_to_track[i] = tid

    # Step 2: Aggregate embeddings AND color histograms per track
    track_embeds = {}     # trackId -> [embedding vectors]
    track_colors = {}     # trackId -> [color histogram vectors]
    for crop_idx, tid in crop_to_track.items():
        if crop_idx < len(embeddings):
            if tid not in track_embeds:
                track_embeds[tid] = []
                track_colors[tid] = []
            track_embeds[tid].append(embeddings[crop_idx])
            color_hist = crops[crop_idx].get("color_hist")
            if color_hist is not None:
                track_colors[tid].append(color_hist)

    if len(track_embeds) < 2:
        return detections, {}

    # Step 3: Compute mean embedding + mean color histogram per track
    track_ids = sorted(track_embeds.keys())
    mean_embeds = {}
    mean_colors = {}
    for tid in track_ids:
        vecs = np.array(track_embeds[tid])
        mean_vec = vecs.mean(axis=0)
        norm = np.linalg.norm(mean_vec)
        if norm > 0:
            mean_vec = mean_vec / norm
        mean_embeds[tid] = mean_vec

        if track_colors.get(tid):
            mean_colors[tid] = np.array(track_colors[tid]).mean(axis=0)
        else:
            mean_colors[tid] = None

    # Step 4: Build temporal spans + spatial endpoints per track
    track_frames = {}      # trackId -> set of frame indices
    track_positions = {}   # trackId -> {first_frame, last_frame, first_pos, last_pos}
    track_team = {}        # trackId -> majority team id
    team_votes = {}        # trackId -> {teamId: count}

    for fi, det in enumerate(detections):
        for p in det["players"]:
            tid = p.get("trackId", -1)
            if tid < 0:
                continue
            if tid not in track_frames:
                track_frames[tid] = set()
                track_positions[tid] = {
                    "first_frame": fi, "last_frame": fi,
                    "first_pos": None, "last_pos": None,
                }
                team_votes[tid] = {}

            track_frames[tid].add(fi)

            cx = (p["bbox"][0] + p["bbox"][2]) / 2
            cy = (p["bbox"][1] + p["bbox"][3]) / 2
            pos = (cx, cy)

            if fi <= track_positions[tid]["first_frame"]:
                track_positions[tid]["first_frame"] = fi
                track_positions[tid]["first_pos"] = pos
            if fi >= track_positions[tid]["last_frame"]:
                track_positions[tid]["last_frame"] = fi
                track_positions[tid]["last_pos"] = pos

            t = p.get("teamId", -1)
            if t >= 0:
                team_votes[tid][t] = team_votes[tid].get(t, 0) + 1

    # Determine majority team per track
    for tid, votes in team_votes.items():
        if votes:
            track_team[tid] = max(votes, key=votes.get)
        else:
            track_team[tid] = -1

    # Step 5: Score-based pairwise matching
    merge_map = {}
    merge_scores = []  # [(score, tid_a, tid_b)] — rank by quality

    for i, tid_a in enumerate(track_ids):
        for j in range(i + 1, len(track_ids)):
            tid_b = track_ids[j]

            # Same-team constraint: don't merge players from different teams
            team_a = track_team.get(tid_a, -1)
            team_b = track_team.get(tid_b, -1)
            if team_a >= 0 and team_b >= 0 and team_a != team_b:
                continue

            # Temporal non-overlap check (allow small overlap of 2 frames)
            overlap = len(track_frames.get(tid_a, set()) &
                          track_frames.get(tid_b, set()))
            if overlap > 2:
                continue

            # Signal 1: SigLIP embedding cosine similarity (0-1)
            embed_sim = float(np.dot(mean_embeds[tid_a], mean_embeds[tid_b]))

            # Signal 2: Color histogram similarity (histogram intersection, 0-1)
            color_sim = 0.5  # neutral default if no color data
            if (mean_colors.get(tid_a) is not None and
                    mean_colors.get(tid_b) is not None):
                color_sim = float(np.minimum(
                    mean_colors[tid_a], mean_colors[tid_b]
                ).sum())

            # Signal 3: Spatial continuity score (0-1)
            spatial_score = 0.5  # neutral default
            pos_a = track_positions.get(tid_a, {})
            pos_b = track_positions.get(tid_b, {})

            # Determine which track ends first → gap → next track starts
            if (pos_a.get("last_frame", 0) < pos_b.get("first_frame", 0)):
                exit_pos = pos_a.get("last_pos")
                enter_pos = pos_b.get("first_pos")
                frame_gap = pos_b["first_frame"] - pos_a["last_frame"]
            elif (pos_b.get("last_frame", 0) < pos_a.get("first_frame", 0)):
                exit_pos = pos_b.get("last_pos")
                enter_pos = pos_a.get("first_pos")
                frame_gap = pos_a["first_frame"] - pos_b["last_frame"]
            else:
                exit_pos = None
                enter_pos = None
                frame_gap = 0

            if exit_pos and enter_pos and frame_gap > 0:
                distance = np.sqrt(
                    (exit_pos[0] - enter_pos[0]) ** 2 +
                    (exit_pos[1] - enter_pos[1]) ** 2
                )
                # Max plausible speed: ~0.15 normalized units per frame at 2fps
                # (a player can sprint ~10m/s → ~0.15 of pitch width per 0.5s)
                max_plausible = 0.15 * frame_gap
                if distance <= max_plausible:
                    spatial_score = 1.0 - (distance / max_plausible) * 0.5
                elif distance <= max_plausible * 2:
                    spatial_score = 0.3  # possible but unlikely
                else:
                    spatial_score = 0.0  # teleportation — reject

            # Combined score: weighted combination
            # Embedding: 45%, Color: 30%, Spatial: 25%
            combined = (embed_sim * 0.45 +
                        color_sim * 0.30 +
                        spatial_score * 0.25)

            # Minimum thresholds: embedding must be at least somewhat similar
            if embed_sim < 0.70:
                continue
            # Color must not be wildly different
            if color_sim < 0.25:
                continue
            # Spatial must be plausible
            if spatial_score < 0.1:
                continue

            if combined >= similarity_threshold:
                merge_scores.append((combined, tid_a, tid_b))

    # Sort by score descending — merge best matches first
    merge_scores.sort(key=lambda x: -x[0])

    for score, tid_a, tid_b in merge_scores:
        # Skip if either track already merged
        canonical_a = tid_a
        while canonical_a in merge_map:
            canonical_a = merge_map[canonical_a]
        canonical_b = tid_b
        while canonical_b in merge_map:
            canonical_b = merge_map[canonical_b]

        if canonical_a == canonical_b:
            continue

        # Re-check temporal overlap with merged spans
        overlap = len(track_frames.get(canonical_a, set()) &
                      track_frames.get(canonical_b, set()))
        if overlap > 2:
            continue

        merge_map[canonical_b] = canonical_a
        # Merge frame sets
        track_frames[canonical_a] = (track_frames.get(canonical_a, set()) |
                                     track_frames.get(canonical_b, set()))

    # Step 6: Apply merge_map to all detections
    if merge_map:
        for det in detections:
            for player in det["players"]:
                old_tid = player.get("trackId", -1)
                # Follow the merge chain to the canonical ID
                while old_tid in merge_map:
                    old_tid = merge_map[old_tid]
                player["trackId"] = old_tid

    return detections, merge_map


def filter_non_players(detections, crops, embeddings, team_labels,
                       outlier_threshold=0.65, min_frames_ratio=0.05):
    """Filter out non-players (referees, spectators, coaches, ball boys).

    Criteria for marking as non-player:
    1. Embedding outlier: cosine distance to both team cluster centers > threshold
    2. Low visibility + edge-only: visible in few frames and mostly at frame edges

    Sets player["isPlayer"] = False in detections for filtered tracks.
    Returns set of filtered trackIds.
    """
    if len(crops) == 0 or len(embeddings) < 4 or len(team_labels) < 4:
        return set()

    # Step 1: Compute team cluster centers from embeddings
    team_centers = {}
    for i, label in enumerate(team_labels):
        label_int = int(label)
        if label_int not in team_centers:
            team_centers[label_int] = []
        if i < len(embeddings):
            team_centers[label_int].append(embeddings[i])

    for label_int in list(team_centers.keys()):
        vecs = np.array(team_centers[label_int])
        center = vecs.mean(axis=0)
        norm = np.linalg.norm(center)
        if norm > 0:
            center = center / norm
        team_centers[label_int] = center

    if len(team_centers) < 2:
        return set()

    # Step 2: Map trackId -> mean embedding
    crop_to_track = {}
    for i, crop in enumerate(crops):
        fi, pi = crop["frame_idx"], crop["player_idx"]
        if fi < len(detections) and pi < len(detections[fi]["players"]):
            tid = detections[fi]["players"][pi].get("trackId", -1)
            if tid >= 0:
                crop_to_track[i] = tid

    track_embeds = {}
    for crop_idx, tid in crop_to_track.items():
        if crop_idx < len(embeddings):
            if tid not in track_embeds:
                track_embeds[tid] = []
            track_embeds[tid].append(embeddings[crop_idx])

    # Step 3: Per-track visibility and position stats
    total_frames = len(detections)
    track_stats = {}
    for fi, det in enumerate(detections):
        for p in det["players"]:
            tid = p.get("trackId", -1)
            if tid < 0:
                continue
            if tid not in track_stats:
                track_stats[tid] = {"frames": 0, "edge_frames": 0}
            track_stats[tid]["frames"] += 1
            cx = (p["bbox"][0] + p["bbox"][2]) / 2
            if cx < 0.05 or cx > 0.95:
                track_stats[tid]["edge_frames"] += 1

    # Step 4: Evaluate each track
    filtered_tracks = set()
    for tid, embed_list in track_embeds.items():
        mean_vec = np.array(embed_list).mean(axis=0)
        norm = np.linalg.norm(mean_vec)
        if norm > 0:
            mean_vec = mean_vec / norm

        distances = []
        for center in team_centers.values():
            sim = float(np.dot(mean_vec, center))
            distances.append(1.0 - sim)
        min_dist = min(distances) if distances else 1.0

        stats = track_stats.get(tid, {"frames": 0, "edge_frames": 0})
        frame_ratio = stats["frames"] / total_frames if total_frames > 0 else 0
        edge_ratio = (stats["edge_frames"] / stats["frames"]
                      if stats["frames"] > 0 else 0)

        is_non_player = False

        # Criterion 1: Embedding outlier (far from both teams)
        if min_dist > outlier_threshold:
            is_non_player = True

        # Criterion 2: Very low visibility + edge-heavy (spectators/bench)
        if frame_ratio < min_frames_ratio and edge_ratio > 0.5:
            is_non_player = True

        if is_non_player:
            filtered_tracks.add(tid)

    # Step 5: Mark in detections
    for det in detections:
        for player in det["players"]:
            tid = player.get("trackId", -1)
            player["isPlayer"] = tid not in filtered_tracks

    return filtered_tracks


def compute_player_stats(detections, ball_trajectory):
    """Compute per-player stats from tracked detections.
    Skips players marked as non-players (isPlayer=False).
    """
    # Build ball position lookup by timestamp
    ball_by_time = {}
    for b in ball_trajectory:
        ball_by_time[b["timestamp"]] = (b["x"], b["y"])

    # Gather per-trackId data across all frames
    player_data = {}  # trackId -> list of frame observations
    for det in detections:
        timestamp = det["timestamp"]
        ball_pos = ball_by_time.get(timestamp)

        for player in det["players"]:
            tid = player.get("trackId", -1)
            if tid < 0:
                continue
            if not player.get("isPlayer", True):
                continue

            bbox = player["bbox"]
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2

            ball_dist = None
            if ball_pos:
                ball_dist = ((cx - ball_pos[0]) ** 2 + (cy - ball_pos[1]) ** 2) ** 0.5

            if tid not in player_data:
                player_data[tid] = []

            player_data[tid].append({
                "timestamp": timestamp,
                "cx": round(cx, 4),
                "cy": round(cy, 4),
                "ballDist": round(ball_dist, 4) if ball_dist is not None else None,
                "teamId": player.get("teamId", -1),
            })

    # Compute stats
    player_stats = {}
    player_paths = {}

    for tid, observations in player_data.items():
        first_seen = observations[0]["timestamp"]
        last_seen = observations[-1]["timestamp"]
        frames_visible = len(observations)

        ball_dists = [o["ballDist"] for o in observations if o["ballDist"] is not None]
        avg_ball_dist = round(sum(ball_dists) / len(ball_dists), 4) if ball_dists else None
        min_ball_dist = round(min(ball_dists), 4) if ball_dists else None

        # Team ID: majority vote across observations
        team_votes = [o["teamId"] for o in observations if o["teamId"] >= 0]
        if team_votes:
            team_id = max(set(team_votes), key=team_votes.count)
        else:
            team_id = -1

        player_stats[str(tid)] = {
            "teamId": team_id,
            "firstSeen": first_seen,
            "lastSeen": last_seen,
            "framesVisible": frames_visible,
            "avgBallDistance": avg_ball_dist,
            "minBallDistance": min_ball_dist,
            "possessionFrames": 0,  # filled by compute_possession_timeline
        }

        player_paths[str(tid)] = [
            {"timestamp": o["timestamp"], "x": o["cx"], "y": o["cy"]}
            for o in observations
        ]

    return player_stats, player_paths


def compute_possession_timeline(detections, ball_trajectory, player_stats,
                                 inertia_frames=5, max_possession_dist=0.12):
    """Compute ball possession with inertia to prevent flickering.

    Uses a state machine: possession only changes when a different team's player
    is nearest for `inertia_frames` consecutive frames. This prevents false
    possession changes during rebounds and when the ball rolls past opponents.

    Args:
        inertia_frames: consecutive frames needed to switch possession (default 5 at 2fps = 2.5s)
        max_possession_dist: max normalized distance to count as "in possession" (default 0.12)
    """
    ball_by_time = {}
    for b in ball_trajectory:
        ball_by_time[b["timestamp"]] = (b["x"], b["y"])

    timeline = []
    possession_count = {}  # trackId -> frames with possession

    # Inertia state
    current_team = -1
    current_player = -1
    candidate_team = -1
    candidate_player = -1
    candidate_streak = 0

    for det in detections:
        timestamp = det["timestamp"]
        ball_pos = ball_by_time.get(timestamp)
        if not ball_pos:
            continue

        # Find nearest player to ball
        nearest_tid = None
        nearest_dist = float("inf")

        for player in det["players"]:
            tid = player.get("trackId", -1)
            if tid < 0:
                continue
            if not player.get("isPlayer", True):
                continue
            bbox = player["bbox"]
            # Use bottom-center of bbox (feet) for more accurate possession
            cx = (bbox[0] + bbox[2]) / 2
            cy = bbox[3]  # bottom of bbox
            dist = ((cx - ball_pos[0]) ** 2 + (cy - ball_pos[1]) ** 2) ** 0.5

            if dist < nearest_dist:
                nearest_dist = dist
                nearest_tid = tid

        if nearest_tid is None or nearest_dist > max_possession_dist:
            # No player close enough — maintain current possession
            candidate_streak = 0
            if current_team >= 0:
                timeline.append({
                    "timestamp": timestamp,
                    "teamId": current_team,
                    "playerId": current_player,
                    "distance": round(nearest_dist, 4) if nearest_tid else None,
                })
                possession_count[current_player] = possession_count.get(current_player, 0) + 1
            continue

        nearest_team = player_stats.get(str(nearest_tid), {}).get("teamId", -1)

        # Apply inertia: only switch possession after K consecutive frames
        if current_team < 0:
            # First possession assignment — no inertia needed
            current_team = nearest_team
            current_player = nearest_tid
        elif nearest_team != current_team and nearest_team >= 0:
            # Different team is nearest — start/continue candidate streak
            if nearest_team == candidate_team:
                candidate_streak += 1
            else:
                candidate_team = nearest_team
                candidate_player = nearest_tid
                candidate_streak = 1

            if candidate_streak >= inertia_frames:
                # Enough consecutive frames — switch possession
                current_team = candidate_team
                current_player = candidate_player
                candidate_streak = 0
        else:
            # Same team still has possession — update player, reset candidate
            current_player = nearest_tid
            candidate_streak = 0

        timeline.append({
            "timestamp": timestamp,
            "teamId": current_team,
            "playerId": current_player,
            "distance": round(nearest_dist, 4),
        })
        possession_count[current_player] = possession_count.get(current_player, 0) + 1

    # Update player_stats with possession frames
    for tid, count in possession_count.items():
        if str(tid) in player_stats:
            player_stats[str(tid)]["possessionFrames"] = count

    return timeline


def detect_passes(possession_timeline, player_stats, min_possession_frames=2):
    """Detect passes and turnovers from the possession timeline.

    A pass = ball goes from Player A to Player B on the same team.
    A turnover = ball goes from Player A (Team X) to Player B (Team Y).

    Args:
        min_possession_frames: minimum frames a player must hold possession
            before a transfer counts (filters noise)
    """
    if len(possession_timeline) < 2:
        return []

    events = []
    # Track runs of same player possession
    run_start = 0
    prev_player = possession_timeline[0].get("playerId")

    for i in range(1, len(possession_timeline)):
        curr_player = possession_timeline[i].get("playerId")

        if curr_player != prev_player:
            run_length = i - run_start

            if run_length >= min_possession_frames and prev_player is not None and curr_player is not None:
                prev_team = player_stats.get(str(prev_player), {}).get("teamId", -1)
                curr_team = player_stats.get(str(curr_player), {}).get("teamId", -1)

                if prev_team >= 0 and curr_team >= 0:
                    is_pass = prev_team == curr_team
                    events.append({
                        "timestamp": possession_timeline[i]["timestamp"],
                        "type": "pass" if is_pass else "turnover",
                        "fromPlayer": prev_player,
                        "toPlayer": curr_player,
                        "fromTeam": prev_team,
                        "toTeam": curr_team,
                    })

            run_start = i
            prev_player = curr_player

    return events


def extract_key_frames(detections, ball_trajectory, player_paths, ball_contact_threshold=0.08):
    """Identify key frames: ball contacts, direction changes, regular checkpoints."""
    ball_by_time = {}
    for b in ball_trajectory:
        ball_by_time[b["timestamp"]] = (b["x"], b["y"])

    key_frames = []
    seen_contacts = set()

    for det in detections:
        timestamp = det["timestamp"]
        ball_pos = ball_by_time.get(timestamp)
        if not ball_pos:
            continue

        for player in det["players"]:
            tid = player.get("trackId", -1)
            if tid < 0:
                continue
            bbox = player["bbox"]
            cx = (bbox[0] + bbox[2]) / 2
            cy = (bbox[1] + bbox[3]) / 2
            dist = ((cx - ball_pos[0]) ** 2 + (cy - ball_pos[1]) ** 2) ** 0.5

            if dist < ball_contact_threshold:
                # Debounce: only one contact per player per 1s window
                window_key = (tid, round(timestamp))
                if window_key not in seen_contacts:
                    seen_contacts.add(window_key)
                    key_frames.append({
                        "timestamp": timestamp,
                        "type": "ball_contact",
                        "playerId": tid,
                    })

    # Add direction changes for players with enough path data
    for tid_str, path in player_paths.items():
        if len(path) < 3:
            continue
        for i in range(1, len(path) - 1):
            dx1 = path[i]["x"] - path[i - 1]["x"]
            dy1 = path[i]["y"] - path[i - 1]["y"]
            dx2 = path[i + 1]["x"] - path[i]["x"]
            dy2 = path[i + 1]["y"] - path[i]["y"]

            # Dot product to detect sharp turns (< 0 means > 90 degree turn)
            dot = dx1 * dx2 + dy1 * dy2
            mag1 = (dx1 ** 2 + dy1 ** 2) ** 0.5
            mag2 = (dx2 ** 2 + dy2 ** 2) ** 0.5

            if mag1 > 0.01 and mag2 > 0.01:
                cos_angle = dot / (mag1 * mag2)
                if cos_angle < -0.3:  # Sharp direction change
                    key_frames.append({
                        "timestamp": path[i]["timestamp"],
                        "type": "direction_change",
                        "playerId": int(tid_str),
                    })

    # Sort by timestamp
    key_frames.sort(key=lambda kf: kf["timestamp"])

    return key_frames


def process_video(video_path, fps=2, max_crops=150, progress_callback=None):
    """Run the full ML pipeline on a video.
    Supports long videos by processing frames in chunks to limit RAM usage.
    YOLO ByteTrack persists across chunks (same model instance).
    """

    if progress_callback:
        progress_callback("Reading video metadata", 2)

    video_meta = get_video_meta(video_path)
    duration = video_meta.get("duration", 0)
    is_long = duration > 600  # > 10 minutes

    # For long videos, process detection + pose in chunks to limit RAM
    # For short videos, load all frames at once (simpler, same behavior as before)
    chunk_seconds = 300 if is_long else 9999  # 5-min chunks for long videos

    if progress_callback:
        progress_callback("Extracting frames & detecting players", 5)

    all_frames = []
    detections = []
    ball_trajectory = []
    chunk_num = 0
    estimated_chunks = max(1, int(duration / chunk_seconds)) if is_long else 1

    for chunk_frames, is_last in extract_frames_chunked(video_path, fps=fps, chunk_seconds=chunk_seconds):
        if not chunk_frames:
            continue

        chunk_num += 1
        chunk_pct = int(5 + (chunk_num / estimated_chunks) * 25)

        if progress_callback:
            if is_long:
                progress_callback(
                    f"Processing chunk {chunk_num}/{estimated_chunks} "
                    f"({chunk_frames[0]['timestamp']:.0f}s-{chunk_frames[-1]['timestamp']:.0f}s)",
                    min(chunk_pct, 30),
                )
            else:
                progress_callback("Running player detection", 15)

        # YOLO detection — ByteTrack persists across chunks via model.track(persist=True)
        chunk_dets, chunk_balls = run_yolo_detection(chunk_frames, video_meta)
        detections.extend(chunk_dets)
        ball_trajectory.extend(chunk_balls)

        # Pose estimation on this chunk (while frames are in RAM)
        run_pose_estimation(chunk_frames, chunk_dets, video_meta)

        # Keep frames for cropping but release BGR data for already-processed
        # pose frames. We only need the frame for crop_players later.
        all_frames.extend(chunk_frames)

    if len(all_frames) == 0:
        return {"error": "No frames extracted from video"}

    if progress_callback:
        progress_callback("Cropping players", 40)

    # Step 3: Track-aware crop players for embedding
    # Scale max_crops with video length (more frames = more diversity needed)
    effective_max_crops = max(max_crops, int(len(all_frames) * 0.5)) if is_long else max_crops
    effective_max_crops = min(effective_max_crops, 500)  # cap at 500
    crops = crop_players(all_frames, detections, max_crops=effective_max_crops)

    # Release frame BGR data — no longer needed after cropping
    for f in all_frames:
        f["frame"] = None

    if progress_callback:
        progress_callback("Extracting visual features", 50)

    # Step 4: SigLIP embeddings
    embeddings = extract_siglip_embeddings(crops)

    if progress_callback:
        progress_callback("Clustering teams", 65)

    # Step 5: UMAP + KMeans
    if len(embeddings) >= 2:
        team_labels = cluster_teams(embeddings, n_teams=2)
    else:
        team_labels = np.zeros(len(embeddings), dtype=int)

    # Step 6: Assign team IDs back to detections
    detections = assign_team_ids(detections, crops, team_labels)

    if progress_callback:
        progress_callback("Fingerprinting players", 75)

    # Step 7: Fingerprint and merge re-entering players
    detections, merge_map = fingerprint_and_merge_tracks(
        detections, crops, embeddings
    )

    if progress_callback:
        progress_callback("Filtering non-players", 80)

    # Step 8: Filter non-players (refs, spectators, coaches)
    filtered_tracks = filter_non_players(
        detections, crops, embeddings, team_labels
    )

    if progress_callback:
        progress_callback("Computing player stats", 88)

    # Step 9: Interpolate ball trajectory through detection gaps
    raw_ball_count = len(ball_trajectory)
    ball_trajectory = interpolate_ball_trajectory(detections, ball_trajectory)

    # Step 10: Compute per-player stats and paths (skips non-players)
    player_stats, player_paths = compute_player_stats(detections, ball_trajectory)

    # Step 11: Compute possession timeline with inertia (skips non-players)
    possession_timeline = compute_possession_timeline(
        detections, ball_trajectory, player_stats
    )

    # Step 12: Detect passes and turnovers from possession timeline
    pass_events = detect_passes(possession_timeline, player_stats)

    # Step 13: Extract key frames
    key_frames = extract_key_frames(
        detections, ball_trajectory, player_paths
    )

    if progress_callback:
        progress_callback("Complete", 100)

    # Count unique tracked players (only actual players)
    unique_track_ids = set()
    for det in detections:
        for p in det["players"]:
            tid = p.get("trackId", -1)
            if tid >= 0 and p.get("isPlayer", True):
                unique_track_ids.add(tid)

    # Build output
    result = {
        "detections": detections,
        "ballTrajectory": ball_trajectory,
        "teams": {
            "count": 2,
            "labels": ["Team A", "Team B"],
        },
        "playerPaths": player_paths,
        "playerStats": player_stats,
        "possessionTimeline": possession_timeline,
        "passEvents": pass_events,
        "keyFrames": key_frames,
        "mergedTracks": {str(k): v for k, v in merge_map.items()},
        "filteredTracks": [int(t) for t in filtered_tracks],
        "processingMeta": {
            "fps": fps,
            "framesProcessed": len(all_frames),
            "playersDetected": sum(len(d["players"]) for d in detections),
            "uniquePlayersTracked": len(unique_track_ids),
            "ballDetections": raw_ball_count,
            "ballInterpolated": len(ball_trajectory) - raw_ball_count,
            "cropsEmbedded": len(crops),
            "tracksMerged": len(merge_map),
            "nonPlayersFiltered": len(filtered_tracks),
            "videoDuration": round(duration, 1),
            "isLongVideo": is_long,
            "modelVersion": "yolov8n + mediapipe-pose + siglip-reID",
            "poseEstimation": True,
            "trackingEnabled": True,
        },
    }

    return result


def main():
    parser = argparse.ArgumentParser(description="Football ML Pipeline")
    parser.add_argument("video_path", help="Path to video file")
    parser.add_argument("--fps", type=float, default=2, help="Frames per second to process")
    parser.add_argument("--max-crops", type=int, default=150, help="Max player crops for SigLIP")
    parser.add_argument("--triage", action="store_true",
                        help="Quick triage mode: detect player count only (<5s)")
    args = parser.parse_args()

    if args.triage:
        result = triage_video(args.video_path)
        print(json.dumps(result))
        return

    def progress(stage, pct):
        # Write progress to stderr so it doesn't pollute JSON stdout
        print(json.dumps({"progress": pct, "stage": stage}), file=sys.stderr)

    result = process_video(
        args.video_path,
        fps=args.fps,
        max_crops=args.max_crops,
        progress_callback=progress,
    )

    # Output JSON to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
