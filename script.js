// DOM Elements
const videoElement = document.querySelector('.input-video');
const canvasElement = document.querySelector('.output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const startCameraButton = document.getElementById('start-camera');
const exerciseListContainer = document.getElementById('exercise-list');
const currentExerciseSpan = document.getElementById('current-exercise');
const exerciseDetailsContainer = document.getElementById('exercise-details');
const startExerciseButton = document.getElementById('start-exercise');
const repCounterContainer = document.getElementById('rep-counter-container');

// Global variables
let camera = null;
let holistic = null;
let selectedExercise = null;
let isExerciseActive = false;
let lastPoseData = null;
let repCount = 0;
let repState = 'waiting'; // waiting, up, down

// Initialize the application
function initApp() {
  renderExerciseList();
  setupEventListeners();
  initializeMediaPipe();
}

// Render the list of exercises
function renderExerciseList() {
  exerciseListContainer.innerHTML = '';
  
  exercises.forEach(exercise => {
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
    camera = new Camera(videoElement, {
      onFrame: async () => {
        await holistic.send({image: videoElement});
      },
      width: 640,
      height: 480
    });
    camera.start();
  }
}

// Initialize MediaPipe Holistic
function initializeMediaPipe() {
  holistic = new Holistic({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
    }
  });
  
  holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    smoothSegmentation: true,
    refineFaceLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  
  holistic.onResults(onResults);
}

// Process MediaPipe results
function onResults(results) {
  // Save the pose data for exercise analysis
  if (results.poseLandmarks) {
    lastPoseData = {
      pose: results.poseLandmarks,
      leftHand: results.leftHandLandmarks,
      rightHand: results.rightHandLandmarks,
      face: results.faceLandmarks
    };
  }
  
  // Clear the canvas
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  
  // Draw the camera feed on the canvas
  if (results.image) {
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  }
  
  // Draw the pose on the canvas
  drawPose(results);
  
  // Analyze the exercise if active
  if (isExerciseActive && selectedExercise && lastPoseData) {
    analyzeExercise();
  }
  
  canvasCtx.restore();
}

// Draw the pose landmarks on the canvas
function drawPose(results) {
  // Draw pose landmarks
  if (results.poseLandmarks) {
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#3a86ff', lineWidth: 4});
    drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#ff3a5e', lineWidth: 2});
  }
  
  // Draw hand landmarks
  if (results.leftHandLandmarks) {
    drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {color: '#CC0000', lineWidth: 3});
    drawLandmarks(canvasCtx, results.leftHandLandmarks, {color: '#00FF00', lineWidth: 1});
  }
  if (results.rightHandLandmarks) {
    drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {color: '#00CC00', lineWidth: 3});
    drawLandmarks(canvasCtx, results.rightHandLandmarks, {color: '#FF0000', lineWidth: 1});
  }
}

// Select an exercise
function selectExercise(exerciseId) {
  // Find the exercise by ID
  const exercise = exercises.find(ex => ex.id === exerciseId);
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

// Toggle exercise tracking on/off
function toggleExercise() {
  if (!selectedExercise) return;
  
  isExerciseActive = !isExerciseActive;
  
  if (isExerciseActive) {
    // Reset rep count
    repCount = 0;
    repState = 'waiting';
    
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
  } else {
    // Update UI
    startExerciseButton.innerHTML = '<i class="fas fa-play"></i> Start Exercise';
    
    // Hide rep counter
    repCounterContainer.classList.remove('active');
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
  `;
  
  // Show the rep counter container
  repCounterContainer.classList.add('active');
}

// Analyze the exercise based on pose data
function analyzeExercise() {
  if (!lastPoseData || !lastPoseData.pose) return;
  
  // This is a simplified placeholder for exercise analysis
  // In a real application, you would implement more sophisticated analysis
  
  // Example basic implementation for bicep curls
  if (selectedExercise.name === "Dumbbell Bicep Curls") {
    analyzeBicepCurls();
  } else if (selectedExercise.name === "Dumbbell Shoulder Press") {
    analyzeShoulderPress();
  }
  
  // Update exercise metrics in the UI
  updateExerciseMetrics();
}

// Basic bicep curl detection
function analyzeBicepCurls() {
  const pose = lastPoseData.pose;
  if (!pose) return;
  
  // Get relevant landmarks for right arm (example)
  const rightShoulder = pose[12]; // Right shoulder
  const rightElbow = pose[14];    // Right elbow
  const rightWrist = pose[16];    // Right wrist
  
  if (!rightShoulder || !rightElbow || !rightWrist) return;
  
  // Calculate elbow angle
  const angle = calculateAngle(
    [rightShoulder.x, rightShoulder.y],
    [rightElbow.x, rightElbow.y],
    [rightWrist.x, rightWrist.y]
  );
  
  // Simple state machine for rep counting
  if (angle > 150 && repState === 'up') {
    // Arm extended, completed the "down" part of the rep
    repState = 'down';
  } else if (angle < 60 && repState === 'down') {
    // Arm bent, completed the "up" part of the rep, count it
    repState = 'up';
    repCount++;
    console.log(`Rep counted: ${repCount}`);
  } else if (repState === 'waiting' && angle > 150) {
    // Initial state, start with arm extended
    repState = 'down';
  }
}

// Basic shoulder press detection
function analyzeShoulderPress() {
  const pose = lastPoseData.pose;
  if (!pose) return;
  
  // Get relevant landmarks for right arm (example)
  const rightShoulder = pose[12]; // Right shoulder
  const rightElbow = pose[14];    // Right elbow
  const rightWrist = pose[16];    // Right wrist
  
  if (!rightShoulder || !rightElbow || !rightWrist) return;
  
  // Calculate elbow angle
  const angle = calculateAngle(
    [rightShoulder.x, rightShoulder.y],
    [rightElbow.x, rightElbow.y],
    [rightWrist.x, rightWrist.y]
  );
  
  // Simple state machine for rep counting
  if (angle > 150 && repState === 'down') {
    // Arm extended upward, completed the "up" part of the rep
    repState = 'up';
  } else if (angle < 90 && repState === 'up') {
    // Arm bent, completed the "down" part of the rep, count it
    repState = 'down';
    repCount++;
    console.log(`Rep counted: ${repCount}`);
  } else if (repState === 'waiting' && angle < 90) {
    // Initial state, start with arm down
    repState = 'down';
  }
}

// Calculate angle between three points
function calculateAngle(a, b, c) {
  const radians = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(a[1] - b[1], a[0] - b[0]);
  let angle = Math.abs(radians * 180.0 / Math.PI);
  
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  
  return angle;
}

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

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 