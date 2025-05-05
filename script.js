// DOM Elements
let videoElement = document.querySelector('.input-video');
let canvasElement = document.querySelector('.output-canvas');
let canvasCtx = canvasElement.getContext('2d');
const startCameraButton = document.getElementById('start-camera');
const exerciseListContainer = document.getElementById('exercise-list');
const currentExerciseSpan = document.getElementById('current-exercise');
const exerciseDetailsContainer = document.getElementById('exercise-details');
const startExerciseButton = document.getElementById('start-exercise');
const repCounterContainer = document.getElementById('rep-counter-container');

// Import modules
import { geminiAPI } from './gemini-api.js';
import exercisesModule, { exercises } from './exercises.js';
import FormVisualizer from './visualization.js';
import AudioCoach from './audio-coach.js';
import AdvancedAnalytics from './advanced-analytics.js';
import documentationManager from './documentation.js';
import { exerciseMetrics, determineFeedbackSeverity, smoothAngle, calculateAngle } from './exercise-metrics.js';

// Global variables
let camera = null;
let holistic = null;
let selectedExercise = null;
let isExerciseActive = false;
let lastPoseData = null;
let repCount = 0;
let repState = 'waiting'; // waiting, up, down
let previousRepState = 'waiting'; // Track previous rep state for transitions
let exerciseData = []; // Store exercise data for analysis
let lastFeedbackUpdate = Date.now();
let feedbackInterval = 30000; // 30 seconds between feedback updates

// Angle history for smoothing
let angleHistory = {
  rightElbow: [],
  leftElbow: [],
  rightShoulder: [],
  leftShoulder: [],
  rightKnee: [],
  leftKnee: []
};

// State machine timeout handling
let stateTimeout = {
  state: null,
  startTime: null,
  maxDuration: 3000 // 3 seconds max in any state
};

// Debug mode for rep counting
let debugRepCounting = true;

// Visualization, audio feedback, and analytics
let visualizer = null;
let audioCoach = null;
let analytics = null;

// Initialize the application
function initApp() {
  console.log('Initializing application...');
  console.log('Exercises loaded:', exercisesModule ? 'Yes' : 'No');
  
  // Ensure exercises are available
  if (!exercisesModule && !exercises) {
    console.error('Failed to load exercises data. Please refresh the page.');
    alert('Failed to load exercises data. Please refresh the page.');
    return;
  }
  
  // Use either the default export or named export
  const exerciseList = exercisesModule || exercises;
  
  // Initialize visualization
  visualizer = new FormVisualizer(canvasElement, canvasCtx);
  
  // Initialize audio coach
  audioCoach = new AudioCoach({
    enabled: true,
    feedbackFrequency: 'normal'
  });
  
  // Initialize advanced analytics
  analytics = new AdvancedAnalytics();
  analytics.loadExerciseData(); // Load any existing data
  
  // Initialize documentation manager
  documentationManager.initialize();
  
  renderExerciseList(exerciseList);
  setupEventListeners();
  initializeMediaPipe();
  
  // Add visualization and audio controls to the UI
  addVisualizationControls();
  addAudioControls();
  addAnalyticsControls();
}

// Add visualization controls to the UI
function addVisualizationControls() {
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'visualization-controls';
  controlsContainer.innerHTML = `
    <h3><i class="fas fa-eye"></i> Visualization Options</h3>
    <div class="control-group">
      <label class="toggle-switch">
        <input type="checkbox" id="show-guides" checked>
        <span class="toggle-slider"></span>
        <span class="toggle-label">Movement Guides</span>
      </label>
    </div>
    <div class="control-group">
      <label class="toggle-switch">
        <input type="checkbox" id="show-corrections" checked>
        <span class="toggle-slider"></span>
        <span class="toggle-label">Form Corrections</span>
      </label>
    </div>
    <div class="control-group">
      <label class="toggle-switch">
        <input type="checkbox" id="show-heatmap">
        <span class="toggle-slider"></span>
        <span class="toggle-label">Muscle Heatmap</span>
      </label>
    </div>
  `;
  
  // Add to the camera section
  const cameraSection = document.querySelector('.camera-section');
  cameraSection.appendChild(controlsContainer);
  
  // Set up event listeners for visualization controls
  document.getElementById('show-guides').addEventListener('change', (e) => {
    visualizer.showGuides = e.target.checked;
  });
  
  document.getElementById('show-corrections').addEventListener('change', (e) => {
    visualizer.showCorrections = e.target.checked;
  });
  
  document.getElementById('show-heatmap').addEventListener('change', (e) => {
    visualizer.showHeatmap = e.target.checked;
  });
}

// Add audio controls to the UI
function addAudioControls() {
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'audio-controls';
  controlsContainer.innerHTML = `
    <h3><i class="fas fa-volume-up"></i> Audio Feedback</h3>
    <div class="control-group">
      <label class="toggle-switch">
        <input type="checkbox" id="audio-enabled" checked>
        <span class="toggle-slider"></span>
        <span class="toggle-label">Enable Voice Coach</span>
      </label>
    </div>
    <div class="control-group">
      <label for="feedback-frequency">Feedback Frequency:</label>
      <select id="feedback-frequency" class="select-control">
        <option value="minimal">Minimal</option>
        <option value="normal" selected>Normal</option>
        <option value="detailed">Detailed</option>
      </select>
    </div>
    <div class="control-group">
      <label for="voice-select">Voice:</label>
      <select id="voice-select" class="select-control">
        <option value="0">Default</option>
      </select>
    </div>
    <div class="control-group">
      <label for="volume-control">Volume:</label>
      <input type="range" id="volume-control" min="0" max="1" step="0.1" value="1" class="range-control">
    </div>
  `;
  
  // Add to the camera section
  const cameraSection = document.querySelector('.camera-section');
  cameraSection.appendChild(controlsContainer);
  
  // Set up event listeners for audio controls
  document.getElementById('audio-enabled').addEventListener('change', (e) => {
    audioCoach.setEnabled(e.target.checked);
  });
  
  document.getElementById('feedback-frequency').addEventListener('change', (e) => {
    audioCoach.updateVoiceSettings({ feedbackFrequency: e.target.value });
  });
  
  document.getElementById('volume-control').addEventListener('input', (e) => {
    audioCoach.updateVoiceSettings({ volume: parseFloat(e.target.value) });
  });
  
  // Populate voice select when voices are loaded
  const voiceSelect = document.getElementById('voice-select');
  
  // Function to populate voice options
  function populateVoiceList() {
    if (audioCoach.voices.length === 0) return;
    
    // Clear existing options
    voiceSelect.innerHTML = '';
    
    // Group voices by language
    const voicesByLang = {
      en: [],
      es: [],
      pt: []
    };
    
    // Categorize voices by language
    audioCoach.voices.forEach((voice, index) => {
      const lang = voice.lang.toLowerCase().substring(0, 2);
      if (voicesByLang[lang]) {
        voicesByLang[lang].push({ voice, index });
      }
    });
    
    // Create option groups for each language
    const languages = {
      en: 'English',
      es: 'Spanish',
      pt: 'Portuguese'
    };
    
    // Add voices to select, grouped by language
    Object.entries(languages).forEach(([langCode, langName]) => {
      if (voicesByLang[langCode].length > 0) {
        const group = document.createElement('optgroup');
        group.label = langName;
        
        voicesByLang[langCode].forEach(({ voice, index }) => {
          const option = document.createElement('option');
          option.value = index;
          option.textContent = voice.name;
          option.selected = index === audioCoach.options.voiceIndex;
          group.appendChild(option);
        });
        
        voiceSelect.appendChild(group);
      }
    });
  }
  
  // Initial population
  setTimeout(populateVoiceList, 1000);
  
  // Update when voices change
  voiceSelect.addEventListener('change', (e) => {
    audioCoach.updateVoiceSettings({ voiceIndex: parseInt(e.target.value) });
  });
}

// Render the list of exercises
function renderExerciseList(exerciseList) {
  exerciseListContainer.innerHTML = '';
  
  // Use the passed exercises list to avoid potential reference issues
  exerciseList.forEach(exercise => {
    const exerciseCard = document.createElement('div');
    exerciseCard.classList.add('exercise-card');
    exerciseCard.dataset.id = exercise.id;
    
    const exerciseName = document.createElement('h3');
    exerciseName.textContent = exercise.name;
    
    const exerciseDifficulty = document.createElement('div');
    exerciseDifficulty.classList.add('difficulty');
    exerciseDifficulty.textContent = exercise.difficulty;
    
    const exerciseDescription = document.createElement('div');
    exerciseDescription.classList.add('description');
    exerciseDescription.textContent = exercise.description;
    
    exerciseCard.appendChild(exerciseName);
    exerciseCard.appendChild(exerciseDifficulty);
    exerciseCard.appendChild(exerciseDescription);
    
    exerciseListContainer.appendChild(exerciseCard);
  });
}

// Setup event listeners
function setupEventListeners() {
  // Start camera button
  startCameraButton.addEventListener('click', toggleCamera);
  
  // Exercise selection
  exerciseListContainer.addEventListener('click', (e) => {
    const card = e.target.closest('.exercise-card');
    if (card) {
      selectExercise(parseInt(card.dataset.id));
    }
  });
  
  // Start exercise button
  startExerciseButton.addEventListener('click', toggleExercise);
}

// Toggle camera on/off
function toggleCamera() {
  const buttonText = startCameraButton.querySelector('span');
  const buttonIcon = startCameraButton.querySelector('i');
  
  if (camera) {
    camera.stop();
    camera = null;
    canvasElement.style.display = 'none';
    buttonText.textContent = 'Start Camera';
    buttonIcon.className = 'fas fa-video';
  } else {
    startCamera();
    canvasElement.style.display = 'block';
    buttonText.textContent = 'Stop Camera';
    buttonIcon.className = 'fas fa-video-slash';
  }
}

// Start the camera
function startCamera() {
  if (!camera) {
    // Check if we're in a secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      showCameraError("Camera access requires a secure context (HTTPS or localhost).");
      return;
    }
    
    // Check if the browser supports mediaDevices API
    if (!navigator.mediaDevices) {
      showCameraError("Your browser doesn't support camera access. Try using Chrome, Firefox, or Edge.");
      return;
    }
    
    try {
      camera = new Camera(videoElement, {
        onFrame: async () => {
          await holistic.send({image: videoElement});
        },
        width: 640,
        height: 480
      });
      
      camera.start().catch(error => {
        console.error("Error starting camera:", error);
        showCameraError("Could not access your camera. Please check permissions and try again.");
        camera = null;
      });
    } catch (error) {
      console.error("Error initializing camera:", error);
      showCameraError("Failed to initialize camera. Please check your device and browser settings.");
    }
  }
}

// Display camera error message
function showCameraError(message) {
  // Reset camera button state
  const buttonText = startCameraButton.querySelector('span');
  const buttonIcon = startCameraButton.querySelector('i');
  buttonText.textContent = 'Start Camera';
  buttonIcon.className = 'fas fa-video';
  
  // Show error message
  const errorDiv = document.createElement('div');
  errorDiv.className = 'camera-error';
  errorDiv.innerHTML = `
    <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
    <p>${message}</p>
    <p class="error-help">Make sure you've granted camera permissions and are using a supported browser.</p>
  `;
  
  // Replace canvas with error message
  canvasElement.style.display = 'none';
  const cameraSection = document.querySelector('.camera-section');
  
  // Remove any existing error message
  const existingError = cameraSection.querySelector('.camera-error');
  if (existingError) {
    cameraSection.removeChild(existingError);
  }
  
  // Insert error message before the camera controls
  const cameraControls = cameraSection.querySelector('.camera-controls');
  cameraSection.insertBefore(errorDiv, cameraControls);
}

// Initialize MediaPipe Holistic
function initializeMediaPipe() {
  try {
    holistic = new Holistic({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
      }
    });
    
    holistic.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: true,
      smoothSegmentation: true,
      refineFaceLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    
    holistic.onResults(onResults);
    
    // Add error handling
    holistic.onError = (error) => {
      console.error('MediaPipe Holistic error:', error);
      showCameraError("Error processing camera feed. Please refresh the page and try again.");
      
      // Stop the camera if there's an error
      if (camera) {
        camera.stop();
        camera = null;
        
        // Update button state
        const buttonText = startCameraButton.querySelector('span');
        const buttonIcon = startCameraButton.querySelector('i');
        buttonText.textContent = 'Start Camera';
        buttonIcon.className = 'fas fa-video';
      }
    };
  } catch (error) {
    console.error('Error initializing MediaPipe Holistic:', error);
    showCameraError("Failed to initialize pose detection. Please check your browser compatibility and try again.");
  }
}

