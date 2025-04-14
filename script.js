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

// Import the Gemini API module
import { geminiAPI } from './gemini-api.js';
// Import the exercises array
import exercisesModule, { exercises } from './exercises.js';

// Global variables
let camera = null;
let holistic = null;
let selectedExercise = null;
let isExerciseActive = false;
let lastPoseData = null;
let repCount = 0;
let repState = 'waiting'; // waiting, up, down
let exerciseData = []; // Store exercise data for analysis
let lastFeedbackUpdate = Date.now();
let feedbackInterval = 30000; // 30 seconds between feedback updates

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
  
  renderExerciseList(exerciseList);
  setupEventListeners();
  initializeMediaPipe();
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
    enableSegmentation: true,
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
  
  // Draw the camera feed on the canvas
  if (results.image) {
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
  }
  
  // Draw the segmentation mask if available
  if (results.segmentationMask) {
    canvasCtx.globalCompositeOperation = 'source-in';
    canvasCtx.fillStyle = 'rgba(0, 128, 255, 0.2)';
    canvasCtx.drawImage(
      results.segmentationMask,
      0, 0, canvasElement.width, canvasElement.height
    );
    canvasCtx.globalCompositeOperation = 'source-over';
  }
  
  // Draw the pose on the canvas
  drawPose(results);
  
  // Analyze the exercise if active
  if (isExerciseActive && selectedExercise && lastPoseData) {
    const metrics = analyzeExercise();
    
    // Store the metrics for batch analysis
    if (metrics) {
      exerciseData.push(metrics);
    }
    
    // Check if it's time to generate feedback
    if (Date.now() - lastFeedbackUpdate >= feedbackInterval) {
      generateExerciseFeedback(exerciseData);
      lastFeedbackUpdate = Date.now();
      exerciseData = []; // Reset data after sending for analysis
    }
  }
  
  canvasCtx.restore();
}

