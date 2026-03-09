// Client-side video processing with MediaPipe
// Processes uploaded videos frame-by-frame to extract pose landmarks

class VideoProcessor {
  constructor() {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.holistic = null;
    this.landmarks = [];
    this.currentFrame = 0;
    this.totalFrames = 0;
    this.fps = 15; // 15 FPS recommended for sports analysis
    this.processing = false;
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
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      refineFaceLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    return new Promise((resolve) => {
      this.holistic.onResults((results) => {
        this._onResults(results);
      });
      resolve();
    });
  }

  _onResults(results) {
    if (results.poseLandmarks) {
      this.landmarks.push({
        frame: this.currentFrame,
        timestamp: this.video.currentTime,
        pose: results.poseLandmarks,
        leftHand: results.leftHandLandmarks || null,
        rightHand: results.rightHandLandmarks || null,
      });
    }
  }

  async processVideo(videoFile, progressCallback, completeCallback) {
    this.landmarks = [];
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
      await this.holistic.send({ image: this.canvas });

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

  getMetadata() {
    return {
      duration: this.video ? this.video.duration : 0,
      fps: this.fps,
      totalFrames: this.totalFrames,
      landmarksCount: this.landmarks.length,
      width: this.canvas ? this.canvas.width : 0,
      height: this.canvas ? this.canvas.height : 0,
    };
  }
}

export default VideoProcessor;