// Process MediaPipe results
function onResults(results) {
  try {
    // Save the pose data for exercise analysis
    if (results.poseLandmarks) {
      lastPoseData = {
        pose: results.poseLandmarks,
        poseWorld: results.poseWorldLandmarks,
        leftHand: results.leftHandLandmarks,
        rightHand: results.rightHandLandmarks,
        face: results.faceLandmarks,
        timestamp: Date.now()
      };
    }
  
    // Clear the canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Draw the camera feed on the canvas - this is the primary element
    if (results.image) {
      canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }
    
    // Draw the pose landmarks on the camera feed - this is essential
    drawPose(results);
    
    // Analyze the exercise if active
    if (isExerciseActive && selectedExercise && lastPoseData) {
      const metrics = analyzeExercise();
      
      // Store the metrics for batch analysis
      if (metrics) {
        exerciseData.push(metrics);
        
        // Update visualizer with latest data
        if (visualizer) {
          visualizer.update(
            lastPoseData, 
            metrics.formQuality, 
            metrics.formIssues, 
            selectedExercise.name
          );
          visualizer.render(metrics);
        }
        
        // Provide audio feedback
        if (audioCoach) {
          try {
            // Provide form feedback if there are issues
            if (metrics.formIssues && metrics.formIssues.length > 0) {
              audioCoach.provideFormFeedback(selectedExercise.name, metrics.formIssues);
            }
            
            // Provide breathing cues based on rep state
            audioCoach.provideBreathingCue(selectedExercise.name, repState);
          } catch (error) {
            console.warn('Error providing audio feedback:', error);
            // Continue without audio feedback if there's an error
          }
        }
      }
      
      // Check if it's time to generate feedback
      if (Date.now() - lastFeedbackUpdate >= feedbackInterval) {
        generateExerciseFeedback(exerciseData);
        lastFeedbackUpdate = Date.now();
        exerciseData = []; // Reset data after sending for analysis
      }
    }
    
    canvasCtx.restore();
  } catch (error) {
    console.error('Error in onResults:', error);
    // Continue processing to avoid crashing the camera feed
    canvasCtx.restore();
  }
}

// Draw the pose landmarks on the canvas
function drawPose(results) {
  // Draw pose landmarks - essential for exercise tracking
  if (results.poseLandmarks) {
    // Draw connections between landmarks with improved visibility
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#3a86ff', lineWidth: 4});
    
    // Draw the landmarks themselves
    drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#ff3a5e', lineWidth: 2});
    
    // If exercise is active, draw key joint angles for the selected exercise
    if (isExerciseActive && selectedExercise) {
      drawJointAngles(results.poseLandmarks);
    }
  }
  
  // Draw hand landmarks if needed for the exercise
  if (selectedExercise && (selectedExercise.name.includes("Dumbbell") || selectedExercise.name.includes("Curl"))) {
    if (results.leftHandLandmarks) {
      drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {color: '#CC0000', lineWidth: 3});
      drawLandmarks(canvasCtx, results.leftHandLandmarks, {color: '#00FF00', lineWidth: 1});
    }
    if (results.rightHandLandmarks) {
      drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {color: '#00CC00', lineWidth: 3});
      drawLandmarks(canvasCtx, results.rightHandLandmarks, {color: '#FF0000', lineWidth: 1});
    }
  }
}

// Draw joint angles for the current exercise with enhanced visualization
function drawJointAngles(landmarks) {
  if (!selectedExercise || !landmarks) return;
  
  const exerciseName = selectedExercise.name;
  
  // Draw rep counting debug info if enabled
  if (debugRepCounting) {
    drawRepCountingDebugInfo();
  }
  
  if (exerciseName === "Dumbbell Bicep Curls") {
    // Draw elbow angle for bicep curls
    const rightShoulder = landmarks[12]; // Right shoulder
    const rightElbow = landmarks[14];    // Right elbow
    const rightWrist = landmarks[16];    // Right wrist
    
    if (rightShoulder && rightElbow && rightWrist) {
      // Calculate raw angle
      const rawAngle = calculateAngle(
        [rightShoulder.x, rightShoulder.y],
        [rightElbow.x, rightElbow.y],
        [rightWrist.x, rightWrist.y]
      );
      
      // Store in history for smoothing
      angleHistory.rightElbow.push(rawAngle);
      if (angleHistory.rightElbow.length > 20) { // Keep last 20 frames
        angleHistory.rightElbow.shift();
      }
      
      // Get smoothed angle
      const smoothedAngle = smoothAngle(rawAngle, angleHistory.rightElbow);
      
      // Draw the angle on the canvas with ideal range indicator
      drawAngleWithRange(rightElbow.x, rightElbow.y, smoothedAngle, [40, 160], "Right");
    }
    
    // Also check left arm
    const leftShoulder = landmarks[11]; // Left shoulder
    const leftElbow = landmarks[13];    // Left elbow
    const leftWrist = landmarks[15];    // Left wrist
    
    if (leftShoulder && leftElbow && leftWrist) {
      // Calculate raw angle
      const rawAngle = calculateAngle(
        [leftShoulder.x, leftShoulder.y],
        [leftElbow.x, leftElbow.y],
        [leftWrist.x, leftWrist.y]
      );
      
      // Store in history for smoothing
      angleHistory.leftElbow.push(rawAngle);
      if (angleHistory.leftElbow.length > 20) {
        angleHistory.leftElbow.shift();
      }
      
      // Get smoothed angle
      const smoothedAngle = smoothAngle(rawAngle, angleHistory.leftElbow);
      
      // Draw the angle on the canvas with ideal range indicator
      drawAngleWithRange(leftElbow.x, leftElbow.y, smoothedAngle, [40, 160], "Left");
    }
  } 
  else if (exerciseName === "Dumbbell Shoulder Press") {
    // Draw shoulder/elbow angle for shoulder press
    const rightShoulder = landmarks[12]; // Right shoulder
    const rightElbow = landmarks[14];    // Right elbow
    const rightWrist = landmarks[16];    // Right wrist
    
    if (rightShoulder && rightElbow && rightWrist) {
      // Calculate raw angle
      const rawAngle = calculateAngle(
        [rightShoulder.x, rightShoulder.y],
        [rightElbow.x, rightElbow.y],
        [rightWrist.x, rightWrist.y]
      );
      
      // Store in history for smoothing
      angleHistory.rightElbow.push(rawAngle);
      if (angleHistory.rightElbow.length > 20) {
        angleHistory.rightElbow.shift();
      }
      
      // Get smoothed angle
      const smoothedAngle = smoothAngle(rawAngle, angleHistory.rightElbow);
      
      // Draw the angle on the canvas with ideal range indicator
      drawAngleWithRange(rightElbow.x, rightElbow.y, smoothedAngle, [100, 180], "Right");
    }
    
    // Also check left arm
    const leftShoulder = landmarks[11]; // Left shoulder
    const leftElbow = landmarks[13];    // Left elbow
    const leftWrist = landmarks[15];    // Left wrist
    
    if (leftShoulder && leftElbow && leftWrist) {
      // Calculate raw angle
      const rawAngle = calculateAngle(
        [leftShoulder.x, leftShoulder.y],
        [leftElbow.x, leftElbow.y],
        [leftWrist.x, leftWrist.y]
      );
      
      // Store in history for smoothing
      angleHistory.leftElbow.push(rawAngle);
      if (angleHistory.leftElbow.length > 20) {
        angleHistory.leftElbow.shift();
      }
      
      // Get smoothed angle
      const smoothedAngle = smoothAngle(rawAngle, angleHistory.leftElbow);
      
      // Draw the angle on the canvas with ideal range indicator
      drawAngleWithRange(leftElbow.x, leftElbow.y, smoothedAngle, [100, 180], "Left");
    }
  }
  // Add more exercises with specific joint angles to visualize
}

// Draw rep counting debug information
function drawRepCountingDebugInfo() {
  // Only draw debug info if visualizer is not active to avoid duplication
  if (visualizer && visualizer.isActive) return;
  
  const padding = 10;
  const lineHeight = 20;
  let y = padding;
  
  // Set text style
  canvasCtx.font = '16px Arial';
  canvasCtx.fillStyle = '#ffffff';
  canvasCtx.strokeStyle = '#000000';
  canvasCtx.lineWidth = 3;
  
  // Draw background for better readability
  canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  canvasCtx.fillRect(padding, y, 250, 100);
  canvasCtx.fillStyle = '#ffffff';
  
  // Draw current state
  const stateText = `State: ${repState}`;
  canvasCtx.strokeText(stateText, padding + 5, y + lineHeight);
  canvasCtx.fillText(stateText, padding + 5, y + lineHeight);
  
  // Draw rep count
  const repText = `Reps: ${repCount}`;
  canvasCtx.strokeText(repText, padding + 5, y + lineHeight * 2);
  canvasCtx.fillText(repText, padding + 5, y + lineHeight * 2);
  
  // Draw angle info if available
  if (angleHistory.rightElbow.length > 0) {
    const rightElbowAngle = angleHistory.rightElbow[angleHistory.rightElbow.length - 1];
    const angleText = `Right Elbow: ${isNaN(rightElbowAngle) ? "N/A" : Math.round(rightElbowAngle)}°`;
    canvasCtx.strokeText(angleText, padding + 5, y + lineHeight * 3);
    canvasCtx.fillText(angleText, padding + 5, y + lineHeight * 3);
  }
  
  if (angleHistory.leftElbow.length > 0) {
    const leftElbowAngle = angleHistory.leftElbow[angleHistory.leftElbow.length - 1];
    const angleText = `Left Elbow: ${isNaN(leftElbowAngle) ? "N/A" : Math.round(leftElbowAngle)}°`;
    canvasCtx.strokeText(angleText, padding + 5, y + lineHeight * 4);
    canvasCtx.fillText(angleText, padding + 5, y + lineHeight * 4);
  }
}

// Enhanced angle drawing with ideal range indicator
function drawAngleWithRange(x, y, angle, idealRange, label = "") {
  const canvasX = x * canvasElement.width;
  const canvasY = y * canvasElement.height;
  const [minIdeal, maxIdeal] = idealRange;
  
  // Determine color based on whether angle is in ideal range
  let color;
  if (angle >= minIdeal && angle <= maxIdeal) {
    color = '#30c39e'; // Green for good
  } else if (angle >= minIdeal - 15 && angle <= maxIdeal + 15) {
    color = '#ffc107'; // Yellow for warning
  } else {
    color = '#ff3a5e'; // Red for error
  }
  
  // Draw angle text with label
  canvasCtx.font = 'bold 16px Arial';
  canvasCtx.fillStyle = color;
  canvasCtx.fillText(`${label} ${Math.round(angle)}°`, canvasX, canvasY - 25);
  
  // Draw ideal range indicator
  canvasCtx.font = '12px Arial';
  canvasCtx.fillStyle = '#ffffff';
  canvasCtx.fillText(`Target: ${minIdeal}°-${maxIdeal}°`, canvasX, canvasY - 10);
  
  // Draw a circle around the joint
  canvasCtx.beginPath();
  canvasCtx.arc(canvasX, canvasY, 20, 0, 2 * Math.PI);
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2;
  canvasCtx.stroke();
  
  // Draw an arc to represent the angle
  const startAngle = 0;
  const endAngle = (angle / 180) * Math.PI;
  canvasCtx.beginPath();
  canvasCtx.arc(canvasX, canvasY, 30, startAngle, endAngle);
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 3;
  canvasCtx.stroke();
}

// Legacy function for backward compatibility
function drawAngle(x, y, angle, color) {
  drawAngleWithRange(x, y, angle, [0, 180], "");
}

// Select an exercise
function selectExercise(exerciseId) {
  // Use the appropriate exercises array based on what's available
  const exerciseList = exercisesModule || exercises;
  
  // Find the exercise by ID
  const exercise = exerciseList.find(ex => ex.id === exerciseId);
  if (!exercise) return;
  
  // Update the selected exercise
  selectedExercise = exercise;
  repCount = 0;
  
  // Update UI
  document.querySelectorAll('.exercise-card').forEach(card => {
    card.classList.remove('selected');
    if (parseInt(card.dataset.id) === exerciseId) {
      card.classList.add('selected');
    }
  });
  
  currentExerciseSpan.textContent = exercise.name;
  startExerciseButton.disabled = false;
  
  // Display exercise details
  displayExerciseDetails(exercise);
  
  // Update documentation with selected exercise
  if (exerciseMetrics[exercise.name]) {
    documentationManager.setExercise(exerciseMetrics[exercise.name]);
  }
}

