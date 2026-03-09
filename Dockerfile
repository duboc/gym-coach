FROM node:18-slim

# Install nginx, Python, and yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx python3 python3-pip python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Install Python ML dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# Pre-download model weights (cached in Docker layer)
RUN python3 -c "from ultralytics import YOLO; YOLO('yolov8n.pt')" \
    && python3 -c "from transformers import AutoModel, AutoProcessor; \
       AutoProcessor.from_pretrained('google/siglip-base-patch16-224'); \
       AutoModel.from_pretrained('google/siglip-base-patch16-224')" \
    && mkdir -p /root/.mediapipe \
    && python3 -c "import urllib.request; urllib.request.urlretrieve( \
       'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task', \
       '/root/.mediapipe/pose_landmarker_lite.task')"

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Create public directory structure
RUN mkdir -p public/shared public/video-analysis

# Copy root landing page
COPY index.html public/
COPY styles.css public/

# Copy shared modules
COPY shared/*.js public/shared/

# Copy video analysis app
COPY video-analysis/*.html video-analysis/*.css video-analysis/*.js public/video-analysis/

# Copy favicon if present
COPY favicon.ico public/ 2>/dev/null || true

# Copy memory-bank if present
COPY memory-bank public/memory-bank 2>/dev/null || true

# Copy server files
COPY server.js ./
COPY ml_pipeline.py ./

# Copy nginx configuration
COPY nginx.conf /etc/nginx/sites-enabled/default

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

# Start the server
CMD ["npm", "start"]
