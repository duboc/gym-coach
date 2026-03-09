# Project Brief: Football Video Analysis

## Overview
A web-based sports tracking application focused exclusively on football (soccer). It uses MediaPipe's Holistic model and Google's Gemini API to analyze uploaded videos or imported YouTube clips of athletic techniques, extracting pose data to provide intelligent, AI-driven coaching feedback.

## Core Requirements

1. **Video Processing & Pose Detection**
   - Utilize MediaPipe Holistic model for accurate body tracking
   - Process pre-recorded `.mp4` uploads and YouTube video imports
   - Extract frame-by-frame pose landmarks from video inputs

2. **Football Domain Focus**
   - Support for specific football techniques (e.g., Instep kick, dribbling, passing)
   - Detect distinct phases of movement (Approach, Plant, Contact, Follow-through)

3. **Performance Tracking & Metrics**
   - Measure joint angles, symmetry, and high-speed movement dynamics
   - Identify technique flaws using football-specific coaching rules (e.g., knee-over-ball, plant foot position)

4. **AI-Powered Feedback**
   - Integrate with Google's Gemini API to analyze aggregated pose data
   - Provide visual overlays, timeline scrubbing, and audio voice coaching
   - Generate actionable recommendations based on technique analysis

5. **User Experience & Architecture**
   - Client-side heavy architecture for video processing to ensure privacy and reduce server costs
   - Node.js backend acting as a proxy to safely import YouTube videos, bypassing Canvas CORS restrictions
   - Intuitive dashboard to review past analyses

## Target Users
- Football players seeking form guidance and technique improvement
- Coaches looking for objective, data-driven analysis of their players
- Sports enthusiasts interested in comparing their form to professional players

## Success Criteria
- Accurate pose detection across diverse camera angles and video resolutions
- Reliable phase detection (identifying the exact moment of ball contact)
- Actionable, context-aware AI feedback that understands sports biomechanics
- Smooth user experience when searching, importing, and analyzing YouTube clips

## Constraints
- Processing relies heavily on client-side compute power; high-res videos may cause slowdowns
- Needs internet connection for MediaPipe models, Gemini API, and YouTube search
- Requires Gemini API key for AI-powered feedback
- YouTube imports are restricted by standard API limitations (e.g., age-gated or copyright-protected videos)