// Display exercise details
function displayExerciseDetails(exercise) {
  // Create target muscles tags
  const muscleTagsHTML = exercise.targetMuscles.map(muscle => 
    `<span class="muscle-tag">${muscle}</span>`
  ).join('');
  
  let detailsHTML = `
    <div class="target-muscles">
      ${muscleTagsHTML}
    </div>
    <h3>Instructions</h3>
    <ol>
      ${exercise.instructions.map(instruction => `<li>${instruction}</li>`).join('')}
    </ol>
  `;
  
  // Add rep goal if available
  if (exercise.rep_goal) {
    detailsHTML += `<p><strong>Rep Goal:</strong> ${exercise.rep_goal}</p>`;
  }
  
  // Add duration if available (for planks, etc.)
  if (exercise.duration) {
    detailsHTML += `<p><strong>Duration Goal:</strong> ${exercise.duration} seconds</p>`;
  }
  
  // Add key form points
  detailsHTML += `
    <h3>Form Tips</h3>
    <ul>
      ${Object.values(exercise.keypoints).map(keypoint => 
        `<li>${keypoint.description}</li>`
      ).join('')}
    </ul>
  `;
  
  exerciseDetailsContainer.innerHTML = detailsHTML;
}

// Add analytics controls to the UI
function addAnalyticsControls() {
  // Create a button to show/hide the progress report
  const repCounterContainer = document.getElementById('rep-counter-container');
  if (!repCounterContainer) return;
  
  // Check if the button already exists
  if (document.getElementById('show-progress-report')) return;
  
  const reportButton = document.createElement('button');
  reportButton.id = 'show-progress-report';
  reportButton.className = 'btn btn-primary';
  reportButton.innerHTML = '<i class="fas fa-chart-line"></i> Show Progress Report';
  reportButton.style.marginTop = '20px';
  reportButton.style.display = 'none'; // Hide initially, show after exercise completion
  
  reportButton.addEventListener('click', () => {
    displayProgressReport();
  });
  
  repCounterContainer.appendChild(reportButton);
}

// Toggle exercise tracking on/off
function toggleExercise() {
  if (!selectedExercise) return;
  
  isExerciseActive = !isExerciseActive;
  
  if (isExerciseActive) {
    // Reset rep count
    repCount = 0;
    repState = 'waiting';
    exerciseData = [];
    lastFeedbackUpdate = Date.now();
    
    // Update UI
    startExerciseButton.innerHTML = '<i class="fas fa-stop"></i> Stop Exercise';
    
    // Make sure camera is on
    if (!camera) {
      startCamera();
      canvasElement.style.display = 'block';
      startCameraButton.querySelector('span').textContent = 'Stop Camera';
      startCameraButton.querySelector('i').className = 'fas fa-video-slash';
    }
    
    // Create metrics container
    createMetricsContainer();
    
    // Announce exercise start with audio coach
    if (audioCoach) {
      audioCoach.announceExerciseStart(selectedExercise.name);
    }
    
    // Start analytics session
    if (analytics) {
      analytics.startSession(selectedExercise.name);
    }
  } else {
    // Update UI
    startExerciseButton.innerHTML = '<i class="fas fa-play"></i> Start Exercise';
    
    // Hide rep counter
    repCounterContainer.classList.remove('active');
    
    // Generate final feedback if we have data
    if (exerciseData.length > 0) {
      generateExerciseFeedback(exerciseData);
      
      // Provide audio summary
      if (audioCoach) {
        const lastMetrics = exerciseData[exerciseData.length - 1];
        audioCoach.provideSummary(selectedExercise.name, lastMetrics);
      }
      
      // End analytics session
      if (analytics) {
        const sessionSummary = analytics.endSession();
        console.log('Session summary:', sessionSummary);
        
        // Show progress report button
        const reportButton = document.getElementById('show-progress-report');
        if (reportButton) {
          reportButton.style.display = 'inline-block';
        }
      }
      
      exerciseData = [];
    }
  }
}

