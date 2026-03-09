// Shared pose utility functions for angle calculation and feedback

// Common angle calculation function
function calculateAngle(pointA, pointB, pointC) {
  const radians = Math.atan2(pointC.y - pointB.y, pointC.x - pointB.x) -
                  Math.atan2(pointA.y - pointB.y, pointA.x - pointB.x);
  let angle = Math.abs(radians * 180.0 / Math.PI);

  if (angle > 180.0) {
    angle = 360 - angle;
  }

  return angle;
}

// Enhanced smoothing function for angle measurements with larger window and outlier rejection
function smoothAngle(newAngle, previousAngles, weight = 0.2) {
  if (!previousAngles || previousAngles.length === 0) return newAngle;

  // Sort angles to identify outliers
  const sortedAngles = [...previousAngles].sort((a, b) => a - b);

  // Remove potential outliers (top and bottom 10% if we have enough samples)
  let filteredAngles = previousAngles;
  if (previousAngles.length >= 10) {
    const cutoff = Math.floor(previousAngles.length * 0.1);
    filteredAngles = sortedAngles.slice(cutoff, sortedAngles.length - cutoff);
  }

  // Calculate average of filtered angles
  const avgAngle = filteredAngles.reduce((sum, angle) => sum + angle, 0) / filteredAngles.length;

  // Apply exponential smoothing with lower weight for new values to reduce jitter
  return newAngle * weight + avgAngle * (1 - weight);
}

// Adaptive smoothing for fast movements (football kicks, volleys, etc.)
// Increases weight when angular velocity is high so fast movements aren't lagged out
function smoothAngleFast(newAngle, previousAngles, baseWeight = 0.2) {
  if (!previousAngles || previousAngles.length === 0) return newAngle;

  const recent = previousAngles[previousAngles.length - 1];
  const delta = Math.abs(newAngle - recent);

  // Adaptive weight: fast movements (delta > 15°/frame) trust new data more
  // Slow movements use the base weight for stability
  let weight = baseWeight;
  if (delta > 30) {
    weight = 0.85; // Very fast — near-raw value
  } else if (delta > 15) {
    weight = 0.6;  // Fast — mostly trust new value
  } else if (delta > 8) {
    weight = 0.4;  // Moderate — balanced
  }

  // For fast movements, skip outlier rejection (the "outlier" IS the movement)
  if (delta > 15) {
    return newAngle * weight + recent * (1 - weight);
  }

  // Slow movement: use standard outlier-filtered smoothing
  const sortedAngles = [...previousAngles].sort((a, b) => a - b);
  let filteredAngles = previousAngles;
  if (previousAngles.length >= 10) {
    const cutoff = Math.floor(previousAngles.length * 0.1);
    filteredAngles = sortedAngles.slice(cutoff, sortedAngles.length - cutoff);
  }
  const avgAngle = filteredAngles.reduce((sum, angle) => sum + angle, 0) / filteredAngles.length;
  return newAngle * weight + avgAngle * (1 - weight);
}

// Calculate angular velocity (degrees per second) from angle history
function angularVelocity(previousAngles, fps = 15) {
  if (!previousAngles || previousAngles.length < 2) return 0;
  const len = previousAngles.length;
  const dt = 1 / fps;
  // Use last 2 samples for instantaneous velocity
  return (previousAngles[len - 1] - previousAngles[len - 2]) / dt;
}

// Detect peak angular velocity over a window (useful for kick power assessment)
function peakAngularVelocity(previousAngles, fps = 15) {
  if (!previousAngles || previousAngles.length < 3) return 0;
  const dt = 1 / fps;
  let peak = 0;
  for (let i = 1; i < previousAngles.length; i++) {
    const vel = Math.abs((previousAngles[i] - previousAngles[i - 1]) / dt);
    if (vel > peak) peak = vel;
  }
  return peak;
}

// Enhanced feedback severity determination with hysteresis to prevent flickering
function determineFeedbackSeverity(currentValue, idealRange, warningThreshold = 10, previousSeverity = null) {
  const [minIdeal, maxIdeal] = idealRange;
  const minWarningThreshold = minIdeal - warningThreshold;
  const maxWarningThreshold = maxIdeal + warningThreshold;

  // Add hysteresis buffer to prevent rapid switching between states
  const hysteresisBuffer = 3;

  let newSeverity;
  if (currentValue >= minIdeal && currentValue <= maxIdeal) {
    newSeverity = "good"; // Green
  } else if (currentValue >= minWarningThreshold && currentValue <= maxWarningThreshold) {
    newSeverity = "warning"; // Yellow
  } else {
    newSeverity = "error"; // Red
  }

  // Apply hysteresis if we have a previous severity
  if (previousSeverity) {
    // If we're at the boundary between good and warning
    if (previousSeverity === "good" && newSeverity === "warning") {
      if (currentValue >= minIdeal - hysteresisBuffer && currentValue < minIdeal) {
        return "good";
      }
      if (currentValue > maxIdeal && currentValue <= maxIdeal + hysteresisBuffer) {
        return "good";
      }
    }
    // If we're at the boundary between warning and error
    else if (previousSeverity === "warning" && newSeverity === "error") {
      if (currentValue >= minWarningThreshold - hysteresisBuffer && currentValue < minWarningThreshold) {
        return "warning";
      }
      if (currentValue > maxWarningThreshold && currentValue <= maxWarningThreshold + hysteresisBuffer) {
        return "warning";
      }
    }
    // Similar logic for transitions from worse to better states
    else if (previousSeverity === "warning" && newSeverity === "good") {
      if (currentValue >= minIdeal && currentValue <= minIdeal + hysteresisBuffer) {
        return "warning";
      }
      if (currentValue >= maxIdeal - hysteresisBuffer && currentValue <= maxIdeal) {
        return "warning";
      }
    }
    else if (previousSeverity === "error" && newSeverity === "warning") {
      if (currentValue >= minWarningThreshold && currentValue <= minWarningThreshold + hysteresisBuffer) {
        return "error";
      }
      if (currentValue >= maxWarningThreshold - hysteresisBuffer && currentValue <= maxWarningThreshold) {
        return "error";
      }
    }
  }

  return newSeverity;
}

export { calculateAngle, smoothAngle, smoothAngleFast, angularVelocity, peakAngularVelocity, determineFeedbackSeverity };