// Draw the pose landmarks on the canvas
function drawPose(results) {
  // Draw pose landmarks
  if (results.poseLandmarks) {
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#3a86ff', lineWidth: 4});
    drawLandmarks(canvasCtx, results.poseLandmarks, {color: '#ff3a5e', lineWidth: 2});
    
    // If exercise is active, draw key joint angles for the selected exercise
    if (isExerciseActive && selectedExercise) {
      drawJointAngles(results.poseLandmarks);
    }
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

// Draw joint angles for the current exercise
function drawJointAngles(landmarks) {
  if (!selectedExercise || !landmarks) return;
  
  const exerciseName = selectedExercise.name;
  
  if (exerciseName === "Dumbbell Bicep Curls") {
    // Draw elbow angle for bicep curls
    const rightShoulder = landmarks[12]; // Right shoulder
    const rightElbow = landmarks[14];    // Right elbow
    const rightWrist = landmarks[16];    // Right wrist
    
    if (rightShoulder && rightElbow && rightWrist) {
      const angle = calculateAngle(
        [rightShoulder.x, rightShoulder.y],
        [rightElbow.x, rightElbow.y],
        [rightWrist.x, rightWrist.y]
      );
      
      // Draw the angle on the canvas
      drawAngle(rightElbow.x, rightElbow.y, angle, angle < 90 ? '#30c39e' : '#ff3a5e');
    }
    
    // Also check left arm
    const leftShoulder = landmarks[11]; // Left shoulder
    const leftElbow = landmarks[13];    // Left elbow
    const leftWrist = landmarks[15];    // Left wrist
    
    if (leftShoulder && leftElbow && leftWrist) {
      const angle = calculateAngle(
        [leftShoulder.x, leftShoulder.y],
        [leftElbow.x, leftElbow.y],
        [leftWrist.x, leftWrist.y]
      );
      
      // Draw the angle on the canvas
      drawAngle(leftElbow.x, leftElbow.y, angle, angle < 90 ? '#30c39e' : '#ff3a5e');
    }
  } 
  else if (exerciseName === "Dumbbell Shoulder Press") {
    // Draw shoulder/elbow angle for shoulder press
    const rightShoulder = landmarks[12]; // Right shoulder
    const rightElbow = landmarks[14];    // Right elbow
    const rightWrist = landmarks[16];    // Right wrist
    
    if (rightShoulder && rightElbow && rightWrist) {
      const angle = calculateAngle(
        [rightShoulder.x, rightShoulder.y],
        [rightElbow.x, rightElbow.y],
        [rightWrist.x, rightWrist.y]
      );
      
      // Draw the angle on the canvas
      drawAngle(rightElbow.x, rightElbow.y, angle, angle > 150 ? '#30c39e' : '#ff3a5e');
    }
    
    // Also check left arm
    const leftShoulder = landmarks[11]; // Left shoulder
    const leftElbow = landmarks[13];    // Left elbow
    const leftWrist = landmarks[15];    // Left wrist
    
    if (leftShoulder && leftElbow && leftWrist) {
      const angle = calculateAngle(
        [leftShoulder.x, leftShoulder.y],
        [leftElbow.x, leftElbow.y],
        [leftWrist.x, leftWrist.y]
      );
      
      // Draw the angle on the canvas
      drawAngle(leftElbow.x, leftElbow.y, angle, angle > 150 ? '#30c39e' : '#ff3a5e');
    }
  }
  // Add more exercises with specific joint angles to visualize
}

// Draw angle on the canvas
function drawAngle(x, y, angle, color) {
  const canvasX = x * canvasElement.width;
  const canvasY = y * canvasElement.height;
  
  canvasCtx.font = '16px Arial';
  canvasCtx.fillStyle = color;
  canvasCtx.fillText(`${Math.round(angle)}°`, canvasX, canvasY);
  
  // Draw a small circle around the joint
  canvasCtx.beginPath();
  canvasCtx.arc(canvasX, canvasY, 20, 0, 2 * Math.PI);
  canvasCtx.strokeStyle = color;
  canvasCtx.lineWidth = 2;
  canvasCtx.stroke();
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
  } else {
    // Update UI
    startExerciseButton.innerHTML = '<i class="fas fa-play"></i> Start Exercise';
    
    // Hide rep counter
    repCounterContainer.classList.remove('active');
    
    // Generate final feedback if we have data
    if (exerciseData.length > 0) {
      generateExerciseFeedback(exerciseData);
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
  `;
  
  // Show the rep counter container
  repCounterContainer.classList.add('active');
}

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
  
  // Example basic implementation for bicep curls
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
  
  // Update exercise metrics in the UI
  updateExerciseMetrics();
  
  return metrics;
}

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
  
  // Simple state machine for rep counting
  // Using the right arm as reference - could be improved to detect both arms
  if (rightElbowAngle > 150 && repState === 'up') {
    // Arm extended, completed the "down" part of the rep
    repState = 'down';
  } else if (rightElbowAngle < 60 && repState === 'down') {
    // Arm bent, completed the "up" part of the rep, count it
    repState = 'up';
    repCount++;
    console.log(`Rep counted: ${repCount}`);
  } else if (repState === 'waiting' && rightElbowAngle > 150) {
    // Initial state, start with arm extended
    repState = 'down';
  }
  
  return {
    jointAngles: {
      rightElbow: rightElbowAngle,
      leftElbow: leftElbowAngle
    },
    shoulderLevelness: shoulderLevelness,
    formQuality: formQuality,
    formIssues: formIssues,
    repState: repState
  };
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
  
  // Simple state machine for rep counting
  if (rightElbowAngle > 150 && repState === 'down') {
    // Arm extended upward, completed the "up" part of the rep
    repState = 'up';
  } else if (rightElbowAngle < 90 && repState === 'up') {
    // Arm bent, completed the "down" part of the rep, count it
    repState = 'down';
    repCount++;
    console.log(`Rep counted: ${repCount}`);
  } else if (repState === 'waiting' && rightElbowAngle < 90) {
    // Initial state, start with arm down
    repState = 'down';
  }
  
  return {
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

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', initApp); 