// Create the metrics container
function createMetricsContainer() {
  // Clear previous rep counter if it exists
  repCounterContainer.innerHTML = '';
  
  // Add rep counter under camera
  repCounterContainer.innerHTML = `
    <h3>Current Progress</h3>
    <div class="rep-counter">0</div>
    ${selectedExercise.rep_goal ? 
      `<div class="progress-bar">
        <div class="progress-bar-fill" style="width: 0%"></div>
      </div>
      <p class="progress-text">0/${selectedExercise.rep_goal} reps completed</p>` 
      : ''
    }
    <div class="form-feedback">
      <h3><i class="fas fa-brain"></i> AI Coach Feedback</h3>
      <div id="feedback-loading" class="feedback-loading">
        <i class="fas fa-spinner fa-pulse"></i> Analyzing your form...
      </div>
      <div id="feedback-container" class="feedback-sections">
        <div class="feedback-section">
          <h4><i class="fas fa-check-circle"></i> Form Assessment</h4>
          <p id="form-assessment">Start exercising to receive feedback on your form.</p>
        </div>
        <div class="feedback-section">
          <h4><i class="fas fa-lightbulb"></i> Improvement Tip</h4>
          <p id="improvement-tip">Complete a few reps to get personalized tips.</p>
        </div>
        <div class="feedback-section">
          <h4><i class="fas fa-chart-line"></i> Progress</h4>
          <p id="progress-feedback">Your progress will be tracked as you exercise.</p>
        </div>
        <div class="feedback-section">
          <h4><i class="fas fa-wind"></i> Breathing</h4>
          <p id="breathing-reminder">Proper breathing technique will be provided.</p>
        </div>
      </div>
    </div>
    
    <!-- Advanced Insights Section (hidden initially) -->
    <div id="advanced-insights" class="advanced-insights">
      <div class="insights-header">
        <h3><i class="fas fa-chart-bar"></i> Advanced Insights</h3>
        <button id="toggle-insights" class="toggle-button">
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>
      <div id="insights-content" class="insights-content" style="display: none;">
        <div class="insights-tabs">
          <button class="insights-tab active" data-tab="progress-insights">Progress</button>
          <button class="insights-tab" data-tab="recommendations">Recommendations</button>
        </div>
        <div class="insights-panels">
          <div id="progress-insights" class="insights-panel active">
            <div class="insights-loading">
              <i class="fas fa-spinner fa-pulse"></i> Analyzing your progress history...
            </div>
            <div class="insights-data" style="display: none;">
              <div class="insights-section">
                <h4><i class="fas fa-dumbbell"></i> Strength Progress</h4>
                <p id="strength-progress">Analyzing your strength progression...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-check-double"></i> Form Improvement</h4>
                <p id="form-improvement">Analyzing your form improvement...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-ruler"></i> Range of Motion</h4>
                <p id="range-of-motion">Analyzing your range of motion...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-tachometer-alt"></i> Efficiency</h4>
                <p id="efficiency">Analyzing your workout efficiency...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-flag-checkered"></i> Next Milestone</h4>
                <p id="next-milestone">Determining your next milestone...</p>
              </div>
            </div>
          </div>
          <div id="recommendations" class="insights-panel">
            <div class="insights-loading">
              <i class="fas fa-spinner fa-pulse"></i> Generating personalized recommendations...
            </div>
            <div class="insights-data" style="display: none;">
              <div class="insights-section">
                <h4><i class="fas fa-plus-circle"></i> Complementary Exercises</h4>
                <p id="complementary-exercises">Analyzing complementary exercises...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-level-up-alt"></i> Progression Plan</h4>
                <p id="progression-plan">Creating your progression plan...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-bullseye"></i> Form Focus</h4>
                <p id="form-focus">Analyzing your form focus areas...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-bed"></i> Recovery Tips</h4>
                <p id="recovery-tips">Generating recovery recommendations...</p>
              </div>
              <div class="insights-section">
                <h4><i class="fas fa-random"></i> Variation Suggestion</h4>
                <p id="variation-suggestion">Finding exercise variations...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Show the rep counter container
  repCounterContainer.classList.add('active');
  
  // Set up event listeners for the advanced insights section
  setupInsightsEventListeners();
  
  // Check for existing insights data and load it
  loadExistingInsights();
}

// Set up event listeners for the advanced insights section
function setupInsightsEventListeners() {
  // Toggle insights visibility
  const toggleButton = document.getElementById('toggle-insights');
  const insightsContent = document.getElementById('insights-content');
  
  if (toggleButton && insightsContent) {
    toggleButton.addEventListener('click', () => {
      const isVisible = insightsContent.style.display !== 'none';
      insightsContent.style.display = isVisible ? 'none' : 'block';
      toggleButton.innerHTML = isVisible ? 
        '<i class="fas fa-chevron-down"></i>' : 
        '<i class="fas fa-chevron-up"></i>';
    });
  }
  
  // Tab switching
  const tabButtons = document.querySelectorAll('.insights-tab');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs and panels
      document.querySelectorAll('.insights-tab').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.insights-panel').forEach(panel => panel.classList.remove('active'));
      
      // Add active class to clicked tab
      button.classList.add('active');
      
      // Show corresponding panel
      const tabId = button.getAttribute('data-tab');
      const panel = document.getElementById(tabId);
      if (panel) {
        panel.classList.add('active');
      }
    });
  });
}

// Load existing insights data from localStorage
function loadExistingInsights() {
  if (!selectedExercise) return;
  
  // Check for progress insights
  try {
    const storedInsights = localStorage.getItem('exercise-insights');
    if (storedInsights) {
      const insightsData = JSON.parse(storedInsights);
      
      // Only use if it's for the current exercise and less than 24 hours old
      if (insightsData.exerciseName === selectedExercise.name && 
          Date.now() - insightsData.timestamp < 24 * 60 * 60 * 1000) {
        
        displayProgressInsights(insightsData.insights);
      }
    }
  } catch (e) {
    console.warn('Error loading stored progress insights:', e);
  }
  
  // Check for workout recommendations
  try {
    const storedRecommendations = localStorage.getItem('workout-recommendations');
    if (storedRecommendations) {
      const recommendationsData = JSON.parse(storedRecommendations);
      
      // Only use if it's for the current exercise and less than 24 hours old
      if (recommendationsData.exerciseName === selectedExercise.name && 
          Date.now() - recommendationsData.timestamp < 24 * 60 * 60 * 1000) {
        
        displayWorkoutRecommendations(recommendationsData.recommendations);
      }
    }
  } catch (e) {
    console.warn('Error loading stored workout recommendations:', e);
  }
}

// Display progress insights in the UI
function displayProgressInsights(insightsText) {
  // Hide loading indicator
  const loadingIndicator = document.querySelector('#progress-insights .insights-loading');
  const insightsData = document.querySelector('#progress-insights .insights-data');
  
  if (loadingIndicator) loadingIndicator.style.display = 'none';
  if (insightsData) insightsData.style.display = 'block';
  
  // Parse insights text
  try {
    // Extract sections using regex
    const strengthMatch = insightsText.match(/STRENGTH_PROGRESS:([^]*?)(?=\d\.|$)/);
    const formMatch = insightsText.match(/FORM_IMPROVEMENT:([^]*?)(?=\d\.|$)/);
    const romMatch = insightsText.match(/RANGE_OF_MOTION:([^]*?)(?=\d\.|$)/);
    const efficiencyMatch = insightsText.match(/EFFICIENCY:([^]*?)(?=\d\.|$)/);
    const milestoneMatch = insightsText.match(/NEXT_MILESTONE:([^]*?)(?=\d\.|$)/);
    
    // Update UI elements if matches found
    if (strengthMatch && document.getElementById('strength-progress')) {
      document.getElementById('strength-progress').textContent = strengthMatch[1].trim();
    }
    
    if (formMatch && document.getElementById('form-improvement')) {
      document.getElementById('form-improvement').textContent = formMatch[1].trim();
    }
    
    if (romMatch && document.getElementById('range-of-motion')) {
      document.getElementById('range-of-motion').textContent = romMatch[1].trim();
    }
    
    if (efficiencyMatch && document.getElementById('efficiency')) {
      document.getElementById('efficiency').textContent = efficiencyMatch[1].trim();
    }
    
    if (milestoneMatch && document.getElementById('next-milestone')) {
      document.getElementById('next-milestone').textContent = milestoneMatch[1].trim();
    }
  } catch (e) {
    console.warn('Error parsing progress insights:', e);
  }
}

// Display workout recommendations in the UI
function displayWorkoutRecommendations(recommendationsText) {
  // Hide loading indicator
  const loadingIndicator = document.querySelector('#recommendations .insights-loading');
  const insightsData = document.querySelector('#recommendations .insights-data');
  
  if (loadingIndicator) loadingIndicator.style.display = 'none';
  if (insightsData) insightsData.style.display = 'block';
  
  // Parse recommendations text
  try {
    // Extract sections using regex
    const complementaryMatch = recommendationsText.match(/COMPLEMENTARY_EXERCISES:([^]*?)(?=\d\.|$)/);
    const progressionMatch = recommendationsText.match(/PROGRESSION_PLAN:([^]*?)(?=\d\.|$)/);
    const formFocusMatch = recommendationsText.match(/FORM_FOCUS:([^]*?)(?=\d\.|$)/);
    const recoveryMatch = recommendationsText.match(/RECOVERY_TIPS:([^]*?)(?=\d\.|$)/);
    const variationMatch = recommendationsText.match(/VARIATION_SUGGESTION:([^]*?)(?=\d\.|$)/);
    
    // Update UI elements if matches found
    if (complementaryMatch && document.getElementById('complementary-exercises')) {
      document.getElementById('complementary-exercises').textContent = complementaryMatch[1].trim();
    }
    
    if (progressionMatch && document.getElementById('progression-plan')) {
      document.getElementById('progression-plan').textContent = progressionMatch[1].trim();
    }
    
    if (formFocusMatch && document.getElementById('form-focus')) {
      document.getElementById('form-focus').textContent = formFocusMatch[1].trim();
    }
    
    if (recoveryMatch && document.getElementById('recovery-tips')) {
      document.getElementById('recovery-tips').textContent = recoveryMatch[1].trim();
    }
    
    if (variationMatch && document.getElementById('variation-suggestion')) {
      document.getElementById('variation-suggestion').textContent = variationMatch[1].trim();
    }
  } catch (e) {
    console.warn('Error parsing workout recommendations:', e);
  }
}

// This function has been removed to fix the duplicate declaration error

// Analyze the exercise based on pose data
function analyzeExercise() {
  if (!lastPoseData || !lastPoseData.pose) return null;
  
  let metrics = {
    exerciseName: selectedExercise.name,
    timestamp: lastPoseData.timestamp,
    repCount: repCount,
    jointAngles: {},
    formQuality: "good", // Default value, will be updated based on analysis
    targetMuscles: selectedExercise.targetMuscles,
    formIssues: [],
    // Add new metrics collections
    rangeOfMotion: {},
    movement: {
      velocity: {},
      acceleration: {},
      smoothness: "stable"
    },
    symmetry: {
      leftRightBalance: "balanced",
      angleDiscrepancies: {}
    },
    posture: {
      spineAlignment: "neutral",
      shoulderAlignment: "level"
    },
    bodySegmentation: {
      centerOfGravity: {}
    },
    // Store historical joint positions for trajectory analysis
    trajectories: {},
    // 3D data for more accurate spatial analysis
    worldPoseMetrics: {}
  };
  
  // Extract 3D metrics from world landmarks if available
  if (lastPoseData.poseWorld && lastPoseData.poseWorld.length > 0) {
    metrics.worldPoseMetrics = extractWorldPoseMetrics(lastPoseData.poseWorld);
  }
  
  // Get exercise-specific metrics from exercise-metrics.js
  const exerciseMetricsData = exerciseMetrics[selectedExercise.name];
  if (exerciseMetricsData && exerciseMetricsData.metricImplementations) {
      // Process each metric implementation
      Object.entries(exerciseMetricsData.metricImplementations).forEach(([metricKey, implementation]) => {
        if (implementation.measure) {
          const measureResult = implementation.measure(lastPoseData.pose, 
            exerciseData.length > 0 ? exerciseData[exerciseData.length - 1] : null);
          
          if (measureResult) {
            // Store the measured value
            if (!metrics.jointAngles) metrics.jointAngles = {};
            metrics.jointAngles[metricKey] = measureResult.value;
            
            // Store additional data from the measurement result
            if (measureResult.leftAngle) metrics.jointAngles.leftElbow = measureResult.leftAngle;
            if (measureResult.rightAngle) metrics.jointAngles.rightElbow = measureResult.rightAngle;
            
            // For Russian Twists, store shoulder vector for direction detection
            if (metricKey === "rangeOfMotion" && measureResult.shoulderVector) {
              metrics.shoulderVector = measureResult.shoulderVector;
            }
            
            // Check if the value is within ideal range
            if (measureResult.idealRange) {
              const severity = determineFeedbackSeverity(measureResult.value, measureResult.idealRange);
              
              // Add form issues if not in ideal range
              if (severity === "warning" || severity === "error") {
                if (measureResult.feedbackText) {
                  const feedbackText = severity === "warning" 
                    ? measureResult.feedbackText.warning 
                    : measureResult.feedbackText.error;
                  
                  if (feedbackText) {
                    metrics.formIssues.push(feedbackText);
                    
                    // Update form quality if severe issue
                    if (severity === "error") {
                      metrics.formQuality = "needs_improvement";
                    }
                  }
                }
              }
            }
          }
        }
      });
    
    // Use rep counting strategy from exercise metrics
    if (exerciseMetricsData.repCountingStrategy) {
      const strategy = exerciseMetricsData.repCountingStrategy;
      
      // Store the current rep state before potentially changing it
      previousRepState = repState;
      
      // Check for state timeout to prevent getting stuck
      const currentTime = Date.now();
      if (stateTimeout.state === repState) {
        const timeInState = currentTime - stateTimeout.startTime;
        if (timeInState > stateTimeout.maxDuration) {
          // Instead of just resetting to waiting, force a transition based on current angles
          if (repState === 'waiting') {
            // Get current elbow angles if available
            let rightElbowAngle = null;
            let leftElbowAngle = null;
            
            if (lastPoseData && lastPoseData.pose) {
              const pose = lastPoseData.pose;
              // Calculate right elbow angle if landmarks are available
              if (pose[12] && pose[14] && pose[16]) {
                rightElbowAngle = calculateAngle(
                  [pose[12].x, pose[12].y], // Right shoulder
                  [pose[14].x, pose[14].y], // Right elbow
                  [pose[16].x, pose[16].y]  // Right wrist
                );
              }
              
              // Calculate left elbow angle if landmarks are available
              if (pose[11] && pose[13] && pose[15]) {
                leftElbowAngle = calculateAngle(
                  [pose[11].x, pose[11].y], // Left shoulder
                  [pose[13].x, pose[13].y], // Left elbow
                  [pose[15].x, pose[15].y]  // Left wrist
                );
              }
            }
            
            // Log the angles for debugging
            console.log(`Forcing transition from waiting state. Right angle: ${rightElbowAngle}, Left angle: ${leftElbowAngle}`);
            
            // Use the angles to determine which state to transition to
            if (rightElbowAngle !== null || leftElbowAngle !== null) {
              // Use the available angle (prefer right if both are available)
              const angle = rightElbowAngle !== null ? rightElbowAngle : leftElbowAngle;
              
              // For bicep curls: if arm is extended (angle > 140), go to 'down' state
              // If arm is bent (angle < 90), go to 'up' state
              if (angle > 140) {
                console.log(`Forcing transition to 'down' state with angle ${angle}°`);
                repState = 'down';
              } else if (angle < 90) {
                console.log(`Forcing transition to 'up' state with angle ${angle}°`);
                repState = 'up';
              } else {
                // If angle is in between, default to 'down' as it's more common starting position
                console.log(`Angle in middle range (${angle}°), defaulting to 'down' state`);
                repState = 'down';
              }
            } else {
              // If no angles available, just try 'down' state
              console.log("No angle data available, defaulting to 'down' state");
              repState = 'down';
            }
          } else {
            // For non-waiting states, reset to waiting as before
            console.log(`State timeout: ${repState} for ${timeInState}ms, resetting to 'waiting'`);
            repState = 'waiting';
          }
          
          // Update timeout tracking for the new state
          stateTimeout.state = repState;
          stateTimeout.startTime = currentTime;
        }
      } else {
        // Update state timeout tracking for new state
        stateTimeout.state = repState;
        stateTimeout.startTime = currentTime;
      }
      
      // Apply state transitions based on metrics
      if (strategy.transitions && strategy.transitions[repState]) {
        // Check if transitions is an array (new format) or an object (old format)
        const transitions = Array.isArray(strategy.transitions[repState]) 
          ? strategy.transitions[repState] 
          : [strategy.transitions[repState]];
        
        // Check each possible transition for the current state
        let transitionOccurred = false;
        for (const transition of transitions) {
          if (transition.condition(metrics)) {
            // Transition to new state
            const newState = transition.to;
            
            // Log state transition for debugging
            if (debugRepCounting) {
              console.log(`State transition: ${repState} -> ${newState}`);
              if (metrics.jointAngles && metrics.jointAngles.rightElbow) {
                console.log(`Right elbow angle: ${metrics.jointAngles.rightElbow}°`);
              }
              if (metrics.jointAngles && metrics.jointAngles.leftElbow) {
                console.log(`Left elbow angle: ${metrics.jointAngles.leftElbow}°`);
              }
            }
            
            // Update rep state
            repState = newState;
            
            // Reset state timeout for new state
            stateTimeout.state = newState;
            stateTimeout.startTime = currentTime;
            
            transitionOccurred = true;
            
            // Break after the first successful transition
            break; 
          }
        }
        
        // If no transition occurred and we're in waiting state for too long, try to force a transition
        if (!transitionOccurred && repState === 'waiting' && 
            currentTime - stateTimeout.startTime > 2000) {
          
          // Check if we have valid angle data to make a decision
          if (metrics.jointAngles && metrics.jointAngles.rightElbow) {
            const angle = metrics.jointAngles.rightElbow;
            
            // Force transition based on current angle
            if (angle > 140) {
              repState = 'down';
              stateTimeout.state = 'down';
              stateTimeout.startTime = currentTime;
              console.log(`Forced transition to 'down' state with angle ${angle}°`);
            } else if (angle < 90) {
              repState = 'up';
              stateTimeout.state = 'up';
              stateTimeout.startTime = currentTime;
              console.log(`Forced transition to 'up' state with angle ${angle}°`);
            }
          }
        }
      }
    }
  } else {
    // Fallback to basic implementations if exercise metrics not found
    if (selectedExercise.name === "Dumbbell Bicep Curls") {
      const bicepMetrics = analyzeBicepCurls();
      if (bicepMetrics) {
        metrics = { ...metrics, ...bicepMetrics };
      }
    } else if (selectedExercise.name === "Dumbbell Shoulder Press") {
      const shoulderMetrics = analyzeShoulderPress();
      if (shoulderMetrics) {
        metrics = { ...metrics, ...shoulderMetrics };
      }
    }
  }
  
  // Calculate velocity and acceleration if we have historical data
  if (exerciseData.length > 0) {
    const velocityMetrics = calculateMovementDynamics(lastPoseData, exerciseData);
    if (velocityMetrics) {
      metrics.movement = { ...metrics.movement, ...velocityMetrics };
    }
  }
  
  // Analyze symmetry between left and right sides
  metrics.symmetry = analyzeBodySymmetry(lastPoseData.pose);
  
  // Analyze posture and spinal alignment
  metrics.posture = analyzePosture(lastPoseData.pose);
  
  // Analyze range of motion based on historical data
  if (exerciseData.length > 0) {
    metrics.rangeOfMotion = calculateRangeOfMotion(lastPoseData, exerciseData);
  }
  
  // Handle partial reps for exercises that support it
  if (exerciseMetricsData.repCountingStrategy && exerciseMetricsData.repCountingStrategy.getRepQuality) {
    // Check if we've transitioned states
    if (repState !== previousRepState) {
      // Get rep quality (1.0 for full rep, 0.5 for partial, 0 for non-counting transitions)
      const repQuality = exerciseMetricsData.repCountingStrategy.getRepQuality(previousRepState, repState);
      
      if (repQuality > 0) {
        // Add the rep quality to the count (allows for partial reps)
        repCount += repQuality;
        console.log(`Rep counted: ${repCount} (quality: ${repQuality})`);
        
        // Announce rep count with audio coach
        if (audioCoach) {
          if (repQuality === 1.0) {
            audioCoach.countRep(Math.floor(repCount));
          } else {
            audioCoach.announcePartialRep(repQuality);
          }
        }
        
        // Record the rep in analytics with quality information
        if (analytics) {
          metrics.repQuality = repQuality;
          analytics.recordRep(metrics);
        }
      }
    }
  }
  
  // Check for symmetry issues
  if (metrics.symmetry && metrics.symmetry.value > 10) {
    metrics.formIssues.push("Uneven movement between left and right sides. Try to keep both arms moving together.");
    metrics.formQuality = "needs_improvement";
  }
  
  // Update exercise metrics in the UI
  updateExerciseMetrics();
  
  return metrics;
}

// Import the determineFeedbackSeverity function from exercise-metrics.js instead of redefining it

// Extract additional metrics from 3D world pose landmarks
function extractWorldPoseMetrics(worldPoseLandmarks) {
  const metrics = {
    jointAngles3D: {},
    depth: {},
    elevation: {}
  };
  
  // Calculate 3D angles for major joints if landmarks exist
  
  // Right elbow angle in 3D space
  if (worldPoseLandmarks[12] && worldPoseLandmarks[14] && worldPoseLandmarks[16]) {
    metrics.jointAngles3D.rightElbow = calculate3DAngle(
      worldPoseLandmarks[12], // Right shoulder
      worldPoseLandmarks[14], // Right elbow
      worldPoseLandmarks[16]  // Right wrist
    );
  }
  
  // Left elbow angle in 3D space
  if (worldPoseLandmarks[11] && worldPoseLandmarks[13] && worldPoseLandmarks[15]) {
    metrics.jointAngles3D.leftElbow = calculate3DAngle(
      worldPoseLandmarks[11], // Left shoulder
      worldPoseLandmarks[13], // Left elbow
      worldPoseLandmarks[15]  // Left wrist
    );
  }
  
  // Add shoulder angles, hip angles, knee angles as needed for exercises
  
  return metrics;
}

// Calculate angle in 3D space
function calculate3DAngle(a, b, c) {
  // Vector BA
  const ba = {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z
  };
  
  // Vector BC
  const bc = {
    x: c.x - b.x,
    y: c.y - b.y,
    z: c.z - b.z
  };
  
  // Dot product
  const dotProduct = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;
  
  // Magnitudes
  const magnitudeBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z);
  const magnitudeBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z);
  
  // Angle in radians
  const angle = Math.acos(dotProduct / (magnitudeBA * magnitudeBC));
  
  // Convert to degrees
  return angle * (180 / Math.PI);
}

// Calculate movement dynamics including velocity and acceleration
function calculateMovementDynamics(currentData, historicalData) {
  if (historicalData.length < 2) return null;
  
  const dynamics = {
    velocity: {},
    acceleration: {},
    smoothness: "stable"
  };
  
  // Get the previous data point
  const previousData = historicalData[historicalData.length - 1];
  
  // Time elapsed in seconds
  const timeElapsed = (currentData.timestamp - previousData.timestamp) / 1000;
  if (timeElapsed <= 0) return null;
  
  // Landmarks to track (can be customized based on exercise)
  const keySets = [
    { name: "rightWrist", landmark: 16 },
    { name: "leftWrist", landmark: 15 },
    { name: "rightElbow", landmark: 14 },
    { name: "leftElbow", landmark: 13 }
  ];
  
  // Calculate velocity for key points
  keySets.forEach(set => {
    const currentPoint = currentData.pose[set.landmark];
    const previousPoint = previousData.pose ? previousData.pose[set.landmark] : null;
    
    if (currentPoint && previousPoint) {
      // Simple displacement calculation
      const displacement = Math.sqrt(
        Math.pow(currentPoint.x - previousPoint.x, 2) +
        Math.pow(currentPoint.y - previousPoint.y, 2)
      );
      
      // Velocity (pixels per second)
      dynamics.velocity[set.name] = displacement / timeElapsed;
      
      // We could add acceleration calculation by comparing with older data points
      if (historicalData.length > 2) {
        const olderData = historicalData[historicalData.length - 2];
        const olderPoint = olderData.pose ? olderData.pose[set.landmark] : null;
        
        if (olderPoint) {
          const previousTimeElapsed = (previousData.timestamp - olderData.timestamp) / 1000;
          
          if (previousTimeElapsed > 0) {
            const previousDisplacement = Math.sqrt(
              Math.pow(previousPoint.x - olderPoint.x, 2) +
              Math.pow(previousPoint.y - olderPoint.y, 2)
            );
            
            const previousVelocity = previousDisplacement / previousTimeElapsed;
            dynamics.acceleration[set.name] = (dynamics.velocity[set.name] - previousVelocity) / timeElapsed;
          }
        }
      }
    }
  });
  
  // Assess movement smoothness based on velocity consistency
  if (Object.values(dynamics.velocity).length > 0) {
    const velocities = Object.values(dynamics.velocity);
    // If any velocity is too high relative to average, movement is jerky
    const avgVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
    const maxVelocity = Math.max(...velocities);
    
    if (maxVelocity > avgVelocity * 2) {
      dynamics.smoothness = "jerky";
    } else {
      dynamics.smoothness = "smooth";
    }
  }
  
  return dynamics;
}

// Analyze left/right body symmetry
function analyzeBodySymmetry(poseLandmarks) {
  const symmetry = {
    leftRightBalance: "balanced",
    angleDiscrepancies: {}
  };
  
  // Check shoulder height discrepancy
  if (poseLandmarks[11] && poseLandmarks[12]) {
    const shoulderHeightDiff = Math.abs(poseLandmarks[11].y - poseLandmarks[12].y);
    symmetry.angleDiscrepancies.shoulderHeight = shoulderHeightDiff;
    
    if (shoulderHeightDiff > 0.05) {
      symmetry.leftRightBalance = "imbalanced";
    }
  }
  
  // Compare left and right elbow angles
  if (poseLandmarks[11] && poseLandmarks[13] && poseLandmarks[15] &&
      poseLandmarks[12] && poseLandmarks[14] && poseLandmarks[16]) {
        
    const leftElbowAngle = calculateAngle(
      [poseLandmarks[11].x, poseLandmarks[11].y],
      [poseLandmarks[13].x, poseLandmarks[13].y],
      [poseLandmarks[15].x, poseLandmarks[15].y]
    );
    
    const rightElbowAngle = calculateAngle(
      [poseLandmarks[12].x, poseLandmarks[12].y],
      [poseLandmarks[14].x, poseLandmarks[14].y],
      [poseLandmarks[16].x, poseLandmarks[16].y]
    );
    
    symmetry.angleDiscrepancies.elbowAngle = Math.abs(leftElbowAngle - rightElbowAngle);
    
    if (Math.abs(leftElbowAngle - rightElbowAngle) > 15) {
      symmetry.leftRightBalance = "imbalanced";
    }
  }
  
  // Additional symmetry checks could be added for hips, knees, etc.
  
  return symmetry;
}

// Analyze posture and spinal alignment
function analyzePosture(poseLandmarks) {
  const posture = {
    spineAlignment: "neutral",
    shoulderAlignment: "level",
    hipAlignment: "level"
  };
  
  // Check spine alignment (shoulders to hips)
  if (poseLandmarks[11] && poseLandmarks[12] && poseLandmarks[23] && poseLandmarks[24]) {
    // Get midpoints
    const shoulderMidX = (poseLandmarks[11].x + poseLandmarks[12].x) / 2;
    const hipMidX = (poseLandmarks[23].x + poseLandmarks[24].x) / 2;
    
    const spineAlignment = Math.abs(shoulderMidX - hipMidX);
    
    if (spineAlignment > 0.05) {
      posture.spineAlignment = "leaning";
    }
  }
  
  // Check shoulder alignment
  if (poseLandmarks[11] && poseLandmarks[12]) {
    const shoulderHeightDiff = Math.abs(poseLandmarks[11].y - poseLandmarks[12].y);
    
    if (shoulderHeightDiff > 0.03) {
      posture.shoulderAlignment = "uneven";
    }
  }
  
  // Check hip alignment
  if (poseLandmarks[23] && poseLandmarks[24]) {
    const hipHeightDiff = Math.abs(poseLandmarks[23].y - poseLandmarks[24].y);
    
    if (hipHeightDiff > 0.03) {
      posture.hipAlignment = "uneven";
    }
  }
  
  return posture;
}

// Calculate range of motion
function calculateRangeOfMotion(currentData, historicalData) {
  const rom = {
    maxAngles: {},
    minAngles: {},
    consistency: "consistent"
  };
  
  // Determine which joints to track based on exercise
  const jointsToTrack = [];
  
  if (selectedExercise.name === "Dumbbell Bicep Curls") {
    jointsToTrack.push({
      name: "rightElbow",
      landmarks: [12, 14, 16] // Right shoulder, elbow, wrist
    }, {
      name: "leftElbow",
      landmarks: [11, 13, 15] // Left shoulder, elbow, wrist
    });
  } else if (selectedExercise.name === "Dumbbell Shoulder Press") {
    jointsToTrack.push({
      name: "rightElbow",
      landmarks: [12, 14, 16] // Right shoulder, elbow, wrist
    }, {
      name: "leftElbow",
      landmarks: [11, 13, 15] // Left shoulder, elbow, wrist
    }, {
      name: "rightShoulder",
      landmarks: [24, 12, 14] // Right hip, shoulder, elbow
    }, {
      name: "leftShoulder",
      landmarks: [23, 11, 13] // Left hip, shoulder, elbow
    });
  }
  
  // Get angles from current pose
  const currentAngles = {};
  jointsToTrack.forEach(joint => {
    if (currentData.pose[joint.landmarks[0]] && 
        currentData.pose[joint.landmarks[1]] && 
        currentData.pose[joint.landmarks[2]]) {
          
      currentAngles[joint.name] = calculateAngle(
        [currentData.pose[joint.landmarks[0]].x, currentData.pose[joint.landmarks[0]].y],
        [currentData.pose[joint.landmarks[1]].x, currentData.pose[joint.landmarks[1]].y],
        [currentData.pose[joint.landmarks[2]].x, currentData.pose[joint.landmarks[2]].y]
      );
    }
  });
  
  // Find max and min angles from historical data
  jointsToTrack.forEach(joint => {
    const allAngles = historicalData
      .filter(data => data.jointAngles && data.jointAngles[joint.name])
      .map(data => data.jointAngles[joint.name]);
    
    if (allAngles.length > 0) {
      rom.maxAngles[joint.name] = Math.max(...allAngles);
      rom.minAngles[joint.name] = Math.min(...allAngles);
      
      // Add current angle if available
      if (currentAngles[joint.name]) {
        rom.maxAngles[joint.name] = Math.max(rom.maxAngles[joint.name], currentAngles[joint.name]);
        rom.minAngles[joint.name] = Math.min(rom.minAngles[joint.name], currentAngles[joint.name]);
      }
    }
  });
  
  // Check ROM consistency across reps
  if (repCount > 1) {
    jointsToTrack.forEach(joint => {
      // Group angles by rep
      const repAngles = {};
      let consistentROM = true;
      
      // Analyze consistency logic would go here
      // This is simplified for now
      
      if (!consistentROM) {
        rom.consistency = "inconsistent";
      }
    });
  }
  
  return rom;
}

// Display progress report
function displayProgressReport() {
  if (!analytics) return;
  
  // Generate the progress report
  const report = analytics.generateProgressReport();
  if (!report) {
    alert('Not enough data to generate a progress report yet.');
    return;
  }
  
  // Check if a report container already exists
  let reportContainer = document.getElementById('progress-report');
  if (!reportContainer) {
    // Create a new container
    reportContainer = document.createElement('div');
    reportContainer.id = 'progress-report';
    reportContainer.className = 'progress-report';
    
    // Add it to the page after the rep counter container
    const repCounterContainer = document.getElementById('rep-counter-container');
    if (repCounterContainer) {
      repCounterContainer.parentNode.insertBefore(reportContainer, repCounterContainer.nextSibling);
    } else {
      // Fallback - add to body
      document.body.appendChild(reportContainer);
    }
  }
  
  // If there's not enough data
  if (report.totalSessions === 0) {
    reportContainer.innerHTML = `
      <h3><i class="fas fa-chart-line"></i> Progress Report</h3>
      <p>${report.message}</p>
    `;
    return;
  }
  
  // Create the report content
  reportContainer.innerHTML = `
    <h3><i class="fas fa-chart-line"></i> Progress Report for ${report.exerciseName}</h3>
    
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Sessions</div>
        <div class="metric-value">${report.totalSessions}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Reps</div>
        <div class="metric-value">${report.totalReps}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg. Form Quality</div>
        <div class="metric-value">${Math.round(report.averageFormQuality * 100)}%</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg. Reps/Session</div>
        <div class="metric-value">${Math.round(report.avgRepsPerSession)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Form Trend</div>
        <div class="metric-value" style="color: ${report.formImprovementTrend > 0 ? 'var(--secondary-color)' : 'var(--primary-color)'}">
          ${report.formImprovementTrend > 0 ? '↑' : (report.formImprovementTrend < 0 ? '↓' : '→')}
          ${Math.abs(Math.round(report.formImprovementTrend * 100))}%
        </div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Consistency</div>
        <div class="metric-value">${Math.round(report.consistencyScore * 100)}%</div>
      </div>
    </div>
    
    <div class="recommendations-section">
      <h4>Areas for Improvement</h4>
      <ul class="recommendations-list">
        ${report.areasOfImprovement.map(area => 
          `<li><i class="fas fa-exclamation-circle"></i> ${area}</li>`
        ).join('')}
      </ul>
    </div>
    
    <div class="recommendations-section">
      <h4>Recommendations</h4>
      <ul class="recommendations-list">
        ${report.recommendations.map(rec => 
          `<li><i class="fas fa-lightbulb"></i> ${rec}</li>`
        ).join('')}
      </ul>
    </div>
    
    ${report.bestSession ? `
    <div class="recommendations-section">
      <h4>Best Session</h4>
      <p>Date: ${report.bestSession.date}</p>
      <p>Form Quality: ${Math.round(report.bestSession.formQuality * 100)}%</p>
      <p>Reps Completed: ${report.bestSession.repCount}</p>
    </div>
    ` : ''}
  `;
  
  // Scroll to the report
  reportContainer.scrollIntoView({ behavior: 'smooth' });
}

// Basic bicep curl detection
function analyzeBicepCurls() {
  const pose = lastPoseData.pose;
  if (!pose) return null;
  
  // Get relevant landmarks for right arm
  const rightShoulder = pose[12]; // Right shoulder
  const rightElbow = pose[14];    // Right elbow
  const rightWrist = pose[16];    // Right wrist
  
  // Get relevant landmarks for left arm
  const leftShoulder = pose[11]; // Left shoulder
  const leftElbow = pose[13];    // Left elbow
  const leftWrist = pose[15];    // Left wrist
  
  if (!rightShoulder || !rightElbow || !rightWrist || !leftShoulder || !leftElbow || !leftWrist) return null;
  
  // Calculate elbow angles
  const rightElbowAngle = calculateAngle(
    [rightShoulder.x, rightShoulder.y],
    [rightElbow.x, rightElbow.y],
    [rightWrist.x, rightWrist.y]
  );
  
  const leftElbowAngle = calculateAngle(
    [leftShoulder.x, leftShoulder.y],
    [leftElbow.x, leftElbow.y],
    [leftWrist.x, leftWrist.y]
  );
  
  // Check shoulder stability (shoulders should stay level)
  const shoulderLevelness = Math.abs(rightShoulder.y - leftShoulder.y);
  
  // Form quality assessment
  let formIssues = [];
  let formQuality = "good";
  
  // Check elbow position
  if (rightElbow.x < rightShoulder.x - 0.1) {
    formIssues.push("Right elbow moving forward");
  }
  
  if (leftElbow.x > leftShoulder.x + 0.1) {
    formIssues.push("Left elbow moving forward");
  }
  
  // Check shoulder stability
  if (shoulderLevelness > 0.05) {
    formIssues.push("Shoulders not level");
  }
  
  if (formIssues.length > 0) {
    formQuality = "needs_improvement";
  }
  
  // Previous rep state to detect changes
  const previousRepState = repState;
  
  // Track rep start time for duration calculation
  let repStartTime = Date.now();
  let repCompleted = false;
  
  // Simple state machine for rep counting
  // Using the right arm as reference - could be improved to detect both arms
  if (rightElbowAngle > 150 && repState === 'up') {
    // Arm extended, completed the "down" part of the rep
    repState = 'down';
  } else if (rightElbowAngle < 60 && repState === 'down') {
    // Arm bent, completed the "up" part of the rep, count it
    repState = 'up';
    repCount++;
    repCompleted = true;
    console.log(`Rep counted: ${repCount}`);
    
    // Announce rep count with audio coach
    if (audioCoach) {
      audioCoach.countRep(repCount);
    }
  } else if (repState === 'waiting' && rightElbowAngle > 150) {
    // Initial state, start with arm extended
    repState = 'down';
    repStartTime = Date.now();
  }
  
  // Create metrics object
  const metrics = {
    jointAngles: {
      rightElbow: rightElbowAngle,
      leftElbow: leftElbowAngle
    },
    shoulderLevelness: shoulderLevelness,
    formQuality: formQuality,
    formIssues: formIssues,
    repState: repState
  };
  
  // Record rep in analytics if completed
  if (repCompleted && analytics) {
    // Add duration and start time to the metrics
    metrics.duration = (Date.now() - repStartTime) / 1000;
    metrics.startTime = repStartTime;
    
    // Record the rep
    analytics.recordRep(metrics);
  }
  
  return metrics;
}

// Basic shoulder press detection
function analyzeShoulderPress() {
  const pose = lastPoseData.pose;
  if (!pose) return null;
  
  // Get relevant landmarks for right arm
  const rightShoulder = pose[12]; // Right shoulder
  const rightElbow = pose[14];    // Right elbow
  const rightWrist = pose[16];    // Right wrist
  
  // Get relevant landmarks for left arm
  const leftShoulder = pose[11]; // Left shoulder
  const leftElbow = pose[13];    // Left elbow
  const leftWrist = pose[15];    // Left wrist
  
  if (!rightShoulder || !rightElbow || !rightWrist || !leftShoulder || !leftElbow || !leftWrist) return null;
  
  // Calculate elbow angles
  const rightElbowAngle = calculateAngle(
    [rightShoulder.x, rightShoulder.y],
    [rightElbow.x, rightElbow.y],
    [rightWrist.x, rightWrist.y]
  );
  
  const leftElbowAngle = calculateAngle(
    [leftShoulder.x, leftShoulder.y],
    [leftElbow.x, leftElbow.y],
    [leftWrist.x, leftWrist.y]
  );
  
  // Check for proper form
  let formIssues = [];
  let formQuality = "good";
  
  // Check wrist alignment (should be roughly above elbows)
  const rightWristAlignment = Math.abs(rightWrist.x - rightElbow.x);
  const leftWristAlignment = Math.abs(leftWrist.x - leftElbow.x);
  
  if (rightWristAlignment > 0.1) {
    formIssues.push("Right wrist not aligned with elbow");
  }
  
  if (leftWristAlignment > 0.1) {
    formIssues.push("Left wrist not aligned with elbow");
  }
  
  // Check if arms are at same height
  const armHeightDifference = Math.abs(rightWrist.y - leftWrist.y);
  if (armHeightDifference > 0.05) {
    formIssues.push("Arms not at equal height");
  }
  
  if (formIssues.length > 0) {
    formQuality = "needs_improvement";
  }
  
  // Previous rep state to detect changes
  const previousRepState = repState;
  
  // Track rep start time for duration calculation
  let repStartTime = Date.now();
  let repCompleted = false;
  
  // Simple state machine for rep counting
  if (rightElbowAngle > 150 && repState === 'down') {
    // Arm extended upward, completed the "up" part of the rep
    repState = 'up';
  } else if (rightElbowAngle < 90 && repState === 'up') {
    // Arm bent, completed the "down" part of the rep, count it
    repState = 'down';
    repCount++;
    repCompleted = true;
    console.log(`Rep counted: ${repCount}`);
    
    // Announce rep count with audio coach
    if (audioCoach) {
      audioCoach.countRep(repCount);
    }
  } else if (repState === 'waiting' && rightElbowAngle < 90) {
    // Initial state, start with arm down
    repState = 'down';
    repStartTime = Date.now();
  }
  
  // Create metrics object
  const metrics = {
    jointAngles: {
      rightElbow: rightElbowAngle,
      leftElbow: leftElbowAngle
    },
    wristAlignment: {
      right: rightWristAlignment,
      left: leftWristAlignment
    },
    armHeightDifference: armHeightDifference,
    formQuality: formQuality,
    formIssues: formIssues,
    repState: repState
  };
  
  // Record rep in analytics if completed
  if (repCompleted && analytics) {
    // Add duration and start time to the metrics
    metrics.duration = (Date.now() - repStartTime) / 1000;
    metrics.startTime = repStartTime;
    
    // Record the rep
    analytics.recordRep(metrics);
  }
  
  return metrics;
}

// Using imported calculateAngle function from exercise-metrics.js

// Update the exercise metrics in the UI
function updateExerciseMetrics() {
  // Update rep counter under camera
  const repCounter = repCounterContainer.querySelector('.rep-counter');
  if (repCounter) {
    repCounter.textContent = repCount;
  }
  
  if (selectedExercise.rep_goal) {
    const progressBarFill = repCounterContainer.querySelector('.progress-bar-fill');
    const progressText = repCounterContainer.querySelector('.progress-text');
    
    const progressPercentage = Math.min((repCount / selectedExercise.rep_goal) * 100, 100);
    
    if (progressBarFill) {
      progressBarFill.style.width = `${progressPercentage}%`;
    }
    
    if (progressText) {
      progressText.textContent = `${repCount}/${selectedExercise.rep_goal} reps completed`;
    }
  }
}

// Generate feedback based on collected exercise data
async function generateExerciseFeedback(data) {
  if (!data || data.length === 0) return;
  
  // Show loading state
  const feedbackLoading = document.getElementById('feedback-loading');
  const feedbackContainer = document.getElementById('feedback-container');
  
  if (feedbackLoading && feedbackContainer) {
    feedbackLoading.style.display = 'block';
    feedbackContainer.style.opacity = '0.5';
  }
  
  // Prepare feedback elements
  const formAssessment = document.getElementById('form-assessment');
  const improvementTip = document.getElementById('improvement-tip');
  const progressFeedback = document.getElementById('progress-feedback');
  const breathingReminder = document.getElementById('breathing-reminder');
  
  // Initialize with basic feedback as a fallback
  const lastDataPoint = data[data.length - 1];
  let basicFeedback = {
    FORM_ASSESSMENT: lastDataPoint.formQuality === "good" 
      ? "Your form looks good overall! Keep maintaining proper alignment."
      : `Form needs improvement. Focus on: ${lastDataPoint.formIssues.join(', ')}.`,
    
    IMPROVEMENT_TIP: lastDataPoint.formQuality === "good"
      ? "Continue focusing on controlled movements throughout the entire range of motion."
      : lastDataPoint.formIssues.length > 0 
        ? `Work on ${lastDataPoint.formIssues[0].toLowerCase()}.`
        : "Focus on maintaining proper form rather than speed.",
        
    PROGRESS_FEEDBACK: `You've completed ${repCount} ${repCount === 1 ? 'rep' : 'reps'}${selectedExercise.rep_goal 
      ? ` out of ${selectedExercise.rep_goal}` 
      : ''}. ${repCount >= (selectedExercise.rep_goal || 12) 
        ? 'Great job reaching your goal!' 
        : 'Keep pushing, you\'re making progress!'}`,
        
    BREATHING_REMINDER: "Remember to breathe - exhale during exertion (lifting phase) and inhale during the relaxation phase."
  };
  
  try {
    // Call the Gemini API for enhanced feedback
    const aiResponse = await sendToGemini(data);
    
    console.log("AI response received:", aiResponse);
    
    // If the API call was successful and returned sectioned feedback
    if (aiResponse.success && aiResponse.sections) {
      // Use the AI feedback sections
      if (formAssessment) formAssessment.textContent = aiResponse.sections.FORM_ASSESSMENT || basicFeedback.FORM_ASSESSMENT;
      if (improvementTip) improvementTip.textContent = aiResponse.sections.IMPROVEMENT_TIP || basicFeedback.IMPROVEMENT_TIP;
      if (progressFeedback) progressFeedback.textContent = aiResponse.sections.PROGRESS_FEEDBACK || basicFeedback.PROGRESS_FEEDBACK;
      if (breathingReminder) breathingReminder.textContent = aiResponse.sections.BREATHING_REMINDER || basicFeedback.BREATHING_REMINDER;
      
      // Apply styling based on quality
      const formSection = formAssessment?.closest('.feedback-section');
      if (formSection) {
        formSection.classList.remove('good', 'needs-improvement');
        if (lastDataPoint.formQuality === "good") {
          formSection.classList.add('good');
        } else {
          formSection.classList.add('needs-improvement');
        }
      }
    } else {
      // Use basic feedback if AI response failed or didn't have sections
      if (formAssessment) formAssessment.textContent = basicFeedback.FORM_ASSESSMENT;
      if (improvementTip) improvementTip.textContent = basicFeedback.IMPROVEMENT_TIP;
      if (progressFeedback) progressFeedback.textContent = basicFeedback.PROGRESS_FEEDBACK;
      if (breathingReminder) breathingReminder.textContent = basicFeedback.BREATHING_REMINDER;
    }
  } catch (error) {
    console.error('Error generating AI feedback:', error);
    
    // Use basic feedback if there was an error
    if (formAssessment) formAssessment.textContent = basicFeedback.FORM_ASSESSMENT;
    if (improvementTip) improvementTip.textContent = basicFeedback.IMPROVEMENT_TIP;
    if (progressFeedback) progressFeedback.textContent = basicFeedback.PROGRESS_FEEDBACK;
    if (breathingReminder) breathingReminder.textContent = basicFeedback.BREATHING_REMINDER;
  } finally {
    // Hide loading indicator and restore container opacity
    if (feedbackLoading && feedbackContainer) {
      feedbackLoading.style.display = 'none';
      feedbackContainer.style.opacity = '1';
    }
  }
}

// Send exercise data to Gemini API for enhanced feedback
async function sendToGemini(batchedData) {
  try {
    // Process data into a format suitable for Gemini
    const processedData = {
      exerciseName: selectedExercise.name,
      repCount: repCount,
      repGoal: selectedExercise.rep_goal,
      formMetrics: batchedData,
      // Include enhanced metrics summaries
      enhancedMetrics: {
        // 3D pose data summary
        worldPoseMetrics: batchedData.filter(data => data.worldPoseMetrics).length > 0,
        
        // Movement dynamics
        movementDynamics: {
          averageVelocity: calculateAverageMetric(batchedData, 'movement.velocity'),
          overallSmoothness: getFrequentValue(batchedData, 'movement.smoothness'),
          timeToComplete: batchedData.length > 0 ? 
            (batchedData[batchedData.length-1].timestamp - batchedData[0].timestamp) / 1000 : 0
        },
        
        // Body symmetry 
        symmetry: {
          balance: getFrequentValue(batchedData, 'symmetry.leftRightBalance'),
          averageDiscrepancies: calculateAverageMetric(batchedData, 'symmetry.angleDiscrepancies')
        },
        
        // Posture analysis
        posture: {
          spineAlignment: getFrequentValue(batchedData, 'posture.spineAlignment'),
          shoulderAlignment: getFrequentValue(batchedData, 'posture.shoulderAlignment'),
          hipAlignment: getFrequentValue(batchedData, 'posture.hipAlignment')
        },
        
        // Range of motion
        rangeOfMotion: {
          maxAngles: calculateMaxMetrics(batchedData, 'rangeOfMotion.maxAngles'),
          minAngles: calculateMinMetrics(batchedData, 'rangeOfMotion.minAngles'),
          consistency: getFrequentValue(batchedData, 'rangeOfMotion.consistency')
        }
      }
    };
    
    console.log("Sending enhanced data to Gemini API for analysis:", processedData);
    
    // Call the Gemini API for exercise feedback
    const response = await geminiAPI.generateExerciseFeedback(batchedData);
    return response;
    
  } catch (error) {
    console.error('Error processing exercise data:', error);
    return {
      success: false,
      feedback: "Unable to generate AI feedback at this time. Keep up the good work!",
      sections: null
    };
  }
}

// Helper function to calculate average of a nested metric across batched data
function calculateAverageMetric(batchedData, metricPath) {
  const path = metricPath.split('.');
  const values = [];
  
  batchedData.forEach(data => {
    let current = data;
    for (const key of path) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        current = null;
        break;
      }
    }
    
    if (current !== null) {
      if (typeof current === 'object') {
        // If it's an object, we need to average all numeric values
        Object.values(current).forEach(val => {
          if (typeof val === 'number') {
            values.push(val);
          }
        });
      } else if (typeof current === 'number') {
        values.push(current);
      }
    }
  });
  
  if (values.length === 0) return null;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

// Helper function to calculate max of a nested metric across batched data
function calculateMaxMetrics(batchedData, metricPath) {
  const path = metricPath.split('.');
  const maxValues = {};
  
  batchedData.forEach(data => {
    let current = data;
    for (const key of path) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        current = null;
        break;
      }
    }
    
    if (current !== null && typeof current === 'object') {
      // Process each key in the object
      Object.entries(current).forEach(([key, value]) => {
        if (typeof value === 'number') {
          if (maxValues[key] === undefined || value > maxValues[key]) {
            maxValues[key] = value;
          }
        }
      });
    }
  });
  
  return Object.keys(maxValues).length > 0 ? maxValues : null;
}

// Helper function to calculate min of a nested metric across batched data
function calculateMinMetrics(batchedData, metricPath) {
  const path = metricPath.split('.');
  const minValues = {};
  
  batchedData.forEach(data => {
    let current = data;
    for (const key of path) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        current = null;
        break;
      }
    }
    
    if (current !== null && typeof current === 'object') {
      // Process each key in the object
      Object.entries(current).forEach(([key, value]) => {
        if (typeof value === 'number') {
          if (minValues[key] === undefined || value < minValues[key]) {
            minValues[key] = value;
          }
        }
      });
    }
  });
  
  return Object.keys(minValues).length > 0 ? minValues : null;
}

// Helper function to get the most frequent value for a property
function getFrequentValue(batchedData, metricPath) {
  const path = metricPath.split('.');
  const valueCounts = {};
  
  batchedData.forEach(data => {
    let current = data;
    for (const key of path) {
      if (current && current[key] !== undefined) {
        current = current[key];
      } else {
        current = null;
        break;
      }
    }
    
    if (current !== null && (typeof current === 'string' || typeof current === 'boolean')) {
      valueCounts[current] = (valueCounts[current] || 0) + 1;
    }
  });
  
  if (Object.keys(valueCounts).length === 0) return null;
  
  // Find the most frequent value
  let mostFrequent = null;
  let highestCount = 0;
  
  Object.entries(valueCounts).forEach(([value, count]) => {
    if (count > highestCount) {
      mostFrequent = value;
      highestCount = count;
    }
  });
  
  return mostFrequent;
}

// Mobile step-based flow functionality
function setupMobileStepFlow() {
  // Step flow state
  const mobileFlowState = {
    currentStep: 1,
    selectedExercise: null,
    exerciseOptions: {
      repGoal: 10,
      // Other options
    },
    isExerciseActive: false
  };
  
  // DOM elements
  const mobileStepperEl = document.getElementById('mobile-stepper');
  const stepContentEls = document.querySelectorAll('.step-content');
  const stepNavigationEl = document.querySelector('.step-navigation');
  const backBtn = document.getElementById('step-back-btn');
  const nextBtn = document.getElementById('step-next-btn');
  const floatingActionBtn = document.getElementById('mobile-action-btn');
  const mobileRepCounter = document.getElementById('mobile-rep-counter');
  
  // Only initialize on mobile devices
  if (window.innerWidth <= 768) {
    // Show mobile stepper and step navigation
    if (mobileStepperEl) mobileStepperEl.style.display = 'flex';
    if (stepNavigationEl) stepNavigationEl.style.display = 'flex';
    
    // Hide desktop panels
    const desktopPanels = document.querySelectorAll('.side-panel, .camera-section');
    desktopPanels.forEach(panel => {
      panel.style.display = 'none';
    });
    
    // Populate step content containers
    populateStepContents();
    
    // Setup event listeners
    setupStepEventListeners();
  }
  
  // Populate step content containers with appropriate content
  function populateStepContents() {
    // Step 1: Exercise selection
    const step1Content = document.getElementById('step-1-content');
    if (step1Content) {
      // Clone the exercise list from the desktop view
      const exerciseList = document.getElementById('exercise-list');
      if (exerciseList) {
        const clonedList = exerciseList.cloneNode(true);
        step1Content.innerHTML = '<h2>Select an Exercise</h2>';
        step1Content.appendChild(clonedList);
      }
    }
    
    // Step 2: Exercise options
    const step2Content = document.getElementById('step-2-content');
    if (step2Content) {
      step2Content.innerHTML = `
        <h2>Configure Exercise</h2>
        <div class="exercise-options">
          <div class="option-group">
            <label for="rep-goal">Rep Goal:</label>
            <input type="number" id="mobile-rep-goal" min="1" max="50" value="10" class="select-control">
          </div>
          <div id="mobile-exercise-details" class="exercise-details">
            <!-- Will be populated when exercise is selected -->
          </div>
        </div>
      `;
    }
    
    // Step 3: Workout/Camera
    const step3Content = document.getElementById('step-3-content');
    if (step3Content) {
      // Clone the camera section from the desktop view
      const cameraSection = document.querySelector('.camera-section');
      if (cameraSection) {
        const clonedCamera = cameraSection.cloneNode(true);
        clonedCamera.style.display = 'block';
        step3Content.innerHTML = '';
        step3Content.appendChild(clonedCamera);
      }
    }
  }
  
  // Setup event listeners for step navigation
  function setupStepEventListeners() {
    // Exercise selection in step 1
    const exerciseCards = document.querySelectorAll('#step-1-content .exercise-card');
    exerciseCards.forEach(card => {
      card.addEventListener('click', () => {
        const exerciseId = parseInt(card.dataset.id);
        
        // Select the exercise in the main app
        selectExercise(exerciseId);
        
        // Update mobile flow state
        mobileFlowState.selectedExercise = exerciseId;
        
        // Update UI to show selection
        exerciseCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        // Update next button state
        nextBtn.disabled = false;
        
        // Update exercise details in step 2
        updateMobileExerciseDetails();
      });
    });
    
    // Rep goal input in step 2
    const repGoalInput = document.getElementById('mobile-rep-goal');
    if (repGoalInput) {
      repGoalInput.addEventListener('change', () => {
        mobileFlowState.exerciseOptions.repGoal = parseInt(repGoalInput.value);
      });
    }
    
    // Back button
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (mobileFlowState.currentStep > 1) {
          goToStep(mobileFlowState.currentStep - 1);
        }
      });
    }
    
    // Next button
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (mobileFlowState.currentStep < 3) {
          goToStep(mobileFlowState.currentStep + 1);
        } else if (mobileFlowState.currentStep === 3) {
          // Start workout
          startWorkout();
        }
      });
    }
    
    // Floating action button
    if (floatingActionBtn) {
      floatingActionBtn.addEventListener('click', () => {
        if (mobileFlowState.currentStep === 3) {
          // Toggle exercise state
          if (isExerciseActive) {
            toggleExercise();
            floatingActionBtn.innerHTML = '<i class="fas fa-play"></i>';
          } else {
            startWorkout();
          }
        } else {
          // Go to next step
          if (mobileFlowState.currentStep === 1 && mobileFlowState.selectedExercise === null) {
            showMessage("Please select an exercise first");
          } else {
            goToStep(mobileFlowState.currentStep + 1);
          }
        }
      });
    }
    
    // Setup mobile rep counter
    if (mobileRepCounter) {
      const repCountElement = mobileRepCounter.querySelector('.rep-count');
      
      // Create a MutationObserver to watch for changes to the rep counter
      const repCounterObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.target.className === 'rep-counter') {
            repCountElement.textContent = mutation.target.textContent;
          }
        });
      });
      
      // Start observing the rep counter
      const repCounter = document.querySelector('.rep-counter');
      if (repCounter) {
        repCounterObserver.observe(repCounter, { childList: true, subtree: true });
      }
    }
    
    // Show/hide mobile rep counter based on exercise state
    document.addEventListener('exercise-state-changed', (e) => {
      if (mobileRepCounter) {
        if (e.detail.active) {
          mobileRepCounter.classList.add('active');
          floatingActionBtn.innerHTML = '<i class="fas fa-stop"></i>';
        } else {
          mobileRepCounter.classList.remove('active');
          floatingActionBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
      }
    });
    
    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
      // Adjust UI for new orientation
      setTimeout(() => {
        if (isExerciseActive && mobileFlowState.currentStep === 3) {
          // Ensure camera is properly sized
          const canvas = document.querySelector('#step-3-content .output-canvas');
          if (canvas) {
            canvas.style.width = '100%';
          }
        }
      }, 300);
    });
  }
  
  // Navigate to a specific step
  function goToStep(stepNumber) {
    // Validate step transition
    if (stepNumber === 2 && mobileFlowState.selectedExercise === null) {
      showMessage("Please select an exercise first");
      return false;
    }
    
    // Update state
    mobileFlowState.currentStep = stepNumber;
    
    // Update UI
    updateStepperUI();
    showActiveStepContent();
    updateNavigationButtons();
    
    return true;
  }
  
  // Update the stepper UI based on current step
  function updateStepperUI() {
    document.querySelectorAll('.step').forEach(step => {
      const stepNum = parseInt(step.dataset.step);
      step.classList.remove('active', 'completed');
      
      if (stepNum === mobileFlowState.currentStep) {
        step.classList.add('active');
      } else if (stepNum < mobileFlowState.currentStep) {
        step.classList.add('completed');
      }
    });
  }
  
  // Show the active step content
  function showActiveStepContent() {
    // Hide all step content
    stepContentEls.forEach(content => {
      content.classList.remove('active');
    });
    
    // Show active step content
    const activeContent = document.getElementById(`step-${mobileFlowState.currentStep}-content`);
    if (activeContent) {
      activeContent.classList.add('active');
    }
  }
  
  // Update navigation buttons based on current step
  function updateNavigationButtons() {
    // Update back button
    backBtn.style.display = mobileFlowState.currentStep > 1 ? 'block' : 'none';
    
    // Update next button
    if (mobileFlowState.currentStep === 3) {
      nextBtn.textContent = 'Start Workout';
    } else if (mobileFlowState.currentStep === 2) {
      nextBtn.textContent = 'Continue';
    } else {
      nextBtn.textContent = 'Next';
      nextBtn.disabled = mobileFlowState.selectedExercise === null;
    }
  }
  
  // Update exercise details in step 2
  function updateMobileExerciseDetails() {
    const detailsContainer = document.getElementById('mobile-exercise-details');
    if (!detailsContainer) return;
    
    // Get the exercise details from the main app
    const exerciseDetails = document.getElementById('exercise-details');
    if (exerciseDetails) {
      detailsContainer.innerHTML = exerciseDetails.innerHTML;
    }
  }
  
  // Start the workout
  function startWorkout() {
    // Apply rep goal from options
    if (selectedExercise && mobileFlowState.exerciseOptions.repGoal) {
      selectedExercise.rep_goal = mobileFlowState.exerciseOptions.repGoal;
    }
    
    // First, stop any existing camera
    if (camera) {
      camera.stop();
      camera = null;
    }
    
    // Get the mobile step 3 video and canvas elements
    const mobileVideo = document.querySelector('#step-3-content .input-video');
    const mobileCanvas = document.querySelector('#step-3-content .output-canvas');
    const mobileCanvasCtx = mobileCanvas ? mobileCanvas.getContext('2d') : null;
    
    // Make sure canvas is visible
    if (mobileCanvas) {
      mobileCanvas.style.display = 'block';
    }
    
    // Create full-screen workout container
    const fullscreenContainer = document.createElement('div');
    fullscreenContainer.className = 'fullscreen-workout';
    fullscreenContainer.id = 'fullscreen-workout';
    
    // Clone video and canvas elements for fullscreen mode
    const fullscreenVideo = mobileVideo.cloneNode(true);
    const fullscreenCanvas = mobileCanvas.cloneNode(false);
    const fullscreenCanvasCtx = fullscreenCanvas.getContext('2d');
    
    // Add elements to fullscreen container
    fullscreenContainer.appendChild(fullscreenVideo);
    fullscreenContainer.appendChild(fullscreenCanvas);
    
    // Create floating feedback panel
    const floatingFeedback = createFloatingFeedbackPanel();
    fullscreenContainer.appendChild(floatingFeedback);
    
    // Create floating controls
    const floatingControls = document.createElement('div');
    floatingControls.className = 'floating-controls';
    floatingControls.innerHTML = `
      <button class="exit-fullscreen" title="Exit Fullscreen"><i class="fas fa-times"></i></button>
      <button class="toggle-guides" title="Toggle Guides"><i class="fas fa-eye"></i></button>
    `;
    fullscreenContainer.appendChild(floatingControls);
    
    // Add to document
    document.body.appendChild(fullscreenContainer);
    
    // Update global references to use the fullscreen elements
    videoElement = fullscreenVideo;
    canvasElement = fullscreenCanvas;
    canvasCtx = fullscreenCanvasCtx;
    
    // Start camera with the fullscreen elements
    try {
      camera = new Camera(videoElement, {
        onFrame: async () => {
          await holistic.send({image: videoElement});
        },
        width: 640,
        height: 480
      });
      
      camera.start().then(() => {
        console.log("Fullscreen camera started successfully");
        
        // Setup event listeners for fullscreen controls
        setupFullscreenControls();
        
      }).catch(error => {
        console.error("Error starting fullscreen camera:", error);
        showCameraError("Could not access your camera. Please check permissions and try again.");
        camera = null;
        exitFullscreenWorkout();
      });
    } catch (error) {
      console.error("Error initializing fullscreen camera:", error);
      showCameraError("Failed to initialize camera. Please check your device and browser settings.");
      exitFullscreenWorkout();
    }
    
    // Start the exercise if not already active
    if (!isExerciseActive) {
      toggleExercise();
    }
    
    // Update UI for workout mode
    document.body.classList.add('workout-mode');
    
    // Make sure mobile rep counter is visible in fullscreen mode
    const mobileRepCounter = document.getElementById('mobile-rep-counter');
    if (mobileRepCounter) {
      mobileRepCounter.classList.add('active');
      fullscreenContainer.appendChild(mobileRepCounter.cloneNode(true));
    }
  }
  
  // Create floating feedback panel
  function createFloatingFeedbackPanel() {
    const floatingFeedback = document.createElement('div');
    floatingFeedback.className = 'floating-feedback';
    floatingFeedback.innerHTML = `
      <div class="floating-feedback-header">
        <h3><i class="fas fa-brain"></i> AI Coach Feedback</h3>
        <i class="fas fa-chevron-down"></i>
      </div>
      <div class="floating-feedback-content">
        <div class="floating-feedback-sections">
          <div class="feedback-section">
            <h4><i class="fas fa-check-circle"></i> Form Assessment</h4>
            <p id="fullscreen-form-assessment">Start exercising to receive feedback on your form.</p>
          </div>
          <div class="feedback-section">
            <h4><i class="fas fa-lightbulb"></i> Improvement Tip</h4>
            <p id="fullscreen-improvement-tip">Complete a few reps to get personalized tips.</p>
          </div>
          <div class="feedback-section">
            <h4><i class="fas fa-chart-line"></i> Progress</h4>
            <p id="fullscreen-progress-feedback">Your progress will be tracked as you exercise.</p>
          </div>
        </div>
      </div>
    `;
    
    // Add toggle functionality
    const header = floatingFeedback.querySelector('.floating-feedback-header');
    header.addEventListener('click', () => {
      floatingFeedback.classList.toggle('expanded');
      const icon = header.querySelector('i.fas:last-child');
      icon.className = floatingFeedback.classList.contains('expanded') ? 
        'fas fa-chevron-up' : 'fas fa-chevron-down';
    });
    
    return floatingFeedback;
  }
  
  // Setup event listeners for fullscreen controls
  function setupFullscreenControls() {
    const fullscreenContainer = document.getElementById('fullscreen-workout');
    if (!fullscreenContainer) return;
    
    // Exit fullscreen button
    const exitButton = fullscreenContainer.querySelector('.exit-fullscreen');
    if (exitButton) {
      exitButton.addEventListener('click', exitFullscreenWorkout);
    }
    
    // Toggle guides button
    const guidesButton = fullscreenContainer.querySelector('.toggle-guides');
    if (guidesButton) {
      guidesButton.addEventListener('click', () => {
        if (visualizer) {
          visualizer.showGuides = !visualizer.showGuides;
          guidesButton.innerHTML = visualizer.showGuides ? 
            '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        }
      });
    }
    
    // Sync feedback from main UI to fullscreen UI
    const syncFeedback = () => {
      const mainFormAssessment = document.getElementById('form-assessment');
      const fullscreenFormAssessment = document.getElementById('fullscreen-form-assessment');
      if (mainFormAssessment && fullscreenFormAssessment) {
        fullscreenFormAssessment.textContent = mainFormAssessment.textContent;
      }
      
      const mainImprovementTip = document.getElementById('improvement-tip');
      const fullscreenImprovementTip = document.getElementById('fullscreen-improvement-tip');
      if (mainImprovementTip && fullscreenImprovementTip) {
        fullscreenImprovementTip.textContent = mainImprovementTip.textContent;
      }
      
      const mainProgressFeedback = document.getElementById('progress-feedback');
      const fullscreenProgressFeedback = document.getElementById('fullscreen-progress-feedback');
      if (mainProgressFeedback && fullscreenProgressFeedback) {
        fullscreenProgressFeedback.textContent = mainProgressFeedback.textContent;
      }
    };
    
    // Initial sync
    syncFeedback();
    
    // Set up MutationObserver to sync feedback
    const feedbackContainer = document.getElementById('feedback-container');
    if (feedbackContainer) {
      const observer = new MutationObserver(syncFeedback);
      observer.observe(feedbackContainer, { 
        childList: true, 
        subtree: true, 
        characterData: true 
      });
    }
    
    // Sync rep counter
    const mainRepCounter = document.querySelector('.rep-counter');
    const fullscreenRepCounter = fullscreenContainer.querySelector('.rep-count');
    
    if (mainRepCounter && fullscreenRepCounter) {
      const repObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            fullscreenRepCounter.textContent = mainRepCounter.textContent;
          }
        });
      });
      
      repObserver.observe(mainRepCounter, { childList: true });
    }
  }
  
  // Exit fullscreen workout mode
  function exitFullscreenWorkout() {
    // Stop camera
    if (camera) {
      camera.stop();
      camera = null;
    }
    
    // Remove fullscreen container
    const fullscreenContainer = document.getElementById('fullscreen-workout');
    if (fullscreenContainer) {
      document.body.removeChild(fullscreenContainer);
    }
    
    // Reset to mobile step UI
    const mobileVideo = document.querySelector('#step-3-content .input-video');
    const mobileCanvas = document.querySelector('#step-3-content .output-canvas');
    const mobileCanvasCtx = mobileCanvas ? mobileCanvas.getContext('2d') : null;
    
    // Update global references back to mobile elements
    videoElement = mobileVideo;
    canvasElement = mobileCanvas;
    canvasCtx = mobileCanvasCtx;
    
    // Restart camera with mobile elements
    startCamera();
    
    // Update UI
    document.body.classList.remove('workout-mode');
    
    // Make sure mobile rep counter is back in its original position
    const mobileRepCounter = document.getElementById('mobile-rep-counter');
    if (mobileRepCounter) {
      document.body.appendChild(mobileRepCounter);
    }
  }
  
  // Show a message to the user
  function showMessage(message) {
    alert(message);
  }
}

// Setup collapsible sections for mobile
function setupCollapsibleSections() {
  // Convert feedback sections to collapsible on mobile
  if (window.innerWidth <= 768) {
    const feedbackSections = document.querySelectorAll('.feedback-section');
    
    feedbackSections.forEach(section => {
      // Skip if already converted
      if (section.classList.contains('collapsible-section')) return;
      
      // Create collapsible structure
      const header = section.querySelector('h4');
      const content = section.querySelector('p');
      
      if (header && content) {
        // Create collapsible header
        const collapsibleHeader = document.createElement('div');
        collapsibleHeader.className = 'collapsible-header';
        collapsibleHeader.appendChild(header.cloneNode(true));
        
        // Add toggle icon
        const toggleIcon = document.createElement('i');
        toggleIcon.className = 'fas fa-chevron-down';
        collapsibleHeader.appendChild(toggleIcon);
        
        // Create collapsible content
        const collapsibleContent = document.createElement('div');
        collapsibleContent.className = 'collapsible-content';
        collapsibleContent.appendChild(content.cloneNode(true));
        
        // Clear original section and add new structure
        section.innerHTML = '';
        section.classList.add('collapsible-section');
        section.appendChild(collapsibleHeader);
        section.appendChild(collapsibleContent);
        
        // Add toggle functionality
        collapsibleHeader.addEventListener('click', () => {
          section.classList.toggle('open');
          toggleIcon.className = section.classList.contains('open') ? 
            'fas fa-chevron-up' : 'fas fa-chevron-down';
        });
      }
    });
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupMobileStepFlow();
  
  // Add resize handler for responsive adjustments
  window.addEventListener('resize', () => {
    if (window.innerWidth <= 768) {
      setupCollapsibleSections();
    }
  });
});

// Custom event for exercise state changes
function dispatchExerciseStateEvent(active) {
  const event = new CustomEvent('exercise-state-changed', {
    detail: { active: active }
  });
  document.dispatchEvent(event);
}

// Override toggleExercise to dispatch state change events
const originalToggleExercise = toggleExercise;
toggleExercise = function() {
  originalToggleExercise.apply(this, arguments);
  dispatchExerciseStateEvent(isExerciseActive);
};
